document.addEventListener('DOMContentLoaded', () => {
  const btnDashboard     = document.getElementById('btn-dashboard-view');
  const btnMapView       = document.getElementById('btn-map-view');
  const stationPlaceholder = document.getElementById('stationContentContainer');
  const mapContainer     = document.getElementById('mapContainer');
  const rightPanel       = document.getElementById('rightPanel');
  const dashPlaceholder  = document.getElementById('dashboardContentContainer');

  async function showDashboard() {
    // hide map & details
    mapContainer.style.display = 'none';
    rightPanel.style.display   = 'none';

    // load dashboard.html once
    if (!dashPlaceholder.innerHTML.trim()) {
      try {
        const res  = await fetch('dashboard.html');
        const html = await res.text();
        dashPlaceholder.innerHTML = html;
      } catch (err) {
        console.error('Could not load Dashboard View:', err);
      }
    }

    // show dashboard
    dashPlaceholder.style.display = 'block';
  }

  btnDashboard.addEventListener('click', e => {
    e.preventDefault();
    showDashboard();
  });

  btnMapView.addEventListener('click', e => {
    e.preventDefault();
    // hide dashboard, show map + details again
    dashPlaceholder.style.display = 'none';
    stationPlaceholder.style.display = 'none';
    mapContainer.style.display   = '';
    rightPanel.style.display     = '';
  });

  // Intercept any “.popup-link” click from the map
  document.body.addEventListener('click', async e => {
    const link = e.target.closest('.popup-link');
    if (!link) return;
    e.preventDefault();
    const stationId = link.dataset.id;

    // hide map & dashboard
    mapContainer.style.display       = 'none';
    rightPanel.style.display         = 'none';
    dashPlaceholder.style.display    = 'none';

    // inject snippet if needed
    if (!stationPlaceholder.innerHTML.trim()) {
      const res = await fetch('station_snippet.html');
      stationPlaceholder.innerHTML = await res.text();
    }
    stationPlaceholder.style.display = 'block';

    // now fill it
    loadStationPage(stationId);
  });

});
