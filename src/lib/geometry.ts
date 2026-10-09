import type { BoundaryState, Point } from '../types'

const EPSILON = 0.00001

export function pointOnSegment(point: Point, a: Point, b: Point, epsilon = EPSILON): boolean {
  const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y)
  if (Math.abs(cross) > epsilon) return false
  return point.x >= Math.min(a.x, b.x) - epsilon && point.x <= Math.max(a.x, b.x) + epsilon
    && point.y >= Math.min(a.y, b.y) - epsilon && point.y <= Math.max(a.y, b.y) + epsilon
}

export function pointInPolygon(point: Point, vertices: Point[]): boolean {
  if (vertices.length < 3) return false
  let inside = false
  for (let index = 0, previous = vertices.length - 1; index < vertices.length; previous = index++) {
    const current = vertices[index]
    const prior = vertices[previous]
    if (pointOnSegment(point, prior, current)) return true
    const intersects = ((current.y > point.y) !== (prior.y > point.y))
      && point.x < (prior.x - current.x) * (point.y - current.y) / (prior.y - current.y) + current.x
    if (intersects) inside = !inside
  }
  return inside
}

export function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y)
  const projection = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (a.x + projection * dx), point.y - (a.y + projection * dy))
}

export function minDistanceToEdges(point: Point, vertices: Point[]): number {
  if (vertices.length < 2) return Number.POSITIVE_INFINITY
  return Math.min(...vertices.map((vertex, index) => distanceToSegment(point, vertex, vertices[(index + 1) % vertices.length])))
}

export function classifyBoundary(point: Point, vertices: Point[], warningDistance: number): BoundaryState {
  const distance = minDistanceToEdges(point, vertices)
  if (distance <= warningDistance + EPSILON) return 'NEAR_BOUNDARY'
  return pointInPolygon(point, vertices) ? 'INSIDE' : 'OUTSIDE'
}

/** Finds a comfortably internal point for a simulated return-to-zone route. */
export function findSafePoint(vertices: Point[], warningDistance: number, variant = 0): Point | null {
  if (vertices.length < 3) return null
  const xs = vertices.map((point) => point.x)
  const ys = vertices.map((point) => point.y)
  const minX = Math.min(...xs); const maxX = Math.max(...xs)
  const minY = Math.min(...ys); const maxY = Math.max(...ys)
  const candidates: Point[] = []
  for (let row = 2; row <= 8; row += 1) {
    for (let column = 2; column <= 8; column += 1) {
      const point = { x: minX + ((maxX - minX) * column) / 10, y: minY + ((maxY - minY) * row) / 10 }
      if (classifyBoundary(point, vertices, warningDistance) === 'INSIDE') candidates.push(point)
    }
  }
  return candidates.length ? candidates[variant % candidates.length] : null
}

export function findNearBoundaryPoint(vertices: Point[], warningDistance: number, variant = 0): Point | null {
  const safePoint = findSafePoint(vertices, warningDistance, variant)
  if (!safePoint) return null
  for (let offset = 0; offset < vertices.length; offset += 1) {
    const index = (variant + offset) % vertices.length
    const edgeEnd = vertices[(index + 1) % vertices.length]
    const edgeMidpoint = { x: (vertices[index].x + edgeEnd.x) / 2, y: (vertices[index].y + edgeEnd.y) / 2 }
    for (let step = 1; step <= 10; step += 1) {
      const fraction = step / 20
      const point = { x: edgeMidpoint.x + (safePoint.x - edgeMidpoint.x) * fraction, y: edgeMidpoint.y + (safePoint.y - edgeMidpoint.y) * fraction }
      if (classifyBoundary(point, vertices, warningDistance) === 'NEAR_BOUNDARY') return point
    }
  }
  return null
}

export function findOutsidePoint(vertices: Point[], warningDistance: number, variant = 0): Point | null {
  const safePoint = findSafePoint(vertices, warningDistance, variant)
  if (!safePoint) return null
  for (let offset = 0; offset < vertices.length; offset += 1) {
    const vertex = vertices[(variant + offset) % vertices.length]
    for (let step = 12; step <= 30; step += 1) {
      const scale = step / 10
      const point = { x: safePoint.x + (vertex.x - safePoint.x) * scale, y: safePoint.y + (vertex.y - safePoint.y) * scale }
      if (classifyBoundary(point, vertices, warningDistance) === 'OUTSIDE') return point
    }
  }
  return null
}

export function polygonArea(vertices: Point[]): number {
  if (vertices.length < 3) return 0
  return Math.abs(vertices.reduce((sum, vertex, index) => {
    const next = vertices[(index + 1) % vertices.length]
    return sum + vertex.x * next.y - next.x * vertex.y
  }, 0) / 2)
}

function orientation(a: Point, b: Point, c: Point): number {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y)
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orientation(a, b, c)
  const o2 = orientation(a, b, d)
  const o3 = orientation(c, d, a)
  const o4 = orientation(c, d, b)
  return ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0))
    && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))
}

export function isSelfIntersecting(vertices: Point[]): boolean {
  if (vertices.length < 4) return false
  for (let i = 0; i < vertices.length; i += 1) {
    const a = vertices[i]
    const b = vertices[(i + 1) % vertices.length]
    for (let j = i + 1; j < vertices.length; j += 1) {
      const c = vertices[j]
      const d = vertices[(j + 1) % vertices.length]
      if (i === j || (i + 1) % vertices.length === j || i === (j + 1) % vertices.length) continue
      if (segmentsIntersect(a, b, c, d)) return true
    }
  }
  return false
}
