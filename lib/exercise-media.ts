import { EXERCISE_MEDIA } from './exercise-media-catalog.ts';

export type ExerciseMedia = (typeof EXERCISE_MEDIA)[number];
export type ExerciseMediaMatch = {
  kind: 'exact' | 'alias' | 'unmatched' | 'ambiguous';
  media: ExerciseMedia | null;
  originalName: string;
  canonicalName: string;
};

export function normalizeExerciseName(name: string) {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

const spellingAliases: Record<string, string> = {
  halter: 'halteres', haltere: 'halteres', maq: 'maquina',
  maquinas: 'maquina', barras: 'barra', polias: 'polia',
};

// These are spelling expansions, not equipment or movement substitutions.
function matchingKey(name: string) {
  return normalizeExerciseName(name.replace(/\bc\s*\/\s*/gi, 'com '))
    .split(' ')
    .map((word) => spellingAliases[word] || word)
    .join(' ');
}

// Even a catalogue alias must not infer an unspecified angle or posture.
const ambiguousNames = new Set([
  'supino', 'supino reto', 'supino com halteres', 'desenvolvimento',
  'desenvolvimento de ombros', 'desenvolvimento de ombros com halteres',
].map(matchingKey));

const byName = new Map<string, Map<string, ExerciseMedia>>();
for (const media of EXERCISE_MEDIA) {
  for (const name of [media.title, ...media.aliases]) {
    const key = matchingKey(name);
    const matches = byName.get(key) || new Map<string, ExerciseMedia>();
    matches.set(media.id, media);
    byName.set(key, matches);
  }
}

/** Only exact titles and reviewed aliases may be renamed automatically.
 * Ambiguous and unrecognised inputs keep their original name, including variants.
 */
export function matchExerciseMedia(name: string): ExerciseMediaMatch {
  const key = matchingKey(name);
  const preserved = { media: null, originalName: name, canonicalName: name };
  if (!key) return { ...preserved, kind: 'unmatched' };
  if (ambiguousNames.has(key)) return { ...preserved, kind: 'ambiguous' };
  const matches = byName.get(key);
  if (matches && matches.size > 1) return { ...preserved, kind: 'ambiguous' };
  const media = matches?.values().next().value;
  if (media) return {
    kind: normalizeExerciseName(name) === normalizeExerciseName(media.title) ? 'exact' : 'alias',
    media,
    originalName: name,
    canonicalName: media.title,
  };

  // Candidate overlap only identifies uncertainty. It never chooses a photograph.
  const words = key.split(' ').filter((word) => !['com', 'de', 'do', 'da', 'na', 'no', 'em', 'para'].includes(word));
  if (words.length && EXERCISE_MEDIA.filter((item) => [item.title, ...item.aliases].some((alias) => {
    const tokens = new Set(matchingKey(alias).split(' '));
    return words.every((word) => tokens.has(word));
  })).length > 1) return { ...preserved, kind: 'ambiguous' };
  return { ...preserved, kind: 'unmatched' };
}

export function canonicalExerciseName(name: string) {
  return matchExerciseMedia(name).canonicalName;
}

export function exerciseMediaFor(name: string) {
  return matchExerciseMedia(name).media;
}
