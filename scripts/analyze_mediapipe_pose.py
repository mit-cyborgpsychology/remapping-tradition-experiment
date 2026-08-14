#!/usr/bin/env python3
"""Extract MediaPipe Pose Landmarker coordinates from body-with-diagram images."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import tempfile
from pathlib import Path

import numpy as np


REPO = Path(__file__).resolve().parents[1]
DIAGRAM_ROOT = REPO / "data" / "diagram"
INDEX_PATH = DIAGRAM_ROOT / "index.csv"
DEFAULT_JSON_PATH = DIAGRAM_ROOT / "mediapipe-pose-landmarks-v2.json"
DEFAULT_CSV_PATH = DIAGRAM_ROOT / "mediapipe-pose-landmarks-v2.csv"

LANDMARK_NAMES = [
    "nose",
    "left_eye_inner",
    "left_eye",
    "left_eye_outer",
    "right_eye_inner",
    "right_eye",
    "right_eye_outer",
    "left_ear",
    "right_ear",
    "mouth_left",
    "mouth_right",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_pinky",
    "right_pinky",
    "left_index",
    "right_index",
    "left_thumb",
    "right_thumb",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
    "left_heel",
    "right_heel",
    "left_foot_index",
    "right_foot_index",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--output-json", type=Path, default=DEFAULT_JSON_PATH)
    parser.add_argument("--output-csv", type=Path, default=DEFAULT_CSV_PATH)
    parser.add_argument("--min-confidence", type=float, default=0.1)
    return parser.parse_args()


def read_source_rows() -> list[dict[str, str]]:
    with INDEX_PATH.open(encoding="utf-8", newline="") as handle:
        all_rows = list(csv.DictReader(handle))
    assets = {
        (row["country"], row["number"], row["type"]): row
        for row in all_rows
    }
    rows = []
    for row in all_rows:
        if row["type"] != "Body_with_Diagram":
            continue
        body_row = assets.get((row["country"], row["number"], "Body"))
        if body_row is None:
            raise ValueError(f"Missing Body fallback for {row['country']}_{row['number']}")
        row["body_destination_relative_path"] = body_row[
            "destination_relative_path"
        ]
        rows.append(row)
    rows.sort(key=lambda row: (row["country"], int(row["number"])))
    if len(rows) != 286:
        raise ValueError(f"Expected 286 body-with-diagram images, found {len(rows)}")
    return rows


def optional_float(value: object, field: str) -> float:
    result = getattr(value, field, None)
    return float(result) if result is not None else 0.0


def pose_coordinates(world_coordinates: np.ndarray) -> tuple[np.ndarray, float]:
    """Center on the hip midpoint and normalize by a stable torso scale."""
    hip_midpoint = (world_coordinates[23] + world_coordinates[24]) * 0.5
    shoulder_midpoint = (world_coordinates[11] + world_coordinates[12]) * 0.5
    scale_candidates = np.array(
        [
            np.linalg.norm(shoulder_midpoint - hip_midpoint),
            np.linalg.norm(world_coordinates[11] - world_coordinates[12]),
            np.linalg.norm(world_coordinates[23] - world_coordinates[24]),
        ],
        dtype=float,
    )
    valid_scales = scale_candidates[scale_candidates > 1e-5]
    if len(valid_scales) == 0:
        centered = world_coordinates - hip_midpoint
        fallback = float(np.percentile(np.linalg.norm(centered, axis=1), 90))
        scale = max(fallback, 1e-5)
    else:
        scale = float(np.median(valid_scales))
    return (world_coordinates - hip_midpoint) / scale, scale


def write_json_atomic(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
        delete=False,
    )
    temporary_path = Path(handle.name)
    try:
        with handle:
            json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
            handle.write("\n")
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)


def write_csv_atomic(path: Path, rows: list[dict[str, object]]) -> None:
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
                handle, fieldnames=list(rows[0]), lineterminator="\n"
            )
            writer.writeheader()
            writer.writerows(rows)
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)


def main() -> None:
    args = parse_args()
    if not args.model.is_file():
        raise FileNotFoundError(args.model)

    try:
        import mediapipe as mp
    except ImportError as error:
        raise SystemExit(
            "MediaPipe is required. Install scripts/requirements-mediapipe.txt."
        ) from error

    source_rows = read_source_rows()
    options = mp.tasks.vision.PoseLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(
            model_asset_path=str(args.model),
            delegate=mp.tasks.BaseOptions.Delegate.CPU,
        ),
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
        num_poses=1,
        min_pose_detection_confidence=args.min_confidence,
        min_pose_presence_confidence=args.min_confidence,
        output_segmentation_masks=False,
    )

    records: list[dict[str, object]] = []
    failures: list[str] = []
    with mp.tasks.vision.PoseLandmarker.create_from_options(options) as detector:
        for row_index, row in enumerate(source_rows, start=1):
            pose_id = f"{row['country']}_{row['number']}"
            source_path = DIAGRAM_ROOT / row["destination_relative_path"]
            result = detector.detect(mp.Image.create_from_file(str(source_path)))
            analysis_input_type = "Body_with_Diagram"
            analysis_source_path = source_path
            if not result.pose_landmarks or not result.pose_world_landmarks:
                analysis_input_type = "Body_fallback"
                analysis_source_path = (
                    DIAGRAM_ROOT / row["body_destination_relative_path"]
                )
                result = detector.detect(
                    mp.Image.create_from_file(str(analysis_source_path))
                )
            if not result.pose_landmarks or not result.pose_world_landmarks:
                failures.append(pose_id)
                print(f"[{row_index:03d}/{len(source_rows)}] no pose: {pose_id}")
                continue

            image_landmarks = result.pose_landmarks[0]
            world_landmarks = result.pose_world_landmarks[0]
            if len(image_landmarks) != len(LANDMARK_NAMES):
                raise ValueError(
                    f"Expected {len(LANDMARK_NAMES)} landmarks for {pose_id}, "
                    f"found {len(image_landmarks)}"
                )

            image_coordinates = np.array(
                [[landmark.x, landmark.y, landmark.z] for landmark in image_landmarks],
                dtype=float,
            )
            world_coordinates = np.array(
                [[landmark.x, landmark.y, landmark.z] for landmark in world_landmarks],
                dtype=float,
            )
            normalized_pose, body_scale = pose_coordinates(world_coordinates)
            visibility = np.array(
                [optional_float(landmark, "visibility") for landmark in image_landmarks],
                dtype=float,
            )
            presence = np.array(
                [optional_float(landmark, "presence") for landmark in image_landmarks],
                dtype=float,
            )
            records.append(
                {
                    "id": pose_id,
                    "country": row["country"],
                    "number": row["number"],
                    "requestedSource": f"data/diagram/{row['destination_relative_path']}",
                    "analysisSource": str(
                        analysis_source_path.relative_to(REPO)
                    ),
                    "analysisInputType": analysis_input_type,
                    "bodyScale": round(body_scale, 7),
                    "meanVisibility": round(float(visibility.mean()), 7),
                    "minimumVisibility": round(float(visibility.min()), 7),
                    "imageCoordinates": np.round(image_coordinates, 7).tolist(),
                    "worldCoordinates": np.round(world_coordinates, 7).tolist(),
                    "poseCoordinates": np.round(normalized_pose, 7).tolist(),
                    "visibility": np.round(visibility, 7).tolist(),
                    "presence": np.round(presence, 7).tolist(),
                }
            )
            if row_index % 10 == 0 or row_index == len(source_rows):
                print(f"[{row_index:03d}/{len(source_rows)}] {pose_id}")

    if failures:
        raise RuntimeError(
            f"MediaPipe failed on {len(failures)} poses; outputs were not written: "
            + ", ".join(failures)
        )

    model_sha256 = hashlib.sha256(args.model.read_bytes()).hexdigest()
    payload = {
        "schemaVersion": 1,
        "analysisVersion": "v2",
        "engine": "MediaPipe Pose Landmarker",
        "mediapipeVersion": mp.__version__,
        "model": {
            "name": args.model.name,
            "sha256": model_sha256,
        },
        "inputMode": "Body_with_Diagram with Body fallback only when the primary image has no detected pose",
        "coordinateSystems": {
            "imageCoordinates": "MediaPipe normalized image x, y, and depth z",
            "worldCoordinates": "MediaPipe world x, y, and z in meters, hip midpoint origin",
            "poseCoordinates": "world coordinates recentered at the hip midpoint and divided by median torso scale",
        },
        "landmarkNames": LANDMARK_NAMES,
        "records": records,
    }
    write_json_atomic(args.output_json, payload)

    csv_rows: list[dict[str, object]] = []
    for record in records:
        output_row: dict[str, object] = {
            "country": record["country"],
            "number": record["number"],
            "requested_source": record["requestedSource"],
            "analysis_source": record["analysisSource"],
            "analysis_input_type": record["analysisInputType"],
            "detection_status": "detected",
            "body_scale": record["bodyScale"],
            "mean_visibility": record["meanVisibility"],
            "minimum_visibility": record["minimumVisibility"],
        }
        for landmark_index, landmark_name in enumerate(LANDMARK_NAMES):
            for axis_index, axis in enumerate("xyz"):
                output_row[f"{landmark_name}_image_{axis}"] = record[
                    "imageCoordinates"
                ][landmark_index][axis_index]
                output_row[f"{landmark_name}_world_{axis}"] = record[
                    "worldCoordinates"
                ][landmark_index][axis_index]
                output_row[f"pose_{landmark_name}_{axis}"] = record[
                    "poseCoordinates"
                ][landmark_index][axis_index]
            output_row[f"{landmark_name}_visibility"] = record["visibility"][
                landmark_index
            ]
            output_row[f"{landmark_name}_presence"] = record["presence"][
                landmark_index
            ]
        csv_rows.append(output_row)
    write_csv_atomic(args.output_csv, csv_rows)

    print(
        json.dumps(
            {
                "poses": len(records),
                "landmarksPerPose": len(LANDMARK_NAMES),
                "postureDimensions": len(LANDMARK_NAMES) * 3,
                "bodyFallbacks": sum(
                    record["analysisInputType"] == "Body_fallback"
                    for record in records
                ),
                "meanVisibility": round(
                    sum(float(record["meanVisibility"]) for record in records)
                    / len(records),
                    5,
                ),
                "modelSha256": model_sha256,
                "json": str(args.output_json),
                "csv": str(args.output_csv),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
