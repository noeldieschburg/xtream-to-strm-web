import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

# Mock imports that might be missing locally
mock_httpx = MagicMock()
sys.modules["httpx"] = mock_httpx
mock_tenacity = MagicMock()
sys.modules["tenacity"] = mock_tenacity
mock_sqlalchemy = MagicMock()
sys.modules["sqlalchemy"] = mock_sqlalchemy
sys.modules["sqlalchemy.orm"] = mock_sqlalchemy.orm
sys.modules["sqlalchemy.exc"] = mock_sqlalchemy.exc
mock_celery = MagicMock()
sys.modules["celery"] = mock_celery
sys.modules["app.core.celery_app"] = MagicMock()

# Add the backend app to path
sys.path.append("/home/mba/Desktop/xtream_to_strm_web/backend")

# Mocking necessary components
from app.tasks.downloads import _resolve_target_path
from app.models.downloads import DownloadTask
from app.models.subscription import Subscription
from app.models.cache import MovieCache, EpisodeCache, SeriesCache

def test_resolve_movie_path():
    db = MagicMock()
    subscription = MagicMock(spec=Subscription)
    subscription.download_movies_dir = "/output/downloads/movies"
    subscription.xtream_url = "http://example.com"
    subscription.username = "user"
    subscription.password = "pass"
    
    app_settings = {
        "PREFIX_REGEX": "",
        "FORMAT_DATE_IN_TITLE": "true",
        "CLEAN_NAME": "true"
    }
    
    # Scenario 1: Movie Cache exists
    download = MagicMock(spec=DownloadTask)
    download.media_type = "movie"
    download.media_id = "123"
    download.subscription_id = 1
    download.title = "Raw_Movie_Name"
    
    movie_cache = MovieCache(
        subscription_id=1,
        stream_id=123,
        name="Movie Name",
        category_id="10",
        tmdb_id="550"
    )
    
    db.query().filter().filter().first.side_effect = [movie_cache]
    
    with patch("app.tasks.downloads.XtreamClient") as MockClient:
        client = MockClient.return_value
        client.get_vod_categories_sync.return_value = [{"category_id": "10", "category_name": "Action"}]
        
        path = _resolve_target_path(db, download, subscription, app_settings)
        print(f"Movie Path (Cache exists): {path}")
        assert "Action/Movie Name {tmdb-550}/Movie Name {tmdb-550}.mp4" in str(path)

    # Scenario 2: Movie Cache missing
    db.query().filter().filter().first.side_effect = [None] # No cache
    
    with patch("app.tasks.downloads.XtreamClient") as MockClient:
        client = MockClient.return_value
        client.get_vod_streams_sync.return_value = [{"stream_id": "123", "name": "API Movie Name", "category_id": "10", "tmdb": "999"}]
        client.get_vod_categories_sync.return_value = [{"category_id": "10", "category_name": "Action"}]
        
        path = _resolve_target_path(db, download, subscription, app_settings)
        print(f"Movie Path (Cache missing): {path}")
        assert "Action/API Movie Name {tmdb-999}/API Movie Name {tmdb-999}.mp4" in str(path)

def test_resolve_series_path():
    db = MagicMock()
    subscription = MagicMock(spec=Subscription)
    subscription.download_series_dir = "/output/downloads/series"
    subscription.xtream_url = "http://example.com"
    subscription.username = "user"
    subscription.password = "pass"
    
    app_settings = {
        "SERIES_USE_SEASON_FOLDERS": "true",
        "SERIES_INCLUDE_NAME_IN_FILENAME": "true",
        "SERIES_USE_CATEGORY_FOLDERS": "true",
        "CLEAN_NAME": "true"
    }

    # Scenario 1: Episode Cache exists
    download = MagicMock(spec=DownloadTask)
    download.media_type = "episode"
    download.media_id = "456"
    download.subscription_id = 1
    download.title = "Series - S01E01"
    
    ep_cache = EpisodeCache(id=456, series_id=789, season_num=1, episode_num=1, title="Pilot")
    series_cache = SeriesCache(series_id=789, name="Cool Series", category_id="20", tmdb_id="888")
    
    db.query().filter().filter().first.side_effect = [ep_cache, series_cache]
    
    with patch("app.tasks.downloads.XtreamClient") as MockClient:
        client = MockClient.return_value
        client.get_series_categories_sync.return_value = [{"category_id": "20", "category_name": "Sci-Fi"}]
        
        path = _resolve_target_path(db, download, subscription, app_settings)
        print(f"Series Path (Cache exists): {path}")
        assert "Sci-Fi/Cool Series {tmdb-888}/Season 01/Cool Series - S01E01 - Pilot.mp4" in str(path)

    # Scenario 2: Episode Cache missing, fallback to title parsing (Flexible Regex)
    db.query().filter().filter().first.side_effect = [None, None] # No ep cache, no series cache
    download.title = "Cool Series S01E01 - Pilot" # No hyphen before S
    
    with patch("app.tasks.downloads.XtreamClient") as MockClient:
        client = MockClient.return_value
        client.get_series_sync.return_value = [] 
        client.get_series_categories_sync.return_value = []
        
        path = _resolve_target_path(db, download, subscription, app_settings)
        print(f"Series Path (Cache missing, flexible regex): {path}")
        assert "Uncategorized/Cool Series/Season 01/Cool Series - S01E01 - Pilot.mp4" in str(path)

    # Scenario 3: Name-based lookup in cache
    download.title = "Famous Show S02E05"
    series_cache_match = SeriesCache(series_id=999, name="Famous Show", category_id="30", tmdb_id="123")
    
    # query 1: ep cache (None), query 2: series cache by name match (match)
    db.query().filter().filter().first.side_effect = [None, series_cache_match]
    
    with patch("app.tasks.downloads.XtreamClient") as MockClient:
        client = MockClient.return_value
        client.get_series_categories_sync.return_value = [{"category_id": "30", "category_name": "Drama"}]
        
        path = _resolve_target_path(db, download, subscription, app_settings)
        print(f"Series Path (Name-based lookup): {path}")
        assert "Drama/Famous Show {tmdb-123}/Season 02/Famous Show - S02E05.mp4" in str(path)

if __name__ == "__main__":
    try:
        test_resolve_movie_path()
        test_resolve_series_path()
        print("\nAll tests passed successfully!")
    except Exception as e:
        print(f"\nTests failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
