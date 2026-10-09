export type Point = { x: number; y: number }
export type BoundaryState = 'INSIDE' | 'NEAR_BOUNDARY' | 'OUTSIDE' | 'UNKNOWN'
export type DeviceState = 'ONLINE' | 'STALE' | 'OFFLINE'
export type AlertType = 'PROXIMITY' | 'BREACH' | 'TAMPER' | 'SIGNAL_LOST' | 'LOW_BATTERY'
export type AlertStatus = 'open' | 'acknowledged' | 'resolved'
export type Severity = 'info' | 'warning' | 'critical'
export type View = 'overview' | 'map' | 'livestock' | 'alerts' | 'settings'

export type Animal = {
  id: string
  name: string
  collarId: string
  grazingArea: string
  batteryPercent: number
  lastSeenAt: string
  position: Point
  source: 'simulated' | 'device'
}

export type Geofence = {
  id: string
  name: string
  vertices: Point[]
  warningDistance: number
  version: number
  updatedAt: string
}

export type TelemetryReading = {
  id: string
  animalId: string
  position: Point
  batteryPercent?: number
  strapOpen?: boolean
  observedAt: string
  receivedAt: string
  source: 'simulated' | 'device'
}

export type AnimalSecurityState = {
  animalId: string
  boundary: BoundaryState
  tamperActive: boolean
  device: DeviceState
  consecutiveOutside: number
  consecutiveInside: number
  lastProcessedAt: string | null
}

export type SecurityAlert = {
  id: string
  type: AlertType
  severity: Severity
  animalId: string
  message: string
  createdAt: string
  updatedAt: string
  status: AlertStatus
  acknowledgedAt?: string
  resolvedAt?: string
  position?: Point
  source: 'simulated' | 'device'
}

export type DemoStage = 0 | 1 | 2 | 3
export type FarmState = {
  version: 1
  animals: Animal[]
  geofence: Geofence
  security: Record<string, AnimalSecurityState>
  alerts: SecurityAlert[]
  selectedAnimalId: string
  soundEnabled: boolean
  fenceVisible: boolean
  demoStage: DemoStage
  demoRunning: boolean
  lastTelemetryAt: string
}
