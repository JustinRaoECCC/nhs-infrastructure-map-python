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

    // Ensure the dashboard markup exists *before* we touch #optimization
    if (!dashPlaceholder.innerHTML.trim()) {
      const html = await fetch('dashboard.html').then(r => r.text());
      dashPlaceholder.innerHTML = html;
      initDashboardUI();
    }
    dashPlaceholder.style.display = 'block';

    // Now that markup exists, resolve the optimization pane
    const optRoot = dashPlaceholder.querySelector('#optimization');
    const optPane = optRoot && (optRoot.querySelector('.opt-container') || optRoot);
    const opt2Pane = dashPlaceholder.querySelector('#optimization2 .opt2-container') || dashPlaceholder.querySelector('#optimization2');

    // Clear optimization results each time dashboard is shown
    if (optPane) optPane.querySelectorAll('pre, ol, table.opt-table').forEach(p => p.remove());

    // ➕ ensure the Optimize button is visible again when returning to this page
    const optBtn = dashPlaceholder.querySelector('#optimizeBtn');
    if (optBtn) optBtn.style.display = '';

    // Start watching for optimization results being rendered
    startOptimizationObserver();

    // ── Optimization II: Geographical Order Workplan (smiley stub) ──────────
    const geoBtn = dashPlaceholder.querySelector('#optimizeGeoBtn');
    if (geoBtn) {
      geoBtn.addEventListener('click', async () => {
       // Try calling backend stub (safe if not imported yet)
        try {
          if (typeof eel?.run_geographical_algorithm === 'function') {
            await eel.run_geographical_algorithm()();
          }
        } catch (e) { /* no-op for now */ }
        if (opt2Pane) opt2Pane.innerHTML = '<div style="font-size:72px; line-height:1; margin:24px 0;">😄</div>';
      });
    }


    // Optional lookup for Station Name -> fill this with your data.
    // Example: { "08GA022": "LB Platform", "08BE004": "HS Ladder" }
    const stationNameLookup = window.stationNameLookup || {};

    /**
     * Turn the existing <ol><li>…</li></ol> output (or a plain array of lines)
     * into a table with columns:
     * Rank | Station Name | Station ID | Operation | Summed Value
     */
    function renderOptimizationTable(inputLines) {
      // use the same resolved pane (fallback to query if needed)
      const pane =
        (typeof optPane !== 'undefined' && optPane) ||
        dashPlaceholder.querySelector('#optimization .opt-container') ||
        dashPlaceholder.querySelector('#optimization');
      if (!pane) return;

      // If no lines were passed, try to read from an <ol> inside the pane.
      let lines = inputLines;
      const existingList = !lines && pane.querySelector('ol');
      if (!lines && existingList) {
        lines = [...existingList.querySelectorAll('li')].map(li => li.textContent.trim());
      }
      if (!Array.isArray(lines) || !lines.length) return;

      // Parse lines -> rows
      const rows = lines.map(parseOptimizationLine).filter(Boolean);

      // Sort by numeric summed value (desc) and assign rank
      rows.sort((a, b) => (b.summedValue ?? 0) - (a.summedValue ?? 0));
      rows.forEach((r, i) => (r.rank = i + 1));

      // Build table
      const table = document.createElement('table');
      table.className = 'opt-table';
      table.innerHTML = `
        <thead>
          <tr>
            <th class="rank">Rank</th>
            <th>Station Name</th>
            <th class="station-id">Station ID</th>
            <th>Operation</th>
            <th class="num">Summed Value</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;

      const tbody = table.querySelector('tbody');
      rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="rank">${r.rank}</td>
          <td>${r.stationName || ''}</td>
          <td>${r.stationId || ''}</td>
          <td>${r.operation || ''}</td>
          <td class="num">${Number.isFinite(r.summedValue) ? r.summedValue.toFixed(2) + '%' : ''}</td>
        `;
        tbody.appendChild(tr);
      });

      // Always replace any prior markup (ol/pre/old table) with the new table
      pane.querySelectorAll('ol, pre, table.opt-table').forEach(el => el.remove());
      pane.appendChild(table);
    }

    /**
     * Parse one line like:
     * "1. 08GA022 | - Fix LB platform flooring mesh tipping hazard | 75%"
     * → { stationId, stationName, operation, summedValue }
     */
    function parseOptimizationLine(line) {
      if (!line) return null;
      let s = line.trim();

      // Strip a leading "1." marker if present
      s = s.replace(/^\s*\d+\.\s*/, '');

      // Pick off the ending percent as Summed Value
      let summedValue = NaN;
      const pctMatch = s.match(/([0-9]+(?:\.[0-9]+)?)\s*%\.?\s*$/);
      if (pctMatch) {
        summedValue = parseFloat(pctMatch[1]);
        s = s.slice(0, pctMatch.index).trim(); // remove the trailing " | 75%"
        s = s.replace(/\|\s*$/, '').trim();    // remove a trailing "|" if any
      }

      // Now expect "StationID | (optional '-') Operation"
      const firstBar = s.indexOf('|');
      let stationId = '', operation = s;
      if (firstBar > -1) {
        stationId = s.slice(0, firstBar).trim();
        operation = s.slice(firstBar + 1).trim().replace(/^-+\s*/, '');
      } else {
        // Fallback: take the first token as stationId
        const firstToken = s.split(/\s+/)[0];
        if (/^[0-9A-Z]{4,}$/.test(firstToken)) {
          stationId = firstToken;
          operation = s.slice(firstToken.length).trim().replace(/^[|–-]\s*/, '');
        }
      }

      const stationName = stationNameLookup[stationId] || '';
      return { stationId, stationName, operation, summedValue };
    }

    /**
     * Convert any <ol> or <pre> that shows up in the optimization pane
     * into the formatted table automatically.
     */
    function startOptimizationObserver() {
      if (!optPane) return; // optPane is set after HTML is injected

      // Try once immediately in case content is already there
      tryRenderFromPane();

      const obs = new MutationObserver(() => tryRenderFromPane());
      obs.observe(optPane, { childList: true, subtree: true });

      function tryRenderFromPane() {
        if (optPane.querySelector('table.opt-table')) return; // already converted

        const list = optPane.querySelector('ol');
        const pre  = optPane.querySelector('pre');
        if (!list && !pre) return;

        const lines = list
          ? [...list.querySelectorAll('li')].map(li => li.textContent.trim())
          : pre.textContent.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

        if (lines.length) renderOptimizationTable(lines);
      }
    }
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

    window.__repairsImportCache = window.__repairsImportCache || [];

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
        <input type="number"
              class="param-percentage"
              min="0" max="100" value="0"
              style="width:60px; margin-left:0.5em;"
              title="Enter % (total should sum to 100)" />%
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

      // when percentage changes, recalc total
      const pctInput = row.querySelector('.param-percentage');
      pctInput.addEventListener('input', recalcPercentageTotal);

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
      if (!filterTree) return; 
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
      // immediately display a single row for the new parameter across all Applies-To
      const applies_to_str = applies
        .map(a => `${a.company} → ${a.location} → ${a.assetType}`)
        .join(', ');
      paramContainer.appendChild(
        makeDisplayRow({
          applies_to: applies_to_str,
          parameter,
          condition,
          max_weight: maxWeight,
          options
        })
      );

      // Rebuild Workplan headers (adds any new parameter columns)
      await loadWorkplan();
      // Backfill from cached import into any newly-added columns
      await populateWorkplanFromImport();


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

      await loadWorkplan();
      await populateWorkplanFromImport();

      renderParamStats(toSave);
    });


    const wpContainer       = dashPlaceholder.querySelector('#workplanContainer');
    const constantsContainer= wpContainer.querySelector('#constantsContainer');
    const saveWPBtn         = dashPlaceholder.querySelector('#saveWorkplanBtn');
    const addConstBtn       = dashPlaceholder.querySelector('#addConstantBtn');

    // ── Helper: build one “constant” row
    function makeConstantRow(field='', value='') {
      const row = document.createElement('div');
      row.className = 'const-row';
      row.style = 'display:flex; align-items:center; margin-bottom:0.5em;';
      // field (no outline)
      const fld = document.createElement('input');
      fld.type = 'text'; fld.className = 'const-field';
      fld.value = field; fld.placeholder = 'Field';
      fld.style = 'border:none; flex:1; margin-right:0.5em;';
      // value (boxed)
      const val = document.createElement('input');
      val.type = 'text'; val.className = 'const-value';
      val.value = value; val.placeholder = 'Value';
      val.style = 'flex:1; margin-right:0.5em;';
      // delete btn
      const del = document.createElement('button');
      del.textContent = '×'; del.addEventListener('click', () => row.remove());
      row.append(fld, val, del);
      return row;
    }


    async function loadWorkplan() {
      if (!wpContainer) return;
      // load constants
      const consts = await eel.get_workplan_constants()();
      constantsContainer.innerHTML = '';
      consts.forEach(c => constantsContainer.append(makeConstantRow(c.field, c.value||'')));
      // Build a UNIQUE list of parameter names (one column per parameter)
      const params = await eel.get_algorithm_parameters()();
      const uniqueParams = [...new Set(params.map(p => p.parameter))];

      // Render headers: fixed 3 + unique parameter columns
      const hdrRow = dashPlaceholder.querySelector('#workplanHeaders');
      hdrRow.innerHTML = '';
      const headers = ['Site Name','Station Number','Operation', ...uniqueParams];
      headers.forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        hdrRow.appendChild(th);
      });

      dashPlaceholder.querySelector('#workplanBody').innerHTML = '';
      await populateWorkplanFromImport();
    }

    if (saveWPBtn) {
      // Save constants back to Excel
      saveWPBtn.addEventListener('click', async () => {
        const toSave = Array.from(constantsContainer.querySelectorAll('.const-row'))
          .map(r => ({
            field: r.querySelector('.const-field').value.trim(),
            value: r.querySelector('.const-value').value
          }));
        await eel.save_workplan_constants(toSave)();
        // (you can still call save_workplan_details(...) here if you need that sheet)
      });

      // Add a new blank constant
      addConstBtn.addEventListener('click', () => {
        constantsContainer.append(makeConstantRow());
      });
    }

    // ─── Optimize Workplan ────────────────────────────────────────────────
    const optimizeBtn = document.getElementById('optimizeBtn');
    if (optimizeBtn) {
      optimizeBtn.addEventListener('click', async () => {
        // 1) Harvest Workplan table (exactly what the user is seeing)
        const hdrRow = document.querySelector('#workplanHeaders');
        const body   = document.querySelector('#workplanBody');
        const headers = Array.from(hdrRow.querySelectorAll('th')).map(th => th.textContent.trim());

        const workplanRows = Array.from(body.querySelectorAll('tr')).map(tr => {
          const cells = Array.from(tr.querySelectorAll('td'));
          const rec = {};
          headers.forEach((h, i) => {
            rec[h] = (cells[i] ? cells[i].textContent : '') || '';
          });
          return rec;
        });

        // 2) Harvest per-parameter Overall weights (%) from the Parameter panel
        const overall = {};
        document.querySelectorAll('.param-row').forEach(row => {
          const pname = row.querySelector('.param-name')?.value?.trim();
          const pct   = parseFloat(row.querySelector('.param-percentage')?.value || '0');
          if (pname) overall[pname] = isFinite(pct) ? pct : 0;
        });

        // 3) Call backend with both pieces
        const payload = { workplan_rows: workplanRows, param_overall: overall };
        const result = await window.electronAPI.optimizeWorkplan(payload);
        console.log('Optimize result:', result);

        // 4) Hide the button until the user leaves and re-enters this page
        optimizeBtn.style.display = 'none';

        // 5) Display a clean ordered ranking under the button
        const optPane = document.querySelector('#optimization .opt-container');
        optPane.querySelectorAll('pre, ol').forEach(p => p.remove());

        const ol = document.createElement('ol');
        ol.style.marginTop = '1em';

        (result?.ranking || []).forEach(item => {
          const li = document.createElement('li');
          // Example: "#1 — STN123  |  Replace cable  |  62.0%"
          const left = [
            item.station_number ? String(item.station_number) : '',
            item.operation ? String(item.operation) : ''
          ].filter(Boolean).join('  |  ');

          li.textContent = `${left}  |  ${item.score}%`;
          ol.appendChild(li);
        });

        if ((result?.ranking || []).length === 0) {
          const li = document.createElement('li');
          li.textContent = 'No items to rank.';
          ol.appendChild(li);
        }

        optPane.appendChild(ol);
      });
    }

      // ─── Import Repairs button (bottom of Workplan) ─────────────────────────
    const importBar = document.createElement('div');
    importBar.style = 'margin-top:12px; display:flex; gap:10px; align-items:center;';

    const importBtn = document.createElement('button');
    importBtn.id = 'btnImportRepairs';
    importBtn.textContent = 'Import Repairs';

    const importInfo = document.createElement('span');
    importInfo.style = 'opacity:.75; font-size:12px;';
    importInfo.textContent = window.__repairsImportCache.length
      ? `Imported ${window.__repairsImportCache.length} rows`
      : 'No file imported';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    fileInput.style.display = 'none';

    importBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
      const f = (e.target.files || [])[0];
      if (!f) return;
      // Read file → base64 (same approach used elsewhere)
      const buf   = await f.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let b of bytes) bin += String.fromCharCode(b);
      const b64 = btoa(bin);

      const res = await window.electronAPI.importRepairsExcel(b64);
      if (!res || !res.success) {
        alert('Import failed: ' + (res && res.message ? res.message : 'Unknown error'));
        return;
      }

      window.__repairsImportCache = res.rows || [];
      importInfo.textContent = `Imported ${window.__repairsImportCache.length} rows`;

      // Ensure headers exist, then populate table immediately
      await loadWorkplan();               // builds headers based on current parameters
      await populateWorkplanFromImport(); // fills rows under existing columns
    });

    importBar.append(importBtn, importInfo, fileInput);
    // Place it at the end of the Workplan container
    if (wpContainer) wpContainer.appendChild(importBar);

    // Whenever any dashboard tab other than “Optimization” is clicked, clear its results
    const tabss = document.querySelectorAll('.dashboard-tab');
    tabss.forEach(tab => {
      tab.addEventListener('click', () => {
        if (tab.dataset.target !== 'optimization') {
          const optPaneInner = document.querySelector('#optimization .opt-container');
          if (optPaneInner) {
            optPaneInner.querySelectorAll('pre').forEach(p => p.remove());
          }
        }
      });
    });

        async function populateWorkplanFromImport() {
      const rows = window.__repairsImportCache || [];
      if (!rows.length) return;

      const hdrRow = dashPlaceholder.querySelector('#workplanHeaders');
      const tbody  = dashPlaceholder.querySelector('#workplanBody');
      if (!hdrRow || !tbody) return;

      // Current columns (already built by loadWorkplan())
      const headers = Array.from(hdrRow.querySelectorAll('th')).map(th => th.textContent.trim());

      // Parameters = everything after the first 3 fixed columns
      const paramSet = new Set(headers.slice(3));

      // Map of station number → site name from our station data
      const stationList = await window.electronAPI.getStationData();
      const siteByStation = new Map(
        (stationList || []).map(s => [String(s.station_id), String(s.name || '')])
      );

      // Rebuild body from imported rows
      tbody.innerHTML = '';
      rows.forEach(r => {
        const tr = document.createElement('tr');
        headers.forEach(h => {
          const td = document.createElement('td');
          let val = '';

          // Fixed columns
          if (h === 'Site Name') {
            // Prefer exact "Station Number" from the import to look up site name.
            const stn = r['Station Number'] != null
              ? String(r['Station Number'])
              // tiny fallback if someone used "Station ID"
              : (r['Station ID'] != null ? String(r['Station ID']) : '');
            val = siteByStation.get(stn) || '';
          } else if (h === 'Station Number') {
            val = r['Station Number'] != null ? r['Station Number'] : (r['Station ID'] || '');
          } else if (h === 'Operation') {
            // Friendly fallback: many sheets use "Repair Name"
            val = (r['Operation'] != null) ? r['Operation']
                : (r['Repair Name'] != null ? r['Repair Name'] : '');

          // Parameter columns: exact name match between Parameter and Import header
          } else if (paramSet.has(h)) {
            val = r.hasOwnProperty(h) && r[h] != null ? r[h] : '';
          }

          // IMPORTANT: do not coerce; show strings like "<2" or "2-4" as-is
          td.textContent = val == null ? '' : String(val);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }

    recalcPercentageTotal();
  }

  function recalcPercentageTotal() {
    const all = document.querySelectorAll('.param-percentage');
    let sum = 0;
    all.forEach(inp => { sum += parseInt(inp.value,10) || 0; });
    const el = document.getElementById('percentageTotal');
    el.textContent = sum;
    // optional: highlight in red if not exactly 100
    el.style.color = sum === 100 ? '' : 'red';
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

});
