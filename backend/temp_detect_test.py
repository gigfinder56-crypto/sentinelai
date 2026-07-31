from fastapi.testclient import TestClient
from app.main import app
import os
path = "app/app/sample_feeds/CAM_JUBILEE/accident.jpg"
print("exists", os.path.exists(path))
client = TestClient(app)
with open(path, 'rb') as f:
    files = {"file": ("accident.jpg", f, "image/jpeg")}
    data = {"camera_id": "TEST_CAM", "lat": "17.42", "lng": "78.47"}
    r = client.post("/detect", files=files, data=data)
    print("status", r.status_code)
    print(r.text)
