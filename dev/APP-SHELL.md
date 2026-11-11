# Shared application assembly

A-SHELL is the composition root for Phase 1. `src/app/app-shell.ts` wires the GREEN shared components; `src/app/main.ts` mounts the production entry. `npm run build` emits one static client in `dist/`. The production registry now installs the first CAD workspace adapter; Image and Video editing remain unavailable. The separate development fixture supplies explicitly marked one-pixel documents to prove shared seams. Its schema is not a CAD, Image or Video project specification.

## Adapter boundary

`mountApp` receives a live DOM root, available workspace adapters, S07 file ports, S08 recovery ports and S06 probe inputs. It returns `ready`, `idle`, command dispatch, an immutable session snapshot and idempotent disposal. `ready` waits for initial capability/recovery reads; `idle` drains current command and recovery work. Neither promise proves domain correctness or durable filesystem storage.

An adapter owns its optional new-document factory, native-package decode/encode and view lifecycle. Document values remain opaque immutable values in S02 history, without JSON cloning. An adapter mounts its view in a workspace-owned child of the stable S10 viewport and supplies menus, tools, panels, input context and command/gesture handling. Rendering receives the current snapshot and transient View2D. Commits name the base revision identity: late callbacks cannot edit a newer revision or a replacement document. Content validation belongs to the adapter before document replacement; S13/S14 validate only the common native container.

The assembly contains no geometry, pixel or timeline algorithms. Its dependency count reflects composition, not a new black-box brick. The brick checker applies to the 15 shared bricks; A-SHELL is checked through its seam testbench, strict typecheck, static build and actual browser smoke.

## Document and file lifecycle

Each workspace keeps its own S02 history, saved revision, native file handle and view. Buttons, menus and shortcuts share availability checks; inactive or absent domain commands cannot run through shortcuts. S05/S12 bind globally for document shortcuts and separately to the active view. Switching releases the old view's captured gestures before rebinding. A modal blocks new gestures but still forwards terminal pointer cancellation to the originating view.

Open captures a native handle per operation, decodes the container and calls the matching workspace decoder. Only then can it replace that workspace's document. Dirty replacement offers Keep current, Save then replace or Replace without saving. The decision protects the exact displayed revision. If another modal owns focus when file loading completes, Open settles without replacement and asks the user to close that dialog and try again. Cancellation, invalid content and failed saves retain the existing document/handle.

Save captures the immutable document revision and a separate in-memory epoch. A same-ID reopen increments that epoch, so an older save cannot change the new document's saved baseline or handle. Only one file save per workspace runs at a time. An edit during save stays dirty when the earlier revision completes. The destination picker or existing handle's write-permission request runs before encoding; a new native chooser starts with `Untitled` plus the workspace extension. Fallback downloads use S13's title-based filename. Download success means browser handoff, not proof of disk persistence. Native picker/permission sequencing is tested with fake ports; native OS picker interaction is still untested.

## Recovery lifecycle

Startup reads existing recovery before enabling new documents. Valid recovery is offered explicitly; it never silently replaces the foreground document. Restore passes the available workspace decoder, creates a dirty document and does not assume a native file handle. Corrupt content remains visible until explicit discard. A missing/unreadable storage service disables autosave for that session while permitting editing and manual file saves; the recovery panel states the failure.

Committed edits and undo/redo enqueue immutable snapshots for serialized S14 saves. Dialog previews do not enqueue recovery. Each operation observes the authoritative S08 generation, even when later decoding fails; issued generations exceed both observed and issued maxima. A successful autosave updates recovery status only and never opens its returned package in the foreground. Old document epochs invalidate queued writes. Discard follows pending writes; a later new edit may legitimately create a new recovery, and completion updates the controls to reflect that record. Errors remain visible. There is no promise against browser eviction or power loss.

## Views and dialogs

2D wheel/pan gestures use S04 without moving the viewport coordinate origin. View settings provide typed zoom from 1% to 6400% and pan in CSS pixels, preview live, and restore the previous view on Cancel. These are transient view changes, not document edits. 3D camera behavior belongs to the CAD adapter.

Content dialogs use S11. The adapter owns the preview and rollback; confirmation commits through the base-revision guard. Chrome updates wait until modal settlement so asynchronous status/capability changes do not detach the opener. The history panel projects S02 transition labels with a current/redo boundary. Arbitrary history jumps are not exposed by this assembly because S02's contract has no jump event.

## Verification boundary

Run `node --import tsx --test src/app/app-shell.test.ts` for real shared-module seams against fake browser resources. Run `npm run test:browser -- src/app/app-shell.browser.spec.ts` for the single real Chrome assembly smoke; this command builds first. It exercises the explicit fixture through UI edits, preview/rollback, keyboard history, cursor zoom, Space-pan, context hit delivery, typed views, actual download/open and IndexedDB page close/reopen. It also serves the emitted `dist` through Vite preview and checks the CAD adapter mount plus the Image and Video unavailable states. The CAD-APP browser suite exercises actual CAD editing and persistence. The deployed Cloudflare origin, offline reopening, full domain formats, native OS pickers, other operating systems and M1a launchers remain untested.

This contributes component evidence to SYS-002/013/014 and CTL-001–003/007–012/014–016/020–028. Those full requirements stay UNTESTED where their procedures require actual CAD, Image and Video editing. Context hit delivery is not a production face/layer/clip context menu. Page close/reopen is not an OS crash test. See `PHASE-1.md` for exact commands, results and retained failure evidence.
