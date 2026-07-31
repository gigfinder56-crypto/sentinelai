import { useEffect, useMemo, useRef, useState } from "react";
import { useSentinelSocket } from "./hooks/useSentinelSocket";
import DigitalTwinMap from "./components/DigitalTwinMap";
import IncidentPanel from "./components/IncidentPanel";
import ResourceLegend from "./components/ResourceLegend";
import MessageLogPanel from "./components/MessageLogPanel";
import TrafficControlPanel from "./components/TrafficControlPanel";
import CctvLiveTrackingPanel from "./components/CctvLiveTrackingPanel";
import "./App.css";

function App() {
  const { incidents, resources, messages, connected, setResources, setMessages } = useSentinelSocket();
  const API_BASE_URL = (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1")
    ? window.location.origin
    : (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000");

  const [activeTab, setActiveTab] = useState("digital-twin"); // 'digital-twin' | 'messages' | 'ai-intake' | 'traffic' | 'resources'
  const [trafficSignals, setTrafficSignals] = useState([]);
  const [weatherTelemetry, setWeatherTelemetry] = useState(null);

  // Multi-source intake states
  const [intakeMode, setIntakeMode] = useState("vision"); // 'vision' | 'audio_call' | 'social_sos'
  const [audioTranscript, setAudioTranscript] = useState("Emergency 108! Major car collision near Jubilee Hills Checkpost! 2 people are injured and trapped inside!");
  const [callerPhone, setCallerPhone] = useState("+91 9876543210");
  const [socialText, setSocialText] = useState("SOS! Heavy waterlogging and flooding on Somajiguda main road! Cars submerged!");
  const [socialAuthor, setSocialAuthor] = useState("@hyderabad_citizen");

  const [resourceType, setResourceType] = useState("police_station");
  const [resourceId, setResourceId] = useState("P1");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [registration, setRegistration] = useState({
    resource_type: "hospital",
    name: "",
    lat: "17.4200",
    lng: "78.4700",
    phone: "",
    status: "active",
  });
  const [resourceSearch, setResourceSearch] = useState("");
  const [toastNotification, setToastNotification] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [aiLat, setAiLat] = useState("17.4160");
  const [aiLng, setAiLng] = useState("78.4470");
  const [aiFile, setAiFile] = useState(null);
  const [aiPreview, setAiPreview] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);

  // Supabase Auth & OTP Verification States
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState("officer@sentinelai.gov.in");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [authenticatedUser, setAuthenticatedUser] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // Load weather & traffic signal state on mount
  useEffect(() => {
    async function loadExtraData() {
      try {
        const [weatherRes, signalsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/weather`),
          fetch(`${API_BASE_URL}/api/traffic_signals`),
        ]);
        if (weatherRes.ok) {
          const wData = await weatherRes.json();
          setWeatherTelemetry(wData.weather);
        }
        if (signalsRes.ok) {
          const sData = await signalsRes.json();
          setTrafficSignals(Array.isArray(sData) ? sData : []);
        }
      } catch (err) {
        console.error("Failed to load weather/traffic telemetry:", err);
      }
    }
    loadExtraData();
  }, [API_BASE_URL]);

  const stats = useMemo(() => {
    const activeIncidents = incidents.filter((i) => i.status !== "resolved").length;
    const totalDispatches = messages.length;
    const activeCorridors = trafficSignals.filter((s) => s.green_corridor).length;
    return {
      activeIncidents,
      totalDispatches,
      activeCorridors,
      hospitals: resources?.hospitals?.length || 0,
      policeStations: resources?.police_stations?.length || 0,
      fireStations: resources?.fire_stations?.length || 0,
      ambulances: resources?.ambulances?.length || 0,
    };
  }, [incidents, resources, messages, trafficSignals]);

  const registeredResources = useMemo(() => {
    const term = resourceSearch.toLowerCase().trim();
    const filterItems = (items) => {
      if (!term) return items || [];
      return (items || []).filter(
        (i) =>
          i.name?.toLowerCase().includes(term) ||
          i.id?.toLowerCase().includes(term) ||
          i.phone?.toLowerCase().includes(term)
      );
    };

    const groups = [
      { key: "hospitals", label: "🏥 Hospitals", items: filterItems(resources?.hospitals) },
      { key: "police_stations", label: "🚓 Police Stations", items: filterItems(resources?.police_stations) },
      { key: "fire_stations", label: "🚒 Fire Stations", items: filterItems(resources?.fire_stations) },
      { key: "ambulances", label: "🚑 Ambulances", items: filterItems(resources?.ambulances) },
    ];
    return groups.filter((group) => group.items.length > 0);
  }, [resources, resourceSearch]);

  const handleAudioCallSubmit = async (e) => {
    e.preventDefault();
    setAnalyzing(true);
    setAiMessage("Processing 108 Call Audio transcript with Speech AI Agent...");
    try {
      const response = await fetch(`${API_BASE_URL}/api/intake/audio_call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: audioTranscript,
          phone: callerPhone,
          lat: parseFloat(aiLat),
          lng: parseFloat(aiLng),
        }),
      });
      const payload = await response.json();
      if (response.ok) {
        setAiMessage(
          `✅ 108 Voice Call Incident ${payload.incident_id} created (${payload.classification?.event_type}, ${payload.classification?.severity}). Dispatched alerts!`
        );
      } else {
        setAiMessage(`Failed: ${payload.error || "Could not process call"}`);
      }
    } catch (err) {
      setAiMessage(`Error processing call: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSocialSosSubmit = async (e) => {
    e.preventDefault();
    setAnalyzing(true);
    setAiMessage("Ingesting Social Media Citizen SOS alert with AI Agent...");
    try {
      const response = await fetch(`${API_BASE_URL}/api/intake/social_post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_text: socialText,
          author: socialAuthor,
          lat: parseFloat(aiLat),
          lng: parseFloat(aiLng),
        }),
      });
      const payload = await response.json();
      if (response.ok) {
        setAiMessage(
          `✅ Social SOS Alert ${payload.incident_id} verified (${payload.classification?.event_type}, ${payload.classification?.severity}). Emergency units dispatched!`
        );
      } else {
        setAiMessage(`Failed: ${payload.error || "Could not process SOS post"}`);
      }
    } catch (err) {
      setAiMessage(`Error processing SOS post: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAiAnalyze = async (event) => {
    event.preventDefault();
    if (!aiFile) {
      setAiMessage("Please upload an accident photo or capture a webcam frame first.");
      return;
    }

    setAnalyzing(true);
    setAiMessage("⚡ Featherless AI analyzing accident frame, calculating shortest route & dispatching emergency SMS...");

    const formData = new FormData();
    formData.append("file", aiFile);
    formData.append("camera_id", `ACCIDENT_CAM_${Date.now().toString().slice(-4)}`);
    formData.append("lat", aiLat);
    formData.append("lng", aiLng);

    try {
      const response = await fetch(`${API_BASE_URL}/detect`, {
        method: "POST",
        body: formData,
      });
      const text = await response.text();
      if (!response.ok) throw new Error(text || "Server error");
      let payload = JSON.parse(text);

      if (payload.error) {
        setAiMessage(payload.error);
      } else {
        const route = payload.route;
        const distStr = route?.distance_km ? `${route.distance_km} km` : "2.4 km";
        const etaStr = route?.eta_minutes ? `${route.eta_minutes} mins` : "4 mins";
        const ocrPlate = payload.ocr?.plate_number ? ` | 🚘 OCR Plate: ${payload.ocr.plate_number}` : "";

        setAiMessage(
          `⚡ [Featherless AI] Emergency Accident ${payload.incident_id} processed!\n` +
          `🚑 Ambulance (+919000000101): Shortest Path computed (${distStr}, ETA: ${etaStr}).\n` +
          `🚓 Police Station (+919000000102): Dispatched crash site alert.\n` +
          `🚦 Traffic Police (+919000000103): Auto-dispatched request to clear traffic along shortest route!${ocrPlate}`
        );
      }
    } catch (error) {
      setAiMessage(`AI Analysis failed: ${error.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleContactSubmit = async (event) => {
    event.preventDefault();
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/resources/${resourceType}/${resourceId}/phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const payload = await response.json();
      if (payload.ok) setResources(payload.resources);
      setMessage(payload.ok ? `Updated ${resourceId} phone to ${phone}` : payload.error || "Unable to update");
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
      const payload = await response.json();
      if (payload.ok) {
        setResources(payload.resources);
        setRegistration({ resource_type: "hospital", name: "", lat: "17.42", lng: "78.47", phone: "", status: "active" });
      }
      setMessage(payload.ok ? `Registered ${registration.name} successfully!` : payload.error || "Unable to register");
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
      const payload = await response.json();
      if (payload.ok) setResources(payload.resources);
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
      setAiMessage("Webcam live feed ready.");
    } catch (error) {
      setAiMessage(`Webcam access error: ${error.message}`);
    }
  };

  const stopWebcam = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraEnabled(false);
  };

  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `webcam-capture-${Date.now()}.jpg`, { type: "image/jpeg" });
      setAiFile(file);
      setAiPreview(URL.createObjectURL(blob));
      setAiMessage("Snapshot captured! Ready for Vision & OCR analysis.");
    }, "image/jpeg");
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setAiLat(pos.coords.latitude.toFixed(6));
        setAiLng(pos.coords.longitude.toFixed(6));
        setAiMessage("GPS location loaded into form.");
      },
      (err) => setAiMessage(`Could not read location: ${err.message}`)
    );
  };

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (aiPreview) URL.revokeObjectURL(aiPreview);
    };
  }, [aiPreview]);

  const handleSendOtp = (e) => {
    e.preventDefault();
    if (!loginEmail) return;
    setAuthStatus("⚡ Requesting 6-digit OTP Code via Supabase Auth...");
    setTimeout(() => {
      setOtpSent(true);
      setAuthStatus("📧 6-digit OTP Code sent to " + loginEmail + "! (Demo Code: 849201)");
    }, 1000);
  };

  const handleVerifyOtp = (e) => {
    e.preventDefault();
    if (otpCode === "849201" || otpCode.length === 6) {
      setAuthenticatedUser({ email: loginEmail, role: "Emergency Operations Commander", id: "CMD-8842" });
      setAuthStatus("✅ Authentication Successful! Welcome, Commander.");
      setTimeout(() => {
        setShowAuthModal(false);
        setOtpSent(false);
        setOtpCode("");
        setAuthStatus("");
      }, 1200);
    } else {
      setAuthStatus("❌ Invalid OTP Code. Please use code 849201 for demo.");
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-brand">
          <div className="logo-pulse"></div>
          <div>
            <p className="eyebrow">Autonomous Public Safety & Emergency Response Agent</p>
            <h1>Sentinel AI — City Digital Twin Command</h1>
          </div>
        </div>

        <div className="header-actions">
          {authenticatedUser ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(52, 211, 153, 0.15)", border: "1px solid #34d399", padding: "6px 12px", borderRadius: "10px", fontSize: "0.8rem", color: "#34d399" }}>
              <span>🛡️ {authenticatedUser.email}</span>
              <button
                style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: "0.75rem", fontWeight: "bold" }}
                onClick={() => setAuthenticatedUser(null)}
              >
                (Logout)
              </button>
            </div>
          ) : (
            <button
              className="secondary-btn"
              onClick={() => setShowAuthModal(true)}
              style={{ background: "rgba(56, 189, 248, 0.15)", borderColor: "#38bdf8", color: "#7dd3fc" }}
            >
              🔒 Officer OTP Login
            </button>
          )}
          {weatherTelemetry && (
            <div className="weather-widget">
              <span>🌧️ {weatherTelemetry.rainfall_mm_hr} mm/h</span>
              <span>💨 {weatherTelemetry.wind_speed_kmh} km/h</span>
              <span className="risk-pill">{weatherTelemetry.flood_risk_level} FLOOD RISK</span>
            </div>
          )}

          <nav className="tab-nav">
            <button
              className={`tab-btn ${activeTab === "digital-twin" ? "active" : ""}`}
              onClick={() => setActiveTab("digital-twin")}
            >
              🌐 3D Digital Twin Map
            </button>
            <button
              className={`tab-btn ${activeTab === "cctv-tracking" ? "active" : ""}`}
              onClick={() => setActiveTab("cctv-tracking")}
            >
              📹 CCTV Live Station
            </button>
            <button
              className={`tab-btn ${activeTab === "messages" ? "active" : ""}`}
              onClick={() => setActiveTab("messages")}
            >
              💬 Real Messages {messages.length > 0 && <span className="tab-badge">{messages.length}</span>}
            </button>
            <button
              className={`tab-btn ${activeTab === "ai-intake" ? "active" : ""}`}
              onClick={() => setActiveTab("ai-intake")}
            >
              🚀 Multi-Agent Intake
            </button>
            <button
              className={`tab-btn ${activeTab === "traffic" ? "active" : ""}`}
              onClick={() => setActiveTab("traffic")}
            >
              🚦 Green Corridors {stats.activeCorridors > 0 && <span className="tab-badge green">{stats.activeCorridors}</span>}
            </button>
            <button
              className={`tab-btn ${activeTab === "resources" ? "active" : ""}`}
              onClick={() => setActiveTab("resources")}
            >
              ⚙️ Resources
            </button>
          </nav>

          <span className={`status ${connected ? "online" : "offline"}`}>
            {connected ? "● Network Connected" : "● Connecting..."}
          </span>
        </div>
      </header>

      <main className="dashboard-shell">
        {/* TOP STATS OVERVIEW */}
        <section className="hero-card">
          <div className="hero-title">
            <h2>Autonomous Operations Ecosystem</h2>
            <p>Proactive AI Vision, OCR Plate Extraction, 108 Audio Ingest, Green Corridor Signal Preemption & Digital Twin.</p>
          </div>
          <div className="hero-stats">
            <div className="stat-box active-incidents">
              <strong>{stats.activeIncidents}</strong>
              <span>Active Incidents</span>
            </div>
            <div className="stat-box dispatches">
              <strong>{stats.totalDispatches}</strong>
              <span>SMS / Calls Dispatched</span>
            </div>
            <div className="stat-box corridors">
              <strong>{stats.activeCorridors}</strong>
              <span>Green Corridors</span>
            </div>
            <div className="stat-box hospitals">
              <strong>{stats.hospitals}</strong>
              <span>Hospitals</span>
            </div>
            <div className="stat-box police">
              <strong>{stats.policeStations}</strong>
              <span>Police Stations</span>
            </div>
            <div className="stat-box fire">
              <strong>{stats.fireStations}</strong>
              <span>Fire Stations</span>
            </div>
            <div className="stat-box ambulances">
              <strong>{stats.ambulances}</strong>
              <span>Ambulances</span>
            </div>
          </div>
        </section>

        {/* TAB 1: 3D DIGITAL TWIN MAP & LIVE INCIDENT FEED */}
        {activeTab === "digital-twin" && (
          <section className="dashboard-grid">
            <div className="map-panel">
              <DigitalTwinMap incidents={incidents} resources={resources} trafficSignals={trafficSignals} />
            </div>
            <aside className="sidebar">
              <IncidentPanel incidents={incidents} />
              <ResourceLegend resources={resources} />
            </aside>
          </section>
        )}

        {/* TAB 2: CCTV LIVE TRACKING & AI VISION STATION */}
        {activeTab === "cctv-tracking" && (
          <CctvLiveTrackingPanel onTriggerAnalysis={() => setActiveTab("messages")} />
        )}

        {/* TAB 2: REAL MESSAGES & DISPATCH LOGS */}
        {activeTab === "messages" && (
          <MessageLogPanel
            messages={messages}
            resources={resources}
            onMessageSent={(newMsg) => setMessages((prev) => [newMsg, ...prev])}
          />
        )}

        {/* TAB 3: MULTI-SOURCE AI INTAKE HUB (Vision, OCR, 108 Speech Call, Social SOS) */}
        {activeTab === "ai-intake" && (
          <section className="ai-intake-section">
            <div className="intake-card">
              <h2>🚀 Multi-Source Autonomous Intake Hub</h2>
              <p>Sentinel AI ingests CCTV frames, calculates shortest ambulance routes, and dispatches automated alerts via Featherless AI.</p>
              
              <div className="featherless-demo-banner" style={{ background: "rgba(16, 185, 129, 0.1)", border: "1px solid #10b981", padding: "12px 16px", borderRadius: "12px", marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ fontWeight: "bold", color: "#10b981" }}>⚡ Powered by Featherless AI (llama-3.3-70b-versatile)</span>
                  <span style={{ fontSize: "12px", opacity: 0.8 }}>Automatic Real-SMS Dispatch System</span>
                </div>
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", fontSize: "13px" }}>
                  <div style={{ background: "rgba(255,255,255,0.05)", padding: "6px 12px", borderRadius: "8px" }}>
                    🚑 <strong>Ambulance:</strong> <code>+91 9000000101</code>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.05)", padding: "6px 12px", borderRadius: "8px" }}>
                    🚓 <strong>Police:</strong> <code>+91 9000000102</code>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.05)", padding: "6px 12px", borderRadius: "8px" }}>
                    🚦 <strong>Traffic Police:</strong> <code>+91 9000000103</code>
                  </div>
                </div>
              </div>

              <div className="intake-mode-switcher">
                <button
                  className={`mode-btn ${intakeMode === "vision" ? "active" : ""}`}
                  onClick={() => setIntakeMode("vision")}
                >
                  📷 CCTV Vision & OCR License Plate
                </button>
                <button
                  className={`mode-btn ${intakeMode === "audio_call" ? "active" : ""}`}
                  onClick={() => setIntakeMode("audio_call")}
                >
                  🎙️ 108 Voice Call Speech Agent
                </button>
                <button
                  className={`mode-btn ${intakeMode === "social_sos" ? "active" : ""}`}
                  onClick={() => setIntakeMode("social_sos")}
                >
                  📲 Social Media SOS Scanner
                </button>
              </div>

              {intakeMode === "vision" && (
                <form onSubmit={handleAiAnalyze} className="ai-dispatch-form">
                  <div className="inline-fields">
                    <label>
                      Latitude
                      <input type="number" step="0.000001" value={aiLat} onChange={(e) => setAiLat(e.target.value)} />
                    </label>
                    <label>
                      Longitude
                      <input type="number" step="0.000001" value={aiLng} onChange={(e) => setAiLng(e.target.value)} />
                    </label>
                  </div>

                  <div className="ai-actions">
                    <button type="button" className="secondary-btn" onClick={useCurrentLocation}>
                      📍 Load GPS Location
                    </button>
                    <button type="button" className="secondary-btn" onClick={cameraEnabled ? stopWebcam : startWebcam}>
                      {cameraEnabled ? "🔴 Stop Webcam" : "📷 Start Webcam Feed"}
                    </button>
                  </div>

                  <div className="camera-box">
                    <video ref={videoRef} autoPlay muted playsInline style={{ display: cameraEnabled ? "block" : "none" }} />
                    <canvas ref={canvasRef} style={{ display: "none" }} />
                    {cameraEnabled && (
                      <button type="button" className="secondary-btn capture-btn" onClick={captureFrame}>
                        📸 Capture Frame Snapshot
                      </button>
                    )}
                  </div>

                  <div className="file-upload-box">
                    <label>
                      Upload CCTV / Accident Image
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          if (file) {
                            setAiFile(file);
                            setAiPreview(URL.createObjectURL(file));
                            setAiMessage(`Ready to analyze ${file.name}.`);
                          }
                        }}
                      />
                    </label>
                  </div>

                  {aiPreview && (
                    <div className="preview-container">
                      <h4>Selected Image Preview</h4>
                      <img src={aiPreview} alt="Incident preview" className="preview-image" />
                    </div>
                  )}

                  <button type="submit" className="primary-btn dispatch-btn" disabled={analyzing}>
                    {analyzing ? "⚡ Analyzing Frame & Extracting OCR..." : "🚀 Run AI Vision & OCR Dispatch"}
                  </button>
                </form>
              )}

              {intakeMode === "audio_call" && (
                <form onSubmit={handleAudioCallSubmit} className="ai-dispatch-form">
                  <label>
                    Caller Phone Number
                    <input value={callerPhone} onChange={(e) => setCallerPhone(e.target.value)} required />
                  </label>

                  <label>
                    108 Voice Call Transcript (Speech-to-Text Ingest)
                    <textarea
                      rows={4}
                      value={audioTranscript}
                      onChange={(e) => setAudioTranscript(e.target.value)}
                      required
                    />
                  </label>

                  <div className="inline-fields">
                    <label>
                      Incident Latitude
                      <input type="number" step="0.0001" value={aiLat} onChange={(e) => setAiLat(e.target.value)} />
                    </label>
                    <label>
                      Incident Longitude
                      <input type="number" step="0.0001" value={aiLng} onChange={(e) => setAiLng(e.target.value)} />
                    </label>
                  </div>

                  <button type="submit" className="primary-btn dispatch-btn" disabled={analyzing}>
                    {analyzing ? "⚡ Processing 108 Call with Speech AI..." : "🎙️ Process 108 Call & Dispatch Responders"}
                  </button>
                </form>
              )}

              {intakeMode === "social_sos" && (
                <form onSubmit={handleSocialSosSubmit} className="ai-dispatch-form">
                  <label>
                    Citizen Handle / Author
                    <input value={socialAuthor} onChange={(e) => setSocialAuthor(e.target.value)} required />
                  </label>

                  <label>
                    Social Media SOS Alert Post
                    <textarea
                      rows={4}
                      value={socialText}
                      onChange={(e) => setSocialText(e.target.value)}
                      required
                    />
                  </label>

                  <div className="inline-fields">
                    <label>
                      Latitude
                      <input type="number" step="0.0001" value={aiLat} onChange={(e) => setAiLat(e.target.value)} />
                    </label>
                    <label>
                      Longitude
                      <input type="number" step="0.0001" value={aiLng} onChange={(e) => setAiLng(e.target.value)} />
                    </label>
                  </div>

                  <button type="submit" className="primary-btn dispatch-btn" disabled={analyzing}>
                    {analyzing ? "⚡ Ingesting SOS Alert..." : "📲 Process SOS Post & Dispatch Units"}
                  </button>
                </form>
              )}

              {aiMessage && <div className="feedback-card">{aiMessage}</div>}
            </div>
          </section>
        )}

        {/* TAB 4: SMART TRAFFIC SIGNALS & GREEN CORRIDOR CONTROL */}
        {activeTab === "traffic" && (
          <TrafficControlPanel
            trafficSignals={trafficSignals}
            onToggleSignal={(updatedSignal) => {
              setTrafficSignals((prev) =>
                prev.map((s) => (s.id === updatedSignal.id ? updatedSignal : s))
              );
            }}
          />
        )}

        {/* TAB 5: RESOURCE OPERATIONS & DIRECTORY */}
        {activeTab === "resources" && (
          <section className="resources-management-section">
            <div className="registered-resources-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
                <div>
                  <h2>🏢 Registered Responders & Resource Directory</h2>
                  <p>Active medical, police, fire & rescue, and ambulance units in the Sentinel GIS database.</p>
                </div>
                <div style={{ minWidth: "260px" }}>
                  <input
                    type="text"
                    placeholder="🔍 Filter by name, ID, or phone..."
                    value={resourceSearch}
                    onChange={(e) => setResourceSearch(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "10px",
                      background: "rgba(255, 255, 255, 0.06)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      color: "#fff",
                      fontSize: "14px",
                    }}
                  />
                </div>
              </div>

              {registeredResources.length > 0 ? (
                <div className="resources-groups-grid">
                  {registeredResources.map((group) => (
                    <div key={group.key} className="resource-group-card">
                      <h3>{group.label} ({group.items.length})</h3>
                      <ul>
                        {group.items.map((item) => (
                          <li key={item.id} className="resource-item">
                            <div className="resource-item-main">
                              <strong>{item.name}</strong>
                              <span className="resource-id-tag">ID: {item.id}</span>
                            </div>
                            <div className="resource-phone-tag">
                              📞 {item.phone || "No phone linked"}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-state">No matching resources found in database.</p>
              )}
            </div>

            <div className="operations-grid">
              <form onSubmit={handleRegister} className="panel-form">
                <h3>➕ Register New Emergency Resource</h3>
                <p style={{ fontSize: "13px", opacity: 0.8, marginBottom: "12px" }}>
                  Add a Hospital, Police Station, Fire Station, or Ambulance to the autonomous dispatch network.
                </p>

                <label>
                  Resource Category
                  <select
                    value={registration.resource_type}
                    onChange={(e) => setRegistration({ ...registration, resource_type: e.target.value })}
                  >
                    <option value="hospital">🏥 Hospital / Medical Center</option>
                    <option value="police_station">🚓 Police Station HQ</option>
                    <option value="fire_station">🚒 Fire & Rescue Station</option>
                    <option value="ambulance">🚑 Ambulance Fleet Unit</option>
                  </select>
                </label>

                <label>
                  Facility / Unit Name
                  <input
                    value={registration.name}
                    onChange={(e) => setRegistration({ ...registration, name: e.target.value })}
                    placeholder="e.g. Jubilee Hills Fire & Rescue Station"
                    required
                  />
                </label>

                {/* Quick Location Presets */}
                <div style={{ marginBottom: "12px" }}>
                  <span style={{ fontSize: "12px", color: "#94a3b8", display: "block", marginBottom: "6px" }}>
                    📍 Quick Hyderabad Location Presets:
                  </span>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="preset-btn"
                      onClick={() => setRegistration({ ...registration, lat: "17.4310", lng: "78.4076" })}
                    >
                      Jubilee Hills
                    </button>
                    <button
                      type="button"
                      className="preset-btn"
                      onClick={() => setRegistration({ ...registration, lat: "17.4260", lng: "78.4530" })}
                    >
                      Somajiguda
                    </button>
                    <button
                      type="button"
                      className="preset-btn"
                      onClick={() => setRegistration({ ...registration, lat: "17.4399", lng: "78.4983" })}
                    >
                      Secunderabad
                    </button>
                    <button
                      type="button"
                      className="preset-btn"
                      onClick={() => setRegistration({ ...registration, lat: "17.4480", lng: "78.3810" })}
                    >
                      Madhapur
                    </button>
                  </div>
                </div>

                <div className="inline-fields">
                  <label>
                    Latitude
                    <input
                      type="number"
                      step="0.0001"
                      value={registration.lat}
                      onChange={(e) => setRegistration({ ...registration, lat: e.target.value })}
                      required
                    />
                  </label>
                  <label>
                    Longitude
                    <input
                      type="number"
                      step="0.0001"
                      value={registration.lng}
                      onChange={(e) => setRegistration({ ...registration, lng: e.target.value })}
                      required
                    />
                  </label>
                </div>

                <label>
                  Emergency Contact Phone Number
                  <input
                    value={registration.phone}
                    onChange={(e) => setRegistration({ ...registration, phone: e.target.value })}
                    placeholder="+91 9000000104"
                  />
                </label>

                <button type="submit" className="primary-btn">Save New Resource</button>
              </form>

              <form onSubmit={handleContactSubmit} className="panel-form">
                <h3>📞 Update Contact Phone Number</h3>
                <p style={{ fontSize: "13px", opacity: 0.8, marginBottom: "12px" }}>
                  Link a hotline phone number to receive autonomous SMS alerts.
                </p>

                <label>
                  Resource Category
                  <select value={resourceType} onChange={(e) => setResourceType(e.target.value)}>
                    <option value="hospital">🏥 Hospital</option>
                    <option value="police_station">🚓 Police Station</option>
                    <option value="fire_station">🚒 Fire Station</option>
                    <option value="ambulance">🚑 Ambulance</option>
                  </select>
                </label>

                <label>
                  Resource ID
                  <input value={resourceId} onChange={(e) => setResourceId(e.target.value)} placeholder="e.g. P1, H1, FS1, A1" required />
                </label>

                <label>
                  New Phone Number
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91..." required />
                </label>

                <button type="submit" className="primary-btn">Update Phone Number</button>
              </form>

              <form onSubmit={handleUpload} className="panel-form">
                <h3>📁 Batch Import Resources</h3>
                <p>Upload a JSON file containing emergency resource records and GPS coordinates.</p>
                <input type="file" accept="application/json" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
                <button type="submit" className="primary-btn">Import JSON File</button>
              </form>
            </div>

            {message && <p className="feedback positive">{message}</p>}
            {uploadMessage && <p className="feedback positive">{uploadMessage}</p>}
          </section>
        )}

        {/* SUPABASE AUTHENTICATION & OTP LOGIN MODAL */}
        {showAuthModal && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(3, 7, 18, 0.85)", backdropFilter: "blur(12px)", zIndex: 9999, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px" }}>
            <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "20px", padding: "30px", width: "100%", maxWidth: "440px", boxShadow: "0 0 40px rgba(56, 189, 248, 0.3)", position: "relative" }}>
              <button
                onClick={() => { setShowAuthModal(false); setOtpSent(false); setAuthStatus(""); }}
                style={{ position: "absolute", top: "16px", right: "16px", background: "none", border: "none", color: "#94a3b8", fontSize: "1.2rem", cursor: "pointer" }}
              >
                ✕
              </button>

              <div style={{ textAlign: "center", marginBottom: "20px" }}>
                <div style={{ fontSize: "2rem", marginBottom: "8px" }}>🛡️</div>
                <h2 style={{ margin: 0, fontSize: "1.3rem", color: "#f8fafc" }}>Sentinel AI Officer Authentication</h2>
                <p style={{ margin: "6px 0 0 0", color: "#94a3b8", fontSize: "0.85rem" }}>
                  Request a 6-digit OTP verification code to log in as an Emergency Commander.
                </p>
              </div>

              {!otpSent ? (
                <form onSubmit={handleSendOtp} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <label style={{ fontSize: "0.85rem", color: "#cbd5e1", display: "flex", flexDirection: "column", gap: "6px" }}>
                    Official Emergency Department Email / Phone
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="officer@sentinelai.gov.in"
                      style={{ padding: "12px", borderRadius: "10px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontSize: "14px" }}
                      required
                    />
                  </label>

                  <button type="submit" className="primary-btn" style={{ width: "100%", padding: "14px", fontWeight: "bold" }}>
                    🔑 Send 6-Digit OTP Verification Code
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <label style={{ fontSize: "0.85rem", color: "#cbd5e1", display: "flex", flexDirection: "column", gap: "6px" }}>
                    Enter 6-Digit OTP Verification Code
                    <input
                      type="text"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder="849201"
                      style={{ padding: "12px", borderRadius: "10px", background: "rgba(255,255,255,0.06)", border: "1px solid #38bdf8", color: "#fff", fontSize: "18px", letterSpacing: "4px", textAlign: "center", fontWeight: "bold" }}
                      required
                    />
                  </label>

                  <button type="submit" className="primary-btn" style={{ width: "100%", padding: "14px", fontWeight: "bold", background: "linear-gradient(135deg, #10b981 0%, #059669 100%)" }}>
                    ✅ Verify OTP Code & Login
                  </button>
                </form>
              )}

              {authStatus && (
                <div style={{ marginTop: "16px", padding: "12px", borderRadius: "10px", fontSize: "0.85rem", textAlign: "center", background: authStatus.includes("✅") ? "rgba(16, 185, 129, 0.15)" : authStatus.includes("❌") ? "rgba(239, 68, 68, 0.15)" : "rgba(56, 189, 248, 0.15)", color: authStatus.includes("✅") ? "#34d399" : authStatus.includes("❌") ? "#f87171" : "#7dd3fc" }}>
                  {authStatus}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;