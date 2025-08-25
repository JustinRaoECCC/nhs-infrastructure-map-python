// frontend/js/history.js
// Streams and renders thumbnails for Inspection / Construction history tabs,
// implements add flows, and in-app PDF viewer for inspection reports.

// EXPECTS: image_stream.js to export streamImageTo(imgEl, absolutePath)
// OPTIONAL: image_stream.js to export streamToObjectURL(path, mime) -> Promise<string objectURL>

import { streamImageTo } from './image_stream.js';

const IMG_RE = /\.(png|jpe?g|gif|bmp|webp)$/i;
const PDF_RE = /\.pdf$/i;

// ── Debug helper (toggle on/off here) ──────────────────────────────────────
const HIST_DEBUG = true;
function dlog(...args) {
  if (HIST_DEBUG) console.log('[history:debug]', ...args);
}

// BASE STATION FOLDER
// const SERVER_STATIONS_ROOT = '\\\\Ecbcv6cwvfsp001.ncr.int.ec.gc.ca\\msc$\\401\\WSCConstruction\\Stations\\';


const SERVER_STATIONS_ROOT = `C:\\Users\\nitsu\\OneDrive\\Documents\\Stations\\`;

// Name-based classification fallback
const IS_INSPECTION_NAME = /(inspection|assessment|site\s*visit|sitevisit|visit)/i;

// Skip directories by name
const SKIP_DIR = /^station[_\s-]*info$/i;
// Skip anything with "email" in the name (your new rule)
const SKIP_NAME = /email/i;

// Form state (kept simple)
let pendingPhotos = [];
let pendingPdf = null;

/**
 * Keep DOM children sorted newest→oldest by dataset keys.
 * Uses:
 *   data-sort-key (YYYYMMDDnn pattern as number, higher = newer)
 *   data-mtime    (mtime fallback as number)
 *   data-name     (stable tiebreak)
 */
function ensureSortedHistoryList(rootEl) {
  if (!rootEl) return;
  const kids = Array.from(rootEl.children || []);
  if (kids.length < 2) return;

  kids.sort((a, b) => {
    const ka = +(a.dataset.sortKey || 0);
    const kb = +(b.dataset.sortKey || 0);
    if (ka !== kb) return kb - ka; // newest first
    const ma = +(a.dataset.mtime || 0);
    const mb = +(b.dataset.mtime || 0);
    if (ma !== mb) return mb - ma;
    const na = a.dataset.name || '';
    const nb = b.dataset.name || '';
    return na.localeCompare(nb, undefined, { numeric: true, sensitivity: 'base' });
  });

  // Only reflow if the order actually changed
  let changed = false;
  for (let i = 0; i < kids.length; i++) {
    if (rootEl.children[i] !== kids[i]) {
      changed = true;
      break;
    }
  }
  if (!changed) return;

  if (HIST_DEBUG) dlog('ensureSortedHistoryList() → reflowing');
  const frag = document.createDocumentFragment();
  kids.forEach(n => frag.appendChild(n));
  rootEl.innerHTML = '';
  rootEl.appendChild(frag);
}

/**
 * Calculate the numeric sort key for a folder node.
 * Prefers the same logic used during the initial list build (dateKey(name)).
 * Falls back to any existing node.sortKey or 0.
 */
function _calcSortKeyFromNode(folderNode) {
  if (!folderNode) return 0;
  try {
    // If dateKey(name) exists in this module, reuse it for consistency.
    if (typeof dateKey === 'function') {
      const k = +dateKey(String(folderNode.name || ''));
      if (Number.isFinite(k)) return k;
    }
  } catch {}
  const k2 = +(folderNode.sortKey || 0);
  return Number.isFinite(k2) ? k2 : 0;
}

/**
 * Entry point called by station.js when a history tab is activated.
 * @param {'inspection'|'construction'} kind
 */
export async function loadHistoryTab(kind) {
  console.log(`[history] loadHistoryTab(${kind})`);

  const tabId =
    kind === 'inspection' ? 'inspection-history' : 'construction-history';
  const rootEl = document.getElementById(tabId);
  if (!rootEl) {
    console.warn(`[history] container #${tabId} not found`);
    return;
  }
  rootEl.innerHTML = ''; // Clear on each open

  // Add action bar with +Add buttons
  renderActionBar(rootEl, kind);

  // Resolve station folder & absolute root path (mirrors Photos tab)
  const { folderName, rootPath } = resolveStationPath();
  if (!folderName || !rootPath) {
    renderEmpty(rootEl, 'Unable to resolve station folder.');
    return;
  }
  console.log(`[history] looking in folder: ${folderName}`);
  console.log(`[history] root path: ${rootPath}`);

  // Ask Python for the directory tree
  let tree;
  try {
    tree = await eel.list_photos(rootPath, true)();
  } catch (e) {
    console.error('[history] list_photos failed', e);
    renderEmpty(rootEl, 'Could not list photos.');
    return;
  }

  if (!tree || !Array.isArray(tree.children) || tree.children.length === 0) {
    renderEmpty(rootEl, 'No history found.');
    return;
  }

  // Optional header for the Inspection tab
  if (kind === 'inspection') {
    const hdr = document.createElement('div');
    hdr.style =
      'margin: 8px 0 10px; font-weight:600; font-size:14px; opacity:0.85;';
    hdr.textContent = 'Next Inspection Due';
    rootEl.appendChild(hdr);
  }

  // Filter top-level folders into the requested category
  const topFolders = tree.children.filter((ch) => ch.type === 'folder');

  // Build lightweight descriptors with classification helpers

  if (HIST_DEBUG) {
    dlog(`Found ${topFolders.length} top-level folders for ${kind}`);
  }

  const enriched = await Promise.all(
    topFolders.map(async (f) => ({
      node: f,
      name: f.name || '',
      path: f.path || buildNodePath(tree, f) || null,
      mtime: Number(f.mtime_ts || 0),   // ← from backend, for instant “newest first”
      // quick checks to avoid showing undesired folders
      skip: SKIP_DIR.test(f.name) || SKIP_NAME.test(f.name), // hide "email"
      // Determine if this folder should be shown in "inspection"
      // Heuristics:
      //  - folder name looks like inspection, OR
      //  - contains a PDF with "inspection" in the name, OR
      //  - contains note.txt that has "Inspector:" line
      looksInspection: await looksLikeInspectionFolder(f),
      // Numeric key for sorting (YYYYMMDD). Missing month/day default to 12/31.
      sortKey: _dateKeyFromName_hist(f.name)
    }))

  );

  if (HIST_DEBUG) {
    dlog('Folders + derived keys:');
    console.table(enriched.map(x => ({
      name: x.name, looksInspection: x.looksInspection, sortKey: x.sortKey, mtime: x.mtime
    })));
  }

  const selected = enriched.filter((x) => {
    if (x.skip) return false;
    return kind === 'inspection' ? x.looksInspection : !x.looksInspection;
  });

  console.log(`[history] ${kind} folders: ${selected.length}`);

  if (selected.length === 0) {
    renderEmpty(
      rootEl,
      kind === 'inspection'
        ? 'No inspection history found.'
        : 'No construction history found.'
    );
    return;
  }

  if (HIST_DEBUG) {
    dlog(`${kind} → selected BEFORE sort:`);
    console.table(selected.map(x => ({ name: x.name, sortKey: x.sortKey, mtime: x.mtime })));
  }

  let __cmpCount = 0;
  const ordered = selected
    .slice()
    .sort((a, b) => {
      const ka = a.sortKey || 0;  // derived from name, 0 if missing
      const kb = b.sortKey || 0;
      let result;
      if (ka === 0 || kb === 0) {
        // If either failed to parse a date, fall back to mtime first
        result = (a.mtime !== b.mtime)
          ? (b.mtime - a.mtime)
          : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      } else if (ka !== kb) {
        result = kb - ka; // newest derived date first
      } else if (a.mtime !== b.mtime) {
        result = b.mtime - a.mtime;
      } else {
        result = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      }
      if (HIST_DEBUG && __cmpCount < 30) dlog('cmp', { a: a.name, ka }, 'vs', { b: b.name, kb }, '→', result);
      __cmpCount++;
      return result;
    });

  if (HIST_DEBUG) {
    dlog(`${kind} → AFTER sort:`);
    console.table(ordered.map(x => ({ name: x.name, sortKey: x.sortKey, mtime: x.mtime })));
  }

  ordered.forEach((wrap) => {
    renderHistoryFolder(kind, rootEl, wrap.node);
  });

  // defensive: keep DOM sorted even if other code appended out of order
  ensureSortedHistoryList(rootEl);
}

/* ───────────────────────── UI: Action Bar & Modal ───────────────────────── */

function renderActionBar(rootEl, kind) {
  const bar = document.createElement('div');
  bar.style =
    'display:flex; align-items:center; gap:8px; margin-bottom:10px; flex-wrap:wrap;';

  const addBtn = document.createElement('button');
  addBtn.textContent = kind === 'inspection' ? '+ Add Inspection' : '+ Add Construction';
  addBtn.addEventListener('click', () => openAddModal(kind));

  bar.appendChild(addBtn);
  rootEl.appendChild(bar);
}

function openAddModal(kind) {
  // Reset pending selections
  pendingPhotos = [];
  pendingPdf = null;

  const modal = document.createElement('div');
  modal.className = 'history-modal';
  modal.style = `
    position:fixed; inset:0; background:rgba(0,0,0,0.35);
    display:flex; align-items:center; justify-content:center; z-index:9999;
  `;

  const card = document.createElement('div');
  card.style = `
    background:#fff; min-width:480px; max-width:680px; width:90%;
    border-radius:8px; box-shadow:0 10px 30px rgba(0,0,0,.25); padding:16px;
  `;

  const title = document.createElement('div');
  title.style = 'font-weight:700; font-size:16px; margin-bottom:10px;';
  title.textContent =
    kind === 'inspection' ? 'Add Inspection' : 'Add Construction';

  const form = document.createElement('div');
  form.innerHTML = `
    <div style="display:grid; grid-template-columns:120px 1fr; gap:8px; align-items:center;">
      <label>Year</label>
      <input id="h-year" type="number" min="1900" max="2300" placeholder="2024" style="padding:6px; border:1px solid #ccc; border-radius:4px;">
      <label>Name</label>
      <input id="h-name" type="text" placeholder="Site work / Ice bridge" style="padding:6px; border:1px solid #ccc; border-radius:4px;">
      <label>Inspector</label>
      <input id="h-inspector" type="text" placeholder="First Last" style="padding:6px; border:1px solid #ccc; border-radius:4px;">
      <label>Comment</label>
      <textarea id="h-comment" rows="3" placeholder="Notes about the visit…" style="padding:6px; border:1px solid #ccc; border-radius:4px;"></textarea>

      <label>Photos</label>
      <div>
        <button id="h-pick-photos">Add photos…</button>
        <span id="h-photos-count" style="margin-left:8px; opacity:.75;">No files selected</span>
      </div>

      <label>Report PDF</label>
      <div>
        <button id="h-pick-pdf">Add inspection report…</button>
        <span id="h-pdf-name" style="margin-left:8px; opacity:.75;">None</span>
      </div>
    </div>
  `;

  // Footer
  const footer = document.createElement('div');
  footer.style = 'margin-top:14px; display:flex; gap:8px; justify-content:flex-end;';
  const cancel = document.createElement('button');
  cancel.textContent = 'Cancel';
  const save = document.createElement('button');
  save.type = 'button'; 
  save.textContent = 'Create';
  save.style = 'font-weight:600;';

  footer.append(cancel, save);
  card.append(title, form, footer);
  modal.appendChild(card);
  document.body.appendChild(modal);

  // Hidden <input type="file"> controls (match Excel import pattern)
  const photoInput = document.createElement('input');
  photoInput.type = 'file';
  photoInput.accept = 'image/*';
  photoInput.multiple = true;
  photoInput.style.display = 'none';
  card.appendChild(photoInput);

  const pdfInput = document.createElement('input');
  pdfInput.type = 'file';
  pdfInput.accept = 'application/pdf';
  pdfInput.style.display = 'none';
  card.appendChild(pdfInput);

  async function fileToBase64(file) {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }

  // Wire buttons
  const photosBtn = card.querySelector('#h-pick-photos');
  const photosLbl = card.querySelector('#h-photos-count');

  photosBtn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    photoInput.click();
  });
  photoInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) {
      pendingPhotos = [];
      photosLbl.textContent = 'No files selected';
      return;
    }
    pendingPhotos = await Promise.all(
      files.map(async f => ({ name: f.name, b64: await fileToBase64(f) }))
    );
    photosLbl.textContent = `${pendingPhotos.length} photo(s) selected`;
  });


  const pdfBtn = card.querySelector('#h-pick-pdf');
  const pdfLbl = card.querySelector('#h-pdf-name');

  pdfBtn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    pdfInput.click();
  });
  pdfInput.addEventListener('change', async (e) => {
    const f = (e.target.files || [])[0];
    if (!f) {
      pendingPdf = null;
      pdfLbl.textContent = 'None';
      return;
    }
    pendingPdf = { name: f.name, b64: await fileToBase64(f) };
    pdfLbl.textContent = basename(f.name);
  });

  cancel.addEventListener('click', () => modal.remove());

  save.addEventListener('click', async () => {
    const year = String(card.querySelector('#h-year').value || '').trim();
    const name = String(card.querySelector('#h-name').value || '').trim();
    const inspector = String(card.querySelector('#h-inspector').value || '').trim();
    const comment = String(card.querySelector('#h-comment').value || '').trim();

    if (!/^\d{4}$/.test(year)) {
      alert('Please enter a 4-digit Year.');
      return;
    }
    if (!name) {
      alert('Please enter a Name.');
      return;
    }

    // Build new folder path "<root>/<Year Name>"
    const { rootPath } = resolveStationPath();
    const folderDisplay = `${year} ${name}`;
    const destFolder = rootPath + '\\' + toFolderSafeForFS(folderDisplay);
    const photosDir = destFolder + '\\photos';
    const notePath = destFolder + '\\note.txt';
    const reportPath = destFolder + '\\inspection_report.pdf';

    save.disabled = true;
    save.textContent = 'Creating…';

    try {
      await eel.ensure_dir(destFolder)();
      await eel.ensure_dir(photosDir)();

      // Write note.txt
      const noteText = `Inspector: ${inspector || ''}\nComment: ${comment || ''}\n`;
      await eel.write_text_file(notePath, noteText)();

      // Save photos (base64 → disk)
      if (pendingPhotos.length > 0) {
        await eel.save_files_from_base64(pendingPhotos, photosDir)();
      }

      // Save & rename inspection report (base64 → "<dest>/inspection_report.pdf")
      if (pendingPdf && pendingPdf.b64) {
        await eel.save_file_from_base64(reportPath, pendingPdf.b64)();
      }

      // Done
      modal.remove();

      // Reload the appropriate tab so it appears immediately
      const isInsp = kind === 'inspection';
      await loadHistoryTab(isInsp ? 'inspection' : 'construction');
    } catch (e) {
      console.error('Create history entry failed', e);
      alert('Failed to create the entry. See console for details.');
      save.disabled = false;
      save.textContent = 'Create';
    }
  });
}

/* ───────────────────────── Render Folder Section ───────────────────────── */

async function renderHistoryFolder(kind, rootEl, folderNode) {
  const meta = await readFolderMeta(folderNode); // {inspector, comment}
  const { dateStr, title } = parseFolderTitle(folderNode.name);
  const headerLine = meta.inspector
    ? (dateStr ? `${dateStr} – ${title} by ${meta.inspector}` : `${title} by ${meta.inspector}`)
    : (dateStr ? `${dateStr} – ${title}` : title);

  const wrap = document.createElement('div');
  wrap.style = 'margin: 0 0 16px 0;';

  const header = document.createElement('div');
  header.style =
    'font-weight:600; margin-bottom:6px; font-size:14px; line-height:1.2;';
  header.textContent = headerLine;
  wrap.appendChild(header);

  // Comment (if note.txt)
  if (meta.comment) {
    const cmt = document.createElement('div');
    cmt.style =
      'margin: 4px 0 8px; font-size:13px; opacity:0.9; white-space:pre-wrap;';
    cmt.textContent = meta.comment;
    wrap.appendChild(cmt);
  }

  // Collect images recursively under this folder
  const images = [];
  collectImages(folderNode, images);
  console.log(
    `[history] section '${folderNode.name}' images: ${images.length}`
  );

  // Thumbnails row
  const row = document.createElement('div');
  row.style =
    'display:flex; align-items:center; gap:8px; flex-wrap:wrap; min-height:96px;';

  const first = images.slice(0, 4);
  first.forEach((fileNode) => {
    const img = document.createElement('img');
    img.alt = fileNode.name;
    img.style =
      'width:120px; height:90px; object-fit:cover; border-radius:4px; background:#eee; cursor:pointer;';
    row.appendChild(img);

    const fullPath = fileNode.path || buildNodePath(folderNode, fileNode);
    if (fullPath) {
      streamImageTo(img, fullPath); // chunked streaming
      img.addEventListener('click', () => streamImageTo(img, fullPath));
    }
  });

  const extra = images.length - first.length;
  if (extra > 0) {
    const more = document.createElement('span');
    more.textContent = `+ ${extra} more`;
    more.style = 'opacity:.7;';
    row.appendChild(more);
  }

  // Actions
  const actions = document.createElement('div');
  actions.style = 'margin-top:6px; display:flex; gap:8px; align-items:center;';

  let btnReport = null;
  if (kind === 'inspection') {
    btnReport = document.createElement('button');
    btnReport.textContent = 'Inspection Report';
    btnReport.addEventListener('click', async () => {
      const pdfPath = findInspectionPdf(folderNode);
      if (!pdfPath) {
        alert('No inspection PDF found in this folder.');
        return;
      }
      await openPdfInApp(pdfPath);
    });
  }

  const btnDelete = document.createElement('button');
  btnDelete.textContent =
    kind === 'inspection' ? 'Delete Inspection' : 'Delete Construction';

  // Enable + wire up
  btnDelete.disabled = false;
  btnDelete.addEventListener('click', async () => {
    const { rootPath } = resolveStationPath();
    if (!rootPath) {
      alert('Unable to resolve station folder path.');
      return;
    }

    // What to delete:
    const targetPath = `${rootPath}\\${folderNode.name}`;  // delete this entry only

    const msg = `Delete this ${kind} entry folder?\n\n${targetPath}\n\n` +
                `This removes its photos and report. The station folder remains.\n\nProceed?`;

    if (!window.confirm(msg)) return;

    try {
      btnDelete.disabled = true;
      btnDelete.textContent = 'Deleting…';

      const res = await eel.delete_dir(targetPath)();
      if (!res || !res.success) {
        alert('Delete failed: ' + (res && res.message ? res.message : 'Unknown error'));
        btnDelete.disabled = false;
        btnDelete.textContent =
          kind === 'inspection' ? 'Delete Inspection' : 'Delete Construction';
        return;
      }

      // Refresh the current tab
      await loadHistoryTab(kind);

      // If you deleted the whole station, the construction list is gone too:
      if (kind === 'inspection') {
        // Optionally refresh construction tab UI if it might be open elsewhere
        // await loadHistoryTab('construction');
      }
    } catch (e) {
      console.error('Delete error', e);
      alert('Delete failed. See console for details.');
      btnDelete.disabled = false;
      btnDelete.textContent =
        kind === 'inspection' ? 'Delete Inspection' : 'Delete Construction';
    }
  });


  if (btnReport) actions.append(btnReport);
  actions.append(btnDelete);
  wrap.append(row, actions);
  // Tag with data so we can sort later even for one-off appends
  try {
    const sortKey = _dateKeyFromName_hist(folderNode.name);
    const mtime   = folderNode.mtime || 0;
    wrap.dataset.sortKey = String(sortKey || 0);
    wrap.dataset.mtime   = String(mtime || 0);
    wrap.dataset.name    = folderNode.name || '';
    if (HIST_DEBUG) dlog('renderHistoryFolder tag', { name: folderNode.name, sortKey, mtime });
  } catch (e) {
    console.warn('renderHistoryFolder: failed to set dataset keys', e);
  }

  rootEl.appendChild(wrap);

  // If someone calls renderHistoryFolder ad-hoc (e.g., after creating a folder),
  // keep the list in the correct order.
  queueMicrotask(() => ensureSortedHistoryList(rootEl));

}

/* ───────────────────────── Helpers ───────────────────────── */

function renderEmpty(el, msg) {
  const div = document.createElement('div');
  div.style =
    'padding:12px; border:1px dashed #ccc; border-radius:6px; font-size:13px; opacity:0.8;';
  div.textContent = msg;
  el.appendChild(div);
}

function collectImages(node, out) {
  if (!node) return;
  if (node.type === 'file' && IMG_RE.test(node.name)) {
    out.push(node);
    return;
  }
  if (Array.isArray(node.children)) {
    node.children.forEach((ch) => collectImages(ch, out));
  }
}

function parseFolderTitle(name) {
  const s = (name ?? '').toString();                 // always a string
  const clean = s.replace(/[_\-]+/g, ' ').trim();

  // Try to pull a leading year, but the rest may be missing/odd
  const m = clean.match(/^(\d{4})\s+(.*)$/);

  const dateStr = m ? m[1] : '';
  const rawTitle = (m && typeof m[2] === 'string') ? m[2] : clean;

  const title = (rawTitle || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());

  return { dateStr, title };
}


function _dateKeyFromName_hist(name) {
  const clean = String(name || '').replace(/[_\-]+/g, ' ').trim();
  // Find a 4-digit year anywhere; optional month/day after it.
  const m = clean.match(/\b((?:19|20)\d{2})(?:\s+(\d{1,2}))?(?:\s+(\d{1,2}))?/);
  let key = 0;
  if (m) {
    const y  = +m[1];
    const mo = Math.min(12, Math.max(1, +(m[2] || 12)));
    const d  = Math.min(31, Math.max(1, +(m[3] || 31)));
    key = y * 10000 + mo * 100 + d;
  }
  if (HIST_DEBUG) dlog(`dateKey("${name}") → clean="${clean}" match=${!!m} key=${key}`);
  return key;

}

/**
 * Attempt to reconstruct a file path if the backend didn't include fileNode.path.
 * This assumes every node includes an absolute path at its own level OR its root ancestor.
 */
function buildNodePath(folderNode, fileNode) {
  if (fileNode?.path) return fileNode.path;
  if (folderNode?.path) return folderNode.path + '\\' + fileNode.name;
  return null;
}

/**
 * Resolves the station folder name and absolute root path the same way Photos tab does.
 */
function resolveStationPath() {
  if (window.__stationFolder && typeof window.__stationFolder === 'string') {
    const folderName = window.__stationFolder;
    return { folderName, rootPath: SERVER_STATIONS_ROOT + folderName };
  }

  const titleNode = document.getElementById('stationTitle');
  if (titleNode && titleNode.textContent) {
    const txt = titleNode.textContent.trim();
    const m = txt.match(/^(.*)\s*\(([^)]+)\)\s*$/);
    if (m) {
      const name = toFolderSafe(m[1]);
      const id = toFolderSafe(m[2]);
      const folderName = `${name}_${id}`;
      return { folderName, rootPath: SERVER_STATIONS_ROOT + folderName };
    }
  }

  const root = document.querySelector('[data-station-folder]');
  if (root && root.dataset.stationFolder) {
    const folderName = root.dataset.stationFolder;
    return { folderName, rootPath: SERVER_STATIONS_ROOT + folderName };
  }

  return { folderName: null, rootPath: null };
}

function toFolderSafe(s) {
  return String(s || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function toFolderSafeForFS(s) {
  // Keep spaces (your spec says "Year Name"), but strip forbidden chars for Windows paths.
  return String(s || '').replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '').trim();
}

function basename(p) {
  if (!p) return '';
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
  return i >= 0 ? p.slice(i + 1) : p;
}

/* ───────────────────────── Classification & Meta ───────────────────────── */

async function looksLikeInspectionFolder(folderNode) {
  // 1) name contains "inspection" etc.
  if (IS_INSPECTION_NAME.test(folderNode.name.replace(/_/g, ' '))) {
    if (HIST_DEBUG) dlog(`looksLikeInspectionFolder("${folderNode.name}") → by name`);
    return true;
  }
  // 2) contains a PDF with "inspection" in the filename
  const pdf = findInspectionPdf(folderNode);
  if (pdf) {
    if (HIST_DEBUG) dlog(`looksLikeInspectionFolder("${folderNode.name}") → by PDF: ${pdf}`);
    return true;
  }

  // 3) note.txt has an Inspector line -> we’ll treat as inspection
  const meta = await readFolderMeta(folderNode);
  if (meta.inspector) {
    if (HIST_DEBUG) dlog(`looksLikeInspectionFolder("${folderNode.name}") → by Inspector in note.txt`);
    return true;
  }

  return false;
}

function findInspectionPdf(folderNode) {
  let found = null;

  function walk(n) {
    if (found) return;
    if (n.type === 'file' && PDF_RE.test(n.name) && /inspection/i.test(n.name)) {
      found = n.path || buildNodePath(folderNode, n);
      return;
    }
    if (Array.isArray(n.children)) {
      for (const ch of n.children) walk(ch);
    }
  }
  walk(folderNode);
  return found;
}

async function readFolderMeta(folderNode) {
  // Find a note.txt file
  let notePath = null;
  (function find(n) {
    if (notePath) return;
    if (n.type === 'file' && /^note\.txt$/i.test(n.name)) {
      notePath = n.path || buildNodePath(folderNode, n);
      return;
    }
    if (Array.isArray(n.children)) n.children.forEach(find);
  })(folderNode);

  if (!notePath) {
    if (HIST_DEBUG) dlog(`readFolderMeta("${folderNode.name}") → no note.txt`);
    return { inspector: '', comment: '' };
  }

  try {
    const text = await eel.read_text_file(notePath)(); // small text, safe to send
    const inspector = (text.match(/^\s*Inspector:\s*(.*)$/im) || [,''])[1].trim();
    const comment = (text.match(/^\s*Comment:\s*([\s\S]*)$/im) || [,''])[1].trim();
    if (HIST_DEBUG) dlog(`readFolderMeta("${folderNode.name}") → inspector="${inspector}"`);
    return { inspector, comment };
  } catch (e) {
    console.warn('read_text_file failed', e);
    return { inspector: '', comment: '' };
  }
}

/* ───────────────────────── PDF Viewer ───────────────────────── */

async function openPdfInApp(absPath) {
  // Prefer a generic chunked streamer if your Photos tab already exposes it
  if (typeof window.streamToObjectURL === 'function') {
    try {
      const url = await window.streamToObjectURL(absPath, 'application/pdf');
      showPdfModal(url, basename(absPath));
      return;
    } catch (e) {
      console.warn('streamToObjectURL failed, falling back to native open', e);
    }
  }

  // Fallback: ask Python to open in native viewer if in-app stream isn’t available
  try {
    await eel.open_file_natively(absPath)();
  } catch (e) {
    console.error('open_file_natively failed', e);
    alert('Unable to open PDF.');
  }
}

function showPdfModal(objectUrl, title = 'Inspection Report') {
  const modal = document.createElement('div');
  modal.style = `
    position:fixed; inset:0; background:rgba(0,0,0,.5);
    display:flex; align-items:center; justify-content:center; z-index:10000;`;

  const frameWrap = document.createElement('div');
  frameWrap.style = `
    background:#fff; width:90vw; height:90vh; border-radius:8px;
    box-shadow:0 10px 30px rgba(0,0,0,.25); display:flex; flex-direction:column;`;

  const bar = document.createElement('div');
  bar.style = 'display:flex; align-items:center; justify-content:space-between; padding:8px 12px; border-bottom:1px solid #eee;';
  const ttl = document.createElement('div');
  ttl.style = 'font-weight:600;';
  ttl.textContent = title;
  const close = document.createElement('button');
  close.textContent = 'Close';
  bar.append(ttl, close);

  const iframe = document.createElement('iframe');
  iframe.style = 'border:0; width:100%; height:100%;';
  iframe.src = objectUrl;

  frameWrap.append(bar, iframe);
  modal.appendChild(frameWrap);
  document.body.appendChild(modal);

  close.addEventListener('click', () => {
    URL.revokeObjectURL(objectUrl);
    modal.remove();
  });
}
