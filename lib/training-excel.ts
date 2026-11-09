import ExcelJS from 'exceljs';
import type { TrainingPlan } from './training-plans.ts';
import { TRAINING_COLUMNS, trainingPaperIdentity, trainingExerciseCells } from './training-paper.ts';

const PT_PER_MM=72/25.4;
const HALF_CONTENT=136.5*PT_PER_MM;
const BORDER:Partial<ExcelJS.Borders>={top:{style:'thin',color:{argb:'FF777777'}},bottom:{style:'thin',color:{argb:'FF777777'}},left:{style:'thin',color:{argb:'FF777777'}},right:{style:'thin',color:{argb:'FF777777'}}};
const WIDTHS_MM=[22,23,43.2,15.68,23.52,15.6,4,18,31];
const EXERCISE_RANGES=[[1,3],[4,4],[5,5],[6,7],[8,9]];
type PaperRow={values:string[];height:number};
// Conservative line estimates reserve enough space for wrapped text in Excel/LibreOffice.
function lines(value:string,widthMm:number,font=8){
  const capacity=Math.max(1,Math.floor((widthMm*PT_PER_MM-6)/(font*.57)));
  return value.split('\n').flatMap(line=>line?Array.from({length:Math.ceil(line.length/capacity)},(_,i)=>line.slice(i*capacity,(i+1)*capacity)):['']);
}
export function trainingWorkbook(plan:TrainingPlan,options:{logoBase64?:string}={}){
  const book=new ExcelJS.Workbook();book.creator='Summer Fit';book.title='Fichas de treino · meia folha A4';book.calcProperties.fullCalcOnLoad=true;
  const logo=options.logoBase64?book.addImage({base64:options.logoBase64,extension:'jpeg'}):null;
  const identity=trainingPaperIdentity(plan);
  const identityHeights=identity.map(values=>Math.max(15,...values.map((v,i)=>lines(v,[22,121,22,31][i],i%2?8:7).length*10+4)));
  const ranges=EXERCISE_RANGES;
  const widths=[88.2,15.68,23.52,19.6,49];
  for(const [wi,w] of plan.workouts.entries()){
    const workoutName=w.title+(w.focus?' · '+w.focus:'');
    const workoutHeight=Math.max(18,lines(workoutName,196).length*10+4);
    const headerHeight=34+identityHeights.reduce((a,b)=>a+b,0)+workoutHeight+6+20;
    const bodyBudget=HALF_CONTENT-headerHeight-16;
    const maxLines=Math.floor((bodyBudget-4)/10);
    if(maxLines<1)throw new Error('Reduza os dados de identificação para caber na ficha.');
    const rows:PaperRow[]=[];
    for(const exercise of w.exercises){
      const values=trainingExerciseCells(exercise);
      const wrapped=values.map((v,i)=>lines(v,widths[i]));
      const count=Math.max(...wrapped.map(v=>v.length));
      // Unusually long multiline exercise notes continue on the next card without truncation.
      for(let offset=0;offset<count;offset+=maxLines){
        const part=count>maxLines?wrapped.map(v=>v.slice(offset,offset+maxLines).join('\n')):values;
        rows.push({values:part,height:Math.max(18,Math.min(maxLines,count-offset)*10+4)});
      }
    }
    const pages:PaperRow[][]=[[]];let used=0;
    for(const row of rows){if(used+row.height>bodyBudget&&pages.at(-1)!.length){pages.push([]);used=0;}pages.at(-1)!.push(row);used+=row.height;}
    for(const [pi,pageRows] of pages.entries()){
      const sheet=book.addWorksheet('Treino '+(wi+1)+(pages.length>1?' - '+(pi+1):''),{
        views:[{state:'normal',style:'pageLayout',showGridLines:false,zoomScale:95}],
        pageSetup:{paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:1,horizontalCentered:true,
          margins:{left:7/25.4,right:7/25.4,top:6/25.4,bottom:6/25.4,header:0,footer:0}},
      });
      sheet.columns=WIDTHS_MM.map(mm=>({width:(mm*96/25.4-5)/7}));
      const bodyRows=[...pageRows];let bodyHeight=bodyRows.reduce((sum,row)=>sum+row.height,0);
      for(let i=0;i<3&&bodyHeight+18<=bodyBudget;i++){bodyRows.push({values:['','','','',''],height:18});bodyHeight+=18;}
      let row=1;
      function half(sourceStart?:number){
        const start=row;let usedHeight=0;
        function height(points:number){sheet.getRow(row).height=points;usedHeight+=points;row++;}
        function cell(from:number,to:number,value:string,size=8,bold=false,fill='FFFFFFFF',alignment:'left'|'center'='left',border=true){
          if(to>from)sheet.mergeCells(row,from,row,to);
          const c=sheet.getCell(row,from);
          if(sourceStart!==undefined){const source=sheet.getCell(sourceStart+row-start,from).address;c.value={formula:'IF('+source+'="","",'+source+')',result:value};}
          else c.value=value;
          c.font={name:'Arial',size,bold,color:{argb:'FF111111'}};
          c.alignment={vertical:'middle',horizontal:alignment,wrapText:true,indent:alignment==='left'?1:0};
          c.fill={type:'pattern',pattern:'solid',fgColor:{argb:fill}};
          if(border)c.border=BORDER;
          return c;
        }
        cell(1,2,logo===null?'SUMMER FIT':'',12,true);
        cell(3,9,'PROGRAMA SUMMER FIT'+(plan.status==='draft'?' · RASCUNHO':''),12,true,'FFFFFFFF','center');
        if(logo!==null)sheet.addImage(logo,{tl:{col:.08,row:row-1+.1} as ExcelJS.Anchor,br:{col:1.8,row:row-1+.93} as ExcelJS.Anchor,editAs:'oneCell'});
        height(34);
        for(const [i,values] of identity.entries()){cell(1,1,values[0],7,true);cell(2,6,values[1]);cell(7,8,values[2],7,true);cell(9,9,values[3]);height(identityHeights[i]);}
        cell(1,9,workoutName,8,true,'FFEEEEEE');height(workoutHeight);
        height(6);
        TRAINING_COLUMNS.forEach((name,i)=>cell(ranges[i][0],ranges[i][1],name,7,true,'FFEEEEEE','center'));height(20);
        for(const r of bodyRows){r.values.forEach((v,i)=>cell(ranges[i][0],ranges[i][1],v,8,false,'FFFFFFFF',i>0&&i<4?'center':'left'));height(r.height);}
        height(Math.max(1,HALF_CONTENT-usedHeight-10));
        cell(1,7,'Siga as orientações do professor · Summer Fit',6.5,false,'FFFFFFFF','left',false);
        cell(8,9,(pi+1)+' / '+pages.length,6.5,false,'FFFFFFFF','center',false);height(10);
        return start;
      }
      const first=half();
      sheet.getRow(row).height=6*PT_PER_MM;
      for(let c=1;c<=9;c++)sheet.getCell(row,c).border={bottom:{style:'dashed',color:{argb:'FF999999'}}};
      row++;sheet.getRow(row++).height=6*PT_PER_MM;
      half(first);sheet.pageSetup.printArea='A1:I'+(row-1);
      sheet.getCell('A1').note='Edite a primeira via. A segunda via acompanha as alterações por fórmulas. As duas cabem na mesma folha A4.';
    }
  }
  if(!book.worksheets.length)book.addWorksheet('Ficha').addRow(['Ficha sem exercícios']);
  return book;
}
export async function createTrainingExcelFile(plan:TrainingPlan){
  let logoBase64:string|undefined;
  try{const response=await fetch('/summer-fit-brand.jpeg',{signal:AbortSignal.timeout(5000)});if(response.ok){const blob=await response.blob();logoBase64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob);});}}catch{/* The academy name remains available without the logo. */}
  const bytes=await trainingWorkbook(plan,{logoBase64}).xlsx.writeBuffer();
  return {blob:new Blob([new Uint8Array(bytes)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),filename:'Treino_'+(plan.registration||'rascunho')+'.xlsx'};
}
