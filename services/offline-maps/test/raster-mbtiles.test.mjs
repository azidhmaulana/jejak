import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {once} from 'node:events';
import os from 'node:os';
import path from 'node:path';
import {PNG} from 'pngjs';
import jpeg from 'jpeg-js';
import {inspectMbtiles,createMbtilesReader} from '../mbtiles.mjs';
import {createManager} from '../manager.mjs';
import {createApp} from '../server.mjs';
async function fixture(t,format='png',cleanup=true){
 const dir=await mkdtemp(path.join(os.tmpdir(),'bms-raster-'));if(cleanup)t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'marine.mbtiles'),db=new DatabaseSync(file);
 db.exec('CREATE TABLE metadata(name TEXT,value TEXT);CREATE TABLE tiles(zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_data BLOB,PRIMARY KEY(zoom_level,tile_column,tile_row));');
 for(const [key,value] of Object.entries({format,name:'Pacific',bounds:'-180,-85,180,85',minzoom:'1',maxzoom:'3',scheme:'tms',attribution:'Charts <script>bad</script>'}))db.prepare('INSERT INTO metadata VALUES(?,?)').run(key,value);
 const image=new PNG({width:256,height:256});for(let i=0;i<image.data.length;i+=4){image.data[i]=20;image.data[i+1]=120;image.data[i+2]=200;image.data[i+3]=255;}
 const tile=format==='png'?PNG.sync.write(image):jpeg.encode(image,80).data;
 const add=db.prepare('INSERT INTO tiles VALUES(?,?,?,?)');add.run(1,1,0,tile);add.run(3,4,3,tile);db.close();
 return {dir,file,tile,data:await readFile(file)};
}
test('raster PNG/JPEG detection, sparse zooms, XYZ/TMS and read-only source',async t=>{
 for(const format of ['png','jpg']){const {file,data,tile}=await fixture(t,format),info=inspectMbtiles(file);
 assert.equal(info.provider,'mbtiles-raster');assert.deepEqual(info.zoomLevels,[1,3]);assert.equal(info.tileFormat,format);assert.ok(!info.attribution.includes('<script>'));
 assert.equal(info.minzoom,1);assert.equal(info.maxzoom,3);assert.ok(info.viewBounds.every(Number.isFinite));
 const reader=createMbtilesReader(file);assert.deepEqual(reader.getZxy(1,1,1).data,tile);assert.equal(reader.getZxy(1,1,0),null);reader.close();assert.deepEqual(await readFile(file),data);
 }
});
test('raster import and nautical labels survive restart; incompatible format rejected',async t=>{
 const {dir,data,file}=await fixture(t,'png',false);let manager=await createManager(path.join(dir,'runtime'));t.after(async()=>{await manager.close();await rm(dir,{recursive:true,force:true});});
 const entry=(await manager.importFile(Readable.from([data]),{filename:'Pacific.mbtiles',size:data.length,name:'Pacific',providerLabel:'Navionics',mapType:'nautical'})).regions.at(-1);
 assert.equal(entry.mapType,'nautical');assert.equal(entry.providerLabel,'Navionics');assert.equal(entry.provider,'mbtiles-raster');
 await manager.rename(entry.id,{name:'Pacific 2',mapType:'nautical'});await manager.activate(entry.id);await manager.close();manager=await createManager(path.join(dir,'runtime'));
 assert.equal(manager.snapshot().activeByProvider['mbtiles-raster'],entry.id);assert.equal(manager.snapshot().regions.at(-1).mapType,'nautical');
 const db=new DatabaseSync(file);db.exec("UPDATE metadata SET value='png' WHERE name='format';UPDATE tiles SET tile_data=X'00112233'");db.close();assert.throws(()=>inspectMbtiles(file),/PNG/);
});
test('raster HTTP style overzooms each stored level; real PNG/JPEG and empty tiles have correct MIME',async t=>{
 for(const format of ['png','jpg']){
 const {dir,data,tile}=await fixture(t,format),manager=await createManager(path.join(dir,'runtime')),app=createApp(manager,{authenticate:(_req,_res,next)=>next()}),server=app.listen(0,'127.0.0.1');await once(server,'listening');
 try{
 const base=`http://127.0.0.1:${server.address().port}`;
 const uploaded=await fetch(base+'/api/offline-maps/import?filename=Pacific.mbtiles&providerLabel=Navionics&mapType=nautical',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:data});assert.equal(uploaded.status,201);
 const entry=(await uploaded.json()).regions.at(-1),style=await(await fetch(base+'/offline-maps/style.json?provider=mbtiles-raster')).json();
 assert.equal(style.glyphs,undefined);assert.equal(style.sources['mbtiles-z1'].maxzoom,1);assert.equal(style.sources['mbtiles-z3'].minzoom,3);
 assert.equal(style.layers.find(l=>l.id==='mbtiles-z1').maxzoom,undefined);assert.equal(style.layers.find(l=>l.id==='mbtiles-z3').minzoom,3);
 const root=base+`/offline-maps/tiles/${entry.file}`;
 const response=await fetch(root+'/1/1/1.png');assert.equal(response.headers.get('content-type'),format==='png'?'image/png':'image/jpeg');assert.deepEqual(Buffer.from(await response.arrayBuffer()),tile);
 const missing=await fetch(root+'/1/1/0.png');assert.equal(missing.status,200);assert.equal(missing.headers.get('content-type'),'image/png');assert.ok(PNG.sync.read(Buffer.from(await missing.arrayBuffer())).data.every(v=>v===0));
 assert.equal((await fetch(root+'/1/1/1.mvt')).status,404);
 }finally{app.locals.close();server.closeAllConnections();await new Promise(r=>server.close(r));await manager.close();}
 }
});
