// frontend/js/station.js

/**
 * Render the station‐details snippet into the page.
 * @param {string} stationId
 */
async function loadStationPage(stationId) {
  if (!stationId) {
    alert('No station specified.');
    return;
  }

  // Wire up “Back to Map”
  document.getElementById('backButton')
    .addEventListener('click', () => {
      document.getElementById('stationContentContainer').style.display = 'none';
      document.getElementById('mapContainer').style.display = '';
      document.getElementById('rightPanel').style.display = '';
    });

  // Tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab, .tab-content')
              .forEach(el => el.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.target).classList.add('active');
    });
  });

  // Fetch and populate
  // — clear out any old station data immediately —
  document.getElementById('stationTitle').textContent      = '';
  document.getElementById('giStationId').textContent       = '';
  document.getElementById('giCategory').textContent        = '';
  document.getElementById('giSiteName').textContent        = '';
  document.getElementById('giProvince').textContent        = '';
  document.getElementById('giLatitude').textContent        = '';
  document.getElementById('giLongitude').textContent       = '';
  document.getElementById('giStatus').textContent          = '';
  document.getElementById('extraSectionsOverview').innerHTML = '';

  // Now fetch and populate
  const data = await eel.get_infrastructure_data()();
  const stn  = data.find(s => s.station_id === stationId);
  if (!stn) {
    alert(`Station "${stationId}" not found.`);
    return;
  }
  document.getElementById('stationTitle').textContent = stn.name;
  document.getElementById('giStationId').textContent  = stn.station_id;
  document.getElementById('giCategory').textContent   = stn.asset_type;
  document.getElementById('giSiteName').textContent   = stn.name;
  document.getElementById('giProvince').textContent   = stn.province;
  document.getElementById('giLatitude').textContent   = stn.lat;
  document.getElementById('giLongitude').textContent  = stn.lon;
  document.getElementById('giStatus').textContent     = stn.status;
}

// Expose for the view‐switcher
window.loadStationPage = loadStationPage;
