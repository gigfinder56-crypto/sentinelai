import os
import json
import sqlite3
import time
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

try:
    from supabase import create_client, Client
    supabase_available = bool(SUPABASE_URL and SUPABASE_KEY)
    supabase_sdk: Optional[Client] = create_client(SUPABASE_URL, SUPABASE_KEY) if supabase_available else None
except Exception as e:
    supabase_available = False
    supabase_sdk = None
    print(f"[SupabaseClient] Supabase SDK not initialized: {e}")


class SupabaseDBClient:
    """
    Handles database persistence to Supabase tables (resources, incidents, message_logs)
    with seamless local SQLite fallback when Supabase keys are not present.
    """
    def __init__(self):
        self.url = SUPABASE_URL
        self.key = SUPABASE_KEY
        self.is_connected = supabase_available

    def sync_resource(self, resource_type: str, resource_data: Dict[str, Any]) -> bool:
        """Insert or update a resource in Supabase."""
        if not self.is_connected or not supabase_sdk:
            return False
        try:
            record = {
                "id": resource_data.get("id"),
                "resource_type": resource_type,
                "name": resource_data.get("name"),
                "lat": resource_data.get("lat"),
                "lng": resource_data.get("lng"),
                "phone": resource_data.get("phone", ""),
                "email": resource_data.get("email", ""),
                "status": resource_data.get("status", "active"),
                "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
            supabase_sdk.table("resources").upsert(record).execute()
            print(f"[Supabase] Synced resource {resource_data.get('id')} ({resource_data.get('name')})")
            return True
        except Exception as err:
            print(f"[Supabase] Resource sync warning: {err}")
            return False

    def sync_incident(self, incident: Dict[str, Any]) -> bool:
        """Insert or update an incident record in Supabase."""
        if not self.is_connected or not supabase_sdk:
            return False
        try:
            record = {
                "incident_id": incident.get("incident_id"),
                "camera_id": incident.get("camera_id"),
                "timestamp": incident.get("timestamp"),
                "event_type": incident.get("classification", {}).get("event_type", "unknown"),
                "severity": incident.get("classification", {}).get("severity", "medium"),
                "lat": incident.get("location", {}).get("lat"),
                "lng": incident.get("location", {}).get("lng"),
                "ocr_plate": incident.get("ocr", {}).get("plate_number"),
                "status": incident.get("status", "new"),
                "details": json.dumps(incident),
            }
            supabase_sdk.table("incidents").upsert(record).execute()
            print(f"[Supabase] Synced incident {incident.get('incident_id')}")
            return True
        except Exception as err:
            print(f"[Supabase] Incident sync warning: {err}")
            return False

    def sync_message(self, message_entry: Dict[str, Any]) -> bool:
        """Insert a dispatch message log into Supabase."""
        if not self.is_connected or not supabase_sdk:
            return False
        try:
            record = {
                "id": message_entry.get("id"),
                "incident_id": message_entry.get("incident_id"),
                "timestamp": message_entry.get("timestamp"),
                "recipient_type": message_entry.get("recipient_type"),
                "name": message_entry.get("name"),
                "phone": message_entry.get("phone"),
                "email": message_entry.get("email"),
                "channel": message_entry.get("channel", "sms"),
                "message_body": message_entry.get("message_body"),
                "status": message_entry.get("sms_status") or message_entry.get("status", "sent"),
            }
            supabase_sdk.table("messages").upsert(record).execute()
            print(f"[Supabase] Synced message {message_entry.get('id')} ({message_entry.get('channel')})")
            return True
        except Exception as err:
            print(f"[Supabase] Message sync warning: {err}")
            return False


supabase_client = SupabaseDBClient()
