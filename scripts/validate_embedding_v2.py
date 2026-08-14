#!/usr/bin/env python3
"""Validate the archived V1 and active MediaPipe-enhanced V2 embedding."""

from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path

import numpy as np


REPO = Path(__file__).resolve().parents[1]


def main() -> None:
    v1_path = REPO / "public" / "data" / "embedding-v1.json"
    v2_path = REPO / "public" / "data" / "embedding-v2.json"
    active_path = REPO / "public" / "data" / "embedding.json"
    landmark_path = REPO / "data" / "diagram" / "mediapipe-pose-landmarks-v2.json"
    index_path = REPO / "data" / "diagram" / "index.csv"

    v1 = json.loads(v1_path.read_text(encoding="utf-8"))
    v2 = json.loads(v2_path.read_text(encoding="utf-8"))
    landmarks = json.loads(landmark_path.read_text(encoding="utf-8"))
    assert active_path.read_bytes() == v1_path.read_bytes()
    assert len(v1["poses"]) == len(v2["poses"]) == 286
    assert v2["embeddingVersion"] == "v2"
    assert v2["embedding"]["semanticDimensions"] == 8
    assert v2["embedding"]["postureDimensions"] == 99
    assert v2["embedding"]["dimensions"] == 107
    assert len(v2["featureSchema"]) == 107
    assert len(landmarks["records"]) == 286

    feature_vectors = np.asarray(
        [pose["featureVector"] for pose in v2["poses"]], dtype=float
    )
    positions = np.asarray([pose["position"] for pose in v2["poses"]], dtype=float)
    assert feature_vectors.shape == (286, 107)
    assert positions.shape == (286, 3)
    assert np.isfinite(feature_vectors).all()
    assert np.isfinite(positions).all()
    assert all(len(pose["posture"]["landmarks"]) == 33 for pose in v2["poses"])

    with index_path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        index_rows = list(reader)
        posture_fields = [
            field
            for field in reader.fieldnames or []
            if field.startswith("pose_") and field.rsplit("_", 1)[-1] in {"x", "y", "z"}
        ]
    assert len(posture_fields) == 99
    indexed_pose_keys = {
        (pose["country"], pose["number"]) for pose in v2["poses"]
    }
    indexed_rows = [
        row
        for row in index_rows
        if (row["country"], row["number"]) in indexed_pose_keys
    ]
    assert indexed_rows
    assert all(row[field] for row in indexed_rows for field in posture_fields)

    fallback_records = [
        record
        for record in landmarks["records"]
        if record["analysisInputType"] == "Body_fallback"
    ]
    visibility = np.asarray(
        [record["meanVisibility"] for record in landmarks["records"]], dtype=float
    )
    print(
        json.dumps(
            {
                "status": "valid",
                "poses": len(v2["poses"]),
                "semanticDimensions": 8,
                "postureDimensions": 99,
                "totalDimensions": 107,
                "bodyWithDiagramDetections": 286 - len(fallback_records),
                "bodyFallbackDetections": len(fallback_records),
                "meanLandmarkVisibility": round(float(visibility.mean()), 5),
                "v1Sha256": hashlib.sha256(v1_path.read_bytes()).hexdigest(),
                "v2Sha256": hashlib.sha256(v2_path.read_bytes()).hexdigest(),
                "defaultMatchesV1": True,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
