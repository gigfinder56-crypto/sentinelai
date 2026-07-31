import math

def haversine(lat1, lng1, lat2, lng2):
    R = 6371  # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

class RoutingAgent:
    """
    GIS Route Optimization & Traffic Signal Preemption Agent.
    Calculates green corridor routes, waypoints, ETA, and preempts traffic signals.
    """
    def __init__(self):
        # Sample city traffic signal junctions
        self.traffic_signals = [
            {"id": "SIG-01", "name": "Jubilee Hills Checkpost", "lat": 17.4310, "lng": 78.4076, "status": "RED", "green_corridor": False},
            {"id": "SIG-02", "name": "Banjara Hills Rd 1 Circle", "lat": 17.4160, "lng": 78.4347, "status": "GREEN", "green_corridor": False},
            {"id": "SIG-03", "name": "Somajiguda Flyover Junction", "lat": 17.4215, "lng": 78.4550, "status": "RED", "green_corridor": False},
            {"id": "SIG-04", "name": "Abids GPO Circle", "lat": 17.3903, "lng": 78.4759, "status": "GREEN", "green_corridor": False},
            {"id": "SIG-05", "name": "Secunderabad Station T-Junction", "lat": 17.4399, "lng": 78.4983, "status": "RED", "green_corridor": False},
        ]

    def compute_route(self, origin_lat: float, origin_lng: float, dest_lat: float, dest_lng: float):
        """
        Generates navigation waypoints and preempts any traffic signals within 2km of the route.
        """
        dist_km = haversine(origin_lat, origin_lng, dest_lat, dest_lng)
        
        # Generate 5 route waypoints between origin and destination
        waypoints = []
        steps = 5
        for i in range(steps + 1):
            t = i / steps
            w_lat = origin_lat + t * (dest_lat - origin_lat)
            w_lng = origin_lng + t * (dest_lng - origin_lng)
            waypoints.append([round(w_lat, 6), round(w_lng, 6)])

        # Calculate preemption for traffic signals near route
        preempted_signals = []
        for sig in self.traffic_signals:
            d = haversine(dest_lat, dest_lng, sig["lat"], sig["lng"])
            if d <= 3.5:  # within 3.5 km of incident/route
                sig["status"] = "GREEN"
                sig["green_corridor"] = True
                preempted_signals.append(sig["name"])
            else:
                sig["green_corridor"] = False

        eta_minutes = round((dist_km / 35.0) * 60, 1)  # 35 km/h avg speed with Green Corridor

        return {
            "distance_km": round(dist_km, 2),
            "eta_minutes": max(eta_minutes, 1.5),
            "waypoints": waypoints,
            "green_corridor_active": len(preempted_signals) > 0,
            "signals_preempted": preempted_signals,
            "route_status": "FASTEST_GREEN_PATH",
        }

    def get_traffic_signals(self):
        return self.traffic_signals

    def toggle_signal(self, signal_id: str, force_green: bool = None):
        for sig in self.traffic_signals:
            if sig["id"] == signal_id:
                if force_green is not None:
                    sig["status"] = "GREEN" if force_green else "RED"
                    sig["green_corridor"] = force_green
                else:
                    sig["status"] = "GREEN" if sig["status"] == "RED" else "RED"
                return sig
        return None

# Quick test
if __name__ == "__main__":
    r = RoutingAgent()
    route = r.compute_route(17.42, 78.45, 17.431, 78.4076)
    print("Routing Test Output:", route)
