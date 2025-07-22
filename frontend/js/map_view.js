// map_view.js
// Initializes the Leaflet map, loads station data, places markers, and handles station‑details popups.

// Initialize Leaflet map
const map = L.map('map', {
    // lock panning to the world’s [-90, -180] → [90, 180] bounds
    maxBounds: [[-90, -180], [90, 180]],
    // bounce back immediately at the edge
    maxBoundsViscosity: 1.0
  }).setView([54.5, -119], 5);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Helper: fill in the RHS pane
function showStationDetails(stn) {
  const c = document.getElementById('station-details');
  c.innerHTML = `
    <table>
      <tr><th>ID</th><td>${stn.station_id}</td></tr>
      <tr><th>Name</th><td>${stn.name}</td></tr>
      <tr><th>Status</th><td>${stn.status}</td></tr>
      <tr><th>Province</th><td>${stn.province}</td></tr>
      <tr><th>Struct. Type</th><td>${stn.structure_type}</td></tr>
      <tr><th>Year Built</th><td>${stn.year_built || 'N/A'}</td></tr>
      <tr><th>Inspection Freq.</th><td>${stn.inspection_frequency}</td></tr>
      <tr><th>Next Insp.</th><td>${stn.next_inspection || 'N/A'}</td></tr>
      <tr><th>Office</th><td>${stn.operating_office}</td></tr>
      <tr><th>Technician</th><td>${stn.technician}</td></tr>
    </table>
  `;
}

// Load and display markers
fetchInfrastructureData().then(data => {
  data.forEach(stn => {
    const marker = L.marker([stn.lat, stn.lon])
      .addTo(map)
      .bindPopup(`<strong>${stn.name}</strong>`);
    marker.on('click', () => {
      marker.openPopup();
      showStationDetails(stn);
    });
  });
});
