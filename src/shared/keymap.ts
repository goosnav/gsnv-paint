/**
 * PURPOSE    Translate a keyboard event into an active-workspace command.
 * KIND       CORE
 * CONTRACT   IN: CommandEvent with normalized KeyboardEvent.key and explicit focus role.
 *            OUT: {command,preventDefault}; stable command ID or null for unhandled keys.
 *            Text editing stays native; dialogs own Enter/Escape; Video playback Space
 *            is limited to its timeline, while 2D views use Space to hold pan.
 *            RAISES: TypeError for invalid workspace, context, key or modifier types.
 * GUARANTEES Pure, deterministic, no input mutation, no browser-event side effects.
 * TUNING     COMMON and VIDEO_KEYS are shortcut tables; change only with shortcut review.
 * DECISIONS  D1: Resolve focus before workspace shortcuts. Alternative: global key-first
 *            routing; rejected because typing could edit the document or timeline.
 *            Revisit if the application adopts a different explicit focus model.
 *            D2: Treat Ctrl and Meta as the primary modifier without UA detection.
 *            Alternative: OS-specific branches; rejected because these keys expose
 *            the intent directly. Revisit for an observed platform-specific conflict.
 * LIMITS     Emits intent only; tool lifetimes, key repeat and keyup belong to adapters.
 * TESTBENCH  src/shared/keymap.test.ts -- run with: node --import tsx --test src/shared/keymap.test.ts
 */

export type CommandEvent = {
  key: string; ctrl: boolean; meta: boolean; shift: boolean; alt: boolean;
  target: 'text' | 'view' | 'dialog'; workspace: 'cad' | 'image' | 'video';
  viewRole: 'timeline' | 'preview2d' | 'canvas2d' | 'cad3d' | 'sketch2d' | 'none';
};
export type CommandResult = { command: string | null; preventDefault: boolean };

const COMMON: Readonly<Record<string, string>> = {
  n: 'file.new', o: 'file.open', s: 'file.save', z: 'edit.undo', y: 'edit.redo',
  c: 'edit.copy', x: 'edit.cut', v: 'edit.paste', a: 'edit.selectAll',
};
const VIDEO_KEYS: Readonly<Record<string, string>> = {
  s: 'video.split', j: 'video.shuttleReverse', k: 'video.pause', l: 'video.shuttleForward',
  ArrowLeft: 'video.stepBack', ArrowRight: 'video.stepForward',
  i: 'video.markIn', o: 'video.markOut', Home: 'video.home', End: 'video.end',
};

export function keymap(event: CommandEvent): CommandResult {
  if (!event || typeof event !== 'object' || typeof event.key !== 'string' || !event.key ||
      !['cad', 'image', 'video'].includes(event.workspace) ||
      !['text', 'view', 'dialog'].includes(event.target) ||
      !['timeline', 'preview2d', 'canvas2d', 'cad3d', 'sketch2d', 'none'].includes(event.viewRole) ||
      [event.ctrl, event.meta, event.shift, event.alt].some(value => typeof value !== 'boolean')) {
    throw new TypeError('Keyboard events require a valid key, workspace, focus context and boolean modifiers.');
  }
  const result = (command?: string | null): CommandResult => ({ command: command ?? null, preventDefault: command != null });
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const primary = event.ctrl || event.meta;
  if (event.alt) return result();
  if (event.target === 'dialog') {
    if (primary || event.shift) return result();
    return result(key === 'Escape' ? 'dialog.cancel' : key === 'Enter' ? 'dialog.confirm' : null);
  }
  if (event.target === 'text') {
    return result(primary && !event.shift && ['s', 'o', 'n'].includes(key) ? COMMON[key] : null);
  }
  if (primary) {
    return result(event.shift ? key === 'z' ? 'edit.redo' : null : Object.hasOwn(COMMON, key) ? COMMON[key] : null);
  }
  if (event.shift) return result();
  if (key === 'Escape') return result('tool.cancel');
  if (key === 'Enter') return result('tool.confirm');
  if (key === 'Delete') return result('edit.delete');
  if (key === ' ') {
    if (event.workspace === 'video' && event.viewRole === 'timeline') return result('video.togglePlayback');
    return result(['preview2d', 'canvas2d', 'sketch2d'].includes(event.viewRole) ? 'view.panHold' : null);
  }
  if (event.workspace === 'video' && event.viewRole === 'timeline') {
    return result(Object.hasOwn(VIDEO_KEYS, key) ? VIDEO_KEYS[key] : null);
  }
  if (event.workspace === 'image') return result(key === 'x' ? 'color.swap' : key === 'd' ? 'color.reset' : null);
  return result(event.workspace === 'cad' && key === 'f' ? 'view.fit' : null);
}
