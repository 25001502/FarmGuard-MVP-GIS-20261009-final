import type { FarmState } from '../types'

const STORAGE_KEY = 'farmguard-mvp:v2'

export function loadFarmState(): FarmState | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (!value) return null
    const parsed = JSON.parse(value) as FarmState
    return parsed.version === 1 && Array.isArray(parsed.animals) ? parsed : null
  } catch {
    return null
  }
}

export function saveFarmState(state: FarmState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* private browsing can deny storage */ }
}

export function clearFarmState(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* no-op */ }
}