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
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from typing import List
from app.api import deps
from app.models.plex_account import PlexAccount
from app.models.plex_server import PlexServer
from app.models.plex_library import PlexLibrary
from app.models.plex_sync_state import PlexSyncState
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


# --- Proxy Streaming ---

@router.get("/proxy/{server_id}/{rating_key}")
def proxy_plex_stream(
    server_id: int,
    rating_key: int,
    key: str = None,
    direct_play: int = 0,
    direct_stream: int = 1,
    db: Session = Depends(deps.get_db)
):
    """
    Redirect to Plex streaming URL.

    This endpoint generates a valid Plex streaming URL and redirects to it.
    Use this in STRM files for a stable URL that doesn't expose tokens.
    Protected by PLEX_SHARED_KEY - must match to access.

    @param server_id Database ID of the Plex server
    @param rating_key Plex rating key of the media
    @param key Shared key for authentication (must match PLEX_SHARED_KEY setting)
    @param direct_play 0=transcode allowed, 1=direct play only
    @param direct_stream 0=full transcode, 1=remux only
    @returns HTTP 302 redirect to Plex streaming URL
    """
    # Verify shared key
    shared_key_setting = db.query(SettingsModel).filter(SettingsModel.key == "PLEX_SHARED_KEY").first()
    expected_key = shared_key_setting.value if shared_key_setting else None

    if expected_key and key != expected_key:
        raise HTTPException(status_code=403, detail="Invalid or missing shared key")

    server = db.query(PlexServer).filter(PlexServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Build streaming URL
    import urllib.parse
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
    stream_url = f"{server.uri}/video/:/transcode/universal/start.m3u8?{query_string}"

    return RedirectResponse(url=stream_url, status_code=302)
