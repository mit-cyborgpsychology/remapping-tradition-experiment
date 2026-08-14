#!/usr/bin/env python3
"""Build V3 from eight semantic scores plus ten key MediaPipe positions."""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import numpy as np

from build_visualization_data import (
    COUNTRY_COLORS,
    DIAGRAM_ROOT,
    DIMENSIONS,
    POSE_ASSET_ROOT,
    SCORES_PATH,
    dimension_anchor_positions,
    normalize_scores,
    read_csv,
    write_csv_atomic,
)
from build_visualization_data_v2 import embedding_positions_v2, zscore


REPO = Path(__file__).resolve().parents[1]
LANDMARK_PATH = DIAGRAM_ROOT / "mediapipe-pose-landmarks-v2.json"
FEATURE_CSV_PATH = DIAGRAM_ROOT / "pose-analysis-features-v3.csv"
V1_EMBEDDING_PATH = REPO / "public" / "data" / "embedding-v1.json"
V3_EMBEDDING_PATH = REPO / "public" / "data" / "embedding-v3.json"

KEY_POSITIONS = [
    {"key": "head", "label": "Head", "landmarks": ["nose"]},
    {"key": "left_hand", "label": "Left Hand", "landmarks": ["left_wrist"]},
    {"key": "right_hand", "label": "Right Hand", "landmarks": ["right_wrist"]},
    {"key": "left_arm", "label": "Left Arm", "landmarks": ["left_elbow"]},
    {"key": "right_arm", "label": "Right Arm", "landmarks": ["right_elbow"]},
    {"key": "left_leg", "label": "Left Leg", "landmarks": ["left_knee"]},
    {"key": "right_leg", "label": "Right Leg", "landmarks": ["right_knee"]},
    {
        "key": "body",
        "label": "Body",
        "landmarks": [
            "left_shoulder",
            "right_shoulder",
            "left_hip",
            "right_hip",
        ],
    },
    {
        "key": "left_foot",
        "label": "Left Foot",
        "landmarks": ["left_foot_index"],
    },
    {
        "key": "right_foot",
        "label": "Right Foot",
        "landmarks": ["right_foot_index"],
    },
]


def main() -> None:
    landmark_payload = json.loads(LANDMARK_PATH.read_text(encoding="utf-8"))
    landmark_names: list[str] = landmark_payload["landmarkNames"]
    landmark_indices = {name: index for index, name in enumerate(landmark_names)}
    landmark_records = {
        record["id"]: record for record in landmark_payload["records"]
    }
    for position in KEY_POSITIONS:
        missing = [
            name for name in position["landmarks"] if name not in landmark_indices
        ]
        if missing:
            raise ValueError(f"Missing MediaPipe landmarks for {position['key']}: {missing}")

    _, score_rows = read_csv(SCORES_PATH)
    score_rows.sort(key=lambda row: (row["country"], int(row["number"])))
    raw_scores, normalized_scores, extrema = normalize_scores(score_rows)

    key_position_rows: list[np.ndarray] = []
    key_visibility_rows: list[np.ndarray] = []
    for score_row in score_rows:
        pose_id = f"{score_row['country']}_{score_row['number']}"
        record = landmark_records.get(pose_id)
        if record is None:
            raise ValueError(f"Missing MediaPipe record for {pose_id}")
        coordinates = np.asarray(record["poseCoordinates"], dtype=float)
        visibility = np.asarray(record["visibility"], dtype=float)
        position_values = []
        visibility_values = []
        for position in KEY_POSITIONS:
            indices = [landmark_indices[name] for name in position["landmarks"]]
            position_values.append(coordinates[indices].mean(axis=0))
            visibility_values.append(float(visibility[indices].mean()))
        key_position_rows.append(np.asarray(position_values).reshape(-1))
        key_visibility_rows.append(np.asarray(visibility_values))
    key_coordinates = np.vstack(key_position_rows)
    key_visibility = np.vstack(key_visibility_rows)

    # Normalize every body-part axis independently across the complete pose set.
    # This makes, for example, Left Hand X span 0–100 across all 286 poses,
    # exactly as each of the eight semantic dimensions does.
    key_minimums = key_coordinates.min(axis=0)
    key_maximums = key_coordinates.max(axis=0)
    key_spans = key_maximums - key_minimums
    if np.any(key_spans <= 0.0):
        constant_indices = np.flatnonzero(key_spans <= 0.0).tolist()
        raise ValueError(
            f"Cannot min-max normalize constant key-position axes: {constant_indices}"
        )
    normalized_key_coordinates = (
        (key_coordinates - key_minimums) / key_spans * 100.0
    )

    semantic_z, semantic_means, semantic_stds = zscore(normalized_scores)
    posture_z, posture_means, posture_stds = zscore(normalized_key_coordinates)
    semantic_weight = 1.0 / math.sqrt(semantic_z.shape[1])
    posture_weight = 1.0 / math.sqrt(posture_z.shape[1])
    feature_vectors = np.hstack(
        [semantic_z * semantic_weight, posture_z * posture_weight]
    )
    positions = embedding_positions_v2(feature_vectors)
    anchor_positions = dimension_anchor_positions(normalized_scores, positions)

    posture_feature_keys = [
        f"key_{position['key']}_{axis}_normalized"
        for position in KEY_POSITIONS
        for axis in "xyz"
    ]
    posture_raw_keys = [
        f"key_{position['key']}_{axis}_raw"
        for position in KEY_POSITIONS
        for axis in "xyz"
    ]
    feature_keys = [dimension["key"] for dimension in DIMENSIONS]
    feature_keys.extend(posture_feature_keys)

    feature_rows: list[dict[str, object]] = []
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
                float(normalized_key_coordinates[row_index, feature_index]), 5
            )
        for feature_index, raw_key in enumerate(posture_raw_keys):
            output_row[raw_key] = round(
                float(key_coordinates[row_index, feature_index]), 7
            )
        feature_rows.append(output_row)
    write_csv_atomic(FEATURE_CSV_PATH, list(feature_rows[0]), feature_rows)

    v1_payload = json.loads(V1_EMBEDDING_PATH.read_text(encoding="utf-8"))
    v1_pose_lookup = {pose["id"]: pose for pose in v1_payload["poses"]}
    poses: list[dict[str, object]] = []
    for row_index, score_row in enumerate(score_rows):
        country = score_row["country"]
        number = score_row["number"]
        pose_id = f"{country}_{number}"
        source_pose = v1_pose_lookup[pose_id]
        raw_values = {
            dimension["key"]: int(raw_scores[row_index, dimension_index])
            for dimension_index, dimension in enumerate(DIMENSIONS)
        }
        normalized_values = {
            dimension["key"]: round(
                normalized_scores[row_index, dimension_index] * 100.0, 3
            )
            for dimension_index, dimension in enumerate(DIMENSIONS)
        }
        key_positions = {}
        for key_index, position in enumerate(KEY_POSITIONS):
            coordinate_offset = key_index * 3
            key_positions[position["key"]] = {
                "label": position["label"],
                "sourceLandmarks": position["landmarks"],
                "x": round(
                    float(normalized_key_coordinates[row_index, coordinate_offset]),
                    6,
                ),
                "y": round(
                    float(
                        normalized_key_coordinates[row_index, coordinate_offset + 1]
                    ),
                    6,
                ),
                "z": round(
                    float(
                        normalized_key_coordinates[row_index, coordinate_offset + 2]
                    ),
                    6,
                ),
                "raw": {
                    "x": round(
                        float(key_coordinates[row_index, coordinate_offset]), 7
                    ),
                    "y": round(
                        float(key_coordinates[row_index, coordinate_offset + 1]),
                        7,
                    ),
                    "z": round(
                        float(key_coordinates[row_index, coordinate_offset + 2]),
                        7,
                    ),
                },
                "visibility": round(float(key_visibility[row_index, key_index]), 6),
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
                "keyPositions": key_positions,
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
            "label": feature_key.removeprefix("key_")
            .removesuffix("_normalized")
            .replace("_", " ")
            .title(),
            "source": "mediapipe_key_position_global_min_max",
        }
        for feature_key in posture_feature_keys
    ]

    payload = {
        "schemaVersion": 4,
        "embeddingVersion": "v3",
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
            "keyPositions": {
                "method": "global_min_max_per_key_position_axis",
                "range": [0, 100],
                "coordinateSource": "hip_centered_torso_scale_normalized_mediapipe_world_coordinates",
                "extrema": {
                    position["key"]: {
                        axis: {
                            "minimum": round(
                                float(key_minimums[position_index * 3 + axis_index]),
                                7,
                            ),
                            "maximum": round(
                                float(key_maximums[position_index * 3 + axis_index]),
                                7,
                            ),
                        }
                        for axis_index, axis in enumerate("xyz")
                    }
                    for position_index, position in enumerate(KEY_POSITIONS)
                },
                "means": np.round(posture_means, 7).tolist(),
                "standardDeviations": np.round(posture_stds, 7).tolist(),
            },
        },
        "embedding": {
            "method": "block_balanced_pca_with_repulsion",
            "dimensions": len(feature_keys),
            "semanticDimensions": len(DIMENSIONS),
            "keyPositionCount": len(KEY_POSITIONS),
            "postureDimensions": len(posture_feature_keys),
            "components": 3,
            "minimumSeparation": 0.62,
            "blockWeights": {"semantic": 0.5, "keyPositions": 0.5},
            "note": "V3 concatenates eight global 0–100 movement scores with thirty key-position axis values, each globally min-max normalized to 0–100 across all poses. The two blocks are then z-scored and divided by the square root of their dimensionality before PCA so both blocks contribute equally.",
        },
        "mediapipe": {
            "engine": landmark_payload["engine"],
            "version": landmark_payload["mediapipeVersion"],
            "model": landmark_payload["model"],
            "inputMode": landmark_payload["inputMode"],
            "coordinateSystem": landmark_payload["coordinateSystems"][
                "poseCoordinates"
            ],
            "keyPositionRange": [0, 100],
            "keyPositionMapping": KEY_POSITIONS,
        },
        "countryColors": COUNTRY_COLORS,
        "dimensions": dimensions,
        "featureSchema": feature_schema,
        "poses": poses,
    }
    serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"
    V3_EMBEDDING_PATH.write_text(serialized, encoding="utf-8")

    print(
        json.dumps(
            {
                "embeddingVersion": "v3",
                "poses": len(poses),
                "semanticDimensions": len(DIMENSIONS),
                "keyPositions": len(KEY_POSITIONS),
                "postureDimensions": len(posture_feature_keys),
                "totalDimensions": len(feature_keys),
                "thumbnails": len(
                    [path for path in POSE_ASSET_ROOT.rglob("*") if path.is_file()]
                ),
                "embeddingSha256": hashlib.sha256(serialized.encode()).hexdigest(),
                "featureCsv": str(FEATURE_CSV_PATH),
                "embeddingV3": str(V3_EMBEDDING_PATH),
                "defaultVersion": "v1",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
