import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rename,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createManager} from '../manager.mjs';
const until=async predicate=>{for(let i=0;i<600;i++){if(predicate())return;await delay(10);}assert.fail('timeout');};
const input={name:'City',bounds:[107.61,-6.92,107.62,-6.91],maxzoom:18,provider:'eox-satellite'};
const success={run:async(args,_job,executable)=>{if(executable===process.execPath)await writeFile(args[1],'checkpoint');else if(args[0]==='convert')await writeFile(args[2],'archive');}};
test('queued city packages run sequentially and survive a service restart',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'bms-map-queue-'));let manager=await createManager(dir,success);t.after(async()=>{await manager.close();await rm(dir,{recursive:true,force:true});});
 const first=(await manager.add(input)).regions.at(-1).id,second=(await manager.add({...input,name:'Second'})).regions.at(-1).id;
 await manager.enqueue([first,second,first]);assert.equal(manager.snapshot().queue.length,2);
 await manager.close();manager=await createManager(dir,success);
 await until(()=>manager.snapshot().regions.filter(r=>r.file).length===2);assert.equal(manager.snapshot().queue.length,0);assert.equal(manager.snapshot().job.status,'complete');
 const stored=JSON.parse(await readFile(path.join(dir,'regions.json'),'utf8'));assert.equal(stored.regions.filter(r=>r.file).length,2);
});
test('cancel clears pending queue; invalid batch does not partially enqueue',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'bms-map-queue-'));const manager=await createManager(dir,success);t.after(async()=>{await manager.close();await rm(dir,{recursive:true,force:true});});
 const id=(await manager.add(input)).regions.at(-1).id;
 await assert.rejects(manager.enqueue([id,'missing']),error=>error.status===404);assert.equal(manager.snapshot().queue.length,0);
 await manager.enqueue([id]);await manager.cancel();await delay(1100);assert.equal(manager.snapshot().queue.length,0);assert.equal(manager.snapshot().job,null);
});
test('a queued download interrupted by shutdown is restored at the front',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'bms-map-queue-'));let release;
 let manager=await createManager(dir,{run:async(args,job,executable)=>{if(executable===process.execPath)await new Promise(resolve=>{release=resolve;});if(job.cancelled)throw Error('cancelled');}});
 t.after(async()=>{release?.();await manager.close();await rm(dir,{recursive:true,force:true});});
 const id=(await manager.add(input)).regions.at(-1).id;await manager.enqueue([id]);await until(()=>Boolean(release));
 const closing=manager.close();release();await closing;assert.equal(manager.snapshot().queue[0].regionId,id);
 manager=await createManager(dir,success);await until(()=>manager.snapshot().job?.status==='complete');assert.equal(manager.snapshot().regions.at(-1).id,id);assert.ok(manager.snapshot().regions.at(-1).file);
});

test('publication stays checking until its manifest is saved, and concurrent edits survive', {timeout:10000}, async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'bms-map-commit-'));let release,notify;
 const held=new Promise(resolve=>{notify=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 const manager=await createManager(dir,{...success,writeManifest:async(file,json)=>{
   if(JSON.parse(json).job?.status==='complete'){notify();await gate;}
   await writeFile(file+'.tmp',json);await rename(file+'.tmp',file);
 }});
 t.after(async()=>{release();await manager.close();await rm(dir,{recursive:true,force:true});});
 const id=(await manager.add(input)).regions.at(-1).id;
 await manager.start(id);await held;
 assert.equal(manager.snapshot().job.status,'checking');
 assert.equal(manager.snapshot().regions.find(r=>r.id===id).file,undefined);
 const storedBefore=JSON.parse(await readFile(path.join(dir,'regions.json'),'utf8'));
 assert.equal(storedBefore.regions.find(r=>r.id===id).file,undefined);
 const edit=manager.add({...input,name:'Added during commit'});
 release();await edit;await until(()=>manager.snapshot().job.status==='complete');
 const stored=JSON.parse(await readFile(path.join(dir,'regions.json'),'utf8'));
 assert.ok(stored.regions.find(r=>r.id===id).file);
 assert.ok(stored.regions.some(r=>r.name==='Added during commit'));
 assert.equal(stored.job.status,'complete');
});

test('failed publication never exposes a complete job or replaces the previous package', {timeout:10000}, async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'bms-map-commit-fail-'));let fail=false,previous;
 const manager=await createManager(dir,{...success,writeManifest:async(file,json)=>{
   const draft=JSON.parse(json);
   if(fail&&draft.job?.status==='complete'&&draft.regions.find(r=>r.id===draft.job.regionId)?.file!==previous)throw Error('fixture disk write failure');
   await writeFile(file+'.tmp',json);await rename(file+'.tmp',file);
 }});
 t.after(async()=>{await manager.close();await rm(dir,{recursive:true,force:true});});
 const id=(await manager.add(input)).regions.at(-1).id;
 await manager.enqueue([id]);await until(()=>manager.snapshot().job?.status==='complete');
 previous=manager.snapshot().regions.find(r=>r.id===id).file;
 fail=true;await manager.enqueue([id]);await until(()=>manager.snapshot().job.status==='failed');
 assert.equal(manager.snapshot().regions.find(r=>r.id===id).file,previous);
 await manager.close();
 const stored=JSON.parse(await readFile(path.join(dir,'regions.json'),'utf8'));
 assert.equal(stored.regions.find(r=>r.id===id).file,previous);
 assert.equal(stored.job.status,'failed');
 assert.equal(stored.queue[0].regionId,id);
 assert.equal(await readFile(manager.safeFile(previous),'utf8'),'archive');
});
