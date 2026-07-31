import { useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, Polyline, Polygon } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER = [17.416, 78.4470]; // Hyderabad
const DEFAULT_ZOOM = 12;

function getIncidentColor(incident) {
  if (incident.status === "resolved") return "#64748b";
  const sev = incident.classification?.severity;
  if (sev === "critical" || sev === "high") return "#ef4444";
  if (sev === "medium") return "#f59e0b";
  return "#10b981";
}

export default function DigitalTwinMap({ incidents = [], resources = {}, trafficSignals = [] }) {
  const [showTrafficSignals, setShowTrafficSignals] = useState(true);
  const [showHazardZones, setShowHazardZones] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);

  const hospitals = resources?.hospitals || [];
  const policeStations = resources?.police_stations || [];
  const ambulances = resources?.ambulances || [];
  const fireStations = resources?.fire_stations || [];

  return (
    <div className="digital-twin-map-container" style={{ position: "relative", height: "100%", width: "100%" }}>
      {/* Map Control Bar Overlay */}
      <div className="map-layer-controls">
        <label>
          <input
            type="checkbox"
            checked={showTrafficSignals}
            onChange={(e) => setShowTrafficSignals(e.target.checked)}
          />
          🚦 Traffic Signals & Green Corridors
        </label>
        <label>
          <input
            type="checkbox"
            checked={showHazardZones}
            onChange={(e) => setShowHazardZones(e.target.checked)}
          />
          🌧️ Flood / 🔥 Fire Risk Spread Zones
        </label>
        <label>
          <input
            type="checkbox"
            checked={showRoutes}
            onChange={(e) => setShowRoutes(e.target.checked)}
          />
          🚑 Navigation Route Paths
        </label>
      </div>

      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        style={{ height: "100%", width: "100%", borderRadius: "20px" }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a> Sentinel AI Digital Twin'
        />

        {/* INCIDENTS & HAZARD OVERLAYS */}
        {incidents.map((incident) => {
          const color = getIncidentColor(incident);
          const hasSpread = showHazardZones && incident.hazard_spread;
          const route = showRoutes && incident.route;

          return (
            <div key={incident.incident_id}>
              <CircleMarker
                center={[incident.location.lat, incident.location.lng]}
                radius={12}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.8 }}
              >
                <Popup className="digital-twin-popup">
                  <div className="popup-box">
                    <strong>📍 {incident.incident_id}</strong>
                    <br />
                    <span>Camera: {incident.camera_id}</span>
                    <br />
                    <span>Type: {incident.classification?.event_type || "Incident"}</span>
                    <br />
                    <span>Severity: {incident.classification?.severity?.toUpperCase()}</span>
                    {incident.ocr?.plate_number && (
                      <div className="ocr-popup-tag">
                        🚘 Vehicle Plate: <strong>{incident.ocr.plate_number}</strong>
                      </div>
                    )}
                    {incident.dispatch?.green_corridor_active && (
                      <div className="green-corridor-popup-tag">
                        🟢 GREEN CORRIDOR ACTIVE
                      </div>
                    )}
                  </div>
                </Popup>
              </CircleMarker>

              {/* HAZARD SPREAD ZONE POLYGON */}
              {hasSpread && incident.hazard_spread.polygon && (
                <Polygon
                  positions={incident.hazard_spread.polygon}
                  pathOptions={{
                    color: incident.hazard_spread.hazard_type === "flood" ? "#38bdf8" : "#ef4444",
                    fillColor: incident.hazard_spread.hazard_type === "flood" ? "#0284c7" : "#dc2626",
                    fillOpacity: 0.35,
                    dashArray: "6, 6",
                  }}
                >
                  <Popup>
                    <strong>⚠️ {incident.hazard_spread.hazard_type.toUpperCase()} HAZARD SPREAD ZONE</strong>
                    <br />
                    {incident.hazard_spread.warning}
                  </Popup>
                </Polygon>
              )}

              {/* AMBULANCE ROUTE WAYPOINTS POLYLINE */}
              {route && route.waypoints && (
                <Polyline
                  positions={route.waypoints}
                  pathOptions={{ color: "#10b981", weight: 5, opacity: 0.85, dashArray: "8, 8" }}
                />
              )}
            </div>
          );
        })}

        {/* TRAFFIC SIGNALS & GREEN CORRIDOR JUNCTIONS */}
        {showTrafficSignals &&
          trafficSignals.map((sig) => (
            <CircleMarker
              key={sig.id}
              center={[sig.lat, sig.lng]}
              radius={8}
              pathOptions={{
                color: sig.status === "GREEN" ? "#10b981" : "#ef4444",
                fillColor: sig.status === "GREEN" ? "#34d399" : "#f87171",
                fillOpacity: 0.9,
              }}
            >
              <Popup>
                <strong>🚦 {sig.name}</strong> ({sig.id})
                <br />
                Status: <strong style={{ color: sig.status === "GREEN" ? "#34d399" : "#f87171" }}>{sig.status}</strong>
                <br />
                {sig.green_corridor ? "🟢 Green Corridor Preempted" : "Normal Operation"}
              </Popup>
            </CircleMarker>
          ))}

        {/* HOSPITALS */}
        {hospitals.map((h) => (
          <Marker key={h.id} position={[h.lat, h.lng]}>
            <Popup>
              <strong>🏥 {h.name}</strong>
              <br />
              📞 {h.phone || "No phone"}
            </Popup>
          </Marker>
        ))}

        {/* POLICE STATIONS */}
        {policeStations.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]}>
            <Popup>
              <strong>🚓 {p.name}</strong>
              <br />
              📞 {p.phone || "No phone"}
            </Popup>
          </Marker>
        ))}

        {/* FIRE STATIONS */}
        {fireStations.map((f) => (
          <Marker key={f.id} position={[f.lat, f.lng]}>
            <Popup>
              <strong>🚒 {f.name}</strong>
              <br />
              📞 {f.phone || "No phone"}
            </Popup>
          </Marker>
        ))}

        {/* AMBULANCES */}
        {ambulances.map((a) => (
          <Marker key={a.id} position={[a.lat, a.lng]}>
            <Popup>
              <strong>🚑 {a.name}</strong>
              <br />
              Status: {a.status}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
