"""
Plex library model for storing server libraries (sections).

Libraries are equivalent to categories in Xtream - they contain movies or shows.
"""
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.sql import func
from app.db.base_class import Base


class PlexLibrary(Base):
    """
    Stores Plex libraries (sections) for each server.

    @description Similar to Category model for Xtream.
    Each library has a type (movie or show) and can be selected for sync.
    """
    __tablename__ = "plex_libraries"

    id = Column(Integer, primary_key=True, index=True)
    server_id = Column(Integer, ForeignKey("plex_servers.id", ondelete="CASCADE"), nullable=False, index=True)
    library_key = Column(String, nullable=False)  # Plex section key (e.g., "1", "2")
    title = Column(String, nullable=False)  # Library name (e.g., "Movies", "TV Shows")
    type = Column(String, nullable=False)  # "movie" or "show"
    item_count = Column(Integer, default=0)
    is_selected = Column(Boolean, default=False)  # For sync selection
    last_sync = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
