import re
import time

class SpeechAgent:
    """
    Speech Recognition & Emergency Voice Call Agent for transcribing 108/911 calls,
    extracting key emergency indicators, severity, casualty counts, and location hints.
    """
    def __init__(self):
        self.keywords = {
            "accident": ["crash", "accident", "collision", "hit", "car overturned", "vehicle hit"],
            "fire": ["fire", "blaze", "smoke", "explosion", "burning", "building fire"],
            "flood": ["flood", "waterlogging", "inundated", "submerged", "drowning", "river overflow"],
            "medical": ["heart attack", "cardiac", "unconscious", "bleeding", "pregnant", "stroke"],
            "crime": ["robbery", "assault", "gunshot", "theft", "violence", "fight"],
        }

    def process_call_transcript(self, audio_transcript: str, caller_phone: str = "+91 9876543210"):
        """
        Parses an emergency call transcript and converts it into structured incident data.
        """
        text_lower = audio_transcript.lower()

        event_type = "emergency"
        for etype, words in self.keywords.items():
            if any(w in text_lower for w in words):
                event_type = etype
                break

        severity = "high"
        if any(w in text_lower for w in ["head injury", "unconscious", "explosion", "trapped", "critical"]):
            severity = "critical"
        elif any(w in text_lower for w in ["minor", "scratches", "small"]):
            severity = "medium"

        # Extract number of casualties/people
        numbers = re.findall(r"\b(\d+)\b", text_lower)
        casualty_count = int(numbers[0]) if numbers else (2 if severity == "critical" else 1)

        # Extract landmark location hint if mentioned
        landmarks = ["jubilee hills", "banjara hills", "abids", "secunderabad", "hitech city", "gachibowli", "charminar", "somajiguda"]
        location_hint = "Hyderabad Central"
        for lm in landmarks:
            if lm in text_lower:
                location_hint = lm.title()
                break

        return {
            "caller_phone": caller_phone,
            "transcript": audio_transcript,
            "parsed_event": {
                "event_type": event_type,
                "severity": severity,
                "casualties": casualty_count,
                "location_hint": location_hint,
                "is_emergency": True,
            },
            "timestamp": time.time(),
        }

# Quick test
if __name__ == "__main__":
    agent = SpeechAgent()
    res = agent.process_call_transcript("Emergency! There is a major car crash near Jubilee Hills Checkpost. 3 people are injured and trapped in the vehicle!")
    print("Speech Agent Output:", res)
