/**
 * PURPOSE    Compare exact native payload bytes independently of part boundaries.
 * KIND       CORE
 * CONTRACT   IN: dense arrays of Uint8Array views. OUT: true only for equal byte
 *            sequences, including equal total length. Empty parts are permitted.
 * GUARANTEES No allocation proportional to payload size, flattening or mutation.
 * LIMITS     Callers retain immutable byte ownership during this synchronous check.
 * TESTBENCH  src/shared/same-payload.test.ts
 */
export function samePayload(left: readonly Uint8Array[], right: readonly Uint8Array[]): boolean {
  if (left === right) return true;
  if (left.reduce((sum, part) => sum + part.length, 0) !== right.reduce((sum, part) => sum + part.length, 0)) return false;
  let index = 0, offset = 0;
  for (const part of left) {
    let position = 0;
    while (position < part.length) {
      while (offset === right[index]!.length) { index++; offset = 0; }
      const other = right[index]!, count = Math.min(part.length - position, other.length - offset);
      // Check part boundaries once per span, rather than once per byte.
      if (part !== other || position !== offset) {
        for (let byte = 0; byte < count; byte++) if (part[position + byte] !== other[offset + byte]) return false;
      }
      position += count; offset += count;
    }
  }
  return true;
}
