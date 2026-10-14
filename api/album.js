const fallbackOrigin = 'https://arildo-josiane.mariabergamin18.chatgpt.site';
const imageMime = /^image\/(jpeg|png|webp|gif|avif|heic|heif)$/;
const listHeaders = {'Content-Type':'application/json','Cache-Control':'public, max-age=0, s-maxage=30, stale-while-revalidate=30','X-Content-Type-Options':'nosniff'};
const errorHeaders = {'Content-Type':'application/json','Cache-Control':'no-store'};
const imageHeaders = mime => ({'Content-Type':mime,'Cache-Control':'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400','X-Content-Type-Options':'nosniff'});
async function driveAction(body) {
  const {DRIVE_UPLOAD_URL,DRIVE_UPLOAD_KEY} = process.env;
  if (!DRIVE_UPLOAD_URL || !DRIVE_UPLOAD_KEY) throw Error('Drive não configurado');
  const response = await fetch(DRIVE_UPLOAD_URL, {
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({key:DRIVE_UPLOAD_KEY,...body}),
    signal:AbortSignal.timeout(body.action === 'list' ? 15000 : 35000)
  });
  const data = await response.json();
  if (!response.ok || data.ok !== true) throw Error('Drive indisponível');
  return data;
}
export default { async fetch(request) {
  if (!['GET','HEAD'].includes(request.method)) return new Response('Método inválido.', {status:405});
  const url = new URL(request.url);
  const path = url.searchParams.get('albumPath') || '';
  if (path && !/^(?:photo|drive)\/[\w-]{10,100}$/.test(path)) return new Response('Foto inválida.', {status:400});
  try {
    // Read the existing Drive integration directly; never store photos in the repository.
    if (!path || path.startsWith('drive/')) {
      try {
        const data = await driveAction(path ? {action:'photo',id:path.slice(6)} : {action:'list'});
        if (!path) {
          if (!Array.isArray(data.photos)) throw Error('Álbum inválido');
          const photos = data.photos.filter(photo => /^[\w-]{10,100}$/.test(photo.id || '') && imageMime.test(photo.mime || ''))
            .sort((a,b)=>(Number(a.time)||0)-(Number(b.time)||0))
            .map(photo => ({id:'drive-'+photo.id,url:'/api/album/drive/'+photo.id,mime:photo.mime}));
          return new Response(request.method === 'HEAD' ? null : JSON.stringify({ok:true,photos}), {headers:{...listHeaders,'X-Album-Source':'drive'}});
        }
        if (!imageMime.test(data.mime || '') || typeof data.data !== 'string' || data.data.length > 55000000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data.data)) throw Error('Foto inválida');
        const bytes = Buffer.from(data.data,'base64');
        return new Response(request.method === 'HEAD' ? null : bytes, {headers:{...imageHeaders(data.mime),'X-Album-Source':'drive'}});
      } catch { /* Preserve the working source integration if its deployment differs. */ }
    }
    const response = await fetch(fallbackOrigin + '/api/album' + (path ? '/' + path : ''), {signal:AbortSignal.timeout(path ? 20000 : 35000)});
    if (!response.ok) return new Response(JSON.stringify({ok:false,error:'O álbum está temporariamente indisponível.'}), {status:response.status,headers:errorHeaders});
    if (!path) {
      const data = await response.json();
      if (data.ok !== true || !Array.isArray(data.photos)) throw Error('Álbum inválido');
      data.photos = data.photos.filter(photo => /^\/api\/album\/(?:photo|drive)\/[\w-]{10,100}$/.test(photo.url || ''));
      return new Response(request.method === 'HEAD' ? null : JSON.stringify(data), {headers:{...listHeaders,'X-Album-Source':'existing-integration'}});
    }
    return new Response(request.method === 'HEAD' ? null : response.body, {headers:{...imageHeaders(response.headers.get('Content-Type') || 'image/jpeg'),'X-Album-Source':'existing-integration'}});
  } catch {
    return new Response(JSON.stringify({ok:false,error:'Não foi possível carregar as fotos agora.'}), {status:502,headers:errorHeaders});
  }
}};
