import { describe, expect, it } from 'vitest'
import { classifyBoundary, findNearBoundaryPoint, findOutsidePoint, findSafePoint, isSelfIntersecting, minDistanceToEdges, pointInPolygon, polygonArea } from './geometry'

const square = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]

describe('geofence geometry', () => {
  it('classifies inside, near-edge and outside points', () => {
    expect(pointInPolygon({ x: 50, y: 50 }, square)).toBe(true)
    expect(classifyBoundary({ x: 50, y: 50 }, square, 10)).toBe('INSIDE')
    expect(classifyBoundary({ x: 5, y: 50 }, square, 10)).toBe('NEAR_BOUNDARY')
    expect(classifyBoundary({ x: 150, y: 50 }, square, 10)).toBe('OUTSIDE')
  })

  it('treats a point on an edge as near-boundary', () => {
    expect(pointInPolygon({ x: 0, y: 50 }, square)).toBe(true)
    expect(classifyBoundary({ x: 0, y: 50 }, square, 10)).toBe('NEAR_BOUNDARY')
    expect(minDistanceToEdges({ x: 0, y: 50 }, square)).toBe(0)
  })

  it('validates area and self-intersection', () => {
    expect(polygonArea(square)).toBe(10000)
    expect(isSelfIntersecting(square)).toBe(false)
    expect(isSelfIntersecting([{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 100, y: 0 }])).toBe(true)
  })

  it('finds a point safely inside a grazing area', () => {
    const target = findSafePoint(square, 10, 2)
    expect(target).not.toBeNull()
    expect(classifyBoundary(target!, square, 10)).toBe('INSIDE')
  })

  it('finds positions for proximity and breach simulations', () => {
    const near = findNearBoundaryPoint(square, 10)
    const outside = findOutsidePoint(square, 10)
    expect(classifyBoundary(near!, square, 10)).toBe('NEAR_BOUNDARY')
    expect(classifyBoundary(outside!, square, 10)).toBe('OUTSIDE')
  })
})
