"""
Plex.tv integration API endpoints.

Handles Plex account management, server discovery, library selection, and sync operations.

@description Provides endpoints for:
- Plex.tv authentication (login to get auth token)
- Account CRUD operations
- Server listing and refresh
- Library sync and selection
- Sync trigger and status
"""
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import RedirectResponse
import httpx
import asyncio
from typing import Dict, Tuple, Any
import time
import base64
import urllib.parse
import hashlib


def stable_hash(s: str) -> str:
    """Generate a stable hash for a string (deterministic across processes)."""
    return hashlib.md5(s.encode()).hexdigest()[:16]

# Global cache for HLS sessions and playlists
# Session cache: {session_key: (httpx.AsyncClient, last_used_timestamp)}
_hls_clients: Dict[str, Tuple[httpx.AsyncClient, float]] = {}
_hls_clients_lock = asyncio.Lock()
HLS_SESSION_TTL = 300  # 5 minutes

# Playlist content cache: {cache_key: (content, timestamp, content_type)}
_playlist_cache: Dict[str, Tuple[str, float, str]] = {}
_playlist_cache_lock = asyncio.Lock()
PLAYLIST_CACHE_TTL = 60  # 1 minute - playlists are short-lived


async def get_hls_client(session_key: str) -> httpx.AsyncClient:
    """Get or create a persistent httpx client for HLS proxying."""
    async with _hls_clients_lock:
        now = time.time()
        # Cleanup old sessions
        expired = [k for k, (_, ts) in _hls_clients.items() if now - ts > HLS_SESSION_TTL]
        for k in expired:
            client, _ = _hls_clients.pop(k)
            await client.aclose()

        # Get or create client
        if session_key in _hls_clients:
            client, _ = _hls_clients[session_key]
            _hls_clients[session_key] = (client, now)
            return client
        else:
            client = httpx.AsyncClient(follow_redirects=True, timeout=30.0)
            _hls_clients[session_key] = (client, now)
            return client


async def cache_playlist(cache_key: str, content: str, content_type: str = "application/vnd.apple.mpegurl"):
    """Store a playlist in cache."""
    async with _playlist_cache_lock:
        _playlist_cache[cache_key] = (content, time.time(), content_type)
        logger.info(f"HLS cache STORED: {cache_key} (size={len(content)}, total_cached={len(_playlist_cache)})")


async def get_cached_playlist(cache_key: str) -> Tuple[str, str] | None:
    """Get a cached playlist if still valid."""
    async with _playlist_cache_lock:
        # Cleanup expired entries
        now = time.time()
        expired = [k for k, (_, ts, _) in _playlist_cache.items() if now - ts > PLAYLIST_CACHE_TTL]
        for k in expired:
            logger.info(f"HLS cache EXPIRED: {k}")
            del _playlist_cache[k]

        if cache_key in _playlist_cache:
            content, _, content_type = _playlist_cache[cache_key]
            logger.info(f"HLS cache HIT: {cache_key}")
            return content, content_type

        logger.warning(f"HLS cache MISS: {cache_key} (available keys: {list(_playlist_cache.keys())[:5]}...)")
        return None


async def prefetch_and_cache_variants(
    client: httpx.AsyncClient,
    master_content: str,
    plex_base_url: str,
    access_token: str,
    server_id: int,
    rating_key: int,
    proxy_base_url: str,
    key: str
) -> str:
    """
    Parse master playlist, prefetch all variant playlists, cache them,
    and return rewritten master playlist.
    """
    lines = master_content.split('\n')
    rewritten_lines = []
    variant_urls = []

    # First pass: identify all variant playlist URLs
    for line in lines:
        if line and not line.startswith('#'):
            is_playlist = line.endswith('.m3u8') or 'index.m3u8' in line
            if is_playlist:
                if line.startswith('http'):
                    variant_urls.append(line)
                else:
                    path = line if line.startswith('/') else f"/{line}"
                    if '?' in path:
                        full_url = f"{plex_base_url}{path}&X-Plex-Token={access_token}"
                    else:
                        full_url = f"{plex_base_url}{path}?X-Plex-Token={access_token}"
                    variant_urls.append(full_url)

    logger.info(f"HLS prefetch: Found {len(variant_urls)} variant URLs to prefetch")
    for i, url in enumerate(variant_urls):
        logger.debug(f"HLS prefetch variant[{i}]: {url[:100]}...")

    # Prefetch all variants concurrently
    async def fetch_variant(url: str) -> Tuple[str, str | None]:
        try:
            resp = await client.get(url)
            resp.raise_for_status()
            logger.info(f"HLS prefetch SUCCESS: {stable_hash(url)} (len={len(resp.text)})")
            return url, resp.text
        except Exception as e:
            logger.error(f"HLS prefetch FAILED: {url[:80]}... - {e}")
            return url, None

    if variant_urls:
        results = await asyncio.gather(*[fetch_variant(url) for url in variant_urls])

        # Cache each variant and process its content to cache nested playlists
        for url, content in results:
            if content:
                # Generate a cache key based on URL hash
                cache_key = f"{server_id}_{rating_key}_{stable_hash(url)}"

                # Process the variant to rewrite segment URLs (segments stay direct)
                # and identify any nested playlists
                rewritten_variant = await process_and_cache_playlist(
                    client, content, url, plex_base_url, access_token,
                    server_id, rating_key, proxy_base_url, key
                )
                await cache_playlist(cache_key, rewritten_variant)

    # Second pass: rewrite master playlist to point to cache
    for line in lines:
        if line and not line.startswith('#'):
            is_playlist = line.endswith('.m3u8') or 'index.m3u8' in line

            if line.startswith('http'):
                original_url = line
            else:
                path = line if line.startswith('/') else f"/{line}"
                if '?' in path:
                    original_url = f"{plex_base_url}{path}&X-Plex-Token={access_token}"
                else:
                    original_url = f"{plex_base_url}{path}?X-Plex-Token={access_token}"

            if is_playlist:
                # Point to our cache endpoint
                cache_key = f"{server_id}_{rating_key}_{stable_hash(original_url)}"
                encoded_key = base64.urlsafe_b64encode(cache_key.encode()).decode()
                logger.info(f"HLS rewrite: {cache_key} -> encoded={encoded_key}")
                line = f"{proxy_base_url}/api/v1/plex/hls-cache/{server_id}/{rating_key}?cache_key={encoded_key}&key={key or ''}"
            else:
                # Segments go directly to Plex
                line = original_url
        rewritten_lines.append(line)

    logger.info(f"HLS master rewritten with {len([l for l in rewritten_lines if 'hls-cache' in l])} cache URLs")
    return '\n'.join(rewritten_lines)


async def process_and_cache_playlist(
    client: httpx.AsyncClient,
    content: str,
    playlist_url: str,
    plex_base_url: str,
    access_token: str,
    server_id: int,
    rating_key: int,
    proxy_base_url: str,
    key: str
) -> str:
    """
    Process a playlist content: rewrite URLs and prefetch any nested playlists.
    Segments go directly to Plex, playlists go through cache.
    """
    lines = content.split('\n')
    rewritten_lines = []
    nested_playlists = []

    base_url = playlist_url.rsplit('/', 1)[0]

    for line in lines:
        if line and not line.startswith('#'):
            is_playlist = line.endswith('.m3u8') or 'index.m3u8' in line

            # Resolve URL
            if line.startswith('http'):
                full_url = line
            elif line.startswith('/'):
                parsed = urllib.parse.urlparse(playlist_url)
                full_url = f"{parsed.scheme}://{parsed.netloc}{line}"
            else:
                full_url = f"{base_url}/{line}"

            # Add token if needed
            if 'X-Plex-Token' not in full_url:
                if '?' in full_url:
                    full_url += f"&X-Plex-Token={access_token}"
                else:
                    full_url += f"?X-Plex-Token={access_token}"

            if is_playlist:
                nested_playlists.append(full_url)
                cache_key = f"{server_id}_{rating_key}_{stable_hash(full_url)}"
                encoded_key = base64.urlsafe_b64encode(cache_key.encode()).decode()
                line = f"{proxy_base_url}/api/v1/plex/hls-cache/{server_id}/{rating_key}?cache_key={encoded_key}&key={key or ''}"
            else:
                # Segments go directly
                line = full_url
        rewritten_lines.append(line)

    # Prefetch nested playlists
    if nested_playlists:
        async def fetch_nested(url: str):
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                cache_key = f"{server_id}_{rating_key}_{stable_hash(url)}"
                # For nested playlists (like segment lists), just rewrite URLs
                nested_content = resp.text
                rewritten_nested = await process_and_cache_playlist(
                    client, nested_content, url, plex_base_url, access_token,
                    server_id, rating_key, proxy_base_url, key
                )
                await cache_playlist(cache_key, rewritten_nested)
            except Exception as e:
                logger.error(f"Failed to prefetch nested playlist {url}: {e}")

        await asyncio.gather(*[fetch_nested(url) for url in nested_playlists])

    return '\n'.join(rewritten_lines)
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
from app.api import deps
from app.models.plex_account import PlexAccount
from app.models.plex_server import PlexServer
from app.models.plex_library import PlexLibrary
from app.models.plex_sync_state import PlexSyncState
from app.models.plex_schedule_execution import PlexScheduleExecution, PlexExecutionStatus
from app.models.plex_cache import PlexMovieCache, PlexSeriesCache, PlexEpisodeCache
from app.models.settings import SettingsModel
from app.schemas import (
    PlexLoginRequest, PlexLoginResponse,
    PlexAccountCreate, PlexAccountResponse,
    PlexServerResponse, PlexServerUpdate,
    PlexLibraryResponse, PlexLibrarySelection,
    PlexSyncStatusResponse
)
from app.services.plex import PlexClient
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


# --- Authentication ---

@router.post("/login", response_model=PlexLoginResponse)
def plex_login(request: PlexLoginRequest):
    """
    Test Plex.tv login credentials.

    @param request Login credentials (username/password)
    @returns Success status with auth token if successful
    """
    result = PlexClient.login(request.username, request.password)
    return PlexLoginResponse(
        success=result.get("success", False),
        message=result.get("message", "Unknown error"),
        auth_token=result.get("auth_token"),
        username=result.get("username")
    )


# --- Account Management ---

@router.get("/accounts", response_model=List[PlexAccountResponse])
def get_accounts(db: Session = Depends(deps.get_db)):
    """Get all Plex accounts."""
    return db.query(PlexAccount).all()


@router.post("/accounts", response_model=PlexAccountResponse)
def create_account(account: PlexAccountCreate, db: Session = Depends(deps.get_db)):
    """
    Create new Plex account by logging in to Plex.tv.

    @param account Account info with password for initial login
    @returns Created account (password not stored, only auth token)
    """
    # Check for duplicate name
    existing = db.query(PlexAccount).filter(PlexAccount.name == account.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Account name already exists")

    # Login to get auth token
    result = PlexClient.login(account.username, account.password)
    if not result.get("success"):
        raise HTTPException(status_code=401, detail=result.get("message", "Login failed"))

    # Create account record
    db_account = PlexAccount(
        name=account.name,
        username=account.username,
        auth_token=result["auth_token"],
        output_base_dir=account.output_base_dir
    )
    db.add(db_account)
    db.commit()
    db.refresh(db_account)

    # Fetch and store servers
    try:
        client = PlexClient(result["auth_token"])
        servers = client.get_servers()
        for srv in servers:
            safe_name = srv["name"].replace(" ", "_").replace("/", "_").replace("\\", "_")
            db_server = PlexServer(
                account_id=db_account.id,
                server_id=srv["server_id"],
                name=srv["name"],
                uri=srv["uri"],
                access_token=srv["access_token"],
                version=srv.get("version"),
                is_owned=srv.get("is_owned", False),
                movies_dir=f"{account.output_base_dir}/{safe_name}/movies",
                series_dir=f"{account.output_base_dir}/{safe_name}/series"
            )
            db.add(db_server)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to fetch servers for new account: {e}")
        # Account created, servers can be refreshed later

    return db_account


@router.delete("/accounts/{account_id}")
def delete_account(account_id: int, db: Session = Depends(deps.get_db)):
    """
    Delete a Plex account and all associated data.

    @param account_id Account ID to delete
    """
    account = db.query(PlexAccount).filter(PlexAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Delete related data (cascade should handle this, but be explicit)
    servers = db.query(PlexServer).filter(PlexServer.account_id == account_id).all()
    for server in servers:
        db.query(PlexLibrary).filter(PlexLibrary.server_id == server.id).delete()
        db.query(PlexSyncState).filter(PlexSyncState.server_id == server.id).delete()
        db.query(PlexMovieCache).filter(PlexMovieCache.server_id == server.id).delete()
        db.query(PlexSeriesCache).filter(PlexSeriesCache.server_id == server.id).delete()
        db.query(PlexEpisodeCache).filter(PlexEpisodeCache.server_id == server.id).delete()
    db.query(PlexServer).filter(PlexServer.account_id == account_id).delete()

    db.delete(account)
    db.commit()
    return {"message": "Account deleted"}


# --- Server Management ---

@router.get("/servers/{account_id}", response_model=List[PlexServerResponse])
def get_servers(account_id: int, db: Session = Depends(deps.get_db)):
    """Get servers for an account."""
    account = db.query(PlexAccount).filter(PlexAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    servers = db.query(PlexServer).filter(PlexServer.account_id == account_id).all()
    return servers


@router.post("/servers/{account_id}/refresh")
def refresh_servers(account_id: int, db: Session = Depends(deps.get_db)):
    """
    Refresh server list from Plex.tv.

    @param account_id Account ID to refresh servers for
    """
    account = db.query(PlexAccount).filter(PlexAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    client = PlexClient(account.auth_token)
    servers = client.get_servers()

    # Update or add servers
    existing = {s.server_id: s for s in db.query(PlexServer).filter(PlexServer.account_id == account_id).all()}

    for srv in servers:
        if srv["server_id"] in existing:
            # Update existing server
            existing_srv = existing[srv["server_id"]]
            existing_srv.uri = srv["uri"]
            existing_srv.access_token = srv["access_token"]
            existing_srv.version = srv.get("version")
            existing_srv.name = srv["name"]
        else:
            # Add new server
            safe_name = srv["name"].replace(" ", "_").replace("/", "_").replace("\\", "_")
            db_server = PlexServer(
                account_id=account_id,
                server_id=srv["server_id"],
                name=srv["name"],
                uri=srv["uri"],
                access_token=srv["access_token"],
                version=srv.get("version"),
                is_owned=srv.get("is_owned", False),
                movies_dir=f"{account.output_base_dir}/{safe_name}/movies",
                series_dir=f"{account.output_base_dir}/{safe_name}/series"
            )
            db.add(db_server)

    db.commit()
    return {"message": "Servers refreshed", "count": len(servers)}


@router.put("/servers/{server_id}", response_model=PlexServerResponse)
def update_server(server_id: int, update: PlexServerUpdate, db: Session = Depends(deps.get_db)):
    """
    Update server settings (selection, directories).

    @param server_id Server ID to update
    @param update Fields to update
    """
    server = db.query(PlexServer).filter(PlexServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    if update.is_selected is not None:
        server.is_selected = update.is_selected
    if update.movies_dir is not None:
        server.movies_dir = update.movies_dir
    if update.series_dir is not None:
        server.series_dir = update.series_dir

    db.commit()
    db.refresh(server)
    return server


# --- Library Management ---

@router.get("/libraries/{server_id}", response_model=List[PlexLibraryResponse])
def get_libraries(server_id: int, db: Session = Depends(deps.get_db)):
    """Get libraries for a server."""
    server = db.query(PlexServer).filter(PlexServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    libraries = db.query(PlexLibrary).filter(PlexLibrary.server_id == server_id).all()
    return libraries


@router.post("/libraries/{server_id}/sync")
def sync_libraries(server_id: int, db: Session = Depends(deps.get_db)):
    """
    Fetch libraries from Plex server and store in database.

    @param server_id Server ID to fetch libraries from
    """
    server = db.query(PlexServer).filter(PlexServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    account = db.query(PlexAccount).filter(PlexAccount.id == server.account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    client = PlexClient(account.auth_token)
    plex_server = client.connect_server(server.uri, server.access_token)

    if not plex_server:
        raise HTTPException(status_code=500, detail="Cannot connect to server")

    libraries = client.get_libraries(plex_server)

    # Keep track of existing selections
    existing = {lib.library_key: lib.is_selected for lib in db.query(PlexLibrary).filter(PlexLibrary.server_id == server_id).all()}

    # Clear and re-add libraries
    db.query(PlexLibrary).filter(PlexLibrary.server_id == server_id).delete()

    for lib in libraries:
        db_lib = PlexLibrary(
            server_id=server_id,
            library_key=lib["key"],
            title=lib["title"],
            type=lib["type"],
            item_count=lib.get("item_count", 0),
            is_selected=existing.get(lib["key"], False)  # Preserve selection
        )
        db.add(db_lib)

    db.commit()
    return {"message": "Libraries synced", "count": len(libraries)}


@router.post("/libraries/{server_id}/selection")
def update_library_selection(server_id: int, selection: PlexLibrarySelection, db: Session = Depends(deps.get_db)):
    """
    Update selected libraries for sync.

    @param server_id Server ID
    @param selection List of library IDs to select
    """
    server = db.query(PlexServer).filter(PlexServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Deselect all
    db.query(PlexLibrary).filter(PlexLibrary.server_id == server_id).update({"is_selected": False})
    # Select specified
    if selection.library_ids:
        db.query(PlexLibrary).filter(PlexLibrary.id.in_(selection.library_ids)).update({"is_selected": True})
    db.commit()
    return {"message": "Selection updated"}


# --- Sync Operations ---

@router.get("/sync/status/{server_id}", response_model=List[PlexSyncStatusResponse])
def get_sync_status(server_id: int, db: Session = Depends(deps.get_db)):
    """Get sync status for a server."""
    server = db.query(PlexServer).filter(PlexServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    statuses = db.query(PlexSyncState).filter(PlexSyncState.server_id == server_id).all()

    # If no status records exist, create default ones
    if not statuses:
        for sync_type in ["movies", "series"]:
            status = PlexSyncState(server_id=server_id, type=sync_type, status="idle")
            db.add(status)
        db.commit()
        statuses = db.query(PlexSyncState).filter(PlexSyncState.server_id == server_id).all()

    return statuses


@router.post("/sync/movies/{server_id}")
def trigger_movies_sync(server_id: int, db: Session = Depends(deps.get_db)):
    """
    Trigger movie sync for a server.

    @param server_id Server ID to sync movies from
    """
    server = db.query(PlexServer).filter(PlexServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Check if already running
    status = db.query(PlexSyncState).filter(
        PlexSyncState.server_id == server_id,
        PlexSyncState.type == "movies"
    ).first()
    if status and status.status == "running":
        raise HTTPException(status_code=400, detail="Sync already in progress")

    # Import and trigger Celery task
    from app.tasks.plex_sync import sync_plex_movies_task
    task = sync_plex_movies_task.delay(server_id)

    # Update status
    if not status:
        status = PlexSyncState(server_id=server_id, type="movies")
        db.add(status)
    status.status = "running"
    status.task_id = task.id
    status.error_message = None
    db.commit()

    return {"message": "Movies sync started", "task_id": task.id}


@router.post("/sync/series/{server_id}")
def trigger_series_sync(server_id: int, db: Session = Depends(deps.get_db)):
    """
    Trigger series sync for a server.

    @param server_id Server ID to sync series from
    """
    server = db.query(PlexServer).filter(PlexServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Check if already running
    status = db.query(PlexSyncState).filter(
        PlexSyncState.server_id == server_id,
        PlexSyncState.type == "series"
    ).first()
    if status and status.status == "running":
        raise HTTPException(status_code=400, detail="Sync already in progress")

    # Import and trigger Celery task
    from app.tasks.plex_sync import sync_plex_series_task
    task = sync_plex_series_task.delay(server_id)

    # Update status
    if not status:
        status = PlexSyncState(server_id=server_id, type="series")
        db.add(status)
    status.status = "running"
    status.task_id = task.id
    status.error_message = None
    db.commit()

    return {"message": "Series sync started", "task_id": task.id}


@router.post("/sync/stop/{server_id}/{sync_type}")
def stop_plex_sync(server_id: int, sync_type: str, db: Session = Depends(deps.get_db)):
    """
    Stop a running Plex sync task.

    @param server_id Server ID
    @param sync_type Type of sync (movies or series)
    """
    from app.core.celery_app import celery_app

    sync_state = db.query(PlexSyncState).filter(
        PlexSyncState.server_id == server_id,
        PlexSyncState.type == sync_type
    ).first()

    if not sync_state or not sync_state.task_id:
        return {"message": "No running task found"}

    # Revoke the task
    celery_app.control.revoke(sync_state.task_id, terminate=True)

    # Update sync_state status
    sync_state.status = "idle"
    sync_state.task_id = None

    # Update any running execution records to cancelled
    running_executions = db.query(PlexScheduleExecution).filter(
        PlexScheduleExecution.server_id == server_id,
        PlexScheduleExecution.sync_type == sync_type,
        PlexScheduleExecution.status == PlexExecutionStatus.RUNNING
    ).all()

    for execution in running_executions:
        execution.status = PlexExecutionStatus.CANCELLED
        execution.completed_at = datetime.utcnow()

    db.commit()

    return {"message": f"{sync_type.capitalize()} sync stopped successfully"}


# --- Proxy Streaming ---

@router.get("/proxy/{server_id}/{rating_key}/stream.m3u8")
@router.get("/proxy/{server_id}/{rating_key}")
async def proxy_plex_stream(
    server_id: int,
    rating_key: int,
    key: str = None,
    direct_play: int = 0,
    direct_stream: int = 1,
    db: Session = Depends(deps.get_db)
):
    """
    Proxy or redirect to Plex streaming URL.

    If PLEX_HLS_PROXY_MODE is enabled, fetches the HLS playlist and rewrites URLs.
    This is needed for clients like Findroid (ExoPlayer-based) that don't follow redirects.
    Otherwise, returns a 302 redirect to Plex.

    @param server_id Database ID of the Plex server
    @param rating_key Plex rating key of the media
    @param key Shared key for authentication (must match PLEX_SHARED_KEY setting)
    @param direct_play 0=transcode allowed, 1=direct play only
    @param direct_stream 0=full transcode, 1=remux only
    @returns HLS playlist content or HTTP 302 redirect
    """
    # Verify shared key
    shared_key_setting = db.query(SettingsModel).filter(SettingsModel.key == "PLEX_SHARED_KEY").first()
    expected_key = shared_key_setting.value if shared_key_setting else None

    if expected_key and key != expected_key:
        raise HTTPException(status_code=403, detail="Invalid or missing shared key")

    server = db.query(PlexServer).filter(PlexServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Check if HLS proxy mode is enabled
    hls_proxy_setting = db.query(SettingsModel).filter(SettingsModel.key == "PLEX_HLS_PROXY_MODE").first()
    hls_proxy_enabled = hls_proxy_setting and hls_proxy_setting.value.lower() == "true"

    # Build Plex streaming URL
    params = {
        'path': f'/library/metadata/{rating_key}',
        'mediaIndex': '0',
        'partIndex': '0',
        'protocol': 'hls',
        'fastSeek': '1',
        'copyts': '1',
        'offset': '0',
        'directPlay': str(direct_play),
        'directStream': str(direct_stream),
        'directStreamAudio': '1',
        'location': 'wan',
        'X-Plex-Platform': 'Chrome',
        'X-Plex-Client-Identifier': 'xtream-to-strm',
        'X-Plex-Product': 'Xtream to STRM',
        'X-Plex-Token': server.access_token,
    }

    query_string = urllib.parse.urlencode(params)
    plex_url = f"{server.uri}/video/:/transcode/universal/start.m3u8?{query_string}"

    if not hls_proxy_enabled:
        # Mode redirect (default behavior)
        return RedirectResponse(url=plex_url, status_code=302)

    # HLS Proxy Mode - fetch playlist, prefetch variants, and cache everything
    proxy_base_setting = db.query(SettingsModel).filter(SettingsModel.key == "PLEX_PROXY_BASE_URL").first()
    proxy_base_url = (proxy_base_setting.value if proxy_base_setting else "").rstrip('/')

    session_key = f"{server_id}_{rating_key}_{int(time.time())}"  # Unique session per request
    plex_base_url = server.uri.rstrip('/')

    try:
        client = await get_hls_client(session_key)
        response = await client.get(plex_url)
        response.raise_for_status()

        master_content = response.text

        # Prefetch all variant playlists and cache them
        # This uses the SAME httpx client/connection to maintain Plex session
        rewritten_content = await prefetch_and_cache_variants(
            client=client,
            master_content=master_content,
            plex_base_url=plex_base_url,
            access_token=server.access_token,
            server_id=server_id,
            rating_key=rating_key,
            proxy_base_url=proxy_base_url,
            key=key or ''
        )

        return Response(
            content=rewritten_content,
            media_type="application/vnd.apple.mpegurl",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache"
            }
        )
    except httpx.HTTPError as e:
        logger.error(f"HLS proxy error: {e}")
        raise HTTPException(status_code=502, detail=f"Failed to fetch HLS playlist: {str(e)}")


@router.get("/hls-cache/{server_id}/{rating_key}")
async def hls_cache(
    server_id: int,
    rating_key: int,
    cache_key: str,
    key: str = None,
    db: Session = Depends(deps.get_db)
):
    """
    Serve cached HLS playlist content.

    Returns pre-fetched and cached playlist content. This endpoint is used
    to serve variant playlists that were pre-fetched when the master playlist
    was requested, avoiding Plex session timeout issues.

    @param server_id Database ID of the Plex server
    @param rating_key Plex rating key
    @param cache_key Base64-encoded cache key
    @param key Shared key for authentication
    """
    # Verify shared key
    shared_key_setting = db.query(SettingsModel).filter(SettingsModel.key == "PLEX_SHARED_KEY").first()
    expected_key = shared_key_setting.value if shared_key_setting else None

    if expected_key and key != expected_key:
        raise HTTPException(status_code=403, detail="Invalid or missing shared key")

    # Decode cache key
    try:
        decoded_cache_key = base64.urlsafe_b64decode(cache_key.encode()).decode()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid cache key encoding")

    # Try to get from cache
    cached = await get_cached_playlist(decoded_cache_key)
    if cached:
        content, content_type = cached
        return Response(
            content=content,
            media_type=content_type,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache"
            }
        )

    # Cache miss - this shouldn't happen if prefetch worked correctly
    logger.warning(f"HLS cache miss for key: {decoded_cache_key}")
    raise HTTPException(status_code=404, detail="Playlist not found in cache. Try refreshing the stream.")


@router.get("/hls-proxy/{server_id}/{rating_key}")
async def hls_proxy(
    server_id: int,
    rating_key: int,
    url: str,
    key: str = None,
    db: Session = Depends(deps.get_db)
):
    """
    Fallback HLS proxy endpoint (legacy).

    This endpoint is kept for backwards compatibility but the new caching
    approach (/hls-cache/) is preferred. If a request comes here, it means
    the cache didn't have the content, so we try to fetch it directly.

    @param server_id Database ID of the Plex server
    @param rating_key Plex rating key
    @param url Base64-encoded URL to fetch from Plex
    @param key Shared key for authentication
    """
    # Verify shared key
    shared_key_setting = db.query(SettingsModel).filter(SettingsModel.key == "PLEX_SHARED_KEY").first()
    expected_key = shared_key_setting.value if shared_key_setting else None

    if expected_key and key != expected_key:
        raise HTTPException(status_code=403, detail="Invalid or missing shared key")

    server = db.query(PlexServer).filter(PlexServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Decode the URL
    try:
        decoded_url = base64.urlsafe_b64decode(url.encode()).decode()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid URL encoding")

    # Get proxy base URL
    proxy_base_setting = db.query(SettingsModel).filter(SettingsModel.key == "PLEX_PROXY_BASE_URL").first()
    proxy_base_url = (proxy_base_setting.value if proxy_base_setting else "").rstrip('/')

    session_key = f"{server_id}_{rating_key}"
    plex_base_url = server.uri.rstrip('/')

    try:
        client = await get_hls_client(session_key)
        response = await client.get(decoded_url)
        response.raise_for_status()

        content_type = response.headers.get("content-type", "")

        # If it's a playlist (.m3u8), rewrite URLs
        if "mpegurl" in content_type or decoded_url.endswith(".m3u8"):
            content = response.text

            # Use the process function for consistency
            rewritten_content = await process_and_cache_playlist(
                client=client,
                content=content,
                playlist_url=decoded_url,
                plex_base_url=plex_base_url,
                access_token=server.access_token,
                server_id=server_id,
                rating_key=rating_key,
                proxy_base_url=proxy_base_url,
                key=key or ''
            )

            return Response(
                content=rewritten_content,
                media_type="application/vnd.apple.mpegurl",
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "no-cache"
                }
            )
        else:
            # Binary content (segments) - this shouldn't happen as segments go direct
            return Response(
                content=response.content,
                media_type=content_type or "video/mp2t",
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "no-cache"
                }
            )
    except httpx.HTTPError as e:
        logger.error(f"HLS proxy error for {decoded_url}: {e}")
        raise HTTPException(status_code=502, detail=f"Failed to fetch HLS content: {str(e)}")
