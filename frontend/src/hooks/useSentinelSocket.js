import { useEffect, useRef, useState, useCallback } from "react";

const DEFAULT_WS_URL = import.meta.env.VITE_WS_URL || "ws://127.0.0.1:8000/ws";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

export function useSentinelSocket() {
  const [incidents, setIncidents] = useState([]);
  const [messages, setMessages] = useState([]);
  const [resources, setResources] = useState({
    hospitals: [],
    police_stations: [],
    ambulances: [],
  });
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const connectRef = useRef(null);

  const buildWebSocketUrl = () => {
    if (DEFAULT_WS_URL) {
      return DEFAULT_WS_URL;
    }
    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${scheme}//${window.location.host}/ws`;
  };

  const loadInitialState = useCallback(async () => {
    try {
      const [incidentsResponse, resourcesResponse, messagesResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/incidents`),
        fetch(`${API_BASE_URL}/resources`),
        fetch(`${API_BASE_URL}/api/messages`),
      ]);

      if (incidentsResponse.ok) {
        const incidentData = await incidentsResponse.json();
        setIncidents(Array.isArray(incidentData) ? incidentData : []);
      }

      if (resourcesResponse.ok) {
        const resourcesData = await resourcesResponse.json();
        setResources(resourcesData || {
          hospitals: [],
          police_stations: [],
          ambulances: [],
        });
      }

      if (messagesResponse.ok) {
        const msgData = await messagesResponse.json();
        setMessages(Array.isArray(msgData) ? msgData : []);
      }
    } catch (error) {
      console.error("[Sentinel] Failed to load initial state:", error);
    }
  }, []);

  const connect = useCallback(() => {
    const ws = new WebSocket(buildWebSocketUrl());
    socketRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log("[Sentinel] WebSocket connected");
      loadInitialState();
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case "initial_state":
            setIncidents(message.data.incidents || []);
            setMessages(message.data.messages || []);
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

          case "message_sent": {
            const msg = message.data;
            if (msg) {
              setMessages((prev) => {
                const exists = prev.some((m) => m.id === msg.id);
                return exists ? prev : [msg, ...prev];
              });
            }
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

  return { incidents, resources, messages, connected, setResources, setMessages };
}