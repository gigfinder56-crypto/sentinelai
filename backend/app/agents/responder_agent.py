import time
from typing import Dict, List, Optional


class ResponderAgent:
    """
    In-memory tracker for field responders (ambulance/police/fire personnel)
    reporting live GPS from their phones.
    """

    def __init__(self, stale_after_seconds: int = 60):
        self.responders: Dict[str, dict] = {}
        self.stale_after_seconds = stale_after_seconds

    def update_location(self, responder_id: str, lat: float, lng: float,
                         responder_type: str = "ambulance",
                         status: str = "active") -> dict:
        record = {
            "responder_id": responder_id,
            "lat": lat,
            "lng": lng,
            "responder_type": responder_type,
            "status": status,
            "last_update": time.time(),
        }
        self.responders[responder_id] = record
        return record

    def get_all(self) -> List[dict]:
        """Return all responders, dropping ones that have gone stale (phone lost signal/closed tab)."""
        now = time.time()
        active = [
            r for r in self.responders.values()
            if now - r["last_update"] <= self.stale_after_seconds
        ]
        return active

    def remove(self, responder_id: str) -> Optional[dict]:
        return self.responders.pop(responder_id, None)