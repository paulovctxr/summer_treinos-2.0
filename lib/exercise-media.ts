import { EXERCISE_MEDIA } from './exercise-media-catalog.ts';
import { EXERCISE_REVIEWED_ALIASES } from './exercise-reviewed-aliases.ts';

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

type ReviewedMedia = { media: ExerciseMedia; preserveName: boolean };
const byName = new Map<string, Map<string, ReviewedMedia>>();
function registerName(name: string, media: ExerciseMedia, preserveName = false) {
  const key = matchingKey(name);
  const matches = byName.get(key) || new Map<string, ReviewedMedia>();
  matches.set(media.id, { media, preserveName: preserveName || Boolean(matches.get(media.id)?.preserveName) });
  byName.set(key, matches);
}
for (const media of EXERCISE_MEDIA) {
  for (const name of [media.title, ...media.aliases]) {
    registerName(name, media);
  }
}
const byId = new Map(EXERCISE_MEDIA.map((media) => [media.id, media]));
for (const alias of EXERCISE_REVIEWED_ALIASES) {
  const media = byId.get(alias.mediaId);
  if (media) registerName(alias.name, media, alias.preserveName);
}

/** Only exact titles and reviewed aliases may be renamed automatically.
 * Ambiguous and unrecognised inputs keep their original name, including variants.
 */
export function matchExerciseMedia(name: string): ExerciseMediaMatch {
  const key = matchingKey(name);
  const preserved = { media: null, originalName: name, canonicalName: name };
  if (!key) return { ...preserved, kind: 'unmatched' };
  // A plus sign identifies separate movements or a prescription. Normalising
  // punctuation must never turn it into the name of a single exercise.
  if (name.includes('+')) return { ...preserved, kind: 'unmatched' };
  if (ambiguousNames.has(key)) return { ...preserved, kind: 'ambiguous' };
  const matches = byName.get(key);
  if (matches && matches.size > 1) return { ...preserved, kind: 'ambiguous' };
  const reviewed = matches?.values().next().value;
  if (reviewed) return {
    kind: normalizeExerciseName(name) === normalizeExerciseName(reviewed.media.title) ? 'exact' : 'alias',
    media: reviewed.media,
    originalName: name,
    canonicalName: reviewed.preserveName ? name : reviewed.media.title,
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

export type ExerciseMediaReference = { media: ExerciseMedia; name: string };

/** Each image belongs to its named movement, never to the complete combination.
 * Unknown and ambiguous components remain untouched and receive no photograph.
 */
export function exerciseMediaReferencesFor(name: string): ExerciseMediaReference[] {
  const whole = matchExerciseMedia(name);
  if (whole.media) return [{ media: whole.media, name }];
  if (!name.includes('+')) return [];

  const references = new Map<string, ExerciseMediaReference>();
  for (const part of name.split('+').slice(0, 20)) {
    const original = part.trim();
    const { media } = matchExerciseMedia(original);
    if (media) references.set(`${media.id}\0${normalizeExerciseName(original)}`, { media, name: original });
  }
  return [...references.values()];
}
