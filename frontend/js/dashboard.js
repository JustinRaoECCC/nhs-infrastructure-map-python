// frontend/js/dashboard.js
document.addEventListener('DOMContentLoaded', () => {

  // Hide the grey table entirely (we’ll render params above the buttons)
  const table = document.querySelector('#paramsTable');
  if (table) table.style.display = 'none';

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
  btnDashboard.addEventListener('click', e => {
    e.preventDefault();
    showDashboard();
  });

  // ─── Initialize Dashboard UI ───────────────────────────────────────────────
  async function initDashboardUI() {
    // ─── Elements ─────────────────────────────────────────────────────────────
    const tabs               = document.querySelectorAll('.dashboard-tab');
    const contents           = document.querySelectorAll('.dashboard-content');
    const paramContainer     = document.querySelector('#paramContainer');
    const statsDiv           = document.querySelector('#paramStats');
    const addBtn             = document.querySelector('#addParamBtn');
    const saveParamsBtn      = document.querySelector('#saveParamsBtn');
    const paramsTableBody    = document.querySelector('#paramsTable tbody');
    const addParamModal      = document.querySelector('#addParamModal');
    const closeModalBtn      = document.querySelector('#closeAddParamModal');
    const cancelParamBtn     = document.querySelector('#cancelParamBtn');
    const saveParamBtn       = document.querySelector('#saveParamBtn');
    const paramNameInput     = document.querySelector('#paramNameInput');
    const paramConditionSel  = document.querySelector('#paramConditionSelect');
    const paramMaxWeightInp  = document.querySelector('#paramMaxWeight');
    const addOptionBtn       = document.querySelector('#addOptionBtn');
    const optionsList        = document.querySelector('#optionsList');
    const paramAssetFilter   = document.querySelector('#paramAssetFilter');
    const filterTree         = document.getElementById('filterTree');

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

    // ─── Helpers: build a display‐row for saved parameters ───────────────────────
    function makeDisplayRow({ applies_to, parameter, condition, max_weight, options }) {
      const row = document.createElement('div');
      row.className = 'param-row';
      // embed the applies_to and max_weight in data-attributes:
      row.dataset.appliesto  = applies_to;
      row.dataset.maxWeight  = max_weight;
      row.innerHTML = `
        <input type="text" class="param-name" value="${parameter}" disabled />
        <select class="param-condition" disabled>
          <option value="${condition}" selected>${condition}</option>
        </select>
        <select class="param-options"></select>
        <span class="param-weight-display"></span>
        <button class="deleteParamBtn">×</button>
      `;


      // fill & disable condition dropdown
      const condSel = row.querySelector('.param-condition');
      ['n/a','IF','WHILE'].forEach(optVal => {
        const opt = document.createElement('option');
        opt.value = opt.textContent = optVal;
        if (optVal === condition) opt.selected = true;
        condSel.appendChild(opt);
      });
      condSel.disabled = true;

      // populate the new options dropdown and wire up the weight display
      const optSel = row.querySelector('.param-options');
      const weightDisplay = row.querySelector('.param-weight-display');
      options.forEach(o => {
        const opt = document.createElement('option');
        opt.value       = o.weight;
        opt.textContent = o.label;
        if (o.selected) {
          opt.selected = true;
          weightDisplay.textContent = o.weight;
        }
        optSel.appendChild(opt);
      });
      // if none was explicitly marked, fall back to first
      if (!options.some(o=>o.selected) && options.length) {
        optSel.selectedIndex    = 0;
        weightDisplay.textContent = options[0].weight;
      }
      // update display when the user changes selection
      optSel.addEventListener('change', () => {
        weightDisplay.textContent = optSel.value;
      });

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

    // ─── Load existing parameters into the display panel ───────────────────────
    const existing = await eel.get_algorithm_parameters()();
    // clear any old content
    statsDiv.innerHTML = '';
    paramContainer.innerHTML = '';

    // Group the flat rows by parameter+condition → build one dropdown entry per group
    const grouped = {};
    existing.forEach(e => {
      const key = `${e.parameter}||${e.condition}`;
      if (!grouped[key]) {
        grouped[key] = {
          applies_to: e.applies_to,
          parameter:  e.parameter,
          condition:  e.condition,
          max_weight: e.max_weight,
          options:    []
        };
      }
      grouped[key].options.push({
        label:    e.option,
        weight:   e.weight,
        selected: e.selected
      });
    });


    // Now render one row per parameter group
    Object.values(grouped).forEach(grp => {
      const row = makeDisplayRow(grp);
      paramContainer.appendChild(row);
    });

    // ─── Helpers: build an option row inside modal ─────────────────────────────
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

      const deleteBtn    = row.querySelector('.deleteOptionBtn');
      const nameInput    = row.querySelector('.option-name');
      const weightSelect = row.querySelector('.option-weight');

      nameInput.value = label;
      function populateWeights() {
        const max = Math.max(1, parseInt(paramMaxWeightInp.value) || 1);
        // remember previous choice (or fallback to initial weight)
        const prev = parseInt(weightSelect.value, 10) || weight;
        weightSelect.innerHTML = '';
        for (let i = 1; i <= max; i++) {
          const opt = document.createElement('option');
          opt.value = opt.textContent = i;
          weightSelect.appendChild(opt);
        }
        // restore to previous, capped by new max
        weightSelect.value = Math.min(prev, max);
      }
 
      paramMaxWeightInp.addEventListener('change', populateWeights);
      populateWeights();
      // custom weights are managed via the central Custom Weights modal

      deleteBtn.addEventListener('click', () => row.remove());
      return row;
    }

    // ─── Populate “Applies To” by cloning filter-tree asset-type checkboxes ────
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

    // ─── Add new Option row in modal ──────────────────────────────────────────
    addOptionBtn.addEventListener('click', () => {
      optionsList.appendChild(makeOptionRow());
    });

    // ─── Open the Add-Parameter modal ─────────────────────────────────────────
    addBtn.addEventListener('click', () => {
      paramNameInput.value    = '';
      paramConditionSel.value = 'n/a';
      paramMaxWeightInp.value = '3';
      optionsList.innerHTML   = '';
      optionsList.appendChild(makeOptionRow());
      populateParamAssetFilter();
      addParamModal.style.display = 'flex';
    });

    // ─── Close modal helpers ──────────────────────────────────────────────────
    function closeAddParamModal() {
      addParamModal.style.display = 'none';
    }
    closeModalBtn.addEventListener('click', closeAddParamModal);
    cancelParamBtn.addEventListener('click', closeAddParamModal);
    addParamModal.addEventListener('click', e => {
      if (e.target === addParamModal) closeAddParamModal();
    });

    const btnOpenCustomWeightModal   = document.getElementById('addCustomWeightBtn');
    const customWeightModal      = document.getElementById('customWeightModal');
    const closeCustomWeightModal = document.getElementById('closeCustomWeightModal');
    const cancelCustomWeight     = document.getElementById('cancelCustomWeight');
    const confirmCustomWeight    = document.getElementById('confirmCustomWeight');
    const selectCustomWeight     = document.getElementById('selectCustomWeight');
    const inputNewCustomWeight   = document.getElementById('inputNewCustomWeight');
    const btnSaveCustomWeight    = document.getElementById('btnSaveCustomWeight');

    // Open the Custom Weight modal
    btnOpenCustomWeightModal.addEventListener('click', async () => {
      // populate dropdown from lookup
      selectCustomWeight.innerHTML = '<option value="">-- select weight --</option>';
      const weights = await eel.get_custom_weights()();
      weights.forEach(w => {
        const opt = document.createElement('option');
        opt.value = opt.textContent = w.weight;
        selectCustomWeight.appendChild(opt);
      });
      inputNewCustomWeight.value = '';
      customWeightModal.style.display = 'flex';
    });

    // Add a new weight into lookups and dropdown
    btnSaveCustomWeight.addEventListener('click', async () => {
      const newWt = inputNewCustomWeight.value.trim();
      if (!newWt) return alert('Please enter a custom weight.');
      await eel.add_custom_weight(newWt, true)();
      const opt = document.createElement('option');
      opt.value = opt.textContent = newWt;
      selectCustomWeight.appendChild(opt);
      selectCustomWeight.value = newWt;
    });

    // Confirm selection and apply to all option-weight selects
    confirmCustomWeight.addEventListener('click', () => {
      const chosen = selectCustomWeight.value;
      if (!chosen) return alert('Please select or add a custom weight.');
      document.querySelectorAll('.option-weight').forEach(sel => {
        if (![...sel.options].some(o => o.value === chosen)) {
          const o = document.createElement('option');
          o.value = o.textContent = chosen;
          sel.appendChild(o);
        }
        sel.value = chosen;
      });
      customWeightModal.style.display = 'none';
    });

    // Close handlers (keep these)
    [closeCustomWeightModal, cancelCustomWeight].forEach(btn =>
      btn.addEventListener('click', () => {
        customWeightModal.style.display = 'none';
      })
    );
    customWeightModal.addEventListener('click', e => {
      if (e.target === customWeightModal) customWeightModal.style.display = 'none';
    });

    // ─── Save Parameter from modal: write one row per AppliesTo × Option ─────
    saveParamBtn.addEventListener('click', async () => {
      const parameter = paramNameInput.value.trim();
      const condition = paramConditionSel.value;
      const maxWeight = parseInt(paramMaxWeightInp.value, 10) || 1;

      const options = Array.from(
        optionsList.querySelectorAll('.option-row')
      ).map(r => ({
        label:  r.querySelector('.option-name').value.trim(),
        weight: parseInt(r.querySelector('.option-weight').value, 10)
      }));

      const applies = Array.from(
        paramAssetFilter.querySelectorAll('input[type="checkbox"]:checked')
      ).map(cb => ({
        company:   cb.dataset.company,
        location:  cb.dataset.location,
        assetType: cb.dataset.assetType
      }));

      // build the rows to persist
      const rows = [];
      applies.forEach(a => {
        options.forEach(o => {
          rows.push({
            applies_to:  `${a.company} → ${a.location} → ${a.assetType}`,
            parameter:   parameter,
            condition:   condition,
            max_weight:  maxWeight,
            option:      o.label,
            weight:      o.weight
          });
        });
      });

      // persist to lookups.xlsx via eel
      await eel.save_algorithm_parameters(rows)();
      // immediately display the newly added parameter
      paramContainer.appendChild(
        makeDisplayRow({ parameter, condition, options })
      );
      closeAddParamModal();
    });

    // ─── Save edited parameters (older list panel) ───────────────────────────
    saveParamsBtn.addEventListener('click', async () => {
      // Gather every option row, reading from our data-attributes
      const toSave = Array.from(paramContainer.querySelectorAll('.param-row'))
        .flatMap(r => {
          const applies = r.dataset.appliesto;
          const maxW    = parseInt(r.dataset.maxWeight, 10);
          const param   = r.querySelector('.param-name').value.trim();
          const cond    = r.querySelector('.param-condition').value;
          return Array.from(r.querySelectorAll('.param-options option'))
            .map(opt => ({
              applies_to: applies,
              parameter:  param,
              condition:  cond,
              max_weight: maxW,
              option:     opt.textContent,
              weight:     parseInt(opt.value, 10),
              selected:   opt.selected
            }));
        });


      // send all rows back to Python
      await eel.save_algorithm_parameters(toSave)();
      renderParamStats(toSave);
    });
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
