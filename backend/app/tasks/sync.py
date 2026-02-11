import asyncio
import os
import shutil
from app.core.celery_app import celery_app
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.subscription import Subscription
from app.models.sync_state import SyncState, SyncStatus, SyncType
from app.models.selection import SelectedCategory
from app.models.cache import MovieCache, SeriesCache, EpisodeCache
from app.models.schedule import Schedule, SyncType as ScheduleSyncType
from app.models.schedule_execution import ScheduleExecution, ExecutionStatus
from app.services.xtream import XtreamClient
from app.services.file_manager import FileManager
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


def trigger_jellyfin_refresh(db: Session, library_type: str):
    """
    Trigger Jellyfin library refresh if configured.
    library_type: "movies" or "series"

    This function never raises exceptions - Jellyfin errors should not fail syncs.
    """
    from app.models.settings import SettingsModel
    try:
        settings = {s.key: s.value for s in db.query(SettingsModel).all()}

        # Check if Jellyfin integration is enabled
        if settings.get("JELLYFIN_REFRESH_ENABLED") != "true":
            return

        url = settings.get("JELLYFIN_URL")
        token = settings.get("JELLYFIN_API_TOKEN")

        if not url or not token:
            logger.debug("Jellyfin not configured, skipping refresh")
            return

        # Get appropriate library ID
        if library_type == "movies":
            library_id = settings.get("JELLYFIN_MOVIES_LIBRARY_ID")
        else:
            library_id = settings.get("JELLYFIN_SERIES_LIBRARY_ID")

        if not library_id:
            logger.debug(f"No Jellyfin library configured for {library_type}")
            return

        from app.services.jellyfin import JellyfinClient
        client = JellyfinClient(url, token)
        success = client.refresh_library_sync(library_id)

        if success:
            logger.info(f"Jellyfin {library_type} library refresh triggered successfully")
        else:
            logger.warning(f"Jellyfin {library_type} library refresh failed")

    except Exception as e:
        # Never fail the sync due to Jellyfin issues
        logger.error(f"Error triggering Jellyfin refresh for {library_type}: {e}")


async def process_movies(db: Session, xc: XtreamClient, fm: FileManager, subscription_id: int):
    # Get settings
    from app.models.settings import SettingsModel
    settings = {s.key: s.value for s in db.query(SettingsModel).all()}
    prefix_regex = settings.get("PREFIX_REGEX")
    format_date = settings.get("FORMAT_DATE_IN_TITLE") == "true"
    clean_name = settings.get("CLEAN_NAME") == "true"

    # Update status
    sync_state = db.query(SyncState).filter(
        SyncState.subscription_id == subscription_id,
        SyncState.type == SyncType.MOVIES
    ).first()
    
    if not sync_state:
        sync_state = SyncState(subscription_id=subscription_id, type=SyncType.MOVIES)
        db.add(sync_state)
    
    sync_state.status = SyncStatus.RUNNING
    sync_state.last_sync = datetime.now()
    db.commit()

    try:
        # Fetch Categories
        categories = await xc.get_vod_categories()
        cat_map = {c['category_id']: c['category_name'] for c in categories}

        # Fetch All Movies
        all_movies = await xc.get_vod_streams()

        # Filter by selected categories if any
        selected_cats = db.query(SelectedCategory).filter(
            SelectedCategory.subscription_id == subscription_id,
            SelectedCategory.type == "movie"
        ).all()
        
        if selected_cats:
            selected_ids = {s.category_id for s in selected_cats}
            all_movies = [m for m in all_movies if m['category_id'] in selected_ids]
        
        # Current Cache
        cached_movies = {m.stream_id: m for m in db.query(MovieCache).filter(MovieCache.subscription_id == subscription_id).all()}
        
        to_add_update = []
        to_delete = []
        
        current_ids = set()

        for movie in all_movies:
            stream_id = int(movie['stream_id'])
            current_ids.add(stream_id)
            
            # Check if changed
            cached = cached_movies.get(stream_id)
            if not cached:
                to_add_update.append(movie)
            else:
                if cached.name != movie['name'] or cached.container_extension != movie['container_extension']:
                    to_add_update.append(movie)

        # Detect deletions
        for stream_id, cached in cached_movies.items():
            if stream_id not in current_ids:
                to_delete.append(cached)

        # Process Deletions
        for movie in to_delete:
            cat_name = cat_map.get(movie.category_id, "Uncategorized")
            target_info = fm.get_movie_target_info(
                {"name": movie.name, "tmdb": movie.tmdb_id}, 
                cat_name, prefix_regex, format_date, clean_name
            )
            
            # 1. New Structure removal
            if os.path.exists(target_info["target_dir"]):
                shutil.rmtree(target_info["target_dir"])
            
            # 2. Old Structure removal (fallback)
            safe_name = fm.sanitize_name(movie.name)
            old_path = f"{target_info['cat_dir']}/{safe_name}.strm"
            old_nfo = f"{target_info['cat_dir']}/{safe_name}.nfo"
            await fm.delete_file(old_path)
            await fm.delete_file(old_nfo)

            await fm.delete_directory_if_empty(target_info['cat_dir'])
            
            db.delete(movie)
        
        # Process Additions/Updates with Parallel Fetching
        try:
            parallelism = int(settings.get("SYNC_PARALLELISM_MOVIES", "10"))
        except ValueError:
            parallelism = 10
            
        batch_size = parallelism
        semaphore = asyncio.Semaphore(batch_size)

        async def process_single_movie(movie):
            async with semaphore:
                try:
                    stream_id = int(movie['stream_id'])
                    name = movie['name']
                    ext = movie['container_extension']
                    cat_id = movie['category_id']
                    tmdb_id = movie.get('tmdb')

                    # Fetch detailed info for Metadata
                    try:
                        detailed_info = await xc.get_vod_info(str(stream_id))
                        if detailed_info and 'info' in detailed_info:
                            movie['info'] = detailed_info['info'] # Inject info for NFO generator
                            # Update TMDB if found
                            if detailed_info['info'].get('tmdb_id'):
                                tmdb_id = detailed_info['info'].get('tmdb_id')
                                movie['tmdb'] = tmdb_id # Update for object
                    except Exception as e:
                        # logger.warning(f"Failed to fetch info for movie {stream_id}: {e}")
                        pass

                    cat_name = cat_map.get(cat_id, "Uncategorized")
                    target_info = fm.get_movie_target_info(movie, cat_name, prefix_regex, format_date, clean_name)
                    
                    fm.ensure_directory(target_info["cat_dir"])
                    if target_info["target_dir"] != target_info["cat_dir"]:
                        fm.ensure_directory(target_info["target_dir"])
                    
                    strm_path = os.path.join(target_info["target_dir"], f"{target_info['filename_base']}.strm")
                    nfo_path = os.path.join(target_info["target_dir"], f"{target_info['filename_base']}.nfo")
                    
                    url = xc.get_stream_url("movie", str(stream_id), ext)
                    
                    await fm.write_strm(strm_path, url)
                    
                    nfo_content = fm.generate_movie_nfo(movie, prefix_regex, format_date, clean_name)
                    await fm.write_nfo(nfo_path, nfo_content)

                    # Update Cache
                    # We need to lock DB access or handle it after gather?
                    # Ideally accumulate results and bulk update, but for safety lets return data
                    return {
                        'action': 'update_cache',
                        'data': {
                            'stream_id': stream_id,
                            'name': name,
                            'category_id': cat_id,
                            'container_extension': ext,
                            'tmdb_id': str(tmdb_id) if tmdb_id else None
                        }
                    }

                except Exception as e:
                    logger.error(f"Error processing movie {movie.get('name')}: {e}")
                    return None

        # Execute in chunks to avoid memory explosion if list is huge
        # But for 10 concurrent, direct gather is fine usually.
        # Let's process in batches of 50 to update DB incrementally
        total_processed = 0
        chunk_size = 50
        
        for i in range(0, len(to_add_update), chunk_size):
            chunk = to_add_update[i:i + chunk_size]
            results = await asyncio.gather(*[process_single_movie(m) for m in chunk])
            
            for res in results:
                if res and res['action'] == 'update_cache':
                    d = res['data']
                    cached = cached_movies.get(d['stream_id'])
                    if not cached:
                        cached = MovieCache(subscription_id=subscription_id, stream_id=d['stream_id'])
                        db.add(cached)
                    
                    cached.name = d['name']
                    cached.category_id = d['category_id']
                    cached.container_extension = d['container_extension']
                    cached.tmdb_id = d['tmdb_id']
            
            db.commit() # Commit every chunk

        sync_state.items_added = len(to_add_update)
        sync_state.items_deleted = len(to_delete)
        sync_state.status = SyncStatus.SUCCESS
        db.commit()

        # Trigger Jellyfin library refresh
        trigger_jellyfin_refresh(db, "movies")

    except Exception as e:
        logger.exception("Error syncing movies")
        sync_state.status = SyncStatus.FAILED
        sync_state.error_message = str(e)
        db.commit()
        raise

async def process_series(db: Session, xc: XtreamClient, fm: FileManager, subscription_id: int):
    # Get settings
    from app.models.settings import SettingsModel
    settings_rows = db.query(SettingsModel).all()
    settings = {s.key: s.value for s in settings_rows}
    
    prefix_regex = settings.get("PREFIX_REGEX")
    format_date = settings.get("FORMAT_DATE_IN_TITLE") == "true"
    clean_name = settings.get("CLEAN_NAME") == "true"
    
    use_season_folders = settings.get("SERIES_USE_SEASON_FOLDERS", "true") == "true"
    include_series_name = settings.get("SERIES_INCLUDE_NAME_IN_FILENAME", "false") == "true"
    use_category_folders = settings.get("SERIES_USE_CATEGORY_FOLDERS", "true") == "true"

    # Update status
    sync_state = db.query(SyncState).filter(
        SyncState.subscription_id == subscription_id,
        SyncState.type == SyncType.SERIES
    ).first()
    
    if not sync_state:
        sync_state = SyncState(subscription_id=subscription_id, type=SyncType.SERIES)
        db.add(sync_state)
    
    sync_state.status = SyncStatus.RUNNING
    sync_state.last_sync = datetime.utcnow()
    db.commit()

    try:
        categories = await xc.get_series_categories()
        cat_map = {c['category_id']: c['category_name'] for c in categories}

        all_series = await xc.get_series()

        # Filter by selected categories if any
        selected_cats = db.query(SelectedCategory).filter(
            SelectedCategory.subscription_id == subscription_id,
            SelectedCategory.type == "series"
        ).all()
        
        if selected_cats:
            selected_ids = {s.category_id for s in selected_cats}
            all_series = [s for s in all_series if s['category_id'] in selected_ids]
        
        cached_series = {s.series_id: s for s in db.query(SeriesCache).filter(SeriesCache.subscription_id == subscription_id).all()}
        
        to_add_update = []
        to_delete = []
        current_ids = set()

        for series in all_series:
            series_id = int(series['series_id'])
            current_ids.add(series_id)
            
            cached = cached_series.get(series_id)
            if not cached:
                to_add_update.append(series)
            else:
                if cached.name != series['name']:
                    to_add_update.append(series)

        for series_id, cached in cached_series.items():
            if series_id not in current_ids:
                to_delete.append(cached)

        # Deletions
        # Deletions
        for series in to_delete:
            cat_name = cat_map.get(series.category_id, "Uncategorized")
            target_info = fm.get_series_target_info(
                {"name": series.name, "tmdb": series.tmdb_id},
                cat_name, prefix_regex, format_date, clean_name, use_category_folders
            )
            
            if os.path.exists(target_info["series_dir"]):
                shutil.rmtree(target_info["series_dir"])
            
            await fm.delete_directory_if_empty(target_info["cat_dir"])
            db.delete(series)

        # Process Additions/Updates Parallel
        try:
            parallelism = int(settings.get("SYNC_PARALLELISM_SERIES", "5"))
        except ValueError:
            parallelism = 5

        batch_size = parallelism
        semaphore = asyncio.Semaphore(batch_size)

        async def process_single_series(series):
            async with semaphore:
                try:
                    series_id = int(series['series_id'])
                    name = series['name']
                    cat_id = series['category_id']
                    tmdb_id = series.get('tmdb')

                    # Fetch Episodes and Info
                    info_response = await xc.get_series_info(str(series_id))
                    series_info = info_response.get('info', {})
                    episodes_data = info_response.get('episodes', {})
                    
                    if isinstance(episodes_data, list):
                        episodes_data = {}
                    
                    if series_info.get('tmdb_id'):
                         tmdb_id = series_info.get('tmdb_id')
                         series['tmdb'] = tmdb_id # For NFO

                    cat_name = cat_map.get(cat_id, "Uncategorized")
                    target_info = fm.get_series_target_info(series, cat_name, prefix_regex, format_date, clean_name, use_category_folders)
                    
                    if use_category_folders:
                        fm.ensure_directory(target_info["cat_dir"])
                    
                    series_dir = target_info["series_dir"]
                    fm.ensure_directory(series_dir)
                    
                    # Always create tvshow.nfo
                    nfo_path = f"{series_dir}/tvshow.nfo"
                    await fm.write_nfo(nfo_path, fm.generate_show_nfo(series, prefix_regex, format_date, clean_name))
                    
                    for season_key, episodes in episodes_data.items():
                        season_num = int(season_key)
                        
                        # SEASON FOLDERS LOGIC
                        if use_season_folders:
                            season_dir_name = f"Season {season_num:02d}"
                            current_dir = f"{series_dir}/{season_dir_name}"
                        else:
                            current_dir = series_dir
                            
                        fm.ensure_directory(current_dir)
                        
                        for ep in episodes:
                            ep_num = int(ep['episode_num'])
                            ep_id = ep['id']
                            container = ep['container_extension']
                            title = ep.get('title', '')
                            
                            # Clean Episode Title
                            # 1. Provide a hook to remove Series Name if it's prefixed
                            # Just minimal heuristic: if title starts with series name, strip it
                            # But risky. Let's rely on standard logic for now.
                            
                            formatted_ep = f"S{season_num:02d}E{ep_num:02d}"
                            safe_ep_title = ""
                            
                            if title:
                                # Remove extension if present in title
                                if title.lower().endswith(f".{container}"):
                                    title = title[:-len(container)-1]
                                    
                                safe_ep_title = fm.sanitize_name(title)
                            
                            if include_series_name:
                                 filename_base = f"{target_info['safe_series_name']} - {formatted_ep}"
                            else:
                                 filename_base = formatted_ep
                                 
                            if safe_ep_title:
                                 filename = f"{filename_base} - {safe_ep_title}"
                            else:
                                 filename = filename_base
                            
                            strm_path = f"{current_dir}/{filename}.strm"
                            url = xc.get_stream_url("series", str(ep_id), container)
                            await fm.write_strm(strm_path, url)
                            
                            # Episode NFO
                            ep_nfo_path = f"{current_dir}/{filename}.nfo"
                            ep_nfo_content = fm.generate_episode_nfo(ep, name, season_num, ep_num)
                            await fm.write_nfo(ep_nfo_path, ep_nfo_content)

                    return {
                        'action': 'update_cache',
                        'data': {
                            'series_id': series_id,
                            'name': name,
                            'category_id': cat_id,
                            'tmdb_id': str(tmdb_id) if tmdb_id else None
                        }
                    }
                except Exception as e:
                     logger.error(f"Error processing series {series.get('name')}: {e}")
                     return None

        chunk_size = 20
        for i in range(0, len(to_add_update), chunk_size):
            chunk = to_add_update[i:i + chunk_size]
            results = await asyncio.gather(*[process_single_series(s) for s in chunk])
            
            for res in results:
                if res and res['action'] == 'update_cache':
                    d = res['data']
                    cached = cached_series.get(d['series_id'])
                    if not cached:
                        cached = SeriesCache(subscription_id=subscription_id, series_id=d['series_id'])
                        db.add(cached)
                    
                    cached.name = d['name']
                    cached.category_id = d['category_id']
                    cached.tmdb_id = d['tmdb_id']
            
            db.commit()

        sync_state.items_added = len(to_add_update)
        sync_state.items_deleted = len(to_delete)
        sync_state.status = SyncStatus.SUCCESS
        db.commit()

        # Trigger Jellyfin library refresh
        trigger_jellyfin_refresh(db, "series")

    except Exception as e:
        logger.exception("Error syncing series")
        sync_state.status = SyncStatus.FAILED
        sync_state.error_message = str(e)
        db.commit()
        raise

@celery_app.task
def sync_movies_task(subscription_id: int):
    db = SessionLocal()
    try:
        sub = db.query(Subscription).filter(Subscription.id == subscription_id).first()
        if not sub:
            logger.error(f"Subscription {subscription_id} not found")
            return "Subscription not found"
        
        if not sub.is_active:
            logger.info(f"Subscription {sub.name} is inactive")
            return "Subscription inactive"

        xc = XtreamClient(sub.xtream_url, sub.username, sub.password)
        fm = FileManager(sub.movies_dir)
        
        asyncio.run(process_movies(db, xc, fm, subscription_id))
        return f"Movies synced successfully for {sub.name}"
    finally:
        db.close()

@celery_app.task
def sync_series_task(subscription_id: int):
    db = SessionLocal()
    try:
        sub = db.query(Subscription).filter(Subscription.id == subscription_id).first()
        if not sub:
            logger.error(f"Subscription {subscription_id} not found")
            return "Subscription not found"
        
        if not sub.is_active:
            logger.info(f"Subscription {sub.name} is inactive")
            return "Subscription inactive"

        xc = XtreamClient(sub.xtream_url, sub.username, sub.password)
        fm = FileManager(sub.series_dir)
        
        asyncio.run(process_series(db, xc, fm, subscription_id))
        return f"Series synced successfully for {sub.name}"
    finally:
        db.close()

@celery_app.task
def check_schedules_task():
    """Check schedules and trigger syncs if needed"""
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        # Get enabled schedules that are due
        schedules = db.query(Schedule).filter(
            Schedule.enabled == True,
            Schedule.next_run <= now
        ).all()
        
        for schedule in schedules:
            # Create execution record
            execution = ScheduleExecution(
                schedule_id=schedule.id,
                status=ExecutionStatus.RUNNING
            )
            db.add(execution)
            db.commit()
            
            try:
                # Trigger appropriate sync
                if schedule.type == ScheduleSyncType.MOVIES:
                    result = sync_movies_task.apply_async(args=[schedule.subscription_id])
                else:
                    result = sync_series_task.apply_async(args=[schedule.subscription_id])
                
                # Update execution status
                execution.status = ExecutionStatus.SUCCESS
                execution.completed_at = datetime.utcnow()
                
                # Get items processed from sync state
                sync_state = db.query(SyncState).filter(
                    SyncState.subscription_id == schedule.subscription_id,
                    SyncState.type == (SyncType.MOVIES if schedule.type == ScheduleSyncType.MOVIES else SyncType.SERIES)
                ).first()
                if sync_state:
                    execution.items_processed = (sync_state.items_added or 0) + (sync_state.items_deleted or 0)
                
            except Exception as e:
                logger.exception(f"Error executing scheduled sync for {schedule.type}")
                execution.status = ExecutionStatus.FAILED
                execution.error_message = str(e)
                execution.completed_at = datetime.utcnow()
            
            # Update schedule for next run
            schedule.last_run = now
            schedule.next_run = schedule.calculate_next_run()
            db.commit()
            
    finally:
        db.close()
