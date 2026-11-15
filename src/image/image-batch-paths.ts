/**
 * PURPOSE    Produce safe batch output leaf names.
 * KIND       CORE
 * CONTRACT   batchFolderName({now,runId,attempt?}) returns a UTC timestamp/run child;
 *            batchOutputName({inputName,extension,used}) sanitizes a source basename and
 *            adds a case-insensitive collision suffix. validateBatchName accepts one leaf.
 *            RAISES: RangeError for unsafe names, unsupported extensions or invalid clock/ID.
 * GUARANTEES No I/O, path resolution, traversal, input mutation or original-file authority.
 * TUNING     Output names <=200 UTF-8 bytes; write names <=255. Collision attempts <=9999.
 * DECISIONS  D1: Portable leaf-only names. Alternative: preserve source relative paths;
 *            rejected because batch recursion is off. Revisit if: recursive batch is approved.
 * LIMITS     Caller must check actual destination collisions; names cannot provide atomic
 *            exclusive filesystem creation. Date/time is UTC, marked Z in the name.
 * TESTBENCH  node --import tsx --test src/image/image-batch-paths.test.ts
 * DEMO       node --import tsx src/image/image-batch-paths.demo.ts
 */
const encoder = new TextEncoder();
const reserved = (name: string) => /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);
const normal = (name: string) => name.normalize('NFC').toLowerCase();

export function validateBatchName(name: string): string {
  if (typeof name !== 'string' || !name || name === '.' || name === '..' || /[\x00-\x1f\x7f/\\<>:"|?*]/.test(name) || /[. ]$/.test(name) || reserved(name) || encoder.encode(name).length > 255) throw new RangeError('Use a safe file name without paths, reserved characters or trailing dots/spaces.');
  return name;
}

export function batchFolderName({ now, runId, attempt = 0 }: { now: number; runId: string; attempt?: number }): string {
  if (!Number.isFinite(now) || now < 0 || now > 253402300799999 || typeof runId !== 'string' || !/^[a-zA-Z0-9_-]{4,64}$/.test(runId) || !Number.isInteger(attempt) || attempt < 0 || attempt > 9999) throw new RangeError('Batch folder needs a valid timestamp, run ID and collision attempt.');
  const time = new Date(now).toISOString().slice(0, 19).replace('T', '_').replaceAll(':', '-');
  return `gsnv-paint-batch-${time}Z-${runId}${attempt ? `-${attempt + 1}` : ''}`;
}

export function batchOutputName({ inputName, extension, used }: { inputName: string; extension: 'png' | 'jpg' | 'webp' | 'gsnv-image'; used: readonly string[] }): string {
  if (typeof inputName !== 'string' || !['png', 'jpg', 'webp', 'gsnv-image'].includes(extension) || !Array.isArray(used)) throw new RangeError('Choose a supported batch output format and source name.');
  const occupied = new Set(used.map(name => normal(validateBatchName(name))));
  let base = (inputName.split(/[/\\]/).at(-1) ?? '').replace(/\.[^.]*$/, '').normalize('NFC').replace(/[\x00-\x1f\x7f<>:"|?*]/g, '_').replace(/^[. ]+|[. ]+$/g, '');
  if (!base) base = 'image'; if (reserved(base)) base = `_${base}`;
  const characters = [...base]; while (encoder.encode(characters.join('')).length > 175) characters.pop(); base = characters.join('') || 'image';
  for (let suffix = 1; suffix <= 10000; suffix++) {
    const name = `${base}${suffix === 1 ? '' : `-${suffix}`}.${extension}`;
    if (!occupied.has(normal(name))) return validateBatchName(name);
  }
  throw new RangeError('Too many batch output names collide. Choose another output name.');
}
