// filters.js

// ─── Global filter state ─────────────────────────────────────────────────────
window.filterState = {
  companies: {},    // { "Company A": true, ... }
  locations: {},    // { "BC": true, "AB": true, ... }
  asset_types: {}   // { "cableway": true, ... }
};

function mapTypeToStateKey(type) {
  if (type === 'company')    return 'companies';
  if (type === 'location')   return 'locations';
  if (type === 'asset_type') return 'asset_types';
  return null;
}

const filterTree = document.getElementById('filterTree');

// ─── Helpers to find wrappers ────────────────────────────────────────────────
function findCompanyWrapper(companyName) {
  return Array.from(filterTree.querySelectorAll('.collapsible-wrapper'))
    .find(w => w.querySelector('.collapsible-title').textContent === companyName);
}
function findLocationWrapper(companyWrapper, locationName) {
  return Array.from(companyWrapper.querySelectorAll('.collapsible-wrapper'))
    .find(w => w.querySelector('.collapsible-title').textContent === locationName);
}
window.findCompanyWrapper  = findCompanyWrapper;
window.findLocationWrapper = findLocationWrapper;

// ─── Build the tree on startup ───────────────────────────────────────────────
async function buildFilterTree() {
  filterTree.innerHTML = '';
  const companies = await window.electronAPI.getCompanies();

  for (const company of companies) {
    // Company node (header + collapsible content)
    const compDiv = createCollapsibleItem(company, 'company');

    // Locations under this company
    const locations = await window.electronAPI.getLocationsForCompany(company);
    for (const location of locations) {
      const locDiv = createCollapsibleItem(location, 'location', company);

      // Asset‑types under this location
      const assetTypes = await window.electronAPI.getAssetTypesForLocation(company, location);
      for (const assetType of assetTypes) {
        if (!assetType || assetType.toLowerCase() === 'sheet') continue;

        // Leaf node: flex container with label + checkbox
        const assetDiv = document.createElement('div');
        assetDiv.classList.add('collapsible-child');
        assetDiv.style.display = 'flex';
        assetDiv.style.alignItems = 'center';
        assetDiv.style.justifyContent = 'space-between';

        const label = document.createElement('span');
        label.textContent = assetType;

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.classList.add('filter-checkbox');
        cb.style.marginLeft = '8px';

        // initialize and wire up asset_types state
        window.filterState.asset_types[assetType] = true;
        cb.addEventListener('change', e => {
          window.filterState.asset_types[assetType] = e.target.checked;
          window.refreshMarkers();
        });

        // clicking the label opens the add‑infra modal
        label.addEventListener('click', () =>
          openAddInfrastructureModal(company, location, assetType)
        );

        assetDiv.appendChild(label);
        assetDiv.appendChild(cb);
        locDiv.querySelector('.collapsible-content').appendChild(assetDiv);
      }

      compDiv.querySelector('.collapsible-content').appendChild(locDiv);
    }

    filterTree.appendChild(compDiv);
  }
}
window.buildFilterTree = buildFilterTree;

// ─── Factory for company/location nodes ─────────────────────────────────────
function createCollapsibleItem(title, type, parentCompany = null) {
  const wrapper = document.createElement('div');
  wrapper.classList.add('collapsible-wrapper');

  const header = document.createElement('div');
  header.classList.add('collapsible-header');
  header.style.display = 'flex';
  header.style.alignItems = 'center';

  // ─ toggle button ─
  const toggleBtn = document.createElement('button');
  toggleBtn.classList.add('toggle-collapse-button');
  toggleBtn.textContent = '+';

  // ─ title ─
  const titleSpan = document.createElement('span');
  titleSpan.classList.add('collapsible-title');
  titleSpan.textContent = title;

  // ─ filter checkbox ─
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = true;
  checkbox.classList.add('filter-checkbox');
  checkbox.style.marginLeft = '8px';

  // init state key and wire up
  const stateKey = mapTypeToStateKey(type);
  if (stateKey) {
    window.filterState[stateKey][title] = true;
    checkbox.addEventListener('change', e => {
      window.filterState[stateKey][title] = e.target.checked;
      window.refreshMarkers();
    });
  }

  // ─ toggle content on “+” click ─
  toggleBtn.addEventListener('click', e => {
    e.stopPropagation();
    const content = wrapper.querySelector('.collapsible-content');
    const isHidden = getComputedStyle(content).display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
    toggleBtn.textContent = isHidden ? '–' : '+';
  });

  // ─ header click: either toggle or open modal ─
  header.addEventListener('click', e => {
    const rect = titleSpan.getBoundingClientRect();
    const content = wrapper.querySelector('.collapsible-content');
    if (e.clientX < rect.left) {
      // toggle expand/collapse
      const isHidden = getComputedStyle(content).display === 'none';
      content.style.display = isHidden ? 'block' : 'none';
      toggleBtn.textContent = isHidden ? '–' : '+';
    } else {
      // click to right → open the appropriate modal
      if (type === 'company') {
        window.openLocationModal(title);
      } else if (type === 'location') {
        window.openAssetTypeModal(parentCompany, title);
      }
    }
  });

  // ─ direct title click also opens modal ─
  titleSpan.addEventListener('click', () => {
    if (type === 'company') window.openLocationModal(title);
    else if (type === 'location') window.openAssetTypeModal(parentCompany, title);
  });

  // ─ build DOM ─
  header.appendChild(toggleBtn);
  header.appendChild(titleSpan);
  header.appendChild(checkbox);
  wrapper.appendChild(header);

  const content = document.createElement('div');
  content.classList.add('collapsible-content');
  content.style.display = 'none';
  wrapper.appendChild(content);

  return wrapper;
}

// ─── Helper to open the Add‑Infra modal ─────────────────────────────────────
function openAddInfrastructureModal(company, location, assetType) {
  window.prefillAndOpenAddInfraModal(location, assetType);
}

// ─── On initial load ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await buildFilterTree();
});
