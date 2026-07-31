import { useState } from "react";

export default function IncidentPanel({ incidents = [], onResolveIncident }) {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
  const [resolvingId, setResolvingId] = useState(null);

  const handleResolve = async (incidentId) => {
    setResolvingId(incidentId);
    try {
      const response = await fetch(`${API_BASE_URL}/incidents/${incidentId}/resolve`, {
        method: "POST",
      });
      if (response.ok) {
        if (onResolveIncident) onResolveIncident(incidentId);
      }
    } catch (err) {
      console.error("Failed to resolve incident:", err);
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="incident-panel">
      <div className="panel-header">
        <h2>Active Incidents ({incidents.length})</h2>
      </div>

      {incidents.length === 0 ? (
        <p className="empty-state">No incidents active at this time.</p>
      ) : (
        <ul className="incident-card-list">
          {incidents.map((i) => {
            const isResolved = i.status === "resolved";
            const severity = i.classification?.severity || "medium";
            const eventType = i.classification?.event_type || "Incident";

            return (
              <li key={i.incident_id} className={`incident-item-card ${isResolved ? "resolved" : severity}`}>
                <div className="incident-header-row">
                  <div className="incident-title">
                    <strong>{i.incident_id}</strong>
                    <span className="camera-badge">📷 {i.camera_id}</span>
                  </div>
                  <span className={`status-pill ${i.status}`}>{i.status.toUpperCase()}</span>
                </div>

                <div className="incident-meta-row">
                  <span className="event-type-badge">{eventType}</span>
                  <span className={`severity-badge ${severity}`}>Severity: {severity.toUpperCase()}</span>
                </div>

                {i.resources?.nearby_counts && (
                  <div className="nearby-summary">
                    <span>🏥 {i.resources.nearby_counts.hospitals} hospitals</span>
                    <span>🚓 {i.resources.nearby_counts.police_stations} police</span>
                    <span>🚑 {i.resources.nearby_counts.ambulances} ambulances</span>
                  </div>
                )}

                {i.dispatch?.ambulance_dispatched && (
                  <div className="ambulance-dispatch-banner">
                    🚨 <strong>Ambulance En Route:</strong> {i.dispatch.ambulance_dispatched.name}
                    <span className="eta-tag">ETA: ~{i.dispatch.ambulance_dispatched.eta_minutes} mins</span>
                  </div>
                )}

                {i.dispatch?.notifications?.length > 0 && (
                  <div className="notifications-snippet">
                    <small>Dispatched Messages ({i.dispatch.notifications.length}):</small>
                    <ul className="snippet-list">
                      {i.dispatch.notifications.map((n, idx) => (
                        <li key={idx}>
                          <strong>{n.name}</strong> ({n.phone})
                          {n.message_body && <div className="msg-preview">"{n.message_body}"</div>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {!isResolved && (
                  <button
                    className="resolve-btn"
                    onClick={() => handleResolve(i.incident_id)}
                    disabled={resolvingId === i.incident_id}
                  >
                    {resolvingId === i.incident_id ? "Resolving..." : "✓ Mark Resolved"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}