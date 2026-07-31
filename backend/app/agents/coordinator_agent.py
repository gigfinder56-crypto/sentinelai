import json
import os
import time
import uuid

from app.agents.gis_agent import GISAgent
from app.agents.classifier_agent import ClassifierAgent

try:
    from twilio.rest import Client as TwilioClient
except ImportError:
    TwilioClient = None


class CoordinatorAgent:
    def __init__(self):
        self.gis_agent = GISAgent()
        self.classifier_agent = ClassifierAgent()
        self.incidents = {}  # in-memory store: incident_id -> incident record

    def process_incident(self, detections, camera_id, camera_lat, camera_lng, hazard_signals=None):
        """
        Full pipeline for a single detected event:
        1. Classify severity/type
        2. Find nearest resources
        3. Assemble report
        4. Dispatch (simulated)
        Returns the full incident record.
        """
        classification = self.classifier_agent.classify(
            detections, camera_id=camera_id, hazard_signals=hazard_signals
        )

        incident_id = f"INC-{uuid.uuid4().hex[:8].upper()}"
        timestamp = time.time()

        incident = {
            "incident_id": incident_id,
            "camera_id": camera_id,
            "location": {"lat": camera_lat, "lng": camera_lng},
            "timestamp": timestamp,
            "detections": detections,
            "classification": classification,
            "status": "new",
            "resources": None,
            "dispatch": None,
        }

        if classification.get("is_emergency"):
            resources = self.gis_agent.find_resources(camera_lat, camera_lng)
            incident["resources"] = resources
            incident["status"] = "dispatched"

            dispatch_info = {
                "hospital_notified": resources["hospital"]["name"] if resources["hospital"] else None,
                "police_notified": resources["police_station"]["name"] if resources["police_station"] else None,
                "ambulance_dispatched": None,
                "nearby_counts": resources.get("nearby_counts", {}),
                "ai_call_dispatch": self._dispatch_ai_calls(resources, incident={
                    "incident_id": incident_id,
                    "camera_id": camera_id,
                    "location": {"lat": camera_lat, "lng": camera_lng},
                    "classification": classification,
                }),
            }

            if resources["ambulance"]:
                ambulance = resources["ambulance"]
                self.gis_agent.mark_ambulance_dispatched(ambulance["id"])
                dispatch_info["ambulance_dispatched"] = {
                    "id": ambulance["id"],
                    "name": ambulance["name"],
                    "eta_minutes": self._estimate_eta(ambulance["distance_km"]),
                }

            incident["dispatch"] = dispatch_info
        else:
            incident["status"] = "monitoring"

        self.incidents[incident_id] = incident
        return incident

    def _dispatch_ai_calls(self, resources, incident):
        phone_targets = []

        # Always notify the nearest primary responders.
        for resource_key, resource in (("hospital", resources.get("hospital")), ("police_station", resources.get("police_station")), ("ambulance", resources.get("ambulance"))):
            if resource and resource.get("phone"):
                phone_targets.append({
                    "resource_type": resource_key,
                    "name": resource.get("name"),
                    "phone": resource.get("phone"),
                })

        # Add one additional nearby hospital and police station if available.
        for resource in resources.get("nearby_resources", {}).get("hospitals", [])[:2]:
            if resource.get("phone") and not any(item["phone"] == resource.get("phone") for item in phone_targets):
                phone_targets.append({
                    "resource_type": "hospital",
                    "name": resource.get("name"),
                    "phone": resource.get("phone"),
                })
                break

        for resource in resources.get("nearby_resources", {}).get("police_stations", [])[:2]:
            if resource.get("phone") and not any(item["phone"] == resource.get("phone") for item in phone_targets):
                phone_targets.append({
                    "resource_type": "police_station",
                    "name": resource.get("name"),
                    "phone": resource.get("phone"),
                })
                break

        call_results = []
        for target in phone_targets:
            status = self._place_ai_call(target["phone"], target["name"], incident)
            call_results.append({
                "resource_type": target["resource_type"],
                "name": target["name"],
                "phone": target["phone"],
                "status": status,
            })
        return call_results

    def _place_ai_call(self, phone_number, resource_name, incident):
        twilio_sid = os.getenv("TWILIO_ACCOUNT_SID")
        twilio_token = os.getenv("TWILIO_AUTH_TOKEN")
        twilio_from = os.getenv("TWILIO_FROM_NUMBER")

        incident_id = incident.get("incident_id")
        camera_id = incident.get("camera_id")
        location = incident.get("location", {})
        classifier = incident.get("classification", {})

        incident_text = (
            f"Incident {incident_id} detected by {camera_id}. "
            f"Type: {classifier.get('event_type', 'unknown')}, "
            f"severity: {classifier.get('severity', 'unknown')}. "
            f"Location: latitude {location.get('lat')}, longitude {location.get('lng')}.")
        message_body = (
            f"Sentinel AI emergency alert for {resource_name}. "
            f"{incident_text} "
            f"Please respond immediately.")
        call_text = (
            f"This is a Sentinel AI alert for {resource_name}. "
            f"{incident_text} "
            f"A response is required immediately.")

        if twilio_sid and twilio_token and twilio_from and TwilioClient is not None:
            try:
                client = TwilioClient(twilio_sid, twilio_token)
                sms = client.messages.create(
                    body=message_body,
                    from_=twilio_from,
                    to=phone_number,
                )
                call = client.calls.create(
                    twiml=f"<Response><Say voice='alice'>{call_text}</Say></Response>",
                    from_=twilio_from,
                    to=phone_number,
                )
                return f"sms:{sms.status}, call:{call.status}"
            except Exception as error:
                print(f"[CoordinatorAgent] Twilio notification failed for {phone_number}: {error}")
                return f"simulated for {resource_name} (notification failed)"

        return f"simulated for {resource_name}"

    def _estimate_eta(self, distance_km, avg_speed_kmph=30):
        """Simple ETA estimate assuming average city driving speed."""
        hours = distance_km / avg_speed_kmph
        return round(hours * 60, 1)

    def resolve_incident(self, incident_id):
        """Mark an incident as resolved and free up its ambulance."""
        incident = self.incidents.get(incident_id)
        if not incident:
            return None

        incident["status"] = "resolved"
        incident["resolved_at"] = time.time()

        dispatch = incident.get("dispatch")
        if dispatch and dispatch.get("ambulance_dispatched"):
            ambulance_id = dispatch["ambulance_dispatched"]["id"]
            for a in self.gis_agent.ambulances:
                if a["id"] == ambulance_id:
                    a["status"] = "available"

        return incident

    def get_incident(self, incident_id):
        return self.incidents.get(incident_id)

    def get_all_incidents(self):
        return list(self.incidents.values())


# Quick manual test
if __name__ == "__main__":
    coordinator = CoordinatorAgent()

    sample_detections = [
        {"class_name": "car", "confidence": 0.9, "box": [100, 100, 300, 300]},
        {"class_name": "car", "confidence": 0.85, "box": [150, 120, 320, 310]},
        {"class_name": "person", "confidence": 0.7, "box": [200, 400, 250, 500]},
    ]

    incident = coordinator.process_incident(
        detections=sample_detections,
        camera_id="CAM_BANJARA_01",
        camera_lat=17.4160,
        camera_lng=78.4470,
    )

    print(json.dumps(incident, indent=2))
    print("\n--- Testing a likely-emergency scenario ---\n")
    emergency_detections = [
        {"class_name": "car", "confidence": 0.9, "box": [100, 100, 400, 400]},
        {"class_name": "car", "confidence": 0.88, "box": [110, 105, 410, 405]},
        {"class_name": "truck", "confidence": 0.8, "box": [95, 95, 420, 420]},
        {"class_name": "person", "confidence": 0.6, "box": [200, 380, 240, 460]},
        {"class_name": "person", "confidence": 0.55, "box": [250, 390, 290, 470]},
    ]

    incident2 = coordinator.process_incident(
        detections=emergency_detections,
        camera_id="CAM_JUBILEE_02",
        camera_lat=17.4310,
        camera_lng=78.4076,
    )

    print(json.dumps(incident2, indent=2))