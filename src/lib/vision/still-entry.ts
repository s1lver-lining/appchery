// Entry point for scripts/arrow_detector.sh, bundled and run inside a browser so it can decode and
// re-encode images. Not imported by the app.
import { downscale } from "./pixels";
import { detectFaces, scaleFace, toFaceCoords } from "./face";
import { verifyRings } from "./rings";
import { detectArrowsInStill, type StillOptions } from "./still";
import { detectArrowsLearned, type ArrowModel } from "./learned";
import { scoreAt, decimalScore } from "../domain/rounds/geometry";
import { WA_10_RING } from "../domain/rounds/seed";
import type { Frame, FaceLocation } from "./types";

export interface StillFace {
  cx: number;
  cy: number;
  semiMajor: number;
  semiMinor: number;
  rotation: number;
  agreement: number;
  /**
   * The four points the fit is really made of, in the original image's pixels.
   *
   * Reported beside the ellipse because they are not the same thing and only one of them is the fit. A
   * boss seen from anywhere but square on is a projection, and the ellipse that matches it round the
   * gold does not match it at the edge: drawn from the ellipse, the outer ring lands a couple of rings
   * inside where it belongs. Four points carry the projection itself, so anything drawing the face
   * rather than summarising it should draw from these.
   */
  anchors: [number, number][];
  arrows: {
    x: number;
    y: number;
    imageX: number;
    imageY: number;
    tailX: number;
    tailY: number;
    area: number;
    length: number;
    label: string;
    decimal: number | null;
    /** How sure the learned detector is. Absent from the classical one, which has no such notion. */
    confidence?: number;
  }[];
}

/**
 * Detection at a chosen scale, with every coordinate reported in the original image's pixels so a
 * caller can draw straight onto it.
 */
/** The single best verified face at a chosen scale, in the original image's pixels. */
export function locate(frame: Frame, scale = 2): FaceLocation | null {
  const small = downscale(frame, scale);
  const face = detectFaces(small).filter((f) => verifyRings(small, f).ok)[0];
  if (!face) return null;
  return scaleFace(face, scale);
}

/** Image pixels to face coordinates, exported so a data preparation step agrees with the app. */
export function toFace(
  face: FaceLocation,
  x: number,
  y: number,
): { x: number; y: number } {
  return toFaceCoords(face, x, y);
}

/**
 * The same as `analyse`, with the learned detector in place of the rule based one. Kept beside it so
 * the two can be measured through one harness on one set of photographs, which is the only way a claim
 * that either is better means anything.
 */
export function analyseLearned(
  frame: Frame,
  scale = 2,
  model: ArrowModel,
  threshold?: number,
): StillFace[] {
  const small = downscale(frame, scale);

  return detectFaces(small)
    .filter((face) => verifyRings(small, face).ok)
    .map((face) => {
      /**
       * The face is found on the reduced frame, but the crop is cut from the full one, exactly as
       * the training crops were. Sampling the reduced frame instead gives the model a blurrier
       * picture than anything it was trained on, which is a difference it has no way to know about.
       */
      const full = scaleFace(face, scale);
      return {
        cx: full.cx,
        cy: full.cy,
        semiMajor: full.semiMajor,
        semiMinor: full.semiMinor,
        rotation: face.rotation,
        agreement: face.support,
        anchors: full.anchors.map(([x, y]) => [x, y] as [number, number]),
        arrows: detectArrowsLearned(frame, full, model, threshold).map(
          (arrow) => ({
            x: arrow.x,
            y: arrow.y,
            imageX: arrow.imageX,
            imageY: arrow.imageY,
            tailX: arrow.imageX,
            tailY: arrow.imageY,
            area: 0,
            length: 0,
            label: scoreAt(WA_10_RING, arrow.x, arrow.y).label,
            decimal: decimalScore(WA_10_RING, arrow.x, arrow.y),
            confidence: arrow.confidence,
          }),
        ),
      };
    });
}

export function analyse(
  frame: Frame,
  scale = 2,
  tune: StillOptions = {},
): StillFace[] {
  const small = downscale(frame, scale);

  return detectFaces(small)
    .filter((face) => verifyRings(small, face).ok)
    .map((face) => {
      const arrows = detectArrowsInStill(small, face, tune).map((arrow) => ({
        x: arrow.x,
        y: arrow.y,
        imageX: arrow.imageX * scale,
        imageY: arrow.imageY * scale,
        tailX: arrow.tailX * scale,
        tailY: arrow.tailY * scale,
        area: arrow.area * scale * scale,
        length: arrow.length * scale,
        label: scoreAt(WA_10_RING, arrow.x, arrow.y).label,
        decimal: decimalScore(WA_10_RING, arrow.x, arrow.y),
      }));

      return {
        cx: face.cx * scale,
        cy: face.cy * scale,
        semiMajor: face.semiMajor * scale,
        semiMinor: face.semiMinor * scale,
        rotation: face.rotation,
        agreement: face.support,
        anchors: face.anchors.map(([x, y]) => [x * scale, y * scale] as [number, number]),
        arrows,
      };
    });
}
