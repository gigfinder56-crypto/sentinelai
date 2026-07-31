"""
Supabase client disabled. Sentinel AI uses local SQLite (resources.db) and in-memory persistence.
"""

class SupabaseDBClient:
    def __init__(self):
        self.enabled = False

    def sync_resource(self, resource_type: str, data: dict):
        return None

    def sync_incident(self, incident: dict):
        return None

    def sync_message(self, message: dict):
        return None


supabase_client = SupabaseDBClient()
