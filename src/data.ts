import type { Animal, FarmState, Geofence, Point } from './types'

export const MAP_SIZE = { width: 950, height: 580 }

export const DEFAULT_GEOFENCE: Geofence = {
  id: 'makonde-safe-zone',
  name: 'Makonde safe grazing zone',
  vertices: [
    { x: 154, y: 122 }, { x: 324, y: 74 }, { x: 610, y: 92 },
    { x: 805, y: 188 }, { x: 780, y: 425 }, { x: 580, y: 508 },
    { x: 275, y: 482 }, { x: 124, y: 325 },
  ],
  warningDistance: 25,
  version: 1,
  updatedAt: new Date().toISOString(),
}

const seed = [
  ['C-001', 'Moya', 298, 235, 93, 'North pasture'], ['C-002', 'Lebo', 353, 306, 88, 'North pasture'],
  ['C-003', 'Rene', 441, 225, 82, 'East meadow'], ['C-004', 'Pula', 545, 189, 95, 'East meadow'],
  ['C-005', 'Busi', 610, 285, 76, 'East meadow'], ['C-006', 'Nala', 385, 412, 94, 'Central pasture'],
  ['C-007', 'Thabo', 674, 372, 87, 'Boundary track'], ['C-008', 'Tumi', 504, 363, 99, 'Central pasture'],
  ['C-009', 'Sisi', 255, 344, 81, 'West meadow'], ['C-010', 'Mpho', 600, 405, 90, 'South pasture'],
  ['C-011', 'Rara', 475, 465, 84, 'South pasture'], ['C-012', 'Kamo', 692, 239, 98, 'East meadow'],
] as const

export function createSeedAnimals(now = new Date().toISOString()): Animal[] {
  return seed.map(([id, name, x, y, batteryPercent, grazingArea]) => ({
    id, name, collarId: `TAG-${id.slice(2)}`, grazingArea, batteryPercent,
    lastSeenAt: now, position: { x, y }, source: 'simulated',
  }))
}

export function createInitialState(seedNow = new Date().toISOString()): FarmState {
  const now = seedNow
  const animals = createSeedAnimals(now)
  return {
    version: 1,
    animals,
    geofence: { ...DEFAULT_GEOFENCE, updatedAt: now, vertices: DEFAULT_GEOFENCE.vertices.map((point) => ({ ...point })) },
    security: Object.fromEntries(animals.map((animal) => [animal.id, {
      animalId: animal.id, boundary: 'INSIDE', tamperActive: false, device: 'ONLINE',
      consecutiveOutside: 0, consecutiveInside: 0, lastProcessedAt: now,
    }])),
    alerts: [], selectedAnimalId: 'C-007', soundEnabled: true, fenceVisible: true,
    demoStage: 0, demoRunning: false, lastTelemetryAt: now,
  }
}

export const DEMO_POINTS: Record<string, Point> = {
  approach: { x: 790, y: 335 },
  breach: { x: 870, y: 360 },
  return: { x: 670, y: 370 },
}
