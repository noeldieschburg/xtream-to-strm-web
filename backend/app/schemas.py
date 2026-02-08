from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ConfigUpdate(BaseModel):
    XC_URL: Optional[str] = None
    XC_USER: Optional[str] = None
    XC_PASS: Optional[str] = None
    OUTPUT_DIR: Optional[str] = None
    MOVIES_DIR: Optional[str] = None
    SERIES_DIR: Optional[str] = None
    PREFIX_REGEX: Optional[str] = None
    FORMAT_DATE_IN_TITLE: Optional[bool] = None
    CLEAN_NAME: Optional[bool] = None
    SERIES_USE_SEASON_FOLDERS: Optional[bool] = None
    SERIES_INCLUDE_NAME_IN_FILENAME: Optional[bool] = None
    SYNC_PARALLELISM_MOVIES: Optional[int] = None
    SYNC_PARALLELISM_SERIES: Optional[int] = None

class ConfigResponse(BaseModel):
    XC_URL: Optional[str] = None
    XC_USER: Optional[str] = None
    XC_PASS: Optional[str] = None
    OUTPUT_DIR: Optional[str] = None
    MOVIES_DIR: Optional[str] = None
    SERIES_DIR: Optional[str] = None
    PREFIX_REGEX: Optional[str] = None
    FORMAT_DATE_IN_TITLE: Optional[bool] = None
    CLEAN_NAME: Optional[bool] = None
    SERIES_USE_SEASON_FOLDERS: Optional[bool] = None
    SERIES_INCLUDE_NAME_IN_FILENAME: Optional[bool] = None
    SYNC_PARALLELISM_MOVIES: Optional[int] = None
    SYNC_PARALLELISM_SERIES: Optional[int] = None

class SyncStatusResponse(BaseModel):
    id: Optional[int] = None
    subscription_id: int
    type: str
    last_sync: Optional[datetime]
    status: str
    items_added: int
    items_deleted: int
    error_message: Optional[str] = None

class M3USyncStatusResponse(BaseModel):
    id: Optional[int] = None
    m3u_source_id: int
    type: str
    last_sync: Optional[datetime]
    status: str
    items_added: int
    items_deleted: int
    error_message: Optional[str] = None

class SyncTriggerResponse(BaseModel):
    message: str
    task_id: str

class CategoryBase(BaseModel):
    category_id: str
    category_name: str

class CategoryResponse(CategoryBase):
    selected: bool
    item_count: int = 0

class SelectionUpdate(BaseModel):
    categories: list[CategoryBase]

class SyncResponse(BaseModel):
    categories_synced: int
    timestamp: datetime

class SubscriptionBase(BaseModel):
    name: str
    xtream_url: str
    username: str
    password: str
    movies_dir: str
    series_dir: str
    download_movies_dir: Optional[str] = "/output/downloads/movies"
    download_series_dir: Optional[str] = "/output/downloads/series"
    max_parallel_downloads: int = 2
    download_segments: int = 1
    is_active: bool = True

class SubscriptionCreate(SubscriptionBase):
    pass

class SubscriptionUpdate(BaseModel):
    name: Optional[str] = None
    xtream_url: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    movies_dir: Optional[str] = None
    series_dir: Optional[str] = None
    download_movies_dir: Optional[str] = None
    download_series_dir: Optional[str] = None
    max_parallel_downloads: Optional[int] = None
    download_segments: Optional[int] = None
    is_active: Optional[bool] = None

class SubscriptionResponse(SubscriptionBase):
    id: int

    class Config:
        from_attributes = True

class MonitoredMediaCreate(BaseModel):
    subscription_id: int
    media_type: str
    media_id: str
    title: str

class DownloadQueueCreate(BaseModel):
    subscription_id: int
    media_type: str
    media_id: int | str

class DownloadBulkQueueCreate(BaseModel):
    subscription_id: int
    media_ids: list[int | str]
    media_type: str
    titles: Optional[list[str]] = None

class DownloadSettingsUpdate(BaseModel):
    max_parallel_downloads: Optional[int] = None
    download_base_path: Optional[str] = None

class DownloadTaskResponse(BaseModel):
    id: int
    subscription_id: int
    media_type: str
    media_id: int
    title: str
    url: str
    save_path: Optional[str] = None
    status: str
    progress: float
    file_size: Optional[int] = None
    downloaded_bytes: int
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    priority: int
    retry_count: int
    max_retries: int
    next_retry_at: Optional[datetime] = None
    paused_at: Optional[datetime] = None
    current_speed_kbps: float
    estimated_time_remaining: Optional[int] = None
    scheduled_start_at: Optional[datetime] = None
    thumbnail_url: Optional[str] = None

    class Config:
        from_attributes = True

class DownloadSettingsGlobalResponse(BaseModel):
    id: int
    global_speed_limit_kbps: int
    per_download_speed_limit_kbps: Optional[int] = None
    quiet_hours_enabled: bool
    quiet_hours_start: str
    quiet_hours_end: str
    pause_during_quiet_hours: bool
    download_mode: str
    default_max_retries: int
    retry_delay_base_seconds: int
    retry_delay_multiplier: float
    max_redirects: int
    connection_timeout_seconds: int
    keep_completed_days: int
    keep_failed_days: int
    auto_cleanup_enabled: bool
    updated_at: datetime

    class Config:
        from_attributes = True

class DownloadSettingsGlobalUpdate(BaseModel):
    global_speed_limit_kbps: Optional[int] = None
    per_download_speed_limit_kbps: Optional[int] = None
    quiet_hours_enabled: Optional[bool] = None
    quiet_hours_start: Optional[str] = None
    quiet_hours_end: Optional[str] = None
    pause_during_quiet_hours: Optional[bool] = None
    download_mode: Optional[str] = None
    default_max_retries: Optional[int] = None
    retry_delay_base_seconds: Optional[int] = None
    retry_delay_multiplier: Optional[float] = None
    max_redirects: Optional[int] = None
    connection_timeout_seconds: Optional[int] = None
    keep_completed_days: Optional[int] = None
    keep_failed_days: Optional[int] = None
    auto_cleanup_enabled: Optional[bool] = None

class DownloadStatisticsResponse(BaseModel):
    id: int
    date: str
    total_downloads: int
    completed_downloads: int
    failed_downloads: int
    cancelled_downloads: int
    total_bytes_downloaded: float
    average_speed_kbps: float

    class Config:
        from_attributes = True

