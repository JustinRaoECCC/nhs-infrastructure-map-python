/**
* Call this *after* station_snippet.html is injected and the Photos tab is made active.
*/


// ─── Photo streaming support ───────────────────────────────────────────────
// Buffers incoming base64 chunks per image
const photoStreams = {};

// Called by Python/Eel for each chunk
function receive_photo_chunk(uid, chunk) {
  if (photoStreams[uid]) photoStreams[uid].chunks.push(chunk);
};

eel.expose(receive_photo_chunk);

// Called by Python/Eel when the stream is complete
function receive_photo_done(uid) {
  const entry = photoStreams[uid];
  if (!entry) return;
  const { chunks, img } = entry;
  img.src = `data:image/jpeg;base64,${chunks.join('')}`;
  delete photoStreams[uid];
};

+eel.expose(receive_photo_done);

export async function loadPhotosTab() {
  console.log("[photos] loadPhotosTab()");

  const photosTab = document.getElementById("photos");
  if (!photosTab) {
    console.error("[photos] No #photos element found when loading tab!");
    return;
  }

  // Load the HTML if not already loaded
  if (!photosTab.dataset.loaded) {
    console.log("[photos] fetching photos.html…");
    try {
      const res = await fetch("photos.html");
      console.log("[photos] photos.html status:", res.status);
      const html = await res.text();
      photosTab.innerHTML = html;
      photosTab.dataset.loaded = "true";
    } catch (err) {
      return console.error("[photos] error loading photos.html:", err);
    }
  }

  // Now run the rest of the init logic
  await initPhotos();
}

async function initPhotos() {
  console.log("[photos] initPhotos()");
  const backBtn = document.getElementById("photosBack");
  const listEl  = document.getElementById("photosList");
  const preview = document.getElementById("photoPreview");
  const img     = document.getElementById("photoImg");

  // Build folder name = SITE_NAME_WITH_UNDERSCORES + "_" + STATION_ID
  const titleText = document.getElementById("stationTitle")?.textContent || "";
  const m = titleText.match(/^(.*)\s*\(([^)]+)\)$/);
  if (!m) {
    return console.error("[photos] invalid stationTitle format:", titleText);
  }
  // 1) site part with spaces → underscores
  const sitePart = m[1].trim().replace(/\s+/g, "_");
  // 2) station ID
  const idPart   = m[2];
  // Combined folder
  const folderName = `${sitePart}_${idPart}`;
  console.log("[photos] looking in folder:", folderName);
  const root = `\\\\Ecbcv6cwvfsp001.ncr.int.ec.gc.ca\\msc$\\401\\WSCConstruction\\Stations\\${folderName}`;
  console.log("[photos] root path:", root);

  // Fetch the folder tree
  let tree;
  try {
    console.log("[photos] calling eel.list_photos");
    tree = await eel.list_photos(root)();
    console.log("[photos] received tree:", tree);
  } catch (err) {
    return console.error("[photos] error in list_photos:", err);
  }

  const stack = [];
  
  function render(node) {
    console.log("[photos] render node:", node.name, node.children?.length);
    listEl.innerHTML = "";
    node.children.forEach(child => {
      const li = document.createElement("li");
      li.style = "flex: 0 0 100px; text-align:center; cursor:pointer; margin:0.5em;";

      // build a two‐row icon+label
      const iconDiv  = document.createElement("div");
      const labelDiv = document.createElement("div");
      iconDiv.style  = "font-size:48px; line-height:1; margin-bottom:0.25em;";
      labelDiv.style = "font-size:0.9em; word-break:break-word;";

      if (child.type === "folder") {
        iconDiv.textContent = "📁";
        labelDiv.textContent = child.name;
        li.append(iconDiv, labelDiv);
        li.addEventListener("click", () => {
          stack.push(node);
          render(child);
          backBtn.style.display = "inline";
        });
      } else {
        const thumb = document.createElement("img");
        thumb.style = "width:100px;height:100px;object-fit:cover;display:block;margin:0 auto;";
        iconDiv.appendChild(thumb);
        labelDiv.textContent = child.name;
        li.append(iconDiv, labelDiv);

        // Stream thumbnail via Eel in small chunks
        (() => {
          const uid = `${Date.now()}_${Math.random()}`;
          photoStreams[uid] = { chunks: [], img: thumb };
          eel.stream_photo(child.path, uid);
        })();


        // On click, preview full image (reuse same dataUrl)
        li.addEventListener("click", async () => {
          // Stream full‐size image via the same chunked mechanism
          const uid = `${Date.now()}_${Math.random()}`;
          photoStreams[uid] = { chunks: [], img: img };
          eel.stream_photo(child.path, uid);
          preview.style.display = "flex";
        });

      }
      // Append this item
      listEl.appendChild(li);
    });         // ← close forEach
  }             // ← close render()

  // bind Back button once
  backBtn.onclick = () => {
    console.log("[photos] back clicked, stack:", stack.map(n => n.name));
    const prev = stack.pop();
    render(prev || tree);
    if (!stack.length) backBtn.style.display = "none";
  };

  // bind preview click once
  preview.onclick = () => {
    console.log("[photos] preview clicked, hiding");
    preview.style.display = "none";
  };

  // Kick off initial render
  render(tree);

}