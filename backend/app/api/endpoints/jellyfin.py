"""
Jellyfin integration API endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.settings import SettingsModel
from app.schemas import (
    JellyfinConfigUpdate,
    JellyfinConfigResponse,
    JellyfinLibrariesResponse,
    JellyfinLibrary,
    JellyfinTestResponse,
)
from app.services.jellyfin import JellyfinClient

router = APIRouter()


def get_jellyfin_settings(db: Session) -> dict:
    """Get all Jellyfin-related settings from database."""
    settings = {s.key: s.value for s in db.query(SettingsModel).all()}
    return {
        "url": settings.get("JELLYFIN_URL"),
        "api_token": settings.get("JELLYFIN_API_TOKEN"),
        "movies_library_id": settings.get("JELLYFIN_MOVIES_LIBRARY_ID"),
        "series_library_id": settings.get("JELLYFIN_SERIES_LIBRARY_ID"),
        "refresh_enabled": settings.get("JELLYFIN_REFRESH_ENABLED", "false").lower() == "true",
    }


def save_setting(db: Session, key: str, value: str):
    """Save or update a single setting."""
    setting = db.query(SettingsModel).filter(SettingsModel.key == key).first()
    if not setting:
        setting = SettingsModel(key=key, value=value)
        db.add(setting)
    else:
        setting.value = value


@router.get("/config", response_model=JellyfinConfigResponse)
def get_jellyfin_config(db: Session = Depends(get_db)):
    """Get current Jellyfin configuration."""
    settings = get_jellyfin_settings(db)

    # Get library names if configured
    movies_library_name = None
    series_library_name = None

    if settings["url"] and settings["api_token"]:
        try:
            client = JellyfinClient(settings["url"], settings["api_token"])
            libraries = client.get_libraries_sync()

            for lib in libraries:
                if lib["id"] == settings.get("movies_library_id"):
                    movies_library_name = lib["name"]
                if lib["id"] == settings.get("series_library_id"):
                    series_library_name = lib["name"]
        except Exception:
            pass  # Ignore errors when fetching library names

    return JellyfinConfigResponse(
        url=settings["url"],
        api_token_set=bool(settings["api_token"]),
        movies_library_id=settings["movies_library_id"],
        movies_library_name=movies_library_name,
        series_library_id=settings["series_library_id"],
        series_library_name=series_library_name,
        refresh_enabled=settings["refresh_enabled"],
        is_configured=bool(settings["url"] and settings["api_token"]),
    )


@router.post("/config", response_model=JellyfinConfigResponse)
def update_jellyfin_config(config: JellyfinConfigUpdate, db: Session = Depends(get_db)):
    """Update Jellyfin configuration."""
    if config.url is not None:
        save_setting(db, "JELLYFIN_URL", config.url)
    if config.api_token is not None:
        save_setting(db, "JELLYFIN_API_TOKEN", config.api_token)
    if config.movies_library_id is not None:
        save_setting(db, "JELLYFIN_MOVIES_LIBRARY_ID", config.movies_library_id)
    if config.series_library_id is not None:
        save_setting(db, "JELLYFIN_SERIES_LIBRARY_ID", config.series_library_id)
    if config.refresh_enabled is not None:
        save_setting(db, "JELLYFIN_REFRESH_ENABLED", str(config.refresh_enabled).lower())

    db.commit()

    return get_jellyfin_config(db)


@router.get("/libraries", response_model=JellyfinLibrariesResponse)
def get_jellyfin_libraries(db: Session = Depends(get_db)):
    """Fetch available libraries from Jellyfin server."""
    settings = get_jellyfin_settings(db)

    if not settings["url"] or not settings["api_token"]:
        return JellyfinLibrariesResponse(
            libraries=[],
            error="Jellyfin URL and API token must be configured first"
        )

    try:
        client = JellyfinClient(settings["url"], settings["api_token"])
        libraries_data = client.get_libraries_sync()

        libraries = [
            JellyfinLibrary(
                id=lib["id"],
                name=lib["name"],
                collection_type=lib.get("collection_type")
            )
            for lib in libraries_data
            if lib["id"]  # Filter out any without ID
        ]

        return JellyfinLibrariesResponse(libraries=libraries)
    except Exception as e:
        return JellyfinLibrariesResponse(
            libraries=[],
            error=str(e)
        )


@router.post("/test", response_model=JellyfinTestResponse)
def test_jellyfin_connection(db: Session = Depends(get_db)):
    """Test connection to Jellyfin server."""
    settings = get_jellyfin_settings(db)

    if not settings["url"]:
        return JellyfinTestResponse(
            success=False,
            message="Jellyfin URL is not configured"
        )

    if not settings["api_token"]:
        return JellyfinTestResponse(
            success=False,
            message="Jellyfin API token is not configured"
        )

    client = JellyfinClient(settings["url"], settings["api_token"])
    result = client.test_connection_sync()

    return JellyfinTestResponse(
        success=result.get("success", False),
        message=result.get("message", "Unknown error"),
        server_name=result.get("server_name"),
        version=result.get("version")
    )


@router.post("/refresh/{library_id}")
def trigger_library_refresh(library_id: str, db: Session = Depends(get_db)):
    """Manually trigger a library refresh (for testing)."""
    settings = get_jellyfin_settings(db)

    if not settings["url"] or not settings["api_token"]:
        raise HTTPException(status_code=400, detail="Jellyfin is not configured")

    client = JellyfinClient(settings["url"], settings["api_token"])
    success = client.refresh_library_sync(library_id)

    if success:
        return {"success": True, "message": f"Library refresh triggered for {library_id}"}
    else:
        raise HTTPException(status_code=500, detail="Failed to trigger library refresh")
