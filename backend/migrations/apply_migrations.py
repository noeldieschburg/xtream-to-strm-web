import sqlite3
import os
import sys
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def apply_migrations():
    db_path = os.environ.get("DATABASE_URL", "/db/xtream.db")
    if db_path.startswith("sqlite:///"):
        db_path = db_path.replace("sqlite:///", "")
    
    migrations_dir = "/app/migrations"
    if not os.path.exists(migrations_dir):
        logger.warning(f"Migrations directory not found: {migrations_dir}")
        return

    sql_files = sorted([f for f in os.listdir(migrations_dir) if f.endswith(".sql")])
    if not sql_files:
        logger.info("No migrations found.")
        return

    logger.info(f"Checking migrations for database: {db_path}")
    if not os.path.exists(db_path):
        logger.error(f"Database file not found: {db_path}")
        # Base.metadata.create_all will create it later if it doesn't exist
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    for sql_file in sql_files:
        logger.info(f"🔹 Processing {sql_file}...")
        with open(os.path.join(migrations_dir, sql_file), 'r') as f:
            sql_script = f.read()
        
        # We split by semicolon to handle errors better, or just use executescript
        # executescript handles transactions automatically
        try:
            # SQLite doesn't check if column exists easily in SQL
            # We catch specific "duplicate column name" errors
            # But simpler is to catch OperationalError in a loop for each statement
            statements = sql_script.split(';')
            for statement in statements:
                stmt = statement.strip()
                if not stmt:
                    continue
                try:
                    cursor.execute(stmt)
                    logger.info(f"✅ Success: {stmt[:50]}...")
                except sqlite3.OperationalError as e:
                    if "duplicate column name" in str(e).lower():
                        logger.info(f"⏩ Skipping (already exists): {stmt[:50]}...")
                    else:
                        logger.warning(f"⚠️ Warning: {e} in statement: {stmt[:50]}...")
            conn.commit()
        except Exception as e:
            logger.error(f"❌ Failed to apply {sql_file}: {e}")
            conn.rollback()

    conn.close()
    logger.info("🎉 All migrations processed.")

if __name__ == "__main__":
    apply_migrations()
