import {createGmdbReader,emptyRasterTile} from './gmdb.mjs';
import {pathToFileURL} from 'node:url';
import {createMbtilesReader} from './mbtiles.mjs';
import {openMapTilesLayers,openMapTilesStyles} from './openmaptiles-style.mjs';
import express from 'express';
import {open} from 'node:fs/promises';
import {activeRegion,providers} from './providers.mjs';
import {PMTiles} from 'pmtiles';
import {layers,namedFlavor} from '@protomaps/basemaps';
import {createManager} from './manager.mjs';
import {invalid} from './regions.mjs';
import {serviceAuth} from './service-auth.mjs';

export function createApp(manager,{authenticate=serviceAuth(),assetDirectory=process.env.MAP_ASSET_DIR||'assets'}={}){
const mbReaders=new Map();
const closeReader=file=>{mbReaders.get(file)?.close();mbReaders.delete(file);};
const app=express();app.disable('x-powered-by');app.use(authenticate);app.use(express.json({limit:'16kb'}));
// Management APIs are same-origin, routed through BMS; no Docker socket is exposed.
app.use('/api/offline-maps',(req,res,next)=>{
  res.set('Cache-Control','no-store');
  const contentType=(req.get('Content-Type')||'').split(';')[0].trim().toLowerCase();
  if(!['GET','HEAD'].includes(req.method)&&((contentType!=='application/json'&&!(req.path==='/import'&&contentType==='application/octet-stream'))||req.get('Sec-Fetch-Site')==='cross-site'))return res.status(403).json({error:'Permintaan harus berasal dari aplikasi BMS.'});
  next();
});
app.get('/api/offline-maps/health',(_req,res)=>res.json({ok:true}));
app.get('/api/offline-maps/regions',(_req,res)=>res.json(manager.snapshot()));
app.post('/api/offline-maps/import',async(req,res)=>{
  req.setTimeout(60*60*1000);
  const previousJob=manager.snapshot().job?.id;
  const pending=manager.importFile(req,{filename:req.query.filename,size:Number(req.headers['content-length']),name:req.query.name,title:req.query.title,providerLabel:req.query.providerLabel,mapType:req.query.mapType,format:req.query.format});
  const importId=manager.snapshot().job?.id;
  const disconnected=()=>{if(!res.writableEnded&&importId!==previousJob)manager.cancelImport(importId);};
  res.once('close',disconnected);
  try{res.status(201).json(await pending);}finally{res.off('close',disconnected);}
});
app.post('/api/offline-maps/regions',async(req,res)=>res.status(201).json(await manager.add(req.body)));
app.post('/api/offline-maps/regions/:id/download',async(req,res)=>res.status(202).json(await manager.start(req.params.id,req.body?.name?req.body:undefined)));
app.post('/api/offline-maps/queue',async(req,res)=>res.status(202).json(await manager.enqueue(req.body.ids)));
app.post('/api/offline-maps/cancel',async(_req,res)=>res.json(await manager.cancel()));
app.patch('/api/offline-maps/regions/:id',async(req,res)=>res.json(await manager.rename(req.params.id,req.body)));
app.put('/api/offline-maps/active',async(req,res)=>res.json(await manager.activate(req.body.id,req.body.enabled)));
app.delete('/api/offline-maps/regions/:id',async(req,res)=>{const entry=manager.snapshot().regions.find(region=>region.id===req.params.id);if(entry)for(const file of [entry.file,entry.previousFile])closeReader(file);res.json(await manager.remove(req.params.id));});
app.use('/offline-maps/assets',express.static(assetDirectory,{maxAge:'7d',fallthrough:false}));
app.get('/offline-maps/style.json',(req,res)=>{
  const provider=req.query.provider||'protomaps';
  if(typeof provider!=='string'||!Object.hasOwn(providers,provider))throw invalid('Provider offline tidak valid.');
  const style=req.query.style||'light';
  if(typeof style!=='string'||!openMapTilesStyles.includes(style))throw invalid('Style peta tidak valid.');
  const region=activeRegion(manager.snapshot(),provider);
  if(!region)throw invalid('Belum ada paket untuk provider ini. Buka Settings > Offline Maps.',404);
  if(region.provider==='mbtiles-raster'){
    const sources={},layers=[{id:'raster-background',type:'background',paint:{'background-color':'#dce3e6'}}];
    // Keep coarser levels below finer imagery; MapLibre overzooms them across missing levels/tiles.
    for(const zoom of region.zoomLevels){
      const id='mbtiles-z'+zoom;
      sources[id]={type:'raster',tiles:[`/offline-maps/tiles/${region.file}/{z}/{x}/{y}.png`],tileSize:256,minzoom:zoom,maxzoom:zoom,bounds:region.bounds,attribution:region.attribution};
      layers.push({id,type:'raster',source:id,minzoom:zoom,paint:{'raster-fade-duration':0}});
    }
    return res.set('Cache-Control','no-store').json({version:8,name:region.title||region.name,sources,layers});
  }
  if(region.format==='gmdb'){
    const variant=region.variants.find(item=>item.id===region.selectedVariant);
    if(!variant)throw invalid('Layer GMDB belum dipilih.',404);
    const sources={},layers=[{id:'gmdb-background',type:'background',paint:{'background-color':'#dce3e6'}}];
    variant.types.forEach((type,index)=>{
      const info=region.variants.find(item=>item.id===String(type))||variant,id='gmdb-'+type;
      sources[id]={type:'raster',tiles:[`/offline-maps/tiles/${region.file}/{z}/{x}/{y}.png?type=${type}`],tileSize:256,minzoom:info.minzoom,maxzoom:info.maxzoom,bounds:info.bounds,attribution:variant.attribution};
      layers.push({id,type:'raster',source:id,paint:{'raster-fade-duration':0,...(index?{'raster-opacity':1}:{})}});
    });
    return res.set('Cache-Control','no-store').json({version:8,name:region.title||region.name,sources,layers});
  }
  const info=providers[provider],raster=info.type==='raster',imported=provider==='openmaptiles';
  res.set('Cache-Control','no-store').json({version:8,name:region.title||region.name,
    ...(!raster?{glyphs:'/offline-maps/assets/fonts/{fontstack}/{range}.pbf',...(!imported?{sprite:'/offline-maps/assets/sprites/v4/dark'}:{})}:{}),
    sources:{offline:{type:info.type,tiles:[`/offline-maps/tiles/${region.file}/{z}/{x}/{y}.${raster?'jpg':'mvt'}`],minzoom:region.minzoom||0,maxzoom:region.maxzoom,bounds:region.bounds,attribution:info.attribution,...(raster?{tileSize:256}:{})}},
    layers:raster?[{id:'satellite-background',type:'background',paint:{'background-color':'#081820'}},{id:'satellite',type:'raster',source:'offline',paint:{'raster-fade-duration':0}}]:imported?openMapTilesLayers('offline',style):layers('offline',namedFlavor('dark'),{lang:'id'})});
});
const readers=new Map();
function reader(file){
  if(!readers.has(file)){
    if(readers.size>=20)readers.delete(readers.keys().next().value);
    const filename=manager.safeFile(file);
    readers.set(file,new PMTiles({getKey:()=>filename,async getBytes(offset,length){
      const handle=await open(filename,'r');try{const buffer=Buffer.alloc(length);const {bytesRead}=await handle.read(buffer,0,length,offset);return {data:buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+bytesRead)};}finally{await handle.close();}
    }}));
  }return readers.get(file);
}
app.get(['/offline-maps/tiles/:file/:z/:x/:y.mvt','/offline-maps/tiles/:file/:z/:x/:y.jpg','/offline-maps/tiles/:file/:z/:x/:y.png'],async(req,res)=>{
  const {file}=req.params;
  if(!manager.snapshot().regions.some(r=>r.file===file||r.previousFile===file))throw invalid('Paket tidak ditemukan.',404);
  const z=Number(req.params.z),x=Number(req.params.x),y=Number(req.params.y);
  if(![z,x,y].every(Number.isInteger)||z<0||z>22||x<0||y<0||x>=2**z||y>=2**z)throw invalid('Koordinat tile tidak valid.');
  if(file.endsWith('.gmdb')){
    const entry=manager.snapshot().regions.find(r=>r.file===file),type=Number(req.query.type);
    if(!req.path.endsWith('.png')||!Number.isSafeInteger(type)||!entry?.variants?.some(variant=>variant.types.includes(type)))throw invalid('Layer GMDB tidak ditemukan.',404);
    if(!mbReaders.has(file)){if(mbReaders.size>=4)closeReader(mbReaders.keys().next().value);mbReaders.set(file,createGmdbReader(manager.safeFile(file)));}
    const tile=mbReaders.get(file).getZxy(z,x,y,type);
    if(!tile)return res.type('image/png').set('Cache-Control','public,max-age=300').send(emptyRasterTile);
    return res.type(tile.mime).set('Cache-Control','public,max-age=86400,immutable').send(tile.data);
  }
  if(file.endsWith('.mbtiles')){
    const entry=manager.snapshot().regions.find(r=>r.file===file),raster=entry?.provider==='mbtiles-raster';
    if(!req.path.endsWith(raster?'.png':'.mvt'))throw invalid('Format tile tidak cocok.',404);
    if(!mbReaders.has(file)){if(mbReaders.size>=4)closeReader(mbReaders.keys().next().value);mbReaders.set(file,createMbtilesReader(manager.safeFile(file)));}
    const tile=mbReaders.get(file).getZxy(z,x,y);
    if(raster)return res.type(tile?(entry.tileFormat==='jpg'?'image/jpeg':'image/png'):'image/png').set('Cache-Control',tile?'public,max-age=86400,immutable':'public,max-age=300').send(tile?.data||emptyRasterTile);
    if(!tile)return res.status(204).end();
    if(tile.gzip)res.set('Content-Encoding','gzip');
    return res.type('application/vnd.mapbox-vector-tile').set('Cache-Control','public,max-age=86400,immutable').send(tile.data);
  }
  const tile=await reader(file).getZxy(z,x,y);if(!tile)return res.status(204).end();
  res.type(req.path.endsWith('.jpg')?'image/jpeg':'application/vnd.mapbox-vector-tile').set('Cache-Control','public,max-age=86400,immutable').send(Buffer.from(tile.data));
});
app.use((error,_req,res,_next)=>{console.error(error.message);res.status(error.status||500).json({error:error.status?error.message:'Layanan peta gagal memproses permintaan.'});});
app.locals.close=()=>{for(const file of mbReaders.keys())closeReader(file);};
return app;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const manager=await createManager(process.env.MAP_DATA_DIR||'.runtime');
  const app=createApp(manager);
  const server=app.listen(8090,'0.0.0.0',()=>console.log('BMS Offline Maps :8090'));
  server.requestTimeout=60*60*1000;
  async function shutdown(){await manager.close();app.locals.close();server.close(()=>process.exit(0));}
  process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}
