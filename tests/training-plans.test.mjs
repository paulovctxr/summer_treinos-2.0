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
test('training Excel keeps one aligned editable ficha on A4',async()=>{
  const plan=trainingForSave({...newTraining(),student_name:'Aluno Exemplo',title:'Ficha exemplo',notes:'Revisar com o professor',workouts:[{id:'a',title:'Treino A',focus:'Força',minutes:45,exercises:[{id:'e',name:'=1+1',sets:0,reps:'',notes:'Movimento controlado'}]}]});
  const bytes=await trainingWorkbook(plan).xlsx.writeBuffer();const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);const sheet=book.worksheets[0];
  assert.equal(sheet.getCell('A1').value,'SUMMER FIT');assert.equal(sheet.getCell('C1').value,'PROGRAMA SUMMER FIT · RASCUNHO');
  assert.equal(sheet.getCell('G6').value,'TREINO:');assert.equal(sheet.getCell('I6').value,'A');assert.equal(sheet.getCell('A7').value,'EXERCÍCIOS');
  assert.equal(sheet.getCell('A8').value,'=1+1');assert.equal(sheet.getCell('D8').value,'');assert.equal(sheet.getCell('I8').value,'Movimento controlado');
  assert.equal(sheet.getCell('A17').value,' ');assert.equal(sheet.getCell('A17').value.formula,undefined);assert.equal(plan.notes,'');assert.equal(sheet.pageSetup.paperSize,9);assert.equal(sheet.pageSetup.orientation,'portrait');assert.equal(sheet.pageSetup.fitToWidth,1);assert.equal(sheet.pageSetup.fitToHeight,1);assert.equal(book.worksheets.length,1);
});
