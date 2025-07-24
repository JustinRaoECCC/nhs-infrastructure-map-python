// filters.js

const filterTree = document.getElementById('filterTree');

// ─── Helpers to append a new node without collapsing the rest ─────────────────
function findCompanyWrapper(companyName) {
  return Array.from(
    filterTree.querySelectorAll('.collapsible-wrapper')
  ).find(w =>
    w.querySelector('.collapsible-title').textContent === companyName
  );
}

function findLocationWrapper(companyWrapper, locationName) {
  return Array.from(
    companyWrapper.querySelectorAll('.collapsible-wrapper')
  ).find(w =>
    w.querySelector('.collapsible-title').textContent === locationName
  );
}
// ─────────────────────────────────────────────────────────────────────────────
window.findCompanyWrapper   = findCompanyWrapper;
window.findLocationWrapper  = findLocationWrapper;



// Main entry to refresh the filter panel
async function buildFilterTree() {
  filterTree.innerHTML = '';

  const companies = await window.electronAPI.getCompanies();

  for (const company of companies) {
    const companyDiv = createCollapsibleItem(company, 'company');

    // Fetch locations for this company (mocked for now)
    const locations = await window.electronAPI.getLocationsForCompany(company);

    for (const location of locations) {
      const locationDiv = createCollapsibleItem(location, 'location', company);

      // Fetch asset types for this location (mocked for now)
      const assetTypes = await window.electronAPI.getAssetTypesForLocation(company, location);

      for (const assetType of assetTypes) {
        if (assetType && assetType.toLowerCase() === 'sheet') continue;
        const assetTypeDiv = document.createElement('div');
        assetTypeDiv.classList.add('collapsible-child');
        assetTypeDiv.textContent = assetType;
        assetTypeDiv.addEventListener('click', () => openAddInfrastructureModal(company, location, assetType));
        locationDiv.querySelector('.collapsible-content').appendChild(assetTypeDiv);
      }

      companyDiv.querySelector('.collapsible-content').appendChild(locationDiv);
    }

    filterTree.appendChild(companyDiv);
  }
}

window.buildFilterTree = buildFilterTree;

// Reusable collapsible item
function createCollapsibleItem(title, type, parentCompany = null) {
  const wrapper = document.createElement('div');
  wrapper.classList.add('collapsible-wrapper');

  const header = document.createElement('div');
  header.classList.add('collapsible-header');

  const toggleBtn = document.createElement('button');
  toggleBtn.classList.add('toggle-collapse-button');
  toggleBtn.textContent = '+';

  const titleSpan = document.createElement('span');
  titleSpan.classList.add('collapsible-title');
  titleSpan.textContent = title;

  const content = document.createElement('div');
  content.classList.add('collapsible-content');
  content.style.display = 'none';

  // Left‑of‑title: toggle collapse; right‑of‑title: open modal
  // 1) Make the “+” button itself toggle (and stop propagation)
  toggleBtn.addEventListener('click', e => {
    e.stopPropagation();
    // check computed style so we catch the CSS‑hidden default
    const isHidden = getComputedStyle(content).display === 'none';
    content.style.display    = isHidden ? 'block' : 'none';
    toggleBtn.textContent    = isHidden ? '–' : '+';
  });

  // 2) On header click, decide based on X coordinate
  header.addEventListener('click', e => {
    const rect = titleSpan.getBoundingClientRect();
    if (e.clientX < rect.left) {
      const isHidden = getComputedStyle(content).display === 'none';
      content.style.display = isHidden ? 'block' : 'none';
      toggleBtn.textContent = isHidden ? '–' : '+';
    } else {
      // click to the right of the text → open the matching modal
      if (type === 'company') {
        window.openLocationModal(title);
      } else if (type === 'location') {
        window.openAssetTypeModal(parentCompany, title);
      }
    }
  });


  // Open modal on title click
  titleSpan.addEventListener('click', () => {
    if (type === 'company') window.openLocationModal(title);
    else if (type === 'location') window.openAssetTypeModal(parentCompany, title);
  });

  header.appendChild(toggleBtn);
  header.appendChild(titleSpan);
  wrapper.appendChild(header);
  wrapper.appendChild(content);

  return wrapper;
}

function openAddInfrastructureModal(company, location, assetType) {
  window.prefillAndOpenAddInfraModal(location, assetType);
}

// On startup, load the full filter tree (companies → locations → asset‐types)
document.addEventListener('DOMContentLoaded', async () => {
  await buildFilterTree();
});

function buildFilterTreeFromData(data) {
  filterTree.innerHTML = '';
  data.companies.forEach(company => {
    const compDiv = createCollapsibleItem(company, 'company');
    filterTree.appendChild(compDiv);
    // You can expand this with locations/assets if desired
  });
}