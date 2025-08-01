// frontend/js/dashboard.js
document.addEventListener('DOMContentLoaded', () => {
  const btnDashboard       = document.getElementById('btn-dashboard-view');
  const btnMapView         = document.getElementById('btn-map-view');
  const mapContainer       = document.getElementById('mapContainer');
  const rightPanel         = document.getElementById('rightPanel');
  const dashPlaceholder    = document.getElementById('dashboardContentContainer');
  const stationPlaceholder = document.getElementById('stationContentContainer');

  // ─── Show Dashboard ────────────────────────────────────────────────────────
  async function showDashboard() {
    mapContainer.style.display       = 'none';
    rightPanel.style.display         = 'none';
    stationPlaceholder.style.display = 'none';

    if (!dashPlaceholder.innerHTML.trim()) {
      const html = await fetch('dashboard.html').then(r => r.text());
      dashPlaceholder.innerHTML = html;
      initDashboardUI();
    }
    dashPlaceholder.style.display = 'block';
  }

  // ─── Return to Map ─────────────────────────────────────────────────────────
  btnMapView.addEventListener('click', e => {
    e.preventDefault();
    dashPlaceholder.style.display    = 'none';
    stationPlaceholder.style.display = 'none';
    mapContainer.style.display       = '';
    rightPanel.style.display         = '';
  });
  btnDashboard.addEventListener('click', e => { e.preventDefault(); showDashboard(); });

  // ─── Initialize Dashboard UI ───────────────────────────────────────────────
  async function initDashboardUI() {
    // ─── Elements ─────────────────────────────────────────────────────────────
    // Tabs
    const tabs     = document.querySelectorAll('.dashboard-tab');
    const contents = document.querySelectorAll('.dashboard-content');
    // Parameter editor (left side)
    const paramContainer    = document.querySelector('#paramContainer');
    const statsDiv          = document.querySelector('#paramStats');
    const addBtn            = document.querySelector('#addParamBtn');
    const saveParamsBtn     = document.querySelector('#saveParamsBtn');
    // Read-only parameter list (bottom pane)
    const paramsTableBody   = document.querySelector('#paramsTable tbody');
    // Add-Parameter modal
    const addParamModal     = document.querySelector('#addParamModal');
    const closeModalBtn     = document.querySelector('#closeAddParamModal');
    const cancelParamBtn    = document.querySelector('#cancelParamBtn');
    const saveParamBtn      = document.querySelector('#saveParamBtn');
    const paramNameInput    = document.querySelector('#paramNameInput');
    const paramConditionSel = document.querySelector('#paramConditionSelect');
    const paramMaxWeightInp = document.querySelector('#paramMaxWeight');
    const addOptionBtn      = document.querySelector('#addOptionBtn');
    const optionsList       = document.querySelector('#optionsList');
    // New: Applies-To filter clone
    const paramAssetFilter  = document.querySelector('#paramAssetFilter');
    const filterTree        = document.getElementById('filterTree');

    // ─── Tab switching ─────────────────────────────────────────────────────────
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        contents.forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.target).classList.add('active');
        if (tab.dataset.target === 'workplan') loadWorkplan();
      });
    });

    // ─── Helpers for building rows ─────────────────────────────────────────────
    function makeRow(parameter = '', weight = 1) {
      const row = document.createElement('div');
      row.className = 'param-row';
      row.innerHTML = `
        <input type="text" class="param-name"
              placeholder="Parameter name" value="${parameter}" />
        <select class="param-weight"></select>
        <button class="deleteParamBtn">×</button>
      `;
      const weightSel = row.querySelector('.param-weight');
      for (let i = 1; i <= 10; i++) {
        const opt = document.createElement('option');
        opt.value = opt.textContent = i;
        if (i === weight) opt.selected = true;
        weightSel.appendChild(opt);
      }
      row.querySelector('.deleteParamBtn')
        .addEventListener('click', () => row.remove());
      return row;
    }

    function renderParamStats(params) {
      const total = params.reduce((sum, p) => sum + p.weight, 0);
      statsDiv.innerHTML = `
        <p><strong>Total weight:</strong> ${total}</p>
        <ul>
          ${params.map(p => `<li>${p.parameter}: ${p.weight}</li>`).join('')}
        </ul>
      `;
    }

    // ─── Load existing parameters into editor ─────────────────────────────────
    const existing = await eel.get_algorithm_parameters()();
    existing.forEach(e => paramContainer.appendChild(makeRow(e.parameter, e.weight)));
    renderParamStats(existing);

    // ─── Option-to-Weight row builder for the modal ─────────────────────────────
    function makeOptionRow(label = '', weight = 1) {
      const row = document.createElement('div');
      row.className = 'option-row';
      row.style = 'display:flex; align-items:center; margin-top:0.5em;';
      row.innerHTML = `
        <input type="text" class="option-name"
              placeholder="Option label"
              style="flex:1; margin-right:0.5em;" />
        <select class="option-weight"
                style="width:5em; margin-right:0.5em;"></select>
        <button class="deleteOptionBtn" style="color:red;">×</button>
      `;
      const nameInput    = row.querySelector('.option-name');
      const weightSelect = row.querySelector('.option-weight');
      const deleteBtn    = row.querySelector('.deleteOptionBtn');

      nameInput.value = label;

      function populateWeights() {
        const max = Math.max(1, parseInt(paramMaxWeightInp.value) || 1);
        weightSelect.innerHTML = '';
        for (let i = 1; i <= max; i++) {
          const opt = document.createElement('option');
          opt.value = opt.textContent = i;
          weightSelect.appendChild(opt);
        }
        weightSelect.value = Math.min(weight, max);
      }
      paramMaxWeightInp.addEventListener('change', populateWeights);
      populateWeights();

      deleteBtn.addEventListener('click', () => row.remove());
      return row;
    }

    // ─── Populate “Applies To” filter by cloning the left-tree checkboxes ───────
    function populateParamAssetFilter() {
      paramAssetFilter.innerHTML = '';
      filterTree.querySelectorAll('.filter-checkbox.asset-type').forEach(box => {
        const company   = box.dataset.company;
        const loc       = box.dataset.location;
        const assetType = box.value;

        const cb = document.createElement('input');
        cb.type              = 'checkbox';
        cb.checked           = box.checked;
        cb.dataset.company   = company;
        cb.dataset.location  = loc;
        cb.dataset.assetType = assetType;

        const lbl = document.createElement('label');
        lbl.style.marginLeft = '0.3em';
        lbl.textContent      = `${company} → ${loc} → ${assetType}`;

        const row = document.createElement('div');
        row.append(cb, lbl);
        paramAssetFilter.appendChild(row);
      });
    }

    // ─── “+ Add Option” in modal ───────────────────────────────────────────────
    addOptionBtn.addEventListener('click', () => {
      optionsList.appendChild(makeOptionRow());
    });

    // ─── Open Add-Parameter modal ──────────────────────────────────────────────
    addBtn.addEventListener('click', () => {
      // reset form fields
      paramNameInput.value    = '';
      paramConditionSel.value = 'n/a';
      paramMaxWeightInp.value = '3';
      optionsList.innerHTML   = '';
      optionsList.appendChild(makeOptionRow());
      // populate the applies-to tree
      populateParamAssetFilter();
      addParamModal.style.display = 'flex';
    });

    // ─── Close modal helpers ───────────────────────────────────────────────────
    function closeAddParamModal() {
      addParamModal.style.display = 'none';
    }
    closeModalBtn.addEventListener('click', closeAddParamModal);
    cancelParamBtn.addEventListener('click', closeAddParamModal);
    addParamModal.addEventListener('click', e => {
      if (e.target === addParamModal) closeAddParamModal();
    });

    // ─── Save a new parameter (collect name, condition, options, appliesTo) ───
    saveParamBtn.addEventListener('click', async () => {
      const parameter = paramNameInput.value.trim();
      const condition = paramConditionSel.value;
      const maxWeight = parseInt(paramMaxWeightInp.value, 10) || 1;
      // gather options
      const options = Array.from(optionsList.querySelectorAll('.option-row')).map(r => ({
        label:  r.querySelector('.option-name').value.trim(),
        weight: parseInt(r.querySelector('.option-weight').value, 10)
      }));
      // gather appliesTo rules
      const appliesTo = Array.from(
        paramAssetFilter.querySelectorAll('input[type="checkbox"]:checked')
      ).map(cb => ({
        location:  cb.dataset.location,
        assetType: cb.dataset.assetType
      }));

      // TODO: send { parameter, condition, maxWeight, options, appliesTo }
      // to your backend (e.g. extend save_algorithm_parameters)

      closeAddParamModal();
    });

    // ─── Save edited parameters (writes full list back to disk) ────────────────
    saveParamsBtn.addEventListener('click', async () => {
      const toSave = Array.from(paramContainer.querySelectorAll('.param-row')).map(r => ({
        parameter: r.querySelector('.param-name').value.trim(),
        weight:    parseInt(r.querySelector('.param-weight').value, 10)
      }));
      await eel.save_algorithm_parameters(toSave)();
      renderParamStats(toSave);
      loadTable();  // keep the read-only table in sync
    });

    // ─── Populate the read-only bottom table ───────────────────────────────────
    async function loadTable() {
      paramsTableBody.innerHTML = '';
      const rows = await eel.get_algorithm_parameters()();
      rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${r.parameter}</td><td>${r.weight}</td>`;
        paramsTableBody.appendChild(tr);
      });
    }
    // initial fill
    loadTable();
  }

  // ─── Station switcher (unchanged) ───────────────────────────────────────
  document.body.addEventListener('click', async e => {
    const link = e.target.closest('.popup-link');
    if (!link) return;
    e.preventDefault();
    const stationId = link.dataset.id;
    mapContainer.style.display       = 'none';
    rightPanel.style.display         = 'none';
    dashPlaceholder.style.display    = 'none';
    stationPlaceholder.style.display = 'none';
    loadStationPage(stationId);
  });

  // ─── Workplan loader & saver (unchanged) ────────────────────────────────
  const wpContainer = dashPlaceholder.querySelector('#workplanContainer');
  const wpInputs    = wpContainer
    ? Array.from(wpContainer.querySelectorAll('.wp-value'))
    : [];
  const saveWPBtn = dashPlaceholder.querySelector('#saveWorkplanBtn');

  async function loadWorkplan() {
    if (!wpContainer) return;
    const entries = await eel.get_workplan_details()();
    entries.forEach(e => {
      const inp = wpContainer.querySelector(`.wp-value[data-key="${e.parameter}"]`);
      if (inp) inp.value = e.value ?? '';
    });
    const params = await eel.get_algorithm_parameters()();
    const hdrRow = dashPlaceholder.querySelector('#workplanHeaders');
    hdrRow.innerHTML = '';
    ['Site Name','Station Number','Operation', ...params.map(p => p.parameter)]
      .forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        hdrRow.appendChild(th);
      });
    dashPlaceholder.querySelector('#workplanBody').innerHTML = '';
  }

  if (saveWPBtn) {
    saveWPBtn.addEventListener('click', async () => {
      const out = wpInputs.map(inp => ({
        parameter: inp.dataset.key,
        value:     inp.value
      }));
      await eel.save_workplan_details(out)();
    });
  }
});
