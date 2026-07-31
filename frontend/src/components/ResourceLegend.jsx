export default function ResourceLegend({ resources }) {
  const hospitals = resources?.hospitals || [];
  const policeStations = resources?.police_stations || [];
  const ambulances = resources?.ambulances || [];

  return (
    <div className="resource-legend">
      <h2>Resources</h2>
      <p>🏥 Hospitals: {hospitals.length}</p>
      <p>🚓 Police Stations: {policeStations.length}</p>
      <p>🚑 Ambulances: {ambulances.length}</p>
      <p>📞 Phone-enabled dispatch contacts are now tracked per resource.</p>
    </div>
  );
}