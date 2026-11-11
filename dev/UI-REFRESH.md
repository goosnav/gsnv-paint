# Web application chrome refresh

Owner direction: pull current main, redesign gsnv-paint and Goosnav Center as web applications with Windows XP inspiration, remove simulated OS furniture, and push both main branches. This explicitly revises the earlier literal desktop-window visual requirement; it does not approve the separate C05 revision-overflow proposal.

Direction: compact, legible, work-focused. Blue application navigation, Tahoma-style type, restrained bevels and warm neutral controls; no desktop wallpaper, Start bar, clock, window border, resize grip or imitation minimize/maximize/close controls. Use actual menus and labeled application actions. Preserve editable content, shortcuts, focus, file handling and recovery behavior.

S10 retains its public input/output and stable viewport/panel ownership. Rework presentation in its header and styles, with app/dialog styling following the same visual system. Keep the unfinished-workspace message truthful. Existing S10/A-SHELL unit and browser scenarios characterize behavior; adjust only intentional title presentation expectations and add viewport/navigation checks. Baseline npm test and npm run build passed after fast-forwarding to d62e8bb. Baseline screenshots are outside the repo under /tmp/gsnv-web-overhaul.

Verification: focused S10 tests, cumulative units, strict build, browser menus/workspace navigation/dialogs/persistence at 1280×720 and a smaller web viewport; compare before/after screenshots. Full editor requirements remain open.


## Delivered presentation

The application header now contains the product identity, document name and workspace switcher. Menus and labeled file/history actions share one command row. Empty tool palettes give their width to the viewport; docked panels, dialogs, focus states and browser-support notices follow the same restrained visual system. Narrow viewports retain reachable workspace tabs and panels without page-level horizontal scrolling. No editor capabilities were added.

[Application screenshot at 1280×720](evidence/ui-refresh/application.png) · [Interactive S10 fixture](evidence/S10-web-shell.png)

## Verification — 2026-11-11

| Command | Result | Recorded output |
| --- | --- | --- |
| `npm test` | PASS: 407 tests, 0 failures, 0 skipped | [Unit output](evidence/ui-refresh/unit.txt) |
| `npm run test:browser` | PASS: strict TypeScript build and 13 browser tests | [Build/browser output](evidence/ui-refresh/browser.txt) |
| `python3 dev/verify-spec.py` | PASS: 386 requirements/procedures, 158 contracts, links resolve | [Traceability output](evidence/ui-refresh/spec.txt) |
| `python3 /home/goosnav/.agents/skills/synced/00ab2cd7-2e1c-45ca-814e-5f657fe548ca_724affcc-3df3-47d2-bd47-95d03e739484/goosnav-modular-coding-method/scripts/check_module.py src/shared/chrome.ts` | PASS: S10 module header | [Module output](evidence/ui-refresh/module.txt) |

Browser execution and visual review used headless Google Chrome 154.0.8037.97 on Linux x64 at 1280×720; the S10 browser test also checks 390×844. Menu keyboard access, focus, workspace changes, stable viewport content, dialogs, wheel/pan input, file fallback round-trips and recovery remain green. Native file-picker interaction, pen hardware, Windows, macOS and other browser engines were not tested in this refresh.

During iteration, the browser suite caught an invalid nested CSS `:has` selector that reduced an empty-palette viewport to 76px. The selector was corrected and the production-shell test now asserts more than 900px of viewport width at 1280px. The existing menu-dismiss test's click point was moved outside the newly positioned menu. Later failures were obsolete browser-support label assertions; their expectations now match the intentional copy change, retaining all seven capability-row checks. These intermediate failures were resolved before the final green runs above.

Requirement status remains **13 PASS / 0 FAIL / 373 UNTESTED**. The existing PASS IDs are SYS-005, CAD-001, CAD-002, CAD-003, CAD-006, REL-001, REL-002, REL-005, REL-011, REL-012, REL-014, REL-023 and REL-028. This UI work changes no acceptance status; all other IDs remain UNTESTED, including the full-workspace CTL-001 requirement. S10 and A-SHELL presentation checks passed, but the unfinished editors and pending C05 contract decision remain as recorded. The analytical plate oracle in the traceability output is not a kernel acceptance result.
