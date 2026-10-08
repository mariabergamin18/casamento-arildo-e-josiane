/** Arildo & Josiane — receptor privado de fotos.
 * 1. Cole em um projeto em script.google.com.
 * 2. Execute configurarAlbum e autorize o Google Drive.
 * 3. Copie CHAVE_ENVIO em Configurações do projeto > Propriedades do script.
 * 4. Implante como Aplicativo da Web: executar como Você; acesso Qualquer pessoa.
 * 5. Configure URL e chave SOMENTE no servidor do site.
 * Nunca coloque CHAVE_ENVIO no HTML ou JavaScript do navegador.
 */
function configurarAlbum() {
  const p = PropertiesService.getScriptProperties();
  p.setProperty('PASTA_ID', 'COLE_O_ID_DA_PASTA_DO_DRIVE');
  if (!p.getProperty('CHAVE_ENVIO')) p.setProperty('CHAVE_ENVIO', Utilities.getUuid() + Utilities.getUuid());
  if (!p.getProperty('ATIVO')) p.setProperty('ATIVO', 'sim');
  DriveApp.getFolderById(p.getProperty('PASTA_ID')).getName();
}
function doPost(e) {
  const reply = data => ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
  let lock;
  try {
    const p = PropertiesService.getScriptProperties();
    if (!e || !e.postData || e.postData.contents.length > 15000000) throw Error('Requisição inválida.');
    const b = JSON.parse(e.postData.contents);
    if (!p.getProperty('CHAVE_ENVIO') || b.key !== p.getProperty('CHAVE_ENVIO')) throw Error('Acesso negado.');
    if (p.getProperty('ATIVO') !== 'sim') throw Error('O álbum está fechado para novos envios.');
    if (!/^[a-zA-Z0-9_-]{16,80}$/.test(b.requestId || '')) throw Error('Identificador inválido.');
    if (!['image/jpeg','image/png','image/webp'].includes(b.mime)) throw Error('Formato não suportado.');
    if (typeof b.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(b.data)) throw Error('Foto inválida.');
    const bytes = Utilities.base64Decode(b.data);
    if (bytes.length < 12 || bytes.length > 10*1024*1024) throw Error('Limite de 10 MB por foto.');
    const u = bytes.map(n => (n + 256) % 256);
    const valid = b.mime === 'image/jpeg' ? u[0]===255 && u[1]===216 && u[2]===255 : b.mime==='image/png' ? [137,80,78,71,13,10,26,10].every((n,i)=>u[i]===n) : String.fromCharCode.apply(null,u.slice(0,4))==='RIFF' && String.fromCharCode.apply(null,u.slice(8,12))==='WEBP';
    if (!valid) throw Error('O conteúdo não corresponde a uma foto válida.');
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) throw Error('Álbum ocupado. Tente novamente.');
    const ext = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[b.mime];
    const name = 'memoria-' + b.requestId + '.' + ext;
    const folder = DriveApp.getFolderById(p.getProperty('PASTA_ID'));
    const existing = folder.getFilesByName(name);
    if (existing.hasNext()) return reply({ok:true,id:existing.next().getId()});
    const day = Utilities.formatDate(new Date(),'America/Sao_Paulo','yyyy-MM-dd');
    const used = p.getProperty('DIA')===day ? Number(p.getProperty('TOTAL')||0) : 0;
    if (used >= 300) throw Error('Limite diário de teste atingido.');
    const file = folder.createFile(Utilities.newBlob(bytes,b.mime,name));
    p.setProperties({DIA:day,TOTAL:String(used+1)});
    return reply({ok:true,id:file.getId()});
  } catch(err) { return reply({ok:false,error:String(err.message || 'Falha ao enviar a foto.')}); }
  finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}
