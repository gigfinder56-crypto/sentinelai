import os
import json
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

USE_REAL_LLM = os.getenv("USE_REAL_LLM", "false").lower() == "true"

CLASSIFIER_SYSTEM_PROMPT = """You are an emergency event classifier for an autonomous public safety system that monitors CCTV camera feeds.

You will be given a list of object detections from a single camera frame (class names, confidence scores, and bounding box positions [x1,y1,x2,y2]). This is a simulated demo system — bounding box overlap is your PRIMARY signal for collisions, since you cannot see the actual image.

Apply these rules strictly:
- If two or more vehicle boxes (car/truck/bus/motorcycle) overlap significantly (i.e., their boxes cover a large shared area relative to their size), you MUST treat this as a likely collision — classify as "accident" with severity "high" or "critical". Do not dismiss this as normal traffic just because no explicit damage is described — you have no visual access beyond these boxes, so overlap IS the evidence.
- If people are detected very close to or overlapping with vehicle boxes in a way consistent with a pedestrian being struck, treat this as "accident" with severity "critical".
- If 8 or more people are detected in one frame, classify as "crowd_incident" with at least "medium" severity.
- Only classify as "normal_traffic" if vehicles and people are clearly separated with minimal or no box overlap.

Respond ONLY with valid JSON in this exact structure, nothing else:
{
  "is_emergency": true or false,
  "event_type": "accident" | "fire" | "crowd_incident" | "flooding" | "normal_traffic" | "other",
  "severity": "low" | "medium" | "high" | "critical",
  "confidence": 0.0 to 1.0,
  "reasoning": "1-2 sentence explanation",
  "recommended_response": "1 sentence on what should happen next"
}
"""


def _box_overlap_ratio(box1, box2):
    x1 = max(box1[0], box2[0])
    y1 = max(box1[1], box2[1])
    x2 = min(box1[2], box2[2])
    y2 = min(box1[3], box2[3])

    if x2 <= x1 or y2 <= y1:
        return 0.0

    intersection = (x2 - x1) * (y2 - y1)
    area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
    area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
    smaller_area = min(area1, area2)

    return intersection / smaller_area if smaller_area > 0 else 0.0


class ClassifierAgent:
    def __init__(self):
        self.client = None
        self.model = "llama-3.3-70b-versatile"
        if USE_REAL_LLM:
            featherless_key = os.getenv("FEATHERLESS_API_KEY")
            featherless_url = os.getenv("FEATHERLESS_BASE_URL", "https://api.featherless.ai/v1")
            groq_key = os.getenv("GROQ_API_KEY")

            if featherless_key:
                try:
                    from openai import OpenAI
                    self.client = OpenAI(base_url=featherless_url, api_key=featherless_key)
                    self.model = "meta-llama/Meta-Llama-3.1-8B-Instruct"
                    print("[ClassifierAgent] Initialized Featherless AI client.")
                except Exception as err:
                    print("[ClassifierAgent] Featherless AI init failed:", err)
            elif groq_key:
                try:
                    from groq import Groq
                    self.client = Groq(api_key=groq_key)
                    self.model = "llama-3.3-70b-versatile"
                    print("[ClassifierAgent] Initialized Groq LLM client.")
                except Exception as error:
                    print("[ClassifierAgent] Groq init failed:", error)

    def classify(self, detections, camera_id="CAM_01", hazard_signals=None):
        if USE_REAL_LLM and self.client is not None:
            try:
                return self._classify_with_llm(detections, camera_id)
            except Exception as error:
                print("[ClassifierAgent] Real LLM classification failed:", error)
                print("[ClassifierAgent] Falling back to rule-based classifier.")
        return self._classify_with_rules(detections, camera_id, hazard_signals)

    def _classify_with_rules(self, detections, camera_id, hazard_signals=None):
        hazard_signals = hazard_signals or {}

        if hazard_signals.get("fire_detected"):
            ratio = hazard_signals.get("fire_ratio", 0)
            return {
                "is_emergency": True,
                "event_type": "fire",
                "severity": "critical" if ratio > 0.25 else "high",
                "confidence": round(min(0.95, 0.5 + ratio), 2),
                "reasoning": f"Large region of fire-like coloration detected ({round(ratio * 100, 1)}% of frame).",
                "recommended_response": "Dispatch fire department immediately.",
            }

        if hazard_signals.get("flood_detected"):
            ratio = hazard_signals.get("flood_ratio", 0)
            return {
                "is_emergency": True,
                "event_type": "flooding",
                "severity": "critical" if ratio > 0.55 else "high",
                "confidence": round(min(0.9, 0.4 + ratio), 2),
                "reasoning": f"Large body of standing water detected covering {round(ratio * 100, 1)}% of the lower frame.",
                "recommended_response": "Alert disaster response team and restrict road access.",
            }

        vehicle_classes = {"car", "truck", "bus", "motorcycle"}
        vehicles = [d for d in detections if d["class_name"] in vehicle_classes]
        people = [d for d in detections if d["class_name"] == "person"]

        max_overlap = 0.0
        for i in range(len(vehicles)):
            for j in range(i + 1, len(vehicles)):
                overlap = _box_overlap_ratio(vehicles[i]["box"], vehicles[j]["box"])
                max_overlap = max(max_overlap, overlap)

        if max_overlap > 0.4:
            return {
                "is_emergency": True,
                "event_type": "accident",
                "severity": "critical" if max_overlap > 0.6 else "high",
                "confidence": round(min(0.95, 0.5 + max_overlap), 2),
                "reasoning": f"Detected {len(vehicles)} vehicles with significant overlap ({round(max_overlap, 2)}), suggesting a possible collision.",
                "recommended_response": "Dispatch ambulance and traffic police immediately.",
            }

        if len(people) >= 8:
            return {
                "is_emergency": True,
                "event_type": "crowd_incident",
                "severity": "medium",
                "confidence": 0.6,
                "reasoning": f"High pedestrian density detected ({len(people)} people) which may indicate congestion or a crowd incident.",
                "recommended_response": "Monitor closely; alert nearby police unit for awareness.",
            }

        return {
            "is_emergency": False,
            "event_type": "normal_traffic",
            "severity": "low",
            "confidence": 0.8,
            "reasoning": f"Detected {len(vehicles)} vehicles and {len(people)} people with no signs of collision or abnormal density.",
            "recommended_response": "No action needed; continue monitoring.",
        }

    def _classify_with_llm(self, detections, camera_id):
        detection_summary = json.dumps(detections, indent=2)
        user_prompt = f"""Camera ID: {camera_id}
Detections from this frame:
{detection_summary}

Classify this event."""

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": CLASSIFIER_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                max_tokens=500,
                temperature=0.2,
            )

            raw_text = response.choices[0].message.content.strip()
            raw_text = raw_text.replace("```json", "").replace("```", "").strip()

            try:
                return json.loads(raw_text)
            except json.JSONDecodeError:
                print("[ClassifierAgent] Failed to parse LLM output; falling back to rule-based classifier.")
                print("[ClassifierAgent] Raw LLM output:", raw_text)
                return self._classify_with_rules(detections, camera_id)
        except Exception as error:
            print("[ClassifierAgent] LLM classification failed:", error)
            print("[ClassifierAgent] Falling back to rule-based classifier.")
            return self._classify_with_rules(detections, camera_id)


# Quick manual test
if __name__ == "__main__":
    sample_detections = [
        {"class_name": "car", "confidence": 0.9, "box": [100, 100, 300, 300]},
        {"class_name": "car", "confidence": 0.85, "box": [150, 120, 320, 310]},
        {"class_name": "person", "confidence": 0.7, "box": [200, 400, 250, 500]},
    ]

    agent = ClassifierAgent()
    result = agent.classify(sample_detections, camera_id="CAM_TEST_01")
    print(json.dumps(result, indent=2))