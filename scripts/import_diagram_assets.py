#!/usr/bin/env python3
"""Normalize Diagram Remapping assets and write an auditable index."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import shutil
from collections import Counter, defaultdict
from pathlib import Path


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}
STANDARD_TYPE_ALIASES = {
    "Body": "Body",
    "Body_with_Diagram": "Body_with_Diagram",
    "Transparent_Diagram": "Transparent_Diagram",
    "Diagram_Transparent": "Transparent_Diagram",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    return parser.parse_args()


def natural_key(value: str) -> tuple[object, ...]:
    return tuple(
        int(part) if part.isdigit() else part.casefold()
        for part in re.split(r"(\d+)", value)
    )


def source_number(path: Path) -> int:
    matches = re.findall(r"\d+", path.stem)
    if not matches:
        raise ValueError(f"No number found in source filename: {path}")
    return int(matches[-1])


def country_name(country_directory: Path) -> str:
    name = re.sub(r"^\d+\s+", "", country_directory.name).strip()
    name = re.sub(r"\s*\(monkey\)\s*$", "", name, flags=re.IGNORECASE)
    return re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_")


def image_files(directory: Path, recursive: bool = False) -> list[Path]:
    iterator = directory.rglob("*") if recursive else directory.iterdir()
    return sorted(
        (
            path
            for path in iterator
            if path.is_file() and path.suffix.casefold() in IMAGE_EXTENSIONS
        ),
        key=lambda path: natural_key(path.name),
    )


def classify_source_files(source: Path) -> list[tuple[str, str, Path]]:
    classified: list[tuple[str, str, Path]] = []

    for country_directory in sorted(
        (path for path in source.iterdir() if path.is_dir()),
        key=lambda path: natural_key(path.name),
    ):
        country = country_name(country_directory)

        if country == "Singapore":
            singapore_sources = (
                ("Body", country_directory / "Body" / "greyscale", False),
                ("Transparent_Diagram", country_directory / "Body", False),
                (
                    "Body_with_Diagram",
                    country_directory / "Body_with_Diagram",
                    False,
                ),
                (
                    "Body_with_Diagram_Greyscale",
                    country_directory / "Greyscale and Diagram",
                    False,
                ),
            )
            for asset_type, directory, recursive in singapore_sources:
                for path in image_files(directory, recursive=recursive):
                    classified.append((country, asset_type, path))
            continue

        for source_type, normalized_type in STANDARD_TYPE_ALIASES.items():
            directory = country_directory / source_type
            if not directory.is_dir():
                continue
            for path in image_files(directory):
                classified.append((country, normalized_type, path))

    return classified


def assign_numbers(
    classified: list[tuple[str, str, Path]],
) -> list[tuple[str, int, str, Path]]:
    grouped: dict[tuple[str, str], list[Path]] = defaultdict(list)
    for country, asset_type, path in classified:
        grouped[(country, asset_type)].append(path)

    numbered: list[tuple[str, int, str, Path]] = []
    for (country, asset_type), paths in grouped.items():
        paths = sorted(paths, key=lambda path: natural_key(path.name))

        if country == "Myanmar":
            for number, path in enumerate(paths, start=1):
                numbered.append((country, number, asset_type, path))
            continue

        if country == "Singapore":
            original_numbers = sorted({source_number(path) for path in paths})
            number_map = {
                original: sequential
                for sequential, original in enumerate(original_numbers, start=1)
            }
            for path in paths:
                numbered.append(
                    (country, number_map[source_number(path)], asset_type, path)
                )
            continue

        for path in paths:
            numbered.append((country, source_number(path), asset_type, path))

    return sorted(
        numbered,
        key=lambda item: (natural_key(item[0]), item[1], natural_key(item[2])),
    )


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def validate_source_coverage(
    source: Path, classified: list[tuple[str, str, Path]]
) -> None:
    all_source_assets = set(image_files(source, recursive=True))
    classified_assets = {path for _, _, path in classified}
    missing = sorted(all_source_assets - classified_assets)
    duplicate_count = len(classified) - len(classified_assets)
    if missing or duplicate_count:
        raise RuntimeError(
            "Source classification is incomplete: "
            f"missing={missing}, duplicate_count={duplicate_count}"
        )


def main() -> None:
    args = parse_args()
    source = args.source.resolve()
    destination = args.destination.resolve()

    classified = classify_source_files(source)
    validate_source_coverage(source, classified)
    numbered = assign_numbers(classified)

    planned: list[tuple[str, int, str, Path, Path]] = []
    for country, number, asset_type, source_path in numbered:
        extension = source_path.suffix.casefold()
        filename = f"{country}_{number:02d}_{asset_type}{extension}"
        destination_path = destination / country / asset_type / filename
        planned.append(
            (country, number, asset_type, source_path, destination_path)
        )

    destination_paths = [item[-1] for item in planned]
    duplicate_destinations = [
        str(path)
        for path, count in Counter(destination_paths).items()
        if count > 1
    ]
    if duplicate_destinations:
        raise RuntimeError(
            f"Destination filename collisions: {duplicate_destinations}"
        )

    existing = [path for path in destination_paths if path.exists()]
    if existing:
        raise FileExistsError(
            f"Refusing to overwrite {len(existing)} existing assets; "
            f"first existing path: {existing[0]}"
        )

    rows: list[dict[str, object]] = []
    for country, number, asset_type, source_path, destination_path in planned:
        destination_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, destination_path)
        source_hash = sha256(source_path)
        copied_hash = sha256(destination_path)
        if source_hash != copied_hash:
            raise RuntimeError(f"Copy verification failed: {destination_path}")
        rows.append(
            {
                "country": country,
                "number": f"{number:02d}",
                "type": asset_type,
                "source_relative_path": source_path.relative_to(source).as_posix(),
                "destination_relative_path": destination_path.relative_to(
                    destination
                ).as_posix(),
                "extension": destination_path.suffix.casefold(),
                "bytes": destination_path.stat().st_size,
                "sha256": copied_hash,
            }
        )

    index_path = destination / "index.csv"
    with index_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    counts: dict[str, dict[str, int]] = defaultdict(dict)
    for (country, asset_type), count in sorted(
        Counter((row["country"], row["type"]) for row in rows).items()
    ):
        counts[str(country)][str(asset_type)] = count

    report = {
        "source": str(source),
        "destination": str(destination),
        "asset_count": len(rows),
        "country_count": len({row["country"] for row in rows}),
        "counts": counts,
        "notes": [
            "macOS .DS_Store metadata files were intentionally excluded.",
            "Thailand (monkey) was normalized to the country name Thailand.",
            "Myanmar compound source labels were natural-sorted and renumbered 01-63.",
            "Singapore source pose 11 is absent in every set; its remaining poses were renumbered 01-16 consistently.",
            "Singapore Body/greyscale supplies Body; direct Body images are transparent line diagrams.",
            "Singapore Greyscale and Diagram was retained as Body_with_Diagram_Greyscale so no asset was discarded.",
            "Malaysia Body_with_Diagram and Transparent_Diagram are missing pose IDs 14 and 31; IDs were not shifted, preserving cross-type alignment.",
        ],
    }
    report_path = destination / "import-report.json"
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
