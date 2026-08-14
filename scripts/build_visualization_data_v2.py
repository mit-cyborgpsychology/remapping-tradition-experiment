#!/usr/bin/env python3
"""Build V2 from eight semantic scores plus 33 MediaPipe pose landmarks."""

from __future__ import annotations

import csv
import hashlib
import json
import math
from pathlib import Path

import numpy as np

from build_visualization_data import (
    COUNTRY_COLORS,
    DIAGRAM_ROOT,
    DIMENSIONS,
    INDEX_PATH,
    NORMALIZED_PATH,
    POSE_ASSET_ROOT,
    SCORES_PATH,
    dimension_anchor_positions,
    normalize_scores,
    read_csv,
    write_csv_atomic,
)


REPO = Path(__file__).resolve().parents[1]
LANDMARK_PATH = DIAGRAM_ROOT / "mediapipe-pose-landmarks-v2.json"
FEATURE_CSV_PATH = DIAGRAM_ROOT / "pose-analysis-features-v2.csv"
V1_EMBEDDING_PATH = REPO / "public" / "data" / "embedding-v1.json"
V2_EMBEDDING_PATH = REPO / "public" / "data" / "embedding-v2.json"
ACTIVE_EMBEDDING_PATH = REPO / "public" / "data" / "embedding.json"


def embedding_positions_v2(features: np.ndarray) -> np.ndarray:
    """Project block-balanced features, then repel close thumbnail overlaps."""
    _, _, axes = np.linalg.svd(features, full_matrices=False)
    positions = features @ axes[:3].T
    positions -= np.median(positions, axis=0, keepdims=True)
    robust_scale = np.percentile(np.abs(positions), 98, axis=0)
    positions = positions / np.maximum(robust_scale, 1e-9) * 4.5

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


def zscore(values: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    means = values.mean(axis=0)
    standard_deviations = values.std(axis=0)
    standardized = (values - means) / np.maximum(standard_deviations, 1e-9)
    return standardized, means, standard_deviations


def main() -> None:
    if not V1_EMBEDDING_PATH.is_file():
        raise FileNotFoundError(
            "V1 must be preserved at public/data/embedding-v1.json before V2 is built"
        )
    landmark_payload = json.loads(LANDMARK_PATH.read_text(encoding="utf-8"))
    landmark_names: list[str] = landmark_payload["landmarkNames"]
    landmark_records = {
        record["id"]: record for record in landmark_payload["records"]
    }

    _, score_rows = read_csv(SCORES_PATH)
    score_rows.sort(key=lambda row: (row["country"], int(row["number"])))
    raw_scores, normalized_scores, extrema = normalize_scores(score_rows)
    posture_rows: list[np.ndarray] = []
    for score_row in score_rows:
        pose_id = f"{score_row['country']}_{score_row['number']}"
        record = landmark_records.get(pose_id)
        if record is None:
            raise ValueError(f"Missing MediaPipe record for {pose_id}")
        coordinates = np.asarray(record["poseCoordinates"], dtype=float)
        if coordinates.shape != (len(landmark_names), 3):
            raise ValueError(f"Unexpected MediaPipe coordinate shape for {pose_id}")
        posture_rows.append(coordinates.reshape(-1))
    posture_coordinates = np.vstack(posture_rows)

    semantic_z, semantic_means, semantic_stds = zscore(normalized_scores)
    posture_z, posture_means, posture_stds = zscore(posture_coordinates)
    semantic_weight = 1.0 / math.sqrt(semantic_z.shape[1])
    posture_weight = 1.0 / math.sqrt(posture_z.shape[1])
    feature_vectors = np.hstack(
        [semantic_z * semantic_weight, posture_z * posture_weight]
    )
    positions = embedding_positions_v2(feature_vectors)
    anchor_positions = dimension_anchor_positions(normalized_scores, positions)

    feature_keys = [dimension["key"] for dimension in DIMENSIONS]
    posture_feature_keys = [
        f"pose_{landmark_name}_{axis}"
        for landmark_name in landmark_names
        for axis in "xyz"
    ]
    feature_keys.extend(posture_feature_keys)

    feature_rows: list[dict[str, object]] = []
    posture_lookup: dict[tuple[str, str], np.ndarray] = {}
    for row_index, score_row in enumerate(score_rows):
        output_row: dict[str, object] = {
            "country": score_row["country"],
            "number": score_row["number"],
        }
        for dimension_index, dimension in enumerate(DIMENSIONS):
            output_row[dimension["normalized_field"]] = round(
                normalized_scores[row_index, dimension_index] * 100.0, 5
            )
        for feature_index, feature_key in enumerate(posture_feature_keys):
            output_row[feature_key] = round(
                float(posture_coordinates[row_index, feature_index]), 7
            )
        feature_rows.append(output_row)
        posture_lookup[(score_row["country"], score_row["number"])] = (
            posture_coordinates[row_index]
        )
    write_csv_atomic(FEATURE_CSV_PATH, list(feature_rows[0]), feature_rows)

    index_fields, index_rows = read_csv(INDEX_PATH)
    output_index_fields = [
        field for field in index_fields if field not in posture_feature_keys
    ] + posture_feature_keys
    for index_row in index_rows:
        values = posture_lookup.get((index_row["country"], index_row["number"]))
        for feature_index, feature_key in enumerate(posture_feature_keys):
            index_row[feature_key] = (
                "" if values is None else f"{values[feature_index]:.7f}"
            )
    write_csv_atomic(INDEX_PATH, output_index_fields, index_rows)

    v1_payload = json.loads(V1_EMBEDDING_PATH.read_text(encoding="utf-8"))
    v1_pose_lookup = {pose["id"]: pose for pose in v1_payload["poses"]}
    poses: list[dict[str, object]] = []
    for row_index, score_row in enumerate(score_rows):
        country = score_row["country"]
        number = score_row["number"]
        pose_id = f"{country}_{number}"
        landmark_record = landmark_records[pose_id]
        source_pose = v1_pose_lookup[pose_id]
        normalized_values = {
            dimension["key"]: round(
                normalized_scores[row_index, dimension_index] * 100.0, 3
            )
            for dimension_index, dimension in enumerate(DIMENSIONS)
        }
        raw_values = {
            dimension["key"]: int(raw_scores[row_index, dimension_index])
            for dimension_index, dimension in enumerate(DIMENSIONS)
        }
        landmark_values = {
            landmark_name: {
                "x": round(
                    float(posture_coordinates[row_index, landmark_index * 3]), 6
                ),
                "y": round(
                    float(posture_coordinates[row_index, landmark_index * 3 + 1]),
                    6,
                ),
                "z": round(
                    float(posture_coordinates[row_index, landmark_index * 3 + 2]),
                    6,
                ),
                "visibility": landmark_record["visibility"][landmark_index],
            }
            for landmark_index, landmark_name in enumerate(landmark_names)
        }
        poses.append(
            {
                "id": pose_id,
                "country": country,
                "countryLabel": country.replace("_", " "),
                "number": number,
                "position": [
                    round(float(value), 5) for value in positions[row_index]
                ],
                "raw": raw_values,
                "normalized": normalized_values,
                "featureVector": [
                    round(float(value), 6) for value in feature_vectors[row_index]
                ],
                "posture": {
                    "coordinateSystem": "hip-centered torso-scale-normalized MediaPipe world coordinates",
                    "meanVisibility": landmark_record["meanVisibility"],
                    "landmarks": landmark_values,
                },
                "assets": source_pose["assets"],
                "aspect": source_pose["aspect"],
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

    feature_schema = [
        {
            "key": dimension["key"],
            "label": dimension["label"],
            "source": "movement_score",
        }
        for dimension in DIMENSIONS
    ] + [
        {
            "key": feature_key,
            "label": feature_key.removeprefix("pose_").replace("_", " ").title(),
            "source": "mediapipe_pose_landmarker",
        }
        for feature_key in posture_feature_keys
    ]

    payload = {
        "schemaVersion": 3,
        "embeddingVersion": "v2",
        "generatedFrom": [
            "data/diagram/pose-analysis-scores.csv",
            "data/diagram/mediapipe-pose-landmarks-v2.json",
        ],
        "normalization": {
            "semantic": {
                "method": "global_min_max",
                "range": [0, 100],
                "extrema": {
                    dimension["key"]: {
                        "minimum": int(extrema[0, dimension_index]),
                        "maximum": int(extrema[1, dimension_index]),
                    }
                    for dimension_index, dimension in enumerate(DIMENSIONS)
                },
                "means": np.round(semantic_means, 7).tolist(),
                "standardDeviations": np.round(semantic_stds, 7).tolist(),
            },
            "posture": {
                "method": "hip_centered_torso_scale_then_global_zscore",
                "means": np.round(posture_means, 7).tolist(),
                "standardDeviations": np.round(posture_stds, 7).tolist(),
            },
        },
        "embedding": {
            "method": "block_balanced_pca_with_repulsion",
            "dimensions": len(feature_keys),
            "semanticDimensions": len(DIMENSIONS),
            "postureDimensions": len(posture_feature_keys),
            "components": 3,
            "minimumSeparation": 0.62,
            "blockWeights": {"semantic": 0.5, "posture": 0.5},
            "note": "V2 concatenates eight normalized movement scores with x/y/z for 33 MediaPipe landmarks. Each block is z-scored and divided by the square root of its dimensionality before PCA so both blocks contribute equally.",
        },
        "mediapipe": {
            "engine": landmark_payload["engine"],
            "version": landmark_payload["mediapipeVersion"],
            "model": landmark_payload["model"],
            "inputMode": landmark_payload["inputMode"],
            "landmarkCount": len(landmark_names),
            "coordinateSystem": landmark_payload["coordinateSystems"][
                "poseCoordinates"
            ],
        },
        "countryColors": COUNTRY_COLORS,
        "dimensions": dimensions,
        "featureSchema": feature_schema,
        "poses": poses,
    }
    serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"
    V2_EMBEDDING_PATH.write_text(serialized, encoding="utf-8")
    ACTIVE_EMBEDDING_PATH.write_bytes(V1_EMBEDDING_PATH.read_bytes())

    print(
        json.dumps(
            {
                "embeddingVersion": "v2",
                "poses": len(poses),
                "semanticDimensions": len(DIMENSIONS),
                "postureDimensions": len(posture_feature_keys),
                "totalDimensions": len(feature_keys),
                "thumbnails": len(
                    [path for path in POSE_ASSET_ROOT.rglob("*") if path.is_file()]
                ),
                "embeddingSha256": hashlib.sha256(serialized.encode()).hexdigest(),
                "featureCsv": str(FEATURE_CSV_PATH),
                "embeddingV1": str(V1_EMBEDDING_PATH),
                "embeddingV2": str(V2_EMBEDDING_PATH),
                "defaultEmbedding": str(ACTIVE_EMBEDDING_PATH),
                "defaultVersion": "v1",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
