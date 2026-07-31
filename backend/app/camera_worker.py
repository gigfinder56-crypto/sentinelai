import asyncio
import time
import os
import cv2

from app.agents.vision_agent import VisionAgent
from app.agents.coordinator_agent import CoordinatorAgent
from app.agents.hazard_agent import detect_fire, detect_flood
from app.agents.vision_llm_agent import analyze_frame


class CameraWorker:
    """
    Represents one camera feed — either a live webcam (source=0) or a
    static image path (for simulated additional camera locations).
    """
    def __init__(self, coordinator: CoordinatorAgent, vision_agent: VisionAgent,
                 camera_id="CAM_LAPTOP", lat=17.4160, lng=78.4470,
                 source=0, interval_seconds=3, broadcast_fn=None,
                 emergency_cooldown_seconds=20, llm_cooldown_seconds=10):
        self.coordinator = coordinator
        self.vision_agent = vision_agent
        self.camera_id = camera_id
        self.lat = lat
        self.lng = lng
        self.source = source
        self.interval_seconds = interval_seconds
        self.broadcast_fn = broadcast_fn
        self.emergency_cooldown_seconds = emergency_cooldown_seconds
        self.llm_cooldown_seconds = llm_cooldown_seconds
        self.running = False
        self.cap = None
        self.last_emergency_time = 0
        self.last_llm_call_time = 0
        self.is_static_image = isinstance(source, str) and source.lower().endswith((".jpg", ".jpeg", ".png"))

    def _get_frame(self):
        if self.is_static_image:
            if not os.path.exists(self.source):
                print(f"[{self.camera_id}] ERROR: image not found at {self.source}")
                return None
            return cv2.imread(self.source)

        if self.cap is None or not self.cap.isOpened():
            print(f"[{self.camera_id}] Opening source {self.source}...")
            self.cap = cv2.VideoCapture(self.source, cv2.CAP_DSHOW) if isinstance(self.source, int) else cv2.VideoCapture(self.source)
            if not self.cap.isOpened():
                print(f"[{self.camera_id}] ERROR: could not open source {self.source}")
                return None

        ret, frame = self.cap.read()
        if not ret:
            return None
        return frame

    def _yolo_triggered(self, detections) -> bool:
        """
        Treat any moderately-confident detection as worth a second opinion.
        Adjust the class filter below if your YOLO labels differ.
        """
        if not detections:
            return False
        for det in detections:
            confidence = det.get("confidence", 0)
            if confidence > 0.5:
                return True
        return False

    def _process(self):
        frame = self._get_frame()
        if frame is None:
            return None

        detections = self.vision_agent.detect_frame(frame)
        fire_flag, fire_ratio = detect_fire(frame)
        flood_flag, flood_ratio = detect_flood(frame)

        heuristic_triggered = fire_flag or flood_flag
        yolo_triggered = self._yolo_triggered(detections)

        llm_result = None
        now = time.time()
        if (heuristic_triggered or yolo_triggered) and \
           (now - self.last_llm_call_time >= self.llm_cooldown_seconds):
            self.last_llm_call_time = now
            llm_result = analyze_frame(frame, camera_id=self.camera_id)
            if llm_result["hazard_detected"]:
                print(
                    f"[{self.camera_id}] LLM CONFIRMED: {llm_result['hazard_type']} "
                    f"({llm_result['confidence']:.2f}) — {llm_result['description']}"
                )

        hazard_signals = {
            "fire_detected": fire_flag,
            "fire_ratio": fire_ratio,
            "flood_detected": flood_flag,
            "flood_ratio": flood_ratio,
            "llm_result": llm_result,  # None if LLM wasn't triggered this frame
        }
        return detections, hazard_signals

    async def run(self):
        self.running = True
        loop = asyncio.get_event_loop()
        print(f"[{self.camera_id}] Starting feed loop (source={self.source})...")

        while self.running:
            try:
                result = await loop.run_in_executor(None, self._process)
                if result:
                    detections, hazard_signals = result
                    incident = self.coordinator.process_incident(
                        detections=detections,
                        camera_id=self.camera_id,
                        camera_lat=self.lat,
                        camera_lng=self.lng,
                        hazard_signals=hazard_signals,
                    )

                    if incident["status"] == "monitoring":
                        del self.coordinator.incidents[incident["incident_id"]]
                    else:
                        now = time.time()
                        if now - self.last_emergency_time >= self.emergency_cooldown_seconds:
                            self.last_emergency_time = now
                            print(f"[{self.camera_id}] EMERGENCY: {incident['incident_id']} ({incident['classification']['event_type']})")
                            if self.broadcast_fn:
                                await self.broadcast_fn({"type": "incident_update", "data": incident})
                        else:
                            del self.coordinator.incidents[incident["incident_id"]]

            except Exception as e:
                print(f"[{self.camera_id}] EXCEPTION: {e}")

            await asyncio.sleep(self.interval_seconds)

    def stop(self):
        self.running = False
        if self.cap:
            self.cap.release()