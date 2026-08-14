# Remapping Tradition

An interactive 3D atlas of 286 traditional dance poses from nine countries. Settings can switch among the original eight-dimension V1, the full-landmark 107-dimension V2, and the key-position 38-dimension V3 while retaining the eight pure-dimension text anchors and value-weighted connections.

## Embedding versions

- **V1** is the default and is preserved in `public/data/embedding-v1.json`, with its matching `data/diagram/pose-analysis-normalized-v1.csv` and `data/diagram/index-v1.csv` snapshots. `public/data/embedding.json` also mirrors V1 for backward compatibility.
- **V2** is selectable from Settings and stored in `public/data/embedding-v2.json`. It combines the eight movement dimensions with 99 posture dimensions: x, y, and z for each of MediaPipe Pose Landmarker’s 33 body landmarks.
- **V3** is selectable from Settings and stored in `public/data/embedding-v3.json`. It combines the eight movement dimensions with 30 posture dimensions: x, y, and z for Head, Left Hand, Right Hand, Left Arm, Right Arm, Left Leg, Right Leg, Body, Left Foot, and Right Foot. Every body-part axis is independently min-max normalized across all 286 poses so its collection-wide minimum is 0 and maximum is 100.

V2 runs the MediaPipe heavy model on every `Body_with_Diagram` image. The 273 images detected directly use those results; 13 difficult detections use the matching `Body` image and are explicitly marked as `Body_fallback` in `data/diagram/mediapipe-pose-landmarks-v2.json` and `.csv`. Coordinates are centered on the hip midpoint and normalized by torso scale. The eight-dimension and 99-dimension blocks are independently standardized and equally weighted before the 107D-to-3D PCA projection, so the larger posture block does not overwhelm the original movement analysis. Similar/different dance comparisons also use the full 107D V2 feature vector.

V3 reuses those validated MediaPipe coordinates with this mapping: Head = nose, Hands = wrists, Arms = elbows, Legs = knees, Feet = foot-index landmarks, and Body = the average of both shoulders and hips. The Body center is derived because the hip midpoint is already the posture-coordinate origin. After that pose-level coordinate normalization, each of the 30 body-part axes is globally min-max normalized to 0–100 across the full collection. The eight-dimension and 30-dimension blocks are then independently standardized and equally weighted before the 38D-to-3D projection. V3 similarity/difference comparisons use the full 38D vector, while the original MediaPipe coordinates remain available in the V3 JSON and feature CSV for auditing.

## Run locally

```bash
pnpm install
pnpm dev
```

Open the local URL printed by Vite. V1 is the default embedding, and Settings switches among V1, V2, and V3 without reloading the page. Transparent body cutouts are the default display, with a synchronized 0–100% diagram-overlay slider in both Settings and the selected-dance panel. The Settings panel also switches among body, diagram, and combined imagery; filters countries and dimension connections; shows, hides, and independently scales anchored pose names; toggles saturated country color filters, camera rotation, and same-direction vertical local Y-axis pose rotation adjustable from 0.5°/s to 720°/s; replays a progressive opening scene that begins the camera orbit immediately, starts pose rotation, and reveals each connection with its image; chooses curved or straight connections; and adjusts line opacity, pose scale, and spatial spread. Click any pose or use Random dance to focus it, switch among image, body transparent, image + diagram, and diagram views inside the selected-dance panel, then compare nearest or farthest dances globally, one per country, or within the same country. V1 comparison uses 8 dimensions, V2 uses 107, and V3 uses 38. Connected comparison poses animate to 200% scale with relationship lines, while the × control restores the full pose space.

## Build V3 visualization data

```bash
python3 scripts/build_visualization_data_v3.py
python3 scripts/validate_embedding_v3.py
```

V3 uses the existing validated MediaPipe landmark dataset, writes the 38-column per-pose table to `data/diagram/pose-analysis-features-v3.csv`, and writes the selectable visualization payload to `public/data/embedding-v3.json`. It does not change the V1 default.

## Rebuild V2 visualization data

```bash
python3 -m pip install -r scripts/requirements-mediapipe.txt
curl -fL https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task -o pose_landmarker_heavy.task
python3 scripts/analyze_mediapipe_pose.py --model pose_landmarker_heavy.task
python3 scripts/build_visualization_data_v2.py
python3 scripts/validate_embedding_v2.py
```

The MediaPipe analysis writes complete raw image coordinates, world coordinates, visibility values, and hip-centered/torso-normalized posture coordinates to `data/diagram/mediapipe-pose-landmarks-v2.json` and `.csv`. The V2 builder writes the 107-column per-pose table to `data/diagram/pose-analysis-features-v2.csv`, adds the 99 posture dimensions to `data/diagram/index.csv`, writes `embedding-v2.json`, and keeps the backward-compatible `embedding.json` default synchronized with V1.

To regenerate the transparent body display assets separately, run:

```bash
swift scripts/generate_body_transparent.swift public/data/poses
python3 scripts/build_visualization_data.py
python3 scripts/build_visualization_data_v2.py
```
