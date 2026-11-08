export type AssessmentField = { key: string; label: string; unit?: string; min?: number; max?: number; type?: 'text' | 'date' | 'number' };
export type AssessmentSection = { title: string; fields: AssessmentField[] };
const number = (key: string, label: string, unit: string, min: number, max: number): AssessmentField => ({ key, label, unit, min, max, type: 'number' });
const text = (key: string, label: string): AssessmentField => ({ key, label, type: 'text' });

export const ASSESSMENT_SECTIONS: AssessmentSection[] = [
  { title: 'Histórico e objetivos', fields: [
    { key: 'birth_date', label: 'Data de nascimento', type: 'date' },
    text('injuries', 'Fraturas, entorses, doenças e datas'), text('medication', 'Medicamentos e tempo de uso'),
    text('smoking', 'Tabagismo'), number('sleep', 'Horas de sono por noite', 'h', 0, 24), text('work_routine', 'Rotina de trabalho'),
    text('diet', 'Dieta e acompanhamento'), text('activity_history', 'Histórico de atividade física'), text('inactive_time', 'Tempo sem atividade física'),
    text('goals', 'Objetivos do aluno'), text('frequency', 'Disponibilidade semanal'),
  ] },
  { title: 'Medidas e composição corporal', fields: [
    number('weight', 'Peso', 'kg', 15, 400), number('height', 'Altura', 'cm', 50, 250),
    number('skinfold_chest', 'Dobra do tórax', 'mm', 1, 100), number('skinfold_abdomen', 'Dobra abdominal', 'mm', 1, 100),
    number('skinfold_thigh', 'Dobra da coxa', 'mm', 1, 100), number('skinfold_triceps', 'Dobra tricipital', 'mm', 1, 100),
    number('skinfold_suprailiac', 'Dobra supra-ilíaca', 'mm', 1, 100),
    text('body_protocol', 'Protocolo utilizado para composição corporal'),
    number('body_fat', 'Gordura corporal informada pelo professor', '%', 1, 75), number('target_fat', 'Meta de gordura corporal', '%', 1, 75),
    number('fat_mass', 'Massa de gordura informada', 'kg', 0, 300), number('lean_mass', 'Massa magra informada', 'kg', 1, 250),
    number('target_weight', 'Meta de peso definida pelo professor', 'kg', 15, 400),
  ] },
  { title: 'Circunferências', fields: [
    number('chest', 'Tórax', 'cm', 10, 250), number('abdomen', 'Abdome', 'cm', 10, 250), number('hip', 'Quadril', 'cm', 10, 250),
    ...[['arm','Braço'], ['forearm','Antebraço'], ['upper_thigh','Coxa superior'], ['mid_thigh','Coxa média'], ['lower_thigh','Coxa inferior'], ['calf','Perna']].flatMap(([key,label]) => [
      number(`${key}_right`, `${label} direito(a)`, 'cm', 5, 150), number(`${key}_left`, `${label} esquerdo(a)`, 'cm', 5, 150),
    ]),
  ] },
  { title: 'Análise postural', fields: [text('posture_front','Vista anterior'), text('posture_side','Vista lateral'), text('posture_back','Vista posterior'), text('posture_notes','Observações posturais')] },
  { title: 'Avaliação cardiovascular', fields: [
    number('systolic','Pressão sistólica em repouso','mmHg',50,260), number('diastolic','Pressão diastólica em repouso','mmHg',30,180),
    number('resting_hr','Frequência cardíaca em repouso','bpm',25,240), text('aerobic_protocol','Teste / protocolo aeróbico utilizado'),
    number('penultimate_hr','FC no penúltimo minuto','bpm',25,240), number('last_hr','FC no último minuto','bpm',25,240),
    number('post_systolic','Pressão sistólica após o teste','mmHg',50,260), number('post_diastolic','Pressão diastólica após o teste','mmHg',30,180),
    number('load_watts','Carga utilizada','W',1,1000), number('effort','Percepção de esforço (Borg 6–20)','',6,20),
    number('vo2','VO₂ máximo informado pelo professor','ml/kg/min',1,120), text('aerobic_guidance','Orientações para treinamento aeróbico'),
  ] },
  { title: 'Orientações do professor', fields: [text('training','Sugestão de treino'), text('notes','Observações e recomendações')] },
];
export const ASSESSMENT_FIELDS = ASSESSMENT_SECTIONS.flatMap(section => section.fields);
export type AssessmentData = Record<string, string>;
export type Assessment = {
  id: string; student_id: string | null; student_name: string; registration: string; instructor: string;
  assessed_on: string; reassess_on: string | null; model: 'HOMENS' | 'MULHERES'; data: AssessmentData;
  status: 'draft' | 'published'; revision: number; updated_at: string; published_at: string | null;
  viewed_at?: string | null;
};
export type AssessmentSummary = Omit<Assessment, 'data'>;
export type AssessmentStudent = { id: string; name: string; registration: string };
export function localDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function newAssessment(): Assessment {
  return { id: crypto.randomUUID(), student_id: null, student_name: '', registration: '', instructor: '', assessed_on: localDate(), reassess_on: null,
    model: 'HOMENS', data: {}, status: 'draft', revision: 0, updated_at: '', published_at: null };
}
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
}
export function assessmentIssues(a: Assessment, publishing = false): string[] {
  const errors: string[] = [];
  if (!validDate(a.assessed_on) || a.assessed_on > localDate() || a.assessed_on < '1900-01-01') errors.push('Informe uma data de avaliação válida, até hoje.');
  if (a.reassess_on && (!validDate(a.reassess_on) || a.reassess_on < a.assessed_on)) errors.push('A reavaliação deve ser uma data válida, posterior ou igual à avaliação.');
  if (a.registration && !/^\d{4}$/.test(a.registration)) errors.push('A matrícula deve ter quatro números.');
  if (publishing) {
    if (!a.student_id) errors.push('Localize e confirme o aluno pela matrícula.');
    if (!a.student_name.trim() || !a.instructor.trim()) errors.push('Preencha o nome do aluno e o professor responsável.');
    if (!Object.values(a.data).some(v => v.trim())) errors.push('Preencha ao menos um campo da avaliação.');
  }
  for (const f of ASSESSMENT_FIELDS) {
    const value = a.data[f.key];
    if (!value) continue;
    if (value.length > 2000) errors.push(`${f.label}: use até 2.000 caracteres.`);
    if (f.type === 'number' && (!/^[0-9]+([.][0-9]+)?$/.test(value) || !Number.isFinite(Number(value)) || Number(value) < f.min! || Number(value) > f.max!)) errors.push(`${f.label}: informe entre ${f.min} e ${f.max} ${f.unit}.`);
    if (f.type === 'date' && (!validDate(value) || value > a.assessed_on || value < '1900-01-01')) errors.push(`${f.label}: confira a data.`);
  }
  return errors;
}
export function displayDate(value: string | null) {
  return value ? value.slice(0,10).split('-').reverse().join('/') : 'Não informada';
}
export function assessmentFilename(a: Assessment) {
  return `${a.assessed_on}_Avaliacao_${a.registration || 'rascunho'}.xlsx`;
}
