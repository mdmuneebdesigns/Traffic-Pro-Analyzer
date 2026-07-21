import os
import sqlite3
import logging
from datetime import datetime

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("TRAFFIC_DB")

# Get absolute path to the directory containing database.py
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(PROJECT_DIR, "traffic_data.db")

def init_local_db():
    """
    Automatically creates a local database file named traffic_data.db
    inside the project folder if it doesn't exist.
    """
    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS local_traffic_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                track_id INTEGER,
                vehicle_type TEXT NOT NULL,
                license_plate TEXT DEFAULT 'Unknown',
                speed_kmh REAL DEFAULT 0.0,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
        logger.info(f"Local SQLite database {DB_PATH} initialized successfully with local_traffic_logs table.")
    except Exception as e:
        logger.error(f"Error creating local SQLite database schema: {e}")
    finally:
        conn.close()

class Database:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(Database, cls).__new__(cls)
            init_local_db()
        return cls._instance

    def insert_vehicle(self, vehicle_type: str, plate_number: str, direction: str = "Inbound", speed: float = 0.0, track_id: int = 0):
        """Inserts a crossing record into the local_traffic_logs table."""
        conn = sqlite3.connect(DB_PATH)
        try:
            cursor = conn.cursor()
            license_plate = plate_number if plate_number else "Unknown"
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cursor.execute("""
                INSERT INTO local_traffic_logs (track_id, vehicle_type, license_plate, speed_kmh, timestamp)
                VALUES (?, ?, ?, ?, ?)
            """, (track_id, vehicle_type, license_plate, round(speed, 1), now_str))
            conn.commit()
            logger.info(f"Logged vehicle #{track_id}: {vehicle_type} ({license_plate}) at {speed:.1f} km/h locally.")
            return True
        except Exception as e:
            logger.error(f"Failed to insert vehicle into SQLite database: {e}")
            return False
        finally:
            conn.close()

    def fetch_all_vehicles(self, limit: int = 100):
        """Fetches the latest vehicle records."""
        conn = sqlite3.connect(DB_PATH)
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, vehicle_type, license_plate, timestamp, speed_kmh, track_id 
                FROM local_traffic_logs 
                ORDER BY timestamp DESC 
                LIMIT ?
            """, (limit,))
            rows = cursor.fetchall()
            records = []
            for row in rows:
                records.append({
                    "id": row[0],
                    "vehicle_type": row[1],
                    "plate_number": row[2],  # map to plate_number for legacy UI compatibility
                    "timestamp": row[3],
                    "speed": row[4],
                    "track_id": row[5]
                })
            return records
        except Exception as e:
            logger.error(f"Failed to fetch vehicle logs from SQLite: {e}")
            return []
        finally:
            conn.close()

    def get_stats(self):
        """Returns counts grouped by vehicle type."""
        conn = sqlite3.connect(DB_PATH)
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT vehicle_type, COUNT(*) 
                FROM local_traffic_logs 
                GROUP BY vehicle_type
            """)
            rows = cursor.fetchall()
            return {row[0]: row[1] for row in rows}
        except Exception as e:
            logger.error(f"Failed to fetch traffic stats from SQLite: {e}")
            return {}
        finally:
            conn.close()

# Singleton instance for simple modular imports
db = Database()

def init_db():
    return db
