import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { FarmState, Point } from '../types'
import { Icon } from './MapIcon'

const GEO_BOUNDS = { west: 30.08, east: 30.36, north: -22.82, south: -23.1 }

const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
      maxzoom: 19,
    },
    satellite: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics and the GIS User Community',
      maxzoom: 17,
    },
  },
  layers: [
    { id: 'osm', type: 'raster', source: 'osm', layout: { visibility: 'none' } },
    { id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: 'visible' } },
  ],
}

function toggleStyle(active: boolean): CSSProperties {
  const style: CSSProperties = {
    paddingTop: 7,
    paddingBottom: 7,
    paddingLeft: 12,
    paddingRight: 12,
    borderWidth: 0,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    backgroundColor: '#ffffff',
    color: '#174a35',
  }
  if (active) {
    style.backgroundColor = '#174a35'
    style.color = '#ffffff'
  }
  return style
}

function localToGeo(point: Point): [number, number] {
  const longitude = GEO_BOUNDS.west + (point.x / 950) * (GEO_BOUNDS.east - GEO_BOUNDS.west)
  const latitude = GEO_BOUNDS.north - (point.y / 580) * (GEO_BOUNDS.north - GEO_BOUNDS.south)
  return [longitude, latitude]
}

function geoToLocal(longitude: number, latitude: number): Point {
  return {
    x: Math.max(0, Math.min(950, ((longitude - GEO_BOUNDS.west) / (GEO_BOUNDS.east - GEO_BOUNDS.west)) * 950)),
    y: Math.max(0, Math.min(580, ((GEO_BOUNDS.north - latitude) / (GEO_BOUNDS.north - GEO_BOUNDS.south)) * 580)),
  }
}

function polygonFeature(vertices: Point[]) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'Polygon' as const, coordinates: [[...vertices.map(localToGeo), localToGeo(vertices[0])]] },
  }
}

export function RealFarmMap({ state, onSelect, editable = false, draftVertices, onVertexDrag }: { state: FarmState; onSelect: (id: string) => void; editable?: boolean; draftVertices?: Point[]; onVertexDrag?: (index: number, point: Point) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const mapReadyRef = useRef(false)
  const [mapReady, setMapReady] = useState(false)
  const [mapStyle, setMapStyle] = useState<'satellite' | 'streets'>('satellite')
  const vertexMarkersRef = useRef<Marker[]>([])
  const animalMarkersRef = useRef<Map<string, Marker>>(new Map())
  const selectRef = useRef(onSelect)
  const vertexDragRef = useRef(onVertexDrag)
  const fenceRef = useRef(draftVertices ?? state.geofence.vertices)
  selectRef.current = onSelect
  vertexDragRef.current = onVertexDrag
  fenceRef.current = draftVertices ?? state.geofence.vertices

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    maplibregl.setWorkerUrl(maplibreWorkerUrl)
    const map = new maplibregl.Map({ container: containerRef.current, style: MAP_STYLE, bounds: [[GEO_BOUNDS.west, GEO_BOUNDS.south], [GEO_BOUNDS.east, GEO_BOUNDS.north]], fitBoundsOptions: { padding: 42, duration: 0 }, minZoom: 7, maxZoom: 18, attributionControl: false })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-right')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    map.once('load', () => {
      map.addSource('farmguard-geofence', { type: 'geojson', data: polygonFeature(fenceRef.current) })
      map.addLayer({ id: 'farmguard-geofence-fill', type: 'fill', source: 'farmguard-geofence', paint: { 'fill-color': '#2c8b5a', 'fill-opacity': 0.19 } })
      map.addLayer({ id: 'farmguard-geofence-line', type: 'line', source: 'farmguard-geofence', paint: { 'line-color': '#174a35', 'line-width': 3, 'line-dasharray': [2, 2] } })
      map.resize()
      requestAnimationFrame(() => {
        mapReadyRef.current = true
        setMapReady(true)
      })
    })
    mapRef.current = map
    return () => { vertexMarkersRef.current.forEach((marker) => marker.remove()); animalMarkersRef.current.forEach((marker) => marker.remove()); map.remove(); mapRef.current = null; mapReadyRef.current = false; setMapReady(false) }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const source = map.getSource('farmguard-geofence') as GeoJSONSource | undefined
    if (source) source.setData(polygonFeature(draftVertices ?? state.geofence.vertices))
    if (map.getLayer('farmguard-geofence-fill')) map.setLayoutProperty('farmguard-geofence-fill', 'visibility', state.fenceVisible ? 'visible' : 'none')
    if (map.getLayer('farmguard-geofence-line')) map.setLayoutProperty('farmguard-geofence-line', 'visibility', state.fenceVisible ? 'visible' : 'none')
  }, [draftVertices, mapReady, state.geofence.vertices, state.fenceVisible])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    let satelliteVisibility: 'visible' | 'none' = 'none'
    let streetVisibility: 'visible' | 'none' = 'visible'
    let fenceColor = '#174a35'
    if (mapStyle === 'satellite') {
      satelliteVisibility = 'visible'
      streetVisibility = 'none'
      fenceColor = '#ffffff'
    }
    map.setLayoutProperty('satellite', 'visibility', satelliteVisibility)
    map.setLayoutProperty('osm', 'visibility', streetVisibility)
    map.setPaintProperty('farmguard-geofence-line', 'line-color', fenceColor)
  }, [mapStyle, mapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    vertexMarkersRef.current.forEach((marker) => marker.remove())
    vertexMarkersRef.current = []
    if (!editable) return
    const vertices = draftVertices ?? state.geofence.vertices
    vertices.forEach((point, index) => {
      const element = document.createElement('button')
      element.type = 'button'; element.className = 'gis-vertex-marker'; element.setAttribute('aria-label', `Move boundary point ${index + 1}`); element.title = `Boundary point ${index + 1}`
      const marker = new maplibregl.Marker({ element, draggable: true }).setLngLat(localToGeo(point)).addTo(map)
      marker.on('drag', () => { const position = marker.getLngLat(); vertexDragRef.current?.(index, geoToLocal(position.lng, position.lat)) })
      vertexMarkersRef.current.push(marker)
    })
  }, [editable, mapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const currentIds = new Set(state.animals.map((animal) => animal.id))
    animalMarkersRef.current.forEach((marker, id) => { if (!currentIds.has(id)) { marker.remove(); animalMarkersRef.current.delete(id) } })
    state.animals.forEach((animal) => {
      const security = state.security[animal.id]
      const colorClass = security.boundary === 'OUTSIDE' || security.tamperActive ? 'danger' : security.boundary === 'NEAR_BOUNDARY' ? 'warning' : 'safe'
      let marker = animalMarkersRef.current.get(animal.id)
      if (!marker) {
        const element = document.createElement('button')
        element.type = 'button'; element.className = 'gis-animal-marker'; element.addEventListener('click', () => selectRef.current(animal.id))
        marker = new maplibregl.Marker({ element, anchor: 'center' }).setLngLat(localToGeo(animal.position)).addTo(map)
        animalMarkersRef.current.set(animal.id, marker)
      }
      if (!marker) return
      const element = marker.getElement()
      element.className = `gis-animal-marker ${colorClass} ${state.selectedAnimalId === animal.id ? 'selected' : ''}`
      element.setAttribute('aria-label', `${animal.id} ${animal.name}, ${security.boundary}`); element.title = `${animal.id} · ${animal.name} · ${security.boundary}`
      element.innerHTML = `<span class="gis-animal-glyph"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10V7L3 5v5l3 2M18 10V7l3-2v5l-3 2"/><path d="M6 9Q12 5 18 9v6a6 6 0 0 1-12 0V9Z"/><path d="M9 13h.01M15 13h.01M10 17q2 1 4 0"/></svg></span>${state.selectedAnimalId === animal.id ? `<b>${animal.id}</b>` : ''}`
      marker.setLngLat(localToGeo(animal.position))
    })
  }, [mapReady, state.animals, state.security, state.selectedAnimalId])

  let sourceLabel = 'OpenStreetMap'
  if (mapStyle === 'satellite') sourceLabel = 'Esri satellite imagery'

  return <div className="map-wrap gis-map-wrap"><div ref={containerRef} className="gis-map-canvas" role="img" aria-label={'Interactive ' + sourceLabel + ' view of the Makonde Farm demo region with simulated cattle and editable safe zone'} /><div style={{ position: 'absolute', top: 12, right: 56, zIndex: 5, display: 'flex', borderRadius: 8, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}><button type="button" style={toggleStyle(mapStyle === 'satellite')} onClick={() => setMapStyle('satellite')}>Satellite</button><button type="button" style={toggleStyle(mapStyle === 'streets')} onClick={() => setMapStyle('streets')}>Map</button></div><div className="gis-map-badge"><Icon name="map" size={15} /> {sourceLabel} · GIS prototype</div><div className="gis-map-legend"><span><i className="legend-fence" /> Safe zone</span><span><i className="legend-safe" /> Inside</span><span><i className="legend-warning" /> Near edge</span><span><i className="legend-danger" /> Alert</span></div><div className="gis-map-caption">Demo coordinates · no live GPS</div></div>
}