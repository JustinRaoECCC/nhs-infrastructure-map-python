// frontend/js/dashboard.js
document.addEventListener('DOMContentLoaded', () => {
  const btnDashboard      = document.getElementById('btn-dashboard-view');
  const btnMapView        = document.getElementById('btn-map-view');
  const mapContainer      = document.getElementById('mapContainer');
  const rightPanel        = document.getElementById('rightPanel');
  const dashPlaceholder   = document.getElementById('dashboardContentContainer');
  const stationPlaceholder = document.getElementById('stationContentContainer');

  // Fetch & show dashboard (once)
  async function showDashboard() {
    mapContainer.style.display    = 'none';
    rightPanel.style.display      = 'none';
    if (!dashPlaceholder.innerHTML.trim()) {
      const html = await fetch('dashboard.html').then(r => r.text());
      dashPlaceholder.innerHTML = html;
      initDashboardUI();
    }
    dashPlaceholder.style.display   = 'block';
    stationPlaceholder.style.display = 'none';
  }

  // Return to map
  btnMapView.addEventListener('click', e => {
    e.preventDefault();
    dashPlaceholder.style.display    = 'none';
    stationPlaceholder.style.display = 'none';
    mapContainer.style.display       = '';
    rightPanel.style.display         = '';
  });

  btnDashboard.addEventListener('click', e => {
    e.preventDefault();
    showDashboard();
  });

  // Init tab switching & parameter logic
  async function initDashboardUI() {
    const tabs     = dashPlaceholder.querySelectorAll('.dashboard-tab');
    const contents = dashPlaceholder.querySelectorAll('.dashboard-content');
    const paramContainer = dashPlaceholder.querySelector('#paramContainer');
    const statsDiv   = dashPlaceholder.querySelector('#paramStats');
    const addBtn    = dashPlaceholder.querySelector('#addParamBtn');
    const saveBtn   = dashPlaceholder.querySelector('#saveParamsBtn');
    const paramsTableBody = dashPlaceholder.querySelector('#paramsTable tbody');

    // Tab clicks (load panels on demand)
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        contents.forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        dashPlaceholder.querySelector('#'+tab.dataset.target)
                       .classList.add('active');
        if (tab.dataset.target === 'workplan') {
          loadWorkplan();
        }
      });
    });

    // Row builder
    function makeRow(param='', weight=1) {
      const row = document.createElement('div');
      row.className = 'param-row';
      row.innerHTML = `
        <input type="text" class="param-name" placeholder="Parameter name" value="${param}" />
        <select class="param-weight"></select>
        <button class="deleteParamBtn">×</button>
      `;
      // fill weight 1–10
      const sel = row.querySelector('.param-weight');
      for (let i=1; i<=10; i++) {
        const opt = document.createElement('option');
        opt.value = opt.textContent = i;
        if (i===weight) opt.selected = true;
        sel.appendChild(opt);
      }
      // delete handler
      row.querySelector('.deleteParamBtn').addEventListener('click', () => {
        paramContainer.removeChild(row);
      });
      return row;
    }

    // ── Display total + each weight in the grey box ──────────────────────
    function renderParamStats(params) {
      const total = params.reduce((sum, p) => sum + p.weight, 0);
      statsDiv.innerHTML = `
        <p><strong>Total weight:</strong> ${total}</p>
        <ul>
          ${params.map(p => `<li>${p.parameter}: ${p.weight}</li>`).join('')}
        </ul>
      `;
    }

    // Load existing into editor
    const existing = await eel.get_algorithm_parameters()();
    existing.forEach(e => {
      paramContainer.appendChild(makeRow(e.parameter, e.weight));
    });
    // immediately show total + weights
    renderParamStats(existing);

    // Add new row
    addBtn.addEventListener('click', () => {
      paramContainer.appendChild(makeRow());
    });

    // Save changes
    saveBtn.addEventListener('click', async () => {
      const toSave = [];
      paramContainer.querySelectorAll('.param-row').forEach(r => {
        const p = r.querySelector('.param-name').value.trim();
        const w = +r.querySelector('.param-weight').value;
        if (p) toSave.push({ parameter: p, weight: w });
      });
      await eel.save_algorithm_parameters(toSave)();
      renderParamStats(toSave);
    });

    // Populate the read‑only table
    async function loadTable() {
      paramsTableBody.innerHTML = '';
      const rows = await eel.get_algorithm_parameters()();
      rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${r.parameter}</td><td>${r.weight}</td>`;
        paramsTableBody.appendChild(tr);
      });
    }
  }

  // Map‐marker → station switcher (unchanged from prior)
  document.body.addEventListener('click', async e => {
    const link = e.target.closest('.popup-link');
    if (!link) return;
    e.preventDefault();
    const stationId = link.dataset.id;
    mapContainer.style.display    = 'none';
    rightPanel.style.display      = 'none';
    dashPlaceholder.style.display = 'none';
    loadStationPage(stationId);
  });

    // ─── Workplan loader & saver ────────────────────────────────────────
    const wpContainer   = dashPlaceholder.querySelector('#workplanContainer');
    const wpInputs      = Array.from(wpContainer.querySelectorAll('.wp-value'));
    const saveWPBtn     = dashPlaceholder.querySelector('#saveWorkplanBtn');

    // load saved workplan details and build dynamic table
    async function loadWorkplan() {
      // 1) fill the top‑pane fields
      const entries = await eel.get_workplan_details()();
      entries.forEach(e => {
        const inp = wpContainer.querySelector(`.wp-value[data-key="${e.parameter}"]`);
        if (inp) inp.value = e.value ?? '';
      });

      // 2) fetch parameters & build headers
      const params = await eel.get_algorithm_parameters()();
      const hdrRow = dashPlaceholder.querySelector('#workplanHeaders');
      hdrRow.innerHTML = '';
      // always start with Site Name / Station Number
      ['Site Name','Station Number','Operation', ...params.map(p => p.parameter)]
        .forEach(text => {
          const th = document.createElement('th');
          th.textContent = text;
          hdrRow.appendChild(th);
        });

      dashPlaceholder.querySelector('#workplanBody').innerHTML = '';
    }

    // initial load when UI first initialized
    loadWorkplan();

    // save button writes back to Excel
    saveWPBtn.addEventListener('click', async () => {
      const out = wpInputs.map(inp => ({
        parameter: inp.dataset.key,
        value:     inp.value
      }));
      await eel.save_workplan_details(out)();
    });



});

