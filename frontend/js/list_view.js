// frontend/js/list_view.js

// ─── Quick‐view renderer (pulled from map_view.js) ──────────────────────
function showStationDetails(stn) {
  const container = document.getElementById('station-details');
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

  container.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', async () => {
  // 1) Build the filter tree (reuses filters.js)
  if (typeof buildFilterTree === 'function') {
    await buildFilterTree();
  }

  // 2) Load and render the station list
  const data = await window.electronAPI.getStationData();
  // sort A→Z by site name
  data.sort((a, b) => {
    const n1 = (a.name || '').toLowerCase();
    const n2 = (b.name || '').toLowerCase();
    return n1.localeCompare(n2);
  });

  const tbody = document.querySelector('#stationTable tbody');
  tbody.innerHTML = '';

  data.forEach(stn => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';

    // helper to create td
    function td(text, innerHTML) {
      const cell = document.createElement('td');
      if (innerHTML) cell.innerHTML = innerHTML;
      else cell.textContent = text != null ? text : '';
      return cell;
    }

    tr.appendChild(td(stn.station_id));
    tr.appendChild(td(stn.asset_type));
    // Site Name as blue underlined link
    const linkHTML = `<a href="#" class="station-link" data-id="${stn.station_id}"
                          style="color:blue; text-decoration:underline;">
                        ${stn.name}
                      </a>`;
    tr.appendChild(td(null, linkHTML));
    tr.appendChild(td(stn.lat));
    tr.appendChild(td(stn.lon));
    tr.appendChild(td(stn.status));

    // On hover, update the RHS details
    tr.addEventListener('mouseover', () => {
      if (typeof showStationDetails === 'function') {
        showStationDetails(stn);
      } else {
        // fallback: use station.js’s loadStationPage snippet to fill details
        // here we just call it into the details div
        // (assumes station.js wired up the same showStationDetails)
      }
    });

    // Clicking the link navigates to the full station page
    tr.querySelector('.station-link').addEventListener('click', e => {
      e.preventDefault();
      const sid = e.currentTarget.getAttribute('data-id');
      // station.js exposes loadStationPage
      if (typeof loadStationPage === 'function') {
        loadStationPage(sid);
      }
    });

    tbody.appendChild(tr);
  });
});
