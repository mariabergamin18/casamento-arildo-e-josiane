const $ = selector => document.querySelector(selector);
const album = $('#carousel');
const status = $('#album-status');
const download = $('#download-all');
const downloadLabel = download.querySelector('.download-label');
const single = $('#download-current');
const extension = mime => ({'image/png':'png','image/webp':'webp','image/gif':'gif','image/avif':'avif','image/heic':'heic','image/heif':'heif'})[mime] || 'jpg';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const previews = new Map();
const preloaded = new Map();
const failed = new Set();
let photos = [], current = 0, timer, generation = 0, signature = null;
let preparedFiles = null, preparing = false, loading = false, imageLoading = false;
let preparation = null, shareRequested = false, sharing = false;
const fileCache = new Map();
// Balance faster album preparation against Safari's memory and connection limits.
const maxParallelDownloads = navigator.connection?.saveData ? 3 : 6;

function setDownloadLoading(active) {
  download.classList.toggle('is-loading', active);
  download.setAttribute('aria-busy', String(active));
  download.setAttribute('aria-label', active ? 'Preparando fotos para salvar' : 'Salvar todas as fotos');
}


function displayUrl(photo) { return previews.get(photo.id) || photo.url; }
function start() {
  clearTimeout(timer);
  if (photos.length > 1 && !reducedMotion.matches && !document.hidden && !imageLoading) {
    timer = setTimeout(() => show(current + 1), 2000);
  }
}
function preloadNext() {
  if (photos.length < 2 || navigator.connection?.saveData) return;
  const url = displayUrl(photos[(current + 1) % photos.length]);
  if (!preloaded.has(url)) {
    const image = new Image();
    image.decoding = 'async';
    image.fetchPriority = 'low';
    image.src = url;
    preloaded.set(url, image);
    if (preloaded.size > 3) preloaded.delete(preloaded.keys().next().value);
  }
}
function show(index) {
  if (!photos.length) return;
  clearTimeout(timer);
  imageLoading = true;
  const request = ++generation;
  const target = (index + photos.length) % photos.length;
  const photo = photos[target];
  const slide = document.createElement('div');
  slide.className = 'slide';
  const image = document.createElement('img');
  image.alt = `Memória compartilhada ${target + 1} de ${photos.length}`;
  image.decoding = 'async';
  image.fetchPriority = 'high';
  image.onload = () => {
    if (request !== generation) return;
    current = target;
    imageLoading = false;
    failed.delete(photo.id);
    album.append(slide);
    requestAnimationFrame(() => slide.classList.add('active'));
    for (const old of album.querySelectorAll('.slide')) {
      if (old !== slide) setTimeout(() => old.remove(), 550);
    }
    single.href = photo.url;
    single.download = `arildo-josi-${String(current + 1).padStart(3, '0')}.${extension(photo.mime)}`;
    preloadNext();
    start();
  };
  image.onerror = () => {
    if (request !== generation) return;
    if (previews.has(photo.id)) {
      previews.delete(photo.id);
      image.src = photo.url;
      return;
    }
    imageLoading = false;
    failed.add(photo.id);
    if (failed.size < photos.length) timer = setTimeout(() => show(target + 1), 600);
    else if (!album.querySelector('img')) album.innerHTML = '<div class="slide active"><div class="placeholder">As fotos estão temporariamente indisponíveis.</div></div>';
  };
  slide.append(image);
  image.src = displayUrl(photo);
}
function applyPhotos(data) {
  if (data.ok !== true || !Array.isArray(data.photos)) throw Error(data.error || 'Não foi possível abrir o álbum.');
  const next = data.photos.filter(photo => typeof photo.id === 'string' && /^\/api\/album\/(?:photo|drive)\/[\w-]{10,100}$/.test(photo.url || ''));
  for (const photo of next) {
    if (/^\/album-previews\/[a-f0-9]{20}\.jpg$/.test(photo.previewUrl || '')) previews.set(photo.id, photo.previewUrl);
  }
  const nextSignature = next.map(photo => `${photo.id}:${photo.url}`).join(',');
  if (nextSignature === signature) return;
  const oldId = photos[current]?.id;
  photos = next;
  signature = nextSignature;
  preparedFiles = null;
  failed.clear();
  downloadLabel.textContent = 'Salvar tudo';
  download.disabled = !photos.length;
  if (!photos.length) setDownloadLoading(false);
  single.hidden = true;
  if (!photos.length) {
    generation++;
    imageLoading = false;
    album.innerHTML = '<div class="slide active"><div class="placeholder">As fotos aparecerão aqui assim que forem compartilhadas.</div></div>';
    clearTimeout(timer);
    return;
  }
  const retained = photos.findIndex(photo => photo.id === oldId);
  // Keep an already displayed photo while the background list refreshes.
  if (retained >= 0 && album.querySelector('img') && !imageLoading) {
    current = retained;
    preloadNext();
    start();
  } else show(Math.max(0, retained));
  const ids = new Set(photos.map(photo => photo.id));
  for (const id of fileCache.keys()) if (!ids.has(id)) fileCache.delete(id);
  prepareAll();
}
async function loadPhotos() {
  if (preparing || loading) return;
  loading = true;
  try {
    const response = await fetch('/api/album', {signal:AbortSignal.timeout(60000)});
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Não foi possível abrir o álbum.');
    if (preparing) return;
    applyPhotos(data);
    if (status.dataset.refreshError) { status.textContent = ''; delete status.dataset.refreshError; }
  } catch (error) {
    // An unavailable refresh does not interrupt a loaded album.
    if (!photos.length) {
      album.innerHTML = '<div class="slide active"><div class="placeholder">O álbum está temporariamente indisponível.</div></div>';
      shareRequested = false;
      setDownloadLoading(false);
      download.disabled = false;
      status.textContent = error.message;
      status.dataset.refreshError = 'true';
    }
  } finally { loading = false; }
}
function openSaveOptions() {
  if (!preparedFiles || sharing) return;
  sharing = true;
  shareRequested = false;
  setDownloadLoading(false);
  download.disabled = true;
  let action;
  try {
    // Invoke synchronously for a tap when files are already ready.
    action = navigator.share({files:preparedFiles,title:'Memórias de Arildo e Josi'});
  } catch (error) { action = Promise.reject(error); }
  Promise.resolve(action).catch(error => {
    // Long network waits can outlive the browser's permitted user activation.
    // Keep the same ready button; never force a separate preparation step.
    if (error.name === 'AbortError' || error.name === 'NotAllowedError') return;
    single.hidden = false;
  }).finally(() => { sharing = false; download.disabled = !photos.length; });
}
function prepareAll() {
  if (preparation) return preparation;
  if (!photos.length) return Promise.resolve();
  if (!navigator.share || !navigator.canShare) {
    shareRequested = false;
    setDownloadLoading(false);
    single.hidden = false;
    return Promise.resolve();
  }
  if (preparedFiles) {
    if (shareRequested) openSaveOptions();
    return Promise.resolve();
  }
  preparing = true;
  const selection = photos.slice();
  const expectedSignature = signature;
  const files = new Array(selection.length);
  let cursor = 0, cancelled = false;
  preparation = (async () => {
    try {
      async function worker() {
        while (!cancelled && cursor < selection.length) {
          const index = cursor++;
          const photo = selection[index];
          const name = `arildo-josi-${String(index + 1).padStart(3, '0')}.${extension(photo.mime)}`;
          const cached = fileCache.get(photo.id);
          if (cached && cached.url === photo.url) {
            files[index] = new File([cached.blob], name, {type:cached.blob.type || photo.mime});
            continue;
          }
          let response;
          for (let attempt = 0; attempt < 2; attempt++) {
            response = await fetch(photo.url, {signal:AbortSignal.timeout(45000),cache:'force-cache'});
            if (response.ok) break;
          }
          if (!response.ok) throw Error('Foto indisponível');
          const blob = await response.blob();
          const mime = blob.type || photo.mime || 'image/jpeg';
          fileCache.set(photo.id, {url:photo.url,blob});
          files[index] = new File([blob], name, {type:mime});
        }
      }
      await Promise.all(Array.from({length:Math.min(maxParallelDownloads,selection.length)}, worker));
      if (expectedSignature !== signature) return;
      if (!navigator.canShare({files})) throw Error('Compartilhamento indisponível');
      preparedFiles = files;
      if (shareRequested) openSaveOptions();
    } catch {
      cancelled = true;
      shareRequested = false;
      preparedFiles = null;
      setDownloadLoading(false);
      single.hidden = false;
    } finally {
      preparing = false;
      preparation = null;
      if (!sharing) download.disabled = !photos.length;
    }
  })();
  return preparation;
}
download.addEventListener('click', () => {
  if (sharing) return;
  if (preparedFiles) { openSaveOptions(); return; }
  shareRequested = true;
  setDownloadLoading(true);
  if (photos.length) prepareAll();
  else loadPhotos();
});
let touchX = null;
album.addEventListener('touchstart', event => { touchX = event.changedTouches[0]?.clientX ?? null; }, {passive:true});
album.addEventListener('touchend', event => {
  if (touchX === null) return;
  const delta = (event.changedTouches[0]?.clientX ?? touchX) - touchX;
  touchX = null;
  if (Math.abs(delta) > 35) show(current + (delta < 0 ? 1 : -1));
}, {passive:true});
document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else start(); });
reducedMotion.addEventListener('change', start);
async function init() {
  try {
    const initial = $('#album-initial-data');
    if (initial) applyPhotos(JSON.parse(initial.textContent));
    else {
      const response = await fetch('/album-index.json');
      if (response.ok) applyPhotos(await response.json());
    }
  } catch { /* Live Drive album remains available. */ }
  loadPhotos();
}
init();
setInterval(() => { if (!document.hidden) loadPhotos(); }, 30000);
