# Video workspace (basic editor) — provisional GREEN

[D26](DECISIONS.md#d26--basic-video-editor-with-real-time-browser-export) adds a basic video editor: put clips in order, cut out what you don't want, add titles and fades, export a file.

## What it does

- **Add media:** Video → Add video or image… (or drop a file on the stage). Any format the browser plays works (MP4/H.264, WebM, MOV where supported, Ogg). PNG, JPEG, GIF and WebP stills become 3-second clips. The first clip sets the frame size, capped at 1920 × 1080. Video → Frame size… changes it. The original files are stored unchanged inside the `.gsnv-video` project.
- **Timeline:** one sequence track (clips play one after another) and a titles track under it. Click or drag on the timeline to move the playhead; click a clip to select it.
- **Clip panel:** In and Out points in the source, Fade in and Fade out (from and to black), Volume 0–200 % (slider plus a typed value), Earlier/Later to reorder, Split at playhead, Delete clip.
- **Titles:** text (several lines allowed), start, duration, size, colour, top/middle/bottom placement and an optional dark box. Titles fade in and out over 0.3 s. Double-click a title on the timeline to edit it.
- **Keys** (timeline focused): Space play/pause, S split, I/O set the selected clip's in/out point at the playhead, ←/→ step one frame, J/L back/forward one second, K pause, Home/End, Delete removes the selected clip.
- **History:** each add, trim, split, move, fade, volume, title or delete is one undo step. Playback and scrubbing are not.
- **Export:** Video → Export video… plays the sequence once in real time and records the canvas and mixed audio with the browser's MediaRecorder. Chrome records MP4 (H.264/AAC) where it can and WebM (VP9 or VP8 with Opus) otherwise. The file is saved with the project title.

## Code

- `src/video/video-timeline.ts` (CORE): the project model and every edit, plus locate (which clip and source time sit under a sequence time, with the fade level) and the native encode/decode. Tests: `video-timeline.test.ts`.
- `src/video/video-workspace.ts` (SHELL): media elements, the canvas preview, Web Audio routing (one gain per clip for volume and fades, feeding both the speakers and the recorder) and export.

## Evidence

`src/video/video-workspace.browser.spec.ts` records a WebM with a tone inside the page, then imports it and a PNG, splits with S, sets a fade and volume, trims the still, reorders, adds a title, undoes and redoes, plays, saves the project (checking the original bytes and edits), exports a recording (checking the WebM/MP4 signature) and reloads to confirm the session reopens. Screenshot: `dev/evidence/VIDEO-APP-production.png`.

## Limits

- Export takes as long as the video. Keep the tab visible while it runs, because browsers slow down hidden tabs.
- No transitions besides fades to black, no picture-in-picture, no separate audio track.
- Frame timing follows the browser's media clock, so cuts can land a frame off. A WebCodecs exporter with a muxer would fix this (see D26).
