// frontend/js/inventory.js
// Handles the new "Inventor View" switch logic, loading its content from inventory.html

document.addEventListener('DOMContentLoaded', () => {
  // View buttons
  const btnInventorView   = document.getElementById('btn-inventor-view');
  const btnMapView        = document.getElementById('btn-map-view');
  const btnListView       = document.getElementById('btn-list-view');
  const btnDashboardView  = document.getElementById('btn-dashboard-view');

  // Content containers
  const inventorPlaceholder   = document.getElementById('inventorContentContainer');
  const mapContainer          = document.getElementById('mapContainer');
  const listContainer         = document.getElementById('listContainer');
  const rightPanel            = document.getElementById('rightPanel');
  const dashPlaceholder       = document.getElementById('dashboardContentContainer');
  const stationPlaceholder    = document.getElementById('stationContentContainer');

  function hideAllViews() {
    mapContainer.style.display        = 'none';
    listContainer.style.display       = 'none';
    rightPanel.style.display          = 'none';
    dashPlaceholder.style.display     = 'none';
    stationPlaceholder.style.display  = 'none';
    inventorPlaceholder.style.display = 'none';
  }

  // Inventor View
  btnInventorView.addEventListener('click', async e => {
    e.preventDefault();
    hideAllViews();
    if (!inventorPlaceholder.innerHTML.trim()) {
      const html = await fetch('inventory.html').then(r => r.text());
      inventorPlaceholder.innerHTML = html;
    }
    inventorPlaceholder.style.display = 'block';
  });

  // Map View
  btnMapView.addEventListener('click', e => {
    e.preventDefault();
    hideAllViews();
    mapContainer.style.display = '';
    rightPanel.style.display   = '';
    setTimeout(() => map.invalidateSize(), 0);
  });

  // List View (in‐page panel)
  btnListView.addEventListener('click', e => {
    e.preventDefault();
    hideAllViews();
    listContainer.style.display = '';
    rightPanel.style.display   = '';
  });

  // Dashboard View
  btnDashboardView.addEventListener('click', e => {
    e.preventDefault();
    hideAllViews();
    dashPlaceholder.style.display = 'block';
  });
});
