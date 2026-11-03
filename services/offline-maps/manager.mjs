import {validateGmdbFile,selectGmdbVariant} from './gmdb.mjs';
import {createWriteStream} from 'node:fs';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {validateMbtilesFile} from './mbtiles.mjs';
import {mkdir,readFile,writeFile,rename,rm,stat,statfs,readdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {satelliteProvider,providers,providerOf} from './providers.mjs';
import {initialRegion,validateRegion,invalid} from './regions.mjs';

function importLabels(input,fallbackName,raster=false,pending=false){
  const field=(value,fallback,label)=>{
    if(value===undefined)return fallback;
    if(typeof value!=='string'||!value.trim()||value.length>80||/[\x00-\x1f\x7f]/.test(value))throw invalid(label+' wajib diisi (maksimal 80 karakter).');
    return value.trim();
  };
  const mapType=input.mapType==='auto'||input.mapType===undefined?(raster?'raster':'street'):input.mapType;
  if(!['street','satellite','hybrid','terrain','topographic','raster','nautical'].includes(mapType))throw invalid('Jenis peta tidak valid.');
  if(!pending&&!raster&&mapType!=='street')throw invalid('File MBTiles vektor hanya mendukung jenis Peta Jalan.');
  const name=field(input.name,fallbackName,'Nama');
  return {name,mapType,title:field(input.title,name,'Title'),providerLabel:field(input.providerLabel==='auto'?undefined:input.providerLabel,raster?'MBTiles Raster':'OpenMapTiles','Provider')};
}

export async function createManager(directory,{run,findSource,writeManifest=async(file,json)=>{
  await writeFile(file+'.tmp',json);await rename(file+'.tmp',file);
}}={}){
  const packages=path.join(directory,'packages'),manifest=path.join(directory,'regions.json');
  await mkdir(packages,{recursive:true});
  let state={activeId:null,regions:[{...initialRegion}],job:null},writer=Promise.resolve(),publication=null,child=null,task=null,importController=null,closing=false,draining=false;
  try{state=JSON.parse(await readFile(manifest,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  state.activeByProvider??={};state.queue??=[];
  const legacyActive=state.regions.find(r=>r.id===state.activeId&&r.file);
  if(legacyActive&&!Object.hasOwn(state.activeByProvider,providerOf(legacyActive)))state.activeByProvider[providerOf(legacyActive)]=legacyActive.id;
  const snapshot=()=>structuredClone(state);
  const persist=(value=state)=>{const json=JSON.stringify(value,null,2);writer=writer.catch(()=>{}).then(()=>writeManifest(manifest,json));return writer;};
  async function publishPackage(update){
    // Readers continue to see the previous verified catalog until the new
    // manifest is on disk. Mutations wait so they cannot overwrite this draft.
    publication=(async()=>{
      await writer.catch(()=>{});
      const draft=structuredClone(state);update(draft);
      await persist(draft);state=draft;
    })();
    try{await publication;}finally{publication=null;}
  }
  const region=id=>{const entry=state.regions.find(r=>r.id===id);if(!entry)throw invalid('Wilayah tidak ditemukan.',404);return entry;};
  const busy=()=>state.job&&['downloading','checking','preparing','importing'].includes(state.job.status);
  const safeFile=name=>{if(!/^[a-f0-9-]{36}\.(?:pmtiles|mbtiles|gmdb)$/.test(name))throw invalid('File paket tidak valid.',404);return path.join(packages,name);};
  if(busy()){if(state.job.queued&&!state.job.cancelled&&!state.queue.some(item=>item.regionId===state.job.regionId))state.queue.unshift({regionId:state.job.regionId,request:state.job.request,attempt:state.job.attempt||0});state.job.status='interrupted';state.job.message='Unduhan terputus saat service restart. Tekan Unduh/Update untuk mencoba lagi.';await persist();}
  for(const file of await readdir(packages))if(/^[a-f0-9-]{36}\.(?:pmtiles|mbtiles|gmdb)\.partial(?:-journal)?$/.test(file))await rm(path.join(packages,file),{force:true});
  async function command(args,job,executable='pmtiles'){
    if(run)return run(args,job,executable);
    await new Promise((resolve,reject)=>{
      child=spawn(executable,args,{stdio:['ignore','pipe','pipe']});
      let tail='';const timer=setTimeout(()=>child?.kill('SIGTERM'),(executable===process.execPath?24*60:45)*60*1000);
      const record=data=>{tail=(tail+data.toString()).slice(-2000);};
      let pending='';
      child.stdout.on('data',data=>{record(data);if(executable!==process.execPath)return;pending+=data;const lines=pending.split('\n');pending=lines.pop();for(const line of lines){try{const p=JSON.parse(line);if(Number.isFinite(p.bytes)&&Number.isFinite(p.completed)&&Number.isFinite(p.total)){Object.assign(job,p);job.message=`Mengunduh satelit ${p.completed}/${p.total} tile...`;}}catch{}}});child.stderr.on('data',record);
      child.once('error',error=>{clearTimeout(timer);child=null;reject(error);});
      child.once('close',code=>{clearTimeout(timer);child=null;code===0?resolve():reject(Error(job.cancelled?'Unduhan dibatalkan.':`Unduhan gagal (${code}). ${tail.slice(-500)}`));});
    });
  }
  async function latestSource(job){
    if(findSource)return findSource();
    for(let days=0;days<8;days++){
      if(job.cancelled)throw Error('Unduhan dibatalkan.');
      const date=new Date(Date.now()-days*86400000).toISOString().slice(0,10).replaceAll('-','');
      const url=`https://build.protomaps.com/${date}.pmtiles`;
      const response=await fetch(url,{headers:{Range:'bytes=0-126'},signal:AbortSignal.timeout(20000)});
      if(response.status===404){await response.body?.cancel();continue;}
      if(response.status!==206){await response.body?.cancel();throw Error('Sumber peta tidak mendukung unduhan wilayah saat ini.');}
      const header=Buffer.from(await response.arrayBuffer());
      if(header.subarray(0,7).toString()!=='PMTiles'||header[7]!==3||header[99]!==1)throw Error('Sumber peta tidak cocok.');
      return {url,date};
    }
    throw Error('Build peta terbaru belum tersedia. Coba kembali nanti.');
  }
  const checkpointFile=id=>path.join(packages,createHash('sha256').update(id).digest('hex')+'.mbtiles.resume');
  async function download(entry,request,job){
    const file=randomUUID()+'.pmtiles',partial=path.join(packages,file+'.partial'),final=safeFile(file);
    const mbtiles=checkpointFile(entry.id);
    let monitor,published=false;
    try{
      const disk=await statfs(packages);if(disk.bavail*disk.bsize<2*1024**3)throw Error('Ruang kosong minimal 2 GB diperlukan untuk unduhan.');
      job.message='Mencari data peta terbaru…';await persist();
      const satellite=request.provider===satelliteProvider;
      const source=satellite?{date:providers[satelliteProvider].date}:await latestSource(job);if(job.cancelled)throw Error('Unduhan dibatalkan.');
      job.sourceDate=source.date;job.status='downloading';job.message='Mengunduh wilayah…';await persist();
      if(!satellite)monitor=setInterval(async()=>{try{job.bytes=(await stat(partial)).size;if(job.bytes>4*1024**3){job.cancelled=true;job.message='Paket melewati batas 4 GB; gunakan area atau detail lebih kecil.';child?.kill('SIGTERM');}}catch{}},1000);
      if(satellite){
        await command([fileURLToPath(new URL('./satellite-download.mjs',import.meta.url)),mbtiles,JSON.stringify(request)],job,process.execPath);
        if(job.cancelled)throw Error('Unduhan dibatalkan.');
        job.status='checking';job.message='Menyiapkan paket satelit...';await persist();
        await command(['convert',mbtiles,partial,`--tmpdir=${packages}`],job);
      }else await command(['extract',source.url,partial,`--bbox=${request.bounds.join(',')}`,`--maxzoom=${request.maxzoom}`,'--download-threads=4'],job);
      clearInterval(monitor);
      if(job.cancelled)throw Error('Unduhan dibatalkan.');
      job.bytes=(await stat(partial)).size;job.status='checking';job.message='Memeriksa paket…';await persist();
      await command(['verify',partial],job);
      if(job.cancelled)throw Error('Unduhan dibatalkan.');
      await rename(partial,final);
      if(job.cancelled)throw Error('Unduhan dibatalkan.');
      const obsolete=entry.previousFile;
      await publishPackage(draft=>{
        const updated=draft.regions.find(region=>region.id===entry.id);
        Object.assign(updated,request,{previousFile:entry.file||null,file,size:job.bytes,sourceDate:source.date,updatedAt:new Date().toISOString()});
        if(!Object.hasOwn(draft.activeByProvider,request.provider)){draft.activeByProvider[request.provider]=entry.id;if(!draft.activeId)draft.activeId=entry.id;}
        delete updated.downloadError;draft.job.status='complete';draft.job.message='Paket offline siap.';
      });
      published=true;
      if(obsolete)await rm(safeFile(obsolete),{force:true}).catch(()=>{});
    }catch(error){
      job.status=job.cancelled?'cancelled':'failed';job.message=error.message;
      if(!job.cancelled){entry.downloadError=error.message;if(job.queued&&(job.attempt||0)<2)state.queue.unshift({regionId:entry.id,request,attempt:(job.attempt||0)+1,notBefore:Date.now()+60000});}
      await persist();
    }
    finally{clearInterval(monitor);if(published)for(const temp of [mbtiles,mbtiles+'-journal'])await rm(temp,{force:true}).catch(()=>{});await rm(partial,{force:true}).catch(()=>{});if(!published)await rm(final,{force:true}).catch(()=>{});task=null;}
  }
  const queueTimer=setInterval(()=>void drain().catch(error=>console.error('Antrean peta:',error.message)),1000);
  queueTimer.unref();
  async function drain(){
    if(closing||draining||task||busy()||!state.queue.length||state.queue[0].notBefore>Date.now())return;
    draining=true;
    const next=state.queue[0];
    try{await api.start(next.regionId,next.request,next);}finally{draining=false;}
  }
  const api={
    snapshot,packages,safeFile,
    cancelImport(id){if(!publication&&state.job?.id===id&&importController){state.job.cancelled=true;importController.abort();}},
    async importFile(stream,{filename,size,name,title,providerLabel,mapType,format}){
      if(publication)await publication.catch(()=>{});
      if(closing)throw invalid('Layanan sedang dimuat ulang.',503);
      if(task||busy()||draining)throw invalid('Tunggu proses peta berjalan atau batalkan dahulu.',409);
      if(state.regions.length>=30)throw invalid('Maksimal 30 wilayah.');
      if(typeof filename!=='string'||filename.length>255||/[\\/\x00-\x1f]/.test(filename)||! /\.(mbtiles|gmdb)$/i.test(filename))throw invalid('Pilih file .mbtiles atau .gmdb yang valid.');
      const extension=filename.split('.').at(-1).toLowerCase();
      if(format!==undefined&&format!==extension)throw invalid('Format pilihan tidak cocok dengan ekstensi file.');
      if(!Number.isSafeInteger(size)||size<512||size>16*1024**3)throw invalid('Ukuran file peta harus 512 byte sampai 16 GB.',413);
      const labels=importLabels(extension==='gmdb'?{name,title}:{name,title,providerLabel,mapType},filename.replace(/\.(mbtiles|gmdb)$/i,'').slice(0,80),false,true);
      const file=randomUUID()+'.'+extension,partial=path.join(packages,file+'.partial'),final=safeFile(file);
      const job={id:randomUUID(),regionId:null,status:'importing',message:'Memuat file peta ke server...',bytes:0,totalBytes:size,cancelled:false,startedAt:new Date().toISOString(),request:{name:labels.title}};
      state.job=job;const controller=new AbortController();importController=controller;
      task=(async()=>{
        let published=false;
        try{
          await persist();
          const disk=await statfs(packages);
          if(disk.bavail*disk.bsize<size+1024**3)throw invalid('Ruang server tidak cukup untuk file dan cadangan 1 GB.',507);
          const hash=createHash('sha256');
          const counter=new Transform({transform(chunk,_encoding,callback){
            job.bytes+=chunk.length;
            if(job.bytes>size){callback(invalid('Ukuran upload melebihi ukuran file.',413));return;}
            hash.update(chunk);callback(null,chunk);
          }});
          await pipeline(stream,counter,createWriteStream(partial,{flags:'wx'}),{signal:controller.signal});
          if(job.bytes!==size)throw invalid('Upload file peta tidak lengkap. Muat ulang file.');
          job.status='checking';job.message='Memeriksa database peta...';await persist();
          const metadata=await (extension==='gmdb'?validateGmdbFile:validateMbtilesFile)(partial,{signal:controller.signal});
          if(extension==='gmdb'&&((providerLabel&&providerLabel!=='auto')||(mapType&&mapType!=='auto')))Object.assign(metadata,selectGmdbVariant(metadata,{providerLabel,mapType}));
          if(extension==='mbtiles')Object.assign(labels,importLabels({name,title,providerLabel,mapType},labels.name,metadata.provider==='mbtiles-raster'));
          controller.signal.throwIfAborted();
          const entry={id:randomUUID(),...labels,...metadata,file,size,originalName:filename,sha256:hash.digest('hex'),updatedAt:new Date().toISOString()};
          const existing=state.regions.find(region=>region.sha256===entry.sha256);
          if(existing)throw invalid('File peta ini sudah dimuat: '+existing.name,409);
          await rename(partial,final);
          controller.signal.throwIfAborted();
          await publishPackage(draft=>{
            draft.regions.push(entry);if(!Object.hasOwn(draft.activeByProvider,entry.provider))draft.activeByProvider[entry.provider]=extension==='gmdb'?null:entry.id;
            draft.job.regionId=entry.id;draft.job.status='complete';draft.job.message='Peta siap. Aktifkan ON pada tabel untuk menampilkan peta.';
          });
          published=true;
          return snapshot();
        }catch(error){
          job.status=controller.signal.aborted?'cancelled':'failed';
          job.message=controller.signal.aborted?'Pemuatan file peta dibatalkan.':error.status?error.message:'Gagal memuat file peta ke server.';
          await persist();throw invalid(job.message,error.status||400);
        }finally{
          await rm(partial,{force:true}).catch(()=>{});
          if(!published)await rm(final,{force:true}).catch(()=>{});
          importController=null;task=null;
        }
      })();
      return task;
    },
    async enqueue(ids){
      if(publication)await publication.catch(()=>{});
      if(closing)throw invalid('Layanan sedang dimuat ulang.',503);
      if(!Array.isArray(ids)||!ids.length||ids.length>30||ids.some(id=>typeof id!=='string'))throw invalid('Pilih 1-30 wilayah untuk antrean.');
      const requests=[...new Set(ids)].map(id=>{const entry=region(id);return {regionId:id,request:validateRegion(entry),attempt:0};});
      for(const request of requests)if(!state.queue.some(item=>item.regionId===request.regionId)&&!(busy()&&state.job.regionId===request.regionId))state.queue.push(request);
      await persist();return snapshot();
    },
    async add(input){if(publication)await publication.catch(()=>{});if(state.regions.length>=30)throw invalid('Maksimal 30 wilayah.');const entry={id:randomUUID(),...validateRegion(input)};state.regions.push(entry);await persist();return snapshot();},
    async start(id,input,queued){
      if(publication)await publication.catch(()=>{});
      if(closing)throw invalid('Layanan sedang dimuat ulang.',503);
      if(task||busy()||(!queued&&draining))throw invalid('Tunggu unduhan berjalan atau batalkan dahulu.',409);
      const entry=region(id),request=validateRegion(input||entry);
      if(providerOf(entry)!==request.provider)throw invalid('Buat wilayah baru untuk provider berbeda.');
      if(queued)state.queue=state.queue.filter(item=>item!==queued);else state.queue=state.queue.filter(item=>item.regionId!==id);
      const job={queued:Boolean(queued),attempt:queued?.attempt||0,id:randomUUID(),regionId:id,status:'preparing',message:'Menyiapkan unduhan…',bytes:0,cancelled:false,startedAt:new Date().toISOString(),request};
      state.job=job;await persist();
      if(closing){job.status='cancelled';await persist();return snapshot();}
      task=download(entry,request,job).catch(error=>console.error('Penyimpanan status unduhan gagal:',error.message));return snapshot();
    },
    async cancel(){if(publication)await publication.catch(()=>{});state.queue=[];if(busy()){state.job.cancelled=true;importController?.abort();state.job.message='Membatalkan unduhan…';child?.kill('SIGTERM');}await persist();return snapshot();},
    async rename(id,input){
      if(publication)await publication.catch(()=>{});
      const entry=region(id);
      if(typeof input?.name!=='string'||!input.name.trim()||input.name.length>80)throw invalid('Isi nama wilayah (maksimal 80 karakter).');
      if(busy()&&state.job.regionId===id)throw invalid('Tunggu proses paket selesai dahulu.',409);
      const labels=entry.format==='gmdb'?{...importLabels({name:input.name,title:input.title??entry.title??entry.name},entry.name),...selectGmdbVariant(entry,input.variantId!==undefined||input.providerLabel!==undefined||input.mapType!==undefined?input:{variantId:entry.selectedVariant})}:entry.imported?importLabels({name:input.name,title:input.title??entry.title??entry.name,providerLabel:input.providerLabel??entry.providerLabel,mapType:input.mapType??entry.mapType},entry.name,entry.provider==='mbtiles-raster'):{name:input.name.trim()};
      const previous={...entry};Object.assign(entry,labels);
      try{await persist();}catch(error){for(const key of Object.keys(entry))delete entry[key];Object.assign(entry,previous);throw error;}
      return snapshot();
    },
    async activate(id,enabled=true){
      if(publication)await publication.catch(()=>{});
      if(typeof enabled!=='boolean')throw invalid('Status aktif harus boolean.');
      const entry=region(id),provider=providerOf(entry);
      if(enabled){if(!entry.file)throw invalid('Unduh paket terlebih dahulu.');await stat(safeFile(entry.file));}
      if(publication)await publication.catch(()=>{});
      const oldActive=state.activeId,oldProviders={...state.activeByProvider};
      if(enabled){state.activeId=id;state.activeByProvider[provider]=id;}
      else{if(state.activeByProvider[provider]===id)state.activeByProvider[provider]=null;if(state.activeId===id)state.activeId=null;}
      try{await persist();}catch(error){state.activeId=oldActive;state.activeByProvider=oldProviders;throw error;}
      return snapshot();
    },
    async remove(id){
      if(publication)await publication.catch(()=>{});
      const entry=region(id);
      if(busy()&&state.job.regionId===id)throw invalid('Batalkan dan tunggu unduhan berhenti dahulu.',409);
      const oldState=structuredClone(state);
      if(state.activeId===id)state.activeId=null;
      for(const provider of Object.keys(state.activeByProvider))if(state.activeByProvider[provider]===id)state.activeByProvider[provider]=null;
      state.queue=state.queue.filter(item=>item.regionId!==id);state.regions=state.regions.filter(r=>r.id!==id);
      try{await persist();}catch(error){state=oldState;throw error;}
      await rm(checkpointFile(id),{force:true});await rm(checkpointFile(id)+'-journal',{force:true});
      for(const f of [entry.file,entry.previousFile].filter(Boolean))await rm(safeFile(f),{force:true});return snapshot();
    },
    async close(){closing=true;clearInterval(queueTimer);if(publication)await publication.catch(()=>{});importController?.abort();if(busy()){if(state.job.queued&&!state.job.cancelled&&!state.queue.some(item=>item.regionId===state.job.regionId))state.queue.unshift({regionId:state.job.regionId,request:state.job.request,attempt:state.job.attempt||0});state.job.cancelled=true;child?.kill('SIGTERM');}await task?.catch(()=>{});await persist();await writer;},
  };
  return api;
}
