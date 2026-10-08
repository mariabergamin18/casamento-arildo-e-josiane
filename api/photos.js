const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const MAX=4200000;
export default {async fetch(request){
 const env=process.env;
 const url=new URL(request.url);
 if(request.method!=='POST')return json({ok:false,error:'Método inválido.'},405);
 if(request.headers.get('Origin')!==url.origin)return json({ok:false,error:'Origem não autorizada.'},403);
 if(!env.DRIVE_UPLOAD_KEY||!env.DRIVE_UPLOAD_URL)return json({ok:false,error:'Falta configurar a chave do álbum. O envio ainda não está ativo.'},503);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({ok:false,error:'Formato inválido.'},415);
 try{
  const reader=request.body?.getReader();if(!reader)return json({ok:false,error:'Foto ausente.'},400);
  const chunks=[];let size=0;for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>MAX){await reader.cancel();return json({ok:false,error:'A foto excede o limite de envio.'},413)}chunks.push(r.value)}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
  const b=JSON.parse(new TextDecoder().decode(bytes));
  if(!/^[a-zA-Z0-9_-]{16,80}$/.test(b.requestId||'')||!['image/jpeg','image/png','image/webp'].includes(b.mime)||typeof b.data!=='string'||b.data.length<16||b.data.length>4000000||!/^[A-Za-z0-9+/]*={0,2}$/.test(b.data))return json({ok:false,error:'Foto ou identificador inválido.'},400);
  const upstream=await fetch(env.DRIVE_UPLOAD_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:env.DRIVE_UPLOAD_KEY,requestId:b.requestId,mime:b.mime,data:b.data}),signal:AbortSignal.timeout(50000)});
  if(!upstream.ok)return json({ok:false,error:'O Google não confirmou o envio. Tente novamente com a mesma foto.'},502);
  let result;try{result=await upstream.json()}catch{return json({ok:false,error:'O Google retornou uma resposta inesperada. Verifique a implantação.'},502)}
  if(result.ok!==true||typeof result.id!=='string')return json({ok:false,error:result.error||'Não foi possível salvar a foto.'},502);
  return json({ok:true});
 }catch(e){return json({ok:false,error:e.name==='TimeoutError'?'O Google demorou a responder. Tente novamente com a mesma foto.':'Não foi possível concluir o envio. Tente novamente.'},502)}
}};
