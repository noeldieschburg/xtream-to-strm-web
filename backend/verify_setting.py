import sqlite3
import os

db_path = "/home/mba/Desktop/xtream_to_strm_web/db/xtream.db"
if not os.path.exists(db_path):
    print(f"Error: {db_path} not found")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("SELECT key, value FROM settings WHERE key = 'SERIES_USE_CATEGORY_FOLDERS'")
row = cursor.fetchone()

if row:
    print(f"Key: {row[0]}, Value: {row[1]}")
else:
    print("Setting SERIES_USE_CATEGORY_FOLDERS not found in database.")

conn.close()
