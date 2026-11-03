import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {downloadSatellite,normalizeSatelliteTile} from '../satellite-download.mjs';
import {tileRanges,tileCount,satelliteProvider,activeRegion} from '../providers.mjs';
import {validateRegion,initialRegion} from '../regions.mjs';
import {createManager} from '../manager.mjs';
const request={name:'Bandung satellite',bounds:[107.61,-6.92,107.62,-6.91],maxzoom:8,provider:satelliteProvider};
const until=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await delay(10);}assert.fail('timeout');};
test('satellite download is bounded and tile ranges use XYZ without edge duplicates',()=>{
  for(const patch of [{provider:'unknown'},{maxzoom:19},{bounds:[105,-8,109.1,-5.1],maxzoom:18}])assert.throws(()=>validateRegion({...request,...patch}));
  assert.equal(tileCount([105,-8,109.1,-5.1],12),2218);
  assert.equal(tileCount([105,-8,109.1,-5.1],18),8475215);
  assert.equal(validateRegion({...request,maxzoom:18}).maxzoom,18);
  assert.throws(()=>validateRegion({...request,provider:'protomaps',maxzoom:18}));
  assert.deepEqual(tileRanges([0,-10,10,0],1)[1],{z:1,left:1,right:1,top:1,bottom:1});
});
test('satellite stores JPEG tiles with TMS rows, attribution and progress; retries invalid images',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'bms-satellite-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  let calls=0;const progress=[];const bytes=Buffer.from([255,216,1,2,255,217]);
  await downloadSatellite(path.join(dir,'test.mbtiles'),request,{wait:async()=>{},progress:p=>progress.push(p),fetchTile:async url=>{assert.match(url,/s2cloudless_3857/);return new Response(++calls===1?'<!doctype html>':bytes);}});
  const db=new DatabaseSync(path.join(dir,'test.mbtiles'));
  try{
    const rows=db.prepare('SELECT * FROM tiles ORDER BY zoom_level').all();assert.equal(rows.length,tileCount(request.bounds,8));
    const r=tileRanges(request.bounds,8)[8];assert.equal(rows.at(-1).tile_row,2**8-1-r.top);
    assert.match(db.prepare("SELECT value FROM metadata WHERE name='attribution'").get().value,/2016.*2017/);
    assert.equal(progress.at(-1).completed,rows.length);assert.equal(progress.at(-1).bytes,rows.length*bytes.length);
  }finally{db.close();}
  await assert.rejects(downloadSatellite(path.join(dir,'bad.mbtiles'),request,{wait:async()=>{},fetchTile:async()=>new Response('<html>failure</html>')}),/JPEG/);
});
test('active packages are independent per provider and survive failed satellite updates and restart',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'bms-satellite-manager-'));let fail=false;
  const options={findSource:async()=>({url:'https://example.test/map',date:'20260922'}),run:async(args,_job,executable)=>{
    if(executable===process.execPath){if(fail)throw Error('offline');await writeFile(args[1],'database');}
    else if(['extract','convert'].includes(args[0]))await writeFile(args[2],'archive');
  }};
  const manager=await createManager(dir,options);t.after(async()=>{await manager.close();await rm(dir,{recursive:true,force:true});});
  await manager.start(initialRegion.id);await until(()=>manager.snapshot().job.status==='complete');await delay(20);
  let state=await manager.add(request);const id=state.regions.at(-1).id;await manager.start(id);await until(()=>manager.snapshot().job.status==='complete');await delay(20);
  state=manager.snapshot();const old=activeRegion(state,satelliteProvider).file;
  assert.equal(activeRegion(state,'protomaps').id,initialRegion.id);assert.equal(activeRegion(state,satelliteProvider).id,id);
  await manager.activate(id);assert.equal(activeRegion(manager.snapshot(),'protomaps').id,initialRegion.id);
  await assert.rejects(manager.start(id,{...request,provider:'protomaps'}),/provider berbeda/);
  fail=true;await manager.start(id);await until(()=>manager.snapshot().job.status==='failed');await delay(20);
  assert.equal(activeRegion(manager.snapshot(),satelliteProvider).file,old);
  const restored=await createManager(dir,options);assert.equal(activeRegion(restored.snapshot(),satelliteProvider).file,old);assert.equal(activeRegion(restored.snapshot(),'protomaps').id,initialRegion.id);await restored.close();
  await manager.remove(initialRegion.id);assert.equal(activeRegion(manager.snapshot(),'protomaps'),undefined);assert.equal(activeRegion(manager.snapshot(),satelliteProvider).file,old);
});

test('PNG ocean tiles normalize to JPEG with correct dimensions',async()=>{
  const {PNG}=await import('pngjs');const {default:jpeg}=await import('jpeg-js');
  const png=new PNG({width:256,height:256});
  for(let i=0;i<png.data.length;i+=4){png.data[i]=24;png.data[i+1]=44;png.data[i+2]=78;png.data[i+3]=255;}
  const normalized=await normalizeSatelliteTile(PNG.sync.write(png));
  assert.equal(normalized[0],255);const decoded=jpeg.decode(normalized);assert.equal(decoded.width,256);assert.equal(decoded.height,256);
  await assert.rejects(normalizeSatelliteTile(PNG.sync.write(new PNG({width:1,height:1}))),/valid/);
});

test('interrupted satellite downloads keep verified tiles and resume without fetching them again',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'bms-satellite-resume-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'resume.mbtiles'),jpeg=Buffer.from([255,216,1,2,255,217]);
  let successful=0;
  await assert.rejects(downloadSatellite(file,request,{wait:async()=>{},fetchTile:async()=>{if(successful++<4)return new Response(jpeg);throw Error('connection lost');}}),/connection lost/);
  const checkpoint=new DatabaseSync(file);const count=checkpoint.prepare('SELECT COUNT(*) AS n FROM tiles').get().n;checkpoint.close();assert.ok(count>=4);
  let fetched=0;
  await downloadSatellite(file,request,{wait:async()=>{},fetchTile:async()=>{fetched++;return new Response(jpeg);}});
  assert.equal(fetched,tileCount(request.bounds,request.maxzoom)-count);
  await downloadSatellite(file,request,{wait:async()=>{},fetchTile:async()=>{assert.fail('complete checkpoint must not fetch again');}});
  let changed=0;
  await downloadSatellite(file,{...request,bounds:[106.82,-6.21,106.83,-6.2]},{wait:async()=>{},fetchTile:async()=>{changed++;return new Response(jpeg);}});assert.ok(changed>0);
});
