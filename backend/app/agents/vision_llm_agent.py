import os
import base64
import json
import logging

import cv2
from groq import Groq

logger = logging.getLogger(__name__)

USE_REAL_LLM = os.getenv("USE_REAL_LLM", "false").lower() == "true"
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

_client = Groq(api_key=GROQ_API_KEY) if (USE_REAL_LLM and GROQ_API_KEY) else None

VISION_MODEL = "featherless.ai/llama-4-scout-17b-16e-instruct"

SYSTEM_PROMPT = (
    "You are a public safety analyst reviewing a single CCTV frame. "
    "Look for signs of fire, smoke, flooding, road accidents, or crowd/crush hazards. "
    "Respond ONLY with valid JSON, no markdown, no commentary, in exactly this shape:\n"
    '{"hazard_detected": true|false, "hazard_type": "fire|flood|accident|crowd|none", '
    '"confidence": 0.0-1.0, "description": "short one-sentence description"}'
)


def _frame_to_base64(frame) -> str:
    """Encode a BGR OpenCV frame as a base64 JPEG string."""
    success, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    if not success:
        raise ValueError("Could not encode frame to JPEG")
    return base64.b64encode(buf).decode("utf-8")


def _fallback_result(reason: str) -> dict:
    return {
        "hazard_detected": False,
        "hazard_type": "none",
        "confidence": 0.0,
        "description": f"vision_llm_agent skipped: {reason}",
    }


def analyze_frame(frame, camera_id: str = "unknown") -> dict:
    """
    Send a single frame to the featherless.ai vision model and return a structured
    hazard assessment. Falls back to a safe no-op result if the LLM is
    disabled, misconfigured, or the call fails — this should never crash
    the main detection pipeline.
    """
    if not USE_REAL_LLM:
        return _fallback_result("USE_REAL_LLM is false")

    if _client is None:
        return _fallback_result("featherless.ai client not initialized (missing API key?)")

    try:
        b64_image = _frame_to_base64(frame)

        response = _client.chat.completions.create(
            model=VISION_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": f"Camera ID: {camera_id}. Analyze this frame.",
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{b64_image}"
                            },
                        },
                    ],
                },
            ],
            temperature=0.2,
            max_tokens=200,
        )

        raw_text = response.choices[0].message.content.strip()

        if raw_text.startswith("```"):
            raw_text = raw_text.strip("`")
            if raw_text.lower().startswith("json"):
                raw_text = raw_text[4:].strip()

        result = json.loads(raw_text)

        result.setdefault("hazard_detected", False)
        result.setdefault("hazard_type", "none")
        result.setdefault("confidence", 0.0)
        result.setdefault("description", "")
        return result

    except json.JSONDecodeError as e:
        logger.warning("vision_llm_agent: failed to parse LLM JSON: %s", e)
        return _fallback_result("invalid JSON from model")
    except Exception as e:
        logger.warning("vision_llm_agent: LLM call failed: %s", e)
        return _fallback_result(f"error: {e}")