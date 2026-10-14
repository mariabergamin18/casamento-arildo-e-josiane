// Snapshot original-resolution photos at BUILD TIME, never on the visitor's iPhone.
// Preserve the exact bytes returned by the wedding's existing photo endpoint.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const base='https://arildo-e-josiane.vercel.app';
const root='public';
const album=JSON.parse(await readFile(join(root,'album-index.json'),'utf8'));
if(!album.ok || !Array.isArray(album.photos) || album.photos.length===0) throw Error('Missing album index');
const photos=album.photos;
const outputs=new Array(photos.length);
const folder=join(root,'album-originals');
await mkdir(folder,{recursive:true});
let next=0;
const supported={'image/jpeg':'jpg','image/png':'png','image/heif':'heif','image/heic':'heic','image/webp':'webp'};
async function download(photo,index){
 const extension=supported[photo.mime];
 if(!extension || !/^drive-[A-Za-z0-9_-]{10,100}$/.test(photo.id) || !/^\/api\/album\/drive\/[\w-]{10,100}$/.test(photo.url)) throw Error('Unexpected source image');
 const target=photo.id+'.'+extension;
 let last;
 for(let attempt=1;attempt<=3;attempt++){
  try{
   const response=await fetch(base+photo.url,{signal:AbortSignal.timeout(100000),headers:{'Accept':'image/*'}});
   if(!response.ok) throw Error('HTTP '+response.status);
   const type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
   if(type!==photo.mime) throw Error('Wrong image MIME '+type+' expected '+photo.mime);
   const bytes=Buffer.from(await response.arrayBuffer());
   if(bytes.length<1024 || bytes.length>45_000_000) throw Error('Unexpected image size '+bytes.length);
   if(photo.mime==='image/jpeg' && (bytes[0]!==255 || bytes[1]!==216)) throw Error('Invalid JPEG bytes');
   if(photo.mime==='image/heif' && bytes.toString('latin1',4,8)!=='ftyp') throw Error('Invalid HEIF bytes');
   await writeFile(join(folder,target),bytes);
   outputs[index]={...photo,url:'/album-originals/'+target};
   process.stdout.write('Saved original '+(index+1)+'/'+photos.length+' ('+bytes.length+' bytes)\n');
   return;
  }catch(e){last=e;await new Promise(resolve=>setTimeout(resolve,attempt*1600));}
 }
 throw Error('Could not snapshot original '+photo.id+': '+last?.message);
}
async function worker(){
 while(next<photos.length){const index=next++;await download(photos[index],index);}
}
await Promise.all(Array.from({length:4},worker));
if(outputs.some(photo=>!photo)) throw Error('Incomplete album');
await writeFile(join(root,'album-index.json'),JSON.stringify({ok:true,photos:outputs}));
console.log('All '+outputs.length+' original images are stored in Vercel static assets.');