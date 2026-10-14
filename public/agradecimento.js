const $ = selector => document.querySelector(selector);
const album = $('#carousel');
const status = $('#album-status');
const download = $('#download-all');
const single = $('#download-current');
const extension = mime => ({'image/png':'png','image/webp':'webp','image/gif':'gif','image/avif':'avif','image/heic':'heic','image/heif':'heif'})[mime] || 'jpg';
let photos = [];
let current = 0;
let timer;
let generation = 0;
let signature = '';
let preparedFiles = null;
let prepareToken = 0;
let preparing = false;
let retryAfter = 0;
const failed = new Set();

function show(index) {
  if (!photos.length) return;
  const request = ++generation;
  current = (index + photos.length) % photos.length;
  const slide = document.createElement('div');
  slide.className = 'slide';
  const image = document.createElement('img');
  image.alt = `Memória compartilhada ${current + 1} de ${photos.length}`;
  image.decoding = 'async';
  image.onload = () => {
    if (request !== generation) return;
    album.append(slide);
    requestAnimationFrame(() => slide.classList.add('active'));
    for (const old of album.querySelectorAll('.slide')) {
      if (old !== slide) setTimeout(() => old.remove(), 550);
    }
  };
  image.onerror = () => {
    if (request !== generation) return;
    failed.add(photos[current].id);
    if (failed.size < photos.length) setTimeout(() => show(current + 1), 600);
    else album.innerHTML = '<div class="slide active"><div class="placeholder">As fotos estão temporariamente indisponíveis.</div></div>';
  };
  slide.append(image);
  image.src = photos[current].url;
  single.href = photos[current].url;
  single.download = `arildo-josi-${String(current + 1).padStart(3, '0')}.${extension(photos[current].mime)}`;
}

function start() {
  clearInterval(timer);
  if (photos.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    timer = setInterval(() => { if (!document.hidden) show(current + 1); }, 2000);
  }
}

async function prepareAll(expectedSignature) {
  if (!navigator.share || !navigator.canShare) {
    status.textContent = 'Para salvar todas as fotos de uma vez, abra esta página no navegador do celular. Aqui você pode salvar a foto exibida.';
    single.hidden = false;
    return;
  }
  const token = ++prepareToken;
  preparing = true;
  download.disabled = true;
  download.setAttribute('aria-label', 'Preparando fotos para salvar');
  status.textContent = 'Preparando as fotos para o celular...';
  const files = new Array(photos.length);
  let cursor = 0;
  let completed = 0;
  try {
    async function worker() {
      while (cursor < photos.length && token === prepareToken) {
        const index = cursor++;
        let response;
        for (let attempt = 0; attempt < 2; attempt++) {
          response = await fetch(photos[index].url);
          if (response.ok) break;
        }
        if (!response.ok) throw Error('Não foi possível preparar todas as fotos.');
        const blob = await response.blob();
        const mime = blob.type || photos[index].mime || 'image/jpeg';
        files[index] = new File([blob], `arildo-josi-${String(index + 1).padStart(3, '0')}.${extension(mime)}`, {type:mime});
        completed++;
        if (token === prepareToken) status.textContent = `Preparando fotos: ${completed} de ${photos.length}`;
      }
    }
    await Promise.all(Array.from({length:Math.min(2,photos.length)}, worker));
    if (token !== prepareToken || expectedSignature !== signature) return;
    if (!navigator.canShare({files})) throw Error('Este celular não aceita compartilhar todas as fotos de uma vez.');
    preparedFiles = files;
    download.disabled = false;
    download.setAttribute('aria-label', 'Salvar todas as fotos na galeria');
    status.textContent = '';
  } catch (error) {
    if (token !== prepareToken) return;
    prepareToken++;
    retryAfter = Date.now() + 120000;
    status.textContent = `${error.message} Você pode salvar a foto exibida pelo link abaixo.`;
    single.hidden = false;
  } finally {
    preparing = false;
  }
}

async function loadPhotos() {
  if (preparing) return;
  try {
    const response = await fetch('/api/album', {cache:'no-store'});
    const data = await response.json();
    if (!response.ok || !data.ok || !Array.isArray(data.photos)) throw Error(data.error || 'Não foi possível abrir o álbum.');
    const next = data.photos.filter(photo => typeof photo.id === 'string' && typeof photo.url === 'string');
    const nextSignature = next.map(photo => photo.id).join(',');
    if (nextSignature === signature) {
      if (photos.length && !preparedFiles && Date.now() >= retryAfter && navigator.share && navigator.canShare) prepareAll(signature);
      return;
    }
    const oldId = photos[current]?.id;
    photos = next;
    signature = nextSignature;
    preparedFiles = null;
    retryAfter = 0;
    prepareToken++;
    failed.clear();
    single.hidden = true;
    if (!photos.length) {
      album.innerHTML = '<div class="slide active"><div class="placeholder">As fotos aparecerão aqui assim que forem compartilhadas.</div></div>';
      download.disabled = true;
      status.textContent = '';
      clearInterval(timer);
      return;
    }
    show(Math.max(0,photos.findIndex(photo => photo.id === oldId)));
    start();
    prepareAll(nextSignature);
  } catch (error) {
    if (!photos.length) album.innerHTML = '<div class="slide active"><div class="placeholder">O álbum está temporariamente indisponível.</div></div>';
    status.textContent = error.message;
  }
}

download.addEventListener('click', () => {
  if (!preparedFiles || !navigator.share) return;
  status.textContent = '';
  navigator.share({files:preparedFiles,title:'Memórias de Arildo e Josi'})
    .catch(error => {
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
  if (Math.abs(delta) > 35) { show(current + (delta < 0 ? 1 : -1)); start(); }
}, {passive:true});
document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });

loadPhotos();
setInterval(loadPhotos,30000);
