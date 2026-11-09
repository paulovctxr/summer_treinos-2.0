import { displayDate } from './assessments.ts';
import type { Exercise } from './fitness.ts';
import type { TrainingPlan } from './training-plans.ts';

export const TRAINING_COLUMNS=['EXERCÍCIOS','SÉRIES','REPET. / TEMPO','CARGA','OBSERVAÇÃO'];
export function trainingPaperIdentity(plan:TrainingPlan){
  const date=(value:string|null)=>value?displayDate(value):'';
  return [
    ['NOME',plan.student_name||'','MATRÍCULA',plan.registration||''],
    ['PROFESSOR',plan.instructor||'','DATA',date(plan.starts_on)],
    ['OBJETIVO',plan.objective||'','REVISÃO',date(plan.reviewed_on)],
    ['ZONA ALVO',plan.target_zone||'','REAVALIAÇÃO',date(plan.reassess_on)],
  ];
}
export function trainingExerciseCells(e:Exercise):string[]{
  return [e.name||'Exercício não informado',e.sets?`${e.sets}x`:'',e.reps,e.weight===undefined?'':`${e.weight} ${e.weightUnit||'kg'}`,
    [e.restSeconds!==undefined?`Descanso: ${e.restSeconds}s`:'',e.notes||''].filter(Boolean).join('\n')];
}
