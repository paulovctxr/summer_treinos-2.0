import type { Assessment } from './assessments.ts';

export type BodyComposition = {
  age: number | null;
  skinfoldSum: number | null;
  bodyFat: number | null;
  fatMass: number | null;
  leanMass: number | null;
  missing: string[];
};

const numberValue = (value: string | undefined) => {
  if (!value?.trim()) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

function ageAt(assessedOn: string, birthDate: string | undefined) {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !/^\d{4}-\d{2}-\d{2}$/.test(assessedOn)) return null;
  const birth = new Date(`${birthDate}T12:00:00Z`);
  const assessed = new Date(`${assessedOn}T12:00:00Z`);
  if (!Number.isFinite(birth.getTime()) || !Number.isFinite(assessed.getTime()) || birth >= assessed) return null;
  let age = assessed.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday = assessed.getUTCMonth() < birth.getUTCMonth() || (assessed.getUTCMonth() === birth.getUTCMonth() && assessed.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= 18 && age <= 100 ? age : null;
}

function rounded(value: number) {
  return Math.round(value * 10) / 10;
}

/** Jackson-Pollock 3-site skinfold equation followed by Siri's body-fat equation. */
export function calculateBodyComposition(data: Record<string, string>, model: Assessment['model'], assessedOn: string): BodyComposition {
  const sites = model === 'HOMENS'
    ? [['skinfold_chest', 'dobra do tórax'], ['skinfold_abdomen', 'dobra abdominal'], ['skinfold_thigh', 'dobra da coxa']] as const
    : [['skinfold_triceps', 'dobra tricipital'], ['skinfold_suprailiac', 'dobra supra-ilíaca'], ['skinfold_thigh', 'dobra da coxa']] as const;
  const age = ageAt(assessedOn, data.birth_date);
  const values = sites.map(([key]) => numberValue(data[key]));
  const missing: string[] = [];
  if (age === null) missing.push('idade entre 18 e 100 anos');
  sites.forEach(([, label], index) => { if (values[index] === null) missing.push(label); });
  const skinfoldSum = values.every(value => value !== null) ? values.reduce((sum, value) => sum + (value || 0), 0) : null;
  let bodyFat: number | null = null;
  if (skinfoldSum !== null && age !== null) {
    const density = model === 'HOMENS'
      ? 1.10938 - 0.0008267 * skinfoldSum + 0.0000016 * skinfoldSum ** 2 - 0.0002574 * age
      : 1.0994921 - 0.0009929 * skinfoldSum + 0.0000023 * skinfoldSum ** 2 - 0.0001392 * age;
    const calculated = 495 / density - 450;
    if (Number.isFinite(calculated)) bodyFat = rounded(Math.min(75, Math.max(1, calculated)));
  }
  const weight = numberValue(data.weight);
  const fatMass = bodyFat !== null && weight !== null ? rounded(weight * bodyFat / 100) : null;
  const leanMass = fatMass !== null && weight !== null ? rounded(Math.max(0, weight - fatMass)) : null;
  return { age, skinfoldSum, bodyFat, fatMass, leanMass, missing };
}

export function withDerivedComposition(assessment: Assessment): Assessment {
  const calculated = calculateBodyComposition(assessment.data, assessment.model, assessment.assessed_on);
  const data = { ...assessment.data };
  if (calculated.bodyFat !== null) data.body_fat = String(calculated.bodyFat);
  else delete data.body_fat;
  if (calculated.fatMass !== null) data.fat_mass = String(calculated.fatMass);
  else delete data.fat_mass;
  if (calculated.leanMass !== null) data.lean_mass = String(calculated.leanMass);
  else delete data.lean_mass;
  return { ...assessment, data };
}
