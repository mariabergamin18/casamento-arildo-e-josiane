const $ = selector => document.querySelector(selector);
const album = $('#carousel');
const status = $('#album-status');
const download = $('#download-all');
const downloadLabel = download.querySelector('span');
const single = $('#download-current');
const extension = mime => ({'image/png':'png','image/webp':'webp','image/gif':'gif','image/avif':'avif','image/heic':'heic','image/heif':'heif'})[mime] || 'jpg';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const previews = new Map();
const preloaded = new Map();
const failed = new Set();
let photos = [], current = 0, timer, generation = 0, signature = null;
let preparedFiles = null, preparing = false, loading = false, imageLoading = false;

function displayUrl(photo) { return previews.get(photo.id) || photo.url; }
function start() {
  clearTimeout(timer);
  if (photos.length > 1 && !reducedMotion.matches && !document.hidden && !preparing && !imageLoading) {
    timer = setTimeout(() => show(current + 1), 2000);
  }
}
function preloadNext() {
  if (photos.length < 2 || preparing || navigator.connection?.saveData) return;
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
    // A missing preview must not prevent the original photo from displaying.
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
      status.textContent = error.message;
      status.dataset.refreshError = 'true';
    }
  } finally { loading = false; }
}
async function prepareAll() {
  if (!navigator.share || !navigator.canShare) {
    status.textContent = 'Para salvar todas as fotos de uma vez, abra esta página no navegador do celular. Aqui você pode salvar a foto exibida.';
    single.hidden = false;
    return;
  }
  preparing = true;
  clearTimeout(timer);
  download.disabled = true;
  downloadLabel.textContent = 'Preparando…';
  download.setAttribute('aria-label', 'Preparando fotos para salvar');
  const selection = photos.slice();
  const files = new Array(selection.length);
  let cursor = 0, completed = 0;
  let cancelled = false;
  try {
    async function worker() {
      while (!cancelled && cursor < selection.length) {
        const index = cursor++;
        let response;
        for (let attempt = 0; attempt < 2; attempt++) {
          response = await fetch(selection[index].url, {signal:AbortSignal.timeout(65000)});
          if (response.ok) break;
        }
        if (!response.ok) throw Error('Não foi possível preparar todas as fotos.');
        const blob = await response.blob();
        const mime = blob.type || selection[index].mime || 'image/jpeg';
        files[index] = new File([blob], `arildo-josi-${String(index + 1).padStart(3, '0')}.${extension(mime)}`, {type:mime});
        completed++;
        if (!cancelled) status.textContent = `Preparando fotos: ${completed} de ${selection.length}`;
      }
    }
    await Promise.all(Array.from({length:Math.min(2,selection.length)}, worker));
    if (!navigator.canShare({files})) throw Error('Este celular não aceita compartilhar todas as fotos de uma vez.');
    preparedFiles = files;
    downloadLabel.textContent = 'Salvar tudo';
    download.setAttribute('aria-label', 'Salvar todas as fotos na galeria');
    // Sharing needs a fresh user tap on iOS after asynchronous preparation.
    status.textContent = 'Fotos prontas! Toque em “Salvar tudo” para abrir as opções do celular.';
  } catch (error) {
    cancelled = true;
    preparedFiles = null;
    downloadLabel.textContent = 'Tentar novamente';
    status.textContent = `${error.message} Você pode salvar a foto exibida pelo link abaixo.`;
    single.hidden = false;
  } finally {
    preparing = false;
    download.disabled = !photos.length;
    start();
  }
}
download.addEventListener('click', () => {
  if (preparing || !photos.length) return;
  if (!preparedFiles) { prepareAll(); return; }
  status.textContent = '';
  navigator.share({files:preparedFiles,title:'Memórias de Arildo e Josi'}).catch(error => {
    if (error.name === 'AbortError') return;
    status.textContent = 'Não foi possível abrir a galeria neste navegador. Você pode salvar a foto exibida pelo link abaixo.';
    single.hidden = false;
  });
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
  } catch { /* The live API is the fallback if the fast initial index is unavailable. */ }
  loadPhotos();
}
init();
setInterval(() => { if (!document.hidden) loadPhotos(); }, 30000);
