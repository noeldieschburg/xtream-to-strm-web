import sqlite3
import sys

conn = sqlite3.connect("/db/xtream.db")
cursor = conn.cursor()

print("Resetting tasks (failed or pending with error)...")
cursor.execute("""
    UPDATE download_tasks 
    SET status = 'pending', retry_count = 0, error_message = NULL, next_retry_at = NULL
    WHERE (status = 'failed' OR status = 'pending' OR status = 'downloading') AND (title LIKE '%26768%' OR title LIKE '%26765%')
""")
print(f"Updated {cursor.rowcount} tasks.")

conn.commit()
conn.close()
