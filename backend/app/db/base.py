# Import Base class
from app.db.base_class import Base

# Import all models here so that Base has them registered
# This is needed for Alembic and for Base.metadata.create_all()
from app.models.subscription import Subscription
from app.models.settings import SettingsModel
from app.models.selection import SelectedCategory
from app.models.sync_state import SyncState
from app.models.category import Category
from app.models.cache import MovieCache, SeriesCache, EpisodeCache
from app.models.schedule import Schedule
from app.models.schedule_execution import ScheduleExecution
from app.models.m3u_source import M3USource
from app.models.m3u_selection import M3USelection
from app.models.m3u_sync_state import M3USyncState
from app.models.m3u_entry import M3UEntry
from app.models.downloads import (
    DownloadTask, MonitoredMedia, DownloadSettings,
    DownloadSettingsGlobal, DownloadStatistics
)
from app.models.live import LiveStreamSubscription

# Plex integration models
from app.models.plex_account import PlexAccount
from app.models.plex_server import PlexServer
from app.models.plex_library import PlexLibrary
from app.models.plex_cache import PlexMovieCache, PlexSeriesCache, PlexEpisodeCache
from app.models.plex_sync_state import PlexSyncState
from app.models.plex_schedule import PlexSchedule
from app.models.plex_schedule_execution import PlexScheduleExecution
