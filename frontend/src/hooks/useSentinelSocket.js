import { useEffect, useRef, useState, useCallback } from "react";

const DEFAULT_WS_URL = import.meta.env.VITE_WS_URL || "ws://127.0.0.1:8000/ws";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

export function useSentinelSocket() {
  const [incidents, setIncidents] = useState([]);
  const [messages, setMessages] = useState([]);
  const [resources, setResources] = useState({
    hospitals: [],
    police_stations: [],
    fire_stations: [],
    ambulances: [],
  });
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

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

      let backendAlive = false;

      if (resourcesResponse.ok) {
        backendAlive = true;
        const resourcesData = await resourcesResponse.json();
        setResources(resourcesData || {
          hospitals: [],
          police_stations: [],
          fire_stations: [],
          ambulances: [],
        });
      }

      if (incidentsResponse.ok) {
        backendAlive = true;
        const incidentData = await incidentsResponse.json();
        setIncidents(Array.isArray(incidentData) ? incidentData : []);
      }

      if (messagesResponse.ok) {
        backendAlive = true;
        const msgData = await messagesResponse.json();
        setMessages(Array.isArray(msgData) ? msgData : []);
      }

      if (backendAlive) {
        setConnected(true);
      }
    } catch (error) {
      console.error("[Sentinel] Failed to load REST state:", error);
      setConnected(false);
    }
  }, []);

  const connect = useCallback(() => {
    try {
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
                fire_stations: [],
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
                fire_stations: [],
                ambulances: [],
              });
              break;
            }

            default:
              break;
          }
        } catch (err) {
          console.error("[Sentinel] Failed to parse WS message:", err);
        }
      };

      ws.onclose = () => {
        console.log("[Sentinel] WebSocket disconnected. Running REST sync fallback.");
        loadInitialState();
        reconnectTimeoutRef.current = setTimeout(() => connect(), 5000);
      };

      ws.onerror = () => {
        loadInitialState();
        try { ws.close(); } catch (e) {}
      };
    } catch (e) {
      loadInitialState();
    }
  }, [loadInitialState]);

  useEffect(() => {
    // Immediate initial fetch via HTTP REST so UI connects instantly
    loadInitialState();

    // Start WebSocket connection
    connect();

    // REST Polling fallback interval every 3 seconds to keep data live regardless of WebSocket support
    pollIntervalRef.current = setInterval(() => {
      loadInitialState();
    }, 3000);

    return () => {
      clearInterval(pollIntervalRef.current);
      clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) {
        try { socketRef.current.close(); } catch (e) {}
      }
    };
  }, [connect, loadInitialState]);

  return { incidents, resources, messages, connected, setResources, setMessages };
}