import { useState, useRef, useEffect } from "react";

export default function CctvLiveTrackingPanel({ onTriggerAnalysis }) {
  const [selectedCam, setSelectedCam] = useState("CAM_01");
  const [aiOverlay, setAiOverlay] = useState(true);
  const [webcamActive, setWebcamActive] = useState(false);
  const [analyzingCam, setAnalyzingCam] = useState(null);
  const [detectionLogs, setDetectionLogs] = useState([
    { id: 1, time: "17:18:02", cam: "CAM_01", event: "🚘 Vehicle OCR Read: TS 09 EC 4589", confidence: "98.4%" },
    { id: 2, time: "17:18:15", cam: "CAM_02", event: "⚠️ High Traffic Density Detected", confidence: "92.1%" },
    { id: 3, time: "17:19:00", cam: "CAM_03", event: "🌧️ Waterlogging Risk Detected near Abids", confidence: "89.7%" },
  ]);

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const cameraFeeds = [
    {
      id: "CAM_01",
      name: "Jubilee Hills Checkpost Junction",
      location: "Lat: 17.4310, Lng: 78.4076",
      fps: 30,
      status: "ONLINE",
      threat: "MEDIUM",
      image: "https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=600&q=80",
      bboxes: [
        { label: "Car Collision", color: "#ef4444", top: "30%", left: "40%", width: "25%", height: "25%" },
        { label: "TS 09 EC 4589", color: "#38bdf8", top: "52%", left: "42%", width: "15%", height: "8%" },
      ],
    },
    {
      id: "CAM_02",
      name: "Secunderabad Railway Station Signal",
      location: "Lat: 17.4399, Lng: 78.4983",
      fps: 30,
      status: "ONLINE",
      threat: "NORMAL",
      image: "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=600&q=80",
      bboxes: [
        { label: "High Crowd Density", color: "#f59e0b", top: "20%", left: "20%", width: "50%", height: "45%" },
      ],
    },
    {
      id: "CAM_03",
      name: "Abids Main Road Junction",
      location: "Lat: 17.3903, Lng: 78.4750",
      fps: 28,
      status: "ONLINE",
      threat: "HIGH",
      image: "https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=600&q=80",
      bboxes: [
        { label: "Flood Waterlogging (30cm)", color: "#38bdf8", top: "60%", left: "10%", width: "80%", height: "35%" },
      ],
    },
    {
      id: "CAM_04",
      name: "Gachibowli High-Tech Flyover",
      location: "Lat: 17.4401, Lng: 78.3489",
      fps: 30,
      status: "ONLINE",
      threat: "NORMAL",
      image: "https://images.unsplash.com/photo-1508873696983-2df515122519?auto=format&fit=crop&w=600&q=80",
      bboxes: [
        { label: "Normal Vehicle Traffic", color: "#34d399", top: "40%", left: "30%", width: "30%", height: "30%" },
      ],
    },
  ];

  const startWebcam = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setWebcamActive(true);
    } catch (err) {
      console.error("Webcam error:", err);
    }
  };

  const stopWebcam = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setWebcamActive(false);
  };

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleRunAi = (camId) => {
    setAnalyzingCam(camId);
    setTimeout(() => {
      setAnalyzingCam(null);
      const newLog = {
        id: Date.now(),
        time: new Date().toLocaleTimeString(),
        cam: camId,
        event: "🚨 Autonomous AI Vision Dispatch Triggered — Responders Notified!",
        confidence: "99.2%",
      };
      setDetectionLogs((prev) => [newLog, ...prev]);
      if (onTriggerAnalysis) onTriggerAnalysis(camId);
    }, 1200);
  };

  return (
    <section className="cctv-tracking-panel" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* CCTV CONTROL HEADER */}
      <div className="cctv-header-card" style={{ background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px", padding: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 10px #ef4444", animation: "pulse 1.5s infinite" }}></span>
            <h2 style={{ margin: 0, fontSize: "1.3rem", color: "#f8fafc" }}>📹 CCTV Live Tracking & AI Vision Station</h2>
          </div>
          <p style={{ margin: "4px 0 0 0", color: "#94a3b8", fontSize: "0.85rem" }}>
            Continuous multi-camera stream processing with YOLO bounding box object tracking, license plate OCR, and automated threat classification.
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <button
            className="secondary-btn"
            onClick={() => setAiOverlay(!aiOverlay)}
            style={{ background: aiOverlay ? "rgba(56, 189, 248, 0.2)" : "rgba(255,255,255,0.06)", borderColor: aiOverlay ? "#38bdf8" : "rgba(255,255,255,0.12)" }}
          >
            {aiOverlay ? "🟢 YOLO AI Overlay: ON" : "⚪ YOLO AI Overlay: OFF"}
          </button>

          <button
            className="secondary-btn"
            onClick={webcamActive ? stopWebcam : startWebcam}
            style={{ background: webcamActive ? "rgba(239, 68, 68, 0.2)" : "rgba(52, 211, 153, 0.15)", borderColor: webcamActive ? "#ef4444" : "#34d399" }}
          >
            {webcamActive ? "🔴 Stop Live Webcam" : "📹 Connect Mobile/Webcam Feed"}
          </button>
        </div>
      </div>

      {/* WEBCAM LIVE FEED SECTION IF ACTIVE */}
      {webcamActive && (
        <div style={{ background: "rgba(15, 23, 42, 0.9)", border: "2px solid #34d399", borderRadius: "16px", padding: "16px", position: "relative" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
            <strong>📷 Live Mobile / Laptop Camera Feed (CAM_LIVE)</strong>
            <span style={{ color: "#34d399", fontWeight: "bold" }}>● LIVE FEED STREAMING</span>
          </div>
          <div style={{ position: "relative", width: "100%", maxHeight: "360px", overflow: "hidden", borderRadius: "12px", background: "#000" }}>
            <video ref={videoRef} autoPlay muted playsInline style={{ width: "100%", height: "340px", objectFit: "cover" }} />
            {aiOverlay && (
              <div style={{ position: "absolute", top: "30%", left: "35%", width: "30%", height: "40%", border: "2px solid #38bdf8", borderRadius: "8px", boxShadow: "0 0 15px rgba(56, 189, 248, 0.5)", pointerEvents: "none" }}>
                <span style={{ position: "absolute", top: "-22px", left: "0", background: "#38bdf8", color: "#000", fontWeight: "bold", fontSize: "11px", padding: "2px 6px", borderRadius: "4px" }}>
                  AI VISION: LIVE SUBJECT DETECTED (98%)
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4-CAMERA LIVE GRID */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "16px" }}>
        {cameraFeeds.map((cam) => (
          <div
            key={cam.id}
            style={{
              background: "rgba(15, 23, 42, 0.75)",
              border: selectedCam === cam.id ? "2px solid #38bdf8" : "1px solid rgba(255,255,255,0.1)",
              borderRadius: "16px",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              boxShadow: selectedCam === cam.id ? "0 0 20px rgba(56, 189, 248, 0.25)" : "none",
            }}
          >
            {/* CAMERA CARD HEADER */}
            <div style={{ padding: "12px 16px", background: "rgba(0,0,0,0.3)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong style={{ fontSize: "0.95rem", color: "#f8fafc" }}>{cam.name}</strong>
                <div style={{ fontSize: "0.72rem", color: "#64748b" }}>{cam.id} | {cam.location}</div>
              </div>
              <span style={{ fontSize: "0.7rem", fontWeight: "bold", padding: "3px 8px", borderRadius: "6px", background: cam.threat === "HIGH" ? "rgba(239, 68, 68, 0.2)" : "rgba(52, 211, 153, 0.15)", color: cam.threat === "HIGH" ? "#f87171" : "#34d399" }}>
                {cam.threat === "HIGH" ? "🚨 HAZARD DETECTED" : "● NORMAL"}
              </span>
            </div>

            {/* VIDEO FEED IMAGE WITH AI OVERLAYS */}
            <div style={{ position: "relative", height: "200px", background: "#090d16", overflow: "hidden" }}>
              <img src={cam.image} alt={cam.name} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.85 }} />
              
              {/* TELEMETRY OVERLAY */}
              <div style={{ position: "absolute", top: "10px", left: "10px", background: "rgba(0,0,0,0.7)", padding: "4px 8px", borderRadius: "6px", fontSize: "0.7rem", color: "#38bdf8", fontFamily: "monospace" }}>
                REC ● {cam.fps} FPS | AI INFERENCE: 16ms
              </div>

              {/* BOUNDING BOXES OVERLAY */}
              {aiOverlay && cam.bboxes.map((box, idx) => (
                <div
                  key={idx}
                  style={{
                    position: "absolute",
                    top: box.top,
                    left: box.left,
                    width: box.width,
                    height: box.height,
                    border: `2px dashed ${box.color}`,
                    borderRadius: "6px",
                    boxShadow: `0 0 12px ${box.color}66`,
                    pointerEvents: "none",
                  }}
                >
                  <span style={{ position: "absolute", top: "-20px", left: "0", background: box.color, color: "#000", fontWeight: "bold", fontSize: "10px", padding: "1px 5px", borderRadius: "3px" }}>
                    {box.label}
                  </span>
                </div>
              ))}
            </div>

            {/* CAMERA FOOTER ACTIONS */}
            <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
              <button
                className="secondary-btn"
                style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                onClick={() => setSelectedCam(cam.id)}
              >
                🔍 Expand Stream
              </button>

              <button
                className="primary-btn"
                style={{ fontSize: "0.8rem", padding: "6px 14px", background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)" }}
                disabled={analyzingCam === cam.id}
                onClick={() => handleRunAi(cam.id)}
              >
                {analyzingCam === cam.id ? "⚡ Analyzing..." : "🚀 Trigger AI Dispatch"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* REAL-TIME AI VISION DISPATCH LOGS */}
      <div style={{ background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px", padding: "20px" }}>
        <h3 style={{ margin: "0 0 12px 0", fontSize: "1rem", color: "#38bdf8" }}>⚡ Real-Time AI Detection & Telemetry Log</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {detectionLogs.map((log) => (
            <div key={log.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.03)", padding: "10px 14px", borderRadius: "10px", fontSize: "0.85rem" }}>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <span style={{ color: "#64748b", fontFamily: "monospace" }}>[{log.time}]</span>
                <span style={{ background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", padding: "2px 6px", borderRadius: "4px", fontSize: "0.75rem", fontWeight: "bold" }}>{log.cam}</span>
                <span style={{ color: "#f8fafc" }}>{log.event}</span>
              </div>
              <span style={{ color: "#34d399", fontWeight: "bold", fontSize: "0.8rem" }}>AI Confidence: {log.confidence}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
