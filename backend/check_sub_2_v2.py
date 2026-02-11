
import sqlite3
import os

db_path = "/home/mba/Desktop/xtream_to_strm_web/backend/app.db"
if not os.path.exists(db_path):
    print(f"Database not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    cursor.execute('SELECT id, name, xtream_url, username, password FROM subscriptions WHERE id = 2;')
    sub = cursor.fetchone()
    if sub:
        print(f"ID: {sub[0]}")
        print(f"Name: {sub[1]}")
        print(f"URL: {sub[2]}")
        print(f"User: {sub[3]}")
    else:
        print("Subscription 2 not found")
except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()
