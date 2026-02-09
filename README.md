# Xtream to STRM

<div align="center">

![Xtream to STRM Logo](frontend/public/Xtreamm-app_Full_Logo.jpg)

**A modern web application for managing Xtream Codes and M3U playlists**  
Generate Jellyfin-compatible `.strm` and `.nfo` files for your media server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker Hub](https://img.shields.io/docker/v/mourabena2ui/xtream-to-strm-web?label=Docker%20Hub&logo=docker)](https://hub.docker.com/r/mourabena2ui/xtream-to-strm-web)
[![Docker Pulls](https://img.shields.io/docker/pulls/mourabena2ui/xtream-to-strm-web)](https://hub.docker.com/r/mourabena2ui/xtream-to-strm-web)
[![Version](https://img.shields.io/badge/version-3.1.0-blue.svg)](https://github.com/mourabena2-ui/xtream-to-strm-web/releases)

</div>

---

## 🌟 Overview

Xtream to STRM is a complete, production-ready web application that transforms your Xtream Codes subscriptions and M3U playlists into **Jellyfin-compatible** media files. The application generates `.strm` stream files and `.nfo` metadata files following Jellyfin's naming conventions and folder structure, enabling seamless integration with your Jellyfin media server. Also compatible with Kodi and other media servers that support the same format.

Built with modern technologies, it provides an intuitive interface for managing your VOD content with advanced features like selective synchronization, intelligent metadata generation, and comprehensive administration tools.

## ✨ Key Features

### 🎬 Multi-Source Support
- **Xtream Codes**: Full support for Xtream API with multi-subscription management
- **M3U Playlists**: Import from URLs or file uploads with group-based selection

### 🎯 Smart Synchronization
- **Parallel Fetching**: High-performance sync with concurrent metadata fetching (async/await)
- **Selective Sync**: Choose specific categories or groups to synchronize
- **Incremental Updates**: Only sync what's changed since last update
- **Dual Control**: Separate sync for Movies and Series
- **Robustness**: Redirect support and improved error handling for Xtream providers

### 📋 Rich Metadata
- **NFO Generation**: Detailed metadata files in Jellyfin format
- **TMDB Integration**: Automatic movie/series information enrichment
- **Smart Folder Structure**: 
  - Movies: `Movie Name {tmdb-ID}` folder support
  - Series: Optional `Season XX` subfolders
- **Configurable Formatting**: Title prefix cleaning, date formatting, and name normalization

### 🎨 Modern Interface
- **Responsive Design**: Works seamlessly on desktop and mobile
- **Real-Time Updates**: Live sync progress and status monitoring
- **Dark Mode**: Beautiful, comfortable viewing experience
- **Intuitive Navigation**: Clean organization with logical menu structure

### 🛠️ Advanced Administration
- **Database Management**: Easy reset and cleanup operations
- **File Management**: Bulk delete and reorganization tools
- **NFO Settings**: Customize title formatting with regex patterns
- **Statistics Dashboard**: Comprehensive overview of your content

## 🚀 Quick Start

### Installation from Docker Hub (Recommended)

```bash
docker run -d \
  -p 8000:8000 \
  -v $(pwd)/output:/output \
  -v $(pwd)/db:/db \
  --name xtream-to-strm \
  mourabena2ui/xtream-to-strm-web:latest
```

Access the web interface at **http://localhost:8000**

### Using Docker Compose

```yaml
version: '3.8'

services:
  app:
    image: mourabena2ui/xtream-to-strm-web:latest
    container_name: xtream_app
    environment:
      - TZ=Europe/Paris
    ports:
      - "8000:8000"
    volumes:
      - ./output:/output
      - ./db:/db
    restart: unless-stopped
```

Then start with:
```bash
docker-compose up -d
```

## 📖 Usage

### 1. Add Your Content Source

**For Xtream Codes:**
- Navigate to **XtreamTV** → **Subscriptions**
- Add your subscription details (URL, username, password)
- Configure movie and series output directories

**For M3U Playlists:**
- Navigate to **M3U Import** → **Sources**
- Add source via URL or file upload
- Configure output directory

### 2. Select Content to Sync

**For Xtream:**
- Go to **XtreamTV** → **Bouquet Selection**
- List available categories
- Select categories for movies and/or series

**For M3U:**
- Go to **M3U Import** → **Group Selection**
- Select your source
- Choose groups for movies and/or series

### 3. Synchronize

Click **Sync Movies** or **Sync Series** to generate your files!

### 4. Configure Your Media Server

Point Jellyfin to the `/output` directory to scan your new content. The generated files follow Jellyfin's naming conventions for optimal recognition.

## 🎛️ NFO Configuration

Customize how titles are formatted in NFO files:

| Setting | Description | Example |
|---------|-------------|---------|
| **Prefix Regex** | Strip language/country prefixes | `FR - Movie` → `Movie` |
| **Format Date** | Move year to parentheses | `Name_2024` → `Name (2024)` |
| **Clean Name** | Replace underscores with spaces | `My_Movie` → `My Movie` |

Access these settings in **Administration** → **NFO Settings**

## 📁 Generated File Structure

```
output/
├── movies/
│   └── Movie Name (2024)/
│       ├── Movie Name (2024).strm
│       └── Movie Name (2024).nfo
└── series/
    └── Series Name/
        ├── Season 01/
        │   ├── Series Name S01E01.strm
        │   └── Series Name S01E01.nfo
        └── tvshow.nfo
```

## 🔧 Technology Stack

- **Backend**: Python 3.11, FastAPI, SQLAlchemy, Celery
- **Frontend**: React 18, TypeScript, Vite, TailwindCSS
- **Infrastructure**: Redis, SQLite
- **Containerization**: Docker (multi-stage build)

## 📝 Version History

### v3.0.4 (Hotfix)
- 💉 **Engine-Level Schema Healing**: Replaced external SQL scripts with native SQLAlchemy inspection. The application now automatically detects and adds missing columns on startup using its internal engine.
- 🩺 **Ultimate Reliability**: Final resolution for the `no such column` errors reported by users upgrading from v2.6.x.

### v3.0.3 (Hotfix)
- 🛡️ **Definitive Migration Fix**: Combined import-based and subprocess-based migration triggers for absolute reliability.
- 🩺 **Schema Verification**: Added a startup check that verifies the existence of critical columns and logs clear error messages if issues persist.
- 📦 **Package Support**: Added `__init__.py` to migrations to fix Python package resolution issues.

### v3.0.2 (Hotfix)
- 🧪 **Migration Stability**: Integrated database migration triggers directly into `main.py` for guaranteed execution across all environments.
- 🔧 **Path Resolution**: Robust database path discovery in migration scripts (supports relative and absolute paths).

### v3.0.1 (Hotfix)
- 🔧 **Database Migration**: Added automated SQL migration system to handle schema updates for existing users (fixing `no such column` errors).
- 🐳 **Docker Startup**: Improved `docker_start.sh` to apply migrations before starting the application.

### v3.0.0
- ✨ **Introduced Download Module**: New system to browse and download media directly to your server.
- ✨ **Auto-Download Monitoring**: Monitor movies, series, and **series categories** for new automatic downloads.
- ✨ **Intelligent Queue**: Optimized download queue with strict `max_parallel_downloads` enforcement and bulk-add performance.
- 🔧 **Enhanced Path Resolution**: Better folder structure (Category/Series/Season) and direct Xtream API fallback for metadata.
- 🔧 **Sanitization**: Improved title cleaning to handle separators and country prefixes.
- 🛠️ **Deep Analysis**: Refined various backend components for better concurrency and data type consistency.

### v2.6.1 (Latest)
- 🌍 **Timezone Support**: Added full support for local server time via `TZ` environment variable (default: `Europe/Paris`).
- 🕒 **Core Engine**: Migrated all backend logic from UTC to local time for accurate task scheduling and logging.
- 🎨 **UI Fix**: Implemented `formatDateTime` to prevent browser timezone shifts, ensuring consistency between server logs and dashboard.
- 🐳 **Docker**: Optimized container startup and environment configuration for timezone persistence.

### v2.6.0
- ✨ **Performance**: Parallel fetching engine with **configurable concurrency settings** via UI.
- ✨ **Logs**: New real-time log streaming interface for live monitoring.
- ✨ **Metadata**: TMDB ID folder support `Movie {tmdb-ID}` for perfect matching.
- ✨ **Series**: Configurable Season folders & Episode filename formatting.
- 🔒 **Security**: Switched to non-root container user (`appuser`) and added protected routes.
- 🛠️ **Admin**: Granular Cache Clearing tools & Smart Database Reset (preserves settings).
- 🐞 Fixed redirect handling for IPTV providers and corrected hardcoded versioning.

### v2.5.0
- ✨ Enhanced NFO title formatting options
- ✨ Configurable regex for prefix stripping
- ✨ Date formatting at end of titles
- ✨ Name cleaning (underscore replacement)
- 🎨 New application logo
- 🐛 Fixed config endpoint routing
- 🐛 Improved M3U sync with NFO generation

### v2.0.0
- ✨ Added M3U playlist support
- ✨ Refactored UI structure
- ✨ Split sync controls for Movies/Series
- 🎨 Enhanced dashboard and navigation

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 💬 Support

- **Issues**: [GitHub Issues](https://github.com/mourabena2-ui/xtream-to-strm-web/issues)
- **Docker Hub**: [mourabena2ui/xtream-to-strm-web](https://hub.docker.com/r/mourabena2ui/xtream-to-strm-web)

## ☕ Support This Project

If you find this project helpful, consider supporting its development!

<a href="https://www.buymeacoffee.com/mourabena" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

Your support helps maintain and improve this project. Thank you! 🙏

---

<div align="center">

**Made with ❤️ for the Jellyfin and Kodi community**

[Docker Hub](https://hub.docker.com/r/mourabena2ui/xtream-to-strm-web) • [GitHub](https://github.com/mourabena2-ui/xtream-to-strm-web)

</div>
