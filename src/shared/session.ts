/**
 * PURPOSE    Reduce workspace-level document commands into immutable session state.
 * KIND       CORE
 * CONTRACT   IN: SessionRequest<T>; valid state and immutable domain snapshots, with
 *            caller-owned content validity and unique per-document revision identities.
 *            OUT: {state,effects:never[]}; independent workspace histories, saved-token
 *            dirty tracking, labeled edits, actionable messages and no hidden effects.
 *            RAISES: TypeError for malformed events; RangeError for document commands
 *            targeting an unopened workspace.
 * GUARANTEES Deterministic, no I/O, no mutation or serialization of domain values.
 * TUNING     None; history retention is owned by S01.
 * DECISIONS  D1: Track the exact saved revision identity, not a boolean save flag.
 *            Alternative: clear dirty on save completion; rejected because edits may
 *            occur during a write. Revisit if save becomes an atomic synchronous action.
 *            D2: Ignore save completions for replaced document IDs. Alternative: bind
 *            them to the current workspace; rejected because delayed I/O would corrupt
 *            its saved baseline. Revisit if documents become immutable singletons.
 * LIMITS     Callers validate domain content, keep identities unique and own immutability.
 * TESTBENCH  src/shared/session.test.ts -- run with: node --import tsx --test src/shared/session.test.ts
 */

import { history, type History } from './history.ts';

type Workspace = 'cad' | 'image' | 'video';
type Snapshot<T> = {
  readonly id: string; readonly title: string; readonly format: string;
  readonly version: number; readonly identity: string; readonly value: T;
};
export type Session<T> = {
  readonly workspace: Workspace;
  readonly documents: Partial<Record<Workspace, Snapshot<T>>>;
  readonly histories: Partial<Record<Workspace, History<Snapshot<T>>>>;
  readonly saved: Partial<Record<Workspace, string>>;
  readonly dirty: Partial<Record<Workspace, boolean>>;
  readonly message: string;
};
export type SessionEvent<T> =
  | { type: 'switch'; workspace: Workspace }
  | { type: 'open'; workspace: Workspace; snapshot: Snapshot<T>; isSaved: boolean }
  | { type: 'commit'; workspace: Workspace; snapshot: Snapshot<T>; label: string }
  | { type: 'undo' | 'redo'; workspace: Workspace }
  | { type: 'saved'; workspace: Workspace; documentId: string; identity: string }
  | { type: 'status'; message: string };
type SessionRequest<T> = { state: Session<T>; event: SessionEvent<T> };
type SessionResult<T> = { state: Session<T>; effects: never[] };

function validSnapshot<T>(value: Snapshot<T>): boolean {
  return value !== null && typeof value === 'object' &&
    typeof value.id === 'string' && value.id.length > 0 &&
    typeof value.identity === 'string' && value.identity.length > 0 &&
    typeof value.title === 'string' && typeof value.format === 'string' &&
    typeof value.version === 'number' && Number.isFinite(value.version) &&
    Object.hasOwn(value, 'value');
}

function validateEvent<T>(event: SessionEvent<T>): void {
  if (event === null || typeof event !== 'object' ||
      !['switch', 'open', 'commit', 'undo', 'redo', 'saved', 'status'].includes(event.type)) {
    throw new TypeError('Unknown session event.');
  }
  if (event.type === 'status') {
    if (typeof event.message !== 'string') throw new TypeError('Status message must be a string.');
    return;
  }
  if (!['cad', 'image', 'video'].includes(event.workspace)) throw new TypeError('Unknown workspace.');
  if ((event.type === 'open' || event.type === 'commit') && !validSnapshot(event.snapshot)) {
    throw new TypeError('Document snapshot metadata is invalid.');
  }
  if (event.type === 'open' && typeof event.isSaved !== 'boolean') throw new TypeError('Open requires an explicit saved baseline.');
  if (event.type === 'commit' && (typeof event.label !== 'string' || !event.label.trim())) {
    throw new TypeError('Document changes need a nonempty label.');
  }
  if (event.type === 'saved' && (typeof event.documentId !== 'string' || !event.documentId ||
      typeof event.identity !== 'string' || !event.identity)) {
    throw new TypeError('Save completion requires document and revision identities.');
  }
}

export function session<T>({ state, event }: SessionRequest<T>): SessionResult<T> {
  validateEvent(event);
  const result = (next: Session<T>): SessionResult<T> => ({ state: next, effects: [] });
  if (event.type === 'status') return result({ ...state, message: event.message });
  const workspace = event.workspace;
  if (event.type === 'switch') {
    const label = { cad: 'CAD', image: 'Image', video: 'Video' }[workspace];
    return result({ ...state, workspace, message: `${label} workspace.` });
  }
  if (event.type === 'open') {
    const saved = { ...state.saved };
    if (event.isSaved) saved[workspace] = event.snapshot.identity;
    else delete saved[workspace];
    return result({
      ...state, saved,
      documents: { ...state.documents, [workspace]: event.snapshot },
      histories: { ...state.histories, [workspace]: history({ op: 'create', value: event.snapshot }) },
      dirty: { ...state.dirty, [workspace]: !event.isSaved },
      message: `${event.isSaved ? 'Opened' : 'Created'} ${event.snapshot.title || 'Untitled'}.`,
    });
  }
  const previous = state.histories[workspace];
  if (!previous) throw new RangeError(`Open a ${workspace} document before using ${event.type}.`);
  if (event.type === 'saved') {
    if (event.documentId !== previous.present.id) return result(state);
    return result({
      ...state,
      saved: { ...state.saved, [workspace]: event.identity },
      dirty: { ...state.dirty, [workspace]: event.identity !== previous.present.identity },
      message: `Saved ${previous.present.title || 'Untitled'}.`,
    });
  }
  const next = event.type === 'commit'
    ? history({ op: 'commit', history: previous, value: event.snapshot, label: event.label })
    : history({ op: event.type, history: previous });
  let message: string;
  if (event.type === 'commit') message = `Applied ${event.label}.`;
  else {
    const label = event.type === 'undo' ? previous.past.at(-1)?.label : previous.future[0]?.label;
    message = label ? `${event.type === 'undo' ? 'Undo' : 'Redo'} ${label}.`
      : event.type === 'undo' ? 'No earlier changes.' : 'No later changes.';
  }
  return result({
    ...state, message,
    documents: { ...state.documents, [workspace]: next.present },
    histories: { ...state.histories, [workspace]: next },
    dirty: { ...state.dirty, [workspace]: state.saved[workspace] !== next.present.identity },
  });
}
