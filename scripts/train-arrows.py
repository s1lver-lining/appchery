#!/usr/bin/env python3
"""Trains a small heatmap network to find arrow impacts on a rectified target face.

Run `node scripts/prepare-arrows.mjs` first: it uses the classical face detector to produce square
crops in face coordinates, which is what this trains on. The model therefore never has to learn scale,
rotation or position, and a prediction comes out as a point that scores directly.

    .venv-ml/bin/python scripts/train-arrows.py [--epochs 120]

Deliberately tiny, about seventy thousand weights. Two reasons: a few hundred photographs cannot
support anything larger without memorising them, and the result has to run on a phone inside the
existing detection budget, in a hand written forward pass with no inference runtime shipped alongside.
"""
import argparse
import json
import math
import os
import random

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PREPARED = os.path.join(ROOT, "test/datasets/prepared")
OUT = os.path.join(ROOT, "src/lib/vision/arrow-model.json")

SIZE = 128
STRIDE = 4
GRID = SIZE // STRIDE


class Net(nn.Module):
    """Convolutions down to a quarter resolution, then one head for presence and one for position."""

    def __init__(self):
        super().__init__()

        def block(a, b, stride=1, dilation=1):
            return nn.Sequential(
                nn.Conv2d(a, b, 3, stride, padding=dilation, dilation=dilation, bias=False),
                nn.BatchNorm2d(b),
                nn.ReLU(inplace=True),
            )

        self.body = nn.Sequential(
            block(3, 16, stride=2),
            block(16, 32, stride=2),
            block(32, 32),
            block(32, 64),
            # Dilated, to see enough of a shaft to tell which end of it is in the paper.
            block(64, 64, dilation=2),
            block(64, 64, dilation=4),
        )
        self.head = nn.Conv2d(64, 3, 1)
        # Starts predicting "no arrow here" everywhere, which is true of almost every cell.
        nn.init.constant_(self.head.bias[0], -4.0)

    def forward(self, x):
        out = self.head(self.body(x))
        return out[:, 0], out[:, 1:]


def load(span):
    meta = json.load(open(os.path.join(PREPARED, "labels.json")))
    examples = []
    for item in meta["examples"]:
        path = os.path.join(PREPARED, "images", item["file"])
        image = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32) / 255.0
        examples.append((image, np.array([[p["x"], p["y"]] for p in item["points"]], dtype=np.float32)))
    return meta, examples


def to_grid(points, span):
    """Face coordinates to grid cells, as a continuous position."""
    return (points + span) / (2 * span) * GRID


def render(points, span):
    """A Gaussian per arrow on the presence map, and the sub cell offset at each peak."""
    heat = np.zeros((GRID, GRID), dtype=np.float32)
    offset = np.zeros((2, GRID, GRID), dtype=np.float32)
    mask = np.zeros((GRID, GRID), dtype=np.float32)
    if len(points) == 0:
        return heat, offset, mask

    cells = to_grid(points, span)
    sigma = 1.0
    for cx, cy in cells:
        ix, iy = int(cx), int(cy)
        if not (0 <= ix < GRID and 0 <= iy < GRID):
            continue
        for j in range(max(0, iy - 3), min(GRID, iy + 4)):
            for i in range(max(0, ix - 3), min(GRID, ix + 4)):
                d = (i + 0.5 - cx) ** 2 + (j + 0.5 - cy) ** 2
                heat[j, i] = max(heat[j, i], math.exp(-d / (2 * sigma**2)))
        # Exactly one, at the cell the arrow is in. The Gaussian is measured from the cell's centre, so
        # its own peak only reaches about 0.78, and the focal loss takes "positive" to mean a target of
        # one: without this line there are no positives at all and the model learns to say nothing.
        heat[iy, ix] = 1.0
        offset[0, iy, ix] = cx - ix
        offset[1, iy, ix] = cy - iy
        mask[iy, ix] = 1
    return heat, offset, mask


def augment(image, points, span, rng):
    """Rotation is the big one: a target face is round, so any angle is another real example."""
    angle = rng.uniform(0, 2 * math.pi)
    flip = rng.random() < 0.5

    pil = Image.fromarray((image * 255).astype(np.uint8))
    if flip:
        pil = pil.transpose(Image.FLIP_LEFT_RIGHT)
    pil = pil.rotate(math.degrees(angle), resample=Image.BILINEAR)
    out = np.asarray(pil, dtype=np.float32) / 255.0

    moved = points.copy()
    if len(moved):
        if flip:
            moved[:, 0] = -moved[:, 0]
        cos, sin = math.cos(-angle), math.sin(-angle)
        x = moved[:, 0] * cos - moved[:, 1] * sin
        y = moved[:, 0] * sin + moved[:, 1] * cos
        moved = np.stack([x, y], axis=1)
        moved = moved[(np.abs(moved[:, 0]) < span) & (np.abs(moved[:, 1]) < span)]

    # Light and colour vary far more between clubs than anything else in these pictures.
    out = np.clip(out * rng.uniform(0.6, 1.4) + rng.uniform(-0.12, 0.12), 0, 1)
    return out, moved


def focal(pred, target):
    """CornerNet's penalty reduced focal loss: near misses beside a true peak are barely punished."""
    prob = torch.sigmoid(pred).clamp(1e-4, 1 - 1e-4)
    positive = (target >= 0.999).float()
    negative = 1 - positive
    loss_pos = -((1 - prob) ** 2) * torch.log(prob) * positive
    loss_neg = -((1 - target) ** 4) * (prob**2) * torch.log(1 - prob) * negative
    count = positive.sum().clamp(min=1)
    return (loss_pos.sum() + loss_neg.sum()) / count


def peaks(heat, offset, span, threshold):
    """Local maxima over the threshold, as points in face coordinates with their confidence."""
    prob = torch.sigmoid(heat)
    pooled = F.max_pool2d(prob[None, None], 3, 1, 1)[0, 0]
    keep = (prob >= pooled) & (prob > threshold)
    found = []
    for j, i in torch.nonzero(keep).tolist():
        ox = offset[0, j, i].item()
        oy = offset[1, j, i].item()
        x = (i + ox) / GRID * 2 * span - span
        y = (j + oy) / GRID * 2 * span - span
        found.append((x, y, prob[j, i].item()))
    return found


def evaluate(model, data, span, threshold, tolerance=0.08):
    model.eval()
    truth_total = reported = matched = 0
    offsets = []
    with torch.no_grad():
        for image, points in data:
            x = torch.from_numpy(image.transpose(2, 0, 1))[None] * 2 - 1
            heat, offset = model(x)
            found = peaks(heat[0], offset[0], span, threshold)
            truth_total += len(points)
            reported += len(found)
            claimed = set()
            for px, py, _ in found:
                best, gap = -1, float("inf")
                for i, point in enumerate(points):
                    if i in claimed:
                        continue
                    d = math.hypot(point[0] - px, point[1] - py)
                    if d < gap:
                        gap, best = d, i
                if best < 0 or gap > tolerance:
                    continue
                claimed.add(best)
                matched += 1
                offsets.append(gap)
    offsets.sort()
    return {
        "truth": truth_total,
        "reported": reported,
        "matched": matched,
        "recall": matched / max(truth_total, 1),
        "precision": matched / max(reported, 1),
        "offset": offsets[len(offsets) // 2] if offsets else 0,
    }


def export(model, span, threshold):
    """Folds the batch norms into the convolutions and writes plain arrays for the app to read."""
    model.eval()
    layers = []
    for block in model.body:
        conv, bn = block[0], block[1]
        scale = bn.weight / torch.sqrt(bn.running_var + bn.eps)
        weight = conv.weight * scale.reshape(-1, 1, 1, 1)
        bias = bn.bias - bn.running_mean * scale
        layers.append(
            {
                "in": conv.in_channels,
                "out": conv.out_channels,
                "stride": conv.stride[0],
                "dilation": conv.dilation[0],
                "relu": True,
                "weight": [round(v, 5) for v in weight.detach().flatten().tolist()],
                "bias": [round(v, 5) for v in bias.detach().flatten().tolist()],
            }
        )
    layers.append(
        {
            "in": model.head.in_channels,
            "out": model.head.out_channels,
            "stride": 1,
            "dilation": 1,
            "kernel": 1,
            "relu": False,
            "weight": [round(v, 5) for v in model.head.weight.detach().flatten().tolist()],
            "bias": [round(v, 5) for v in model.head.bias.detach().flatten().tolist()],
        }
    )
    with open(OUT, "w") as handle:
        json.dump(
            {"size": SIZE, "grid": GRID, "span": span, "threshold": threshold, "layers": layers},
            handle,
        )
    return sum(len(l["weight"]) + len(l["bias"]) for l in layers)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=120)
    parser.add_argument("--threshold", type=float, default=0.3)
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()

    torch.manual_seed(args.seed)
    rng = random.Random(args.seed)
    meta, examples = load(0)
    span = meta["span"]

    # Split by photograph, held fixed by seed, so the same test set can be given to either detector.
    order = list(range(len(examples)))
    random.Random(1234).shuffle(order)
    cut = int(len(order) * 0.8)
    train = [examples[i] for i in order[:cut]]
    test = [examples[i] for i in order[cut:]]
    print(f"train {len(train)} crops, test {len(test)} crops")

    model = Net()
    total = sum(p.numel() for p in model.parameters())
    print(f"parameters {total}")

    optimiser = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    schedule = torch.optim.lr_scheduler.OneCycleLR(
        optimiser, max_lr=1e-3, total_steps=args.epochs * max(1, len(train) // 16)
    )

    batch = 16
    for epoch in range(args.epochs):
        model.train()
        rng.shuffle(train)
        running = 0.0
        steps = 0
        for start in range(0, len(train) - batch + 1, batch):
            images, heats, offsets, masks = [], [], [], []
            for image, points in train[start : start + batch]:
                aug, moved = augment(image, points, span, rng)
                heat, offset, mask = render(moved, span)
                images.append(aug.transpose(2, 0, 1))
                heats.append(heat)
                offsets.append(offset)
                masks.append(mask)

            x = torch.from_numpy(np.stack(images)) * 2 - 1
            heat_t = torch.from_numpy(np.stack(heats))
            offset_t = torch.from_numpy(np.stack(offsets))
            mask_t = torch.from_numpy(np.stack(masks))

            heat_p, offset_p = model(x)
            loss = focal(heat_p, heat_t)
            if mask_t.sum() > 0:
                loss = loss + 1.0 * (
                    (torch.abs(offset_p - offset_t) * mask_t[:, None]).sum() / mask_t.sum()
                )

            optimiser.zero_grad()
            loss.backward()
            optimiser.step()
            schedule.step()
            running += loss.item()
            steps += 1

        if (epoch + 1) % 20 == 0 or epoch == args.epochs - 1:
            scored = evaluate(model, test, span, args.threshold)
            print(
                f"epoch {epoch + 1:3d}  loss {running / max(steps, 1):.3f}  "
                f"recall {scored['recall'] * 100:.1f}%  precision {scored['precision'] * 100:.1f}%"
            )

    print("\nheld out test set, the same photographs either detector may be measured on:")
    for threshold in (0.2, 0.3, 0.4, 0.5):
        scored = evaluate(model, test, span, threshold)
        print(
            f"  threshold {threshold}:  reported {scored['reported']:4d}  "
            f"recall {scored['recall'] * 100:5.1f}%  precision {scored['precision'] * 100:5.1f}%  "
            f"offset {scored['offset'] * 100:.1f}%"
        )

    weights = export(model, span, args.threshold)
    print(f"\nexported {weights} weights to {os.path.relpath(OUT, ROOT)}")

    with open(os.path.join(PREPARED, "split.json"), "w") as handle:
        json.dump(
            {
                "test": [meta["examples"][i]["source"] for i in order[cut:]],
                "train": [meta["examples"][i]["source"] for i in order[:cut]],
            },
            handle,
        )


if __name__ == "__main__":
    main()
