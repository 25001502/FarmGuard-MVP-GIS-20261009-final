import type { Animal, FarmState, Geofence, Point, SecurityAlert } from '../types'
import { clearResolvedBreach, dedupeAlerts, processTelemetry } from './engine'
import { classifyBoundary, minDistanceToEdges } from './geometry'

/** 0 = safe, 1-3 = rising warning as the animal nears the fence, 4 = outside. Drives pitch and volume. */
export function soundLevel(position: Point, fence: Geofence): number {
  const boundary = classifyBoundary(position, fence.vertices, fence.warningDistance)
  if (boundary === 'OUTSIDE') return 4
  if (boundary === 'INSIDE') return 0
  const ratio = minDistanceToEdges(position, fence.vertices) / fence.warningDistance
  if (ratio <= 1 / 3) return 3
  if (ratio <= 2 / 3) return 2
  return 1
}

/** Routine check: compares the last 3 readings with this animal's own earlier movement. Placeholder for a trained model. */
export function isUnusual(speeds: number[]): boolean {
  if (speeds.length < 10) return false
  const base = speeds.slice(0, -3)
  const mean = base.reduce((sum, value) => sum + value, 0) / base.length
  const variance = base.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / base.length
  const recent = speeds.slice(-3).reduce((sum, value) => sum + value, 0) / 3
  return recent > Math.max(mean + 3 * Math.sqrt(variance), 20)
}

function centreOf(fence: Geofence): Point {
  const total = fence.vertices.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 })
  return { x: total.x / fence.vertices.length, y: total.y / fence.vertices.length }
}

function clamp(value: number, max: number): number {
  if (value < 0) return 0
  if (value > max) return max
  return value
}

/** One simulated reading for every animal. Replace with real collar messages later. */
export function liveTick(state: FarmState): { next: FarmState; level: number } {
  const now = new Date().toISOString()
  const centre = centreOf(state.geofence)
  const t = state.simTick % 140 // scripted scene: C-007 drifts to the fence, C-003 acts unusually
  const security = { ...state.security }
  let alerts = state.alerts
  let loudest = 0

  const animals = state.animals.map((animal) => {
    const prior = security[animal.id]
    const agitated = animal.id === 'C-003' && t >= 60 && t < 72
    const wandering = animal.id === 'C-007' && t >= 8 && t < 38
    const awayX = animal.position.x - centre.x
    const awayY = animal.position.y - centre.y
    const length = Math.hypot(awayX, awayY) + 0.001

    let dx = (Math.random() - 0.5) * 10
    let dy = (Math.random() - 0.5) * 10
    if (agitated) {
      dx = (Math.random() - 0.5) * 90
      dy = (Math.random() - 0.5) * 90
    } else if (wandering) {
      dx += (awayX / length) * 8
      dy += (awayY / length) * 8
    } else if (prior.boundary === 'NEAR_BOUNDARY' || prior.boundary === 'OUTSIDE') {
      dx -= (awayX / length) * 10
      dy -= (awayY / length) * 10
    }

    const position = { x: clamp(animal.position.x + dx, 950), y: clamp(animal.position.y + dy, 580) }
    const reading = { id: `live-${now}-${animal.id}`, animalId: animal.id, position, observedAt: now, receivedAt: now, source: 'simulated' as const }
    const result = processTelemetry(animal, prior, state.geofence, reading, now)
    security[animal.id] = result.security
    alerts = clearResolvedBreach(dedupeAlerts(alerts, result.alerts), animal.id, result.security, now)

    const speeds = [...animal.speeds, Math.hypot(dx, dy)].slice(-30)
    if (isUnusual(speeds)) {
      const unusual: SecurityAlert = { id: `unusual_movement-${animal.id}-${now}`, type: 'UNUSUAL_MOVEMENT', severity: 'warning', animalId: animal.id, message: 'Moving differently from its usual pattern — may need attention', createdAt: now, updatedAt: now, status: 'open', position, source: 'simulated' }
      alerts = dedupeAlerts(alerts, [unusual])
    }

    const level = soundLevel(position, state.geofence)
    if (level > loudest) loudest = level
    return { ...result.animal, speeds }
  })

  return { next: { ...state, animals, security, alerts, simTick: state.simTick + 1, lastTelemetryAt: now }, level: loudest }
}

/** Plain-words comparison of an animal's last readings with its own usual movement. */
export function movementLabel(speeds: number[]): string {
  if (speeds.length < 10) return 'Learning its routine'
  const base = speeds.slice(0, -3)
  const usual = base.reduce((sum, value) => sum + value, 0) / base.length + 0.001
  const now = speeds.slice(-3).reduce((sum, value) => sum + value, 0) / 3
  if (isUnusual(speeds)) return `${(now / usual).toFixed(1)}× usual, may need attention`
  return 'Normal for this animal'
}

// ---------- SMS (simulated gateway) ----------

function clock(value: string): string {
  return new Intl.DateTimeFormat('en-ZA', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

/** Short enough for one SMS (under 160 characters). */
export function smsText(alert: SecurityAlert, animal: Animal | undefined): string {
  let who = alert.animalId
  if (animal) who = `${animal.id} ${animal.name}`
  let what = 'needs inspection'
  if (alert.type === 'BREACH') what = 'is outside the fence'
  if (alert.type === 'TAMPER') what = 'collar strap opened'
  if (alert.type === 'UNUSUAL_MOVEMENT') what = 'moving differently from usual'
  if (alert.type === 'LOW_BATTERY') what = 'collar battery low'
  return `FarmGuard: ${who} ${what} at ${clock(alert.createdAt)}. Reply LOCATE ${alert.animalId}.`
}

/** Tiny command parser so a farmer with a basic phone can ask questions by SMS. */
export function smsReply(command: string, state: FarmState): string {
  const parts = command.trim().toUpperCase().split(/\s+/)
  if (parts[0] === 'STATUS') {
    let inside = 0
    let near = 0
    let outside = 0
    state.animals.forEach((animal) => {
      const boundary = state.security[animal.id].boundary
      if (boundary === 'INSIDE') inside += 1
      if (boundary === 'NEAR_BOUNDARY') near += 1
      if (boundary === 'OUTSIDE') outside += 1
    })
    const open = state.alerts.filter((alert) => alert.status !== 'resolved').length
    return `FarmGuard: ${state.animals.length} animals. Inside ${inside}, near fence ${near}, outside ${outside}. Open alerts ${open}.`
  }
  if (parts[0] === 'LOCATE' && parts.length > 1) {
    const animal = state.animals.find((item) => item.id === parts[1])
    if (!animal) return `FarmGuard: no animal ${parts[1]}. Try LOCATE C-007.`
    const boundary = state.security[animal.id].boundary.replace('_', ' ').toLowerCase()
    return `FarmGuard: ${animal.id} ${animal.name} is ${boundary}, grid ${Math.round(animal.position.x)},${Math.round(animal.position.y)} (demo), battery ${Math.round(animal.batteryPercent)}%.`
  }
  return 'FarmGuard commands: STATUS, LOCATE C-007'
}