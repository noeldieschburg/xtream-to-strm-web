# Xtream to STRM v3.7.0
- Jellyfin Media Management

Transform your Xtream Codes subscriptions and M3U playlists into Jellyfin-compatible media files with this modern, production-ready web application.

## 🎯 What It Does

Automatically generates `.strm` stream files and `.nfo` metadata files following Jellyfin's naming conventions, enabling seamless integration with your Jellyfin media server.

## ✨ Key Features (v3.7.0 Evolution)

- **Live TV Archive v2**: Complete overhaul of live stream management with high-performance virtual bouquets.
- **Smart Composer**: Drag-and-drop channel organization, custom ordering, and instant renaming.
- **Integrated History**: Full Undo/Redo support for all live synchronization and layout changes.
- **Multi-Source EPG**: Advanced XMLTV source management with integrated EPG administration.
- **Optimized Engine**: Parallel synchronization engine with 3x faster processing and reduced API overhead.
- **Multi-Source Support**: Xtream Codes API and M3U playlists (URL or file upload).
- **Selective Sync**: Choose specific categories/groups for movies and series.
- **Rich Metadata**: NFO files with TMDB integration and configurable formatting.
- **Real-time Logs**: Streaming application logs directly in the browser.
- **Security**: Runs as non-root user (`appuser`) with protected admin routes.

## 🚀 Quick Start

```bash
docker run -d \
  -p 8000:8000 \
  -v $(pwd)/output:/output \
  -v $(pwd)/db:/db \
  --name xtream-to-strm \
  mourabena2ui/xtream-to-strm-web:latest
```

Access the web interface at **http://localhost:8000**

## 📋 Docker Compose

```yaml
version: '3.8'

services:
  app:
    image: mourabena2ui/xtream-to-strm-web:latest
    container_name: xtream_app
    ports:
      - "8000:8000"
    volumes:
      - ./output:/output
      - ./db:/db
    restart: unless-stopped
```

## 📁 Generated Files

**Movies:**
```
/output/movies/Movie Name (2024)/
├── Movie Name (2024).strm
└── Movie Name (2024).nfo
```

**Series:**
```
/output/series/Series Name/
├── Season 01/
│   ├── Series Name S01E01.strm
│   └── Series Name S01E01.nfo
└── tvshow.nfo
```

## 🎛️ Configuration

Point Jellyfin to the `/output` directory. Files follow Jellyfin's conventions for optimal recognition.

## 🔧 Tech Stack

- Python 3.11 + FastAPI
- React 18 + TypeScript
- Celery + Redis
- SQLite

## 📖 Documentation

Full documentation: [GitHub Repository](https://github.com/mourabena2-ui/xtream-to-strm-web)

## 📄 License

MIT License - Free for personal and commercial use

## 💬 Support

- GitHub Issues: https://github.com/mourabena2-ui/xtream-to-strm-web/issues
- Buy Me a Coffee: https://www.buymeacoffee.com/mourabena

---

**Made with ❤️ for the Jellyfin community**

v3.7.0 | [GitHub](https://github.com/mourabena2-ui/xtream-to-strm-web) | [Docker Hub](https://hub.docker.com/r/mourabena2ui/xtream-to-strm-web)
