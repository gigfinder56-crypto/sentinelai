import { useState } from "react";

export default function TrafficControlPanel({ trafficSignals = [], onToggleSignal }) {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
  const [togglingId, setTogglingId] = useState(null);

  const handleToggle = async (signalId) => {
    setTogglingId(signalId);
    try {
      const res = await fetch(`${API_BASE_URL}/api/traffic_signals/${signalId}/toggle`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && onToggleSignal) {
        onToggleSignal(data);
      }
    } catch (err) {
      console.error("Failed to toggle signal:", err);
    } finally {
      setTogglingId(null);
    }
  };

  const greenCount = trafficSignals.filter((s) => s.status === "GREEN").length;
  const preemptedCount = trafficSignals.filter((s) => s.green_corridor).length;

  return (
    <div className="traffic-control-panel">
      <div className="traffic-header">
        <div>
          <h2>🚦 Smart Traffic Signal & Green Corridor Control</h2>
          <p>Autonomous AI signal preemption clears traffic junctions for oncoming ambulances.</p>
        </div>
        <div className="traffic-stats-badges">
          <span className="badge green-badge">🟢 Green Signals: {greenCount}</span>
          <span className="badge corridor-badge">⚡ Active Corridors: {preemptedCount}</span>
        </div>
      </div>

      <div className="signals-grid">
        {trafficSignals.map((sig) => (
          <div key={sig.id} className={`signal-card ${sig.status.toLowerCase()}`}>
            <div className="signal-card-header">
              <strong>{sig.name}</strong>
              <span className="sig-id">{sig.id}</span>
            </div>

            <div className="signal-status-row">
              <div className={`signal-light ${sig.status.toLowerCase()}`}>
                {sig.status === "GREEN" ? "🟢" : "🔴"} {sig.status}
              </div>
              {sig.green_corridor && (
                <span className="green-corridor-tag">⚡ GREEN CORRIDOR ACTIVE</span>
              )}
            </div>

            <button
              className="toggle-signal-btn"
              onClick={() => handleToggle(sig.id)}
              disabled={togglingId === sig.id}
            >
              {togglingId === sig.id ? "Switching..." : sig.status === "GREEN" ? "🔴 Set RED Signal" : "🟢 Preempt GREEN Corridor"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
