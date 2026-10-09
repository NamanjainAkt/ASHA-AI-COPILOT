import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "..", "services", "api", "asha_backend.db")
conn = sqlite3.connect(db_path)
c = conn.cursor()

c.execute("DELETE FROM followups")
c.execute("DELETE FROM screenings")
c.execute("DELETE FROM patients")
c.execute("DELETE FROM sync_events")
c.execute("DELETE FROM devices")
c.execute("DELETE FROM workers WHERE id LIKE 'w-test-%' OR id LIKE 'test-worker-%'")

conn.commit()
conn.execute("VACUUM")

counts = {
    "patients": c.execute("SELECT COUNT(*) FROM patients").fetchone()[0],
    "screenings": c.execute("SELECT COUNT(*) FROM screenings").fetchone()[0],
    "followups": c.execute("SELECT COUNT(*) FROM followups").fetchone()[0],
    "sync_events": c.execute("SELECT COUNT(*) FROM sync_events").fetchone()[0],
    "devices": c.execute("SELECT COUNT(*) FROM devices").fetchone()[0],
    "workers": c.execute("SELECT COUNT(*) FROM workers").fetchone()[0],
    "users": c.execute("SELECT COUNT(*) FROM users").fetchone()[0]
}
conn.close()

print("Purge complete! Current counts:", counts)
