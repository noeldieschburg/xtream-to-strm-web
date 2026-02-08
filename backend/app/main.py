from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.api.api import api_router
from app.core.config import settings
from app.db.base import Base
from app.db.session import engine
import os

# Run database migrations
def _run_migrations():
    import sys
    import os
    from pathlib import Path
    
    # Try multiple ways to import and run
    try:
        # 1. Try common import paths
        migration_func = None
        try:
            from migrations.apply_migrations import apply_migrations
            migration_func = apply_migrations
        except ImportError:
            try:
                from backend.migrations.apply_migrations import apply_migrations
                migration_func = apply_migrations
            except ImportError:
                pass
        
        if migration_func:
            migration_func()
        else:
            # 2. Try direct script execution if import fails
            possible_scripts = [
                "/app/migrations/apply_migrations.py",
                "migrations/apply_migrations.py",
                "backend/migrations/apply_migrations.py"
            ]
            for script in possible_scripts:
                if os.path.exists(script):
                    os.system(f"{sys.executable} {script}")
                    break
    except Exception as e:
        print(f"Migration error: {e}")

_run_migrations()

# Create tables
Base.metadata.create_all(bind=engine)

# Panic check: Verify critical columns exist
def _verify_schema():
    import sqlite3
    db_path = settings.DATABASE_URL.replace("sqlite:////", "/").replace("sqlite:///", "")
    if not os.path.exists(db_path):
        return
    try:
        conn = sqlite3.connect(db_path)
        cols = [row[1] for row in conn.execute("PRAGMA table_info(subscriptions)").fetchall()]
        conn.close()
        
        required = ["download_movies_dir", "download_series_dir", "max_parallel_downloads"]
        missing = [c for c in required if c not in cols]
        if missing:
            print(f"❌ CRITICAL ERROR: Migration failed. Missing columns in 'subscriptions': {missing}")
            # In production, we might want to sys.exit(1) here to force a restart/fix
    except Exception as e:
        print(f"Schema verification warning: {e}")

_verify_schema()

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
    
    @app.exception_handler(404)
    async def custom_404_handler(request: Request, exc):
        # If it's an API route, return JSON 404
        if request.url.path.startswith(settings.API_V1_STR):
            return {"detail": "Not found"}
        
        # Otherwise serve the SPA
        return FileResponse(f"{static_dir}/index.html")
