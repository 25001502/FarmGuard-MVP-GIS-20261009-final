import { describe, expect, it } from 'vitest'
import { createInitialState } from '../data'
import { dedupeAlerts, processTelemetry, reclassifyForGeofence } from './engine'

describe('security engine', () => {
  it('requires three outside readings before creating a breach', () => {
    const state = createInitialState('2026-10-09T08:00:00.000Z')
    const animal = state.animals.find((item) => item.id === 'C-007')!
    let security = state.security['C-007']
    let alerts = [] as ReturnType<typeof processTelemetry>['alerts']
    for (let index = 0; index < 2; index += 1) {
      const result = processTelemetry(animal, security, state.geofence, { id: `r-${index}`, animalId: animal.id, position: { x: 900, y: 350 }, observedAt: `2026-10-09T08:00:0${index}.000Z`, receivedAt: `2026-10-09T08:00:0${index}.000Z`, source: 'simulated' }, `2026-10-09T08:00:0${index}.000Z`)
      security = result.security; alerts = [...alerts, ...result.alerts]
    }
    expect(alerts.some((alert) => alert.type === 'BREACH')).toBe(false)
    const result = processTelemetry(animal, security, state.geofence, { id: 'r-3', animalId: animal.id, position: { x: 900, y: 350 }, observedAt: '2026-10-09T08:00:03.000Z', receivedAt: '2026-10-09T08:00:03.000Z', source: 'simulated' }, '2026-10-09T08:00:03.000Z')
    expect(result.alerts.filter((alert) => alert.type === 'BREACH')).toHaveLength(1)
  })

  it('keeps tamper independent and deduplicates an active alert', () => {
    const state = createInitialState()
    const animal = state.animals.find((item) => item.id === 'C-003')!
    const result = processTelemetry(animal, state.security['C-003'], state.geofence, { id: 'tamper-1', animalId: animal.id, position: animal.position, strapOpen: true, observedAt: '2026-10-09T08:00:00.000Z', receivedAt: '2026-10-09T08:00:00.000Z', source: 'simulated' }, '2026-10-09T08:00:00.000Z')
    expect(result.security.boundary).toBe('INSIDE')
    expect(result.alerts[0].type).toBe('TAMPER')
    expect(dedupeAlerts([], [...result.alerts, ...result.alerts])).toHaveLength(1)
  })

  it('reclassifies every animal immediately when the grazing boundary changes', () => {
    const state = createInitialState('2026-10-09T08:00:00.000Z')
    const smallerFence = { ...state.geofence, warningDistance: 25, vertices: [{ x: 390, y: 180 }, { x: 500, y: 180 }, { x: 500, y: 270 }, { x: 390, y: 270 }] }
    const security = reclassifyForGeofence(state.animals, state.security, smallerFence, '2026-10-09T09:00:00.000Z')
    expect(security['C-003'].boundary).toBe('INSIDE')
    expect(security['C-001'].boundary).toBe('OUTSIDE')
    expect(security['C-001'].consecutiveOutside).toBe(0)
  })
})