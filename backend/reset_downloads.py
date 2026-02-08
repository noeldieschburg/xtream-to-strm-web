import sqlite3
import sys

conn = sqlite3.connect("/db/xtream.db")
cursor = conn.cursor()

print("Resetting failed tasks...")
cursor.execute("""
    UPDATE download_tasks 
    SET status = 'pending', retry_count = 0, error_message = NULL
    WHERE status = 'failed' AND (title LIKE '%26768%' OR title LIKE '%26765%')
""")
print(f"Updated {cursor.rowcount} tasks.")

conn.commit()

print("\nVerifying new status:")
cursor.execute("""
    SELECT id, title, status, progress, downloaded_bytes, file_size, error_message 
    FROM download_tasks 
    WHERE title LIKE '%26768%' OR title LIKE '%26765%' 
    ORDER BY id DESC 
    LIMIT 5
""")

results = cursor.fetchall()
for row in results:
    print(f"ID: {row[0]}, Title: {row[1]}, Status: {row[2]}, Progress: {row[3]}%, Downloaded: {row[4]}, Size: {row[5]}, Error: {row[6]}")

conn.close()
