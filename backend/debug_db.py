from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import sys
import os

# Add backend to path
sys.path.append("/home/mba/Desktop/xtream_to_strm_web/backend")

from app.models.cache import SeriesCache, EpisodeCache, MovieCache

DATABASE_URL = "sqlite:////db/xtream.db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

print("--- Series Cache ---")
series = db.query(SeriesCache).all()
for s in series:
    print(f"ID: {s.series_id}, Name: '{s.name}', Category ID: {s.category_id}, TMDB: {s.tmdb_id}")

print("\n--- Recent Episodes ---")
episodes = db.query(EpisodeCache).order_by(EpisodeCache.id.desc()).limit(5).all()
for e in episodes:
    print(f"ID: {e.id}, Series ID: {e.series_id}, Season: {e.season_num}, Ep: {e.episode_num}, Title: '{e.title}'")

db.close()
