/**
 * PURPOSE    Serialize triangle meshes to binary STL.
 * KIND       CORE
 * CONTRACT   IN: {name, meshes:[{positions,indices}], unitScaleToMm}. Positions are xyz triples,
 *            indices are counterclockwise-outward triangles; scale converts mesh units to mm.
 *            OUT: ExchangeBytes {name,mime:'model/stl',bytes,diagnostics}; 80-byte header, uint32
 *            triangle count, then per triangle a unit normal, three vertices and a zero attribute.
 *            RAISES: InvalidExportMeshError (no triangles, bad index, nonfinite value),
 *            STLSizeOverflowError (beyond uint32 triangles or 2 GiB), InvalidUnitScaleError.
 * GUARANTEES Pure and deterministic: identical input gives identical bytes. Degenerate triangles
 *            are kept with a zero normal and reported once in diagnostics.
 * TUNING     Header text is "gsnv-paint STL" plus the sanitized name.
 * DECISIONS  D1: Binary rather than ASCII STL: about five times smaller and universally read by
 *            slicers. Revisit if: an owner requirement asks for ASCII output.
 * LIMITS     STL carries no units, colour or topology; consumers assume millimetres.
 * TESTBENCH  src/cad/stl-serialization.test.ts -- run with: node --import tsx --test src/cad/stl-serialization.test.ts
 */
export type MeshPacket = { positions: ArrayLike<number>; indices: ArrayLike<number> };
export type ExchangeBytes = { name: string; mime: string; bytes: Uint8Array; diagnostics: { code: string; message: string }[] };
const MAX_BYTES = 2 ** 31;
const error = (name: string, message: string): never => { throw Object.assign(new Error(message), { name }); };

export function writeSTL({ name, meshes, unitScaleToMm }: { name: string; meshes: readonly MeshPacket[]; unitScaleToMm: number }): ExchangeBytes {
  if (!Number.isFinite(unitScaleToMm) || unitScaleToMm <= 0) error('InvalidUnitScaleError', 'The unit scale must be a positive finite number.');
  let triangles = 0;
  for (const mesh of meshes) {
    if (mesh.indices.length % 3 || mesh.positions.length % 3) error('InvalidExportMeshError', 'Mesh buffers must contain whole triangles and xyz positions.');
    for (let i = 0; i < mesh.positions.length; i++) if (!Number.isFinite(mesh.positions[i]!)) error('InvalidExportMeshError', 'Mesh positions must be finite.');
    const count = mesh.positions.length / 3;
    for (let i = 0; i < mesh.indices.length; i++) { const v = mesh.indices[i]!; if (!Number.isInteger(v) || v < 0 || v >= count) error('InvalidExportMeshError', 'A triangle refers to a missing vertex.'); }
    triangles += mesh.indices.length / 3;
  }
  if (!triangles) error('InvalidExportMeshError', 'There are no triangles to export.');
  const size = 84 + triangles * 50;
  if (triangles > 0xffffffff || size > MAX_BYTES) error('STLSizeOverflowError', 'The mesh is too large for an STL file.');
  const bytes = new Uint8Array(size), view = new DataView(bytes.buffer), header = `gsnv-paint STL ${name}`.replace(/[^\x20-\x7e]/g, '_').slice(0, 80);
  for (let i = 0; i < header.length; i++) bytes[i] = header.charCodeAt(i);
  view.setUint32(80, triangles, true);
  let offset = 84, degenerate = 0;
  for (const { positions: p, indices } of meshes) for (let t = 0; t < indices.length; t += 3) {
    const v = [indices[t]!, indices[t + 1]!, indices[t + 2]!].map(i => [p[i * 3]! * unitScaleToMm, p[i * 3 + 1]! * unitScaleToMm, p[i * 3 + 2]! * unitScaleToMm]) as [number, number, number][];
    const u = v[1]!.map((x, k) => x - v[0]![k]!), w = v[2]!.map((x, k) => x - v[0]![k]!);
    let n = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
    const length = Math.hypot(...n);
    if (length > 0 && Number.isFinite(length)) n = n.map(x => x / length); else { n = [0, 0, 0]; degenerate++; }
    for (const value of [...n, ...v.flat()]) { view.setFloat32(offset, value, true); offset += 4; }
    offset += 2;
  }
  return { name, mime: 'model/stl', bytes, diagnostics: degenerate ? [{ code: 'stl.degenerate', message: `${degenerate} zero-area triangle(s) were written with a zero normal.` }] : [] };
}
