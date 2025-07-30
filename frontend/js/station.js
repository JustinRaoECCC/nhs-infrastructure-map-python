// frontend/js/station.js

let unlocked = false;
let currentStation = null;

// ─── Wire up all of the station‑detail buttons/handlers after the snippet is injected ───
function wireUpStationEventHandlers() {
  console.log('🔧 wireUpStationEventHandlers invoked');

  // ── Tab switching ─────────────────────────────────────────────────────────
  document.querySelectorAll('.tab').forEach(tab => {
    console.log(`   ⚙️ binding tab click for “[${tab.dataset.target}]”`);
    tab.addEventListener('click', () => {
      console.log(`   🔄 tab “[${tab.dataset.target}]” clicked`);
      document.querySelectorAll('.tab, .tab-content')
              .forEach(el => el.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.target)
              .classList.add('active');
    });
  });

  // ── Back to map view ─────────────────────────────────────────────────────
  const backBtn = document.getElementById('backButton');
  console.log('   ⚙️ binding Back-to-Map click');
  backBtn.addEventListener('click', () => {
    console.log('   ⬅️ Back-to-Map clicked');
    hideStationView();
  });

  // ── Unlock / Lock editing ─────────────────────────────────────────────────
  const unlockBtn = document.getElementById('unlockEditing');
  console.log('   ⚙️ binding Unlock/Lock Editing click');
  unlockBtn.addEventListener('click', () => {
    console.log('   🔓 Unlock/Lock button clicked');
    toggleEditing();
  });

  // ── + Add Section ─────────────────────────────────────────────────────────
  const addSecBtn = document.getElementById('btnStationAddSection');
  console.log('   ⚙️ binding +Add Section click');
  addSecBtn.addEventListener('click', () => {
    console.log('   ➕ +Add Section clicked');
    addSection();
  });

  // ── Save Changes ──────────────────────────────────────────────────────────
  const saveBtn = document.getElementById('saveChanges');
  console.log('   ⚙️ binding Save Changes click');
  saveBtn.addEventListener('click', () => {
    console.log('   💾 Save Changes clicked');
    saveChanges();
  });

  // ── Delete Station ────────────────────────────────────────────────────────
  const delBtn = document.getElementById('deleteStation');
  console.log('   ⚙️ binding Delete Station click');
  delBtn.addEventListener('click', () => {
    console.log('   🗑 Delete Station clicked');
    deleteStation();
  });

  // ── Auto‑relock on unload ─────────────────────────────────────────────────
  console.log('   ⚙️ binding beforeunload auto‑relock');
  window.addEventListener('beforeunload', () => {
    if (unlocked) {
      console.log('   🔒 Auto‑relocking on unload');
      toggleEditing(true);
    }
  });

  console.log('🔧 wireUpStationEventHandlers completed');
}


// Load & render station details
async function loadStationPage(stationId) {
  // reset UI
  unlocked = false;
  toggleInputs(false);
  document.getElementById('unlockEditing').textContent = '🔒 Unlock Editing';
  document.getElementById('stationSectionsContainer').innerHTML = '';

  const data = await eel.get_infrastructure_data()();
  const stn = data.find(s => s.station_id === stationId);
  if (!stn) return alert(`Station "${stationId}" not found.`);
  currentStation = stn;

  // fill general info
  document.getElementById('stationTitle').textContent = `${stn.name} (${stn.station_id})`;
  document.getElementById('giStationId').value  = stn.station_id;
  document.getElementById('giCategory').value   = stn.asset_type;
  document.getElementById('giSiteName').value   = stn.name;
  document.getElementById('giProvince').value   = stn.province;
  document.getElementById('giLatitude').value   = stn.lat;
  document.getElementById('giLongitude').value  = stn.lon;
  document.getElementById('giStatus').value     = stn.status;

  // build extra sections
  const extras = {};
  Object.keys(stn).forEach(key => {
    if (!key.includes(' – ')) return;
    const [sec, fld] = key.split(' – ');
    extras[sec] = extras[sec]||{};
    extras[sec][fld] = stn[key];
  });
  Object.entries(extras).forEach(([sec, fields]) => {
    const block = makeSectionBlock(sec, fields);
    document.getElementById('stationSectionsContainer').append(block);
  });

  // show view
  document.getElementById('stationContentContainer').style.display = 'block';
  document.getElementById('mapContainer').style.display = 'none';
  document.getElementById('rightPanel').style.display = 'none';

  // ─── Now that the HTML is in the DOM, wire up all our event handlers ───
  wireUpStationEventHandlers();
}

// Enable/disable all general‑info inputs + section buttons
function toggleInputs(on) {
  // only lock/unlock the general‑info inputs
  ['giStationId','giCategory','giSiteName','giProvince','giLatitude','giLongitude','giStatus']
    .forEach(id => document.getElementById(id).disabled = !on);
  // note: we no longer disable any of the section‑editing buttons here
}

// Prompt for password and toggle edit mode.
// if `forceLock===true`, always lock.
function toggleEditing(forceLock=false) {
  if (forceLock || unlocked) {
    unlocked = false;
    toggleInputs(false);
    document.getElementById('unlockEditing').textContent = '🔒 Unlock Editing';
    return;
  }
  const pw = prompt('Enter password to unlock:');
  if (pw === '1234') {
    unlocked = true;
    toggleInputs(true);
    document.getElementById('unlockEditing').textContent = '🔓 Lock Editing';
  } else {
    alert('Incorrect password');
  }
}

// Build a new section-block
function makeSectionBlock(sectionName='', fields={}) {
  const block = document.createElement('div');
  block.className = 'section-block';

  // header
  const hdr = document.createElement('div');
  const inputSec = document.createElement('input');
  inputSec.type = 'text';
  inputSec.className = 'section-name';
  inputSec.placeholder = 'Section Name';
  inputSec.value = sectionName;
  // always enabled: inputSec.disabled = false;
  const btnDelSec = document.createElement('button');
  btnDelSec.className = 'delete-section';
  btnDelSec.textContent = 'Delete Section';
  // always enabled: btnDelSec.disabled = false;
  btnDelSec.addEventListener('click', () => block.remove());
  hdr.append(inputSec, btnDelSec);
  block.append(hdr);

  // fields container
  const fc = document.createElement('div');
  fc.className = 'fields-container';
  block.append(fc);

  // add existing fields
  Object.entries(fields).forEach(([fname, fval]) => {
    const row = makeFieldRow(fname, fval);
    fc.append(row);
  });

  // + Add Field
  const btnAddF = document.createElement('button');
  btnAddF.className = 'btnAddField';
  btnAddF.textContent = '+ Add Field';
  // always enabled: btnAddF.disabled = false;
  btnAddF.addEventListener('click', () => fc.append(makeFieldRow('', '')));
  block.append(btnAddF);

  return block;
}

// Build one field row
function makeFieldRow(name='', value='') {
  const row = document.createElement('div');
  const inName = document.createElement('input');
  inName.type = 'text';
  inName.className = 'field-name';
  inName.placeholder = 'Field Name';
  inName.value = name;
  // always enabled: inName.disabled = false;

  const inVal = document.createElement('input');
  inVal.type = 'text';
  inVal.className = 'field-value';
  inVal.placeholder = 'Value';
  inVal.value = value;
  // always enabled: inVal.disabled = false;

  const btnDel = document.createElement('button');
  btnDel.className = 'delete-field';
  btnDel.textContent = '×';
  // always enabled: btnDel.disabled = false;
  btnDel.addEventListener('click', () => row.remove());

  row.append(inName, inVal, btnDel);
  return row;
}

/**
 * User clicked “+ Add Section” in the station‑detail pane.
 * Create and append a fresh section block.
 */
function addSection() {
  const sectionsCt = document.getElementById('stationSectionsContainer');
  sectionsCt.appendChild(makeSectionBlock('', {}));
}

// Validate & gather data, then call backend
async function saveChanges() {
  // General info
  const gi = {
    stationId: document.getElementById('giStationId').value.trim(),
    siteName:  document.getElementById('giSiteName').value.trim(),
    province:  document.getElementById('giProvince').value.trim(),
    latitude:  parseFloat(document.getElementById('giLatitude').value),
    longitude: parseFloat(document.getElementById('giLongitude').value),
    status:    document.getElementById('giStatus').value
  };
  if (!gi.stationId || !gi.siteName || !gi.province || isNaN(gi.latitude) || isNaN(gi.longitude)) {
    return alert('Please fill in all required General Information.');
  }

  // Extras
  const extraSections = {};
  for (let block of document.querySelectorAll('.section-block')) {
    const secName = block.querySelector('.section-name').value.trim();
    if (!secName) return alert('Section name cannot be empty.');
    const rows = block.querySelectorAll('.fields-container > div');
    if (rows.length === 0) return alert(`Section "${secName}" needs at least one field.`);
    extraSections[secName] = {};
    for (let r of rows) {
      const fName = r.querySelector('.field-name').value.trim();
      if (!fName) return alert('Field name cannot be empty.');
      const fVal = r.querySelector('.field-value').value;
      extraSections[secName][fName] = fVal;
    }
  }

  // Build station object
  const stationObj = {
    assetType:    currentStation.asset_type,
    generalInfo:  gi,
    extraSections: extraSections
  };

  // call backend (you'll need an @eel.expose save_station_details in app.py)
  const res = await eel.save_station_details(stationObj)();
  if (res.success) {
    alert('Saved successfully!');
    toggleEditing(true);      // relock
    window.refreshMarkers();  // update map pins
  } else {
    alert('Error saving: ' + (res.message||JSON.stringify(res)));
  }
}

// Prompt password, then call backend to delete row
async function deleteStation() {
  const pw = prompt('Enter password to delete station:');
  if (pw !== '1234') return alert('Incorrect password');
  const sid = currentStation.station_id;
  // call backend (you'll need an @eel.expose delete_station in app.py)
  const res = await eel.delete_station(sid)();
  if (res.success) {
    hideStationView();
  } else {
    alert('Error deleting: ' + (res.message||JSON.stringify(res)));
  }
}

function hideStationView() {
  document.getElementById('stationContentContainer').style.display = 'none';
  document.getElementById('mapContainer').style.display = '';
  document.getElementById('rightPanel').style.display = '';
}

// expose
window.loadStationPage = loadStationPage;
