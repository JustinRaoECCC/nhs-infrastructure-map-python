// filters.js
const filterTree = document.getElementById('filterTree');

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

  // Toggle collapse on button click
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    content.style.display = content.style.display === 'none' ? 'block' : 'none';
    toggleBtn.textContent = content.style.display === 'none' ? '+' : '–';
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

document.addEventListener('DOMContentLoaded', async () => {
  const activeFilters = await window.electronAPI.getActiveFilters();
  buildFilterTreeFromData(activeFilters);
});

function buildFilterTreeFromData(data) {
  filterTree.innerHTML = '';
  data.companies.forEach(company => {
    const compDiv = createCollapsibleItem(company, 'company');
    filterTree.appendChild(compDiv);
    // You can expand this with locations/assets if desired
  });
}