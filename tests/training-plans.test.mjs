import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {newTraining,copyTraining,trainingForSave,trainingIssues} from '../lib/training-plans.ts';
import {trainingWorkbook} from '../lib/training-excel.ts';
test('training links only identification, requires explicit prescription, and copies without shared IDs',()=>{
  const plan=newTraining({id:'assessment',student_id:'student',student_name:'Aluno Teste',registration:'1234',instructor:'Professora Teste',data:{injuries:'Private health detail'}});
  assert.equal(plan.source_assessment_id,'assessment');assert.equal(plan.student_id,'student');assert.equal(plan.notes,'');assert.deepEqual(plan.workouts,[]);
  plan.title='Ficha A';plan.workouts=[{id:'a',title:'Treino A',focus:'',minutes:45,exercises:[{id:'e',name:'Supino reto',sets:0,reps:''}]}];
  assert.deepEqual(trainingIssues(plan),[]);assert.match(trainingIssues(plan,true).join(' '),/séries/);
  plan.workouts[0].exercises[0].sets=3;plan.workouts[0].exercises[0].reps='10–12';assert.deepEqual(trainingIssues(plan,true),[]);
  const copy=copyTraining({...plan,status:'published',revision:2});assert.notEqual(copy.id,plan.id);assert.equal(copy.revision,0);assert.equal(copy.status,'draft');assert.notEqual(copy.workouts[0].id,plan.workouts[0].id);assert.notEqual(copy.workouts[0].exercises[0].id,plan.workouts[0].exercises[0].id);
  copy.workouts[0].exercises[0].name='Mudou';assert.equal(plan.workouts[0].exercises[0].name,'Supino reto');
});
test('training Excel keeps literal input, exercise notes, blanks and linked copies on A4',async()=>{
  const plan=trainingForSave({...newTraining(),student_name:'Aluno Exemplo',title:'Ficha exemplo',notes:'Revisar com o professor',workouts:[{id:'a',title:'Treino A',focus:'Força',minutes:45,exercises:[{id:'e',name:'=1+1',sets:0,reps:'',notes:'Movimento controlado'}]}]});
  const bytes=await trainingWorkbook(plan).xlsx.writeBuffer();const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);const sheet=book.worksheets[0];
  assert.equal(sheet.getCell('A1').value,'SUMMER FIT');assert.equal(sheet.getCell('C1').value,'PROGRAMA SUMMER FIT · RASCUNHO');
  assert.equal(sheet.getCell('A6').value,'Treino A · Força');assert.equal(sheet.getCell('A8').value,'EXERCÍCIOS');
  assert.equal(sheet.getCell('A9').value,'=1+1');assert.equal(sheet.getCell('D9').value,'');assert.equal(sheet.getCell('I9').value,'Movimento controlado');
  assert.equal(sheet.getCell('A17').value.formula,'IF(A1="","",A1)');assert.equal(sheet.getCell('A17').value.result,'SUMMER FIT');
  assert.equal(plan.notes,'');assert.equal(sheet.pageSetup.paperSize,9);assert.equal(sheet.pageSetup.orientation,'portrait');assert.equal(sheet.pageSetup.fitToWidth,1);assert.equal(sheet.pageSetup.fitToHeight,1);
});
