import json
import math
import os
import sqlite3

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
DB_PATH = os.path.join(DATA_DIR, "resources.db")


def load_json(filename):
    path = os.path.join(DATA_DIR, filename)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(filename, payload):
    path = os.path.join(DATA_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def haversine_distance(lat1, lng1, lat2, lng2):
    """Returns distance in kilometers between two GPS points."""
    R = 6371  # Earth radius in km
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)

    a = (math.sin(d_phi / 2) ** 2
         + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def find_nearest(incident_lat, incident_lng, locations, top_n=1):
    """
    locations: list of dicts, each with 'lat' and 'lng'
    Returns the top_n nearest, each with a 'distance_km' field added.
    """
    ranked = []
    for loc in locations:
        dist = haversine_distance(incident_lat, incident_lng, loc["lat"], loc["lng"])
        entry = {**loc, "distance_km": round(dist, 2)}
        ranked.append(entry)

    ranked.sort(key=lambda x: x["distance_km"])
    return ranked[:top_n]


class GISAgent:
    def __init__(self):
        self._init_db()
        self.hospitals = self._load_resources("hospital")
        self.police_stations = self._load_resources("police_station")
        self.ambulances = self._load_resources("ambulance")

    def _connect_db(self):
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        conn = self._connect_db()
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS resources (
                id TEXT PRIMARY KEY,
                resource_type TEXT NOT NULL,
                name TEXT NOT NULL,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                phone TEXT DEFAULT '',
                status TEXT DEFAULT '',
                extra TEXT DEFAULT ''
            )
            """
        )
        conn.commit()

        existing = conn.execute("SELECT COUNT(*) as count FROM resources").fetchone()["count"]
        if existing == 0:
            for resource_type, filename in [
                ("hospital", "hospitals.json"),
                ("police_station", "police_stations.json"),
                ("ambulance", "ambulances.json"),
            ]:
                for item in load_json(filename):
                    conn.execute(
                        "INSERT INTO resources (id, resource_type, name, lat, lng, phone, status, extra) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        (
                            item.get("id"),
                            resource_type,
                            item.get("name"),
                            item.get("lat"),
                            item.get("lng"),
                            item.get("phone", ""),
                            item.get("status", ""),
                            json.dumps({"base": item.get("base", ""), "type": item.get("type", "")}),
                        ),
                    )
            conn.commit()

        conn.close()

    def _load_resources(self, resource_type):
        conn = self._connect_db()
        rows = conn.execute(
            "SELECT id, name, lat, lng, phone, status FROM resources WHERE resource_type = ? ORDER BY id",
            (resource_type,),
        ).fetchall()
        conn.close()
        return [
            {
                "id": row["id"],
                "name": row["name"],
                "lat": row["lat"],
                "lng": row["lng"],
                "phone": row["phone"],
                "status": row["status"],
            }
            for row in rows
        ]

    def _reload_cache(self):
        self.hospitals = self._load_resources("hospital")
        self.police_stations = self._load_resources("police_station")
        self.ambulances = self._load_resources("ambulance")

    def _rank_resources(self, incident_lat, incident_lng, locations, top_n=None, radius_km=None):
        ranked = find_nearest(incident_lat, incident_lng, locations, top_n=top_n or len(locations))
        if radius_km is not None:
            ranked = [entry for entry in ranked if entry["distance_km"] <= radius_km]
        return ranked

    def find_resources(self, incident_lat, incident_lng, radius_km=10):
        """
        Given an incident location, find the nearest hospital,
        police station, and available ambulance plus nearby resource counts.
        """
        nearby_hospitals = self._rank_resources(incident_lat, incident_lng, self.hospitals, radius_km=radius_km)
        nearby_police_stations = self._rank_resources(incident_lat, incident_lng, self.police_stations, radius_km=radius_km)

        available_ambulances = [a for a in self.ambulances if a["status"] == "available"]
        nearby_ambulances = self._rank_resources(incident_lat, incident_lng, available_ambulances, radius_km=radius_km)

        nearest_hospital = nearby_hospitals[0] if nearby_hospitals else None
        nearest_police = nearby_police_stations[0] if nearby_police_stations else None
        nearest_ambulance = nearby_ambulances[0] if nearby_ambulances else None

        return {
            "hospital": nearest_hospital,
            "police_station": nearest_police,
            "ambulance": nearest_ambulance,
            "nearby_resources": {
                "hospitals": nearby_hospitals,
                "police_stations": nearby_police_stations,
                "ambulances": nearby_ambulances,
            },
            "nearby_counts": {
                "hospitals": len(nearby_hospitals),
                "police_stations": len(nearby_police_stations),
                "ambulances": len(nearby_ambulances),
            },
            "radius_km": radius_km,
        }

    def register_resource(self, resource_type, name, lat, lng, phone="", status=""):
        normalized_type = (resource_type or "").lower().replace(" ", "_")
        resource_map = {
            "hospital": "hospital",
            "hospitals": "hospital",
            "police_station": "police_station",
            "police_stations": "police_station",
            "ambulance": "ambulance",
            "ambulances": "ambulance",
        }

        if normalized_type not in resource_map:
            return None

        resource_type_db = resource_map[normalized_type]
        conn = self._connect_db()
        existing_ids = {row[0] for row in conn.execute("SELECT id FROM resources WHERE resource_type = ?", (resource_type_db,))}
        prefix = "H" if resource_type_db == "hospital" else "P" if resource_type_db == "police_station" else "A"
        numeric = 1
        while f"{prefix}{numeric}" in existing_ids:
            numeric += 1
        resource_id = f"{prefix}{numeric}"

        if resource_type_db == "hospital":
            record = {
                "id": resource_id,
                "name": name,
                "lat": float(lat),
                "lng": float(lng),
                "phone": phone or "",
                "type": "registered",
            }
        elif resource_type_db == "police_station":
            record = {
                "id": resource_id,
                "name": name,
                "lat": float(lat),
                "lng": float(lng),
                "phone": phone or "",
                "status": status or "active",
            }
        else:
            record = {
                "id": resource_id,
                "name": name,
                "lat": float(lat),
                "lng": float(lng),
                "status": status or "available",
                "base": name,
                "phone": phone or "",
            }

        conn.execute(
            "INSERT INTO resources (id, resource_type, name, lat, lng, phone, status, extra) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                record["id"],
                resource_type_db,
                record["name"],
                float(lat),
                float(lng),
                record.get("phone", ""),
                record.get("status", ""),
                json.dumps({"base": record.get("base", ""), "type": record.get("type", "")}),
            ),
        )
        conn.commit()
        conn.close()
        self._reload_cache()
        return record

    def update_resource_contact(self, resource_type, resource_id, phone):
        resource_map = {
            "hospital": "hospital",
            "hospitals": "hospital",
            "police_station": "police_station",
            "police_stations": "police_station",
            "ambulance": "ambulance",
            "ambulances": "ambulance",
        }

        if resource_type not in resource_map:
            return None

        resource_type_db = resource_map[resource_type]
        conn = self._connect_db()
        conn.execute(
            "UPDATE resources SET phone = ? WHERE id = ? AND resource_type = ?",
            (phone, resource_id, resource_type_db),
        )
        conn.commit()
        conn.close()
        self._reload_cache()

        for resource in self.get_resource_snapshot()[
            "hospitals" if resource_type_db == "hospital" else "police_stations" if resource_type_db == "police_station" else "ambulances"
        ]:
            if resource["id"] == resource_id:
                return resource
        return None

    def get_resource_snapshot(self):
        return {
            "hospitals": self.hospitals,
            "police_stations": self.police_stations,
            "ambulances": self.ambulances,
        }

    def mark_ambulance_dispatched(self, ambulance_id):
        conn = self._connect_db()
        conn.execute(
            "UPDATE resources SET status = 'dispatched' WHERE id = ? AND resource_type = 'ambulance'",
            (ambulance_id,),
        )
        conn.commit()
        conn.close()
        self._reload_cache()
        return True


# Quick manual test — run this file directly to sanity-check it
if __name__ == "__main__":
    agent = GISAgent()
    result = agent.find_resources(17.4160, 78.4470)
    print(json.dumps(result, indent=2))