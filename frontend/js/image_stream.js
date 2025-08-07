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