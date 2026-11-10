import { displayDate, localDate, type Assessment } from './assessments.ts';
import type { Workout } from './fitness.ts';
export type TrainingPlan={id:string;student_id:string|null;student_name:string;registration:string;instructor:string;title:string;objective:string;target_zone:string;starts_on:string;reviewed_on:string|null;reassess_on:string|null;source_assessment_id:string|null;notes:string;workouts:Workout[];status:'draft'|'published';revision:number;updated_at:string;published_at:string|null};
export type TrainingSummary=Omit<TrainingPlan,'notes'|'workouts'>;
export function trainingLabel(plan:Pick<TrainingPlan,'starts_on'>){return plan.starts_on?`Ficha de ${displayDate(plan.starts_on)}`:'Ficha de treino';}
function compactId(value:string){return value.replace(/[^a-zA-Z0-9]/g,'').slice(0,12)||'item';}
/**
 * Uses a stable id so a published teacher workout can be synchronized more
 * than once without creating duplicate cards in the student's workout list.
 */
export function importedWorkoutId(planId:string, workoutId:string){
  return `teacher-${compactId(planId)}-${compactId(workoutId)}`;
}
export function workoutsFromTrainingPlan(plan:Pick<TrainingPlan,'id'|'workouts'>):Workout[]{
  return plan.workouts.map((workout)=>({
    ...workout,
    id:importedWorkoutId(plan.id,workout.id),
    exercises:workout.exercises.map((exercise)=>({...exercise})),
  }));
}
// Keep the existing RPC contract while generating its required label automatically.
export function trainingForSave(plan:TrainingPlan):TrainingPlan{return {...plan,title:trainingLabel(plan),notes:''};}
export function newTraining(assessment?:Assessment):TrainingPlan {
  const today=localDate();
  return {id:crypto.randomUUID(),student_id:assessment?.student_id||null,student_name:assessment?.student_name||'',registration:assessment?.registration||'',instructor:assessment?.instructor||'',source_assessment_id:assessment?.id||null,title:'',objective:'',target_zone:'',starts_on:today,reviewed_on:null,reassess_on:assessment?.reassess_on&&assessment.reassess_on>=today?assessment.reassess_on:null,notes:'',workouts:[],status:'draft',revision:0,updated_at:'',published_at:null};
}
export function copyTraining(plan:TrainingPlan):TrainingPlan {
  return {...plan,id:crypto.randomUUID(),status:'draft',revision:0,reviewed_on:localDate(),updated_at:'',published_at:null,workouts:plan.workouts.map(w=>({...w,id:crypto.randomUUID(),exercises:w.exercises.map(e=>({...e,id:crypto.randomUUID()}))}))};
}
export function trainingIssues(plan:TrainingPlan,publish=false):string[] {
  const issues:string[]=[];
  const date=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v&&v>='1900-01-01'&&v<='2100-12-31';
  if(!date(plan.starts_on)||(plan.reviewed_on&&!date(plan.reviewed_on))||(plan.reassess_on&&(!date(plan.reassess_on)||plan.reassess_on<plan.starts_on)))issues.push('Confira as datas da ficha e da reavaliação.');
  if(plan.registration&&!/^\d{4}$/.test(plan.registration))issues.push('A matrícula deve ter quatro números.');
  if(publish&&(!plan.student_id||!plan.student_name.trim()||!plan.registration))issues.push('Localize e confirme o aluno.');
  if(publish&&!plan.instructor.trim())issues.push('Preencha o professor responsável.');
  if(plan.workouts.length>12||(publish&&!plan.workouts.length))issues.push('Inclua de 1 a 12 treinos.');
  for(const w of plan.workouts){
    if(!Number.isInteger(w.minutes)||w.minutes<1||w.minutes>240)issues.push('A duração deve estar entre 1 e 240 minutos.');
    if(w.exercises.length>20||(publish&&(!w.title.trim()||!w.exercises.length)))issues.push('Cada treino precisa de título e de 1 a 20 exercícios.');
    for(const e of w.exercises){
      if(!Number.isInteger(e.sets)||e.sets<0||e.sets>20||(publish&&(!e.name.trim()||!e.sets||!e.reps.trim())))issues.push('Preencha nome, séries (1 a 20) e repetições de todos os exercícios.');
      if(e.restSeconds!==undefined&&(!Number.isInteger(e.restSeconds)||e.restSeconds<0||e.restSeconds>3600))issues.push('Confira o descanso em segundos (0 a 3600).');
      if(e.weight!==undefined&&(!Number.isFinite(e.weight)||e.weight<0||e.weight>2000))issues.push('Confira a carga (0 a 2000).');
    }
  }
  return [...new Set(issues)];
}
