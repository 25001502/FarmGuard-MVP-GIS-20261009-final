import { describe, expect, it } from 'vitest'
import { createInitialState } from '../data'
import { isUnusual, liveTick, smsReply, soundLevel } from './live'

describe('live tracking helpers', () => {
  it('raises the sound level as an animal nears and crosses the fence', () => {
    const fence = createInitialState().geofence
    expect(soundLevel({ x: 450, y: 300 }, fence)).toBe(0)
    expect(soundLevel({ x: 760, y: 300 }, fence)).toBeGreaterThan(0)
    expect(soundLevel({ x: 900, y: 360 }, fence)).toBe(4)
  })

  it('flags a sudden jump in movement but not steady walking', () => {
    const steady = [4, 3, 5, 4, 3, 4, 5, 4, 3, 4, 4, 5]
    expect(isUnusual(steady)).toBe(false)
    expect(isUnusual([...steady.slice(0, 9), 40, 45, 38])).toBe(true)
  })

  it('keeps 12 animals and answers SMS commands', () => {
    const state = liveTick(createInitialState()).next
    expect(state.animals).toHaveLength(12)
    expect(smsReply('status', state)).toContain('12 animals')
    expect(smsReply('LOCATE C-007', state)).toContain('Thabo')
  })
})