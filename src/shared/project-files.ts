/**
 * PURPOSE    Transfer validated native projects through the browser file adapter.
 * KIND       SHELL
 * CONTRACT   IN: open, or save with an immutable NativePackage and optional handle;
 *            S07 FilePorts supply browser I/O and any required user activation.
 *            OUT: Promise of validated NativePackage on open, S07 FileResult on
 *            save, an unchanged transport error/cancellation, or a project error.
 *            Encode precedes file writes; decode precedes successful open. Native
 *            save completes only after close. Parts remain segmented to S07.
 *            Suggested names use the title with invalid filename characters replaced,
 *            trailing dots/spaces removed, reserved basenames prefixed, 180 UTF-8
 *            stem bytes maximum, Untitled fallback and one matching native extension.
 *            Titles are unchanged; all three extensions use application/octet-stream.
 *            RAISES: none. Invalid requests use project.request; codec failures use
 *            project.format, project.limit, project.metadata or project.codec.
 * GUARANTEES No document/session mutation or upload. Failed open never yields a
 *            replacement package. Transport errors retain their original code/message.
 * TUNING     MAX_STEM_BYTES=180 (>0) bounds suggested names before native extension.
 *            EXTENSIONS/MIME are transport identifiers; change with format review.
 * DECISIONS  D1: Validate before transport success. Alternative: return raw files;
 *            rejected because consumers could replace a document with corrupt data.
 *            Revisit if: an explicit staged-import contract replaces this seam.
 *            D2: Delegate parts directly to S07. Alternative: flatten a full file;
 *            rejected for avoidable memory cost. Revisit if: transport loses support.
 *            D3: Bound a sanitized title while preserving the document title.
 *            Alternative: pass raw titles; rejected because filenames can be invalid.
 *            Revisit if: native format suffixes or destination rules change.
 * LIMITS     Domain codecs still validate content/references before document commit.
 *            Open returns a package; callers capture native handles per operation
 *            through FilePorts and retain them only after accepting the valid result.
 *            Large serialization can outlast user activation: acquire destination/
 *            write permission during user action before passing a handle here.
 *            Download success is browser handoff, not verified disk persistence.
 * TESTBENCH  src/shared/project-files.test.ts -- run with: node --import tsx --test src/shared/project-files.test.ts
 */

import { fileAccess, type FilePorts } from './file-access.ts';
import { nativeContainer, ContainerFormatError, ContainerLimitError } from './native-container.ts';
type NativePackage = ReturnType<typeof nativeContainer<{ op: 'decode'; parts: readonly Uint8Array[] }>>;
type FileResult = Extract<Awaited<ReturnType<typeof fileAccess>>, { ok: true }>['value'];
type Failure = { ok: false; error: { code: string; message: string } };
export type ProjectFileRequest = { operation: 'open' } | { operation: 'save'; package: NativePackage; handle?: FileSystemFileHandle };
export type ProjectFileOutcome<T extends ProjectFileRequest = ProjectFileRequest> =
  | { ok: true; value: T extends { operation: 'open' } ? NativePackage : FileResult }
  | Failure | { cancelled: true };

const MAX_STEM_BYTES = 180;
const MIME = 'application/octet-stream';
const EXTENSIONS = { 'gsnv-cad': '.gsnv-cad', 'gsnv-image': '.gsnv-image', 'gsnv-video': '.gsnv-video' } as const;

function failure(code: string, message: string): Failure { return { ok: false, error: { code, message } }; }
function boundedStem(stem: string, limit: number): string {
  let bounded = ''; let bytes = 0; const encoder = new TextEncoder();
  for (const character of stem) {
    const length = encoder.encode(character).length;
    if (bytes + length > limit) break;
    bounded += character; bytes += length;
  }
  return bounded.replace(/[. ]+$/g, '');
}
function suggestedName(packageValue: NativePackage): string {
  const extension = EXTENSIONS[packageValue.project.format]; let stem = packageValue.project.title.trim();
  if (stem.toLowerCase().endsWith(extension)) stem = stem.slice(0, -extension.length);
  stem = stem.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').replace(/[. ]+$/g, '');
  let bounded = boundedStem(stem, MAX_STEM_BYTES) || 'Untitled';
  // Truncation can create a reserved name; protect the final stem within the byte cap.
  if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(bounded)) bounded = `_${boundedStem(bounded, MAX_STEM_BYTES - 1)}`;
  return `${bounded}${extension}`;
}
function codecFailure(cause: unknown): Failure {
  let code = 'project.codec'; let reason = 'Unknown project failure.';
  try {
    code = cause instanceof ContainerFormatError ? 'project.format' : cause instanceof ContainerLimitError ? 'project.limit' :
      cause instanceof Error && cause.name === 'ProjectFormatError' ? 'project.metadata' : 'project.codec';
    reason = String(cause instanceof Error ? cause.message : cause);
  } catch { /* A hostile error value must not reject the adapter promise. */ }
  return failure(code, `Project file operation failed: ${reason}`);
}

export async function projectFiles<T extends ProjectFileRequest>(request: T, ports: FilePorts): Promise<ProjectFileOutcome<T>> {
  try {
    if (!request || typeof request !== 'object') return failure('project.request', 'Choose a project open or save operation.');
    const operation = Object.getOwnPropertyDescriptor(request, 'operation');
    if (!operation?.enumerable || !('value' in operation) || !['open', 'save'].includes(operation.value)) return failure('project.request', 'Choose a project open or save operation.');
    if (operation.value === 'open') {
      const result = await fileAccess({ op: 'open', accept: { [MIME]: Object.values(EXTENSIONS) } }, ports);
      if ('cancelled' in result || !result.ok) return result;
      return { ok: true, value: nativeContainer({ op: 'decode', parts: result.value.bytes }) } as ProjectFileOutcome<T>;
    }
    const packageField = Object.getOwnPropertyDescriptor(request, 'package');
    const handleField = Object.getOwnPropertyDescriptor(request, 'handle');
    if (!packageField?.enumerable || !('value' in packageField) || packageField.value === undefined ||
        (handleField && (!handleField.enumerable || !('value' in handleField)))) return failure('project.request', 'Save requires a project package and an optional file handle.');
    const packageValue = packageField.value as NativePackage;
    const encoded = nativeContainer({ op: 'encode', package: packageValue });
    const result = await fileAccess({ op: 'save', name: suggestedName(packageValue), mime: MIME, bytes: encoded.parts,
      ...(handleField?.value === undefined ? {} : { handle: handleField.value as FileSystemFileHandle }) }, ports);
    return result as ProjectFileOutcome<T>;
  } catch (cause) { return codecFailure(cause); }
}
