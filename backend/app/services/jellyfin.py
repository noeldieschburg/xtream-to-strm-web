"""
Jellyfin API client for library refresh integration.
"""
import httpx
from typing import Optional, List, Dict, Any
import logging

logger = logging.getLogger(__name__)


class JellyfinClient:
    """Client for interacting with Jellyfin API."""

    def __init__(self, url: str, api_token: str):
        self.base_url = url.rstrip("/")
        self.api_token = api_token
        self.headers = {
            "X-Emby-Token": api_token,
            "Content-Type": "application/json"
        }

    def _request_sync(self, method: str, endpoint: str, **kwargs) -> Any:
        """Make synchronous request to Jellyfin API."""
        with httpx.Client(timeout=30.0, follow_redirects=True) as client:
            url = f"{self.base_url}{endpoint}"
            try:
                response = client.request(
                    method, url, headers=self.headers, **kwargs
                )
                response.raise_for_status()
                if response.content:
                    return response.json()
                return None
            except httpx.HTTPStatusError as e:
                logger.error(f"Jellyfin HTTP error: {e.response.status_code} - {e}")
                raise
            except httpx.ConnectError as e:
                logger.error(f"Jellyfin connection error: {e}")
                raise
            except Exception as e:
                logger.error(f"Jellyfin request error: {e}")
                raise

    async def _request_async(self, method: str, endpoint: str, **kwargs) -> Any:
        """Make async request to Jellyfin API."""
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            url = f"{self.base_url}{endpoint}"
            try:
                response = await client.request(
                    method, url, headers=self.headers, **kwargs
                )
                response.raise_for_status()
                if response.content:
                    return response.json()
                return None
            except httpx.HTTPStatusError as e:
                logger.error(f"Jellyfin HTTP error: {e.response.status_code} - {e}")
                raise
            except httpx.ConnectError as e:
                logger.error(f"Jellyfin connection error: {e}")
                raise
            except Exception as e:
                logger.error(f"Jellyfin request error: {e}")
                raise

    def test_connection_sync(self) -> Dict[str, Any]:
        """Test connection and return server info (sync version)."""
        try:
            info = self._request_sync("GET", "/System/Info")
            return {
                "success": True,
                "server_name": info.get("ServerName"),
                "version": info.get("Version"),
                "message": f"Connected to {info.get('ServerName')} (v{info.get('Version')})"
            }
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                return {"success": False, "message": "Invalid API token"}
            return {"success": False, "message": f"HTTP error: {e.response.status_code}"}
        except httpx.ConnectError:
            return {"success": False, "message": "Cannot connect to Jellyfin server"}
        except Exception as e:
            return {"success": False, "message": str(e)}

    def get_libraries_sync(self) -> List[Dict[str, Any]]:
        """Get all virtual folders/libraries (sync version)."""
        try:
            folders = self._request_sync("GET", "/Library/VirtualFolders")
            return [
                {
                    "id": folder.get("ItemId"),
                    "name": folder.get("Name"),
                    "collection_type": folder.get("CollectionType")
                }
                for folder in folders
            ]
        except Exception as e:
            logger.error(f"Error fetching Jellyfin libraries: {e}")
            return []

    def refresh_library_sync(self, library_id: str) -> bool:
        """Trigger library refresh (sync version for Celery tasks)."""
        try:
            self._request_sync(
                "POST",
                "/Library/Refresh",
                params={"libraryId": library_id}
            )
            logger.info(f"Jellyfin library refresh triggered for {library_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to refresh Jellyfin library {library_id}: {e}")
            return False


def get_jellyfin_client_from_settings(settings: Dict[str, str]) -> Optional[JellyfinClient]:
    """
    Create a JellyfinClient from settings dictionary.
    Returns None if not configured.
    """
    url = settings.get("JELLYFIN_URL")
    token = settings.get("JELLYFIN_API_TOKEN")

    if not url or not token:
        return None

    return JellyfinClient(url, token)
