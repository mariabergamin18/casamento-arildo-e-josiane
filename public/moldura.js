(() => {
  const find = id => document.getElementById(id);
  const photo = find('frame-photo');
  const video = find('frame-video');
  const chooser = find('frame-chooser');
  const status = find('frame-status');
  const edit = find('frame-edit');
  const controls = find('frame-camera-controls');
  const x = find('frame-x');
  const y = find('frame-y');
  const overlay = new Image();
  overlay.src = '/moldura.svg';
  let selected = false;
  let photoUrl;
  let downloadUrl;
  let stream;
  let facing = 'environment';
  let cameraVersion = 0;
  let photoVersion = 0;
  let processing = false;
  let prepared = false;
  const WIDTH = 1080;
  const HEIGHT = 1920;

  function updateButtons() {
    find('frame-save').disabled = processing || !selected;
    find('frame-send').disabled = processing || !selected || prepared;
    find('frame-open').disabled = processing;
    find('frame-capture').disabled = processing;
    find('frame-flip').disabled = processing;
    x.disabled = processing;
    y.disabled = processing;
  }

  function stopCamera() {
    cameraVersion++;
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    video.srcObject = null;
    video.hidden = true;
    photo.hidden = !selected;
    find('frame-placeholder').hidden = selected;
    controls.hidden = true;
    edit.hidden = !selected;
    find('frame-open').hidden = false;
  }

  function reposition() {
    photo.style.objectPosition = `${x.value}% ${y.value}%`;
    prepared = false;
    status.textContent = '';
    updateButtons();
  }
  x.addEventListener('input', reposition);
  y.addEventListener('input', reposition);

  async function setPhoto(file) {
    const version = ++photoVersion;
    if (file.size > 25 * 1024 * 1024) {
      status.textContent = 'Escolha uma foto de até 25 MB.';
      return;
    }
    const url = URL.createObjectURL(file);
    const candidate = new Image();
    candidate.src = url;
    status.textContent = 'Preparando sua foto…';
    try {
      await candidate.decode();
      if (version !== photoVersion) { URL.revokeObjectURL(url); return; }
      stopCamera();
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      photoUrl = url;
      photo.src = url;
      await photo.decode();
      photo.alt = 'Sua foto com a moldura personalizada do casamento';
      selected = true;
      photo.hidden = false;
      find('frame-placeholder').hidden = true;
      prepared = false;
      x.value = y.value = '50';
      reposition();
      edit.hidden = false;
      status.textContent = 'Foto pronta. Ajuste o enquadramento e salve ou prepare o envio.';
    } catch {
      URL.revokeObjectURL(url);
      status.textContent = 'Não foi possível abrir esta foto. Tente uma imagem JPG ou PNG.';
    }
    updateButtons();
  }

  find('frame-open').onclick = () => chooser.showModal();
  find('frame-close').onclick = () => chooser.close();
  find('frame-choose-photo').onclick = () => {
    chooser.close();
    find('frame-file').click();
  };
  for (const id of ['frame-file', 'frame-native-camera']) {
    find(id).onchange = event => {
      const file = event.target.files[0];
      event.target.value = '';
      if (file && !processing) setPhoto(file);
    };
  }

  async function startCamera() {
    stopCamera();
    const version = cameraVersion;
    status.textContent = 'Autorize a câmera para fotografar com a moldura.';
    find('frame-open').hidden = true;
    edit.hidden = true;
    controls.hidden = false;
    find('frame-capture').disabled = true;
    find('frame-flip').disabled = true;
    try {
      const current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: false
      });
      if (version !== cameraVersion) { current.getTracks().forEach(track => track.stop()); return; }
      stream = current;
      video.srcObject = current;
      video.hidden = false;
      photo.hidden = true;
      find('frame-placeholder').hidden = true;
      // Use the actual track settings if the requested camera is unavailable.
      video.classList.toggle('mirrored', current.getVideoTracks()[0].getSettings().facingMode === 'user');
      await video.play();
      if (version !== cameraVersion) return;
      status.textContent = 'Enquadre a foto e toque em Fotografar.';
      updateButtons();
    } catch (error) {
      if (version !== cameraVersion) return;
      stopCamera();
      status.textContent = error.name === 'NotAllowedError'
        ? 'A câmera não foi autorizada. Libere o acesso no navegador ou escolha uma foto da galeria.'
        : 'Não foi possível abrir a câmera. Tente novamente ou escolha uma foto da galeria.';
      updateButtons();
      find('frame-open').focus({ preventScroll: true });
    }
  }
  find('frame-choose-camera').onclick = () => {
    chooser.close();
    if (!navigator.mediaDevices?.getUserMedia) find('frame-native-camera').click();
    else startCamera();
  };
  find('frame-flip').onclick = () => {
    facing = facing === 'environment' ? 'user' : 'environment';
    startCamera();
  };
  find('frame-cancel-camera').onclick = () => {
    stopCamera();
    status.textContent = '';
    find('frame-open').focus({ preventScroll: true });
  };

  function toBlob(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Não foi possível gerar a foto. Tente novamente.'));
    }, 'image/jpeg', .94));
  }

  find('frame-capture').onclick = async () => {
    if (processing || !stream || !video.videoWidth) return;
    processing = true;
    updateButtons();
    const version = cameraVersion;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (video.classList.contains('mirrored')) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(video, 0, 0);
      const blob = await toBlob(canvas);
      if (version === cameraVersion) await setPhoto(blob);
    } catch {
      status.textContent = 'Não foi possível fotografar. Tente novamente.';
    } finally {
      processing = false;
      updateButtons();
    }
  };

  async function compose() {
    await photo.decode();
    try { await overlay.decode(); }
    catch { throw new Error('A moldura não carregou. Confira sua conexão e recarregue a página.'); }
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    // Match CSS object-fit: cover and object-position exactly.
    const scale = Math.max(WIDTH / photo.naturalWidth, HEIGHT / photo.naturalHeight);
    const w = photo.naturalWidth * scale;
    const h = photo.naturalHeight * scale;
    ctx.drawImage(photo, (WIDTH - w) * Number(x.value) / 100, (HEIGHT - h) * Number(y.value) / 100, w, h);
    // Preserve the supplied SVG's 265:497 ratio, just like background-size: contain.
    const frameScale = Math.min(WIDTH / overlay.naturalWidth, HEIGHT / overlay.naturalHeight);
    const fw = overlay.naturalWidth * frameScale;
    const fh = overlay.naturalHeight * frameScale;
    ctx.drawImage(overlay, (WIDTH - fw) / 2, (HEIGHT - fh) / 2, fw, fh);
    return new File([await toBlob(canvas)], 'arildo-e-josiane-moldura.jpg', { type: 'image/jpeg' });
  }

  async function exportPhoto(action) {
    if (processing || !selected) return;
    processing = true;
    updateButtons();
    status.textContent = 'Preparando a foto com a moldura…';
    try {
      const file = await compose();
      if (action === 'save') {
        if (downloadUrl) URL.revokeObjectURL(downloadUrl);
        downloadUrl = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = file.name;
        document.body.append(link);
        link.click();
        link.remove();
        status.textContent = 'Foto pronta para salvar. Se ela abrir em outra aba, use a opção de salvar imagem.';
      } else {
        const result = window.weddingPhotos.add(file);
        if (!result.ok) throw new Error(result.message);
        prepared = true;
        status.textContent = 'Foto adicionada à seleção acima. Confirme em Enviar aos noivos.';
      }
    } catch (error) {
      status.textContent = error.message || 'Não foi possível preparar sua foto. Tente novamente.';
    } finally {
      processing = false;
      updateButtons();
    }
  }
  find('frame-save').onclick = () => exportPhoto('save');
  find('frame-send').onclick = () => exportPhoto('send');
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !controls.hidden) {
      stopCamera();
      status.textContent = 'A câmera foi pausada. Toque no botão para abrir novamente.';
    }
  });
  window.addEventListener('pagehide', stopCamera);
})();
