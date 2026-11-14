/**
 * PURPOSE    Canonicalize an image selection as an owned coverage snapshot.
 * KIND       CORE
 * CONTRACT   IN: {width,height,mask:Uint8Array|null}; positive integer dimensions with
 *            at most 16,777,216 pixels; an ordinary non-detached mask has one byte per pixel.
 *            OUT: ImageSelection|null; a copied mask and smallest nonzero bounding rectangle.
 *            Empty and null masks return null. The record and bounds are frozen.
 *            RAISES: RangeError for invalid dimensions, mask type/length or shared memory.
 * GUARANTEES Pure, deterministic, no I/O or input mutation; output bytes never alias input.
 *            Callers keep reachable output bytes immutable throughout a snapshot's lifetime.
 * TUNING     MAX_PIXELS=16,777,216 matches the Image raster contract (16 MiB coverage).
 * DECISIONS  D1: Store raw coverage. Alternative: shape gestures; these cannot preserve
 *            arbitrary partial selections. Revisit if the format uses editable vector selections.
 *            D2: Derive bounds from bytes. Alternative: persist bounds; stale rectangles
 *            would clip edits. Revisit only with a validated compressed coverage representation.
 * LIMITS     Does not rasterize shapes or combine masks; those are upstream pixel operations.
 * TESTBENCH  src/image/image-selection-state.test.ts -- run with: node --import tsx --test src/image/image-selection-state.test.ts
 */
export type ImageSelection = Readonly<{
  mask: Uint8Array;
  bounds: Readonly<{ x: number; y: number; width: number; height: number }>;
}>;
type SelectionRequest = { width: number; height: number; mask: Uint8Array | null };
const MAX_PIXELS = 16777216;

export function imageSelectionState({ width, height, mask }: SelectionRequest): ImageSelection | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS)
    throw new RangeError('Selection dimensions must match a valid Image document.');
  if (mask === null) return null;
  if (!(mask instanceof Uint8Array) || !(mask.buffer instanceof ArrayBuffer) || mask.length !== width * height)
    throw new RangeError('Selection coverage must contain one unshared byte per pixel.');
  let left = width, top = height, right = -1, bottom = -1;
  const owned = new Uint8Array(mask);
  for (let p = 0; p < owned.length; p++) {
    if (!owned[p]) continue;
    const x = p % width, y = Math.floor(p / width);
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (right < 0) return null;
  return Object.freeze({ mask: owned, bounds: Object.freeze({ x: left, y: top, width: right - left + 1, height: bottom - top + 1 }) });
}
