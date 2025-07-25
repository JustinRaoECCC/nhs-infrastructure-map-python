// frontend/js/station.js

// Load the station details and wire up tabs/back
document.addEventListener('DOMContentLoaded', async () => {
  // 1) get ?id=station_id
  const params   = new URLSearchParams(window.location.search);
  const stationId = params.get('id');
  if (!stationId) {
    alert('No station specified.');
    return;
  }

  document.getElementById('backButton')
    .addEventListener('click', () => window.history.back());

  // 3) tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab, .tab-content')
        .forEach(el => el.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.target).classList.add('active');
    });
  });

  // 4) fetch data & find our station
  const data = await eel.get_infrastructure_data()();
  const stn  = data.find(s => s.station_id === stationId);
  if (!stn) {
    alert(`Station "${stationId}" not found.`);
    return;
  }

  // 5) populate Overview fields
  document.getElementById('stationTitle').textContent = stn.name;
  document.getElementById('giStationId').textContent  = stn.station_id;
  document.getElementById('giCategory').textContent   = stn.asset_type;
  document.getElementById('giSiteName').textContent   = stn.name;
  document.getElementById('giProvince').textContent   = stn.province;
  document.getElementById('giLatitude').textContent   = stn.lat;
  document.getElementById('giLongitude').textContent  = stn.lon;
  document.getElementById('giStatus').textContent     = stn.status;

  // (unlockEditing and add‑section come later)
});
