import random
import time

class WeatherAgent:
    """
    Weather Intelligence & Environmental IoT Sensor Agent.
    Monitors city micro-climate, rainfall, flood water sensors, smoke levels, and predicts hazard expansion.
    """
    def __init__(self):
        self.iot_sensors = [
            {"sensor_id": "IOT-FLOOD-01", "location": "Nizam Sagar Drain", "lat": 17.4200, "lng": 78.4600, "water_level_cm": 45, "status": "normal"},
            {"sensor_id": "IOT-SMOKE-04", "location": "Industrial Estate Area", "lat": 17.4400, "lng": 78.4800, "smoke_ppm": 12, "status": "normal"},
            {"sensor_id": "IOT-GRID-09", "location": "Substation 4", "lat": 17.4100, "lng": 78.4400, "grid_voltage_v": 230, "status": "stable"},
        ]

    def get_weather_telemetry(self):
        """Returns live weather intelligence & city environmental metrics."""
        return {
            "temperature_c": 31.5,
            "humidity_pct": 74,
            "rainfall_mm_hr": round(random.uniform(2.0, 14.5), 1),
            "wind_speed_kmh": round(random.uniform(12.0, 28.0), 1),
            "wind_direction": "WSW",
            "flood_risk_level": "MODERATE",
            "fire_risk_level": "LOW",
            "air_quality_index": 68,
            "timestamp": time.time(),
        }

    def get_iot_sensors(self):
        return self.iot_sensors

    def predict_hazard_spread(self, incident_type: str, lat: float, lng: float):
        """
        Calculates hazard spread zones (e.g. fire plume polygon or flood risk radius)
        based on current wind speed and rainfall telemetry.
        """
        if incident_type in ["flood", "rain", "waterlogging"]:
            radius_km = 0.85
            risk_zone = [
                [lat + 0.005, lng + 0.005],
                [lat - 0.005, lng + 0.006],
                [lat - 0.006, lng - 0.005],
                [lat + 0.004, lng - 0.004],
            ]
            return {
                "hazard_type": "flood",
                "risk_radius_km": radius_km,
                "polygon": risk_zone,
                "warning": "Low-lying road submersions expected within 15 minutes.",
            }
        elif incident_type in ["fire", "explosion", "blaze"]:
            radius_km = 0.45
            plume_zone = [
                [lat + 0.003, lng + 0.004],
                [lat + 0.006, lng + 0.008],
                [lat + 0.002, lng + 0.006],
                [lat, lng],
            ]
            return {
                "hazard_type": "fire_smoke",
                "risk_radius_km": radius_km,
                "plume_polygon": plume_zone,
                "warning": "Downwind smoke propagation. Recommend evacuating 500m radius.",
            }

        return None

# Quick test
if __name__ == "__main__":
    w = WeatherAgent()
    print("Telemetry:", w.get_weather_telemetry())
    print("Spread Prediction:", w.predict_hazard_spread("flood", 17.4160, 78.4470))
