import ExcelJS from 'exceljs';
import type { TrainingPlan } from './training-plans.ts';
import { displayDate } from './assessments.ts';
export function trainingWorkbook(plan:TrainingPlan){
  const book=new ExcelJS.Workbook();book.creator='Summer Fit';
  for(const [index,w] of plan.workouts.entries()){
    const sheet=book.addWorksheet(`Treino ${index+1}`);sheet.columns=[{width:38},{width:10},{width:16},{width:14},{width:16},{width:48}];
    sheet.addRow(['SUMMER FIT · FICHA DE TREINO']);sheet.mergeCells('A1:F1');
    sheet.addRow([plan.title]);sheet.mergeCells('A2:F2');
    sheet.addRow([`Aluno: ${plan.student_name} · Matrícula: ${plan.registration}`]);sheet.mergeCells('A3:F3');
    sheet.addRow([`Professor: ${plan.instructor} · ${plan.status==='draft'?'RASCUNHO':'PUBLICADA'}`]);sheet.mergeCells('A4:F4');
    sheet.addRow([`Objetivo: ${plan.objective||''}`]);sheet.mergeCells('A5:F5');
    sheet.addRow([`Zona alvo: ${plan.target_zone||''}`]);sheet.mergeCells('A6:F6');
    sheet.addRow([`Data: ${plan.starts_on?displayDate(plan.starts_on):''} · Revisão: ${plan.reviewed_on?displayDate(plan.reviewed_on):''} · Reavaliação: ${plan.reassess_on?displayDate(plan.reassess_on):''}`]);sheet.mergeCells('A7:F7');
    sheet.addRow([`${w.title} · ${w.focus} · ${w.minutes} min`]);sheet.mergeCells('A8:F8');
    sheet.addRow(['Exercício','Séries','Repetições / tempo','Carga','Descanso (s)','Observações']);
    for(const e of w.exercises)sheet.addRow([e.name,e.sets||'',e.reps,e.weight===undefined?'':`${e.weight} ${e.weightUnit||'kg'}`,e.restSeconds??'',e.notes||'']);
    const note=sheet.addRow([plan.notes]);sheet.mergeCells(note.number,1,note.number,6);
    sheet.eachRow(row=>row.eachCell(cell=>{cell.alignment={vertical:'middle',wrapText:true};cell.font={name:'Arial',size:11};cell.border={bottom:{style:'hair',color:{argb:'FFE4E4DD'}}};}));
    for(const n of [1,9]){const row=sheet.getRow(n);row.height=28;row.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFE889'}};c.font={name:'Arial',size:11,bold:true};});}
    sheet.eachRow(row=>{if(row.number>=10)row.height=Math.max(25,Math.ceil(String(row.getCell(6).value||'').length/42)*16);});
    note.height=Math.max(28,Math.ceil(plan.notes.length/120)*16);
    sheet.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:9'};
    sheet.views=[{state:'frozen',ySplit:9}];
  }
  if(!book.worksheets.length)book.addWorksheet('Ficha').addRow(['Ficha sem exercícios']);
  return book;
}
export async function downloadTrainingExcel(plan:TrainingPlan){
  const bytes=await trainingWorkbook(plan).xlsx.writeBuffer();const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const a=document.createElement('a');a.href=url;a.download=`Treino_${plan.registration||'rascunho'}.xlsx`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
