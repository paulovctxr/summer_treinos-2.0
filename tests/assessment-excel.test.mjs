import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { assessmentWorkbook } from '../lib/assessment-excel.ts';
import { newAssessment, ASSESSMENT_FIELDS } from '../lib/assessments.ts';

function cellWith(sheet,text){let found;sheet.eachRow(row=>row.eachCell(cell=>{if(!cell.isMerged||cell.address===cell.master.address)if(cell.value===text)found=cell;}));return found;}
const data={weight:'65.5',height:'170',skinfold_triceps:'18',skinfold_suprailiac:'13',skinfold_thigh:'27',notes:'=HYPERLINK("https://example.test","texto")'};
const example=()=>({...newAssessment(),model:'MULHERES',student_name:'Aluno fictício',registration:'0012',instructor:'Professor Teste',data});

test('Excel keeps the original model tabs, section order and paired measurements, without leaking data to the blank template',async()=>{
  const logoBase64='data:image/jpeg;base64,'+(await readFile(new URL('../public/summer-fit-brand.jpeg',import.meta.url))).toString('base64');
  const bytes=await(await assessmentWorkbook(example(),{logoBase64})).xlsx.writeBuffer();
  assert.equal(Buffer.from(bytes).subarray(0,2).toString(),'PK');
  const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);
  assert.deepEqual(book.worksheets.map(s=>s.name),['HOMENS','MULHERES']);assert.equal(book.views[0].activeTab,1);
  const sheet=book.getWorksheet('MULHERES'),blank=book.getWorksheet('HOMENS');
  const sections=['01  DADOS CADASTRAIS','02  ANAMNESE','03  ANÁLISE POSTURAL','04  VALORES ANTROPOMÉTRICOS','05  AVALIAÇÃO FUNCIONAL — RESUMO'];
  const rows=sections.map(title=>cellWith(sheet,title).row);assert.deepEqual(rows,[...rows].sort((a,b)=>a-b));
  assert.equal(cellWith(sheet,'AVALIAÇÃO CARDIOVASCULAR'),undefined);assert.equal(cellWith(sheet,'CONSUMO MÁXIMO DE OXIGÊNIO (VO₂ MÁX.)'),undefined);
  assert.ok(cellWith(sheet,'0012'));assert.ok(cellWith(sheet,'Aluno fictício'));
  assert.equal(cellWith(blank,'Aluno fictício'),undefined);assert.equal(cellWith(blank,'Professor Teste'),undefined);assert.equal(cellWith(blank,'0012'),undefined);
  const anthropometry=rows[3];assert.equal(sheet.getCell(anthropometry+2,5).value,65.5);
  assert.equal(sheet.getCell(anthropometry+3,5).value,170);assert.equal(sheet.getCell(anthropometry+3,11).value,null);
  const sum=cellWith(sheet,'Soma das 3 dobras (mm)');assert.equal(sheet.getCell(sum.row,5).value.result,58);
  const blankSum=cellWith(blank,'Soma das 3 dobras (mm)');assert.notEqual(blank.getCell(blankSum.row,5).value?.result,0);
  const malicious=cellWith(sheet,data.notes);assert.equal(malicious.type,ExcelJS.ValueType.String);
  sheet.eachRow(r=>r.eachCell(c=>{if(c.type===ExcelJS.ValueType.Formula)assert.match(c.value.formula,/^IF\(/);}));
  assert.equal(sheet.pageSetup.fitToWidth,1);assert.match(sheet.pageSetup.printArea,/A1:L\d+/);
  // ExcelJS serializes page breaks but does not restore them on load; inspect the actual XLSX XML.
  const JSZip=createRequire(import.meta.resolve('exceljs'))('jszip');
  const zip=await JSZip.loadAsync(bytes);const xml=await zip.file('xl/worksheets/sheet2.xml').async('string');
  assert.match(xml,/<rowBreaks count="4"/);
  const drawing=await zip.file('xl/drawings/drawing1.xml').async('string');
  assert.match(drawing,/<xdr:twoCellAnchor editAs="oneCell">/);
  assert.doesNotMatch(drawing,/<xdr:oneCellAnchor editAs=/);
  assert.equal(sheet.views[0].showGridLines,false);
});

test('male/female skinfold sources differ, and every supplied field survives export including long notes',async()=>{
  for(const model of ['HOMENS','MULHERES']){
    const a={...example(),model,data:Object.fromEntries(ASSESSMENT_FIELDS.map(f=>[f.key,f.type==='number'?String(f.min+1):f.type==='date'?'2000-01-01':`${f.key}: exemplo`]))};
    a.data.notes='Observação longa. '.repeat(110);a.data.skinfold_chest='10';a.data.skinfold_abdomen='20';a.data.skinfold_thigh='30';a.data.skinfold_triceps='15';a.data.skinfold_suprailiac='25';
    const book=await assessmentWorkbook(a);const sheet=book.getWorksheet(model);
    const sum=cellWith(sheet,'Soma das 3 dobras (mm)');assert.equal(sheet.getCell(sum.row,5).value.result,model==='HOMENS'?60:70);
    let values='';sheet.eachRow(r=>{assert.ok(r.height<=409);r.eachCell(c=>{if(c.address===c.master.address&&typeof c.value==='string')values+=c.value;});});
    assert.ok(values.includes(a.data.notes));
    for(const f of ASSESSMENT_FIELDS.filter(f=>f.type==='text'&&f.key!=='notes'))assert.ok(values.includes(a.data[f.key]),f.key);
    assert.ok([...sheet.model.merges].length>30);
  }
});
