import test from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISE_MEDIA } from '../lib/exercise-media-catalog.ts';
import { EXERCISE_REVIEWED_ALIASES } from '../lib/exercise-reviewed-aliases.ts';
import { matchExerciseMedia } from '../lib/exercise-media.ts';

test('as associações revisadas apontam para fotos existentes e preservam a prescrição quando necessário', () => {
  const mediaById = new Map(EXERCISE_MEDIA.map((media) => [media.id, media]));
  for (const alias of EXERCISE_REVIEWED_ALIASES) {
    const media = mediaById.get(alias.mediaId);
    assert.ok(media, `Referência inexistente: ${alias.name} → ${alias.mediaId}`);
    for (const name of [alias.name, `  ${alias.name.toLocaleUpperCase('pt-BR')}  `]) {
      const match = matchExerciseMedia(name);
      assert.equal(match.media?.id, alias.mediaId, name);
      assert.equal(match.originalName, name);
      assert.equal(match.canonicalName, alias.preserveName ? name : media.title, name);
    }
  }
});

test('uma referência do aparelho não transforma cardio, intervalos ou códigos da ficha no nome da foto', () => {
  for (const [name, mediaId] of [
    ['Cardio (esteira)', 'esteira-caminhada'],
    ['Esteira - alternar corrida/caminhar', 'esteira-caminhada'],
    ['Cardio (transport)', 'eliptico-transport'],
    ['15 min. transport', 'eliptico-transport'],
    ['Cardio (bike)', 'bicicleta-ergometrica'],
    ['Flexora vertical (14)', 'flexora-em-pe-maquina'],
    ['Agachamento Smith em 3 tempos', 'agachamento-smith'],
  ]) {
    const match = matchExerciseMedia(name);
    assert.equal(match.media?.id, mediaId, name);
    assert.equal(match.canonicalName, name);
  }
  assert.equal(matchExerciseMedia('Corrida na esteira').media?.id, 'esteira-corrida');
  assert.equal(matchExerciseMedia('Caminhada na esteira').media?.id, 'esteira-caminhada');
});

test('nomes da auditoria sem aparelho, postura ou sigla confirmada continuam sem foto atribuída', () => {
  for (const name of [
    'Cardio', 'Cardio livre', 'Aeróbio', 'Aquecimento',
    'Extensão de tronco no módulo', 'Extensão de tronco no módulo (22)',
    'Extensão lombar módulo', 'Extensão Lombar Moudlo',
    'Leg horizontal', 'Agachamento TRX', 'Perdigueiro',
    'Supino reto HBC', 'Supino reto HBL', 'Remada supinada pulley baixo (17)',
    'Ponte ventral', 'Prancha D. ventral', 'Hip thrust',
  ]) {
    const match = matchExerciseMedia(name);
    assert.equal(match.media, null, name);
    assert.equal(match.canonicalName, name);
  }
});
