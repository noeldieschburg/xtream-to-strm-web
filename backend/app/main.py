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
        
        # 1. Ensure 'live_stream_subs' table exists (since it's new)
        if "live_stream_subs" not in existing_tables:
            print("🔧 Table 'live_stream_subs' missing. Creating all tables to ensure it's added...")
            Base.metadata.create_all(bind=engine)
            print("✅ 'live_stream_subs' table created.")

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
        else:
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
    
    @app.exception_handler(404)
    async def custom_404_handler(request: Request, exc):
        # If it's an API route, return JSON 404
        if request.url.path.startswith(settings.API_V1_STR):
            return {"detail": "Not found"}
        
        # Otherwise serve the SPA
        return FileResponse(f"{static_dir}/index.html")
