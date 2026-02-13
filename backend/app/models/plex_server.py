"""
Plex server model for storing server connection details.

Each Plex account can access multiple servers (owned or shared).
"""
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.sql import func
from app.db.base_class import Base


class PlexServer(Base):
    """
    Stores Plex servers accessible by an account.

    @description Each server has its own connection URI and access token.
    Users can select which servers to sync from.
    """
    __tablename__ = "plex_servers"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("plex_accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    server_id = Column(String, nullable=False)  # Plex machine identifier
    name = Column(String, nullable=False)
    uri = Column(String, nullable=False)  # Connection URL (e.g., https://192.168.1.x:32400)
    access_token = Column(String, nullable=False)  # Server-specific token
    version = Column(String, nullable=True)
    is_owned = Column(Boolean, default=False)  # True if user owns this server
    is_selected = Column(Boolean, default=False)  # User selected this server for sync
    movies_dir = Column(String, nullable=False, default="/output/plex/server/movies")
    series_dir = Column(String, nullable=False, default="/output/plex/server/series")
    last_sync = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
