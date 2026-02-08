import sys
import os

# Add /app to python path
sys.path.append('/app')

from app.tasks.downloads import process_download_queue

print("Triggering queue processing manually...")
try:
    # Execute synchronously
    process_download_queue()
    print("Queue processing completed.")
except Exception as e:
    print(f"Error triggering queue: {e}")
