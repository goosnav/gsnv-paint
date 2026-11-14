/**
 * PURPOSE    Adapt native project packages to atomic recovery storage.
 * KIND       SHELL
 * CONTRACT   IN: save with immutable package, recover or discard; workspace and safe
 *            integer generation are required. An async RecoveryPort implements S08.
 *            OUT: Promise of Result<NativePackage|null>. Save encodes before storage
 *            and returns the actual committed package (possibly a newer generation).
 *            Recover validates container and workspace before returning data; absence
 *            and successful discard return null. Save cannot succeed with no record.
 *            No corrupt record is discarded implicitly. S08 codes are preserved with
 *            operation/workspace message context. Container, limit and metadata errors
 *            use recovery.format/limit/metadata; mismatches use recovery.workspace.
 *            Invalid storage responses use recovery.corrupt.
 *            RAISES: none; invalid requests use recovery.request, unexpected codec
 *            or port exceptions use recovery.codec or recovery.transport respectively.
 * GUARANTEES No document mutation, uploads, partial decoded result or flattened file;
 *            record generation/atomicity belong to S08, domain validity to callers.
 * TUNING     None; S08 owns persistence configuration and S15 owns container limits.
 * DECISIONS  D1: Decode the returned record instead of echoing the save input;
 *            rejected alternative could claim an older attempted generation persisted.
 *            Revisit if: storage gains a conditional acknowledgement contract.
 *            D2: Bind an operation port instead of raw browser globals. This lets the
 *            caller observe authoritative generations without an extra read or broader
 *            result type. Revisit if: the approved recovery boundary changes.
 * LIMITS     Caller tracks highest observed/issued generation, even if later content
 *            validation fails, and serializes discard after pending saves. Generation
 *            metadata does not imply domain acceptance. Storage eviction, crash timing
 *            and domain schema validation require application-level verification.
 * TESTBENCH  src/shared/recovery-session.test.ts -- run with: node --import tsx --test src/shared/recovery-session.test.ts
 */

import { nativeContainer, ContainerFormatError, ContainerLimitError } from './native-container.ts';
import type { recoveryStore, RecoveryRecord } from './recovery-store.ts';
type NativePackage = ReturnType<typeof nativeContainer<{ op: 'decode'; parts: readonly Uint8Array[] }>>;
type Workspace = RecoveryRecord['workspace'];
type BaseRequest = { workspace: Workspace; generation: number };
export type RecoverySessionRequest = BaseRequest & ({ operation: 'save'; package: NativePackage } | { operation: 'recover' | 'discard' });
export type RecoveryPort = (request: Parameters<typeof recoveryStore>[0]) => ReturnType<typeof recoveryStore>;
type RecoveryResult = { ok: true; value: NativePackage | null } | { ok: false; error: { code: string; message: string } };

function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor?.enumerable && 'value' in descriptor ? descriptor.value : undefined;
}

export async function recoverySession(request: RecoverySessionRequest, port: RecoveryPort): Promise<RecoveryResult> {
  let operation = 'request'; let workspace = 'unknown';
  let stage: 'request' | 'codec' | 'transport' | 'response' = 'request';
  const fail = (code: string, reason: string): RecoveryResult => ({ ok: false, error: { code, message: `Recovery ${operation} (${workspace}): ${reason}` } });
  try {
    const op = field(request, 'operation'); const ws = field(request, 'workspace'); const generation = field(request, 'generation');
    if (op !== 'save' && op !== 'recover' && op !== 'discard') return fail('recovery.request', 'Choose save, recover or discard.');
    operation = op;
    if (ws !== 'cad' && ws !== 'image' && ws !== 'photo' && ws !== 'video' && ws !== 'document' && ws !== 'slides' && ws !== 'audio' && ws !== 'spreadsheet' && ws !== 'code') return fail('recovery.request', 'Choose a valid workspace.');
    workspace = ws;
    if (typeof generation !== 'number' || !Number.isSafeInteger(generation) || typeof port !== 'function') return fail('recovery.request', 'A safe integer generation and recovery port are required.');
    let storageRequest: Parameters<RecoveryPort>[0];
    if (op === 'save') {
      const packageValue = field(request, 'package') as NativePackage | undefined;
      if (packageValue === undefined) return fail('recovery.request', 'Save requires a project package.');
      stage = 'codec';
      const encoded = nativeContainer({ op: 'encode', package: packageValue });
      if (packageValue.project.format !== `gsnv-${ws}`) return fail('recovery.workspace', 'Project format does not match the requested workspace.');
      storageRequest = { op: 'write', record: { workspace: ws, generation, title: packageValue.project.title, payload: encoded.parts } };
    } else storageRequest = { op: op === 'recover' ? 'read' : 'remove', workspace: ws };
    stage = 'transport';
    const result = await port(storageRequest);
    stage = 'response';
    const ok = field(result, 'ok');
    if (ok === false) {
      const error = field(result, 'error'); const code = field(error, 'code'); const message = field(error, 'message');
      return typeof code === 'string' && typeof message === 'string' ? fail(code, message) : fail('recovery.corrupt', 'Storage returned a malformed error.');
    }
    if (ok !== true) return fail('recovery.corrupt', 'Storage returned a malformed result.');
    const record = field(result, 'value');
    if (record === null) return op === 'save' ? fail('recovery.corrupt', 'Storage did not return the committed recovery.') : { ok: true, value: null };
    if (op === 'discard' || !record || typeof record !== 'object') return fail('recovery.corrupt', 'Storage returned an unexpected recovery record.');
    if (field(record, 'workspace') !== ws) return fail('recovery.workspace', 'Stored record belongs to a different workspace.');
    const committedGeneration = field(record, 'generation'); const title = field(record, 'title'); const payload = field(record, 'payload');
    if (typeof committedGeneration !== 'number' || !Number.isSafeInteger(committedGeneration) || typeof title !== 'string' || !Array.isArray(payload)) return fail('recovery.corrupt', 'Stored recovery metadata is malformed.');
    for (let index = 0; index < payload.length; index++) {
      if (!(field(payload, String(index)) instanceof Uint8Array)) return fail('recovery.corrupt', 'Stored payload must contain dense byte segments.');
    }
    stage = 'codec';
    // S08 can reject an older write by returning the newer record; decode that authority.
    const packageValue = nativeContainer({ op: 'decode', parts: payload });
    if (packageValue.project.format !== `gsnv-${ws}`) return fail('recovery.workspace', 'Stored project format does not match the requested workspace.');
    return { ok: true, value: packageValue };
  } catch (cause) {
    let code = stage === 'response' ? 'recovery.corrupt' : `recovery.${stage}`;
    let reason = 'Recovery operation failed.';
    try {
      if (stage === 'codec') code = cause instanceof ContainerFormatError ? 'recovery.format' : cause instanceof ContainerLimitError ? 'recovery.limit' :
        cause instanceof Error && cause.name === 'ProjectFormatError' ? 'recovery.metadata' : 'recovery.codec';
      reason = String(cause instanceof Error ? cause.message : cause);
    } catch { /* Error accessors cannot be allowed to reject the recovery promise. */ }
    return fail(code, reason);
  }
}
