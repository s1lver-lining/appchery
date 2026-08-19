// How far the detector's idea of a shaft's far end is from a nock placed by hand.
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const ROOT = '/home/u/scripts/appchery/';
const WORK = join(ROOT, 'test/datasets/labelling');
const VIDEOS = join(ROOT, 'test/datasets/appchery_videos');
const SCALE = 4;
const A = [[0.8,0],[0,0.8],[-0.8,0],[0,-0.8]];

const dir = await mkdtemp(join(tmpdir(), 'tails-'));

await build({ entryPoints: [join(ROOT, 'src/lib/vision/still.ts')], bundle: true, format: 'esm', platform: 'node', outfile: join(dir, 's.mjs') });
const { detectArrowsInStill } = await import(join(dir, 's.mjs'));
await build({ entryPoints: [join(ROOT, 'src/lib/vision/face.ts')], bundle: true, format: 'esm', platform: 'node', outfile: join(dir, 'f.mjs') });
const { faceFromAnchors, toFaceCoords } = await import(join(dir, 'f.mjs'));

const angles = [];
const gaps = [];
const tune = process.argv.includes('--tune') ? JSON.parse(process.argv[process.argv.indexOf('--tune') + 1]) : {};
for (const name of (await readdir(WORK)).sort()) {
  const file = join(WORK, name, 'labels.json');
  if (!existsSync(file)) continue;
  const label = JSON.parse(await readFile(file, 'utf8'));
  if (!label.nocks || !label.arrows?.length) continue;
  const meta = JSON.parse(await readFile(join(WORK, name, 'frames.json'), 'utf8'));

  for (const [index, placed] of Object.entries(label.nocks)) {
    if (!placed?.length) continue;
    // A hand fit if there is one, otherwise the frame's own automatic one, for want of enough of the first.
    const fit = label.frames?.[index]?.handles ? label.frames[index] : { handles: meta.seeds?.[Number(index)]?.handles };
    if (!fit?.handles) continue;
    const small = { width: Math.floor(meta.width / SCALE), height: Math.floor(meta.height / SCALE) };
    const frame = await frameAt(join(VIDEOS, name), meta.chosen[Number(index)], small);
    if (!frame) continue;
    const face = faceFromAnchors(fit.handles.map(([x, y]) => [x / SCALE, y / SCALE]), 1);
    if (!face) continue;

    const found = detectArrowsInStill(frame, face, tune);
    for (const arrow of label.arrows) {
      // The proposal nearest this labelled impact, which is the one describing the same shaft.
      let near = null;
      let best = 0.06;
      for (const p of found) {
        const d = Math.hypot(p.x - arrow.x, p.y - arrow.y);
        if (d < best) { best = d; near = p; }
      }
      if (!near) continue;
      /**
       * Against whichever hand nock on this frame agrees best, not the one whose number was written
       * beside it. The numbers are known to be scrambled, and pinning the wrong nock to an arrow would
       * measure that mistake rather than the detector.
       */
      const tail = toFaceCoords(face, near.leanX, near.leanY);
      const tx = tail.x - near.x, ty = tail.y - near.y;
      const tl = Math.hypot(tx, ty);
      if (tl < 1e-6) continue;
      let bestAngle = null;
      let bestGap = null;
      for (const nock of placed) {
        const hand = toFaceCoords(face, nock.x / SCALE, nock.y / SCALE);
        const hx = hand.x - arrow.x, hy = hand.y - arrow.y;
        const hl = Math.hypot(hx, hy);
        if (hl < 1e-6) continue;
        const a = Math.acos(Math.min(1, Math.abs((hx * tx + hy * ty) / (hl * tl)))) * 57.3;
        if (bestAngle === null || a < bestAngle) { bestAngle = a; bestGap = tl / hl; }
      }
      if (bestAngle === null) continue;
      angles.push(bestAngle);
      gaps.push(bestGap);
    }
  }
}
await rm(dir, { recursive: true, force: true });
const at = (a, s) => a.sort((x, y) => x - y)[Math.floor((a.length - 1) * s)];
console.log(`pairs measured   ${angles.length}`);
if (angles.length) {
  console.log(`direction off    ${at(angles,0.5).toFixed(1)}deg median, ${at(angles,0.9).toFixed(1)}deg p90`);
  console.log(`length vs hand   ${at(gaps,0.5).toFixed(2)}x median, ${at(gaps,0.1).toFixed(2)}x p10, ${at(gaps,0.9).toFixed(2)}x p90`);
}

async function frameAt(file, n, small) {
  return new Promise((done) => {
    const child = spawn('ffmpeg', ['-v','error','-i',file,'-vf',`select='eq(n\\,${n})',scale=${small.width}:${small.height}:flags=area`,'-frames:v','1','-f','rawvideo','-pix_fmt','rgba','-'], { stdio:['ignore','pipe','ignore'] });
    const parts = [];
    child.stdout.on('data', (c) => parts.push(c));
    child.on('close', () => {
      const b = Buffer.concat(parts);
      const need = small.width * small.height * 4;
      done(b.length >= need ? { width: small.width, height: small.height, data: new Uint8ClampedArray(b.buffer, b.byteOffset, need) } : null);
    });
  });
}
