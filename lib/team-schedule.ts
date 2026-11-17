export type ScheduleStatus = 'scheduled' | 'attended' | 'missed' | 'cancelled';
export type ScheduleActivity = 'assessment' | 'training_setup' | 'training_guidance' | 'other';

export type ScheduleEntry = {
  id: string;
  scheduled_on: string;
  scheduled_time: string;
  student_id: string | null;
  student_name: string;
  registration: string;
  instructor: string;
  activity: ScheduleActivity;
  notes: string;
  status: ScheduleStatus;
  revision: number;
  updated_at: string;
};

export type MovementCount = {
  counted_on: string;
  counted_hour: number;
  people_count: number;
  revision: number;
  updated_at: string;
};

export const ACTIVITY_LABELS: Record<ScheduleActivity, string> = {
  assessment: 'Avaliação',
  training_setup: 'Montar treino',
  training_guidance: 'Passar treino',
  other: 'Outro',
};

export const STATUS_LABELS: Record<ScheduleStatus, string> = {
  scheduled: 'Agendado',
  attended: 'Compareceu',
  missed: 'Faltou',
  cancelled: 'Cancelado',
};

export const MOVEMENT_HOURS = Array.from({ length: 16 }, (_, index) => index + 6);

export function dateInSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weekStart(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  const day = date.getUTCDay();
  return addDays(value, day === 0 ? -6 : 1 - day);
}

export function weekDates(start: string) {
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function displayScheduleDate(value: string, includeYear = false) {
  const date = new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit',
    ...(includeYear ? { year: 'numeric' as const } : {}),
  }).format(date).replace('.', '');
}

export function newScheduleEntry(date = dateInSaoPaulo()): ScheduleEntry {
  return {
    id: crypto.randomUUID(), scheduled_on: date, scheduled_time: '08:00', student_id: null,
    student_name: '', registration: '', instructor: '', activity: 'assessment', notes: '',
    status: 'scheduled', revision: 0, updated_at: '',
  };
}

export function scheduleIssues(entry: ScheduleEntry) {
  const issues: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.scheduled_on)) issues.push('Confira a data.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.scheduled_time.slice(0, 5))) issues.push('Confira o horário.');
  if (!entry.student_name.trim()) issues.push('Informe o nome do aluno.');
  if (entry.registration && !/^\d{4}$/.test(entry.registration)) issues.push('A matrícula deve ter quatro números.');
  if (!entry.instructor.trim()) issues.push('Informe o professor responsável.');
  if (entry.student_name.length > 120 || entry.instructor.length > 120 || entry.notes.length > 500) issues.push('Reduza o tamanho dos textos informados.');
  return issues;
}

export function movementSummary(items: MovementCount[]) {
  const total = items.reduce((sum, item) => sum + item.people_count, 0);
  const filled = items.filter(item => item.people_count > 0);
  const peak = filled.reduce<MovementCount | null>((best, item) => !best || item.people_count > best.people_count ? item : best, null);
  return { total, average: filled.length ? total / filled.length : 0, peak };
}
