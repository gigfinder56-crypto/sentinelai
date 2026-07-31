from ultralytics import YOLO
import cv2
import os

# YOLOv8n (nano) - smallest/fastest model, good for hackathon demo
# This will auto-download (~6MB) the first time you run it
MODEL_PATH = "yolov8n.pt"


class VisionAgent:
    def __init__(self):
        print("Loading YOLO model...")
        self.model = YOLO(MODEL_PATH)
        print("YOLO model loaded.")

    def detect_frame(self, frame):
        """
        Run detection on a single frame (numpy array, from cv2).
        Returns a list of detections: [{class_name, confidence, box}, ...]
        """
        results = self.model(frame, verbose=False)[0]
        detections = []

        for box in results.boxes:
            class_id = int(box.cls[0])
            class_name = self.model.names[class_id]
            confidence = float(box.conf[0])
            xyxy = box.xyxy[0].tolist()  # [x1, y1, x2, y2]

            detections.append({
                "class_name": class_name,
                "confidence": round(confidence, 3),
                "box": [round(c, 1) for c in xyxy],
            })

        return detections

    def detect_image(self, image_path):
        """Run detection on a single image file."""
        frame = cv2.imread(image_path)
        if frame is None:
            raise ValueError(f"Could not read image at {image_path}")
        return self.detect_frame(frame)

    def detect_video_sample(self, video_path, sample_every_n_frames=30):
        """
        Run detection on a video, sampling every N frames
        (for demo purposes, we don't need every single frame).
        Returns a list of {frame_number, timestamp_sec, detections}.
        """
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Could not open video at {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        frame_number = 0
        results = []

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_number % sample_every_n_frames == 0:
                detections = self.detect_frame(frame)
                results.append({
                    "frame_number": frame_number,
                    "timestamp_sec": round(frame_number / fps, 2),
                    "detections": detections,
                })

            frame_number += 1

        cap.release()
        return results


# Quick manual test
if __name__ == "__main__":
    agent = VisionAgent()

    # Test on a sample image - put any .jpg with cars/people in backend/ folder
    test_image = "test.jpg"
    if os.path.exists(test_image):
        detections = agent.detect_image(test_image)
        print(f"Detections in {test_image}:")
        for d in detections:
            print(f"  {d['class_name']} ({d['confidence']}) at {d['box']}")
    else:
        print(f"No test image found at '{test_image}'.")
        print("Download any street/traffic photo, save it as 'test.jpg' in the backend/ folder, and re-run this script.")