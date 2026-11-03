import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {Readable,PassThrough} from 'node:stream';
import {gzipSync} from 'node:zlib';
import {once} from 'node:events';
import os from 'node:os';
import path from 'node:path';
import {inspectMbtiles,createMbtilesReader} from '../mbtiles.mjs';
import {createManager} from '../manager.mjs';
import {createApp} from '../server.mjs';
const raw=Buffer.from([26,5,10,1,97,120,2]);
async function fixture(t,{normalized=false,format='pbf',cleanup=true}={}){
 const dir=await mkdtemp(path.join(os.tmpdir(),'bms-mbtiles-'));if(cleanup)t.after(()=>rm(dir,{force:true,recursive:true}));
 const file=path.join(dir,'fixture.mbtiles'),db=new DatabaseSync(file);
 db.exec('CREATE TABLE metadata(name TEXT,value TEXT);');
 const add=db.prepare('INSERT INTO metadata VALUES(?,?)');
 for(const [key,value] of Object.entries({format,name:'Indonesia',bounds:'92,-12,142,7',minzoom:'0',maxzoom:'14',scheme:'tms',planettime:'1581292800000',json:JSON.stringify({vector_layers:['water','transportation','place'].map(id=>({id}))})}))add.run(key,value);
 if(normalized){db.exec('CREATE TABLE images(tile_id TEXT PRIMARY KEY,tile_data BLOB); CREATE TABLE map(zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_id TEXT,PRIMARY KEY(zoom_level,tile_column,tile_row)); CREATE VIEW tiles AS SELECT zoom_level,tile_column,tile_row,tile_data FROM map JOIN images USING(tile_id);');db.prepare('INSERT INTO images VALUES(?,?)').run('one',gzipSync(raw));db.exec("INSERT INTO map VALUES(2,3,1,'one')");}
 else{db.exec('CREATE TABLE tiles(zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_data BLOB,PRIMARY KEY(zoom_level,tile_column,tile_row));');db.prepare('INSERT INTO tiles VALUES(?,?,?,?)').run(2,3,1,gzipSync(raw));}
 db.close();return {dir,file,data:await readFile(file)};
}
test('MBTiles table and normalized view are read-only and XYZ converts to TMS',async t=>{
 for(const normalized of [false,true]){
  const {file,data}=await fixture(t,{normalized});const metadata=inspectMbtiles(file);
  assert.equal(metadata.provider,'openmaptiles');assert.equal(metadata.sourceDate,'2020-02-10');assert.equal(metadata.maxzoom,14);
  const reader=createMbtilesReader(file);assert.equal(reader.getZxy(2,3,2).gzip,true);assert.equal(reader.getZxy(2,3,1),null);reader.close();
  assert.deepEqual(await readFile(file),data);
 }
 const {file}=await fixture(t,{format:'jpg'});assert.throws(()=>inspectMbtiles(file),/valid|rusak/);
});
test('import publishes validated data, persists across restart, rejects duplicates and broken uploads',async t=>{
 const {dir,data}=await fixture(t,{cleanup:false});const directory=path.join(dir,'runtime');let manager=await createManager(directory);t.after(async()=>{await manager.close();await rm(dir,{force:true,recursive:true});});
 const initial=manager.snapshot();
 const result=await manager.importFile(Readable.from([data.subarray(0,200),data.subarray(200)]),{filename:'Indonesia.mbtiles',size:data.length,name:'indonesia-2020',title:'Indonesia map',providerLabel:'OpenMapTiles custom'});
 const entry=result.regions.at(-1);assert.equal(entry.imported,true);assert.equal(entry.size,data.length);assert.equal(result.activeByProvider.openmaptiles,entry.id);
 assert.equal(entry.mapType,'street');assert.equal(entry.name,'indonesia-2020');assert.equal(entry.title,'Indonesia map');assert.equal(entry.providerLabel,'OpenMapTiles custom');assert.equal(entry.provider,'openmaptiles');
 assert.deepEqual(result.regions[0],initial.regions[0]);assert.equal(result.activeId,initial.activeId);
 await assert.rejects(manager.start(entry.id),/Browse/);
 await assert.rejects(manager.importFile(Readable.from([data]),{filename:'Copy.mbtiles',size:data.length}),/sudah dimuat/);
 await assert.rejects(manager.importFile(Readable.from([Buffer.alloc(1024)]),{filename:'Broken.mbtiles',size:1024}),/valid|rusak/);
 await assert.rejects(manager.importFile(Readable.from([data.subarray(0,600)]),{filename:'Truncated.mbtiles',size:data.length}),/lengkap/);
 await assert.rejects(manager.importFile(Readable.from([data]),{filename:'../outside.mbtiles',size:data.length}));
 assert.deepEqual(await readdir(manager.packages),[entry.file]);
 await assert.rejects(manager.rename(entry.id,{name:'rename',title:' ',providerLabel:'OSM'}));
 await assert.rejects(manager.rename(entry.id,{name:'rename',title:'Good',providerLabel:'x'.repeat(81)}));
 await assert.rejects(manager.rename(entry.id,{name:'Wrong type',mapType:'satellite'}),/Peta Jalan/);
 await assert.rejects(manager.importFile(Readable.from([data]),{filename:'Other.mbtiles',size:data.length,mapType:'hybrid'}),/Peta Jalan/);
 await manager.rename(entry.id,{name:'indonesia-new',title:'Peta Indonesia',providerLabel:'OSM archive',provider:'eox-satellite',file:'other',bounds:[0,0,1,1]});
 const edited=manager.snapshot().regions.at(-1);assert.equal(edited.provider,'openmaptiles');assert.equal(edited.file,entry.file);assert.deepEqual(edited.bounds,entry.bounds);
 await manager.activate(entry.id);await manager.close();manager=await createManager(directory);
 assert.equal(manager.snapshot().regions.at(-1).title,'Peta Indonesia');assert.equal(manager.snapshot().regions.at(-1).providerLabel,'OSM archive');assert.equal(manager.snapshot().regions.at(-1).name,'indonesia-new');
 assert.equal(manager.snapshot().activeId,entry.id);assert.deepEqual(await readFile(manager.safeFile(entry.file)),data);
});
test('cancellation removes partial data and an upload blocks concurrent jobs',async t=>{
 const {dir,data}=await fixture(t,{cleanup:false});const manager=await createManager(path.join(dir,'runtime'));t.after(async()=>{await manager.close();await rm(dir,{force:true,recursive:true});});
 const stream=new PassThrough();const promise=manager.importFile(stream,{filename:'Cancel.mbtiles',size:data.length});
 const rejected=assert.rejects(promise,/dibatalkan/);
 stream.write(data.subarray(0,512));
 await assert.rejects(manager.importFile(Readable.from([data]),{filename:'Other.mbtiles',size:data.length}),error=>error.status===409);
 await manager.cancel();await rejected;
 assert.equal(manager.snapshot().job.status,'cancelled');assert.deepEqual(await readdir(manager.packages),[]);
});
test('HTTP upload serves local OpenMapTiles style and gzip tiles; cross-site requests are rejected',async t=>{
 const {dir,data}=await fixture(t,{normalized:true,cleanup:false});const manager=await createManager(path.join(dir,'runtime'));
 const app=createApp(manager,{authenticate:(_req,_res,next)=>next()}),server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{app.locals.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await manager.close();await rm(dir,{force:true,recursive:true});});
 const base=`http://127.0.0.1:${server.address().port}`;
 const upload=(extra={})=>fetch(base+'/api/offline-maps/import?filename=Indonesia.mbtiles&name=indonesia&title=Peta%20Indonesia&providerLabel=OSM%20archive',{method:'POST',headers:{'Content-Type':'application/octet-stream',...extra},body:data});
 assert.equal((await upload({'Sec-Fetch-Site':'cross-site'})).status,403);
 const response=await upload();assert.equal(response.status,201);const entry=(await response.json()).regions.at(-1);assert.equal(entry.title,'Peta Indonesia');assert.equal(entry.providerLabel,'OSM archive');assert.equal(entry.name,'indonesia');
 const style=await(await fetch(base+'/offline-maps/style.json?provider=openmaptiles')).json();assert.equal(style.sources.offline.maxzoom,14);assert.ok(style.glyphs.startsWith('/offline-maps/assets/'));assert.equal(style.sprite,undefined);
 assert.ok(style.layers.some(layer=>layer['source-layer']==='transportation'));
 const backgrounds=new Set();
 for(const variant of ['light','dark','grayscale']){
   const response=await fetch(base+'/offline-maps/style.json?provider=openmaptiles&style='+variant);assert.equal(response.status,200);
   const themed=await response.json();backgrounds.add(themed.layers.find(layer=>layer.id==='omt-background').paint['background-color']);
   assert.deepEqual(themed.sources.offline.tiles,style.sources.offline.tiles);assert.equal(themed.glyphs,style.glyphs);
 }
 assert.equal(backgrounds.size,3);
 assert.equal((await fetch(base+'/offline-maps/style.json?provider=openmaptiles&style=invalid')).status,400);

 const tile=await fetch(base+`/offline-maps/tiles/${entry.file}/2/3/2.mvt`);assert.equal(tile.status,200);assert.equal(tile.headers.get('content-encoding'),'gzip');assert.deepEqual(Buffer.from(await tile.arrayBuffer()),raw);
 assert.equal((await fetch(base+`/offline-maps/tiles/${entry.file}/2/3/1.mvt`)).status,204);
 assert.equal((await fetch(base+`/offline-maps/tiles/${entry.file}/2/9/2.mvt`)).status,400);
 const api=(url,method,body)=>fetch(base+'/api/offline-maps'+url,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const renamed=await api('/regions/'+entry.id,'PATCH',{name:'Local Indonesia',title:'Peta lokal',providerLabel:'OpenMapTiles lokal'});assert.equal(renamed.status,200);assert.equal((await renamed.json()).regions.at(-1).name,'Local Indonesia');
 assert.equal((await api('/active','PUT',{id:entry.id,enabled:false})).status,200);
 assert.equal((await fetch(base+'/offline-maps/style.json?provider=openmaptiles')).status,404);
 assert.equal((await api('/active','PUT',{id:entry.id,enabled:true})).status,200);
 assert.equal((await api('/regions/'+entry.id,'DELETE')).status,200);
 assert.equal((await fetch(base+'/offline-maps/style.json?provider=openmaptiles')).status,404);
 assert.deepEqual(await readdir(manager.packages),[]);

});
