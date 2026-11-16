import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {daylightWeight,blendSatellite} from '../server/satellite-composite.mjs';
test('day/night selection follows observation time and location',()=>{
 const time=Date.parse('2026-03-20T12:00:00Z');assert.equal(daylightWeight(time,0,0),1);assert.equal(daylightWeight(time,180,0),0);
 assert.equal(daylightWeight(time+12*3600000,0,0),0);
 for(const longitude of [-90,-85,-80])assert.ok(daylightWeight(time,longitude,0)>=0&&daylightWeight(time,longitude,0)<=1);
});
test('satellite composite uses visible daytime and infrared nighttime, rejects wrong dimensions',async()=>{
 const make=value=>sharp({create:{width:256,height:256,channels:3,background:{r:value,g:value,b:value}}}).jpeg().toBuffer();
 const vis=await make(220),ir=await make(40),time=Date.parse('2026-03-20T12:00:00Z');
 const pixel=async buffer=>(await sharp(buffer).raw().toBuffer())[0];
 assert.ok(await pixel(await blendSatellite(vis,ir,time,5,16,16))>210);
 assert.ok(await pixel(await blendSatellite(vis,ir,time,5,0,16))<50);
 await assert.rejects(()=>blendSatellite(Buffer.from('bad'),ir,time,5,0,16));
});
