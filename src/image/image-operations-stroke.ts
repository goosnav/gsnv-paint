/**
 * PURPOSE    Replay segmented brush delivery.
 * KIND       CORE
 * CONTRACT   Assembly: composes coverage, hard strokes, filtering and masks.
 *            Mutates owned raster using a validated stroke and optional selection;
 *            bottom-layer erasure uses the recorded background. No input snapshots
 *            or operation records are changed. RAISES: underlying raster errors.
 * GUARANTEES Actual segments, seeds, flow carry and selection timing match drawing.
 * TUNING     Brush spacing and pixel-grid limits belong to existing raster bricks.
 * DECISIONS  D1: Preserve delivery boundaries, including stationary spray samples.
 *            Revisit only if interactive drawing adopts a different delivery model.
 *            Alternative: flatten all samples. Revisit if drawing delivery changes.
 * LIMITS     No timing or pressure synthesis; recorder stores effective tool options.
 * TESTBENCH  src/image/image-operations.test.ts
 * DEMO       node --import tsx src/image/image-operations.demo.ts
 */
import { applyCoverage, dab, dabLine, spray, smudgeDab, type CoverageMode, type SmudgeCarry } from './image-brush.ts';
import { pixelStroke } from './pixel-stroke.ts';
import { blurRaster } from './image-adjust.ts';
import { maskedMerge } from './image-composite.ts';
import type { ImageOperation } from './image-operation-types.ts';
import type { Raster, Rect } from './raster-ops.ts';
export function replayStroke(raster: Raster, mask: Uint8Array | null, op: Extract<ImageOperation, { kind: 'stroke' }>, bottom: boolean): void {
  const { options: o, tool } = op, base = raster.data.slice(), cov = { width: raster.width, height: raster.height, data: new Float32Array(raster.width * raster.height) };
  let mode: CoverageMode = { kind: 'paint', color: op.color }, carry = 0, smudge: SmudgeCarry | null = null;
  if (tool === 'eraser') mode = bottom ? { kind: 'paint', color: op.background } : { kind: 'erase' };
  if (tool === 'clone') mode = { kind: 'clone', source: base, dx: Math.round(op.cloneOffset![0]), dy: Math.round(op.cloneOffset![1]) };
  if (tool === 'blur') mode = { kind: 'filter', filtered: blurRaster({ ...raster, data: base }, Math.max(2, o.size / 6)) };
  for (const segment of op.segments) {
    const { points } = segment, from = points[0]!, last = points.at(-1)!; let rect: Rect | null = null;
    if (tool === 'pencil' || (['brush', 'eraser'].includes(tool) && o.edge === 'pixel')) rect = pixelStroke({ cov, points, size: o.size, pixelSize: o.pixelSize, tip: tool === 'pencil' ? 'square' : 'round' });
    else if (tool === 'smudge') {
      const length = Math.hypot(last[0] - from[0], last[1] - from[1]), step = Math.max(1, o.size * .1);
      if (!smudge) smudge = smudgeDab(raster, null, from, o.size, o.hardness, o.strength).carry;
      for (let d = step; d <= length + .001; d += step) {
        const r = smudgeDab(raster, smudge, [from[0] + (last[0] - from[0]) * d / length, from[1] + (last[1] - from[1]) * d / length], o.size, o.hardness, o.strength); smudge = r.carry;
        if (r.rect) rect = !rect ? r.rect : { x: Math.min(rect.x, r.rect.x), y: Math.min(rect.y, r.rect.y), width: Math.max(rect.x + rect.width, r.rect.x + r.rect.width) - Math.min(rect.x, r.rect.x), height: Math.max(rect.y + rect.height, r.rect.y + r.rect.height) - Math.min(rect.y, r.rect.y) };
      }
    } else if (tool === 'airbrush') rect = spray(cov, last[0], last[1], o.size / 2, Math.ceil(o.density / 4), segment.seed);
    else if (points.length === 1) rect = dab(cov, last[0], last[1], o.size, o.hardness, tool === 'brush' ? o.flow : 1);
    else { const result = dabLine(cov, from, last, o.size, o.hardness, tool === 'brush' ? o.flow : 1, carry); rect = result.rect; carry = result.carry; }
    if (!rect) continue;
    if (tool !== 'smudge') applyCoverage({ raster, base, cov, rect, mode, opacity: tool === 'pencil' ? 1 : o.opacity });
    if (mask) maskedMerge({ target: raster, base, mask, rect });
  }
}
