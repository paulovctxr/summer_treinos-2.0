import type { FitnessData, WorkoutSessionExercise } from "./fitness.ts";

export type ProConversionMetric = {
  label: string;
  value: string;
};

export type ProConversionSummary = {
  kind: "load-progress" | "activity" | "getting-started";
  title: string;
  description: string;
  nutritionMessage: string;
  metrics: ProConversionMetric[];
  totalSessions: number;
  totalMinutes: number;
  loadProgress: null | {
    exerciseName: string;
    firstWeightKg: number;
    latestWeightKg: number;
    differenceKg: number;
  };
};

function weightKg(exercise: WorkoutSessionExercise) {
  if (typeof exercise.weight !== "number" || !Number.isFinite(exercise.weight) || exercise.weight < 0)
    return null;
  const value = exercise.weightUnit === "lb" ? exercise.weight * 0.453592 : exercise.weight;
  return Math.round(value * 10) / 10;
}

function numberLabel(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function loadProgress(fitness: FitnessData): ProConversionSummary["loadProgress"] {
  const histories = new Map<string, { name: string; at: number; weightKg: number }[]>();
  for (const session of fitness.sessions) {
    const at = Date.parse(session.completedAt);
    if (!Number.isFinite(at)) continue;
    for (const exercise of session.exercises || []) {
      const weight = weightKg(exercise);
      const name = exercise.name.trim();
      if (weight === null || !name) continue;
      const key = name.toLocaleLowerCase("pt-BR");
      const history = histories.get(key) || [];
      history.push({ name, at, weightKg: weight });
      histories.set(key, history);
    }
  }

  let best: ProConversionSummary["loadProgress"] = null;
  for (const history of histories.values()) {
    history.sort((a, b) => a.at - b.at);
    if (history.length < 2) continue;
    const first = history[0];
    const latest = history[history.length - 1];
    const difference = Math.round((latest.weightKg - first.weightKg) * 10) / 10;
    if (difference <= 0 || (best && difference <= best.differenceKg)) continue;
    best = {
      exerciseName: latest.name,
      firstWeightKg: first.weightKg,
      latestWeightKg: latest.weightKg,
      differenceKg: difference,
    };
  }
  return best;
}

function highestLoad(fitness: FitnessData) {
  let highest: { name: string; weightKg: number } | null = null;
  for (const session of fitness.sessions) {
    for (const exercise of session.exercises || []) {
      const weight = weightKg(exercise);
      if (weight === null || (highest && weight <= highest.weightKg)) continue;
      highest = { name: exercise.name, weightKg: weight };
    }
  }
  return highest;
}

/** Builds sales copy only from facts present in the member's saved history. */
export function proConversionSummary(fitness: FitnessData): ProConversionSummary {
  const totalSessions = fitness.sessions.length;
  const totalMinutes = fitness.sessions.reduce(
    (total, session) => total + (Number.isFinite(session.minutes) ? Math.max(0, session.minutes) : 0),
    0,
  );
  const progress = loadProgress(fitness);
  const highest = highestLoad(fitness);
  const metrics: ProConversionMetric[] = [];
  if (totalSessions)
    metrics.push({ label: totalSessions === 1 ? "treino concluído" : "treinos concluídos", value: String(totalSessions) });
  if (totalMinutes)
    metrics.push({ label: "minutos registrados", value: numberLabel(totalMinutes) });
  if (highest)
    metrics.push({ label: `maior carga · ${highest.name}`, value: `${numberLabel(highest.weightKg)} kg` });

  const nutritionMessage = "No PRO, você também organiza sete dias de alimentação, registra refeições por foto e acompanha água, calorias e proteínas.";
  if (progress) {
    return {
      kind: "load-progress",
      title: "Sua evolução já começou a aparecer",
      description: `Em ${progress.exerciseName}, sua última carga está ${numberLabel(progress.differenceKg)} kg acima do primeiro registro. Veja o gráfico completo e acompanhe seus recordes no Summer PRO.`,
      nutritionMessage,
      metrics: metrics.slice(0, 3),
      totalSessions,
      totalMinutes,
      loadProgress: progress,
    };
  }
  if (totalSessions) {
    return {
      kind: "activity",
      title: `${totalSessions === 1 ? "Seu primeiro treino já conta" : `Seus ${totalSessions} treinos já contam uma história`}`,
      description: `${numberLabel(totalMinutes)} ${totalMinutes === 1 ? "minuto registrado" : "minutos registrados"}. O Summer PRO transforma esse histórico em gráficos, recordes e sinais claros da sua constância.`,
      nutritionMessage,
      metrics: metrics.slice(0, 3),
      totalSessions,
      totalMinutes,
      loadProgress: null,
    };
  }
  return {
    kind: "getting-started",
    title: "Treine com um caminho mais claro",
    description: "Conclua seus treinos e use o Summer PRO para acompanhar cargas, frequência, recordes e sua evolução ao longo das semanas.",
    nutritionMessage,
    metrics: [],
    totalSessions: 0,
    totalMinutes: 0,
    loadProgress: null,
  };
}
