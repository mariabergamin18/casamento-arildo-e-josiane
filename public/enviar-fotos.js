const $=s=>document.querySelector(s);let items=[],busy=false;
function render(){const grid=$('#photos');grid.replaceChildren();for(const item of items){const box=document.createElement('div');box.className='thumb';const img=document.createElement('img');img.src=item.url;img.alt='Foto selecionada';img.onerror=()=>{img.alt='Prévia indisponível'};box.append(img);if(item.sent){const tick=document.createElement('span');tick.className='sent';tick.textContent='✓ Enviada';box.append(tick)}else{const b=document.createElement('button');b.className='remove';b.textContent='×';b.setAttribute('aria-label','Remover foto');b.onclick=()=>{if(busy)return;URL.revokeObjectURL(item.url);items=items.filter(i=>i!==item);render()};box.append(b)}grid.append(box)}$('#selection').hidden=!items.length;$('#count').textContent=`${items.length} foto${items.length===1?'':'s'} selecionada${items.length===1?'':'s'}`;$('#send').disabled=busy||items.every(i=>i.sent)}
function select(e){if(busy)return;const files=Array.from(e.target.files);let skipped=0;for(const file of files){if(items.length>=10||file.size>25*1024*1024||!file.type.startsWith('image/')&&!/\.(heic|heif)$/i.test(file.name)){skipped++;continue}items.push({file,url:URL.createObjectURL(file),id:crypto.randomUUID(),sent:false})}e.target.value='';$('#status').textContent=skipped?'Você pode escolher até 10 imagens de até 25 MB cada.':'';render()}
$('#gallery').onchange=select;$('#take').onchange=select;
async function encode(file){const url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();const scale=Math.min(1,2400/Math.max(img.naturalWidth,img.naturalHeight));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);const data=c.toDataURL('image/jpeg',.9).split(',')[1];if(data.length>4000000)throw Error('Esta foto é grande demais para enviar. Escolha uma versão menor e tente novamente.');return {mime:'image/jpeg',data}}catch(err){if(err.message?.startsWith('Esta foto'))throw err;throw Error('Não foi possível abrir uma foto. Salve-a como JPG ou PNG e tente novamente.')}finally{URL.revokeObjectURL(url)}}
$('#send').onclick=async()=>{if(busy||!items.length)return;busy=true;document.body.classList.add('busy');$('#gallery').disabled=true;$('#take').disabled=true;render();let done=items.filter(i=>i.sent).length;try{for(const item of items){if(item.sent)continue;$('#status').textContent=`Enviando ${done+1} de ${items.length}… Mantenha esta página aberta.`;const data=await encode(item.file);const response=await fetch('/api/photos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,requestId:item.id})});let result;try{result=await response.json()}catch{throw Error('O envio não foi confirmado. Confira sua conexão e tente novamente.')}if(!response.ok||result.ok!==true)throw Error(result.error||'Não foi possível enviar.');item.sent=true;done++;render()}$('#form').hidden=true;$('#success').hidden=false;$('#success-copy').textContent=`${done===1?'Sua foto foi guardada':`Suas ${done} fotos foram guardadas`} no nosso álbum. Obrigada por compartilhar esse momento!`;$('#more').focus()}catch(err){$('#status').textContent=(done?`${done} foto(s) já recebida(s). `:'')+err.message;$('#send').innerHTML='Tentar novamente <span>↗</span>'}finally{busy=false;document.body.classList.remove('busy');$('#gallery').disabled=false;$('#take').disabled=false;render()}};
$('#more').onclick=()=>{for(const i of items)URL.revokeObjectURL(i.url);items=[];$('#success').hidden=true;$('#form').hidden=false;$('#status').textContent='';$('#send').innerHTML='Enviar aos noivos <span>↗</span>';render();$('#gallery').focus()};

// Reuse the existing upload queue for the JPG produced by the frame section.
window.weddingPhotos = {
  add(file) {
    if (busy) return { ok: false, message: 'Aguarde o envio atual terminar antes de adicionar outra foto.' };
    if (!$('#success').hidden) {
      for (const item of items) URL.revokeObjectURL(item.url);
      items = [];
      $('#success').hidden = true;
      $('#form').hidden = false;
    }
    if (items.length >= 10) return { ok: false, message: 'A seleção já tem 10 fotos. Envie ou remova uma delas antes de adicionar esta.' };
    items.push({ file, url: URL.createObjectURL(file), id: crypto.randomUUID(), sent: false });
    $('#status').textContent = '';
    $('#send').innerHTML = 'Enviar aos noivos <span aria-hidden="true">↗</span>';
    render();
    $('#selection').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
    $('#send').focus({ preventScroll: true });
    return { ok: true };
  }
};
