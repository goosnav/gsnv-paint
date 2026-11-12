# Design system: a better Windows XP

Owner direction (2026-11-12): the app should look like an actually better version of Windows XP (Luna colours and design framework), with the slightly pixelly, crunchy look of XP-era 96 dpi screens everywhere, and an XP cursor. The dark "studio" theme of [D22](DECISIONS.md#d22--dark-studio-design-system-and-xp-style-cursors) was rejected as generic and is superseded by [D24](DECISIONS.md#d24--a-better-windows-xp-design-system-supersedes-d22).

## Direction (Goosnav anti-slop field guide: World, Focus, Signature)

- **World:** the Windows XP desktop at 96 dpi. Luna Blue title bars, beige 3D control faces (`#ECE9D8`), Explorer blue task panes, the AppWorkspace grey canvas well, yellow tooltips, `#316AC5` selection highlight.
- **Focus:** the canvas or photo and the active tool. Everything else stays in XP's quiet beige and blue.
- **Signature:** genuine Tahoma 8 pt pixel text. "Pixel Tahoma" is built from the hand-tuned 11-pixel bitmap strike of Wine's Tahoma (`dev/fonts/build-pixel-tahoma.py`), so text renders as hard pixels, as on XP. The same signature carries into crisp, aliased, colour-coded toolbar glyphs and the original XP-style cursors.

## What "better" means

The aim is XP's clarity without its era's mistakes:

- One 4 px spacing grid, and toolbar buttons of 24 px or more.
- Every numeric option is a trackbar paired with a typed number box.
- Text contrast is black on beige or white.
- XP's dotted focus rectangle on every control.
- No clutter; menus contain only working commands.
- Consistent hover (XP orange inner glow) and pressed states.
- Responsive layout down to phone width.

Things XP had that the web app deliberately omits (prior owner direction): no Start bar, clock, window border, resize grip or fake minimise/maximise/close buttons.

## Components

| Element | Treatment |
|---|---|
| Title bar | Luna gradient (`#2C80F7` → `#0A5AE6` → `#0848D4`), white bold pixel text with a 1 px dark shadow, 16 px pixel-art app icon, "Document – gsnv-paint" order |
| Workspace switcher | XP taskbar buttons (blue, pressed darker when active) at the right of the title bar |
| Menu bar / menus | Beige bar; blue `#316AC5` highlight with white text; white menus with a hard 3 px drop shadow |
| Toolbar | XP rebar gradient; flat buttons that raise on hover and sink when pressed |
| Tool palette | MS Paint toolbox: 2 × 26 px bevelled buttons; the active tool is sunken with the classic 2 px checker dither |
| Canvas well | AppWorkspace `#808080`, sunken edge; documents have a 1 px black outline and a hard shadow |
| Inspector | Explorer task pane: blue gradient background, white-to-`#C6D3F7` group headers in `#215DC6` bold, `#D6DFF7` group bodies |
| Buttons | XP push buttons: `#003C74` 1 px border, 3 px radius, white-to-beige gradient, orange hover glow; the default button carries the inner blue ring |
| Fields | White with the XP `#7F9DB9` border |
| Trackbars | Sunken 4 px groove and a pointed thumb with the green XP stripe; always paired with a number box |
| Dialogs | Luna title bar, 3 px blue frame, beige body, hard shadow |
| Tooltips and hints | `#FFFFE1` with a black 1 px border |
| Status bar | Sunken XP panes |
| Scrollbars | Luna pale-blue thumbs |

## Rules (anti-slop)

- No glow, blur, glass or soft "floating" shadow; shadows are hard 3–4 px offsets.
- No pillowed radii: 0 px for faces and toolbox buttons, 3 px for push buttons, 7 px for title-bar tops.
- No emoji icons. Glyphs are original SVG paths drawn with crisp edges.
- Only the pixel UI sizes: 11 px (and 22 px for large type).
- Gradients only where XP's own material has them (title bar, taskbar buttons, task-pane headers, push buttons, rebar). The Luna gradients are the World, not decoration.

## Evidence

[Image](evidence/XP-image.png) · [Photo](evidence/XP-photo.png) · [CAD](evidence/XP-cad.png) · [Dialog](evidence/XP-dialog.png), Chrome 154, 1280 × 760.
