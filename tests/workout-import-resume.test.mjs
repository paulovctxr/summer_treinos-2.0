import test from 'node:test'
import assert from 'node:assert/strict'
import {
  WORKOUT_IMPORT_RESUME_TTL,
  clearWorkoutImportResume,
  hasWorkoutImportResume,
  markWorkoutImportResume,
  workoutImportResumeKey,
} from '../lib/workout-import-resume.ts'

class MemoryStorage {
  values = new Map()
  getItem(key) { return this.values.get(key) ?? null }
  setItem(key, value) { this.values.set(key, String(value)) }
  removeItem(key) { this.values.delete(key) }
  clear() { this.values.clear() }
}

const local = new MemoryStorage()
const session = new MemoryStorage()
Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true })
Object.defineProperty(globalThis, 'sessionStorage', { value: session, configurable: true })

test.beforeEach(() => {
  local.clear()
  session.clear()
})

test('retomada da digitalização sobrevive à perda da sessão do navegador', () => {
  const userId = 'student-1'
  const now = Date.now()
  markWorkoutImportResume(userId, now)
  session.clear()

  assert.equal(hasWorkoutImportResume(userId, now + 1_000), true)
  assert.equal(local.getItem(workoutImportResumeKey(userId)), String(now))
})

test('retomada expira em 24 horas e não abre uma digitalização antiga', () => {
  const userId = 'student-2'
  const now = Date.now()
  markWorkoutImportResume(userId, now)
  session.clear()

  assert.equal(hasWorkoutImportResume(userId, now + WORKOUT_IMPORT_RESUME_TTL), false)
  assert.equal(local.getItem(workoutImportResumeKey(userId)), null)
})

test('fechar a digitalização remove as marcas persistente e da sessão', () => {
  const userId = 'student-3'
  markWorkoutImportResume(userId)
  clearWorkoutImportResume(userId)

  assert.equal(hasWorkoutImportResume(userId), false)
  assert.equal(local.getItem(workoutImportResumeKey(userId)), null)
  assert.equal(session.getItem(workoutImportResumeKey(userId)), null)
})
