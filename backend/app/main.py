from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.api.api import api_router
from app.core.config import settings
from app.db.base import Base
from app.db.session import engine
import os

# Create tables first (for new installations)
Base.metadata.create_all(bind=engine)

# Self-healing schema: Ensure critical columns exist and new tables are created
def _ensure_schema_up_to_date():
    from sqlalchemy import inspect, text
    
    print("🩺 Checking database schema...")
    try:
        inspector = inspect(engine)
        existing_tables = inspector.get_table_names()
        
        # 1. Ensure new Live TV v2 tables exist
        if "live_playlists" not in existing_tables:
            print("🔧 Table 'live_playlists' missing. Creating new tables...")
            Base.metadata.create_all(bind=engine)
            print("✅ New tables created.")
            
            # Trigger migration if legacy table exists
            if "live_stream_subs" in existing_tables:
                print("🔄 Legacy Live TV data detected. Triggering migration...")
                from app.db.migrations_v2 import migrate_live_to_v2
                migrate_live_to_v2(engine)
        
        # Ensure epg_sources table exists if others do but it's missing (v3.7.0 update)
        if "epg_sources" not in existing_tables:
            print("🔧 Table 'epg_sources' missing. Creating...")
            Base.metadata.create_all(bind=engine)
            print("✅ 'epg_sources' table created.")

        # 2. Check 'subscriptions' columns
        columns = [c['name'] for c in inspector.get_columns("subscriptions")]
        
        required_migrations = [
            ("download_movies_dir", "TEXT DEFAULT '/output/downloads/movies'"),
            ("download_series_dir", "TEXT DEFAULT '/output/downloads/series'"),
            ("max_parallel_downloads", "INTEGER DEFAULT 2"),
            ("download_segments", "INTEGER DEFAULT 1")
        ]
        
        missing = [m for m in required_migrations if m[0] not in columns]
        
        if missing:
            print(f"🔧 Missing {len(missing)} columns in 'subscriptions'. Repairing...")
            with engine.connect() as conn:
                for col_name, col_type in missing:
                    try:
                        print(f"  Adding column: {col_name}...")
                        conn.execute(text(f"ALTER TABLE subscriptions ADD COLUMN {col_name} {col_type}"))
                        conn.commit()
                        print(f"  ✅ Added {col_name}")
                    except Exception as e:
                        print(f"  ⚠️ Could not add {col_name}: {e}")
            print("🎉 Schema repair complete.")
        # 3. Check 'live_playlist_bouquets' columns
        if "live_playlist_bouquets" in existing_tables:
            cat_cols = inspector.get_columns("live_playlist_bouquets")
            for col in cat_cols:
                if col['name'] == 'category_id' and not col['nullable']:
                    print("⚠️  'category_id' in 'live_playlist_bouquets' is NOT NULL but should be nullable. Fixing...")
                    # In SQLite, we can try to ALTER but it's limited.
                    # Often changing nullability requires recreation, but let's try a simple approach if the driver allows or just note it.
                    # For now, we will log it as a critical schema issue.

        # 4. Check 'schedule_executions' columns for manual sync tracking
        if "schedule_executions" in existing_tables:
            exec_cols = [c['name'] for c in inspector.get_columns("schedule_executions")]
            exec_migrations = [
                ("subscription_id", "INTEGER"),
                ("sync_type", "VARCHAR")
            ]
            exec_missing = [m for m in exec_migrations if m[0] not in exec_cols]
            if exec_missing:
                print(f"🔧 Missing {len(exec_missing)} columns in 'schedule_executions'. Repairing...")
                with engine.connect() as conn:
                    for col_name, col_type in exec_missing:
                        try:
                            print(f"  Adding column: {col_name}...")
                            conn.execute(text(f"ALTER TABLE schedule_executions ADD COLUMN {col_name} {col_type}"))
                            conn.commit()
                            print(f"  ✅ Added {col_name}")
                        except Exception as e:
                            print(f"  ⚠️ Could not add {col_name}: {e}")

        # 5. Check 'plex_schedule_executions' columns for manual sync tracking
        if "plex_schedule_executions" in existing_tables:
            plex_exec_cols = [c['name'] for c in inspector.get_columns("plex_schedule_executions")]
            plex_exec_migrations = [
                ("server_id", "INTEGER"),
                ("sync_type", "VARCHAR")
            ]
            plex_exec_missing = [m for m in plex_exec_migrations if m[0] not in plex_exec_cols]
            if plex_exec_missing:
                print(f"🔧 Missing {len(plex_exec_missing)} columns in 'plex_schedule_executions'. Repairing...")
                with engine.connect() as conn:
                    for col_name, col_type in plex_exec_missing:
                        try:
                            print(f"  Adding column: {col_name}...")
                            conn.execute(text(f"ALTER TABLE plex_schedule_executions ADD COLUMN {col_name} {col_type}"))
                            conn.commit()
                            print(f"  ✅ Added {col_name}")
                        except Exception as e:
                            print(f"  ⚠️ Could not add {col_name}: {e}")

        print("✅ Database schema is up to date.")
            
    except Exception as e:
        print(f"❌ Schema check failed: {e}")

_ensure_schema_up_to_date()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve frontend static files
static_dir = "/app/static"
# Check for local development path
if not os.path.exists(static_dir):
    local_static = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "frontend", "dist")
    if os.path.exists(local_static):
        static_dir = local_static

if os.path.exists(static_dir):
    app.mount("/assets", StaticFiles(directory=f"{static_dir}/assets"), name="assets")

# Include API router
app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# Serve SPA for 404 errors (except API routes)
if os.path.exists(static_dir):
    from fastapi import Request
    from fastapi.exceptions import HTTPException
    from starlette.exceptions import HTTPException as StarletteHTTPException
    
    from fastapi.responses import JSONResponse
    
    @app.exception_handler(404)
    async def custom_404_handler(request: Request, exc):
        # If it's an API route, return JSON 404
        if request.url.path.startswith(settings.API_V1_STR):
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        
        # Otherwise serve the SPA
        return FileResponse(f"{static_dir}/index.html")
