import type { Animal, AnimalSecurityState, Geofence, SecurityAlert, TelemetryReading } from '../types'
import { classifyBoundary } from './geometry'

export function processTelemetry(
  animal: Animal,
  prior: AnimalSecurityState,
  fence: Geofence,
  reading: TelemetryReading,
  now: string,
): { animal: Animal; security: AnimalSecurityState; alerts: SecurityAlert[] } {
  const boundary = classifyBoundary(reading.position, fence.vertices, fence.warningDistance)
  const consecutiveOutside = boundary === 'OUTSIDE' ? prior.consecutiveOutside + 1 : 0
  const consecutiveInside = boundary !== 'OUTSIDE' ? prior.consecutiveInside + 1 : 0
  const nextSecurity: AnimalSecurityState = {
    ...prior,
    boundary,
    consecutiveOutside,
    consecutiveInside,
    lastProcessedAt: now,
    tamperActive: reading.strapOpen ?? prior.tamperActive,
  }
  const nextAnimal = { ...animal, position: reading.position, batteryPercent: reading.batteryPercent ?? animal.batteryPercent, lastSeenAt: reading.observedAt }
  const alerts: SecurityAlert[] = []
  if (boundary === 'NEAR_BOUNDARY' && prior.boundary !== 'NEAR_BOUNDARY') {
    alerts.push(makeAlert('PROXIMITY', 'warning', animal.id, 'Boundary proximity warning', reading, now))
  }
  if (consecutiveOutside >= 3 && prior.consecutiveOutside < 3) {
    alerts.push(makeAlert('BREACH', 'critical', animal.id, 'Unusual location — inspection required', reading, now))
  }
  if (reading.strapOpen === true && !prior.tamperActive) {
    alerts.push(makeAlert('TAMPER', 'critical', animal.id, 'Possible collar tampering — inspection required', reading, now))
  }
  return { animal: nextAnimal, security: nextSecurity, alerts }
}

/** Re-evaluate displayed statuses after a farmer changes the grazing boundary. */
export function reclassifyForGeofence(animals: Animal[], security: Record<string, AnimalSecurityState>, fence: Geofence, now: string): Record<string, AnimalSecurityState> {
  return Object.fromEntries(animals.map((animal) => {
    const prior = security[animal.id]
    return [animal.id, {
      ...prior,
      boundary: classifyBoundary(animal.position, fence.vertices, fence.warningDistance),
      consecutiveOutside: 0,
      consecutiveInside: 0,
      lastProcessedAt: now,
    }]
  }))
}

function makeAlert(type: SecurityAlert['type'], severity: SecurityAlert['severity'], animalId: string, message: string, reading: TelemetryReading, now: string): SecurityAlert {
  return { id: `${type.toLowerCase()}-${animalId}-${now}`, type, severity, animalId, message, createdAt: now, updatedAt: now, status: 'open', position: reading.position, source: 'simulated' }
}

export function dedupeAlerts(existing: SecurityAlert[], incoming: SecurityAlert[]): SecurityAlert[] {
  const result = [...existing]
  for (const alert of incoming) {
    const alreadyActive = result.some((item) => item.animalId === alert.animalId && item.type === alert.type && item.status !== 'resolved')
    if (!alreadyActive) result.unshift(alert)
  }
  return result.slice(0, 50)
}

export function clearResolvedBreach(alerts: SecurityAlert[], animalId: string, security: AnimalSecurityState, now: string): SecurityAlert[] {
  if (security.boundary === 'OUTSIDE' || security.consecutiveInside < 3) return alerts
  return alerts.map((alert) => alert.animalId === animalId && alert.type === 'BREACH' && alert.status !== 'resolved'
    ? { ...alert, status: 'resolved', resolvedAt: now, updatedAt: now }
    : alert)
}
