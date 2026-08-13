#!/usr/bin/env python3
"""Create labeled contact sheets for visual review of pose overlays."""

from __future__ import annotations

import argparse
import csv
import math
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("index", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--per-sheet", type=int, default=12)
    return parser.parse_args()


def fit_image(path: Path, width: int, height: int) -> Image.Image:
    with Image.open(path) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
    image.thumbnail((width, height), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (width, height), "white")
    x = (width - image.width) // 2
    y = (height - image.height) // 2
    canvas.paste(image, (x, y))
    return canvas


def main() -> None:
    args = parse_args()
    index_path = args.index.resolve()
    diagram_root = index_path.parent
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)

    with index_path.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))

    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        if row["type"] == "Body_with_Diagram":
            grouped[row["country"]].append(row)

    columns = 4
    rows_per_sheet = math.ceil(args.per_sheet / columns)
    cell_width = 900
    image_height = 1030
    label_height = 70
    margin = 35
    header_height = 90
    cell_height = image_height + label_height
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 34)
    header_font = ImageFont.truetype(
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf", 44
    )

    for country, country_rows in sorted(grouped.items()):
        country_rows.sort(key=lambda row: int(row["number"]))
        for batch_start in range(0, len(country_rows), args.per_sheet):
            batch = country_rows[batch_start : batch_start + args.per_sheet]
            sheet_number = batch_start // args.per_sheet + 1
            sheet = Image.new(
                "RGB",
                (
                    margin * 2 + columns * cell_width,
                    margin * 2 + header_height + rows_per_sheet * cell_height,
                ),
                "#E8EBEF",
            )
            draw = ImageDraw.Draw(sheet)
            draw.text(
                (margin, margin),
                f"{country} — Body_with_Diagram — sheet {sheet_number}",
                fill="#111827",
                font=header_font,
            )

            for index, row in enumerate(batch):
                grid_row, grid_column = divmod(index, columns)
                x = margin + grid_column * cell_width
                y = margin + header_height + grid_row * cell_height
                image_path = diagram_root / row["destination_relative_path"]
                fitted = fit_image(image_path, cell_width, image_height)
                sheet.paste(fitted, (x, y))
                label = f'{country}_{row["number"]}'
                label_box = (x, y + image_height, x + cell_width, y + cell_height)
                draw.rectangle(label_box, fill="#111827")
                text_box = draw.textbbox((0, 0), label, font=font)
                text_width = text_box[2] - text_box[0]
                draw.text(
                    (x + (cell_width - text_width) / 2, y + image_height + 15),
                    label,
                    fill="white",
                    font=font,
                )

            first = batch[0]["number"]
            last = batch[-1]["number"]
            sheet.save(
                output / f"{country}_{sheet_number:02d}_{first}-{last}.jpg",
                quality=90,
                optimize=True,
            )


if __name__ == "__main__":
    main()
