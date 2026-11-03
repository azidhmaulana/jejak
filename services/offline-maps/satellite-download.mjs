import {DatabaseSync} from 'node:sqlite';
import {setTimeout as delay} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';
import {providers,satelliteProvider,satelliteUrl,tileRanges,tileCount} from './providers.mjs';
import {validateRegion} from './regions.mjs';
export async function normalizeSatelliteTile(buffer){
  if(buffer.length>=4&&buffer[0]===255&&buffer[1]===216&&buffer.at(-2)===255&&buffer.at(-1)===217)return buffer;
  // EOX returns solid ocean tiles as PNG even on the JPEG endpoint. Keep the archive uniformly JPEG.
  if(buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&buffer.length>=33&&buffer.readUInt32BE(16)===256&&buffer.readUInt32BE(20)===256){
    const [{PNG},{default:jpeg}]=await Promise.all([import('pngjs'),import('jpeg-js')]);
    const decoded=PNG.sync.read(buffer,{checkCRC:true});
    return jpeg.encode(decoded,85).data;
  }
  throw Error('Sumber tidak mengirim citra JPEG/PNG yang valid.');
}

export async function downloadSatellite(filename,request,{fetchTile=fetch,progress=()=>{},wait=delay}={}){
  const region=validateRegion({...request,provider:satelliteProvider});
  const total=tileCount(region.bounds,region.maxzoom);
  function* coordinates(){for(const r of tileRanges(region.bounds,region.maxzoom))for(let x=r.left;x<=r.right;x++)for(let y=r.top;y<=r.bottom;y++)yield [r.z,x,y];}
  const tiles=coordinates();
  const db=new DatabaseSync(filename);
  let completed=0,bytes=0,lastProgress=0,transaction=false;
  const controller=new AbortController();
  try{
    db.exec('CREATE TABLE IF NOT EXISTS metadata (name TEXT PRIMARY KEY,value TEXT); CREATE TABLE IF NOT EXISTS tiles (zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_data BLOB,PRIMARY KEY(zoom_level,tile_column,tile_row));');
    const fingerprint=JSON.stringify(region),previous=db.prepare("SELECT value FROM metadata WHERE name='bms_request'").get()?.value;
    if(previous!==fingerprint)db.exec('DELETE FROM tiles; DELETE FROM metadata;');
    const metadata=db.prepare('INSERT OR REPLACE INTO metadata VALUES (?,?)');
    metadata.run('bms_request',fingerprint);
    for(const [name,value] of Object.entries({name:region.name,format:'jpg',type:'baselayer',version:'1',minzoom:'0',maxzoom:String(region.maxzoom),bounds:region.bounds.join(','),attribution:providers[satelliteProvider].attribution}))metadata.run(name,value);
    const insert=db.prepare('INSERT INTO tiles VALUES (?,?,?,?)');
    const exists=db.prepare('SELECT 1 FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?');
    const saved=db.prepare('SELECT COUNT(*) AS completed,COALESCE(SUM(LENGTH(tile_data)),0) AS bytes FROM tiles').get();
    completed=saved.completed;bytes=saved.bytes;progress({bytes,completed,total});
    db.exec('BEGIN');transaction=true;
    async function worker(){
      for(;;){
        controller.signal.throwIfAborted();
        const next=tiles.next();if(next.done)return;
        const [z,x,y]=next.value;if(exists.get(z,x,2**z-1-y))continue;
        let buffer;
        for(let attempt=0;attempt<3;attempt++){
          controller.signal.throwIfAborted();
          try{
            const response=await fetchTile(satelliteUrl(z,x,y),{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)]),headers:{'User-Agent':'BMS-OfflineMaps/1.0'}});
            if(!response.ok){await response.body?.cancel();throw Error(`HTTP ${response.status}`);}
            // Bound the response before buffering; a failed source cannot exhaust server RAM.
            const reader=response.body.getReader(),chunks=[];let length=0;
            try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>1024*1024)throw Error('Tile lebih besar dari 1 MB.');chunks.push(value);}}finally{await reader.cancel();}
            buffer=Buffer.concat(chunks);
            buffer=await normalizeSatelliteTile(buffer);
            break;
          }catch(error){if(controller.signal.aborted)throw error;if(attempt===2)throw Error(`Satelit ${z}/${x}/${y}: ${error.message}`);await wait(1000*(attempt+1));}
        }
        bytes+=buffer.length;if(bytes>4*1024**3)throw Error('Paket melewati batas 4 GB.');
        insert.run(z,x,2**z-1-y,buffer);completed++;
        if(completed%100===0)db.exec('COMMIT; BEGIN');
        if(Date.now()-lastProgress>1000||completed===total){lastProgress=Date.now();progress({bytes,completed,total});}
        await wait(50);
      }
    }
    const workers=Array.from({length:4},()=>worker().catch(error=>{controller.abort(error);throw error;}));
    const results=await Promise.allSettled(workers);
    const failure=results.find(result=>result.status==='rejected');if(failure)throw failure.reason;
    db.exec('COMMIT');transaction=false;
  }finally{if(transaction)db.exec('COMMIT');db.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  downloadSatellite(process.argv[2],JSON.parse(process.argv[3]),{progress:value=>console.log(JSON.stringify(value))}).catch(error=>{console.error(error.message);process.exitCode=1;});
}
