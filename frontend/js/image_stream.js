// Shared streaming for base64 images over Eel WebSocket (chunked).
// Both Photos tab and History tabs use this so we never push giant frames.
export function streamImageTo(imgEl, path) {
  if (!imgEl || !path) return;
  const uid = `${Date.now()}_${Math.random()}`;
  (window.__imgStreams ||= {})[uid] = { chunks: [], img: imgEl };
  try {
    eel.stream_photo(path, uid);
  } catch (e) {
    console.error('[image_stream] stream_photo failed', e);
  }
}

function receive_photo_chunk(uid, chunk) {
  const entry = (window.__imgStreams || {})[uid];
  if (entry) entry.chunks.push(chunk);
}
eel.expose(receive_photo_chunk);

function receive_photo_done(uid) {
  const entry = (window.__imgStreams || {})[uid];
  if (!entry) return;
  const { chunks, img } = entry;
  img.src = `data:image/jpeg;base64,${chunks.join('')}`;
  delete (window.__imgStreams || {})[uid];
}
eel.expose(receive_photo_done);

window.streamToObjectURL = async function(path, mime = 'application/pdf') {
  // 1) Get base64 chunks from Python
  const chunks = await eel.get_photo_chunks(path)();
  const b64 = (chunks || []).join('');

  // 2) Convert base64 → Blob (then to an object URL)
  //    This avoids super-long data: URLs that can cause blank renders.
  function base64ToBlobUrl(base64, type) {
    // Decode in one go (simplest & fast). If you expect >50–100MB PDFs and hit memory limits,
    // switch to the chunked decode shown below.
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type });
    return URL.createObjectURL(blob);
  }

  const url = base64ToBlobUrl(b64, mime);

  // (Optional) quick sanity check for a real PDF header
  // If this trips, fall back to native open.
  // const head = atob(b64.slice(0, 24));
  // if (!head.startsWith('%PDF')) console.warn('Not a PDF header:', head);

  return url;
};