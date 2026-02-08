"""
Migration script to add connection parameters to download_settings_global table
Run this inside the Docker container with: python migrate_add_connection_params.py
"""
import sqlite3
import sys

DB_PATH = "/db/xtream.db"

def main():
    print("🔄 Applying migration: Add connection parameters...")
    print(f"Database: {DB_PATH}")
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Add max_redirects column
        print("  Adding column: max_redirects...")
        cursor.execute("""
            ALTER TABLE download_settings_global 
            ADD COLUMN max_redirects INTEGER DEFAULT 10
        """)
        
        # Add connection_timeout_seconds column
        print("  Adding column: connection_timeout_seconds...")
        cursor.execute("""
            ALTER TABLE download_settings_global 
            ADD COLUMN connection_timeout_seconds INTEGER DEFAULT 30
        """)
        
        # Update existing rows
        print("  Updating existing rows with default values...")
        cursor.execute("""
            UPDATE download_settings_global 
            SET max_redirects = 10, connection_timeout_seconds = 30
            WHERE max_redirects IS NULL OR connection_timeout_seconds IS NULL
        """)
        
        conn.commit()
        conn.close()
        
        print("✅ Migration applied successfully!")
        print("")
        print("New columns added:")
        print("  - max_redirects (INTEGER, default: 10)")
        print("  - connection_timeout_seconds (INTEGER, default: 30)")
        
        return 0
        
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e).lower():
            print("⚠️  Columns already exist, skipping migration.")
            return 0
        else:
            print(f"❌ Migration failed: {e}")
            return 1
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
