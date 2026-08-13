#!/usr/bin/env python3
"""Merge pose-level visual ratings into the diagram asset index."""

from __future__ import annotations

import argparse
import csv
import os
import tempfile
from pathlib import Path


SCORE_FIELDS = [
    "energy_score",
    "circles_curves_score",
    "axis_points_score",
    "synchronous_limbs_score",
    "external_body_spaces_score",
    "shifting_relations_score",
    "jumping_score",
    "emotion_score",
]

SOURCE_SCORE_FIELDS = {
    "energy_score": "energy",
    "circles_curves_score": "circles_curves",
    "axis_points_score": "axis_points",
    "synchronous_limbs_score": "synchronous_limbs",
    "external_body_spaces_score": "external_body_spaces",
    "shifting_relations_score": "shifting_relations",
    "jumping_score": "jumping",
    "emotion_score": "emotion",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("index", type=Path)
    parser.add_argument("scores", type=Path)
    return parser.parse_args()


def read_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise ValueError(f"CSV has no header: {path}")
        return list(reader.fieldnames), list(reader)


def main() -> None:
    args = parse_args()
    index_path = args.index.resolve()
    scores_path = args.scores.resolve()
    fieldnames, index_rows = read_rows(index_path)
    _, score_rows = read_rows(scores_path)

    score_lookup: dict[tuple[str, str], dict[str, str]] = {}
    for row in score_rows:
        key = (row["country"], row["number"])
        if key in score_lookup:
            raise ValueError(f"Duplicate score row: {key}")
        for source_field in SOURCE_SCORE_FIELDS.values():
            value = row[source_field]
            if not value.isdigit() or not 0 <= int(value) <= 100:
                raise ValueError(
                    f"Invalid 0-100 integer {source_field}={value!r} for {key}"
                )
        score_lookup[key] = row

    source_images = {
        (row["country"], row["number"]): row["destination_relative_path"]
        for row in index_rows
        if row["type"] == "Body_with_Diagram"
    }
    if set(score_lookup) != set(source_images):
        raise ValueError(
            "Score coverage must exactly match Body_with_Diagram coverage; "
            f"missing={sorted(set(source_images) - set(score_lookup))}, "
            f"extra={sorted(set(score_lookup) - set(source_images))}"
        )

    added_fields = [
        "analysis_status",
        "analysis_source_relative_path",
        *SCORE_FIELDS,
    ]
    output_fields = [field for field in fieldnames if field not in added_fields]
    output_fields.extend(added_fields)

    for row in index_rows:
        key = (row["country"], row["number"])
        score_row = score_lookup.get(key)
        if score_row is None:
            row["analysis_status"] = "missing_body_with_diagram"
            row["analysis_source_relative_path"] = ""
            for field in SCORE_FIELDS:
                row[field] = ""
            continue

        row["analysis_status"] = "scored"
        row["analysis_source_relative_path"] = source_images[key]
        for destination_field, source_field in SOURCE_SCORE_FIELDS.items():
            row[destination_field] = score_row[source_field]

    temporary_handle = tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        newline="",
        prefix=f".{index_path.name}.",
        suffix=".tmp",
        dir=index_path.parent,
        delete=False,
    )
    temporary_path = Path(temporary_handle.name)
    try:
        with temporary_handle:
            writer = csv.DictWriter(
                temporary_handle,
                fieldnames=output_fields,
                extrasaction="ignore",
            )
            writer.writeheader()
            writer.writerows(index_rows)
        os.replace(temporary_path, index_path)
    finally:
        temporary_path.unlink(missing_ok=True)

    print(
        f"Updated {len(index_rows)} index rows with {len(score_lookup)} "
        "pose-level score sets."
    )


if __name__ == "__main__":
    main()
