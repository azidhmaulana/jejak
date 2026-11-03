import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {PNG} from 'pngjs';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {once} from 'node:events';
import os from 'node:os';
import path from 'node:path';
import {inspectGmdb,createGmdbReader} from '../gmdb.mjs';
import {createManager} from '../manager.mjs';
import {createApp} from '../server.mjs';
const osm=1492776782,satellite=253259331,hybrid=395208045;
function tile(color){const png=new PNG({width:256,height:256});for(let i=0;i<png.data.length;i+=4){png.data[i]=color;png.data[i+3]=255;}return PNG.sync.write(png);}
async function fixture(){
 const dir=await mkdtemp(path.join(os.tmpdir(),'bms-gmdb-')),file=path.join(dir,'Data.gmdb'),db=new DatabaseSync(file);
 db.exec('CREATE TABLE Tiles(id INTEGER PRIMARY KEY,X INTEGER,Y INTEGER,Zoom INTEGER,Type INTEGER,CacheTime DATETIME);CREATE INDEX IndexOfTiles ON Tiles(X,Y,Zoom,Type);CREATE TABLE TilesData(id INTEGER PRIMARY KEY,Tile BLOB);');
 const old=tile(20),latest=tile(230);let id=0;
 for(const [type,data,date] of [[osm,old,'2024-01-01'],[osm,latest,'2024-07-01'],[satellite,latest,'2024-07-01'],[hybrid,old,'2024-07-01'],[987654,old,'2024-07-01']]){
  id++;db.prepare('INSERT INTO Tiles VALUES(?,3,2,2,?,?)').run(id,type,date);db.prepare('INSERT INTO TilesData VALUES(?,?)').run(id,data);
 }
 db.close();return {dir,file,data:await readFile(file),latest};
}
test('GMDB detects providers, hybrid composition, sparse bounds and newest XYZ tile without modifying source',async t=>{
 const f=await fixture();t.after(()=>rm(f.dir,{recursive:true,force:true}));
 const info=inspectGmdb(f.file);assert.equal(info.variants.length,3);assert.deepEqual(info.ignoredTypes,[987654]);assert.equal(info.selectedVariant,String(osm));
 assert.deepEqual(info.variants.find(v=>v.id===String(hybrid)).types,[satellite,hybrid]);
 const reader=createGmdbReader(f.file);try{assert.deepEqual(reader.getZxy(2,3,2,osm).data,f.latest);assert.equal(reader.getZxy(2,3,1,osm),null);}finally{reader.close();}
 assert.deepEqual(await readFile(f.file),f.data);
});
test('GMDB upload stores one file, selection persists and unsupported choices do not change stored metadata',async t=>{
 const f=await fixture();const directory=path.join(f.dir,'runtime');let manager=await createManager(directory);
 t.after(async()=>{await manager.close();await rm(f.dir,{recursive:true,force:true});});
 const result=await manager.importFile(Readable.from([f.data]),{filename:'Data.gmdb',format:'gmdb',size:f.data.length,title:'Local cache'}),entry=result.regions.at(-1);
 assert.equal(entry.format,'gmdb');assert.equal(result.activeByProvider.gmdb,null);assert.equal(entry.variants.length,3);
 await assert.rejects(manager.importFile(Readable.from([f.data]),{filename:'Data.gmdb',format:'mbtiles',size:f.data.length}),/Format/);
 await assert.rejects(manager.importFile(Readable.from([f.data]),{filename:'Again.gmdb',size:f.data.length}),/sudah dimuat/);
 await assert.rejects(manager.rename(entry.id,{name:entry.name,providerLabel:'Bing',mapType:'satellite'}),/tidak tersedia/);
 await manager.rename(entry.id,{name:entry.name,title:'Renamed cache',providerLabel:'Google Maps',mapType:'hybrid'});
 await manager.activate(entry.id);await manager.close();manager=await createManager(directory);
 const restored=manager.snapshot().regions.at(-1);assert.equal(restored.selectedVariant,String(hybrid));assert.equal(restored.title,'Renamed cache');assert.equal(restored.file,entry.file);
 assert.deepEqual(await readdir(manager.packages),[entry.file]);assert.deepEqual(await readFile(manager.safeFile(entry.file)),f.data);
 await manager.remove(entry.id);assert.deepEqual(await readdir(manager.packages),[]);
});
test('GMDB HTTP tiles use layer IDs and transparent cache misses; hybrid style composes two local sources',async t=>{
 const f=await fixture(),manager=await createManager(path.join(f.dir,'runtime')),app=createApp(manager,{authenticate:(_req,_res,next)=>next()}),server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{app.locals.close();server.closeAllConnections();await new Promise(r=>server.close(r));await manager.close();await rm(f.dir,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}`;
 const response=await fetch(base+'/api/offline-maps/import?filename=Data.gmdb&format=gmdb&providerLabel=auto&mapType=auto',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:f.data});
 assert.equal(response.status,201);const entry=(await response.json()).regions.at(-1);
 await manager.activate(entry.id);await manager.rename(entry.id,{name:entry.name,variantId:String(hybrid)});
 const style=await(await fetch(base+'/offline-maps/style.json?provider=gmdb')).json();assert.equal(Object.keys(style.sources).length,2);assert.equal(style.glyphs,undefined);
 for(const source of Object.values(style.sources))assert.ok(source.tiles[0].startsWith('/offline-maps/tiles/'));
 const url=base+`/offline-maps/tiles/${entry.file}/2/3/2.png?type=${osm}`;
 const image=await fetch(url);assert.equal(image.status,200);assert.match(image.headers.get('content-type'),/image\/png/);assert.deepEqual(Buffer.from(await image.arrayBuffer()),f.latest);
 const empty=await fetch(base+`/offline-maps/tiles/${entry.file}/2/3/1.png?type=${osm}`);assert.equal(empty.status,200);assert.equal(PNG.sync.read(Buffer.from(await empty.arrayBuffer())).data[3],0);
 assert.equal((await fetch(base+`/offline-maps/tiles/${entry.file}/2/3/2.png?type=987654`)).status,404);
});
