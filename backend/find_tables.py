
import sqlite3
import os

start_dir = "/home/mba/Desktop/xtream_to_strm_web"
for root, dirs, files in os.walk(start_dir):
    for file in files:
        if file.endswith(".db"):
            db_path = os.path.join(root, file)
            print(f"Checking {db_path}...")
            try:
                conn = sqlite3.connect(db_path)
                cursor = conn.cursor()
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
                tables = cursor.fetchall()
                print(f"  Tables: {[t[0] for t in tables]}")
                if "subscriptions" in [t[0] for t in tables]:
                    print(f"  *** Found subscriptions table in {db_path} ***")
                conn.close()
            except Exception as e:
                print(f"  Error: {e}")
