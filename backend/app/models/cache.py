from sqlalchemy import Column, String, Integer, ForeignKey
from sqlalchemy.orm import relationship
from app.db.base_class import Base

class MovieCache(Base):
    __tablename__ = "movie_cache"

    id = Column(Integer, primary_key=True, index=True)
    subscription_id = Column(Integer, nullable=False, index=True)
    stream_id = Column(Integer, index=True)
    name = Column(String)
    category_id = Column(String)
    container_extension = Column(String)
    tmdb_id = Column(String, nullable=True)

class SeriesCache(Base):
    __tablename__ = "series_cache"

    id = Column(Integer, primary_key=True, index=True)
    subscription_id = Column(Integer, nullable=False, index=True)
    series_id = Column(Integer, index=True)
    name = Column(String)
    category_id = Column(String)
    tmdb_id = Column(String, nullable=True)

class EpisodeCache(Base):
    __tablename__ = "episode_cache"

    id = Column(Integer, primary_key=True, index=True)
    subscription_id = Column(Integer, nullable=False, index=True)
    series_id = Column(Integer, index=True)  # Xtream series_id
    episode_id = Column(Integer, index=True)  # Xtream episode id (used for stream URL)
    season_num = Column(Integer)
    episode_num = Column(Integer)
    title = Column(String, nullable=True)
    container_extension = Column(String)
