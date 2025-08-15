// frontend/js/list_view.js

// ─── Quick‐view renderer (pulled from map_view.js) ──────────────────────
function showStationDetails(stn) {
  const container = document.getElementById('station-details');

  // Remove the placeholder text if present
  const placeholder = container.querySelector('p');
  if (placeholder) placeholder.remove();

  // Persistent shell
  const toolbar = container.querySelector('.station-toolbar');
  const file    = container.querySelector('input.import-data-file');
  let body    = container.querySelector('.station-details-body');

  if (!body) {
    body = document.createElement('div');
    body.className = 'station-details-body';
    container.appendChild(body);
  }
  if (file && !file._wired) {
    file.addEventListener('change', async (e) => {
      const f = (e.target.files || [])[0];
      if (!f) return;
      const buf = await f.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = ''; for (let b of bytes) bin += String.fromCharCode(b);
      const b64 = btoa(bin);
      try {
        console.group('[Import Data]');
        console.log('Station:', stn.station_id, stn.name);
        console.log('File:', f.name);
        if (typeof stationDataCache !== 'undefined') { stationDataCache = null; }
        const res = await window.electronAPI.importMultipleStations(b64);
        console.log('Response:', res);
        if (res && res.debug) {
          if (res.debug.importer) console.log('Debug.importer:', res.debug.importer);
          if (res.debug.repo) console.log('Debug.repo:', res.debug.repo);
          if (res.debug.updates) console.log('Debug.updates:', res.debug.updates);
          if (res.debug.target) console.log('Debug.target:', res.debug.target);
        }
        if (!res || !res.success) {
          alert('Import failed: ' + (res && res.message ? res.message : 'Unknown error'));
        } else {
          const data = await window.electronAPI.getStationData();
          const fresh = (data || []).find(s => s.station_id === stn.station_id) || stn;
          showStationDetails(fresh);
        }
      } catch (err) {
        console.error('[Import Data] unexpected error', err);
        alert('Unexpected error during import.');
      } finally {
        console.groupEnd();
        e.target.value = '';
      }
    });
    file._wired = true;
  }

  // 1) fixed fields
  const fixedOrder = [
    ['Station ID', stn.station_id],
    ['Category',   stn.asset_type],
    ['Site Name',  stn.name],
    ['Province',   stn.province],
    ['Latitude',   stn.lat],
    ['Longitude',  stn.lon],
    ['Status',     stn.status],
  ];
  // 2) extra “Section – Field” keys
  const extras = {};
  Object.keys(stn).forEach(key => {
    if (!key.includes(' – ')) return;
    const [section, field] = key.split(' – ');
    extras[section] = extras[section] || {};
    extras[section][field] = stn[key];
  });

  // 3) build HTML
  let html = '';
  html += '<div class="station-section">';
  html += '<h3>General Information</h3><table>';
  fixedOrder.forEach(([label, val]) => {
    html += `<tr><th>${label}:</th><td>${val != null ? val : ''}</td></tr>`;
  });
  html += '</table></div>';

  Object.entries(extras).forEach(([section, fields]) => {
    html += `<div class="station-section"><h3>${section}</h3><table>`;
    Object.entries(fields).forEach(([fld, val]) => {
      html += `<tr><th>${fld}:</th><td>${val != null ? val : ''}</td></tr>`;
    });
    html += '</table></div>';
  });

  body.innerHTML = html;

}

document.addEventListener('DOMContentLoaded', async () => {

  // ─── Show-in-List toggle ─────────────────────────────────────────────────
  const chkShowList = document.getElementById('chkShowList');
  const tbody = document.querySelector('#stationTable tbody');

  // ─── Helper: read which filters are checked ────────────────────────────
  function getActiveFilters() {
    const locations = Array.from(
      document.querySelectorAll('.filter-checkbox.location:checked')
    ).map(cb => cb.value);
    const assetTypes = Array.from(
      document.querySelectorAll('.filter-checkbox.asset-type:checked')
    ).map(cb => cb.value);
    return { locations, assetTypes };
  }


  // ─── Show-in-List rendering ──────────────────────────────────────────────
  async function renderList() {
    const tbody = document.querySelector('#stationTable tbody');
    tbody.innerHTML = '';

    // Fetch all station data
    const data = await window.electronAPI.getStationData();

    // Determine which locations and asset-types are checked
    const activeLocations = Array.from(
      document.querySelectorAll('.filter-checkbox.location:checked')
    ).map(cb => cb.value);
    const activeAssetTypes = Array.from(
      document.querySelectorAll('.filter-checkbox.asset-type:checked')
    ).map(cb => cb.value);

    // Filter, sort, and render rows
    data
      .filter(stn =>
        activeLocations.includes(stn.province) &&
        activeAssetTypes.includes(stn.asset_type)
      )
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .forEach(stn => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.innerHTML = `
          <td>${stn.station_id}</td>
          <td>${stn.asset_type}</td>
          <td>
            <a href="#" class="station-link" data-id="${stn.station_id}"
               style="color:blue; text-decoration:underline;">
              ${stn.name}
            </a>
          </td>
          <td>${stn.lat}</td>
          <td>${stn.lon}</td>
          <td>${stn.status}</td>
        `;
        // Hover to update RHS details
        tr.addEventListener('mouseover', () => showStationDetails(stn));
        // Click link to open full station page
        tr.querySelector('.station-link').addEventListener('click', e => {
          e.preventDefault();
          loadStationPage(stn.station_id);
        });
        tbody.appendChild(tr);
      });
  }

  // Initial population of the list
  renderList();

  // Re-render whenever any filter checkbox changes
  document.getElementById('filterTree')
          .addEventListener('change', renderList);
  
  window.renderList = renderList;
});