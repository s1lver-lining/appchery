#!/usr/bin/env python3
"""Scores the aimify YoloV8 segmentation model on our labelled 60cm set.

The point is a like for like comparison: the same photographs, the same labels and the same four
numbers the classical detector is measured on, so "the model is better" can be checked rather than
assumed. Their model was trained on a different set, so this measures how it generalises, which is the
question worth asking of anyone else's weights.

    .venv-ml/bin/python scripts/eval-yolo.py [--limit 200] [--conf 0.25]

Needs ultralytics and torch, which live in .venv-ml and are not part of the app.
"""
import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEIGHTS = os.path.join(ROOT, "scripts/aimify/ML/arrowV1-models/YoloV8_V1/weights/best.pt")
DATASET = os.path.join(ROOT, "test/datasets/60cm")

# Their class list, from arrowV1-dataset/data.yaml.
NAMES = {
    0: "1-Ring", 1: "10-Ring", 2: "2-Ring", 3: "3-Ring", 4: "4-Ring", 5: "5-Ring",
    6: "6-Ring", 7: "7-Ring", 8: "8-Ring", 9: "9-Ring", 10: "Arrow",
}
ARROW_CLASS = 10


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--conf", type=float, default=0.25)
    parser.add_argument("--weights", default=WEIGHTS)
    args = parser.parse_args()

    from ultralytics import YOLO

    model = YOLO(args.weights)
    tasks = json.load(open(os.path.join(DATASET, "annotation.json")))

    images = truth_total = reported = matched = 0
    offsets = []

    for task in tasks:
        if args.limit and images >= args.limit:
            break

        result = (task.get("annotations") or [{}])[0].get("result")
        if not result:
            result = (task.get("drafts") or [{}])[0].get("result", [])
        truth = [
            (
                r["value"]["x"] / 100 * r["original_width"],
                r["value"]["y"] / 100 * r["original_height"],
            )
            for r in result
            if r.get("value", {}).get("keypointlabels", [None])[0] not in (None, "Miss")
        ]
        if not truth:
            continue

        name = (task.get("file_upload") or "").split("-", 1)[-1]
        path = os.path.join(DATASET, name)
        if not os.path.exists(path):
            continue

        images += 1
        truth_total += len(truth)

        prediction = model.predict(path, conf=args.conf, verbose=False)[0]
        boxes = prediction.boxes
        if boxes is None:
            continue

        arrow_boxes = []
        rings = []
        gold = None
        for i in range(len(boxes)):
            cls = int(boxes.cls[i])
            x1, y1, x2, y2 = [float(v) for v in boxes.xyxy[i]]
            centre = ((x1 + x2) / 2, (y1 + y2) / 2)
            if cls == ARROW_CLASS:
                arrow_boxes.append((x1, y1, x2, y2))
            else:
                rings.append((centre, x2 - x1, y2 - y1))
                if NAMES[cls] == "10-Ring":
                    gold = centre

        # Tolerance follows the face, taken from the largest ring box so it matches our own harness.
        if rings:
            radius = max(max(w, h) for _, w, h in rings) / 2
        else:
            radius = max(prediction.orig_shape) / 4
        tolerance = radius * 0.08

        # The face centre, for reading an arrow box as an impact rather than as a whole arrow.
        if gold is not None:
            face = gold
        elif rings:
            face = max(rings, key=lambda r: max(r[1], r[2]))[0]
        else:
            face = (prediction.orig_shape[1] / 2, prediction.orig_shape[0] / 2)

        # Their box covers the entire arrow, shaft and fletching, so its centre is nowhere near the
        # hole. The impact is read as the point of the box nearest the middle of the face, which is the
        # most favourable reading of their output that is still honest.
        arrows = [
            (min(max(face[0], x1), x2), min(max(face[1], y1), y2))
            for x1, y1, x2, y2 in arrow_boxes
        ]

        reported += len(arrows)
        claimed = set()
        for centre in arrows:
            best, best_gap = -1, float("inf")
            for i, point in enumerate(truth):
                if i in claimed:
                    continue
                gap = ((point[0] - centre[0]) ** 2 + (point[1] - centre[1]) ** 2) ** 0.5
                if gap < best_gap:
                    best_gap, best = gap, i
            if best < 0 or best_gap > tolerance:
                continue
            claimed.add(best)
            matched += 1
            offsets.append(best_gap / radius)

    pct = lambda n, d: "0.0" if d == 0 else f"{n / d * 100:.1f}"
    offsets.sort()
    median = offsets[len(offsets) // 2] if offsets else 0

    print(f"weights              {os.path.relpath(args.weights, ROOT)}")
    print(f"images with labels   {images}")
    print(f"arrows labelled      {truth_total}")
    print(f"arrows reported      {reported}")
    print(f"recall               {pct(matched, truth_total)}%")
    print(f"precision            {pct(matched, reported)}%")
    print(f"median offset        {median * 100:.1f}% of face radius")


if __name__ == "__main__":
    sys.exit(main())
