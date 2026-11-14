/**
 * PURPOSE    Validate pending Video inspector text before a shared history commit.
 * KIND       CORE
 * CONTRACT   IN: content, existing clip ID, field and text. OUT: value and label.
 *            RAISES: VideoEditError for empty, nonnumeric, unknown or invalid values.
 * GUARANTEES Prior content is unchanged on every failure; one edit on success.
 * TUNING     All timing and volume limits are owned by videoTimeline.
 * DECISIONS  D1: Reuse timeline validation for change events and immediate Save/Send.
 *            Alternative: separate validators can diverge. Revisit if: inspector
 *            fields become transactional forms.
 * LIMITS     Numeric clip inspector only; title dialogs validate independently.
 * TESTBENCH  src/video/video-field-edit.test.ts
 */
import { videoTimeline, type VideoContent, type VideoOp } from './video-timeline.ts';
export function videoFieldEdit(value: VideoContent, clipId: string, field: string, text: string): { value: VideoContent; label: string } {
  const clip = value.clips.find(c => c.id === clipId), n = Number(text);
  if (!clip || !text.trim() || !Number.isFinite(n) || !['in','out','volume','fadeIn','fadeOut'].includes(field)) throw Object.assign(new Error('Enter a valid number for the selected clip, or press Escape to cancel the field edit.'), { name: 'VideoEditError' });
  const op: VideoOp = field === 'in' || field === 'out' ? { kind: 'trim', id: clipId, in: field === 'in' ? n : clip.in, out: field === 'out' ? n : clip.out } : field === 'volume' ? { kind: 'clip', id: clipId, volume: n / 100 } : { kind: 'clip', id: clipId, [field]: n };
  return { value: videoTimeline({ operation: 'edit', value, op }), label: field === 'in' || field === 'out' ? 'Trim clip' : field === 'volume' ? 'Volume' : field === 'fadeIn' ? 'Fade in' : 'Fade out' };
}
