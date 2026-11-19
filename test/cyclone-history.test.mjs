import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHistory, atcfId } from '../server/cyclone-history.mjs';
const now = Date.parse('2026-11-18T09:00:00Z');
const header = 'USA_ATCF_ID,ISO_TIME,USA_LAT,USA_LON,USA_WIND,USA_PRES';
test('history matches ATCF seasonal year, not display name', () => {
  assert.equal(atcfId('sh0427'), 'SH042027');
  assert.equal(atcfId('io0526'), 'IO052026');
  assert.equal(atcfId('al012026'), 'AL012026');
  assert.equal(atcfId('../secret'), null);
  assert.equal(atcfId('invest-96s-2026'), null);
});
test('history sorts, deduplicates and excludes future/invalid positions without inventing values', () => {
  const csv = [
    header,
    'units',
    'SH042027,2026-11-17 06:00:00,-9,-165,100,960',
    'SH042027,2026-11-17 00:00:00,-8,-164,,',
    'SH042027,2026-11-17 06:00:00,-9,-165,100,960',
    'SH042027,2026-11-19 00:00:00,-10,-166,110,950',
    'SH042027,2026-11-17 03:00:00,999,-165,100,960',
  ].join('\n');
  const points = parseHistory(csv, now).get('SH042027');
  assert.equal(points.length, 2);
  assert.equal(points[0].windKnots, null);
  assert.equal(points[0].pressureHpa, null);
  assert.equal(points[1].pressureHpa, 960);
  assert.throws(() => parseHistory('invalid', now));
});

 test('invest b-deck uses southern season and only latest observed episode',async()=>{
 const {investDeckId,parseBdeck}=await import('../server/cyclone-observations.mjs');
 assert.equal(investDeckId({id:'invest-96s-2026',time:now}),'sh962027');
 const text=['SH,96,2026111000,,BEST,0,130S,1500E,25,1005',
 'SH,96,2026111718,,BEST,0,062S,0897E,30,1007',
 'SH,96,2026111806,,BEST,0,070S,0887E,25,1007',
 'SH,96,2026111906,,BEST,0,070S,0887E,25,1007',
 'SH,96,2026111806,,AVNO,12,070S,0887E,25,1007'].join('\n');
 const points=parseBdeck(text,'sh962027',now);assert.equal(points.length,2);assert.equal(points[1].lat,-7);assert.equal(points[1].lng,88.7);
 });
