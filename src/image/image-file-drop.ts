/**
 * PURPOSE    Route local image drops and decode a captured file list in order.
 * KIND       SHELL
 * CONTRACT   IN: live drop surface, availability callbacks and caller-owned decode/place.
 *            OUT: disposable DOM listeners; serial import counts and visible failures.
 * GUARANTEES Files are captured during drop; no URLs fetched, concurrent decoding or late
 *            placement after the target changes. Unsupported files do not replace a project.
 * TUNING     The Image workspace owns pixel, memory and layer limits.
 * DECISIONS  Keep event routing independently testable from Canvas and image codecs.
 * LIMITS     Browser-supported PNG, JPEG, GIF, WebP and BMP still images only.
 * TESTBENCH  src/image/image-file-drop.test.ts
 */
export const IMAGE_FILE_TYPES = { 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/gif': ['.gif'], 'image/webp': ['.webp'], 'image/bmp': ['.bmp'] };
const extensions = new Set(Object.values(IMAGE_FILE_TYPES).flat());
export function imageFileError(file: Pick<File, 'name' | 'type'>): string | null {
  const extension = /\.[^.]+$/.exec(file.name)?.[0].toLowerCase() ?? '';
  if (extension === '.gsnv-image') return 'Use File → Open for a Paint project; only image files can be dropped as layers.';
  return extensions.has(extension) || Object.hasOwn(IMAGE_FILE_TYPES, file.type.toLowerCase()) ? null : 'Drop a PNG, JPEG, WebP, GIF or BMP image file.';
}

export function bindImageFileDrop({ root, active, blocked, onFiles, onError }: {
  root: HTMLElement; active(): boolean; blocked(): string | null;
  onFiles(files: readonly File[]): Promise<void>; onError(message: string): void;
}) {
  let disposed = false;
  const clear = () => { root.classList.remove('image-dropping'); };
  const hasFiles = (transfer: DataTransfer | null) => !!transfer && (transfer.files.length > 0
    || Array.from(transfer.types).includes('Files') || Array.from(transfer.items ?? []).some(item => item.kind === 'file'));
  const over = (event: DragEvent) => {
    if (disposed || !active() || !event.dataTransfer) return;
    const files = hasFiles(event.dataTransfer), link = Array.from(event.dataTransfer.types).includes('text/uri-list');
    if (!files && !link) return;
    event.preventDefault(); event.stopPropagation();
    const allowed = files && !blocked(); event.dataTransfer.dropEffect = allowed ? 'copy' : 'none';
    root.classList.toggle('image-dropping', allowed);
  };
  const enter = (event: DragEvent) => {
    if (disposed || !active() || !hasFiles(event.dataTransfer)) return;
    over(event);
  };
  const leave = (event: DragEvent) => {
    if (event.relatedTarget instanceof root.ownerDocument.defaultView!.Node && root.contains(event.relatedTarget)) return;
    clear();
  };
  const drop = (event: DragEvent) => {
    clear(); if (disposed || !active()) return;
    // File and URL drops must never navigate away from an unsaved drawing.
    event.preventDefault(); event.stopPropagation();
    const reason = blocked(); if (reason) { onError(reason); return; }
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (!files.length) { onError('Drop image files from your device. Image links and folders cannot be imported here.'); return; }
    void onFiles(files).catch(cause => { if (!disposed && active()) onError(cause instanceof Error ? cause.message : String(cause)); });
  };
  root.addEventListener('dragenter', enter); root.addEventListener('dragover', over);
  root.addEventListener('dragleave', leave); root.addEventListener('drop', drop);
  return { clear, dispose() {
    if (disposed) return; disposed = true; clear();
    root.removeEventListener('dragenter', enter); root.removeEventListener('dragover', over);
    root.removeEventListener('dragleave', leave); root.removeEventListener('drop', drop);
  } };
}

/** The caller advances its expected document identity after each accepted placement. */
export async function importImageFileSequence<T>({ files, current, decode, place }: {
  files: readonly File[]; current(): boolean; decode(file: File): Promise<T>;
  place(value: T, file: File): Promise<boolean>;
}): Promise<{ imported: number; errors: string[]; cancelled: boolean }> {
  let imported = 0; const errors: string[] = [];
  for (const file of files) {
    if (!current()) return { imported, errors, cancelled: true };
    const unsupported = imageFileError(file);
    if (unsupported) { errors.push(`${file.name}: ${unsupported}`); continue; }
    try {
      const value = await decode(file);
      if (!current()) return { imported, errors, cancelled: true };
      if (!await place(value, file)) return { imported, errors, cancelled: true };
      imported++;
    } catch (cause) {
      errors.push(`${file.name}: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }
  return { imported, errors, cancelled: false };
}
