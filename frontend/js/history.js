// frontend/js/history.js
// Streams and renders thumbnails for Inspection / Construction history tabs,
// implements add flows, and in-app PDF viewer for inspection reports.

// EXPECTS: image_stream.js to export streamImageTo(imgEl, absolutePath)
// OPTIONAL: image_stream.js to export streamToObjectURL(path, mime) -> Promise<string objectURL>

import { streamImageTo } from './image_stream.js';

const IMG_RE = /\.(png|jpe?g|gif|bmp|webp)$/i;
const PDF_RE = /\.pdf$/i;

const SERVER_STATIONS_ROOT = '\\\\Ecbcv6cwvfsp001.ncr.int.ec.gc.ca\\msc$\\401\\WSCConstruction\\Stations\\';

// Name-based classification fallback
const IS_INSPECTION_NAME = /(inspection|assessment|site\s*visit|sitevisit|visit)/i;

// Skip directories by name
const SKIP_DIR = /^station[_\s-]*info$/i;
// Skip anything with "email" in the name (your new rule)
const SKIP_NAME = /email/i;

// Form state (kept simple)
let pendingPhotos = [];
let pendingPdf = '';

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
    tree = await eel.list_photos(rootPath)();
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
  const enriched = await Promise.all(
    topFolders.map(async (f) => ({
      node: f,
      name: f.name || '',
      path: f.path || buildNodePath(tree, f) || null,
      // quick checks to avoid showing undesired folders
      skip:
        SKIP_DIR.test(f.name) ||
        SKIP_NAME.test(f.name), // hide "email"
      // Determine if this folder should be shown in "inspection"
      // Heuristics:
      //  - folder name looks like inspection, OR
      //  - contains a PDF with "inspection" in the name, OR
      //  - contains note.txt that has "Inspector:" line
      looksInspection: await looksLikeInspectionFolder(f),
    }))
  );

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

  // Sort by name (assumes leading year) newest first
  selected
    .slice()
    .sort((a, b) => b.name.localeCompare(a.name))
    .forEach((wrap) => {
      renderHistoryFolder(kind, rootEl, wrap.node);
    });
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
  pendingPdf = '';

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
  save.textContent = 'Create';
  save.style = 'font-weight:600;';

  footer.append(cancel, save);
  card.append(title, form, footer);
  modal.appendChild(card);
  document.body.appendChild(modal);

  // Wire buttons
  const photosBtn = card.querySelector('#h-pick-photos');
  const photosLbl = card.querySelector('#h-photos-count');
  photosBtn.addEventListener('click', async () => {
    try {
      const files = await eel.pick_images()(); // returns list[str absolute paths]
      if (Array.isArray(files)) {
        pendingPhotos = files;
        photosLbl.textContent =
          files.length === 0 ? 'No files selected' : `${files.length} photo(s) selected`;
      }
    } catch (e) {
      console.error('pick_images failed', e);
      alert('Could not open photo picker.');
    }
  });

  const pdfBtn = card.querySelector('#h-pick-pdf');
  const pdfLbl = card.querySelector('#h-pdf-name');
  pdfBtn.addEventListener('click', async () => {
    try {
      const picked = await eel.pick_pdf()(); // returns string absolute path or ''
      if (picked && typeof picked === 'string') {
        pendingPdf = picked;
        pdfLbl.textContent = basename(picked);
      } else {
        pendingPdf = '';
        pdfLbl.textContent = 'None';
      }
    } catch (e) {
      console.error('pick_pdf failed', e);
      alert('Could not open PDF picker.');
    }
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

      // Copy photos
      if (pendingPhotos.length > 0) {
        await eel.copy_files(pendingPhotos, photosDir)();
      }

      // Copy & rename inspection report
      if (pendingPdf) {
        await eel.copy_file(pendingPdf, reportPath)();
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

  const btnReport = document.createElement('button');
  btnReport.textContent =
    kind === 'inspection' ? 'Inspection Report' : 'Open Report';
  btnReport.addEventListener('click', async () => {
    const pdfPath = findInspectionPdf(folderNode);
    if (!pdfPath) {
      alert('No inspection PDF found in this folder.');
      return;
    }
    await openPdfInApp(pdfPath);
  });

  const btnDelete = document.createElement('button');
  btnDelete.textContent =
    kind === 'inspection' ? 'Delete Inspection' : 'Delete Construction';
  btnDelete.disabled = true; // unchanged per your original note

  actions.append(btnReport, btnDelete);
  wrap.append(row, actions);
  rootEl.appendChild(wrap);
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
  // Examples:
  //  "2015-cableway-inspection" -> { dateStr:"2015", title:"Cableway Inspection" }
  //  "2019_ice work"            -> { dateStr:"2019", title:"Ice Work" }
  //  "2024 New Gauge"           -> { dateStr:"2024", title:"New Gauge" }
  const clean = String(name || '').replace(/[_\-]+/g, ' ').trim();
  const m = clean.match(/^(\d{4})\s+(.*)$/);
  const rawTitle = m ? m[2] : clean;
  const dateStr = m ? m[1] : '';
  const title = rawTitle
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return { dateStr, title };
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
  if (IS_INSPECTION_NAME.test(folderNode.name.replace(/_/g, ' '))) return true;

  // 2) contains a PDF with "inspection" in the filename
  const pdf = findInspectionPdf(folderNode);
  if (pdf) return true;

  // 3) note.txt has an Inspector line -> we’ll treat as inspection
  const meta = await readFolderMeta(folderNode);
  if (meta.inspector) return true;

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

  if (!notePath) return { inspector: '', comment: '' };

  try {
    const text = await eel.read_text_file(notePath)(); // small text, safe to send
    const inspector = (text.match(/^\s*Inspector:\s*(.*)$/im) || [,''])[1].trim();
    const comment = (text.match(/^\s*Comment:\s*([\s\S]*)$/im) || [,''])[1].trim();
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
