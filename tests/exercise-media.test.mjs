import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { EXERCISE_MEDIA } from '../lib/exercise-media-catalog.ts';
import { exerciseMediaFor, normalizeExerciseName } from '../lib/exercise-media.ts';

test('cada alias identifica somente a variação revisada e tolera acentos, caixa e pontuação', () => {
  const aliases = new Map();
  for (const media of EXERCISE_MEDIA) {
    for (const alias of [media.title, ...media.aliases]) {
      const key = normalizeExerciseName(alias);
      assert.ok(key);
      assert.ok(!aliases.has(key) || aliases.get(key) === media.id, `Alias ambíguo: ${alias}`);
      aliases.set(key, media.id);
      assert.equal(exerciseMediaFor(`  ${alias.toLocaleUpperCase('pt-BR')}  `)?.id, media.id);
      assert.equal(exerciseMediaFor(alias.normalize('NFD').replace(/\p{M}/gu, ''))?.id, media.id);
    }
  }
});

test('nome desconhecido ou variação sem demonstração não recebe imagem por aproximação', () => {
  for (const name of ['', 'Exercício personalizado sem catálogo', 'Supino inclinado com halteres', 'Agachamento no smith', 'Rosca direta na polia', 'Leg press horizontal']) {
    assert.equal(exerciseMediaFor(name), null, name);
  }
  assert.notEqual(exerciseMediaFor('Supino reto com barra')?.id, exerciseMediaFor('Supino reto com halteres')?.id);
});

test('as duas fotografias de cada demonstração existem localmente e possuem legendas', () => {
  assert.ok(EXERCISE_MEDIA.length >= 10);
  for (const media of EXERCISE_MEDIA) {
    assert.equal(media.images.length, 2);
    assert.equal(media.captions.length, 2);
    assert.match(media.sourceUrl, /^https:\/\/github\.com\/yuhonas\/free-exercise-db\//);
    for (const [index, image] of media.images.entries()) {
      assert.match(image, /^\/exercise-demos\/[a-z0-9-]+\/[01]\.jpg$/);
      const path = fileURLToPath(new URL(`../public${image}`, import.meta.url));
      assert.ok(existsSync(path), image);
      const bytes = readFileSync(path);
      assert.equal(bytes.subarray(0, 3).toString('hex'), 'ffd8ff', image);
      assert.ok(media.captions[index].trim());
    }
  }
});

test('as fotografias mantêm os checksums registrados dos arquivos originais', () => {
  const manifest = readFileSync(new URL('../docs/exercise-media-sources.md', import.meta.url), 'utf8');
  const records = [...manifest.matchAll(/\| `(public\/exercise-demos\/[^`]+\.jpg)` \| [^|]+ \| \d+ \| `([a-f0-9]{64})`/g)];
  assert.equal(records.length, EXERCISE_MEDIA.length * 2);
  for (const [, path, expected] of records) {
    const bytes = readFileSync(new URL(`../${path}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, path);
  }
});
