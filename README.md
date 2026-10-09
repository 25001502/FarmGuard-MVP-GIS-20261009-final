# FarmGuard MVP

Offline-first livestock security and virtual-fencing prototype for Makonde Farm.

## Run locally

```bash
npm install
npm run dev
```

For a production build and local preview:

```bash
npm run build
npm run preview
```

The Vite build uses a relative base path, so the generated `dist/index.html` can be opened from a local static host or suitable browser `file://` workflow. No API key, backend, Firebase, remote map tiles or network service is required.

## Demo flow

1. Open Overview and confirm the `SIMULATION MODE · NO LIVE COLLARS` badge.
2. Use **Run guided demo** or manually move C-007 near the boundary, confirm its breach, and simulate independent tamper on C-003.
3. Open Security alerts to acknowledge or resolve each alert separately.
4. Use Live farm map → Edit boundary to drag the illustrative polygon and save a valid shape.
5. Configuration exposes the local sound/fence settings and the honest four-stage field concept.

## GIS map and boundary editing

The Live farm map now uses MapLibre GL JS with an OpenStreetMap raster basemap. The app converts the seeded demo coordinates into a real map viewport around the Makonde Farm demo region in Limpopo. In **Edit boundary** mode, drag any of the eight green vertex handles, then save the polygon. The polygon is validated before save and the existing local geofence engine immediately uses the edited shape for inside/near/outside classification.

This GIS layer is a prototype integration: the cattle positions and farm boundary are still simulated, and the map tiles require network access. OpenStreetMap attribution is rendered on the map. For production traffic, replace the public tile URL with a commercial or self-hosted tile/vector provider rather than depending on the public OSM tile server.

## Honest capability boundary

Implemented: local simulated readings, point-in-polygon and edge distance, near/outside status, three-reading breach debounce, independent tamper alerts, alert lifecycle, local persistence, responsive map/herd/alert/settings screens, and guided demo flow.

Simulated: GPS, wireless communication, collar buzzer (browser tone only), tamper sensor, battery and connectivity readings.

Not implemented: real collars, cellular delivery, remote notifications while the app is closed, authentication, cloud storage, law-enforcement dispatch, theft prediction, or animal-control/shock features. A crossing or tamper signal is not proof of theft.
