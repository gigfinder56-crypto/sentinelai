import { useEffect, useMemo, useRef, useState } from "react";
import { useSentinelSocket } from "./hooks/useSentinelSocket";
import MapView from "./components/MapView";
import IncidentPanel from "./components/IncidentPanel";
import ResourceLegend from "./components/ResourceLegend";
import "./App.css";

function App() {
  const { incidents, resources, connected, setResources } = useSentinelSocket();
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
  const [resourceType, setResourceType] = useState("police_station");
  const [resourceId, setResourceId] = useState("P1");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [registration, setRegistration] = useState({
    resource_type: "hospital",
    name: "",
    lat: "17.42",
    lng: "78.47",
    phone: "",
    status: "active",
  });
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [aiLat, setAiLat] = useState("17.42");
  const [aiLng, setAiLng] = useState("78.47");
  const [aiFile, setAiFile] = useState(null);
  const [aiPreview, setAiPreview] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const stats = useMemo(() => {
    const activeIncidents = incidents.filter((incident) => incident.status !== "resolved").length;
    const dispatchCount = incidents.filter((incident) => incident.dispatch?.ai_call_dispatch?.length).length;
    return {
      activeIncidents,
      dispatchCount,
      hospitals: resources?.hospitals?.length || 0,
      policeStations: resources?.police_stations?.length || 0,
      ambulances: resources?.ambulances?.length || 0,
    };
  }, [incidents, resources]);

  const registeredResources = useMemo(() => {
    const groups = [
      { key: "hospitals", label: "Hospitals", items: resources?.hospitals || [] },
      { key: "police_stations", label: "Police stations", items: resources?.police_stations || [] },
      { key: "ambulances", label: "Ambulances", items: resources?.ambulances || [] },
    ];

    return groups.filter((group) => group.items.length > 0);
  }, [resources]);

  const handleContactSubmit = async (event) => {
    event.preventDefault();
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/resources/${resourceType}/${resourceId}/phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const text = await response.text();
      let payload = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = { error: text || "Server returned an empty response" };
      }
      if (payload.ok) {
        setResources(payload.resources);
      }
      setMessage(payload.ok ? `Updated ${resourceId} with ${phone}` : payload.error || "Unable to update resource");
    } catch (error) {
      setMessage(`Update failed: ${error.message}`);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/resources/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registration),
      });
      const text = await response.text();
      let payload = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = { error: text || "Server returned an empty response" };
      }
      if (payload.ok) {
        setResources(payload.resources);
      }
      setMessage(payload.ok ? `Registered ${registration.name}` : payload.error || "Unable to register resource");
    } catch (error) {
      setMessage(`Registration failed: ${error.message}`);
    }
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!uploadFile) {
      setUploadMessage("Choose a JSON resource file first.");
      return;
    }

    const formData = new FormData();
    formData.append("file", uploadFile);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/resources/upload`, {
        method: "POST",
        body: formData,
      });
      const text = await response.text();
      let payload = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = { error: text || "Server returned an empty response" };
      }
      if (payload.ok) {
        setResources(payload.resources);
      }
      setUploadMessage(payload.ok ? `Imported ${payload.count} resource(s).` : payload.error || "Upload failed");
    } catch (error) {
      setUploadMessage(`Upload failed: ${error.message}`);
    }
  };

  const startWebcam = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setAiMessage("This browser does not support webcam access.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraEnabled(true);
      setAiMessage("Webcam ready. Capture a frame to analyze.");
    } catch (error) {
      setAiMessage(`Webcam access was blocked: ${error.message}`);
    }
  };

  const stopWebcam = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraEnabled(false);
  };

  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) {
      setAiMessage("Start the webcam before capturing a frame.");
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) {
        setAiMessage("Could not create a snapshot from the webcam.");
        return;
      }
      const file = new File([blob], `webcam-capture-${Date.now()}.jpg`, { type: "image/jpeg" });
      setAiFile(file);
      setAiPreview(URL.createObjectURL(blob));
      setAiMessage("Snapshot captured. Review it and send it for AI dispatch.");
    }, "image/jpeg");
  };

  const handleAiAnalyze = async (event) => {
    event.preventDefault();
    if (!aiFile) {
      setAiMessage("Choose an image or capture a webcam frame first.");
      return;
    }

    const formData = new FormData();
    formData.append("file", aiFile);
    formData.append("camera_id", `CAM_AI_${Date.now()}`);
    formData.append("lat", aiLat);
    formData.append("lng", aiLng);

    try {
      const response = await fetch(`${API_BASE_URL}/detect`, {
        method: "POST",
        body: formData,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text || response.statusText || "Server returned an error");
      }
      let payload;
      try {
        payload = text ? JSON.parse(text) : {};
      } catch (parseError) {
        throw new Error(`Invalid JSON from server: ${parseError.message}`);
      }
      if (payload.error) {
        setAiMessage(payload.error);
      } else {
        const dispatchCount = payload.dispatch?.ai_call_dispatch?.length || 0;
        const nearest = payload.resources?.nearby_resources || {};
        const policeCount = nearest.police_stations?.length || 0;
        const hospitalCount = nearest.hospitals?.length || 0;
        setAiMessage(`Incident ${payload.incident_id} created. ${dispatchCount} call(s) sent to nearby resources (${hospitalCount} hospitals, ${policeCount} police stations).`);
      }
    } catch (error) {
      setAiMessage(`AI analysis failed: ${error.message}`);
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setAiMessage("Geolocation is not supported by this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setAiLat(position.coords.latitude.toFixed(6));
        setAiLng(position.coords.longitude.toFixed(6));
        setAiMessage("Current location loaded into the form.");
      },
      (error) => setAiMessage(`Could not read location: ${error.message}`)
    );
  };

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (aiPreview) {
        URL.revokeObjectURL(aiPreview);
      }
    };
  }, [aiPreview]);

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">AI-powered emergency coordination</p>
          <h1>Sentinel AI — Live Operations Dashboard</h1>
        </div>
        <span className={`status ${connected ? "online" : "offline"}`}>
          {connected ? "● Connected" : "● Disconnected"}
        </span>
      </header>

      <main className="dashboard-shell">
        <section className="hero-card">
          <div>
            <h2>Incident overview</h2>
            <p>GPS-backed dispatching, nearby resource counts, and automated phone notifications.</p>
          </div>
          <div className="hero-stats">
            <div><strong>{stats.activeIncidents}</strong><span>Active incidents</span></div>
            <div><strong>{stats.dispatchCount}</strong><span>AI dispatches</span></div>
            <div><strong>{stats.hospitals}</strong><span>Hospitals</span></div>
            <div><strong>{stats.policeStations}</strong><span>Police</span></div>
            <div><strong>{stats.ambulances}</strong><span>Ambulances</span></div>
          </div>
        </section>

        <section className="dashboard-grid">
          <div className="map-panel">
            <MapView incidents={incidents} resources={resources} />
          </div>
          <aside className="sidebar">
            <IncidentPanel incidents={incidents} />
            <ResourceLegend resources={resources} />
          </aside>
        </section>

        <section className="operations-card">
          <div className="operations-grid">
            <form onSubmit={handleRegister} className="panel-form">
              <h3>Register new resource</h3>
              <label>
                Resource type
                <select
                  value={registration.resource_type}
                  onChange={(event) => setRegistration({ ...registration, resource_type: event.target.value })}
                >
                  <option value="hospital">Hospital</option>
                  <option value="police_station">Police Station</option>
                  <option value="ambulance">Ambulance</option>
                </select>
              </label>
              <label>
                Name
                <input
                  value={registration.name}
                  onChange={(event) => setRegistration({ ...registration, name: event.target.value })}
                  placeholder="City General Hospital"
                />
              </label>
              <div className="inline-fields">
                <label>
                  Latitude
                  <input
                    type="number"
                    step="0.0001"
                    value={registration.lat}
                    onChange={(event) => setRegistration({ ...registration, lat: event.target.value })}
                  />
                </label>
                <label>
                  Longitude
                  <input
                    type="number"
                    step="0.0001"
                    value={registration.lng}
                    onChange={(event) => setRegistration({ ...registration, lng: event.target.value })}
                  />
                </label>
              </div>
              <label>
                Phone number
                <input
                  value={registration.phone}
                  onChange={(event) => setRegistration({ ...registration, phone: event.target.value })}
                  placeholder="+91..."
                />
              </label>
              <label>
                Status
                <input
                  value={registration.status}
                  onChange={(event) => setRegistration({ ...registration, status: event.target.value })}
                  placeholder="active / available"
                />
              </label>
              <button type="submit">Save resource</button>
            </form>

            <form onSubmit={handleContactSubmit} className="panel-form">
              <h3>Update existing contact</h3>
              <label>
                Resource type
                <select value={resourceType} onChange={(event) => setResourceType(event.target.value)}>
                  <option value="hospital">Hospital</option>
                  <option value="police_station">Police Station</option>
                  <option value="ambulance">Ambulance</option>
                </select>
              </label>
              <label>
                Resource ID
                <input value={resourceId} onChange={(event) => setResourceId(event.target.value)} />
              </label>
              <label>
                Phone number
                <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+91..." />
              </label>
              <button type="submit">Save contact</button>
            </form>

            <form onSubmit={handleUpload} className="panel-form">
              <h3>Upload resource list</h3>
              <p>Upload a JSON file with resources and GPS coordinates.</p>
              <input type="file" accept="application/json" onChange={(event) => setUploadFile(event.target.files?.[0] || null)} />
              <button type="submit">Import file</button>
            </form>
          </div>

          <div className="ai-dispatch-card">
            <h3>AI incident intake</h3>
            <p>Upload a photo or use your webcam to trigger accident detection and notify nearby ambulances/police.</p>
            <form onSubmit={handleAiAnalyze} className="ai-dispatch-form">
              <div className="inline-fields">
                <label>
                  Latitude
                  <input type="number" step="0.000001" value={aiLat} onChange={(event) => setAiLat(event.target.value)} />
                </label>
                <label>
                  Longitude
                  <input type="number" step="0.000001" value={aiLng} onChange={(event) => setAiLng(event.target.value)} />
                </label>
              </div>
              <div className="ai-actions">
                <button type="button" className="secondary-btn" onClick={useCurrentLocation}>Use current location</button>
                <button type="button" className="secondary-btn" onClick={cameraEnabled ? stopWebcam : startWebcam}>
                  {cameraEnabled ? "Stop webcam" : "Allow webcam"}
                </button>
              </div>
              <div className="camera-box">
                <video ref={videoRef} autoPlay muted playsInline />
                <canvas ref={canvasRef} style={{ display: "none" }} />
                <button type="button" className="secondary-btn" onClick={captureFrame}>Capture frame</button>
              </div>
              <label>
                Upload photo
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    if (file) {
                      setAiFile(file);
                      setAiPreview(URL.createObjectURL(file));
                      setAiMessage(`Ready to analyze ${file.name}.`);
                    }
                  }}
                />
              </label>
              {aiPreview ? <img src={aiPreview} alt="Incident preview" className="preview-image" /> : null}
              <button type="submit">Analyze image and dispatch</button>
            </form>
            {aiMessage ? <p className="feedback positive">{aiMessage}</p> : null}
          </div>

          <div className="registered-resources-card">
            <h3>Registered contacts</h3>
            {registeredResources.length > 0 ? (
              registeredResources.map((group) => (
                <div key={group.key} className="resource-group">
                  <h4>{group.label}</h4>
                  <ul>
                    {group.items.map((item) => (
                      <li key={item.id}>
                        <div className="resource-item-main">
                          <strong>{item.name}</strong>
                          <span>{item.id}</span>
                        </div>
                        <span className="resource-phone">{item.phone || "No phone"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <p className="empty-state">No resources registered yet.</p>
            )}
          </div>
          {message ? <p className="feedback positive">{message}</p> : null}
          {uploadMessage ? <p className="feedback positive">{uploadMessage}</p> : null}
        </section>
      </main>
    </div>
  );
}

export default App;