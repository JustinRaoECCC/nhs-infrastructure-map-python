// map_view.js
// Initializes the Leaflet map, loads station data, places markers, and handles station‑details popups.



// ─────────────────────────────────────────────────────────────────────────────
// Colour bank + assignment for each location→asset‑type
// ─────────────────────────────────────────────────────────────────────────────
const colourMap = new Map();

// Random hex‑colour generator
function getRandomColor() {
  return '#' +
    Math.floor(Math.random() * 0xFFFFFF)
      .toString(16)
      .padStart(6, '0');
}



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


// ─── Marker layer + refresh fn ─────────────────────────────────────────────
const markersLayer = L.layerGroup().addTo(map);

/**
 * Fetch all stations and redraw the markersLayer.
 */
window.refreshMarkers = function() {
  markersLayer.clearLayers();

  fetchInfrastructureData().then(data => {
    
    data.forEach(stn => {
      // pick colour per location→assetType (reuse your existing logic)
      const key = `${stn.province}:${stn.asset_type}`;
      if (!colourMap.has(key)) {
        colourMap.set(key, getRandomColor());
      }
      const color = colourMap.get(key);

      const marker = L.marker([stn.lat, stn.lon], {
        icon: createColoredIcon(color)
      })
      .bindPopup(`<strong>${stn.name}</strong>`)
      .on('click', () => {
        marker.openPopup();
        showStationDetails(stn);
      });

      markersLayer.addLayer(marker);
    });
  });
};

// initial population
window.refreshMarkers();


// Helper: fill in the RHS pane
function showStationDetails(stn) {
  const container = document.getElementById('station-details');

  // 1) fixed fields (General Information)
  const fixedOrder = [
    ['Station ID',       stn.station_id],
    ['Category',         stn.asset_type],
    ['Site Name',        stn.name],
    ['Province',         stn.province],
    ['Latitude',         stn.lat],
    ['Longitude',        stn.lon],
    ['Status',           stn.status],
  ];

  // 2) collect “extra” keys that use the “Section – Field” pattern
  const extras = {};
  const sep = ' – ';
  Object.keys(stn).forEach(key => {
    if (!key.includes(sep)) return;
    const [section, field] = key.split(sep);
    extras[section] = extras[section] || {};
    extras[section][field] = stn[key];
  });

  // 3) build HTML
  let html = '';

  // General Information box
  html += '<div class="station-section">';
  html += '<h3>General Information</h3><table>';
  fixedOrder.forEach(([label, val]) => {
    html += `<tr><th>${label}:</th><td>${val != null ? val : ''}</td></tr>`;
  });
  html += '</table></div>';

  // Additional sections
  Object.entries(extras).forEach(([sectionName, fields]) => {
    html += `<div class="station-section"><h3>${sectionName}</h3><table>`;
    Object.entries(fields).forEach(([fieldName, value]) => {
      html += `<tr><th>${fieldName}:</th><td>${value != null ? value : ''}</td></tr>`;
    });
    html += '</table></div>';
  });

  container.innerHTML = html;
}

/**
 * createColoredIcon(color): returns a small circle icon for map markers
 */
function createColoredIcon(color) {
  return L.divIcon({
    className: 'custom-div-icon',
    // leave all layout/CSS in style.css; only set the color via a CSS var
    html: `<span class="marker-dot" style="--marker-color:${color}"></span>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}


// Load and display markers
fetchInfrastructureData().then(data => {
  data.forEach(stn => {
    // pick a unique colour per “location→assetType”
    const key = `${stn.province}:${stn.asset_type}`;
    if (!colourMap.has(key)) {
      colourMap.set(key, getRandomColor());
    }
    const color = colourMap.get(key);
    const marker = L.marker([stn.lat, stn.lon], {
      icon: createColoredIcon(color)
    })
      .addTo(map)
      .bindPopup(`<strong>${stn.name}</strong>`);
    marker.on('click', () => {
      marker.openPopup();
      showStationDetails(stn);
    });
  });
});
