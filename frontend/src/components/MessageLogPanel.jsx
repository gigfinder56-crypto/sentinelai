import { useState } from "react";

export default function MessageLogPanel({ messages = [], resources = {}, onMessageSent }) {
  const API_BASE_URL = (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1")
    ? window.location.origin
    : (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000");
  const [targetPhone, setTargetPhone] = useState("");
  const [targetEmail, setTargetEmail] = useState("");
  const [emailSubject, setEmailSubject] = useState("🚨 Sentinel AI Critical Dispatch Alert");
  const [recipientName, setRecipientName] = useState("");
  const [customBody, setCustomBody] = useState("");
  const [dispatchMode, setDispatchMode] = useState("sms"); // 'sms' | 'email'
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [filterType, setFilterType] = useState("all");

  const allResourcesList = [
    ...(resources?.hospitals || []).map((r) => ({ ...r, type: "Hospital" })),
    ...(resources?.police_stations || []).map((r) => ({ ...r, type: "Police Station" })),
    ...(resources?.fire_stations || []).map((r) => ({ ...r, type: "Fire Station" })),
    ...(resources?.ambulances || []).map((r) => ({ ...r, type: "Ambulance" })),
  ];

  const handleSelectResource = (event) => {
    const selectedId = event.target.value;
    if (!selectedId) return;
    const found = allResourcesList.find((r) => r.id === selectedId);
    if (found) {
      setTargetPhone(found.phone || "");
      setTargetEmail(found.email || "");
      setRecipientName(found.name || "");
    }
  };

  const handleSendEmail = async (event) => {
    event.preventDefault();
    if (!targetEmail || !customBody) {
      setStatusMessage("Please enter target email address and message body.");
      return;
    }
    setSending(true);
    setStatusMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/email/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: targetEmail,
          subject: emailSubject,
          body: customBody,
          name: recipientName || "Emergency Department",
        }),
      });
      const data = await response.json();
      if (response.ok && data.ok) {
        setStatusMessage(`✅ Emergency Email alert dispatched to ${targetEmail}!`);
        setCustomBody("");
        if (onMessageSent && data.message) onMessageSent(data.message);
      } else {
        setStatusMessage(`Failed: ${data.error || "Could not send email"}`);
      }
    } catch (err) {
      setStatusMessage(`Error sending email: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  const handleSendSms = async (event) => {
    event.preventDefault();
    if (!targetPhone || !customBody) {
      setStatusMessage("Please enter both recipient phone number and message body.");
      return;
    }

    setSending(true);
    setStatusMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/messages/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: targetPhone,
          body: customBody,
          name: recipientName || "Emergency Contact",
        }),
      });
      const data = await response.json();
      if (response.ok && data.ok) {
        setStatusMessage(`Message sent successfully to ${targetPhone}!`);
        setCustomBody("");
        if (onMessageSent && data.message) {
          onMessageSent(data.message);
        }
      } else {
        setStatusMessage(`Failed: ${data.error || "Could not send SMS"}`);
      }
    } catch (err) {
      setStatusMessage(`Error sending message: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  const filteredMessages = messages.filter((msg) => {
    if (filterType === "dispatches") return msg.incident_id && msg.incident_id !== "MANUAL";
    if (filterType === "direct") return msg.incident_id === "MANUAL" || msg.recipient_type === "direct_sms";
    return true;
  });

  return (
    <div className="message-log-container">
      <div className="message-log-header">
        <div>
          <h2>Real-Time Emergency Communications</h2>
          <p>Live SMS notifications, automated AI dispatch voice calls, and direct emergency messages.</p>
        </div>
        <div className="filter-pill-group">
          <button
            className={`pill-btn ${filterType === "all" ? "active" : ""}`}
            onClick={() => setFilterType("all")}
          >
            All Messages ({messages.length})
          </button>
          <button
            className={`pill-btn ${filterType === "dispatches" ? "active" : ""}`}
            onClick={() => setFilterType("dispatches")}
          >
            AI Dispatches
          </button>
          <button
            className={`pill-btn ${filterType === "direct" ? "active" : ""}`}
            onClick={() => setFilterType("direct")}
          >
            Direct SMS
          </button>
        </div>
      </div>

      <div className="messages-grid">
        <div className="messages-feed-card">
          <h3>Activity Feed</h3>
          {filteredMessages.length === 0 ? (
            <p className="empty-state">No emergency messages recorded yet.</p>
          ) : (
            <ul className="messages-list">
              {filteredMessages.map((msg) => (
                <li key={msg.id || `${msg.timestamp}-${msg.phone || msg.email}`} className="message-card">
                  <div className="message-card-top">
                    <div className="message-recipient-info">
                      <span className="recipient-tag" style={{ background: msg.channel === "email" ? "rgba(168, 85, 247, 0.2)" : "rgba(56, 189, 248, 0.2)", color: msg.channel === "email" ? "#c084fc" : "#38bdf8" }}>
                        {msg.channel === "email" ? "📧 EMAIL ALERT" : `📱 ${msg.recipient_type || "SMS ALERT"}`}
                      </span>
                      <strong>{msg.name || "Recipient"}</strong>
                      <span className="recipient-phone">
                        {msg.channel === "email" ? `✉️ ${msg.email || "No email"}` : `📞 ${msg.phone || "No phone"}`}
                      </span>
                    </div>
                    <div className="message-badges">
                      <span className="time-badge">{msg.formatted_time || "Just now"}</span>
                      <span className={`status-badge ${msg.sms_status}`}>
                        {msg.mode === "twilio" ? `TWILIO: ${msg.sms_status.toUpperCase()}` : msg.mode === "smtp" ? "SMTP EMAIL" : `DISPATCHED`}
                      </span>
                    </div>
                  </div>

                  <div className="message-body-box">
                    <p className="message-text">"{msg.message_body}"</p>
                  </div>

                  {msg.call_script && (
                    <div className="call-script-box">
                      <small className="script-label">🎙️ Voice Dispatch Script:</small>
                      <p className="script-text">{msg.call_script}</p>
                    </div>
                  )}

                  {msg.error && <p className="error-text">⚠️ Error: {msg.error}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="direct-sms-card">
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            <button
              type="button"
              className={`pill-btn ${dispatchMode === "sms" ? "active" : ""}`}
              onClick={() => setDispatchMode("sms")}
            >
              📱 Direct SMS Alert
            </button>
            <button
              type="button"
              className={`pill-btn ${dispatchMode === "email" ? "active" : ""}`}
              onClick={() => setDispatchMode("email")}
            >
              📧 Direct Email Alert
            </button>
          </div>

          <h3>{dispatchMode === "email" ? "Send Emergency Email Alert" : "Send Direct Emergency SMS"}</h3>
          <p>
            {dispatchMode === "email"
              ? "Dispatch a formatted HTML emergency alert directly to any target email address."
              : "Dispatch a custom emergency SMS alert directly to any registered unit or custom phone number."}
          </p>

          <form onSubmit={dispatchMode === "email" ? handleSendEmail : handleSendSms} className="direct-sms-form">
            <label>
              Select Registered Resource
              <select onChange={handleSelectResource} defaultValue="">
                <option value="">-- Choose contact --</option>
                {allResourcesList.map((res) => (
                  <option key={res.id} value={res.id}>
                    {res.name} ({res.type} — {res.email || res.phone || "No contact"})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Recipient Name
              <input
                type="text"
                placeholder="e.g. Telangana Disaster Response Command"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
              />
            </label>

            {dispatchMode === "email" ? (
              <>
                <label>
                  Target Email Address
                  <input
                    type="email"
                    placeholder="e.g. yourname@gmail.com or police.hq@gov.in"
                    value={targetEmail}
                    onChange={(e) => setTargetEmail(e.target.value)}
                    required
                  />
                </label>

                <label>
                  Email Subject
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    required
                  />
                </label>
              </>
            ) : (
              <label>
                Phone Number
                <input
                  type="text"
                  placeholder="+91..."
                  value={targetPhone}
                  onChange={(e) => setTargetPhone(e.target.value)}
                  required
                />
              </label>
            )}

            <label>
              Emergency Message Body
              <textarea
                rows={4}
                placeholder="Sentinel AI Emergency Alert: Requesting immediate reinforcement at coordinates..."
                value={customBody}
                onChange={(e) => setCustomBody(e.target.value)}
                required
              />
            </label>

            <button type="submit" disabled={sending} className="primary-btn">
              {sending ? "Dispatching Alert..." : dispatchMode === "email" ? "📧 Dispatch Emergency Email" : "📤 Dispatch Emergency SMS"}
            </button>
          </form>

          {statusMessage && (
            <p className={`feedback ${statusMessage.startsWith("Failed") || statusMessage.startsWith("Error") ? "error" : "positive"}`}>
              {statusMessage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
