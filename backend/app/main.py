import asyncio
import json
import os
import traceback
from typing import List

try:
    import cv2
except ImportError:
    cv2 = None

try:
    import numpy as np
except ImportError:
    np = None
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.agents.coordinator_agent import CoordinatorAgent
from app.agents.responder_agent import ResponderAgent
from app.agents.vision_agent import VisionAgent
from app.camera_worker import CameraWorker

app = FastAPI(title="Sentinel AI - Emergency Response System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

vision_agent = VisionAgent()
coordinator = CoordinatorAgent()
responder_agent = ResponderAgent()

# Track connected dashboard clients for broadcasting
connected_clients: List[WebSocket] = []

# Only enable sample camera simulation when explicitly configured.
ENABLE_CAMERA_SIMULATION = os.getenv("ENABLE_CAMERA_SIMULATION", "false").lower() in ("1", "true", "yes")


async def broadcast(message: dict):
    """Send a message to every connected dashboard client."""
    dead_clients = []
    for client in connected_clients:
        try:
            await client.send_text(json.dumps(message))
        except Exception:
            dead_clients.append(client)
    for client in dead_clients:
        connected_clients.remove(client)


camera_workers = []
if ENABLE_CAMERA_SIMULATION:
    camera_workers = [
        CameraWorker(
            coordinator=coordinator, vision_agent=vision_agent,
            camera_id="CAM_LAPTOP", lat=17.4160, lng=78.4470,
            source=0, interval_seconds=3, broadcast_fn=broadcast,
        ),
        CameraWorker(
            coordinator=coordinator, vision_agent=vision_agent,
            camera_id="CAM_JUBILEE", lat=17.4310, lng=78.4076,
            source="sample_feeds/accident.jpg", interval_seconds=5, broadcast_fn=broadcast,
        ),
        CameraWorker(
            coordinator=coordinator, vision_agent=vision_agent,
            camera_id="CAM_SECUNDERABAD", lat=17.4399, lng=78.4983,
            source="sample_feeds/flood.jpg", interval_seconds=5, broadcast_fn=broadcast,
        ),
        CameraWorker(
            coordinator=coordinator, vision_agent=vision_agent,
            camera_id="CAM_ABIDS", lat=17.3903, lng=78.4750,
            source="sample_feeds/crowd.jpg", interval_seconds=5, broadcast_fn=broadcast,
        ),
    ]


class ResponderLocationUpdate(BaseModel):
    responder_id: str
    lat: float
    lng: float
    responder_type: str = "ambulance"
    status: str = "active"


class ResourcePhoneUpdate(BaseModel):
    phone: str


class ResourceRegistration(BaseModel):
    resource_type: str
    name: str
    lat: float
    lng: float
    phone: str = ""
    email: str = ""
    status: str = ""


class TwilioMessageRequest(BaseModel):
    to: str
    body: str


class DirectMessageRequest(BaseModel):
    phone: str
    body: str
    name: str = "Emergency Contact"


class DirectEmailRequest(BaseModel):
    email: str
    subject: str = "Sentinel AI Emergency Alert"
    body: str
    name: str = "Emergency Department"


class AudioCallRequest(BaseModel):
    caller_phone: str = "+91 9876543210"
    transcript: str
    lat: float = 17.4160
    lng: float = 78.4470


class SocialPostRequest(BaseModel):
    author: str = "@hyderabad_citizen"
    post_text: str
    lat: float = 17.4200
    lng: float = 78.4550


@app.get("/api/health")
def health_check():
    return {"status": "Sentinel AI backend running"}


@app.get("/incidents")
def get_incidents():
    """Return all incidents processed so far (for dashboard initial load)."""
    return coordinator.get_all_incidents()


@app.get("/resources")
def get_resources():
    """Return current state of hospitals, police, ambulances (for map markers)."""
    return coordinator.gis_agent.get_resource_snapshot()


@app.get("/api/messages")
def get_messages():
    """Return all dispatch and SMS communication logs."""
    return coordinator.get_all_messages()


@app.post("/api/messages/send")
async def send_direct_message(payload: DirectMessageRequest):
    """Send a direct SMS alert to a recipient phone number."""
    entry = coordinator.send_manual_message(payload.phone, payload.body, recipient_name=payload.name)
    await broadcast({"type": "message_sent", "data": entry})
    if entry.get("sms_status") == "failed":
        return {"ok": False, "error": entry.get("error") or "Twilio SMS dispatch failed", "message": entry}
    return {"ok": True, "message": entry}


@app.post("/api/email/send")
async def send_direct_email(payload: DirectEmailRequest):
    """Send a direct Emergency Email alert to any target email address."""
    entry = coordinator.email_agent.send_emergency_email(
        to_email=payload.email,
        recipient_name=payload.name,
        subject=payload.subject,
        body_text=payload.body,
        incident_id="DIRECT",
        severity="HIGH",
    )
    coordinator.message_logs.insert(0, entry)
    await broadcast({"type": "message_sent", "data": entry})
    return {"ok": True, "message": entry}


@app.post("/api/intake/audio_call")
async def intake_audio_call(payload: AudioCallRequest):
    """Ingest 108 emergency voice transcript, classify via LLM, and trigger autonomous dispatches."""
    incident = coordinator.process_audio_call(
        transcript=payload.transcript,
        caller_phone=payload.caller_phone,
        lat=payload.lat,
        lng=payload.lng,
    )
    await broadcast({"type": "incident_update", "data": incident})
    if incident.get("dispatch") and incident["dispatch"].get("notifications"):
        for msg in incident["dispatch"]["notifications"]:
            await broadcast({"type": "message_sent", "data": msg})
    return {"ok": True, "incident": incident}


@app.post("/api/intake/social_post")
async def intake_social_post(payload: SocialPostRequest):
    """Ingest social media citizen SOS post, extract location & disaster severity, and dispatch responders."""
    incident = coordinator.process_social_post(
        post_text=payload.post_text,
        author=payload.author,
        lat=payload.lat,
        lng=payload.lng,
    )
    await broadcast({"type": "incident_update", "data": incident})
    if incident.get("dispatch") and incident["dispatch"].get("notifications"):
        for msg in incident["dispatch"]["notifications"]:
            await broadcast({"type": "message_sent", "data": msg})
    return {"ok": True, "incident": incident}


@app.post("/api/admin/resources/register")
async def register_resource(payload: ResourceRegistration):
    resource = coordinator.gis_agent.register_resource(
        resource_type=payload.resource_type,
        name=payload.name,
        lat=payload.lat,
        lng=payload.lng,
        phone=payload.phone,
        email=payload.email,
        status=payload.status,
    )
    if not resource:
        return {"error": "Unsupported resource type"}

    await broadcast({
        "type": "resource_update",
        "data": {"resources": coordinator.gis_agent.get_resource_snapshot()},
    })
    return {"ok": True, "resource": resource, "resources": coordinator.gis_agent.get_resource_snapshot()}


@app.post("/api/twilio/send_sms")
async def send_twilio_sms(payload: TwilioMessageRequest):
    try:
        sms = coordinator.send_twilio_sms(payload.to, payload.body)
        return {"ok": True, "sid": sms.sid, "status": sms.status}
    except Exception as error:
        return JSONResponse(status_code=500, content={"error": str(error)})


@app.post("/api/admin/resources/upload")
async def upload_resources(request: Request):
    contents = await request.body()
    try:
        payload = json.loads(contents.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return {"error": "Upload a valid JSON file containing resource records"}

    if isinstance(payload, dict):
        items = payload.get("resources", [payload])
    elif isinstance(payload, list):
        items = payload
    else:
        items = []

    created = []
    for item in items:
        if not isinstance(item, dict):
            continue
        resource_type = item.get("resource_type") or item.get("type") or item.get("resourceType")
        name = item.get("name") or item.get("resource_name")
        lat = item.get("lat")
        lng = item.get("lng")
        if not resource_type or not name or lat is None or lng is None:
            continue
        record = coordinator.gis_agent.register_resource(
            resource_type=resource_type,
            name=name,
            lat=lat,
            lng=lng,
            phone=item.get("phone", ""),
            status=item.get("status", ""),
        )
        if record:
            created.append(record)

    if created:
        await broadcast({
            "type": "resource_update",
            "data": {"resources": coordinator.gis_agent.get_resource_snapshot()},
        })

    return {"ok": True, "created": created, "count": len(created), "resources": coordinator.gis_agent.get_resource_snapshot()}


@app.post("/api/admin/resources/{resource_type}/{resource_id}/phone")
async def update_resource_phone(resource_type: str, resource_id: str, payload: ResourcePhoneUpdate):
    normalized_type = resource_type.lower()
    if normalized_type == "police":
        normalized_type = "police_station"

    resource = coordinator.gis_agent.update_resource_contact(normalized_type, resource_id, payload.phone)
    if not resource:
        return {"error": "Resource not found"}

    await broadcast({
        "type": "resource_update",
        "data": {"resources": coordinator.gis_agent.get_resource_snapshot()},
    })
    return {"ok": True, "resource": resource, "resources": coordinator.gis_agent.get_resource_snapshot()}


@app.post("/api/responder/location")
async def update_responder_location(update: ResponderLocationUpdate):
    """Responder's phone posts here every few seconds with live GPS."""
    record = responder_agent.update_location(
        responder_id=update.responder_id,
        lat=update.lat,
        lng=update.lng,
        responder_type=update.responder_type,
        status=update.status,
    )
    await broadcast({"type": "responder_update", "data": record})
    return record


@app.get("/api/responders")
def get_responders():
    """Current responder positions, for the dashboard's initial load."""
    return responder_agent.get_all()


@app.post("/detect")
@app.post("/api/detect")
async def detect_from_image(request: Request):
    """
    Upload an image, run the full pipeline (vision -> OCR -> classify -> GIS -> routing -> dispatch),
    broadcast the result to all connected dashboards, and return it.
    """
    try:
        contents = await request.body()
        camera_id = request.query_params.get("camera_id", "CAM_UPLOAD")
        lat = float(request.query_params.get("lat", 17.4160))
        lng = float(request.query_params.get("lng", 78.4470))
        if np is not None and cv2 is not None:
            nparr = np.frombuffer(contents, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        else:
            frame = None

        detections = vision_agent.detect_frame(frame)
        incident = coordinator.process_incident(
            detections=detections,
            camera_id=camera_id,
            camera_lat=lat,
            camera_lng=lng,
            frame=frame,
        )

        await broadcast({"type": "incident_update", "data": incident})
        if incident.get("dispatch") and incident["dispatch"].get("notifications"):
            for msg in incident["dispatch"]["notifications"]:
                await broadcast({"type": "message_sent", "data": msg})
        return incident
    except Exception as error:
        print("[detect_from_image] Unhandled error:", error)
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": "Internal server error processing the image. Please try again later."})


@app.post("/incidents/{incident_id}/resolve")
async def resolve_incident(incident_id: str):
    incident = coordinator.resolve_incident(incident_id)
    if incident:
        await broadcast({"type": "incident_resolved", "data": incident})
    return incident or {"error": "Incident not found"}


@app.get("/api/weather")
def get_weather():
    return {"weather": coordinator.weather_agent.get_weather_telemetry()}


@app.get("/api/traffic_signals")
def get_traffic_signals():
    return coordinator.routing_agent.get_traffic_signals()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Dashboard connects here to receive live incident updates."""
    await websocket.accept()
    connected_clients.append(websocket)
    try:
        # Send current state on connect
        await websocket.send_text(json.dumps({
            "type": "initial_state",
            "data": {
                "incidents": coordinator.get_all_incidents(),
                "messages": coordinator.get_all_messages(),
                "responders": responder_agent.get_all(),
                "weather": coordinator.weather_agent.get_weather_telemetry(),
                "traffic_signals": coordinator.routing_agent.get_traffic_signals(),
                "resources": coordinator.gis_agent.get_resource_snapshot(),
            },
        }))

        while True:
            await websocket.receive_text()

    except WebSocketDisconnect:
        connected_clients.remove(websocket)


@app.on_event("startup")
async def start_cameras():
    for worker in camera_workers:
        asyncio.create_task(worker.run())


@app.on_event("shutdown")
async def stop_cameras():
    for worker in camera_workers:
        worker.stop()


# Unified Single URL Deployment: Serve React Frontend static files from FastAPI
possible_dist_paths = [
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")),
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")),
    os.path.abspath(os.path.join(os.getcwd(), "frontend", "dist")),
    os.path.abspath(os.path.join(os.getcwd(), "..", "frontend", "dist")),
]

FRONTEND_DIST = None
for p in possible_dist_paths:
    if os.path.exists(p) and os.path.isdir(p):
        FRONTEND_DIST = p
        break

if FRONTEND_DIST:
    print(f"[Sentinel AI] Mounting React Frontend from: {FRONTEND_DIST}")
    assets_path = os.path.join(FRONTEND_DIST, "assets")
    if os.path.exists(assets_path):
        app.mount("/assets", StaticFiles(directory=assets_path), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa_frontend(full_path: str):
        if full_path.startswith("api/") or full_path in ("incidents", "resources", "detect", "ws"):
            return JSONResponse(status_code=404, content={"error": "Not Found"})
        target_file = os.path.join(FRONTEND_DIST, full_path)
        if full_path and os.path.exists(target_file) and os.path.isfile(target_file):
            return FileResponse(target_file)
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))