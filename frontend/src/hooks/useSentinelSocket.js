import { useEffect, useRef, useState, useCallback } from "react";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:5173/ws";

export function useSentinelSocket() {
  const [incidents, setIncidents] = useState([]);
  const [resources, setResources] = useState({
    hospitals: [],
    police_stations: [],
    ambulances: [],
  });
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const connectRef = useRef(null);

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL);
    socketRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log("[Sentinel] WebSocket connected");
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case "initial_state":
            setIncidents(message.data.incidents || []);
            setResources(message.data.resources || {
              hospitals: [],
              police_stations: [],
              ambulances: [],
            });
            break;

          case "incident_update": {
            const incident = message.data;
            setIncidents((prev) => {
              const exists = prev.some((i) => i.incident_id === incident.incident_id);
              return exists
                ? prev.map((i) => (i.incident_id === incident.incident_id ? incident : i))
                : [...prev, incident];
            });
            break;
          }

          case "incident_resolved": {
            const incident = message.data;
            setIncidents((prev) =>
              prev.map((i) => (i.incident_id === incident.incident_id ? incident : i))
            );
            break;
          }

          case "resource_update": {
            setResources(message.data.resources || {
              hospitals: [],
              police_stations: [],
              ambulances: [],
            });
            break;
          }

          default:
            console.warn("[Sentinel] Unknown message type:", message.type);
        }
      } catch (err) {
        console.error("[Sentinel] Failed to parse WS message:", err);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      console.log("[Sentinel] WebSocket disconnected, retrying in 3s...");
      reconnectTimeoutRef.current = setTimeout(() => connectRef.current?.(), 3000);
    };

    ws.onerror = (err) => {
      console.error("[Sentinel] WebSocket error:", err);
      ws.close();
    };
  }, []);

  useEffect(() => {
    // keep a ref to the latest connect so handlers can call it without
    // causing "accessed before declared" lint issues
    connectRef.current = connect;
    connect();
    return () => {
      clearTimeout(reconnectTimeoutRef.current);
      socketRef.current?.close();
    };
  }, [connect]);

  return { incidents, resources, connected, setResources };
}