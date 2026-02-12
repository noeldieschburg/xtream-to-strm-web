
import sqlalchemy
from sqlalchemy import create_engine, text
import os

db_path = "/home/mba/Desktop/xtream_to_strm_web/backend/app.db"
engine = create_engine(f'sqlite:///{db_path}')

with engine.connect() as conn:
    result = conn.execute(text('SELECT id, name, xtream_url, username, password FROM subscriptions WHERE id = 2;'))
    sub = result.fetchone()
    if sub:
        print(f"ID: {sub[0]}")
        print(f"Name: {sub[1]}")
        print(f"URL: {sub[2]}")
        print(f"User: {sub[3]}")
    else:
        print("Subscription 2 not found")
