"""
Plex API client for authenticating with Plex.tv and accessing servers/libraries.

Uses the python-plexapi library for simplified API interaction.

@description Handles Plex.tv authentication, server discovery, library browsing,
and media streaming URL generation.

@example
    # Login and get token
    result = PlexClient.login("user@email.com", "password")
    if result["success"]:
        client = PlexClient(result["auth_token"])
        servers = client.get_servers()
"""
from typing import List, Dict, Optional, Any
from tenacity import retry, stop_after_attempt, wait_exponential
import logging

logger = logging.getLogger(__name__)


class PlexClient:
    """
    Client for Plex.tv authentication and server/library access.

    @description Wraps python-plexapi for easy integration with the app.
    Provides both sync and async-compatible methods.
    """

    def __init__(self, auth_token: str):
        """
        Initialize PlexClient with an auth token.

        @param auth_token Token obtained from Plex.tv login
        """
        self.auth_token = auth_token
        self._account = None
        self._plex_imported = False

    def _import_plexapi(self):
        """Lazy import plexapi to avoid import errors if not installed."""
        if not self._plex_imported:
            try:
                from plexapi.myplex import MyPlexAccount
                from plexapi.server import PlexServer
                self._MyPlexAccount = MyPlexAccount
                self._PlexServer = PlexServer
                self._plex_imported = True
            except ImportError:
                raise ImportError("plexapi library not installed. Run: pip install plexapi")

    @classmethod
    def login(cls, username: str, password: str) -> Dict[str, Any]:
        """
        Authenticate with Plex.tv and return account info + auth token.

        @param username Plex.tv email or username
        @param password Plex.tv password
        @returns Dict with success, auth_token, username, email, uuid, message
        """
        try:
            from plexapi.myplex import MyPlexAccount
            account = MyPlexAccount(username, password)
            return {
                "success": True,
                "auth_token": account.authenticationToken,
                "username": account.username,
                "email": account.email,
                "uuid": account.uuid,
                "message": f"Logged in as {account.username}"
            }
        except Exception as e:
            logger.error(f"Plex login failed: {e}")
            return {
                "success": False,
                "auth_token": None,
                "message": str(e)
            }

    @property
    def account(self):
        """
        Lazy-load MyPlexAccount.

        @returns MyPlexAccount instance
        """
        self._import_plexapi()
        if self._account is None:
            self._account = self._MyPlexAccount(token=self.auth_token)
        return self._account

    def get_servers(self) -> List[Dict[str, Any]]:
        """
        Get list of available Plex servers.

        @returns List of server dicts with server_id, name, uri, access_token, etc.
        """
        try:
            resources = self.account.resources()
            servers = []
            for resource in resources:
                if resource.product == "Plex Media Server":
                    # Get best connection (prefer local, then remote)
                    connection = None
                    for conn in resource.connections:
                        if not conn.local:  # Prefer remote for external access
                            connection = conn
                            break
                    if not connection and resource.connections:
                        connection = resource.connections[0]

                    if connection:
                        servers.append({
                            "server_id": resource.clientIdentifier,
                            "name": resource.name,
                            "uri": connection.uri,
                            "access_token": resource.accessToken,
                            "version": resource.productVersion,
                            "is_owned": resource.owned,
                        })
            return servers
        except Exception as e:
            logger.error(f"Failed to get Plex servers: {e}")
            return []

    def connect_server(self, uri: str, access_token: str):
        """
        Connect to a specific Plex server.

        @param uri Server connection URL
        @param access_token Server-specific access token
        @returns PlexServer instance or None on failure
        """
        self._import_plexapi()
        try:
            return self._PlexServer(uri, access_token)
        except Exception as e:
            logger.error(f"Failed to connect to Plex server {uri}: {e}")
            return None

    def get_libraries(self, server) -> List[Dict[str, Any]]:
        """
        Get libraries (sections) from a Plex server.

        @param server PlexServer instance
        @returns List of library dicts with key, title, type, item_count
        """
        libraries = []
        try:
            for section in server.library.sections():
                lib_type = None
                if section.type == "movie":
                    lib_type = "movie"
                elif section.type == "show":
                    lib_type = "show"

                if lib_type:
                    item_count = 0
                    try:
                        item_count = section.totalSize
                    except Exception:
                        pass

                    libraries.append({
                        "key": section.key,
                        "title": section.title,
                        "type": lib_type,
                        "item_count": item_count
                    })
        except Exception as e:
            logger.error(f"Failed to get libraries: {e}")
        return libraries

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def get_movies(self, server, library_key: str) -> List[Dict[str, Any]]:
        """
        Get movies from a library section.

        @param server PlexServer instance
        @param library_key Library section key
        @returns List of movie dicts with metadata
        """
        section = server.library.sectionByID(int(library_key))
        movies = []

        for item in section.all():
            try:
                movie_data = {
                    "key": item.key,
                    "rating_key": item.ratingKey,
                    "title": item.title,
                    "original_title": getattr(item, 'originalTitle', None),
                    "year": item.year,
                    "summary": getattr(item, 'summary', None),
                    "rating": getattr(item, 'rating', None),
                    "duration": getattr(item, 'duration', None),
                    "genres": [g.tag for g in item.genres] if hasattr(item, 'genres') and item.genres else [],
                    "directors": [d.tag for d in item.directors] if hasattr(item, 'directors') and item.directors else [],
                    "actors": [a.tag for a in item.roles[:10]] if hasattr(item, 'roles') and item.roles else [],
                    "thumb": item.thumb if hasattr(item, 'thumb') else None,
                    "art": item.art if hasattr(item, 'art') else None,
                    "guid": self._parse_guid(item),
                    "updated_at": str(item.updatedAt) if hasattr(item, 'updatedAt') and item.updatedAt else None,
                    "media": self._get_media_info(item)
                }
                movies.append(movie_data)
            except Exception as e:
                logger.warning(f"Error processing movie {getattr(item, 'title', 'unknown')}: {e}")
                continue

        return movies

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def get_shows(self, server, library_key: str) -> List[Dict[str, Any]]:
        """
        Get TV shows from a library section.

        @param server PlexServer instance
        @param library_key Library section key
        @returns List of show dicts with metadata
        """
        section = server.library.sectionByID(int(library_key))
        shows = []

        for item in section.all():
            try:
                show_data = {
                    "key": item.key,
                    "rating_key": item.ratingKey,
                    "title": item.title,
                    "original_title": getattr(item, 'originalTitle', None),
                    "year": item.year,
                    "summary": getattr(item, 'summary', None),
                    "rating": getattr(item, 'rating', None),
                    "genres": [g.tag for g in item.genres] if hasattr(item, 'genres') and item.genres else [],
                    "actors": [a.tag for a in item.roles[:10]] if hasattr(item, 'roles') and item.roles else [],
                    "thumb": item.thumb if hasattr(item, 'thumb') else None,
                    "art": item.art if hasattr(item, 'art') else None,
                    "guid": self._parse_guid(item),
                    "updated_at": str(item.updatedAt) if hasattr(item, 'updatedAt') and item.updatedAt else None,
                    "season_count": item.childCount if hasattr(item, 'childCount') else 0
                }
                shows.append(show_data)
            except Exception as e:
                logger.warning(f"Error processing show {getattr(item, 'title', 'unknown')}: {e}")
                continue

        return shows

    def get_show_episodes(self, server, show_key: str) -> Dict[int, List[Dict]]:
        """
        Get episodes for a show, grouped by season.

        @param server PlexServer instance
        @param show_key Show's Plex key
        @returns Dict mapping season number to list of episode dicts
        """
        show = server.fetchItem(show_key)
        episodes_by_season = {}

        for episode in show.episodes():
            season_num = episode.seasonNumber or 0
            if season_num not in episodes_by_season:
                episodes_by_season[season_num] = []

            ep_data = {
                "key": episode.key,
                "rating_key": episode.ratingKey,
                "title": episode.title,
                "season_num": season_num,
                "episode_num": episode.episodeNumber or 0,
                "summary": getattr(episode, 'summary', None),
                "duration": getattr(episode, 'duration', None),
                "updated_at": str(episode.updatedAt) if hasattr(episode, 'updatedAt') and episode.updatedAt else None,
                "media": self._get_media_info(episode)
            }
            episodes_by_season[season_num].append(ep_data)

        return episodes_by_season

    def get_stream_url(self, server, item_key: str) -> str:
        """
        Get transcoding stream URL for a media item (works with shared servers).

        @param server PlexServer instance
        @param item_key Item's Plex key
        @returns HLS streaming URL with authentication token
        """
        try:
            item = server.fetchItem(item_key)
            base_url = server._baseurl
            token = server._token

            # Get the rating key (numeric ID) from the item
            rating_key = item.ratingKey

            # Build universal transcode URL (HLS) - works with shared servers
            # This creates a transcoding session that Plex allows for shared content
            import urllib.parse
            params = {
                'path': f'/library/metadata/{rating_key}',
                'mediaIndex': '0',
                'partIndex': '0',
                'protocol': 'hls',
                'fastSeek': '1',
                'directPlay': '0',
                'directStream': '1',
                'subtitleSize': '100',
                'audioBoost': '100',
                'location': 'wan',
                'addDebugOverlay': '0',
                'directStreamAudio': '1',
                'mediaBufferSize': '102400',
                'subtitles': 'burn',
                'Accept-Language': 'en',
                'X-Plex-Client-Identifier': 'xtream-to-strm',
                'X-Plex-Product': 'Xtream to STRM',
                'X-Plex-Platform': 'Generic',
                'X-Plex-Token': token,
            }

            query_string = urllib.parse.urlencode(params)
            return f"{base_url}/video/:/transcode/universal/start.m3u8?{query_string}"

        except Exception as e:
            logger.error(f"Failed to get stream URL for {item_key}: {e}")
        return ""

    def _parse_guid(self, item) -> Dict[str, Optional[str]]:
        """
        Extract TMDB/IMDB/TVDB IDs from Plex GUIDs.

        @param item Plex media item
        @returns Dict with tmdb, imdb, tvdb keys
        """
        result = {"tmdb": None, "imdb": None, "tvdb": None}
        try:
            guids = getattr(item, 'guids', []) or []
            for guid in guids:
                guid_str = str(guid.id) if hasattr(guid, 'id') else str(guid)
                if "tmdb://" in guid_str:
                    result["tmdb"] = guid_str.replace("tmdb://", "")
                elif "imdb://" in guid_str:
                    result["imdb"] = guid_str.replace("imdb://", "")
                elif "tvdb://" in guid_str:
                    result["tvdb"] = guid_str.replace("tvdb://", "")
        except Exception:
            pass
        return result

    def _get_media_info(self, item) -> Dict[str, Any]:
        """
        Extract media file info (container, resolution, etc.).

        @param item Plex media item
        @returns Dict with container, video_codec, audio_codec, resolution, bitrate
        """
        if not hasattr(item, 'media') or not item.media or len(item.media) == 0:
            return {}
        media = item.media[0]
        return {
            "container": getattr(media, 'container', None),
            "video_codec": getattr(media, 'videoCodec', None),
            "audio_codec": getattr(media, 'audioCodec', None),
            "resolution": getattr(media, 'videoResolution', None),
            "bitrate": getattr(media, 'bitrate', None)
        }


def get_plex_client_from_token(auth_token: str) -> Optional[PlexClient]:
    """
    Factory function to create PlexClient from auth token.

    @param auth_token Plex.tv auth token
    @returns PlexClient instance or None if token is empty
    """
    if not auth_token:
        return None
    return PlexClient(auth_token)
