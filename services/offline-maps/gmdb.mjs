import {openMbtiles} from './mbtiles.mjs';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {PNG} from 'pngjs';
import {invalid} from './regions.mjs';
// DbIds derived from the provider GUIDs in upstream GMap.NET (SHA1, little-endian Int32).
const registry={
  1264334970:{providerLabel:'MBTiles (GMap.NET)',mapType:'raster',attribution:'Sumber MBTiles pada cache GMap.NET'},
  1492776782:{providerLabel:'OpenStreetMap',mapType:'street',attribution:'© OpenStreetMap contributors'},
  1407893838:{providerLabel:'Google Maps',mapType:'street',attribution:'© Google'},
  253259331:{providerLabel:'Google Maps',mapType:'satellite',attribution:'© Google'},
  395208045:{providerLabel:'Google Maps',mapType:'hybrid',base:253259331,attribution:'© Google'},
  1222160303:{providerLabel:'Google Maps',mapType:'terrain',attribution:'© Google'},
  783085212:{providerLabel:'Bing',mapType:'satellite',attribution:'© Microsoft Bing'},
  33405937:{providerLabel:'ArcGIS / Esri',mapType:'terrain',attribution:'© Esri and its data providers'},
  1296763954:{providerLabel:'ArcGIS / Esri',mapType:'topographic',attribution:'© Esri and its data providers'},
  1134614052:{providerLabel:'OpenSeaMap',mapType:'hybrid',base:1492776782,attribution:'© OpenStreetMap contributors, OpenSeaMap'},
};
export const emptyRasterTile=PNG.sync.write(new PNG({width:256,height:256}));
export function rasterMime(data){
  if(data.length>=24&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){
    if(data.readUInt32BE(16)!==256||data.readUInt32BE(20)!==256)throw invalid('GMDB memerlukan tile 256 x 256.');
    return 'image/png';
  }
  if(data.length>=4&&data[0]===255&&data[1]===216&&data[2]===255)return 'image/jpeg';
  throw invalid('GMDB memerlukan gambar tile PNG atau JPEG.');
}
const lon=(x,z)=>x/2**z*360-180;
const lat=(y,z)=>Math.atan(Math.sinh(Math.PI*(1-2*y/2**z)))*180/Math.PI;
function bounds(row){return [lon(row.west,row.zoom),lat(row.south+1,row.zoom),lon(row.east+1,row.zoom),lat(row.north,row.zoom)];}
export function inspectGmdb(filename){
 let db;
 try{
  db=openMbtiles(filename);
  const counts=db.prepare('SELECT Type AS type,Zoom AS zoom,COUNT(*) AS count,MIN(X) AS west,MAX(X) AS east,MIN(Y) AS north,MAX(Y) AS south,MAX(CacheTime) AS date FROM Tiles GROUP BY Type,Zoom LIMIT 2049').all();
  if(!counts.length||counts.length>2048)throw invalid('GMDB kosong atau memiliki terlalu banyak layer.');
  const bad=db.prepare('SELECT 1 FROM Tiles WHERE Type IS NULL OR Zoom IS NULL OR X IS NULL OR Y IS NULL OR Zoom<0 OR Zoom>22 OR Zoom!=CAST(Zoom AS INTEGER) OR X!=CAST(X AS INTEGER) OR Y!=CAST(Y AS INTEGER) OR X<0 OR Y<0 OR X>=(1 << Zoom) OR Y>=(1 << Zoom) LIMIT 1').get();
  if(bad)throw invalid('Koordinat tile GMDB tidak valid.');
  const plan=db.prepare('EXPLAIN QUERY PLAN SELECT id FROM Tiles WHERE X=? AND Y=? AND Zoom=? AND Type=?').all(0,0,0,0);
  if(!plan.some(row=>/SEARCH/i.test(row.detail)))throw invalid('GMDB memerlukan indeks koordinat tile.');
  const groups=new Map();
  for(const row of counts){if(!Number.isInteger(row.type))throw invalid('ID provider GMDB tidak valid.');if(!groups.has(row.type))groups.set(row.type,[]);groups.get(row.type).push(row);}
  const variants=[],ignoredTypes=[];
  for(const [type,rows] of groups){
    const info=registry[type];
    if(!info||info.base&&!groups.has(info.base)){ignoredTypes.push(type);continue;}
    const sample=db.prepare('SELECT d.Tile AS data FROM Tiles t JOIN TilesData d ON d.id=t.id WHERE t.Type=? AND length(d.Tile) BETWEEN 1 AND 8388608 ORDER BY t.id DESC LIMIT 1').get(type);
    if(!sample)throw invalid('Layer GMDB tidak memiliki gambar tile yang valid.');
    rasterMime(Buffer.from(sample.data));
    const all=rows.map(bounds),coverage=[Math.min(...all.map(b=>b[0])),Math.min(...all.map(b=>b[1])),Math.max(...all.map(b=>b[2])),Math.max(...all.map(b=>b[3]))];
    const focus=[...rows].sort((a,b)=>(b.zoom>=8)-(a.zoom>=8)||b.count-a.count||b.zoom-a.zoom)[0];
    variants.push({id:String(type),providerLabel:info.providerLabel,mapType:info.mapType,attribution:info.attribution,
      types:info.base?[info.base,type]:[type],minzoom:Math.min(...rows.map(r=>r.zoom)),maxzoom:Math.max(...rows.map(r=>r.zoom)),
      bounds:coverage,viewBounds:bounds(focus),tileCount:rows.reduce((sum,row)=>sum+row.count,0),sourceDate:rows.map(r=>String(r.date||'')).sort().at(-1).slice(0,10)});
  }
  if(!variants.length)throw invalid('Provider/proyeksi GMDB ini belum didukung.');
  const missing=db.prepare('SELECT 1 FROM Tiles t LEFT JOIN TilesData d ON d.id=t.id WHERE d.id IS NULL OR d.Tile IS NULL OR length(d.Tile) NOT BETWEEN 1 AND 8388608 LIMIT 1').get();
  if(missing)throw invalid('GMDB memiliki gambar tile hilang atau tidak valid.');
  if(Object.values(db.prepare('PRAGMA quick_check(1)').get())[0]!=='ok')throw invalid('Database GMDB rusak.');
  variants.sort((a,b)=>a.providerLabel.localeCompare(b.providerLabel)||a.mapType.localeCompare(b.mapType));
  const preferred=variants.find(v=>v.providerLabel==='OpenStreetMap')||variants[0];
  return {provider:'gmdb',format:'gmdb',imported:true,variants,ignoredTypes,...variantFields(preferred)};
 }catch(error){if(error.status)throw error;throw invalid('File bukan cache GMDB yang valid atau database rusak.');}
 finally{db?.close();}
}
function variantFields(variant){const {id,types,...fields}=variant;return {...fields,selectedVariant:id};}
export function selectGmdbVariant(entry,input={}){
 const variants=entry.variants||[];
 const selected=input.variantId!==undefined?variants.find(v=>v.id===input.variantId):variants.find(v=>(!input.providerLabel||input.providerLabel==='auto'||v.providerLabel===input.providerLabel)&&(!input.mapType||input.mapType==='auto'||v.mapType===input.mapType));
 if(!selected)throw invalid('Provider atau jenis peta tidak tersedia di file GMDB ini.');
 return variantFields(selected);
}
export function createGmdbReader(filename){
 const db=openMbtiles(filename);
 let query;
 try{query=db.prepare('SELECT d.Tile AS data FROM Tiles t JOIN TilesData d ON d.id=t.id WHERE t.X=? AND t.Y=? AND t.Zoom=? AND t.Type=? AND length(d.Tile) BETWEEN 1 AND 8388608 ORDER BY t.CacheTime DESC,t.id DESC LIMIT 1');}
 catch(error){db.close();throw error;}
 return {getZxy(z,x,y,type){const row=query.get(x,y,z,type);if(!row)return null;const data=Buffer.from(row.data);return {data,mime:rasterMime(data)};},close:()=>db.close()};
}
export function validateGmdbFile(filename,{signal}={}){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(signal.reason);return;}
  const worker=new Worker(new URL('./gmdb.mjs',import.meta.url),{workerData:{filename,kind:'gmdb'}});
  let finished=false;
  const finish=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);void worker.terminate();error?reject(error):resolve(result);};
  const cancel=()=>finish(invalid('Pemuatan GMDB dibatalkan.'));
  const timer=setTimeout(()=>finish(invalid('Pemeriksaan GMDB terlalu lama.')),120000);
  signal?.addEventListener('abort',cancel,{once:true});
  worker.once('message',message=>message.error?finish(invalid(message.error)):finish(null,message.result));
  worker.once('error',()=>finish(invalid('Pemeriksaan GMDB gagal.')));
  worker.once('exit',code=>{if(!finished)finish(invalid(`Pemeriksaan GMDB berhenti (${code}).`));});
 });
}
if(!isMainThread&&workerData?.kind==='gmdb'){
 try{parentPort.postMessage({result:inspectGmdb(workerData.filename)});}catch(error){parentPort.postMessage({error:error.message});}
}
