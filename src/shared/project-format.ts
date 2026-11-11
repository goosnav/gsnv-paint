/**
 * PURPOSE    Encode or decode a common versioned native project envelope.
 * KIND       CORE
 * CONTRACT   IN: FormatRequest; five-key envelope or JSON text, at most 64 MiB UTF-8.
 *            OUT: canonical JSON string or validated ProjectEnvelope; content preserved.
 *            RAISES: ProjectFormatError for invalid JSON/envelope, unsafe keys,
 *            unsupported format/version, cycles, non-Json values or excessive size.
 * GUARANTEES Pure, deterministic, no input mutation, no domain-content interpretation.
 * TUNING     MAX_BYTES=64 MiB (transport contract; changes require format review).
 * DECISIONS  D1: Sort record keys by UTF-16 code units and preserve negative zero.
 *            Alternative: native JSON.stringify; rejected because insertion order and
 *            lossy coercions would hide invalid values. Revisit on format migration.
 *            D2: Use an explicit traversal stack. Alternative: recursion; rejected
 *            because valid deeply nested JSON must not depend on call-stack depth.
 *            Revisit if a future format specifies a nesting bound.
 * LIMITS     Common metadata only; binary assets and domain validity belong to callers.
 * TESTBENCH  src/shared/project-format.test.ts -- run with: node --import tsx --test src/shared/project-format.test.ts
 */

type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
export type ProjectEnvelope = {
  readonly format: 'gsnv-cad' | 'gsnv-image' | 'gsnv-video';
  readonly version: 1;
  readonly id: string;
  readonly title: string;
  readonly content: Json;
};
type EncodeRequest = { op: 'encode'; project: ProjectEnvelope };
type DecodeRequest = { op: 'decode'; text: string };
type FormatRequest = EncodeRequest | DecodeRequest;
type FormatOutput<T extends FormatRequest> = T extends EncodeRequest ? string : ProjectEnvelope;
export class ProjectFormatError extends Error {
  override name = 'ProjectFormatError';
}
const MAX_BYTES = 64 * 1024 * 1024;
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const ENVELOPE_KEYS = ['content', 'format', 'id', 'title', 'version'];
type Step = { value: unknown } | { token: string } | { leave: object };

function reject(message: string): never {
  throw new ProjectFormatError(message);
}

function canonical(value: unknown): string {
  const encoder = new TextEncoder();
  const output: string[] = [];
  const active = new Set<object>();
  const pending: Step[] = [{ value }];
  let bytes = 0;
  const append = (token: string) => {
    bytes += encoder.encode(token).length;
    if (bytes > MAX_BYTES) reject('Project metadata exceeds 64 MiB.');
    output.push(token);
  };
  while (pending.length) {
    const step = pending.pop()!;
    if ('token' in step) { append(step.token); continue; }
    if ('leave' in step) { active.delete(step.leave); continue; }
    const item = step.value;
    if (item === null) { append('null'); continue; }
    if (typeof item === 'string' || typeof item === 'boolean') {
      append(JSON.stringify(item)); continue;
    }
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) reject('Project numbers must be finite.');
      append(Object.is(item, -0) ? '-0' : JSON.stringify(item)); continue;
    }
    if (typeof item !== 'object') reject('Project content must contain only JSON values.');
    if (active.has(item)) reject('Project content contains an ancestor cycle.');
    const array = Array.isArray(item);
    const prototype = Object.getPrototypeOf(item);
    if (prototype !== null && prototype !== (array ? Array.prototype : Object.prototype)) {
      reject('Project content must use plain records and arrays.');
    }
    const descriptors = Object.getOwnPropertyDescriptors(item);
    const ownKeys = Reflect.ownKeys(item);
    if (ownKeys.some(key => typeof key !== 'string')) reject('Project content cannot contain symbol keys.');
    const keys = (ownKeys as string[]).filter(key => !array || key !== 'length');
    for (const key of keys) {
      if (UNSAFE_KEYS.has(key)) reject(`Unsafe project key: ${key}.`);
      const descriptor = descriptors[key]!;
      if (!descriptor.enumerable || !('value' in descriptor)) reject('Project properties must be enumerable data values.');
    }
    if (array) {
      if (keys.length !== item.length || keys.some((key, index) => key !== String(index))) {
        reject('Project arrays must be dense and contain only indexed elements.');
      }
    } else keys.sort();
    active.add(item);
    append(array ? '[' : '{');
    pending.push({ leave: item }, { token: array ? ']' : '}' });
    for (let index = keys.length - 1; index >= 0; index--) {
      const key = keys[index]!;
      pending.push({ value: descriptors[key]!.value });
      if (!array) pending.push({ token: JSON.stringify(key) + ':' });
      if (index > 0) pending.push({ token: ',' });
    }
  }
  return output.join('');
}

function validateEnvelope(value: unknown): asserts value is ProjectEnvelope {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) reject('Project envelope must be a record.');
  if (Object.keys(value).sort().join(',') !== ENVELOPE_KEYS.join(',')) {
    reject('Project envelope must have exactly content, format, id, title and version.');
  }
  const envelope = value as Record<string, unknown>;
  if (!['gsnv-cad', 'gsnv-image', 'gsnv-video'].includes(envelope.format as string)) reject('Unsupported project format.');
  if (envelope.version !== 1) reject('Unsupported project version.');
  if (typeof envelope.id !== 'string' || envelope.id.length === 0) reject('Project ID must be a nonempty string.');
  if (typeof envelope.title !== 'string') reject('Project title must be a string.');
}

export function projectFormat<T extends FormatRequest>(request: T): FormatOutput<T> {
  try {
    let value: unknown;
    if (request.op === 'encode') value = request.project;
    else if (request.op === 'decode') {
      if (typeof request.text !== 'string') reject('Project text must be a string.');
      if (new TextEncoder().encode(request.text).length > MAX_BYTES) reject('Project metadata exceeds 64 MiB.');
      value = JSON.parse(request.text);
    } else reject('Unknown project-format operation.');
    const text = canonical(value);
    validateEnvelope(value);
    return (request.op === 'encode' ? text : value) as FormatOutput<T>;
  } catch (error) {
    if (error instanceof ProjectFormatError) throw error;
    throw new ProjectFormatError(error instanceof Error ? error.message : 'Invalid project data.');
  }
}
