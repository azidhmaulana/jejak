import {DatabaseSync} from 'node:sqlite';
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';
import jpeg from 'jpeg-js';
import {gunzipSync} from 'node:zlib';
import {invalid} from './regions.mjs';

export function openMbtiles(filename){
  const db=new DatabaseSync(filename,{readOnly:true,allowExtension:false});
  db.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF; PRAGMA cache_size=-4096; PRAGMA mmap_size=0;');
  return db;
}
export function inspectMbtiles(filename){
  let db;
  try{
    db=openMbtiles(filename);
    const metadata=Object.fromEntries(db.prepare('SELECT name,substr(value,1,1048576) AS value FROM metadata LIMIT 100').all().map(row=>[row.name,row.value]));
    const tileFormat=metadata.format==='jpeg'?'jpg':metadata.format,raster=['png','jpg'].includes(tileFormat);
    if(!raster&&tileFormat!=='pbf')throw invalid('MBTiles mendukung OpenMapTiles PBF atau raster PNG/JPEG.');
    if(metadata.scheme&&metadata.scheme!=='tms')throw invalid('MBTiles harus menggunakan skema koordinat TMS.');
    if(!raster){const layers=JSON.parse(metadata.json||'{}').vector_layers;
    if(!Array.isArray(layers)||!['water','transportation','place'].every(id=>layers.some(layer=>layer.id===id)))throw invalid('Skema layer bukan OpenMapTiles.');}
    const bounds=String(metadata.bounds||'').split(',').map(Number);
    if(bounds.length!==4||!bounds.every(Number.isFinite)||bounds[0]<-180||bounds[2]>180||bounds[1]<-85.051129||bounds[3]>85.051129||bounds[0]>=bounds[2]||bounds[1]>=bounds[3])throw invalid('Metadata batas wilayah MBTiles tidak valid.');
    const minzoom=Number(metadata.minzoom),maxzoom=Number(metadata.maxzoom);
    if(!Number.isInteger(minzoom)||!Number.isInteger(maxzoom)||minzoom<0||maxzoom<minzoom||maxzoom>22)throw invalid('Metadata zoom MBTiles harus 0-22.');
    // A view over map/images is valid MBTiles, as well as the standard tiles table.
    const row=db.prepare('SELECT zoom_level,tile_column,tile_row,tile_data FROM tiles LIMIT 1').get();
    if(!row||![row.zoom_level,row.tile_column,row.tile_row].every(Number.isInteger)||row.zoom_level<minzoom||row.zoom_level>maxzoom||row.tile_column<0||row.tile_row<0||row.tile_column>=2**row.zoom_level||row.tile_row>=2**row.zoom_level)throw invalid('Paket tidak memiliki tile yang valid.');
    const sample=Buffer.from(row.tile_data);
    if(!sample.length||sample.length>8*1024**2)throw invalid('Ukuran tile MBTiles tidak valid.');
    if(raster){
      let width,height;
      if(tileFormat==='png'){if(sample.length<24||!sample.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw invalid('Isi tile tidak cocok dengan format PNG.');width=sample.readUInt32BE(16);height=sample.readUInt32BE(20);}
      else {const image=jpeg.decode(sample,{maxResolutionInMP:1,maxMemoryUsageInMB:16});width=image.width;height=image.height;}
      if(width!==256||height!==256)throw invalid('MBTiles raster memerlukan tile 256 x 256.');
    }else if(sample[0]===31&&sample[1]===139)gunzipSync(sample,{maxOutputLength:32*1024**2});
    const plan=db.prepare('EXPLAIN QUERY PLAN SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?').all(minzoom,0,0);
    if(!plan.some(row=>/SEARCH/i.test(row.detail)))throw invalid('MBTiles memerlukan indeks koordinat tile agar akses peta cepat.');
    const check=db.prepare('PRAGMA quick_check(1)').get();
    if(Object.values(check)[0]!=='ok')throw invalid('Database MBTiles rusak atau tidak lengkap.');
    if(raster){
      const levels=db.prepare('SELECT zoom_level AS zoom,COUNT(*) AS count,MIN(tile_column) AS west,MAX(tile_column) AS east,MIN(tile_row) AS south,MAX(tile_row) AS north FROM tiles GROUP BY zoom_level LIMIT 24').all();
      if(!levels.length||levels.length>23||levels.some(r=>!Number.isInteger(r.zoom)||r.zoom<minzoom||r.zoom>maxzoom||r.west<0||r.south<0||r.east>=2**r.zoom||r.north>=2**r.zoom))throw invalid('Koordinat MBTiles raster tidak valid.');
      const zoomLevels=levels.map(r=>r.zoom).sort((a,b)=>a-b),lowest=levels.find(r=>r.zoom===zoomLevels[0]);
      // A global Pacific archive crosses the date line. Focus an existing tile, not empty longitude zero.
      const focus=db.prepare('SELECT tile_column AS x,tile_row AS y FROM tiles WHERE zoom_level=? ORDER BY tile_column,tile_row LIMIT 1 OFFSET ?').get(lowest.zoom,Math.floor(lowest.count/2));
      const n=2**lowest.zoom,lat=y=>Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI,y=n-1-focus.y;
      const viewBounds=[focus.x/n*360-180,lat(y+1),(focus.x+1)/n*360-180,lat(y)];
      const attribution=String(metadata.attribution||'').slice(0,1000).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      return {provider:'mbtiles-raster',minzoom:zoomLevels[0],maxzoom:zoomLevels.at(-1),bounds,viewBounds,zoomLevels,tileFormat,format:'mbtiles',imported:true,attribution,sourceDate:'',schemaVersion:String(metadata.version||'').slice(0,40)};
    }
    const date=Number(metadata.planettime);
    return {provider:'openmaptiles',minzoom,maxzoom,bounds,format:'mbtiles',imported:true,
      sourceDate:Number.isFinite(date)&&date>0?new Date(date).toISOString().slice(0,10):'',
      schemaVersion:String(metadata.version||'').slice(0,40)};
  }catch(error){if(error.status)throw error;throw invalid('File bukan MBTiles yang valid atau database rusak.');}
  finally{db?.close();}
}
export function validateMbtilesFile(filename,{signal}={}){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(signal.reason);return;}
    const worker=new Worker(new URL('./mbtiles.mjs',import.meta.url),{workerData:{filename,kind:'mbtiles'}});
    let finished=false;
    const finish=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);void worker.terminate();error?reject(error):resolve(result);};
    const cancel=()=>finish(invalid('Pemuatan MBTiles dibatalkan.'));
    const timer=setTimeout(()=>finish(invalid('Pemeriksaan MBTiles terlalu lama. Periksa kondisi file.')),120000);
    signal?.addEventListener('abort',cancel,{once:true});
    worker.once('message',message=>message.error?finish(invalid(message.error)):finish(null,message.result));
    worker.once('error',()=>finish(invalid('Pemeriksaan MBTiles gagal.')));
    worker.once('exit',code=>{if(!finished)finish(invalid(`Pemeriksaan MBTiles berhenti (${code}).`));});
  });
}
export function createMbtilesReader(filename){
  const db=openMbtiles(filename);
  let query;
  try{query=db.prepare('SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=? LIMIT 1');}
  catch(error){db.close();throw error;}
  return {getZxy(z,x,y){const row=query.get(z,x,2**z-1-y);if(!row)return null;const data=Buffer.from(row.tile_data);return {data,gzip:data[0]===31&&data[1]===139};},close:()=>db.close()};
}
if(!isMainThread&&workerData?.kind==='mbtiles'){
  try{parentPort.postMessage({result:inspectMbtiles(workerData.filename)});}catch(error){parentPort.postMessage({error:error.message});}
}
