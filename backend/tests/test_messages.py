from app.agents.coordinator_agent import CoordinatorAgent

def test_message_generation():
    coordinator = CoordinatorAgent()
    
    # Test manual message
    manual_entry = coordinator.send_manual_message("+919876543210", "Test Emergency Alert", recipient_name="City Hospital")
    assert manual_entry["id"].startswith("MSG-")
    assert manual_entry["message_body"] == "Test Emergency Alert"
    assert manual_entry["phone"] == "+919876543210"
    
    # Test emergency dispatch message generation
    emergency_detections = [
        {"class_name": "car", "confidence": 0.9, "box": [100, 100, 400, 400]},
        {"class_name": "car", "confidence": 0.88, "box": [110, 105, 410, 405]},
        {"class_name": "truck", "confidence": 0.8, "box": [95, 95, 420, 420]},
    ]
    incident = coordinator.process_incident(
        detections=emergency_detections,
        camera_id="CAM_TEST",
        camera_lat=17.4160,
        camera_lng=78.4470,
    )
    
    assert incident["status"] == "dispatched"
    notifications = incident["dispatch"]["notifications"]
    assert len(notifications) > 0
    
    first_msg = notifications[0]
    assert "message_body" in first_msg
    assert "call_script" in first_msg
    assert "formatted_time" in first_msg
    assert "🚨 Sentinel AI Emergency Alert" in first_msg["message_body"]
    
    all_msgs = coordinator.get_all_messages()
    assert len(all_msgs) >= 2
    print("ALL TESTS PASSED SUCCESSFULLY! Message count:", len(all_msgs))

if __name__ == "__main__":
    test_message_generation()
