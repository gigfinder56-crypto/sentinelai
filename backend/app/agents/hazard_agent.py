try:
    import cv2
    import numpy as np
except ImportError:
    cv2 = None
    np = None


def detect_fire(frame):
    """Heuristic: look for a large region of fire-like orange/red/yellow coloring."""
    if frame is None or cv2 is None or np is None:
        return False, 0.0
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    lower = np.array([0, 120, 180])
    upper = np.array([35, 255, 255])
    mask = cv2.inRange(hsv, lower, upper)
    ratio = float(np.sum(mask > 0)) / mask.size
    return ratio > 0.12, round(ratio, 3)


def detect_flood(frame):
    """Heuristic: look for a large area of standing water in the lower half of frame."""
    if frame is None or cv2 is None or np is None:
        return False, 0.0
    height = frame.shape[0]
    lower_half = frame[int(height * 0.55):, :]
    hsv = cv2.cvtColor(lower_half, cv2.COLOR_BGR2HSV)
    lower = np.array([80, 40, 40])
    upper = np.array([130, 255, 255])
    mask = cv2.inRange(hsv, lower, upper)
    ratio = float(np.sum(mask > 0)) / mask.size
    return ratio > 0.35, round(ratio, 3)