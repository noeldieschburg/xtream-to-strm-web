# Xtream to STRM Web Application

A modern web-based application for managing Xtream Codes IPTV subscriptions and generating STRM/NFO files compatible with Jellyfin and Kodi media servers.

## 🌟 Features

- **Multi-Subscription Support**: Manage multiple Xtream Codes subscriptions from a single interface
- **Web-Based Configuration**: Modern, responsive UI for easy setup and management
- **Automated Scheduling**: Schedule automatic synchronization at custom intervals
- **Real-Time Monitoring**: Live sync status and progress tracking
- **Bouquet Selection**: Choose specific categories/bouquets to sync for each subscription
- **NFO File Generation**: Automatic creation of NFO metadata files for Jellyfin/Kodi
- **Incremental Updates**: Efficient sync process that only updates changed content
- **Comprehensive Logging**: Real-time log viewer for troubleshooting

## 📸 Screenshots

### Dashboard
Monitor sync status for all subscriptions with real-time updates.

![Dashboard](screenshots/dashboard_page.png)

### Bouquet Selection
Select specific categories/bouquets to sync for movies and series.

![Bouquet Selection](screenshots/bouquet_selection_page.png)

### Scheduler
Configure automated sync schedules for each subscription.

![Scheduler](screenshots/scheduler_page.png)

### Logs
View real-time application logs for monitoring and troubleshooting.

![Logs](screenshots/logs_page.png)

## 🚀 Quick Start

### Prerequisites

- Docker
- Docker Compose
- Minimum 2GB RAM
- Xtream Codes API credentials

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/xtream-to-strm-web.git
   cd xtream-to-strm-web
   ```

2. **Start the application**
   
   **Option A: Using Docker Compose (recommended)**
   ```bash
   sudo docker-compose up -d --build
   ```
   
   **Option B: Using Docker directly**
   ```bash
   sudo docker build -f Dockerfile.single -t xtream-to-strm-web .
   sudo docker run -d \
     --name xtream_app \
     -p 80:8000 \
     -v $(pwd)/output:/output \
     -v $(pwd)/db:/db \
     -v $(pwd)/app.log:/app/app.log \
     --restart unless-stopped \
     xtream-to-strm-web
   ```

3. **Access the web interface**
   
   Open your browser and navigate to: `http://localhost`
   
   Default credentials:
   - Username: `admin`
   - Password: `admin`

   ⚠️ **Important**: Change the default credentials in production!

## ⚙️ Configuration

### Adding a Subscription

1. Navigate to the **Configuration** page
2. Click "Add Subscription"
3. Fill in the required fields:
   - **Name**: A friendly name for your subscription
   - **Xtream URL**: Your Xtream Codes server URL
   - **Username**: Your Xtream Codes username
   - **Password**: Your Xtream Codes password
   - **Output Directory**: Path where STRM files will be generated (default: `/output`)
4. Click "Save"

### Selecting Bouquets

1. Navigate to the **Bouquet Selection** page
2. Select a subscription from the dropdown
3. Click "List Categories" to fetch available categories
4. Select the categories you want to sync for movies and/or series
5. Click "Save Selection"

### Scheduling Automatic Syncs

1. Navigate to the **Scheduler** page
2. Select a subscription
3. Choose sync type (Movies or Series)
4. Set the interval (in hours)
5. Click "Create Schedule"

## 📁 Directory Structure

```
xtream_to_strm_web/
├── backend/              # FastAPI backend
│   ├── app/
│   │   ├── api/         # API endpoints
│   │   ├── models/      # Database models
│   │   ├── services/    # Business logic
│   │   └── tasks/       # Celery tasks
│   └── requirements.txt
├── frontend/            # React frontend
│   ├── src/
│   │   ├── components/  # Reusable components
│   │   └── pages/       # Page components
│   └── package.json
├── db/                  # SQLite database (persistent)
├── output/              # Generated STRM/NFO files (persistent)
├── docker-compose.yml
└── Dockerfile.single
```

## 🔧 Technical Stack

### Backend
- **FastAPI**: Modern Python web framework
- **SQLAlchemy**: ORM for database management
- **Celery**: Distributed task queue for async operations
- **Redis**: Message broker and result backend
- **SQLite**: Lightweight database

### Frontend
- **React**: UI library
- **TypeScript**: Type-safe JavaScript
- **Vite**: Build tool
- **Tailwind CSS**: Utility-first CSS framework
- **shadcn/ui**: Component library

## 🐳 Docker Configuration

The application runs in a single Docker container with:
- FastAPI backend (port 8000)
- React frontend (served as static files)
- Redis server
- Celery worker
- Celery beat scheduler

### Persistent Volumes

- `./db:/db` - Database files
- `./output:/output` - Generated STRM/NFO files
- `./app.log:/app/app.log` - Application logs

## 🔐 Security

⚠️ **Important Security Notes**:

1. **Change default credentials** immediately after first login
2. **Use environment variables** for sensitive configuration
3. **Restrict network access** if exposing to the internet
4. **Keep Docker images updated** regularly

To change admin credentials, modify `backend/app/core/config.py`:
```python
ADMIN_USER: str = "your_username"
ADMIN_PASS: str = "your_secure_password"
```

## 📝 Usage

### Manual Sync

1. Navigate to the **Dashboard**
2. Click "Sync Now" for the desired subscription and type (Movies/Series)
3. Monitor progress in real-time

### Stopping a Sync

1. Navigate to the **Dashboard**
2. Click "Stop Sync" on any running synchronization

### Viewing Logs

1. Navigate to the **Logs** page
2. View real-time application logs
3. Use for troubleshooting sync issues

## 🛠️ Troubleshooting

### Application won't start
- Check Docker logs: `sudo docker-compose logs app`
- Ensure ports 80 and 8000 are not in use
- Verify Docker and Docker Compose are installed

### Sync fails
- Check Xtream Codes credentials in Configuration
- Verify Xtream server is accessible
- Review logs in the Logs page

### Database issues
- Database is stored in `./db/xtream.db`
- To reset: stop container, delete `./db/xtream.db`, restart

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📧 Support

For issues and questions, please open an issue on GitHub.

---

**Note**: This application is designed for personal use with legitimate Xtream Codes subscriptions. Please respect content licensing and copyright laws.
