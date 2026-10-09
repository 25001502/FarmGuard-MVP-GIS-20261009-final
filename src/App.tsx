import { useEffect, useMemo, useRef, useState } from 'react'
import { createInitialState, DEMO_POINTS, MAP_SIZE } from './data'
import { clearResolvedBreach, dedupeAlerts, processTelemetry, reclassifyForGeofence } from './lib/engine'
import { classifyBoundary, findNearBoundaryPoint, findOutsidePoint, findSafePoint, isSelfIntersecting, polygonArea } from './lib/geometry'
import { loadFarmState, saveFarmState } from './lib/storage'
import { liveTick, movementLabel, smsReply, smsText, soundLevel } from './lib/live'
import { RealFarmMap } from './components/RealFarmMap'
import type { AlertType, Animal, BoundaryState, DemoStage, FarmState, Point, SecurityAlert, View } from './types'
import './styles.css'
import './gis-overrides.css'

type IconName = 'grid' | 'map' | 'cow' | 'bell' | 'settings' | 'menu' | 'close' | 'shield' | 'location' | 'battery' | 'signal' | 'chevron' | 'play' | 'pause' | 'refresh' | 'plus' | 'minus' | 'check' | 'alert' | 'sound' | 'search' | 'edit' | 'info' | 'clock' | 'filter' | 'external'

const ICON_PATHS: Record<IconName, string> = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15M15 6v15"/>',
  cow: '<path d="M6 10V7L3 5v5l3 2M18 10V7l3-2v5l-3 2"/><path d="M6 9Q12 5 18 9v6a6 6 0 0 1-12 0V9Z"/><path d="M9 13h.01M15 13h.01M10 17q2 1 4 0"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1-2 2-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.3h-3v-.3a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-2-2 .1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H5v-3h.3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2-2 .1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V4h3v.3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 2 2-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.3v3h-.3a1.7 1.7 0 0 0-1.3 1.5Z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>',
  shield: '<path d="m12 22 7-4V5l-7-3-7 3v13l7 4Z"/><path d="m9 12 2 2 4-4"/>',
  location: '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  battery: '<rect x="2" y="7" width="18" height="10" rx="2"/><path d="M22 10v4M6 10h9v4H6z"/>',
  signal: '<path d="M2 9a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>', play: '<path d="m8 5 11 7-11 7V5Z"/>', pause: '<path d="M8 5v14M16 5v14"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.6L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.6L20 16m0 4v-4h-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', check: '<path d="m5 12 4 4L19 6"/>',
  alert: '<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5M12 18h.01"/>',
  sound: '<path d="M11 5 6 9H3v6h3l5 4V5ZM15 9a5 5 0 0 1 0 6M18 6a9 9 0 0 1 0 12"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>', edit: '<path d="m4 16-.8 4.8L8 20l11.5-11.5a2.1 2.1 0 0 0-3-3L5 17Z"/><path d="m14.5 7.5 3 3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  filter: '<path d="M4 7h16M7 12h10M10 17h4"/>', external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/>',
}

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }} />
}

const navItems: { id: View; label: string; icon: IconName }[] = [
  { id: 'map', label: 'Live farm map', icon: 'map' }, { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'livestock', label: 'My livestock', icon: 'cow' }, { id: 'alerts', label: 'Security alerts', icon: 'bell' }, { id: 'settings', label: 'Configuration', icon: 'settings' },
]

const stageCopy: { title: string; text: string }[] = [
  { title: 'Normal grazing', text: 'All registered cattle are inside the configured safe zone.' },
  { title: 'Near boundary', text: 'C-007 approaches the edge. A browser tone simulates the proposed collar cue.' },
  { title: 'Outside safe zone', text: 'Three outside readings confirm a breach. This is an inspection signal, not proof of theft.' },
  { title: 'Independent collar tamper', text: 'C-003 reports a separate strap-open event while C-007 remains outside.' },
]

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('en-ZA', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function statusLabel(state: BoundaryState): string { return state === 'NEAR_BOUNDARY' ? 'Near boundary' : state === 'OUTSIDE' ? 'Outside safe zone' : state === 'UNKNOWN' ? 'Unknown' : 'Inside safe zone' }
function statusClass(state: BoundaryState): string { return state === 'NEAR_BOUNDARY' ? 'warning' : state === 'OUTSIDE' ? 'danger' : 'safe' }
function alertIcon(type: AlertType): IconName { return type === 'TAMPER' ? 'shield' : type === 'PROXIMITY' ? 'sound' : 'alert' }

type LiveApi = { running: boolean; toggle: () => void }

export default function App() {
  const [state, setState] = useState<FarmState>(() => loadFarmState() ?? createInitialState())
  const [view, setView] = useState<View>(() => (window.location.hash.slice(1) as View) || 'map')
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState<{ title: string; detail: string; tone?: 'warning' | 'danger' } | null>(null)
  const demoTimer = useRef<number | undefined>(undefined)
  const guidanceTimers = useRef<number[]>([])
  const stateRef = useRef(state)
  const audioRef = useRef<AudioContext | null>(null)
  stateRef.current = state

  useEffect(() => { saveFarmState(state) }, [state])
  useEffect(() => () => { if (demoTimer.current) window.clearInterval(demoTimer.current); guidanceTimers.current.forEach((timer) => window.clearInterval(timer)) }, [])
  useEffect(() => { if (toast) { const timer = window.setTimeout(() => setToast(null), 3600); return () => window.clearTimeout(timer) } }, [toast])

  useEffect(() => {
    if (!state.liveMode) return
    const timer = window.setInterval(() => {
      const result = liveTick(stateRef.current)
      setState(result.next)
      if (result.level > 0) playTone(result.level)
    }, 1500)
    return () => window.clearInterval(timer)
  }, [state.liveMode])

  useEffect(() => {
    if (!state.smsEnabled) return
    const sent = new Set(state.sms.map((message) => message.alertId))
    const fresh = state.alerts.filter((alert) => !sent.has(alert.id) && alert.type !== 'PROXIMITY')
    if (fresh.length === 0) return
    setState((current) => ({ ...current, sms: [...fresh.map((alert) => ({ id: `sms-${alert.id}`, alertId: alert.id, to: 'Farm Manager (demo)', text: smsText(alert, current.animals.find((item) => item.id === alert.animalId)), createdAt: alert.createdAt })), ...current.sms].slice(0, 30) }))
  }, [state.alerts, state.smsEnabled])

  const update = (recipe: (current: FarmState) => FarmState) => setState((current) => recipe(current))

  const live: LiveApi = {
    running: state.liveMode,
    toggle: () => update((current) => ({ ...current, liveMode: !current.liveMode })),
  }

  const navigate = (next: View) => { setView(next); window.location.hash = next; setMenuOpen(false) }
  const announce = (title: string, detail: string, tone?: 'warning' | 'danger') => setToast({ title, detail, tone })

  const playTone = (level = 3) => {
    if (!stateRef.current.soundEnabled) return
    try {
      if (!audioRef.current) audioRef.current = new AudioContext()
      const context = audioRef.current
      let pulses = 1
      if (level >= 3) pulses = 2
      for (let index = 0; index < pulses; index += 1) {
        const start = context.currentTime + index * 0.18
        const oscillator = context.createOscillator(); const gain = context.createGain()
        oscillator.frequency.value = 380 + level * 170
        oscillator.type = 'sine'
        if (level >= 4) oscillator.type = 'square'
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(0.04 + level * 0.04, start + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.15)
        oscillator.connect(gain); gain.connect(context.destination); oscillator.start(start); oscillator.stop(start + 0.17)
      }
    } catch { /* browser audio is optional and can be denied */ }
  }

  const applyReading = (animalId: string, position: Point, strapOpen?: boolean, announceEvent = true) => {
    const observedAt = new Date().toISOString()
    let nextAlerts: SecurityAlert[] = []
    update((current) => {
      const animal = current.animals.find((item) => item.id === animalId)
      if (!animal) return current
      const result = processTelemetry(animal, current.security[animalId], current.geofence, { id: `reading-${observedAt}`, animalId, position, observedAt, receivedAt: observedAt, source: 'simulated', strapOpen }, observedAt)
      nextAlerts = result.alerts
      const security = { ...current.security, [animalId]: result.security }
      const alerts = dedupeAlerts(current.alerts, result.alerts)
      return { ...current, animals: current.animals.map((item) => item.id === animalId ? result.animal : item), security, alerts, lastTelemetryAt: observedAt }
    })
    if (nextAlerts.some((alert) => alert.type === 'PROXIMITY')) { playTone(); if (announceEvent) announce('Boundary proximity warning', `${animalId} is close to the safe-zone edge.`, 'warning') }
    if (nextAlerts.some((alert) => alert.type === 'BREACH') && announceEvent) announce('Unusual location detected', `${animalId} has a confirmed simulated breach.`, 'danger')
    if (nextAlerts.some((alert) => alert.type === 'TAMPER') && announceEvent) announce('Possible collar tampering', `${animalId} reports a simulated strap-open event.`, 'danger')
  }

  const reset = () => { if (demoTimer.current) window.clearInterval(demoTimer.current); demoTimer.current = undefined; setState(createInitialState()); announce('Demo reset', 'All 12 animals are back inside the safe zone.') }
  const runStage = (stage: DemoStage) => {
    if (stage === 0) { reset(); update((current) => ({ ...current, demoStage: 0 })); return }
    if (stage === 1) { update((current) => ({ ...current, demoStage: 1, selectedAnimalId: 'C-007' })); applyReading('C-007', DEMO_POINTS.approach); return }
    if (stage === 2) { update((current) => ({ ...current, demoStage: 2, selectedAnimalId: 'C-007' })); applyReading('C-007', DEMO_POINTS.breach, false, false); applyReading('C-007', DEMO_POINTS.breach, false, false); applyReading('C-007', DEMO_POINTS.breach, false, true); return }
    update((current) => ({ ...current, demoStage: 3, selectedAnimalId: 'C-003' })); applyReading('C-003', { x: 440, y: 220 }, true)
  }
  const toggleGuidedDemo = () => {
    if (state.demoRunning) { if (demoTimer.current) window.clearInterval(demoTimer.current); demoTimer.current = undefined; update((current) => ({ ...current, demoRunning: false })); return }
    reset(); update((current) => ({ ...current, demoRunning: true }));
    let stage = 0
    demoTimer.current = window.setInterval(() => { stage += 1; if (stage > 3) { if (demoTimer.current) window.clearInterval(demoTimer.current); demoTimer.current = undefined; update((current) => ({ ...current, demoRunning: false })); return } runStage(stage as DemoStage) }, 5200)
  }

  const acknowledge = (id: string) => update((current) => ({ ...current, alerts: current.alerts.map((alert) => alert.id === id ? { ...alert, status: 'acknowledged', acknowledgedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : alert) }))
  const resolve = (id: string) => update((current) => ({ ...current, alerts: current.alerts.map((alert) => alert.id === id ? { ...alert, status: 'resolved', resolvedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : alert) }))
  const locate = (animalId: string) => { update((current) => ({ ...current, selectedAnimalId: animalId })); navigate('map') }
  const simulateManual = (kind: 'near' | 'breach' | 'return' | 'tamper', animalId = state.selectedAnimalId) => {
    const animal = state.animals.find((item) => item.id === animalId)
    if (!animal) return
    const variant = state.animals.findIndex((item) => item.id === animalId)
    const nearPoint = findNearBoundaryPoint(state.geofence.vertices, state.geofence.warningDistance, variant) ?? DEMO_POINTS.approach
    const outsidePoint = findOutsidePoint(state.geofence.vertices, state.geofence.warningDistance, variant) ?? DEMO_POINTS.breach
    const safePoint = findSafePoint(state.geofence.vertices, state.geofence.warningDistance, variant) ?? DEMO_POINTS.return
    if (kind === 'near') { applyReading(animalId, nearPoint); update((current) => ({ ...current, demoStage: 1, selectedAnimalId: animalId })) }
    if (kind === 'breach') { applyReading(animalId, outsidePoint, false, false); applyReading(animalId, outsidePoint, false, false); applyReading(animalId, outsidePoint, false, true); update((current) => ({ ...current, demoStage: 2, selectedAnimalId: animalId })) }
    if (kind === 'return') { applyReading(animalId, safePoint); applyReading(animalId, safePoint); applyReading(animalId, safePoint); update((current) => ({ ...current, demoStage: 0, alerts: clearResolvedBreach(current.alerts, animalId, current.security[animalId], new Date().toISOString()) })) }
    if (kind === 'tamper') { applyReading(animalId, animal.position, true); update((current) => ({ ...current, selectedAnimalId: animalId, demoStage: 3 })) }
  }

  const guideOutsideAnimals = () => {
    const outsideAnimals = state.animals.filter((animal) => ['OUTSIDE', 'NEAR_BOUNDARY'].includes(state.security[animal.id]?.boundary))
    if (!outsideAnimals.length) { announce('Herd already comfortably inside', 'No cattle currently need a guided return.'); return }
    guidanceTimers.current.forEach((timer) => window.clearInterval(timer)); guidanceTimers.current = []
    outsideAnimals.forEach((animal, index) => {
      const target = findSafePoint(state.geofence.vertices, state.geofence.warningDistance, index)
      if (!target) return
      const start = { ...animal.position }
      let step = 0
      const timer = window.setInterval(() => {
        step += 1
        const progress = step / 9
        const position = { x: start.x + (target.x - start.x) * progress, y: start.y + (target.y - start.y) * progress }
        update((current) => {
          const currentAnimal = current.animals.find((item) => item.id === animal.id)
          if (!currentAnimal) return current
          const boundary = classifyBoundary(position, current.geofence.vertices, current.geofence.warningDistance)
          return {
            ...current,
            animals: current.animals.map((item) => item.id === animal.id ? { ...item, position, lastSeenAt: new Date().toISOString() } : item),
            security: { ...current.security, [animal.id]: { ...current.security[animal.id], boundary, consecutiveOutside: 0, consecutiveInside: 0, lastProcessedAt: new Date().toISOString() } },
          }
        })
        if (step >= 9) { window.clearInterval(timer); guidanceTimers.current = guidanceTimers.current.filter((activeTimer) => activeTimer !== timer) }
      }, 250)
      guidanceTimers.current.push(timer)
    })
    announce('Guidance route started', `${outsideAnimals.length} cattle ${outsideAnimals.length === 1 ? 'is' : 'are'} moving away from the boundary and into the designated grazing area.`, 'warning')
  }

  const activeAlerts = state.alerts.filter((alert) => alert.status !== 'resolved')
  const selected = state.animals.find((animal) => animal.id === state.selectedAnimalId) ?? state.animals[0]
  const counts = useMemo(() => {
    const statuses = state.animals.map((animal) => state.security[animal.id]?.boundary)
    return { inside: statuses.filter((item) => item === 'INSIDE').length, near: statuses.filter((item) => item === 'NEAR_BOUNDARY').length, outside: statuses.filter((item) => item === 'OUTSIDE').length }
  }, [state.animals, state.security])

  const content = view === 'overview'
    ? <Overview live={live} state={state} counts={counts} activeAlerts={activeAlerts} selected={selected} onNavigate={navigate} onLocate={locate} onReset={reset} onDemo={toggleGuidedDemo} onManual={simulateManual} onSelect={(id) => update((current) => ({ ...current, selectedAnimalId: id }))} />
    : view === 'map'
      ? <MapView onNavigate={navigate} live={live} state={state} selected={selected} onSelect={(id) => update((current) => ({ ...current, selectedAnimalId: id }))} onManual={simulateManual} onReset={reset} onUpdateFence={(vertices) => update((current) => {
        const updatedAt = new Date().toISOString()
        const geofence = { ...current.geofence, vertices, version: current.geofence.version + 1, updatedAt }
        return { ...current, geofence, security: reclassifyForGeofence(current.animals, current.security, geofence, updatedAt) }
      })} />
      : view === 'livestock'
        ? <LivestockView state={state} onLocate={locate} />
        : view === 'alerts'
          ? <AlertsView state={state} onAcknowledge={acknowledge} onResolve={resolve} onLocate={locate} onSimulate={() => simulateManual('breach')} />
          : <SettingsView onToggleSms={() => update((current) => ({ ...current, smsEnabled: !current.smsEnabled }))} state={state} onToggleSound={() => update((current) => ({ ...current, soundEnabled: !current.soundEnabled }))} onToggleFence={() => update((current) => ({ ...current, fenceVisible: !current.fenceVisible }))} onReset={reset} onDemo={toggleGuidedDemo} />

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Icon name="shield" size={22} /></div><div><strong>Neck<span>Wear</span></strong><small>Livestock security</small></div></div>
      <div className="nav-label">WORKSPACE</div><nav className="nav-links" aria-label="Primary navigation">{navItems.map((item) => <button key={item.id} className={`nav-link ${view === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)}><Icon name={item.icon} /><span>{item.label}</span>{item.id === 'alerts' && activeAlerts.length > 0 && <b>{activeAlerts.length}</b>}</button>)}</nav>
      <div className="sidebar-spacer" /><div className="sidebar-card"><span className="sidebar-card-icon"><Icon name="shield" /></span><strong>Your herd, protected.</strong><p>Early warnings for animals wandering outside safe grazing zones.</p><span className="ready"><i /> DEMO SYSTEM READY</span></div>
      <div className="account"><span className="avatar">FM</span><span><strong>Farm Manager</strong><small>Makonde Farm · Limpopo</small></span></div>
    </aside>
    {menuOpen && <button className="scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
    <main className="main"><header className="topbar"><div className="top-left"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Icon name="menu" /></button><span className="muted">Workspace</span><span className="slash">/</span><span>{navItems.find((item) => item.id === view)?.label}</span></div><div className="top-right"><span className="simulation-badge"><i /> SIMULATION MODE <em>· NO LIVE COLLARS</em></span><span className="date">{new Intl.DateTimeFormat('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</span><button className="icon-button notification" onClick={() => navigate('alerts')} aria-label="View security alerts"><Icon name="bell" />{activeAlerts.length > 0 && <i />}</button><span className="avatar avatar-small">FM</span></div></header><div className="page">{content}</div><footer className="footer"><span><i /> FarmGuard prototype · Offline demo</span><span>Illustrative livestock data · No real GPS, animals, or hardware connected</span></footer></main>{toast && <div className={`toast ${toast.tone ?? ''}`} role="status"><strong>{toast.title}</strong><span>{toast.detail}</span></div>}
  </div>
}

function PageHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode }) { return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{actions && <div className="heading-actions">{actions}</div>}</div> }
function Button({ children, onClick, primary = false, className = '', disabled = false }: { children: React.ReactNode; onClick?: () => void; primary?: boolean; className?: string; disabled?: boolean }) { return <button className={`button ${primary ? 'primary' : ''} ${className}`} onClick={onClick} disabled={disabled}>{children}</button> }
function StatusPill({ state }: { state: BoundaryState }) { return <span className={`status-pill ${statusClass(state)}`}><i />{statusLabel(state)}</span> }
function Metric({ label, value, helper, icon, tone = 'safe' }: { label: string; value: number | string; helper: string; icon: IconName; tone?: string }) { return <div className="metric"><div className="metric-top"><span>{label}</span><b className={tone}><Icon name={icon} size={17} /></b></div><strong>{value}</strong><small>{helper}</small></div> }
function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) { return <div className="card-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div> }

function Overview({ live, state, counts, activeAlerts, selected, onNavigate, onLocate, onReset, onDemo, onManual, onSelect }: { live: LiveApi; state: FarmState; counts: { inside: number; near: number; outside: number }; activeAlerts: SecurityAlert[]; selected: Animal; onNavigate: (view: View) => void; onLocate: (id: string) => void; onReset: () => void; onDemo: () => void; onManual: (kind: 'near' | 'breach' | 'return' | 'tamper') => void; onSelect: (id: string) => void }) {
  return <><PageHeading eyebrow="Livestock security dashboard" title="Good day, Farm Manager" description="Monitor your herd, protect grazing boundaries, and respond to security events." actions={<><Button onClick={onReset}><Icon name="refresh" size={15} /> Reset demo</Button><Button primary onClick={onDemo}><Icon name={state.demoRunning ? 'pause' : 'play'} size={15} /> {state.demoRunning ? 'Pause guided demo' : 'Run guided demo'}</Button></>} /><div className="simulation-banner"><span><i /><strong>SIMULATION MODE</strong> · No live collars connected</span><small>All readings, map positions and alerts are locally simulated for demonstration.</small></div><div className="metric-grid"><Metric label="Registered cattle" value={state.animals.length} helper="Monitored in demo" icon="cow" /><Metric label="Inside safe zone" value={counts.inside} helper="Within configured fence" icon="shield" /><Metric label="Near boundary" value={counts.near} helper="Attention recommended" icon="location" tone="warning" /><Metric label="Outside safe zone" value={counts.outside} helper="Inspection required" icon="alert" tone="danger" /></div><div className="content-grid"><div><section className="card map-card"><CardHeader title="Virtual fence & livestock locations" subtitle="Select a marker to inspect that collar's simulated status" action={<span className="live-pill"><i /> DEMO MAP</span>} /><FarmMap state={state} onSelect={onSelect} /><div className="scenario-bar"><LiveBar live={live} /><span>Simulated collar data. The dashboard only watches; it never controls the animals.</span></div></section><div className="info-note"><Icon name="info" size={17} /><span><strong>Honest demo boundary.</strong> The map uses illustrative coordinates, not a surveyed farm map. A boundary crossing is an inspection signal — not proof of theft.</span></div></div><aside className="side-stack"><AlertPanel alerts={activeAlerts} onLocate={onLocate} onNavigate={onNavigate} /><HerdWatchlist state={state} onLocate={onLocate} /><div className="insight-card"><Icon name="shield" size={20} /><div><strong>Built around early detection</strong><p>Spot unusual location or collar signals early and decide what to inspect next.</p></div></div></aside></div><GuidedCard state={state} onDemo={onDemo} /></>
}

function FarmMap({ state, onSelect, editable = false, draftVertices, onVertexDrag }: { state: FarmState; onSelect: (id: string) => void; editable?: boolean; draftVertices?: Point[]; onVertexDrag?: (index: number, point: Point) => void }) {
  return <RealFarmMap state={state} onSelect={onSelect} editable={editable} draftVertices={draftVertices} onVertexDrag={onVertexDrag} />
}

function transformGrazingArea(vertices: Point[], scale: number, xOffset = 0, yOffset = 0): Point[] {
  const centre = vertices.reduce((total, point) => ({ x: total.x + point.x, y: total.y + point.y }), { x: 0, y: 0 })
  centre.x /= vertices.length
  centre.y /= vertices.length
  return vertices.map((point) => ({
    x: Math.max(0, Math.min(MAP_SIZE.width, centre.x + (point.x - centre.x) * scale + xOffset)),
    y: Math.max(0, Math.min(MAP_SIZE.height, centre.y + (point.y - centre.y) * scale + yOffset)),
  }))
}

function AlertPanel({ alerts, onLocate, onNavigate }: { alerts: SecurityAlert[]; onLocate: (id: string) => void; onNavigate: (view: View) => void }) { return <section className="card"><CardHeader title="Active security alerts" subtitle="Review and inspect simulated signals" action={<button className="text-button" onClick={() => onNavigate('alerts')}>View all <Icon name="chevron" size={13} /></button>} />{alerts.length === 0 ? <div className="empty-mini"><Icon name="check" size={22} /><strong>All clear for now</strong><span>Run the guided demo to see alerts.</span></div> : <div className="alert-list">{alerts.slice(0, 4).map((alert) => <div className="alert-row" key={alert.id}><span className={`alert-icon ${alert.severity}`}><Icon name={alertIcon(alert.type)} size={16} /></span><div><strong>{alert.message}</strong><p>{alert.animalId} · {formatTime(alert.createdAt)}</p><button className="text-button" onClick={() => onLocate(alert.animalId)}>Locate animal <Icon name="chevron" size={12} /></button></div></div>)}</div>}</section> }
function HerdWatchlist({ state, onLocate }: { state: FarmState; onLocate: (id: string) => void }) { const ids = ['C-007', 'C-003', 'C-004']; return <section className="card"><CardHeader title="Herd watchlist" subtitle="Quickly inspect tracked cattle" action={<button className="text-button" onClick={() => onLocate('C-007')}>View herd <Icon name="chevron" size={13} /></button>} /><div className="watchlist">{ids.map((id) => { const animal = state.animals.find((item) => item.id === id)!; const security = state.security[id]; return <button className="watch-row" key={id} onClick={() => onLocate(id)}><span className="cow-avatar"><Icon name="cow" size={20} /></span><span><strong>{animal.id} · {animal.name}</strong><small>{animal.grazingArea} · {animal.batteryPercent}% battery</small></span><StatusPill state={security.boundary} /></button> })}</div></section> }
function GuidedCard({ state, onDemo }: { state: FarmState; onDemo: () => void }) { return <section className="guided-card"><div><div className="eyebrow">Presentation mode</div><h2>Walk through the security story</h2><p>A repeatable 60–90 second sequence showing proximity, breach confirmation and an independent tamper event.</p></div><div className="guided-steps">{stageCopy.map((stage, index) => <div className={`guided-step ${state.demoStage === index ? 'current' : state.demoStage > index ? 'done' : ''}`} key={stage.title}><span>{state.demoStage > index ? <Icon name="check" size={13} /> : index + 1}</span><strong>{stage.title}</strong></div>)}</div><Button primary onClick={onDemo}><Icon name={state.demoRunning ? 'pause' : 'play'} size={15} /> {state.demoRunning ? 'Pause sequence' : 'Start guided demo'}</Button></section> }

function MapView({ onNavigate, live, state, selected, onSelect, onManual, onReset, onUpdateFence }: { onNavigate: (view: View) => void; live: LiveApi; state: FarmState; selected: Animal; onSelect: (id: string) => void; onManual: (kind: 'near' | 'breach' | 'return' | 'tamper') => void; onReset: () => void; onUpdateFence: (vertices: Point[]) => void }) {
  const [editing, setEditing] = useState(false); const [draft, setDraft] = useState<Point[]>(state.geofence.vertices); const [error, setError] = useState('')
  const startEditing = () => { setDraft(state.geofence.vertices.map((point) => ({ ...point }))); setError(''); setEditing(true) }
  const save = () => { if (draft.length < 3 || polygonArea(draft) < 1000 || isSelfIntersecting(draft)) { setError('Use at least 3 points with a non-intersecting, non-zero-area polygon.'); return } onUpdateFence(draft); setEditing(false) }
  const drag = (index: number, point: Point) => setDraft((points) => points.map((current, pointIndex) => pointIndex === index ? point : current))
  const adjustArea = (scale: number, xOffset = 0, yOffset = 0) => { setDraft((points) => transformGrazingArea(points, scale, xOffset, yOffset)); setError('') }
  const security = state.security[selected.id]
  return <><PageHeading eyebrow="Location monitoring" title="Live farm map" description="An interactive, simulated view of the grazing zone and tagged cattle." actions={<><Button onClick={editing ? () => { setEditing(false); setDraft(state.geofence.vertices) } : startEditing}><Icon name={editing ? 'close' : 'edit'} size={15} /> {editing ? 'Cancel edit' : 'Edit boundary'}</Button><Button onClick={onReset}><Icon name="refresh" size={15} /> Reset demo</Button></>} />{editing && <div className="edit-banner"><Icon name="edit" size={17} /><div className="grazing-edit-copy"><strong>Adjust grazing area.</strong><span>Shrink the zone after overgrazing, shift it to fresh pasture, or drag individual nodes for fine control. Changes stay local until saved.</span></div><div className="grazing-area-controls" aria-label="Grazing area adjustment controls"><Button className="tiny" onClick={() => adjustArea(.9)}><Icon name="minus" size={14} /> Shrink 10%</Button><Button className="tiny" onClick={() => adjustArea(1.1)}><Icon name="plus" size={14} /> Expand 10%</Button><span className="grazing-shift-label">Shift</span><Button className="tiny" onClick={() => adjustArea(1, 0, -22)}>North</Button><Button className="tiny" onClick={() => adjustArea(1, -22, 0)}>West</Button><Button className="tiny" onClick={() => adjustArea(1, 22, 0)}>East</Button><Button className="tiny" onClick={() => adjustArea(1, 0, 22)}>South</Button><Button className="tiny" onClick={save}><Icon name="check" size={14} /> Save area</Button>{error && <small>{error}</small>}</div></div>}<div className="split-grid"><section className="card map-card large"><CardHeader title="Makonde Farm · North & Central Pasture" subtitle="Virtual boundary and current simulated collar positions" action={<span className="live-pill"><i /> SIMULATED</span>} /><FarmMap state={state} onSelect={onSelect} editable={editing} draftVertices={editing ? draft : undefined} onVertexDrag={drag} /><div className="scenario-bar"><LiveBar live={live} /><span>Simulated collar data. The dashboard only watches; it never controls the animals.</span></div></section><aside className="side-stack"><AlertPanel alerts={state.alerts.filter((alert) => alert.status !== 'resolved')} onLocate={onSelect} onNavigate={onNavigate} /><section className="card detail-card"><div className="eyebrow">Selected animal</div><h2>{selected.id} · {selected.name}</h2><p>Simulated GPS collar reporting to the local dashboard.</p><StatusPill state={security.boundary} /><div className="detail-list"><div><span>Grazing area</span><strong>{selected.grazingArea}</strong></div><div><span>Fence sound level</span><strong>{soundLevel(selected.position, state.geofence)} of 4</strong></div><div><span>Movement vs usual</span><strong>{movementLabel(selected.speeds)}</strong></div><div><span>Collar battery</span><strong>{selected.batteryPercent}%</strong></div><div><span>Device ID</span><strong>{selected.collarId}</strong></div><div><span>Connection</span><strong>Simulated only</strong></div><div><span>Last reading</span><strong>{formatTime(selected.lastSeenAt)}</strong></div></div></section></aside></div></>
}

function LivestockView({ state, onLocate }: { state: FarmState; onLocate: (id: string) => void }) { const [query, setQuery] = useState(''); const [filter, setFilter] = useState('all'); const animals = state.animals.filter((animal) => { const security = state.security[animal.id]; const searchMatch = `${animal.id} ${animal.name}`.toLowerCase().includes(query.toLowerCase()); const filterMatch = filter === 'all' || (filter === 'attention' ? security.boundary !== 'INSIDE' || security.tamperActive : filter === state.security[animal.id].boundary.toLowerCase()); return searchMatch && filterMatch })
  return <><PageHeading eyebrow="Device & herd register" title="My livestock" description="12 fictional cattle with simulated collars registered at Makonde Farm." /><div className="filter-row"><label className="searchbox"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by cattle ID or name" aria-label="Search cattle" /></label><select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter cattle"><option value="all">All animals</option><option value="attention">Needs attention</option><option value="inside">Inside safe zone</option><option value="near_boundary">Near boundary</option><option value="outside">Outside safe zone</option></select></div><section className="card table-card"><div className="table-scroll"><table><thead><tr><th>Animal / tag</th><th>Grazing area</th><th>Boundary status</th><th>Battery</th><th>Signal</th><th /></tr></thead><tbody>{animals.map((animal) => { const security = state.security[animal.id]; return <tr key={animal.id}><td><strong>{animal.id} · {animal.name}</strong><small>{animal.collarId}</small></td><td>{animal.grazingArea}</td><td><StatusPill state={security.boundary} />{security.tamperActive && <span className="tiny-alert">Tamper</span>}</td><td><span className={animal.batteryPercent < 30 ? 'low-battery' : ''}>{animal.batteryPercent}%</span></td><td><span className="signal-cell"><Icon name="signal" size={15} /> Online</span></td><td><Button className="tiny" onClick={() => onLocate(animal.id)}><Icon name="location" size={13} /> Locate</Button></td></tr> })}</tbody></table>{animals.length === 0 && <div className="empty-state"><Icon name="search" size={28} /><strong>No cattle match that filter</strong><span>Try another name, ID or status.</span></div>}</div></section><div className="info-note"><Icon name="info" size={17} /><span>These are local demonstration records. There is no registration backend or live collar connection.</span></div></>
}

function AlertsView({ state, onAcknowledge, onResolve, onLocate, onSimulate }: { state: FarmState; onAcknowledge: (id: string) => void; onResolve: (id: string) => void; onLocate: (id: string) => void; onSimulate: () => void }) { const [filter, setFilter] = useState('active'); const alerts = state.alerts.filter((alert) => filter === 'all' || (filter === 'active' ? alert.status !== 'resolved' : alert.type === filter)); return <><PageHeading eyebrow="Security event center" title="Security alerts" description="Review boundary warnings, confirmed simulated breaches and independent collar signals." actions={<><Button primary onClick={() => setFilter('all')}><Icon name="clock" size={15} /> View history</Button></>} /><div className="metric-grid alert-metrics"><Metric label="Recorded alerts" value={state.alerts.length} helper="Current demo session" icon="bell" tone="warning" /><Metric label="Awaiting review" value={state.alerts.filter((alert) => alert.status === 'open').length} helper="Needs farmer attention" icon="alert" tone="danger" /><Metric label="Boundary alerts" value={state.alerts.filter((alert) => alert.type === 'BREACH').length} helper="Simulated fence exits" icon="map" /><Metric label="Tamper events" value={state.alerts.filter((alert) => alert.type === 'TAMPER').length} helper="Simulated strap triggers" icon="shield" /></div><div className="alert-toolbar"><span><Icon name="filter" size={15} /> Filter events</span><select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter alerts"><option value="active">Active only</option><option value="all">All history</option><option value="PROXIMITY">Boundary approach</option><option value="BREACH">Boundary breach</option><option value="TAMPER">Collar tamper</option><option value="UNUSUAL_MOVEMENT">Unusual movement</option></select></div><section className="card alert-history">{alerts.length === 0 ? <div className="empty-state"><Icon name="check" size={30} /><strong>No alerts in this view</strong><span>Run a simulation to create an event.</span></div> : alerts.map((alert) => <AlertDetail key={alert.id} alert={alert} onAcknowledge={onAcknowledge} onResolve={onResolve} onLocate={onLocate} />)}</section><SmsCard state={state} /><div className="info-note"><Icon name="info" size={17} /><span><strong>Safety wording.</strong> “Unusual location” and “possible tampering” indicate sensor signals requiring inspection. They do not establish theft or criminal activity.</span></div></> }
function AlertDetail({ alert, onAcknowledge, onResolve, onLocate }: { alert: SecurityAlert; onAcknowledge: (id: string) => void; onResolve: (id: string) => void; onLocate: (id: string) => void }) { return <article className="alert-detail"><span className={`alert-icon ${alert.severity}`}><Icon name={alertIcon(alert.type)} size={18} /></span><div className="alert-body"><div className="alert-title-row"><h3>{alert.message}</h3><span className={`status-tag ${alert.status}`}>{alert.status}</span></div><p>{alert.animalId} · {formatTime(alert.createdAt)} · Illustrative demo coordinates</p><small>This is a simulated sensor event, not evidence of cattle theft.</small><div className="alert-actions"><Button className="tiny" onClick={() => onLocate(alert.animalId)}><Icon name="location" size={13} /> Locate animal</Button>{alert.status === 'open' && <Button className="tiny" onClick={() => onAcknowledge(alert.id)}><Icon name="check" size={13} /> Acknowledge</Button>}{alert.status !== 'resolved' && <Button className="tiny" onClick={() => onResolve(alert.id)}><Icon name="check" size={13} /> Resolve</Button>}</div></div></article> }

function SettingsView({ onToggleSms, state, onToggleSound, onToggleFence, onReset, onDemo }: { onToggleSms: () => void; state: FarmState; onToggleSound: () => void; onToggleFence: () => void; onReset: () => void; onDemo: () => void }) { return <><PageHeading eyebrow="Demo configuration" title="System configuration" description="Manage local prototype settings and understand what is simulated." actions={<Button onClick={onReset}><Icon name="refresh" size={15} /> Reset dataset</Button>} /><div className="split-grid settings-grid"><div><section className="card setting-card"><CardHeader title="Farm boundary" subtitle="The safe zone is an illustrative local polygon." /><SettingRow label="Show safe-zone boundary" description="Display the green geofence on the map." value={state.fenceVisible} onClick={onToggleFence} /><SettingRow label="Browser warning tone" description="Rising pitch and volume as an animal nears the fence (simulated collar buzzer)." value={state.soundEnabled} onClick={onToggleSound} /><SettingRow label="SMS alerts" description="Sends short texts to the farmer. Needs no data plan and uses no battery on the collar." value={state.smsEnabled} onClick={onToggleSms} /></section><section className="card setting-card"><CardHeader title="Four-stage concept architecture" subtitle="The field concept has no cloud/server stage." /><div className="architecture"><div><span>01</span><Icon name="cow" /><strong>Smart collar</strong><small>GPS, buzzer, tamper input</small></div><div><span>02</span><Icon name="signal" /><strong>Wireless link</strong><small>LoRa to a farm gateway, then SMS or satellite</small></div><div><span>03</span><Icon name="map" /><strong>Dashboard</strong><small>Local map and alerts</small></div><div><span>04</span><Icon name="cow" /><strong>Farmer</strong><small>Inspects and responds</small></div></div></section></div><aside className="side-stack"><section className="card detail-card"><div className="eyebrow">Demo readiness</div><h2>Ready for judges</h2><div className="detail-list"><div><span>Offline dashboard</span><strong>Available</strong></div><div><span>Geofence engine</span><strong>Local logic</strong></div><div><span>Collar buzzer</span><strong>Browser simulation</strong></div><div><span>Tamper sensor</span><strong>Simulated</strong></div><div><span>Hardware adapter</span><strong>Not connected</strong></div><div><span>Cloud/server</span><strong>Not required</strong></div></div><Button primary className="full-width" onClick={onDemo}><Icon name="play" size={15} /> Start guided demo</Button></section><div className="insight-card"><Icon name="info" size={20} /><div><strong>Local persistence boundary</strong><p>localStorage keeps this browser's demo state. It is not encrypted, synchronized or a production audit service.</p></div></div></aside></div></> }
function SettingRow({ label, description, value, onClick }: { label: string; description: string; value: boolean; onClick: () => void }) { return <div className="setting-row"><div><strong>{label}</strong><small>{description}</small></div><button className={`toggle ${value ? 'on' : ''}`} role="switch" aria-checked={value} onClick={onClick}><span /></button></div> }

function LiveBar({ live }: { live: LiveApi }) {
  let toggleIcon: IconName = 'play'
  let toggleLabel = 'Start simulated collar feed'
  if (live.running) { toggleIcon = 'pause'; toggleLabel = 'Pause simulated feed' }
  return <Button primary onClick={live.toggle}><Icon name={toggleIcon} size={14} /> {toggleLabel}</Button>
}

function SmsCard({ state }: { state: FarmState }) {
  const [command, setCommand] = useState('')
  const [reply, setReply] = useState('Try STATUS or LOCATE C-007, as a farmer would from a basic phone.')
  const send = () => { setReply(smsReply(command, state)); setCommand('') }
  let outbox = <p className="hint">No texts yet. Alerts for breaches, tampering and unusual movement are sent here.</p>
  if (state.sms.length > 0) outbox = <div>{state.sms.slice(0, 5).map((message) => <div className="sms-row" key={message.id}><small>{formatTime(message.createdAt)}</small><span>{message.text}</span></div>)}</div>
  return <section className="card sms-card"><CardHeader title="SMS alerts (simulated)" subtitle="Short texts for farmers without data or a smartphone. No real messages are sent." />{outbox}<div className="sms-input"><input value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') send() }} placeholder="Type STATUS or LOCATE C-007" aria-label="SMS command" /><Button onClick={send}>Send</Button></div><p className="sms-reply">{reply}</p></section>
}