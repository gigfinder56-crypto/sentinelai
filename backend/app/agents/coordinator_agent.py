import json
import os
import time
import uuid

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

def format_e164_phone(phone: str) -> str:
    if not phone:
        return ""
    cleaned = "".join(c for c in str(phone) if c.isdigit())
    if len(cleaned) == 10:
        return f"+91{cleaned}"
    elif len(cleaned) == 12 and cleaned.startswith("91"):
        return f"+{cleaned}"
    elif str(phone).startswith("+"):
        return str(phone)
    return str(phone)

try:
    from twilio.rest import Client as TwilioClient
except ImportError:
    TwilioClient = None

from app.agents.gis_agent import GISAgent
from app.agents.classifier_agent import ClassifierAgent
from app.agents.ocr_agent import OCRAgent
from app.agents.speech_agent import SpeechAgent
from app.agents.weather_agent import WeatherAgent
from app.agents.routing_agent import RoutingAgent
from app.agents.featherless_agent import FeatherlessAIAgent
from app.agents.email_agent import EmailAgent


class CoordinatorAgent:
    def __init__(self):
        self.gis_agent = GISAgent()
        self.classifier_agent = ClassifierAgent()
        self.ocr_agent = OCRAgent()
        self.speech_agent = SpeechAgent()
        self.weather_agent = WeatherAgent()
        self.routing_agent = RoutingAgent()
        self.featherless_agent = FeatherlessAIAgent()
        self.email_agent = EmailAgent()
        self.incidents = {}  # in-memory store: incident_id -> incident record
        self.message_logs = []  # in-memory store for all generated/sent messages

    def _create_twilio_client(self):
        twilio_sid = os.getenv("TWILIO_ACCOUNT_SID")
        twilio_token = os.getenv("TWILIO_AUTH_TOKEN")
        if not twilio_sid or not twilio_token or TwilioClient is None:
            return None
        return TwilioClient(twilio_sid, twilio_token)

    def send_twilio_sms(self, to_number: str, body: str):
        client = self._create_twilio_client()
        if client is None:
            raise RuntimeError(
                "Twilio is not configured. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, and install twilio."
            )
        from_number = os.getenv("TWILIO_FROM_NUMBER")
        if not from_number:
            raise RuntimeError("TWILIO_FROM_NUMBER is not configured.")
        to_formatted = format_e164_phone(to_number)
        return client.messages.create(body=body, from_=from_number, to=to_formatted)

    def send_twilio_call(self, to_number: str, twiml: str):
        client = self._create_twilio_client()
        if client is None:
            raise RuntimeError(
                "Twilio is not configured. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, and install twilio."
            )
        from_number = os.getenv("TWILIO_FROM_NUMBER")
        if not from_number:
            raise RuntimeError("TWILIO_FROM_NUMBER is not configured.")
        to_formatted = format_e164_phone(to_number)
        return client.calls.create(twiml=twiml, from_=from_number, to=to_formatted)

    def send_manual_message(self, to_number: str, body: str, recipient_name: str = "Emergency Contact"):
        """Send a direct manual message via Twilio (if configured) or simulated fallback."""
        msg_id = f"MSG-{uuid.uuid4().hex[:8].upper()}"
        now = time.time()
        time_str = time.strftime("%H:%M:%S", time.localtime(now))
        to_formatted = format_e164_phone(to_number)
        
        mode = "simulated"
        sms_status = "simulated"
        error_msg = None

        client = self._create_twilio_client()
        twilio_from = os.getenv("TWILIO_FROM_NUMBER")
        
        if client is not None and twilio_from:
            try:
                sms = client.messages.create(body=body, from_=twilio_from, to=to_formatted)
                mode = "twilio"
                sms_status = sms.status
            except Exception as err:
                mode = "twilio"
                sms_status = "failed"
                error_msg = str(err)
                print(f"[CoordinatorAgent] Manual Twilio SMS failed to {to_formatted}: {err}")

        entry = {
            "id": msg_id,
            "incident_id": "MANUAL",
            "timestamp": now,
            "formatted_time": time_str,
            "recipient_type": "direct_sms",
            "name": recipient_name,
            "phone": to_formatted,
            "message_body": body,
            "call_script": None,
            "sms_status": sms_status,
            "call_status": "n/a",
            "mode": mode,
            "error": error_msg,
        }

        self.message_logs.insert(0, entry)
        return entry

    def get_all_messages(self):
        return self.message_logs

    def process_audio_call(self, transcript: str, caller_phone: str = "+919876543210", lat: float = 17.4310, lng: float = 78.4076):
        """Autonomous ingest for 108 Emergency Audio Calls."""
        parsed_call = self.speech_agent.process_call_transcript(transcript, caller_phone=caller_phone)
        event_info = parsed_call["parsed_event"]

        detections = [
            {"class_name": event_info["event_type"], "confidence": 0.95, "box": [100, 100, 300, 300]},
            {"class_name": "person", "confidence": 0.8, "box": [150, 150, 250, 250]},
        ]

        incident = self.process_incident(
            detections=detections,
            camera_id=f"CALL_108_{caller_phone[-4:]}",
            camera_lat=lat,
            camera_lng=lng,
            call_info=parsed_call,
        )
        return incident

    def process_social_post(self, post_text: str, author: str = "@citizen_sos", lat: float = 17.4160, lng: float = 78.4470):
        """Autonomous ingest for Social Media Citizen SOS posts."""
        parsed = self.speech_agent.process_call_transcript(post_text)
        event_info = parsed["parsed_event"]

        detections = [
            {"class_name": event_info["event_type"], "confidence": 0.92, "box": [120, 120, 280, 280]}
        ]

        incident = self.process_incident(
            detections=detections,
            camera_id=f"SOS_SOCIAL_{author.replace('@', '')}",
            camera_lat=lat,
            camera_lng=lng,
            social_info={"post_text": post_text, "author": author},
        )
        return incident

    def process_incident(self, detections, camera_id, camera_lat, camera_lng, hazard_signals=None, frame=None, call_info=None, social_info=None):
        """
        Full Autonomous Multi-Agent Pipeline:
        1. Classify severity/type with LLM/Rules
        2. Extract OCR License Plates (if frame supplied)
        3. Fetch Weather & IoT Telemetry
        4. Predict Hazard Spread (Fire/Flood)
        5. Find nearest GIS Resources (Ambulance, Police, Traffic Police, Hospital)
        6. Calculate SHORTEST PATH for Ambulance & Preempt Traffic Signals along route
        7. Featherless AI synthesizes emergency messages
        8. Dispatch Emergency SMS/Voice Alerts automatically (Ambulance: +919000000101, Police: +919000000102, Traffic Police: +919000000103)
        """
        classification = self.classifier_agent.classify(
            detections, camera_id=camera_id, hazard_signals=hazard_signals
        )

        ocr_data = None
        if frame is not None:
            ocr_data = self.ocr_agent.extract_license_plate(frame)

        weather_telemetry = self.weather_agent.get_weather_telemetry()
        event_type = classification.get("event_type", "accident")
        hazard_spread = self.weather_agent.predict_hazard_spread(event_type, camera_lat, camera_lng)

        incident_id = f"INC-{uuid.uuid4().hex[:8].upper()}"
        timestamp = time.time()

        incident = {
            "incident_id": incident_id,
            "camera_id": camera_id,
            "location": {"lat": camera_lat, "lng": camera_lng},
            "timestamp": timestamp,
            "detections": detections,
            "classification": classification,
            "ocr": ocr_data,
            "weather": weather_telemetry,
            "hazard_spread": hazard_spread,
            "call_info": call_info,
            "social_info": social_info,
            "status": "new",
            "resources": None,
            "dispatch": None,
            "route": None,
            "featherless_ai_used": True,
        }

        if classification.get("is_emergency"):
            resources = self.gis_agent.find_resources(camera_lat, camera_lng)
            incident["resources"] = resources
            incident["status"] = "dispatched"

            # Calculate SHORTEST PATH route for Ambulance & preempt traffic signals
            ambulance = resources.get("ambulance")
            route_info = None
            if ambulance:
                self.gis_agent.mark_ambulance_dispatched(ambulance["id"])
                route_info = self.routing_agent.compute_route(
                    ambulance["lat"], ambulance["lng"], camera_lat, camera_lng
                )

            # Featherless AI Synthesis for emergency messages
            featherless_res = self.featherless_agent.synthesize_emergency_dispatches(
                incident_id=incident_id,
                event_type=event_type,
                severity=classification.get("severity", "high"),
                lat=camera_lat,
                lng=camera_lng,
                shortest_path_info=route_info,
            )

            # Dispatch targeted SMS to Ambulance (+919000000101), Police (+919000000102), and Traffic Police (+919000000103)
            notifications = self._dispatch_target_responders(
                incident=incident,
                resources=resources,
                route_info=route_info,
                featherless_texts=featherless_res,
            )

            dispatch_info = {
                "hospital_notified": resources["hospital"]["name"] if (resources.get("hospital") and resources["hospital"].get("distance_km", 99) <= 5.0) else None,
                "police_notified": resources["police_station"]["name"] if resources.get("police_station") else None,
                "traffic_police_notified": "Traffic Police Control Room (+919000000103)",
                "ambulance_dispatched": {
                    "id": ambulance["id"] if ambulance else "A1",
                    "name": ambulance["name"] if ambulance else "Ambulance Unit 1",
                    "phone": format_e164_phone(ambulance["phone"]) if (ambulance and ambulance.get("phone")) else "+919000000101",
                    "eta_minutes": route_info["eta_minutes"] if route_info else 4.0,
                    "distance_km": route_info["distance_km"] if route_info else 2.4,
                },
                "nearby_counts": resources.get("nearby_counts", {}),
                "green_corridor_active": route_info.get("green_corridor_active", True) if route_info else True,
                "signals_preempted": route_info.get("signals_preempted", []) if route_info else [],
                "notifications": notifications,
            }

            incident["dispatch"] = dispatch_info
            incident["route"] = route_info
        else:
            incident["status"] = "monitoring"

        self.incidents[incident_id] = incident
        return incident

    def _dispatch_target_responders(self, incident, resources, route_info, featherless_texts):
        """
        Dispatches targeted SMS alerts WITHOUT notifying far away places:
        1. Ambulance (+919000000101): Shortest path & accident details.
        2. Police Station (+919000000102): Law enforcement request for crash site.
        3. Traffic Police (+919000000103): Clear traffic along shortest path corridor.
        4. Nearest Hospital ONLY if within 5.0 km.
        """
        phone_targets = []

        # 1. AMBULANCE (Default Demo: +919000000101)
        amb_res = resources.get("ambulance")
        amb_phone = format_e164_phone(amb_res.get("phone") if amb_res and amb_res.get("phone") else "+919000000101")
        amb_name = amb_res.get("name") if amb_res else "Ambulance Unit 1"
        phone_targets.append({
            "resource_type": "ambulance",
            "name": f"{amb_name} (+919000000101)",
            "phone": "+919000000101" if amb_phone == "+919000000001" else amb_phone,
            "custom_body": featherless_texts.get("ambulance_msg"),
        })

        # 2. POLICE STATION (Default Demo: +919000000102)
        pol_res = resources.get("police_station")
        pol_phone = format_e164_phone(pol_res.get("phone") if pol_res and pol_res.get("phone") else "+919000000102")
        pol_name = pol_res.get("name") if pol_res else "Banjara Hills Police Station"
        phone_targets.append({
            "resource_type": "police_station",
            "name": f"{pol_name} (+919000000102)",
            "phone": "+919000000102",
            "custom_body": featherless_texts.get("police_msg"),
        })

        # 3. TRAFFIC POLICE (Default Demo: +919000000103)
        phone_targets.append({
            "resource_type": "traffic_police",
            "name": "Traffic Police Control Room (+919000000103)",
            "phone": "+919000000103",
            "custom_body": featherless_texts.get("traffic_police_msg"),
        })

        # 4. NEAREST HOSPITAL (ONLY IF within strict 5 km radius)
        hosp_res = resources.get("hospital")
        if hosp_res and hosp_res.get("distance_km", 99) <= 5.0 and hosp_res.get("phone"):
            hosp_phone = format_e164_phone(hosp_res.get("phone"))
            phone_targets.append({
                "resource_type": "hospital",
                "name": hosp_res.get("name"),
                "phone": hosp_phone,
                "custom_body": None,
            })

        # 5. FIRE STATION & RESCUE COMMAND (IF nearby or hazard/collision/fire event)
        fire_res = resources.get("fire_station")
        if fire_res:
            fire_phone = format_e164_phone(fire_res.get("phone") if fire_res.get("phone") else "+919000000104")
            phone_targets.append({
                "resource_type": "fire_station",
                "name": f"{fire_res.get('name')} (+919000000104)",
                "phone": fire_phone,
                "custom_body": f"🔥 Sentinel AI Fire & Rescue Alert: Emergency at Lat {incident.get('location',{}).get('lat')}, Lng {incident.get('location',{}).get('lng')}. Unit {fire_res.get('name')} dispatched.",
            })

        results = []
        for target in phone_targets:
            res = self._place_ai_call(
                phone_number=target["phone"],
                resource_name=target["name"],
                resource_type=target["resource_type"],
                incident=incident,
                override_body=target.get("custom_body"),
            )
            results.append(res)

        # Dispatch Email Alerts to registered department email addresses
        email_targets = [
            {
                "email": pol_res.get("email") if pol_res else "police.hq@telangana.gov.in",
                "name": pol_res.get("name") if pol_res else "Police HQ Command",
                "subject": f"Emergency Dispatch Alert - Incident {incident.get('incident_id')}",
                "body": featherless_texts.get("police_msg") or f"Emergency Alert for Police Dept at Lat {incident.get('location',{}).get('lat')}, Lng {incident.get('location',{}).get('lng')}.",
            },
            {
                "email": hosp_res.get("email") if hosp_res else "trauma.center@apollo.org",
                "name": hosp_res.get("name") if hosp_res else "Emergency Medical Center",
                "subject": f"Trauma Response Dispatched - Incident {incident.get('incident_id')}",
                "body": f"Medical Emergency Dispatched to nearest facility ({hosp_res.get('name') if hosp_res else 'Central Hospital'}). ETA: 4 mins.",
            },
            {
                "email": fire_res.get("email") if fire_res else "fire.control@telangana.gov.in",
                "name": fire_res.get("name") if fire_res else "Fire & Rescue Station",
                "subject": f"Fire & Rescue Response - Incident {incident.get('incident_id')}",
                "body": f"Fire & Rescue Dispatch Alert for Lat {incident.get('location',{}).get('lat')}, Lng {incident.get('location',{}).get('lng')}.",
            },
        ]

        for etarget in email_targets:
            if etarget["email"]:
                eml_log = self.email_agent.send_emergency_email(
                    to_email=etarget["email"],
                    recipient_name=etarget["name"],
                    subject=etarget["subject"],
                    body_text=etarget["body"],
                    incident_id=incident.get("incident_id", "MANUAL"),
                    severity=incident.get("classification", {}).get("severity", "high"),
                )
                self.message_logs.insert(0, eml_log)
                results.append(eml_log)

        return results

    def _place_ai_call(self, phone_number, resource_name, resource_type, incident, override_body=None):
        twilio_from = os.getenv("TWILIO_FROM_NUMBER")
        formatted_phone = format_e164_phone(phone_number)

        incident_id = incident.get("incident_id")
        camera_id = incident.get("camera_id")
        location = incident.get("location", {})
        classifier = incident.get("classification", {})

        if override_body:
            message_body = override_body
        else:
            incident_text = (
                f"Incident {incident_id} detected by {camera_id}. "
                f"Type: {classifier.get('event_type', 'unknown')}, "
                f"severity: {classifier.get('severity', 'unknown')}. "
                f"Location: lat {location.get('lat')}, lng {location.get('lng')}.")
            message_body = (
                f"🚨 Sentinel AI Emergency Alert for {resource_name}: "
                f"{incident_text} "
                f"Please respond immediately.")

        call_text = (
            f"This is an automated Sentinel AI Featherless emergency call for {resource_name}. "
            f"Location: lat {location.get('lat')}, lng {location.get('lng')}. "
            f"Response required immediately.")

        now = time.time()
        time_str = time.strftime("%H:%M:%S", time.localtime(now))
        msg_id = f"MSG-{uuid.uuid4().hex[:8].upper()}"

        mode = "simulated"
        sms_status = "simulated"
        call_status = "simulated"
        error_msg = None

        client = self._create_twilio_client()
        if client is not None and twilio_from:
            mode = "twilio"
            try:
                sms = client.messages.create(
                    body=message_body,
                    from_=twilio_from,
                    to=formatted_phone,
                )
                sms_status = sms.status
                try:
                    call = client.calls.create(
                        twiml=f"<Response><Say voice='alice'>{call_text}</Say></Response>",
                        from_=twilio_from,
                        to=formatted_phone,
                    )
                    call_status = call.status
                except Exception as call_err:
                    call_status = "call_skipped"
            except Exception as error:
                print(f"[CoordinatorAgent] Twilio notification failed for {formatted_phone}: {error}")
                sms_status = "failed"
                call_status = "failed"
                error_msg = str(error)

        entry = {
            "id": msg_id,
            "incident_id": incident_id,
            "timestamp": now,
            "formatted_time": time_str,
            "recipient_type": resource_type,
            "name": resource_name,
            "phone": phone_number,
            "message_body": message_body,
            "call_script": call_text,
            "sms_status": sms_status,
            "call_status": call_status,
            "mode": mode,
            "error": error_msg,
        }

        self.message_logs.insert(0, entry)
        return entry

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