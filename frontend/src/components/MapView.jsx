import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER = [17.385, 78.4867]; // Hyderabad
const DEFAULT_ZOOM = 12;

function severityColor(incident) {
  if (incident.status === "resolved") return "#888";
  if (incident.status === "dispatched") return "#e53935";
  if (incident.status === "monitoring") return "#fdd835";
  return "#43a047";
}

export default function MapView({ incidents = [], resources }) {
  const hospitals = resources?.hospitals || [];
  const policeStations = resources?.police_stations || [];
  const ambulances = resources?.ambulances || [];

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
      />

      {incidents.map((incident) => (
        <CircleMarker
          key={incident.incident_id}
          center={[incident.location.lat, incident.location.lng]}
          radius={10}
          pathOptions={{ color: severityColor(incident), fillOpacity: 0.7 }}
        >
          <Popup>
            <strong>{incident.incident_id}</strong>
            <br />
            Camera: {incident.camera_id}
            <br />
            Status: {incident.status}
            <br />
            {incident.classification?.is_emergency ? "🚨 Emergency" : "Monitoring"}
          </Popup>
        </CircleMarker>
      ))}

      {hospitals.map((h) => (
        <Marker key={h.id} position={[h.lat, h.lng]}>
          <Popup>
            <strong>🏥 {h.name}</strong>
            <br />
            {h.phone ? `📞 ${h.phone}` : "No phone"}
          </Popup>
        </Marker>
      ))}

      {policeStations.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]}>
          <Popup>
            <strong>🚓 {p.name}</strong>
            <br />
            {p.phone ? `📞 ${p.phone}` : "No phone"}
          </Popup>
        </Marker>
      ))}

      {ambulances.map((a) => (
        <Marker key={a.id} position={[a.lat, a.lng]}>
          <Popup>
            <strong>🚑 {a.name}</strong>
            <br />
            Status: {a.status}
            <br />
            {a.phone ? `📞 ${a.phone}` : "No phone"}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}