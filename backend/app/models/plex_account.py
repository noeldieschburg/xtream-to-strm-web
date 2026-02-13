"""
Plex.tv account model for storing authentication credentials.

Stores the auth token obtained from Plex.tv login, not the password.
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.db.base_class import Base


class PlexAccount(Base):
    """
    Stores Plex.tv account credentials and auth tokens.

    @description One account can access multiple Plex servers.
    The auth_token is obtained from Plex.tv login and used for API calls.
    """
    __tablename__ = "plex_accounts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, nullable=False)  # Plex.tv email/username
    auth_token = Column(String, nullable=False)  # Token from Plex.tv login
    output_base_dir = Column(String, nullable=False, default="/output/plex")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
