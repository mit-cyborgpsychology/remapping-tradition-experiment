#!/usr/bin/env python3
"""Normalize pose scores, build an anchor-aware embedding, and make thumbnails."""

from __future__ import annotations

import csv
import hashlib
import json
import math
import os
import tempfile
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageOps


REPO = Path(__file__).resolve().parents[1]
DIAGRAM_ROOT = REPO / "data" / "diagram"
INDEX_PATH = DIAGRAM_ROOT / "index.csv"
SCORES_PATH = DIAGRAM_ROOT / "pose-analysis-scores.csv"
NORMALIZED_PATH = DIAGRAM_ROOT / "pose-analysis-normalized.csv"
PUBLIC_ROOT = REPO / "public"
POSE_ASSET_ROOT = PUBLIC_ROOT / "data" / "poses"
EMBEDDING_PATH = PUBLIC_ROOT / "data" / "embedding.json"

DIMENSIONS = [
    {
        "key": "energy",
        "label": "Energy",
        "score_field": "energy_score",
        "normalized_field": "energy_normalized",
        "color": "#ff6b4a",
    },
    {
        "key": "circles_curves",
        "label": "Circles & Curves",
        "score_field": "circles_curves_score",
        "normalized_field": "circles_curves_normalized",
        "color": "#ffbf47",
    },
    {
        "key": "axis_points",
        "label": "Axis Points",
        "score_field": "axis_points_score",
        "normalized_field": "axis_points_normalized",
        "color": "#d8ff5f",
    },
    {
        "key": "synchronous_limbs",
        "label": "Synchronous Limbs",
        "score_field": "synchronous_limbs_score",
        "normalized_field": "synchronous_limbs_normalized",
        "color": "#51e49b",
    },
    {
        "key": "external_body_spaces",
        "label": "External Body Spaces",
        "score_field": "external_body_spaces_score",
        "normalized_field": "external_body_spaces_normalized",
        "color": "#46d9ff",
    },
    {
        "key": "shifting_relations",
        "label": "Shifting Relations",
        "score_field": "shifting_relations_score",
        "normalized_field": "shifting_relations_normalized",
        "color": "#6e8cff",
    },
    {
        "key": "jumping",
        "label": "Jumping",
        "score_field": "jumping_score",
        "normalized_field": "jumping_normalized",
        "color": "#bf7cff",
    },
    {
        "key": "emotion",
        "label": "Emotion",
        "score_field": "emotion_score",
        "normalized_field": "emotion_normalized",
        "color": "#ff6fcf",
    },
]

COUNTRY_COLORS = {
    "Brunei_Darussalam": "#00e7ea",
    "Indonesia": "#ff4f32",
    "Laos": "#ffd21a",
    "Malaysia": "#19df72",
    "Myanmar": "#8f52ff",
    "Philippines": "#2388ff",
    "Singapore": "#ff3daf",
    "Thailand": "#ff8b18",
    "Vietnam": "#10d8ad",
}

def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise ValueError(f"Missing CSV header: {path}")
        return list(reader.fieldnames), list(reader)


def write_csv_atomic(
    path: Path, fieldnames: list[str], rows: list[dict[str, object]]
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        newline="",
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
        delete=False,
    )
    temporary_path = Path(handle.name)
    try:
        with handle:
            writer = csv.DictWriter(
                handle, fieldnames=fieldnames, extrasaction="ignore"
            )
            writer.writeheader()
            writer.writerows(rows)
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)


def normalize_scores(
    score_rows: list[dict[str, str]],
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    raw = np.array(
        [
            [float(row[dimension["key"]]) for dimension in DIMENSIONS]
            for row in score_rows
        ],
        dtype=float,
    )
    minimums = raw.min(axis=0)
    maximums = raw.max(axis=0)
    spans = maximums - minimums
    if np.any(spans <= 0):
        raise ValueError("Every dimension must have a nonzero global range")
    normalized = (raw - minimums) / spans
    return raw, normalized, np.vstack([minimums, maximums])


def embedding_positions(normalized: np.ndarray) -> np.ndarray:
    """Project poses alone, whiten the 3D axes, then repel close overlaps."""
    standardized = (
        normalized - normalized.mean(axis=0, keepdims=True)
    ) / np.maximum(normalized.std(axis=0, keepdims=True), 1e-9)
    _, _, axes = np.linalg.svd(standardized, full_matrices=False)
    positions = standardized @ axes[:3].T
    positions -= np.median(positions, axis=0, keepdims=True)
    robust_scale = np.percentile(np.abs(positions), 98, axis=0)
    positions = positions / np.maximum(robust_scale, 1e-9) * 4.5

    # Stable jitter separates exact score profiles before force relaxation.
    for row_index in range(len(positions)):
        angle = row_index * math.pi * (3.0 - math.sqrt(5.0))
        positions[row_index] += np.array(
            [math.cos(angle), math.sin(angle), math.cos(angle * 0.61)]
        ) * 0.055

    semantic_positions = positions.copy()
    minimum_separation = 0.62
    for _ in range(140):
        delta = positions[:, None, :] - positions[None, :, :]
        distances = np.linalg.norm(delta, axis=2)
        active = (distances > 1e-9) & (distances < minimum_separation)
        strength = np.where(
            active,
            (minimum_separation - distances) / minimum_separation,
            0.0,
        )
        directions = delta / np.maximum(distances[:, :, None], 1e-9)
        repulsion = (directions * strength[:, :, None]).sum(axis=1)
        positions += np.clip(repulsion, -1.2, 1.2) * 0.028
        positions += (semantic_positions - positions) * 0.012

    positions -= positions.mean(axis=0, keepdims=True)
    return positions


def dimension_anchor_positions(
    normalized: np.ndarray, positions: np.ndarray
) -> np.ndarray:
    """Place labels after projection, toward the high-value score gradient."""
    centered_scores = normalized - normalized.mean(axis=0, keepdims=True)
    centered_positions = positions - positions.mean(axis=0, keepdims=True)
    gradients = centered_scores.T @ centered_positions
    gradient_norms = np.linalg.norm(gradients, axis=1, keepdims=True)
    directions = gradients / np.maximum(gradient_norms, 1e-9)
    semantic_directions = directions.copy()

    # Keep correlated dimension labels from occupying the same screen region.
    jitter = np.array(
        [
            [-1, -1, -1],
            [1, -1, -1],
            [-1, 1, -1],
            [1, 1, -1],
            [-1, -1, 1],
            [1, -1, 1],
            [-1, 1, 1],
            [1, 1, 1],
        ],
        dtype=float,
    )
    jitter /= np.linalg.norm(jitter, axis=1, keepdims=True)
    directions += jitter * 0.045
    directions /= np.linalg.norm(directions, axis=1, keepdims=True)
    minimum_similarity = math.cos(math.radians(43.0))
    for _ in range(220):
        repulsion = np.zeros_like(directions)
        for first in range(len(directions)):
            for second in range(first + 1, len(directions)):
                similarity = float(directions[first] @ directions[second])
                if similarity <= minimum_similarity:
                    continue
                separation = directions[first] - directions[second]
                separation /= max(float(np.linalg.norm(separation)), 1e-9)
                magnitude = (similarity - minimum_similarity) * 0.55
                repulsion[first] += separation * magnitude
                repulsion[second] -= separation * magnitude
        semantic_tether = semantic_directions - (
            (semantic_directions * directions).sum(axis=1, keepdims=True)
            * directions
        )
        directions += repulsion * 0.055 + semantic_tether * 0.008
        directions /= np.linalg.norm(directions, axis=1, keepdims=True)

    pose_radius = float(np.percentile(np.linalg.norm(centered_positions, axis=1), 98))
    return directions * (pose_radius + 1.55)


def open_rgba(source: Path) -> Image.Image:
    with Image.open(source) as opened:
        return ImageOps.exif_transpose(opened).convert("RGBA")


def fit_thumbnail(image: Image.Image) -> Image.Image:
    image = image.copy()
    image.thumbnail((512, 512), Image.Resampling.LANCZOS)
    return image


def make_bright_diagram(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A").filter(ImageFilter.MaxFilter(5))
    alpha = alpha.point(lambda value: min(255, round(value * 1.55)))
    bright = Image.new("RGBA", image.size, (255, 255, 255, 0))
    bright.putalpha(alpha)
    return bright


def build_pose_thumbnails(
    assets: dict[str, Path], pose_directory: Path
) -> tuple[tuple[int, int], tuple[int, int], tuple[int, int]]:
    body_path = pose_directory / "body.webp"
    overlay_path = pose_directory / "body-with-diagram.webp"
    diagram_path = pose_directory / "diagram.png"
    pose_directory.mkdir(parents=True, exist_ok=True)

    body_source = open_rgba(assets["Body"])
    diagram_source = open_rgba(assets["Transparent_Diagram"])
    if diagram_source.size != body_source.size:
        diagram_source = diagram_source.resize(
            body_source.size, Image.Resampling.LANCZOS
        )

    body = fit_thumbnail(body_source)
    diagram = make_bright_diagram(fit_thumbnail(diagram_source))
    if diagram.size != body.size:
        diagram = diagram.resize(body.size, Image.Resampling.LANCZOS)
    overlay = Image.alpha_composite(body, diagram)

    if not body_path.exists():
        body.save(body_path, "WEBP", quality=86, method=4, exact=True)
    overlay.save(overlay_path, "WEBP", quality=90, method=4, exact=True)
    diagram.save(diagram_path, "PNG", compress_level=6)
    return body.size, overlay.size, diagram.size


def main() -> None:
    _, score_rows = read_csv(SCORES_PATH)
    index_fields, index_rows = read_csv(INDEX_PATH)
    score_rows.sort(key=lambda row: (row["country"], int(row["number"])))

    raw, normalized, extrema = normalize_scores(score_rows)
    positions = embedding_positions(normalized)
    anchor_positions = dimension_anchor_positions(normalized, positions)
    score_lookup = {
        (row["country"], row["number"]): normalized[index]
        for index, row in enumerate(score_rows)
    }

    normalized_fields = [
        dimension["normalized_field"] for dimension in DIMENSIONS
    ]
    normalized_rows: list[dict[str, object]] = []
    for row_index, score_row in enumerate(score_rows):
        output_row: dict[str, object] = dict(score_row)
        for dimension_index, dimension in enumerate(DIMENSIONS):
            output_row[dimension["normalized_field"]] = round(
                normalized[row_index, dimension_index] * 100.0, 3
            )
        normalized_rows.append(output_row)
    write_csv_atomic(
        NORMALIZED_PATH,
        list(score_rows[0]) + normalized_fields,
        normalized_rows,
    )

    output_index_fields = [
        field for field in index_fields if field not in normalized_fields
    ] + normalized_fields
    for row in index_rows:
        pose_values = score_lookup.get((row["country"], row["number"]))
        for dimension_index, dimension in enumerate(DIMENSIONS):
            row[dimension["normalized_field"]] = (
                ""
                if pose_values is None
                else f"{pose_values[dimension_index] * 100.0:.3f}"
            )
    write_csv_atomic(INDEX_PATH, output_index_fields, index_rows)

    asset_lookup: dict[tuple[str, str], dict[str, Path]] = defaultdict(dict)
    for row in index_rows:
        key = (row["country"], row["number"])
        if row["type"] in {
            "Body",
            "Body_with_Diagram",
            "Transparent_Diagram",
        }:
            asset_lookup[key][row["type"]] = (
                DIAGRAM_ROOT / row["destination_relative_path"]
            )

    thumbnail_jobs: list[tuple[dict[str, Path], Path]] = []
    for score_row in score_rows:
        country = score_row["country"]
        number = score_row["number"]
        key = (country, number)
        assets = asset_lookup[key]
        required = {"Body", "Body_with_Diagram", "Transparent_Diagram"}
        if set(assets) != required:
            raise ValueError(f"Incomplete visualization modes for {key}: {assets}")
        thumbnail_jobs.append((assets, POSE_ASSET_ROOT / country / number))

    with ThreadPoolExecutor(max_workers=4) as executor:
        thumbnail_sizes = list(
            executor.map(
                lambda job: build_pose_thumbnails(job[0], job[1]),
                thumbnail_jobs,
            )
        )

    poses: list[dict[str, object]] = []
    for row_index, score_row in enumerate(score_rows):
        country = score_row["country"]
        number = score_row["number"]
        body_size, overlay_size, diagram_size = thumbnail_sizes[row_index]

        raw_values = {
            dimension["key"]: int(score_row[dimension["key"]])
            for dimension in DIMENSIONS
        }
        normalized_values = {
            dimension["key"]: round(
                normalized[row_index, dimension_index] * 100.0, 3
            )
            for dimension_index, dimension in enumerate(DIMENSIONS)
        }
        poses.append(
            {
                "id": f"{country}_{number}",
                "country": country,
                "countryLabel": country.replace("_", " "),
                "number": number,
                "position": [round(float(value), 5) for value in positions[row_index]],
                "raw": raw_values,
                "normalized": normalized_values,
                "assets": {
                    "body": f"/data/poses/{country}/{number}/body.webp",
                    "overlay": f"/data/poses/{country}/{number}/body-with-diagram.webp",
                    "diagram": f"/data/poses/{country}/{number}/diagram.png",
                },
                "aspect": {
                    "body": round(body_size[0] / body_size[1], 5),
                    "overlay": round(overlay_size[0] / overlay_size[1], 5),
                    "diagram": round(diagram_size[0] / diagram_size[1], 5),
                },
            }
        )

    dimensions = []
    for dimension_index, dimension in enumerate(DIMENSIONS):
        vector = [0.0] * len(DIMENSIONS)
        vector[dimension_index] = 100.0
        dimensions.append(
            {
                "key": dimension["key"],
                "label": dimension["label"],
                "color": dimension["color"],
                "position": [
                    round(float(value), 5)
                    for value in anchor_positions[dimension_index]
                ],
                "normalized": vector,
            }
        )

    payload = {
        "schemaVersion": 2,
        "generatedFrom": "data/diagram/pose-analysis-scores.csv",
        "normalization": {
            "method": "global_min_max",
            "range": [0, 100],
            "extrema": {
                dimension["key"]: {
                    "minimum": int(extrema[0, dimension_index]),
                    "maximum": int(extrema[1, dimension_index]),
                }
                for dimension_index, dimension in enumerate(DIMENSIONS)
            },
        },
        "embedding": {
            "method": "pose_only_whitened_pca_with_repulsion",
            "dimensions": 8,
            "components": 3,
            "minimumSeparation": 0.62,
            "note": "Only poses participate in the projection. Semantic labels are placed afterward along each dimension's high-score gradient, and remain pure 8D basis vectors.",
        },
        "countryColors": COUNTRY_COLORS,
        "dimensions": dimensions,
        "poses": poses,
    }
    EMBEDDING_PATH.parent.mkdir(parents=True, exist_ok=True)
    EMBEDDING_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )

    thumbnail_files = list(POSE_ASSET_ROOT.rglob("*"))
    thumbnail_files = [path for path in thumbnail_files if path.is_file()]
    fingerprint = hashlib.sha256(EMBEDDING_PATH.read_bytes()).hexdigest()
    print(
        json.dumps(
            {
                "poses": len(poses),
                "dimensions": len(dimensions),
                "thumbnails": len(thumbnail_files),
                "embedding_sha256": fingerprint,
                "normalized_csv": str(NORMALIZED_PATH),
                "embedding_json": str(EMBEDDING_PATH),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
