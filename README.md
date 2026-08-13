# Remapping Tradition — Pose Space

An interactive 3D atlas of 286 traditional dance poses from nine countries. Each pose is positioned from eight globally min-max-normalized movement dimensions, with pure-dimension text anchors and value-weighted connections.

## Run locally

```bash
pnpm install
pnpm dev
```

Open the local URL printed by Vite. Transparent body cutouts are the default display, with a synchronized 0–100% diagram-overlay slider in both Settings and the selected-dance panel. The Settings panel also switches among body, diagram, and combined imagery; filters countries and dimension connections; shows, hides, and independently scales anchored pose names; toggles saturated country color filters, camera rotation, and same-direction vertical local Y-axis pose rotation adjustable from 0.5°/s to 720°/s; replays a progressive opening scene that begins the camera orbit immediately, starts pose rotation, and reveals each connection with its image; chooses curved or straight connections; and adjusts line opacity, pose scale, and spatial spread. Click any pose or use Random dance to focus it, switch among image, body transparent, image + diagram, and diagram views inside the selected-dance panel, then compare nearest or farthest dances globally, one per country, or within the same country using Euclidean distance across all eight normalized movement dimensions. Connected comparison poses animate to 200% scale with relationship lines, while the × control restores the full pose space.

## Rebuild visualization data

```bash
swift scripts/generate_body_transparent.swift public/data/poses
python3 scripts/build_visualization_data.py
```

The Swift step uses Apple's on-device foreground segmentation to regenerate each exact dancer cutout as `body-transparent.png`. The Python step regenerates `data/diagram/pose-analysis-normalized.csv`, appends normalized values to `data/diagram/index.csv`, recreates the four display assets for every complete pose, and writes `public/data/embedding.json`.
