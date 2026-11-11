/**
 * PURPOSE    Apply bounded immutable document history transactions.
 * KIND       CORE
 * CONTRACT   IN: HistoryRequest<T>; immutable values, nonempty labels, limit >=100.
 *            OUT: History<T>; bounded past, reversible undo/redo/jump, no input mutation.
 *            RAISES: RangeError for invalid limits/jumps; TypeError for invalid op/label.
 * GUARANTEES Deterministic; no I/O, cloning or serialization of domain values.
 * TUNING     DEFAULT_LIMIT=100; integer >=100, maximum retained undo transactions.
 * DECISIONS  D1: Share immutable roots instead of deep snapshots. Alternative: clone
 *            every document; rejected for tiled image memory and opaque domain types.
 *            Revisit if callers cannot maintain immutable value ownership.
 * LIMITS     Callers own reachable value immutability and provide valid histories.
 * TESTBENCH  src/shared/history.test.ts -- run with: node --import tsx --test src/shared/history.test.ts
 */

export type History<T> = {
  readonly past: readonly { readonly label: string; readonly value: T }[];
  readonly present: T;
  readonly future: readonly { readonly label: string; readonly value: T }[];
  readonly limit: number;
};
export type HistoryRequest<T> =
  | { op: 'create'; value: T; limit?: number }
  | { op: 'commit'; history: History<T>; label: string; value: T }
  | { op: 'undo' | 'redo'; history: History<T> }
  | { op: 'jump'; history: History<T>; offset: number };

const DEFAULT_LIMIT = 100;

export function history<T>(request: HistoryRequest<T>): History<T> {
  if (request.op === 'create') {
    const limit = request.limit === undefined ? DEFAULT_LIMIT : request.limit;
    if (!Number.isSafeInteger(limit) || limit < DEFAULT_LIMIT) {
      throw new RangeError('History limit must be an integer of at least 100.');
    }
    return { past: [], present: request.value, future: [], limit };
  }
  if (!['commit', 'undo', 'redo', 'jump'].includes(request.op)) {
    throw new TypeError('Unknown history operation.');
  }
  const state = request.history;
  if (request.op === 'commit') {
    if (typeof request.label !== 'string' || request.label.trim().length === 0) {
      throw new TypeError('History entries need a nonempty label.');
    }
    return {
      past: [...state.past, { label: request.label, value: state.present }].slice(-state.limit),
      present: request.value,
      future: [],
      limit: state.limit,
    };
  }
  if (request.op === 'undo') {
    const previous = state.past.at(-1);
    if (!previous) return state;
    return {
      past: state.past.slice(0, -1),
      present: previous.value,
      future: [{ label: previous.label, value: state.present }, ...state.future],
      limit: state.limit,
    };
  }
  if (request.op === 'redo') {
    const next = state.future[0];
    if (!next) return state;
    return {
      past: [...state.past, { label: next.label, value: state.present }],
      present: next.value,
      future: state.future.slice(1),
      limit: state.limit,
    };
  }
  if (request.op !== 'jump') throw new TypeError('Unknown history operation.');
  if (!Number.isSafeInteger(request.offset) ||
      request.offset < -state.past.length || request.offset > state.future.length) {
    throw new RangeError('History jump is outside the available transactions.');
  }
  let result = state;
  for (let step = 0; step < Math.abs(request.offset); step++) {
    result = history({ op: request.offset < 0 ? 'undo' : 'redo', history: result });
  }
  return result;
}
