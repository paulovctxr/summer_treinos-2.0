import test from 'node:test';
import assert from 'node:assert/strict';
import {assessmentFolders,allAssessmentSummaries,instructorKey} from '../lib/assessment-folders.ts';

test('professor folders group spelling variants and retain unassigned drafts',()=>{
  const rows=[{instructor:'  João   Silva ',status:'draft'},{instructor:'JOAO SILVA',status:'published'},{instructor:'Maria Lima',status:'draft'},{instructor:'',status:'draft'}];
  const folders=assessmentFolders(rows);
  assert.equal(folders.length,3);assert.equal(folders[0].name,'João Silva');
  assert.equal(folders[0].total,2);assert.equal(folders[0].drafts,1);assert.equal(folders[0].published,1);
  assert.equal(folders.at(-1).key,'');assert.equal(instructorKey(' MARIA   Lima '),'maria lima');
});
test('folders include professors beyond the first API page and reject partial results on failure',async()=>{
  const rows=Array.from({length:65},(_,i)=>({id:String(i),instructor:i<60?'Carlos':'Professora da última página',status:'draft'}));
  const offsets=[];
  const all=await allAssessmentSummaries(async offset=>{offsets.push(offset);return rows.slice(offset,offset+30);},()=>true);
  assert.deepEqual(offsets,[0,30,60]);assert.equal(all.length,65);assert.equal(assessmentFolders(all).length,2);
  await assert.rejects(()=>allAssessmentSummaries(async offset=>{if(offset)throw new Error('network');return rows.slice(0,30);},()=>true),/network/);
  assert.deepEqual(await allAssessmentSummaries(async()=>{throw new Error('must not fetch');},()=>false),[]);
});
