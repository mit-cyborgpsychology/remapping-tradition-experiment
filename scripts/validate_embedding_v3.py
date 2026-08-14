#!/usr/bin/env python3
"""Validate V3 and its relationship to the preserved V1/V2 datasets."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np


REPO = Path(__file__).resolve().parents[1]


def main() -> None:
    paths = {
        version: REPO / "public" / "data" / f"embedding-{version}.json"
        for version in ("v1", "v2", "v3")
    }
    payloads = {
        version: json.loads(path.read_text(encoding="utf-8"))
        for version, path in paths.items()
    }
    active_path = REPO / "public" / "data" / "embedding.json"
    assert active_path.read_bytes() == paths["v1"].read_bytes()
    assert all(len(payload["poses"]) == 286 for payload in payloads.values())
    assert payloads["v3"]["embeddingVersion"] == "v3"
    assert payloads["v3"]["embedding"]["semanticDimensions"] == 8
    assert payloads["v3"]["embedding"]["keyPositionCount"] == 10
    assert payloads["v3"]["embedding"]["postureDimensions"] == 30
    assert payloads["v3"]["embedding"]["dimensions"] == 38
    assert len(payloads["v3"]["featureSchema"]) == 38
    key_normalization = payloads["v3"]["normalization"]["keyPositions"]
    assert key_normalization["method"] == "global_min_max_per_key_position_axis"
    assert key_normalization["range"] == [0, 100]

    pose_ids = [
        {pose["id"] for pose in payload["poses"]}
        for payload in payloads.values()
    ]
    assert pose_ids[0] == pose_ids[1] == pose_ids[2]
    feature_vectors = np.asarray(
        [pose["featureVector"] for pose in payloads["v3"]["poses"]],
        dtype=float,
    )
    positions = np.asarray(
        [pose["position"] for pose in payloads["v3"]["poses"]], dtype=float
    )
    assert feature_vectors.shape == (286, 38)
    assert positions.shape == (286, 3)
    assert np.isfinite(feature_vectors).all()
    assert np.isfinite(positions).all()
    assert all(len(pose["keyPositions"]) == 10 for pose in payloads["v3"]["poses"])
    key_position_values = []
    for pose in payloads["v3"]["poses"]:
        pose_values = []
        for position in pose["keyPositions"].values():
            assert set(position) == {
                "label",
                "sourceLandmarks",
                "x",
                "y",
                "z",
                "raw",
                "visibility",
            }
            assert set(position["raw"]) == {"x", "y", "z"}
            assert np.isfinite(list(position["raw"].values())).all()
            pose_values.extend(position[axis] for axis in "xyz")
        key_position_values.append(pose_values)
    normalized_key_positions = np.asarray(key_position_values, dtype=float)
    assert normalized_key_positions.shape == (286, 30)
    assert np.isfinite(normalized_key_positions).all()
    assert np.all(normalized_key_positions >= -1e-5)
    assert np.all(normalized_key_positions <= 100.0 + 1e-5)
    np.testing.assert_allclose(
        normalized_key_positions.min(axis=0), 0.0, atol=1e-4
    )
    np.testing.assert_allclose(
        normalized_key_positions.max(axis=0), 100.0, atol=1e-4
    )

    print(
        json.dumps(
            {
                "status": "valid",
                "poses": 286,
                "semanticDimensions": 8,
                "keyPositions": 10,
                "postureDimensions": 30,
                "normalizedKeyDimensions": 30,
                "normalizedRange": [0, 100],
                "totalDimensions": 38,
                "defaultMatchesV1": True,
                "v3Sha256": hashlib.sha256(paths["v3"].read_bytes()).hexdigest(),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
