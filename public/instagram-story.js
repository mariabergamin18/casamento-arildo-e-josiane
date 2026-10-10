(() => {
  // Story do Instagram para o botão da moldura.
  const INSTAGRAM_STORY_URL = 'https://www.instagram.com/stories/bergamin.dd/4005151696679808231?utm_source=ig_story_item_share&vrfl=dHZxbmMzZGRiYzR5';
  const button = document.getElementById('frame-open');
  const status = document.getElementById('instagram-status');
  if (!button || !status || !INSTAGRAM_STORY_URL) return;
  let url;
  try { url = new URL(INSTAGRAM_STORY_URL); } catch { return; }
  if (url.protocol !== 'https:' || !(url.hostname === 'instagram.com' || url.hostname.endsWith('.instagram.com'))) return;
  button.disabled = false;
  button.setAttribute('aria-label', 'Abrir story no Instagram');
  status.textContent = 'Abra nosso story no Instagram';
  button.addEventListener('click', () => window.location.assign(url.href));
})();
