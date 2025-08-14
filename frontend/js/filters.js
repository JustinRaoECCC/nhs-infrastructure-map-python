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

  const companies = await window.electronAPI.getActiveCompanies();

  for (const company of companies) {
    const companyDiv = createCollapsibleItem(company, 'company');

    // Fetch locations for this company (mocked for now)
    const locations = await window.electronAPI.getLocationsForCompany(company);

    for (const location of locations) {
      const locationDiv = createCollapsibleItem(location, 'location', company);

      // Fetch asset types for this location (mocked for now)
      const assetTypes = await window.electronAPI.getAssetTypesForLocation(company, location);

      for (const assetType of assetTypes) {
        if (assetType.toLowerCase() === 'sheet') continue;
        // reuse the same factory so we get a checkbox + cascade behavior:\

        const assetWrapper = createCollapsibleItem(assetType, 'asset-type', location);
        // ── store the company on each asset‐type checkbox ──
        const chk = assetWrapper.querySelector('input.filter-checkbox.asset-type');
        if (chk) chk.dataset.company = company;

        // append your color-picker menu and title click exactly where you did before:
        const header = assetWrapper.querySelector('.collapsible-header');
        const menuBtn = document.createElement('button');
        menuBtn.classList.add('asset-type-menu-button');
        menuBtn.textContent = '⋮';
        menuBtn.addEventListener('click', e => {
          e.stopPropagation();
          openAssetTypeColorMenu(assetType, location, menuBtn);
        });
        // insert the menu button before the title:
        header.insertBefore(menuBtn, header.querySelector('.collapsible-title'));

        locationDiv.querySelector('.collapsible-content')
                   .appendChild(assetWrapper);
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

  // ─── checkbox to toggle this filter on/off ───────────────────
  const chk = document.createElement('input');
  chk.type = 'checkbox';
  chk.classList.add('filter-checkbox', type);
  chk.value = title;

  if (type === 'asset-type') {
    // parentCompany here is actually the location string
    chk.dataset.location = parentCompany;
  }

  chk.checked = true;

  // ─── prevent collapse/expand when clicking the checkbox ─────────────────
  chk.addEventListener('click', e => {
    e.stopPropagation();
  });

  header.appendChild(chk);

  let toggleBtn = null;
  if (type !== 'asset-type') {
    toggleBtn = document.createElement('button');
    toggleBtn.classList.add('toggle-collapse-button');
    toggleBtn.textContent = '+';
  }

  const titleSpan = document.createElement('span');
  titleSpan.classList.add('collapsible-title');
  titleSpan.textContent = title;

  const content = document.createElement('div');
  content.classList.add('collapsible-content');
  content.style.display = 'none';

  // Left‑of‑title: toggle collapse; right‑of‑title: open modal
  // 1) Make the “+” button itself toggle (and stop propagation)
  if (toggleBtn) {
    toggleBtn.addEventListener('click', e => {
      e.stopPropagation();
      const isHidden = getComputedStyle(content).display === 'none';
      content.style.display    = isHidden ? 'block' : 'none';
      toggleBtn.textContent    = isHidden ? '–' : '+';
    });
  }

  // 2) On header click, decide based on X coordinate
  header.addEventListener('click', e => {
    const rect = titleSpan.getBoundingClientRect();
    if (e.clientX < rect.left) {
      const isHidden = getComputedStyle(content).display === 'none';
      content.style.display = isHidden ? 'block' : 'none';
      toggleBtn.textContent = isHidden ? '–' : '+';
    } else {
      // click to the right of the text → open the matching modal
      if (type === 'company' && typeof window.openLocationModal === 'function') {
        window.openLocationModal(title);
      } else if (type === 'location' && typeof window.openAssetTypeModal === 'function') {
        window.openAssetTypeModal(parentCompany, title);
      }
    }
  });


  // Open modal on title click
  titleSpan.addEventListener('click', () => {
    if (type === 'company' && typeof window.openLocationModal === 'function') {
      window.openLocationModal(title);
    } else if (type === 'location' && typeof window.openAssetTypeModal === 'function') {
      window.openAssetTypeModal(parentCompany, title);
    } else if (type === 'asset-type' && typeof window.prefillAndOpenAddInfraModal === 'function') {
      window.prefillAndOpenAddInfraModal(parentCompany, title);  // parentCompany here is location
    }
  });

  if (toggleBtn) header.appendChild(toggleBtn);
  header.appendChild(titleSpan);

  // ─── cascade check/uncheck down to all grandchildren ────────────────
  chk.addEventListener('change', () => {
    const allDescendants = wrapper.querySelectorAll('input.filter-checkbox');
    allDescendants.forEach(box => box.checked = chk.checked);
    if (window.refreshMarkers) window.refreshMarkers();
    if (window.renderList)     window.renderList();
  });

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

  // ─── now that filters exist, draw map & list once ───────────────────────
  if (window.refreshMarkers) {
    console.log('🔷 [filters.js] initial map draw');
    window.refreshMarkers();
  }
  if (window.renderList) {
    console.log('🔷 [filters.js] initial list draw');
    window.renderList();
  }
});

function buildFilterTreeFromData(data) {
  filterTree.innerHTML = '';
  data.companies.forEach(company => {
    const compDiv = createCollapsibleItem(company, 'company');
    filterTree.appendChild(compDiv);
    // You can expand this with locations/assets if desired
  });
}

/**
 * Show a little <input type="color"> near the “⋮” button.
 */
async function openAssetTypeColorMenu(assetType, location, anchorBtn) {
  document.querySelectorAll('.asset-type-color-menu')
          .forEach(m => m.remove());

  // Build menu
  const menu = document.createElement('div');
  menu.classList.add('asset-type-color-menu');
  menu.style.position = 'absolute';
  document.body.appendChild(menu);

  // 1) Create the color‐picker
  const input = document.createElement('input');
  input.type = 'color';
  // fetch the color for this exact (assetType, location) row
  let current = await window.electronAPI.getAssetTypeColorForLocation(assetType, location);
  // fallback to the generic lookup just in case
  if (!current) {
    current = await window.electronAPI.getAssetTypeColor(assetType);
  }
  input.value = current || '#000000';
  menu.appendChild(input);

  // 2) Create a Confirm button — the only way to close/apply
  const btnConfirm = document.createElement('button');
  btnConfirm.textContent = 'Confirm';
  btnConfirm.classList.add('asset-type-color-confirm');
  btnConfirm.addEventListener('click', async () => {
    const newColor = input.value;
    const res = await window.electronAPI.setAssetTypeColorForLocation(assetType, location, newColor);
    if (!res.success) {
      alert('Could not save color: ' + res.message);
    }
    menu.remove();
    // redraw pins next tick
    setTimeout(() => window.refreshMarkers(), 0);
  });
  menu.appendChild(btnConfirm);

  // Position it under the button
  const rect = anchorBtn.getBoundingClientRect();
  menu.style.top  = `${rect.bottom + window.scrollY}px`;
  menu.style.left = `${rect.left  + window.scrollX}px`;

  // 3) Listen for outside clicks
  const outsideClickListener = (e) => {
    if (!menu.contains(e.target) && !anchorBtn.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', outsideClickListener, true);
    }
  };
  document.addEventListener('click', outsideClickListener, true);

}