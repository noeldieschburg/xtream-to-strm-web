import sqlite3
import sys

conn = sqlite3.connect("/db/xtream.db")
cursor = conn.cursor()

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
