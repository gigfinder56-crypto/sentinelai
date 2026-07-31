export default function IncidentPanel({ incidents = [] }) {
  return (
    <div className="incident-panel">
      <h2>Incidents ({incidents.length})</h2>
      <ul>
        {incidents.map((i) => (
          <li key={i.incident_id}>
            <strong>{i.incident_id}</strong> — {i.status}
            <br />
            <small>{i.camera_id}</small>
            {i.resources?.nearby_counts ? (
              <>
                <br />
                <small>
                  Nearby: {i.resources.nearby_counts.hospitals} hospitals, {i.resources.nearby_counts.police_stations} police, {i.resources.nearby_counts.ambulances} ambulances
                </small>
              </>
            ) : null}
            {i.dispatch?.ambulance_dispatched ? (
              <>
                <br />
                <small>
                  Ambulance: {i.dispatch.ambulance_dispatched.name} ({i.dispatch.ambulance_dispatched.eta_minutes} min)
                </small>
              </>
            ) : null}
            {i.dispatch?.ai_call_dispatch?.length ? (
              <>
                <br />
                <small>Dispatch calls:</small>
                <ul className="dispatch-list">
                  {i.dispatch.ai_call_dispatch.map((call, index) => (
                    <li key={`${i.incident_id}-${index}`}>
                      {call.name} — {call.phone} — {call.status}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}