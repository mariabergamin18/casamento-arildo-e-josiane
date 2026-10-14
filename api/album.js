const origin = 'https://arildo-josiane.mariabergamin18.chatgpt.site';
export default { async fetch(request) {
  if (!['GET','HEAD'].includes(request.method)) return new Response('Método inválido.', {status:405});
  const url = new URL(request.url);
  const path = url.searchParams.get('albumPath') || '';
  if (path && !/^(?:photo|drive)\/[\w-]{10,100}$/.test(path)) return new Response('Foto inválida.', {status:400});
  try {
    const response = await fetch(origin + '/api/album' + (path ? '/' + path : ''), {signal:AbortSignal.timeout(55000)});
    if (!response.ok) return new Response(JSON.stringify({ok:false,error:'O álbum está temporariamente indisponível.'}), {status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
    if (!path) {
      const data = await response.json();
      if (data.ok !== true || !Array.isArray(data.photos)) throw Error('Álbum inválido');
      data.photos = data.photos.filter(photo => /^\/api\/album\/(?:photo|drive)\/[\w-]{10,100}$/.test(photo.url || ''));
      return new Response(request.method === 'HEAD' ? null : JSON.stringify(data), {headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
    }
    return new Response(request.method === 'HEAD' ? null : response.body, {headers:{'Content-Type':response.headers.get('Content-Type') || 'image/jpeg','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'}});
  } catch {
    return new Response(JSON.stringify({ok:false,error:'Não foi possível carregar as fotos agora.'}), {status:502,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }
}};
