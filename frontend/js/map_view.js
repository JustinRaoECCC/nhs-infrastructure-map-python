// map_view.js
// Initializes the Leaflet map, loads station data, places markers, and handles station-details popups.

window.addEventListener('unload', () => {});

// ─── In-memory cache of all station data ─────────────────────────────────
let mapStationData = [];

// (optional) initial loader if you still want it elsewhere
async function initializeData() {
  mapStationData = await eel.get_infrastructure_data()();
}
initializeData().then(() => {
  console.log('🔷 [map_view] station data loaded, drawing initial markers');
  window.refreshMarkers();
});

// ─── Initialize Leaflet map ────────────────────────────────────────────────
const map = L.map('map', {
  // lock panning to the world’s [-90, -180] → [90, 180] bounds
  maxBounds: [[-90, -180], [90, 180]],
  // bounce back immediately at the edge
  maxBoundsViscosity: 1.0
}).setView([54.5, -119], 5);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  noWrap: true // ← prevent horizontal repetition
}).addTo(map);

// ─── Grey out the “un‐scrollable” area in light grey ─────────────────────────
{
  const bounds = map.options.maxBounds;
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();

  // huge outer ring, covers everything
  const outer = [
    [-90, -360],
    [ 90, -360],
    [ 90,  360],
    [-90,  360]
  ];

  // inner hole = your actual map bounds
  const inner = [
    [ sw.lat,  sw.lng ],
    [ sw.lat,  ne.lng ],
    [ ne.lat,  ne.lng ],
    [ ne.lat,  sw.lng ]
  ];

  L.polygon([ outer, inner ], {
    fillRule:    'evenodd',
    fillColor:   '#DDD',   // ← light grey
    fillOpacity: 1.0,      // ← fully opaque
    stroke:      false,
    interactive: false
  }).addTo(map);
}

// ─── Marker layer ──────────────────────────────────────────────────────────
const markersLayer = L.layerGroup().addTo(map);

// ─── Helper: read which filters are checked ───────────────────────────────
function getActiveFilters() {
  const locations = Array.from(
    document.querySelectorAll('.filter-checkbox.location:checked')
  ).map(cb => cb.value);
  const assetTypes = Array.from(
    document.querySelectorAll('.filter-checkbox.asset-type:checked')
  ).map(cb => cb.value);
  return { locations, assetTypes };
}

// Always re-fetch & redraw
window.refreshMarkers = async function() {
  // 1) pull fresh data
  mapStationData = await eel.get_infrastructure_data()();

  // 2) clear & draw
  markersLayer.clearLayers();
  const { locations: activeLocations, assetTypes: activeAssetTypes } = getActiveFilters();

  mapStationData.forEach(stn => {
    if (!activeLocations.includes(stn.province))   return;
    if (!activeAssetTypes.includes(stn.asset_type)) return;

    const marker = L.marker([stn.lat, stn.lon], {
      icon: createColoredIcon(stn.color)
    })
      .addTo(markersLayer)
      .bindPopup(`<a href="#" class="popup-link" data-id="${stn.station_id}">${stn.name}</a>`);
    marker.on('click', e => {
      if (e.originalEvent && e.originalEvent.target.tagName === 'A') return;
      marker.openPopup();
      showStationDetails(stn);
    });
  });
};

// initial draw
console.log('🔷 [map_view] initial refreshMarkers()');
window.refreshMarkers();

// ─── Global Import (always-present toolbar in the right panel) ─────────────
function bindGlobalImportToolbar() {
  const btn  = document.getElementById('btnImportDataGlobal');
  const file = document.getElementById('fileImportDataGlobal');
  if (!btn || !file) {
    console.warn('[GlobalImport] toolbar elements not found');
    return;
  }
  if (!btn.dataset.bound) {
    btn.addEventListener('click', () => {
      console.log('[GlobalImport] Import button clicked');
      file.click();
    });
    btn.dataset.bound = '1';
  }
  if (!file.dataset.bound) {
    file.addEventListener('change', async (e) => {
      const f = (e.target.files || [])[0];
      console.log('[GlobalImport] file change fired:', f?.name);
      if (!f) return;
      try {
        // SAFER: use FileReader to avoid stack overflow on large files
        const b64 = await new Promise((resolve, reject) => {
          const rdr = new FileReader();
          rdr.onload = () => {
            try {
              const s = String(rdr.result || '');
              const i = s.indexOf(',');
              resolve(i >= 0 ? s.slice(i + 1) : s); // strip data: prefix
            } catch (err) { reject(err); }
          };
          rdr.onerror = reject;
          rdr.readAsDataURL(f);
        });
        if (typeof stationDataCache !== 'undefined') stationDataCache = null;
        console.log('[GlobalImport] calling electronAPI.importMultipleStations(...)');
        const res  = await window.electronAPI.importMultipleStations(b64);
        console.log('[GlobalImport] result:', res);
        if (!res || !res.success) {
          alert('Import failed: ' + (res?.message || 'Unknown error'));
          return;
        }
        // Refresh map + list
        if (window.refreshMarkers) await window.refreshMarkers();
        if (window.renderList)     await window.renderList();
        // If a station is currently shown, try to re-render it with fresh data
        try {
          const details = document.getElementById('station-details');
          let currentId = null;
          details.querySelectorAll('tr').forEach(tr => {
            const th = tr.querySelector('th');
            const td = tr.querySelector('td');
            if (th && /station id/i.test(th.textContent || '')) {
              currentId = (td?.textContent || '').trim();
            }
          });
          if (currentId) {
            const all = await window.electronAPI.getStationData();
            const found = (all || []).find(s => String(s.station_id) === String(currentId));
            if (found) showStationDetails(found);
          }
        } catch (_) {}
      } catch (err) {
        console.error('[GlobalImport] unexpected error:', err);
        alert('Unexpected error during import. See console.');
      } finally {
        e.target.value = '';
      }
    });
    file.dataset.bound = '1';
  }
}
document.addEventListener('DOMContentLoaded', bindGlobalImportToolbar);

// ─── Helper: fill in the RHS pane ─────────────────────────────────────────
function showStationDetails(stn) {
  const container = document.getElementById('station-details');

  // Remove the placeholder text if present
  const placeholder = container.querySelector('p');
  if (placeholder) placeholder.remove();

  // ─── Only ensure body; toolbar is global in #rightPanel ────────────────
  let body = container.querySelector('.station-details-body');

  if (!body) {
    body = document.createElement('div');
    body.className = 'station-details-body';
    container.appendChild(body);
  }

  // 1) fixed fields (General Information)
  const fixedOrder = [
    ['Station ID', stn.station_id],
    ['Category',   stn.asset_type],
    ['Site Name',  stn.name],
    ['Province',   stn.province],
    ['Latitude',   stn.lat],
    ['Longitude',  stn.lon],
    ['Status',     stn.status]
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

  // Only replace the body content so the toolbar stays
  body.innerHTML = html;
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
    iconAnchor: [6, 6]
  });
}

// ─── Map click = reset RHS station details ────────────────────────────────
map.on('click', () => {
  const container = document.getElementById('station-details');
  container.innerHTML = `<p><em>Click a pin to see details</em></p>`;
});