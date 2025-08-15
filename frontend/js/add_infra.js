// add_infra.js
// Implements the client‑side logic for the “Add Infrastructure” modal: loading lookups, validating input, and gathering extra sections.
document.addEventListener('DOMContentLoaded', () => {
    
  // ── Grab elements ───────────────────────────────────────────────────────────
  const addInfraModal = document.getElementById('addInfraModal');
  const closeModalBtn = addInfraModal.querySelector('.close-modal');

  const selectLocation = document.getElementById('selectLocation');
  const inputNewLocation = document.getElementById('inputNewLocation');
  const btnSaveLocation = document.getElementById('btnSaveLocation');

  const selectAssetType = document.getElementById('selectAssetType');
  const assetTypeContainer = document.getElementById('assetTypeContainer');
  const inputNewAssetType = document.getElementById('inputNewAssetType');
  const btnSaveAssetType = document.getElementById('btnSaveAssetType');

  const generalInfoForm = document.getElementById('generalInfoForm');
  const inputStationId = document.getElementById('inputStationId');
  const inputSiteName = document.getElementById('inputSiteName');
  const inputStatus = document.getElementById('inputStatus');
  const inputLatitude = document.getElementById('inputLatitude');
  const inputLongitude = document.getElementById('inputLongitude');
  const btnSaveGeneralInfo = document.getElementById('btnSaveGeneralInfo');
  const btnCreateStation = document.getElementById('btnCreateStation');
  const createStationMessage = document.getElementById('createStationMessage');

  const sectionsContainer = document.getElementById('sectionsContainer');
  const btnAddSection = document.getElementById('btnAddSection');
  const sectionsForms = document.getElementById('sectionsForms');

  const btnAddCompany = document.getElementById('btnAddCompany');
  const addCompanyModal = document.getElementById('addCompanyModal');
  const selectCompany = document.getElementById('selectCompany');
  const inputNewCompany = document.getElementById('inputNewCompany');
  const btnSaveCompany = document.getElementById('btnSaveCompany');
  const btnConfirmCompany = document.getElementById('btnConfirmCompany');
  const closeCompanyModal = addCompanyModal.querySelector('.close-modal');

  const addLocationModal = document.getElementById('addLocationModal');
  const selectLocationModal = document.getElementById('selectLocationModal');
  const inputNewLocationModal = document.getElementById('inputNewLocationModal');
  const btnSaveLocationModal = document.getElementById('btnSaveLocationModal');
  const btnConfirmLocationModal = document.getElementById('btnConfirmLocationModal');
  const closeLocationModal = addLocationModal.querySelector('.close-modal');

  const addAssetTypeModal = document.getElementById('addAssetTypeModal');
  const selectAssetTypeModal = document.getElementById('selectAssetTypeModal');
  const inputNewAssetTypeModal = document.getElementById('inputNewAssetTypeModal');
  const btnSaveAssetTypeModal = document.getElementById('btnSaveAssetTypeModal');
  const btnConfirmAssetTypeModal = document.getElementById('btnConfirmAssetTypeModal');
  const closeAssetTypeModal = addAssetTypeModal.querySelector('.close-modal');
  const importExcelFile   = document.getElementById('importExcelFile');
  const importSheetSelect = document.getElementById('importSheetSelect');
  const btnImportExcel    = document.getElementById('btnImportExcel');

  const loadingOverlay     = document.getElementById('loadingOverlay');
  const importProgress     = document.getElementById('importProgress');
  const importProgressText = document.getElementById('importProgressText');


  let existingStationIDs = new Set();
  let extraSections = {};
  let selectedCompany = null;
  let selectedLocation = null;
  let importBase64        = null;
  let currentSheet = null;


  // ─── Sheet‐to‐total mapping & current sheet ─────────────────────────────
  const sheetTotals = {
    'cableway AB': 89,
    'cableway BC': 150,
    'cableway YT': 33,
    'weir BC': 27,
    'metering bridge BC': 17,
    'linecabin': 23,
    'non active': 82
  };

  // Show/hide (guard against bad totals)
  function showLoading(total) {
    if (!isFinite(total) || total <= 0) {
      console.warn('Bad total for loading, defaulting to 1:', total);
      total = 1;
    }
    importProgress.max   = total;
    importProgress.value = 0;
    importProgressText.textContent = `0% (0/${total})`;
    loadingOverlay.style.display = 'flex';
  }
  function hideLoading() {
    loadingOverlay.style.display = 'none';
  }

  // Eel hooks (Python will call these):
  eel.expose(initImportProgress);
  function initImportProgress(pyTotal) {
    // prefer our mapping, else fall back to Python’s
    const t = sheetTotals[currentSheet] || pyTotal;
    showLoading(t);
  }

  eel.expose(updateImportProgress);
  function updateImportProgress(count, pyTotal) {
    // choose mapping or Python value
    const t = sheetTotals[currentSheet] || pyTotal || importProgress.max;
    importProgress.max   = isFinite(t) ? t : importProgress.max;
    importProgress.value = count;
    const pct = Math.floor((count/importProgress.max)*100);
    importProgressText.textContent = `${pct}% (${count}/${importProgress.max})`;
  }


  // ── Modal open/close ─────────────────────────────────────────────────────────
  function openModal() {
    addInfraModal.style.display = 'flex';
  }

  function closeModal() {
    addInfraModal.style.display = 'none';
    resetModal();
  }

  closeModalBtn.addEventListener('click', closeModal);

  addInfraModal.addEventListener('click', e => {
    if (e.target === addInfraModal) closeModal();
  });

  // ── Load lookups & populate dropdowns ───────────────────────────────────────
  async function loadLookups() {
    const locRes = await window.electronAPI.getLocations();
    const atRes  = await window.electronAPI.getAssetTypes();
    buildDropdown(selectLocation, locRes);
    buildDropdown(selectAssetType, atRes);
  }

  function buildDropdown(sel, items) {
    sel.innerHTML = `<option value="">-- select --</option>`;
    // remove duplicatess
    Array.from(new Set(items)).forEach(i => {
      const o = document.createElement('option');
      o.value = o.textContent = i;
      sel.appendChild(o);
    });
  }

  // ── Add new location / asset type ───────────────────────────────────────────
  btnSaveLocation.addEventListener('click', async () => {
    const v = inputNewLocation.value.trim();
    if (!v) return;
    const res = await window.electronAPI.addNewLocation(v);
    // only reload/select if we actually added a new one
    if (res.success) {
      await loadLookups();
      selectLocation.value = v;
      selectLocation.dispatchEvent(new Event('change'));
      inputNewLocation.value = '';
    } else if (!res.added) {
      // already existed, do nothing
    } else {
      alert(res.message);
    }
  });

  btnSaveAssetType.addEventListener('click', async () => {
    const v = inputNewAssetType.value.trim();
    if (!v) return;
    const res = await window.electronAPI.addNewAssetType(v);
    if (res.success) {
      await loadLookups();
      selectAssetType.value = v;
      inputNewAssetType.value = '';
    } else {
      alert(res.message);
    }
  });

  // ── Show general-info form when lookups chosen ──────────────────────────────
  selectLocation.addEventListener('change', () => {
    assetTypeContainer.style.display = selectLocation.value ? 'block' : 'none';
    maybeShowGeneralForm();
  });

  selectAssetType.addEventListener('change', maybeShowGeneralForm);

  function maybeShowGeneralForm() {
    generalInfoForm.style.display =
      selectLocation.value && selectAssetType.value
        ? 'block'
        : 'none';
  }

  // ── Load existing station IDs to prevent duplicates ─────────────────────────
  async function loadExistingStationIDs() {
    try {
      const data = await window.electronAPI.getStationData();
      existingStationIDs = new Set(data.map(s => String(s.station_id)));
    } catch {
      existingStationIDs = new Set();
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Excel import UI logic (file + sheet picker)
 // ───────────────────────────────────────────────────────────────────────────
  importExcelFile.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
   const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let b of bytes) binary += String.fromCharCode(b);
    importBase64 = btoa(binary);

    // fetch sheet names from Python
    const sheets = await window.electronAPI.getExcelSheetNames(importBase64);
    importSheetSelect.innerHTML = '<option value="">-- select sheet --</option>';
    sheets.forEach(name => {
      const o = document.createElement('option');
      o.value = o.textContent = name;
      importSheetSelect.appendChild(o);
    });
    importSheetSelect.disabled = false;
  });

  importSheetSelect.addEventListener('change', () => {
    btnImportExcel.disabled = !importSheetSelect.value;
  });

  btnImportExcel.addEventListener('click', async () => {
    const sheet = importSheetSelect.value;
    const location = selectLocation.value;
    const asset    = selectAssetType.value;
    if (!importBase64 || !sheet) return;


    // remember which sheet and start determinate loader
    currentSheet = sheet;
    showLoading(sheetTotals[sheet] || 1);
    try {
      const res = await window.electronAPI.importExcelSheet(
        importBase64, sheet, location, asset
      );
      if (!res.success) {
        alert(`Import failed: ${res.message}`);
      } else {
        // on success: close modal, rebuild filters, then refresh markers
        closeModal();
        if (window.buildFilterTree) {
          await window.buildFilterTree();
        }
        if (window.refreshMarkers) {
          window.refreshMarkers();
        }
      }
    } catch (err) {
      console.error(err);
      alert('Unexpected error during import');
    } finally {
      // hide overlay no matter what
      hideLoading();
    }
  });


  // ── Save general info, reveal Create & Sections UI ──────────────────────────
  btnSaveGeneralInfo.addEventListener('click', () => {
    const sid   = inputStationId.value.trim();
    const name  = inputSiteName.value.trim();
    const stat  = inputStatus.value.trim();
    const lat   = parseFloat(inputLatitude.value);
    const lon   = parseFloat(inputLongitude.value);

    // 1. Check blanks
    if (!sid || !name || !stat || isNaN(lat) || isNaN(lon)) {
      createStationMessage.textContent = 'All fields must be filled in.';
      return;
    }

    // 2. Check ID uniqueness
    if (existingStationIDs.has(sid)) {
      createStationMessage.textContent = `Station ID "${sid}" already exists.`;
      return;
    }

    // 3. Check lat/lon range
    if (lat < -90 || lat > 90) {
      createStationMessage.textContent = 'Latitude must be between -90 and 90.';
      return;
    }
    if (lon < -180 || lon > 180) {
      createStationMessage.textContent = 'Longitude must be between -180 and 180.';
      return;
    }

    // All good — enable creation
    btnSaveGeneralInfo.style.display = 'none';
    btnCreateStation.style.display   = 'inline-block';
    createStationMessage.textContent  = '';
    sectionsContainer.style.display   = 'block';
  });

  // ── Build a new Section block with name, fields, delete buttons ────────────
  function createSectionBlock() {
    const sectionDiv = document.createElement('div');
    sectionDiv.classList.add('section-block');
    sectionDiv.style = 'border:1px #ccc solid; padding:1em; margin-bottom:1em;';

    sectionDiv.innerHTML = `
      <div style="display:flex; align-items:center; margin-bottom:0.5em;">
        <input
          class="section-name"
          placeholder="Section name (e.g. Structural Info)"
          style="flex:1; padding:0.3em;"
        />
        <button
          type="button"
          class="delete-section"
          style="margin-left:0.5em; color:red;"
        >Delete Section</button>
      </div>
      <div class="fields-container" style="margin-bottom:0.5em;"></div>
      <button type="button" class="btnAddField">+ Add Field</button>
    `;

    // Delete entire section
    sectionDiv.querySelector('.delete-section')
      .addEventListener('click', () => {
        const title = sectionDiv.querySelector('.section-name').value.trim();
        delete extraSections[title];
        sectionsForms.removeChild(sectionDiv);
      });

    // Add a new field row
    sectionDiv.querySelector('.btnAddField')
      .addEventListener('click', () => {
        const fieldsCt = sectionDiv.querySelector('.fields-container');
        const row = document.createElement('div');
        row.style = 'display:flex; align-items:center; margin-bottom:0.3em;';
        row.innerHTML = `
          <input
            class="field-name"
            placeholder="Field name"
            style="flex:1; padding:0.2em; margin-right:0.5em;"
          />
          <input
            class="field-value"
            placeholder="Value"
            style="flex:1; padding:0.2em; margin-right:0.5em;"
          />
          <button type="button" class="delete-field" style="color:red;">×</button>
        `;
        // Delete that field row
        row.querySelector('.delete-field')
          .addEventListener('click', () => fieldsCt.removeChild(row));

        fieldsCt.appendChild(row);
      });

    sectionsForms.appendChild(sectionDiv);
  }

  // ── Wire up Add Section button ─────────────────────────────────────────────
  btnAddSection.addEventListener('click', () => {
    createSectionBlock();
  });

  // ── Final “Create Station”: harvest everything & send to backend ───────────
  btnCreateStation.addEventListener('click', async () => {
    // Rebuild extraSections from the DOM
    extraSections = {};
    sectionsForms.querySelectorAll('.section-block').forEach(sec => {
      const title = sec.querySelector('.section-name').value.trim();
      if (!title) return;
      const fields = {};
      sec.querySelectorAll('.fields-container > div').forEach(row => {
        const name  = row.querySelector('.field-name').value.trim();
        const value = row.querySelector('.field-value').value.trim();
        if (name) fields[name] = value;
      });
      extraSections[title] = fields;
    });

    // Gather general info values
    const location  = selectLocation.value;
    const assetType = selectAssetType.value;


    const stationId = inputStationId.value.trim();
    const siteName  = inputSiteName.value.trim();
    const status    = inputStatus.value.trim() || 'UNKNOWN';
    const latitude  = parseFloat(inputLatitude.value);
    const longitude = parseFloat(inputLongitude.value);

    // Final validation
    if (!stationId || !siteName || isNaN(latitude) || isNaN(longitude)) {
      createStationMessage.textContent =
        'Fill in all General Information fields correctly.';
      return;
    }

    const stationObj = {
      location,
      assetType,
      generalInfo: {
        stationId,
        siteName,
        province:  location,
        latitude,
        longitude,
        status
      },
      extraSections
    };

    try {
      const res = await window.electronAPI.createNewStation(stationObj);

      if (!res.success) {
        createStationMessage.textContent = `Error: ${res.message}`;
        return;
      }
      createStationMessage.style.color = 'green';
      createStationMessage.textContent = 'Station created successfully!';
      if (window.refreshMarkers) window.refreshMarkers();
      setTimeout(() => closeModal(), 1000);
    } catch (err) {
    console.error('[Import] unexpected error', err);
    alert('Unexpected error during import');
  } finally {
    hideLoading();
  }
});

  // ── Reset modal to initial state ────────────────────────────────────────────
  function resetModal() {
    selectLocation.value       = '';
    inputNewLocation.value     = '';
    assetTypeContainer.style.display = 'none';
    selectAssetType.value      = '';
    inputNewAssetType.value    = '';

    generalInfoForm.style.display       = 'none';
    btnSaveGeneralInfo.style.display    = 'inline-block';
    inputStationId.value                = '';
    inputSiteName.value                 = '';
    inputStatus.value                   = '';
    inputLatitude.value                 = '';
    inputLongitude.value                = '';

    btnCreateStation.style.display = 'none';
    createStationMessage.textContent = '';
    createStationMessage.style.color = '';

    sectionsContainer.style.display = 'none';
    sectionsForms.innerHTML         = '';
    extraSections                   = {};
  }

  function openCompanyModal() {
    addCompanyModal.style.display = 'flex';
  }

  function closeCompanyModalFn() {
    addCompanyModal.style.display = 'none';
  }

  btnAddCompany.addEventListener('click', async () => {
    console.log('Add Company button clicked');
    await loadCompanies();
    openCompanyModal();
  });


  closeCompanyModal.addEventListener('click', closeCompanyModalFn);
  // click outside Company modal to close
  addCompanyModal.addEventListener('click', e => {
    if (e.target === addCompanyModal) closeCompanyModalFn();
  });

  btnSaveCompany.addEventListener('click', async () => {
    const name = inputNewCompany.value.trim();
    if (!name) return;
    // 1) persist into lookups.xlsx (col A of Companies)
    const res = await window.electronAPI.addNewCompany(name, false);
    // only reload + select if a brand‑new company was actually added
    if (res.success) {
      await loadCompanies();
      selectCompany.value = name;
      inputNewCompany.value = '';
    }
  });


  btnConfirmCompany.addEventListener('click', async () => {
    const name = selectCompany.value;
    if (name) {
      // now persist and mark active
      await window.electronAPI.addNewCompany(name, true);
    }
    closeCompanyModalFn();
    buildFilterTree();
  });

  async function loadCompanies() {
    const comps = await window.electronAPI.getCompanies();
    selectCompany.innerHTML = `<option value="">-- select --</option>`;
    comps.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      selectCompany.appendChild(opt);
    });
  }

  function openLocationModal(companyName) {
    selectedCompany = companyName;
    addLocationModal.style.display = 'flex';
    loadLocationsForModal(companyName);
  }

  function closeLocationModalFn() {
    addLocationModal.style.display = 'none';
  }

  async function loadLocationsForModal(companyName) {
    const locations = await window.electronAPI.getLocations();
    selectLocationModal.innerHTML = `<option value="">-- select --</option>`;
    locations.forEach(loc => {
      const opt = document.createElement('option');
      opt.value = loc;
      opt.textContent = loc;
      selectLocationModal.appendChild(opt);
    });
  }

  btnSaveLocationModal.addEventListener('click', async () => {
    const name = inputNewLocationModal.value.trim();
    if (!name) return;
    // 1) persist into lookups.xlsx (col A of Locations)
    const res = await window.electronAPI.addNewLocation(name);
    // only reload + select if a brand‑new location was actually added
    if (res.success) {
      await loadLocationsForModal(selectedCompany);
      selectLocationModal.value = name;
      inputNewLocationModal.value = '';
    }
  });


  btnConfirmLocationModal.addEventListener('click', async () => {
    const loc = selectLocationModal.value;
    if (loc) {
      await window.electronAPI.addLocationUnderCompany(selectedCompany, loc);
    }
    closeLocationModalFn();
    // ─── append the new location under its company without collapsing the tree ───
    const compWrap = window.findCompanyWrapper(selectedCompany);
    if (compWrap) {
      const newLocWrap = window.createCollapsibleItem(
        loc,           // the new location name
        'location',    // type
        selectedCompany
      );
      compWrap.querySelector('.collapsible-content')
            .appendChild(newLocWrap);
    }

  });

  closeLocationModal.addEventListener('click', closeLocationModalFn);
  // click outside Location modal to close
  addLocationModal.addEventListener('click', e => {
    if (e.target === addLocationModal) closeLocationModalFn();
  });

  function openAssetTypeModal(companyName, locationName) {
    selectedCompany  = companyName;
    selectedLocation = locationName;
    addAssetTypeModal.style.display = 'flex';
    loadAssetTypesForModal(companyName, locationName);
  }

  function closeAssetTypeModalFn() {
    addAssetTypeModal.style.display = 'none';
  }

  async function loadAssetTypesForModal(companyName, locationName) {
    const ats = await window.electronAPI.getAssetTypes();
    selectAssetTypeModal.innerHTML = `<option value="">-- select --</option>`;
    ats.forEach(at => {
      const opt = document.createElement('option');
      opt.value = at;
      opt.textContent = at;
      selectAssetTypeModal.appendChild(opt);
    });
  }

  btnSaveAssetTypeModal.addEventListener('click', async () => {
    const name = inputNewAssetTypeModal.value.trim();
    if (!name) return;
    // 1) persist into lookups.xlsx (col A of AssetTypes)
    const res = await window.electronAPI.addNewAssetType(name);
    if (!res.success) {
      alert(res.message);
      return;
    }
    // 2) reload dropdown for this company & location
    await loadAssetTypesForModal(selectedCompany, selectedLocation);
    // 3) select the newly added asset type
    selectAssetTypeModal.value = name;
    inputNewAssetTypeModal.value = '';
  });



  btnConfirmAssetTypeModal.addEventListener('click', async () => {
    const at = selectAssetTypeModal.value;
    if (at) {
      await window.electronAPI.addAssetTypeUnderLocation(at, selectedCompany, selectedLocation);
    }

    closeAssetTypeModalFn();
    // ─── append the new asset type under its location without collapsing ─────
    const compWrap = window.findCompanyWrapper(selectedCompany);
    const locWrap  = compWrap && window.findLocationWrapper(compWrap, selectedLocation);
    if (locWrap) {
      const child = document.createElement('div');
      child.classList.add('collapsible-child');
      child.textContent = at;  // the new asset‑type name
      child.addEventListener('click', () =>
        window.openAddInfrastructureModal(selectedCompany, selectedLocation, at)
      );
      locWrap.querySelector('.collapsible-content').appendChild(child);
    }

  });
  
  closeAssetTypeModal.addEventListener('click', closeAssetTypeModalFn);
  // click outside AssetType modal to close
  addAssetTypeModal.addEventListener('click', e => {
    if (e.target === addAssetTypeModal) closeAssetTypeModalFn();
  });
  
  window.openLocationModal = openLocationModal;
  window.openAssetTypeModal = openAssetTypeModal;

  // When opening from the filter tree, reload lookups first
  window.prefillAndOpenAddInfraModal = async function (location, assetType) {
    // 1) repopulate the select boxes so our values exist
    await loadLookups();

    // 2) stash the pre‑selected values
    selectLocation.value    = location;
    selectAssetType.value   = assetType;

    // hide the lookup dropdowns (we already know company→location→assetType)
    selectLocation.parentElement.style.display = 'none';
    assetTypeContainer.style.display           = 'none';

    // immediately show the General Info form
    generalInfoForm.style.display      = 'block';
    btnSaveGeneralInfo.style.display   = 'inline-block';
    btnCreateStation.style.display     = 'none';   // still hidden until Save Info
    sectionsContainer.style.display    = 'none';
    createStationMessage.textContent   = '';

    openModal();

  }

});

