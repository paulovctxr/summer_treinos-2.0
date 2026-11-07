import test from 'node:test';
import assert from 'node:assert/strict';
import { newAssessment,assessmentIssues,ASSESSMENT_FIELDS,assessmentFilename } from '../lib/assessments.ts';
test('assessment validates units and publication requirements without inventing missing measurements',()=>{
  const a=newAssessment();
  assert.deepEqual(a.data,{});assert.equal(assessmentIssues(a).length,0);
  assert.ok(assessmentIssues(a,true).length>=3);
  a.data={height:'1.7'};assert.match(assessmentIssues(a).join(' '),/Altura/);
  a.data={height:'170',weight:'65',notes:'Texto do professor'};
  assert.deepEqual(assessmentIssues(a),[]);
  a.registration='0012';assert.match(assessmentFilename(a),/_0012.xlsx$/);
  assert.equal(new Set(ASSESSMENT_FIELDS.map(f=>f.key)).size,ASSESSMENT_FIELDS.length);
});
