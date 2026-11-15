/**
 * PURPOSE    Find local guidance for the current editor.
 * KIND       CORE
 * CONTRACT   IN: query, current workspace, immutable command metadata.
 *            OUT: deeply frozen results; current-workspace matches sort before shared/other matches.
 *            available means a caller-allowlisted Show me action can run in the current workspace.
 *            RAISES: TypeError for invalid input or duplicate workspace/command pairs.
 * GUARANTEES No I/O, mutation, inferred tool capabilities or executable article content.
 * TUNING     Local articles/keywords and rank weights below. All query words must match.
 * DECISIONS  D1: Use authored workflows plus live command metadata. Alternative: remote help
 *            or generated capability claims; rejected for offline accuracy. Revisit if:
 *            the app exposes structured option-level navigation.
 * LIMITS     Help does not execute commands or diagnose a user's artwork. Only integrated
 *            commands supplied by the caller are searchable; articles describe shipped controls.
 * TESTBENCH  src/shared/help-index.test.ts; node --import tsx --test src/shared/help-index.test.ts
 * DEMO       node --import tsx src/shared/help-index.demo.ts
 */
export type HelpWorkspace = 'image' | 'cad' | 'photo' | 'video' | 'document' | 'slides' | 'audio' | 'spreadsheet' | 'code';
export type HelpSection = 'search' | 'getting-started' | 'faq';
export type HelpCommand = { id: string; label: string; workspace: HelpWorkspace; path: readonly string[]; shortcut?: string; enabled: boolean; showMe?: boolean };
export type HelpResult = {
  id: string; title: string; workspace: HelpWorkspace | 'shared'; keywords: readonly string[]; steps: readonly string[];
  kind: 'article' | 'command'; section: HelpSection; commandId?: string; available: boolean;
};
type Article = Omit<HelpResult, 'kind' | 'available' | 'commandId'> & { target?: string };
const WORKSPACES = new Set(['image', 'cad', 'photo', 'video', 'document', 'slides', 'audio', 'spreadsheet', 'code']);
const ARTICLES: readonly Article[] = [
  { id: 'help.icon-credits', title: 'Icon credits', workspace: 'shared', section: 'faq', keywords: ['icons', 'artwork', 'Fugue', 'Tabler', 'license', 'credits'], steps: [
    'Choose Icon credits at the bottom of Help for source and license links.',
    'Paint uses classic-palette artwork derived from ReactOS Paint (LGPL), Silk by Mark James (CC BY 2.5), Fugue by Yusuke Kamiyamane (CC BY 3.0) and Tabler by Paweł Kuna (MIT). The credits include editable source artwork.',
    'The workspace icons retain their existing artwork. All icons are bundled locally and work offline.',
  ] },
  { id: 'help.paint', title: 'Begin drawing in Paint', workspace: 'image', section: 'getting-started', keywords: ['canvas', 'new', 'draw', 'brush', 'pencil', 'size'], target: 'image.pencil', steps: [
    'Choose Image, then use the canvas. File → New starts another image; save any work you want to keep.',
    'Choose Pencil for hard pixels or Brush for brush options. Select a foreground colour in Colours and tool options, then drag on the canvas.',
    'Use Undo to remove a stroke. Save a project file to keep layers editable, or Export a PNG to share the image.',
  ] },
  { id: 'help.fonts', title: 'Use a custom font', workspace: 'image', section: 'getting-started', keywords: ['font', 'custom font', 'typeface', 'TTF', 'OTF', 'TrueType', 'OpenType', 'text', 'import', 'upload'], target: 'image.text', steps: [
    'Choose Text (T) in the left tool palette, then click the canvas where the text should begin.',
    'In the Text dialog, choose Import font… beside Font, then select a .ttf or .otf file. The new font becomes selected when it is ready.',
    'Enter your text, colour and size. Enter makes a new line. Choose OK, then use the transform handles to position or scale the text.',
    'Fonts stay local and are remembered on this device in this browser when storage is available. A different device or browser needs its own import.',
    'Placed Paint text is stored as pixels. Project files and exported images retain its appearance without needing the original font.',
  ] },
  { id: 'help.open', title: 'Open an image or add it as a layer', workspace: 'image', section: 'getting-started', keywords: ['open', 'import', 'PNG', 'JPEG', 'JPG', 'WebP', 'project', 'file'], steps: [
    'File → Open accepts a Paint project or a supported raw image, such as PNG or JPEG. A raw image becomes the canvas.',
    'To keep the current canvas and add another picture, choose Image → Import as layer….',
    'Opening a saved project restores its layers. Exported PNG or JPEG files contain the flattened image instead.',
  ] },
  { id: 'help.transform', title: 'Resize or move a selection graphically', workspace: 'image', section: 'getting-started', keywords: ['free transform', 'scale', 'resize', 'rotate', 'selection', 'handles'], target: 'image.move', steps: [
    'Select part of the image, or choose a layer to transform the whole layer.',
    'Choose Select → Free transform or press Ctrl+T. Drag a corner to scale, drag inside to move, or use the rotation handle.',
    'Use the transform fields for exact values. Enter places the result; Escape cancels the pending transform.',
  ] },
  { id: 'help.clipboard', title: 'Copy the canvas or paste a picture', workspace: 'image', section: 'getting-started', keywords: ['clipboard', 'copy', 'paste', 'Ctrl+C', 'Ctrl+V', 'layer'], steps: [
    'Choose Copy canvas to copy the visible image for pasting into another app.',
    'Use Paste or Ctrl+V to bring a picture from the clipboard. A blank untouched canvas can adopt the picture; an existing drawing receives a new layer with transform handles.',
    'Allow clipboard access if the browser asks. If access is unavailable, save/open a PNG instead.',
  ] },
  { id: 'help.zoom', title: 'Zoom without a mouse wheel', workspace: 'image', section: 'getting-started', keywords: ['zoom', 'navigator', 'map', 'magnify', 'slider', 'plus', 'minus', 'pan'], target: 'view.fit', steps: [
    'Use the small Zoom panel in the canvas corner: −, +, the slider or the percentage field change magnification.',
    'Expand the panel to see the navigator. Drag in the map to position the view; Fit shows the whole canvas.',
    'A mouse wheel zooms at the cursor. Space-drag pans in a 2D view. Zoom changes the view, not the image dimensions.',
  ] },
  { id: 'help.save', title: 'What is the difference between Save and Export?', workspace: 'shared', section: 'faq', keywords: ['saving a project', 'save', 'export', 'PDF', 'PNG', 'editable', 'download'], steps: [
    'When saving a project, choose Save project file to preserve editable workspace data.',
    'The Save… button offers project and export choices. File → Save has the same choices; Export… lists output formats for the current workspace.',
    'An exported image, PDF or media file is a copy for other apps. Exporting does not replace an editable project backup.',
  ] },
  { id: 'help.pixels', title: 'Why do some enlarged edges look soft?', workspace: 'image', section: 'faq', keywords: ['pixel', 'crisp', 'sharp', 'blur', 'Gaussian', 'bicubic', 'bitcubic', 'nearest', 'antialiasing', 'resolution', 'colours', 'colors', 'palette'], steps: [
    'Nearest-neighbour display enlarges each stored pixel as a sharp block. Antialiasing means the image already contains intermediate edge colours; zooming cannot remove those colours.',
    'Bicubic is a smooth resampling method, not a limited-colour image format. A limited palette restricts colours; hard coverage removes partially covered generated edges. These are separate choices.',
    'Imported pictures can contain blur or JPEG artefacts already. Making their edges harder requires an explicit image operation; it cannot recover detail that was never captured.',
    'Small canvases can have crisp, visible pixels, but fine lettering still needs enough pixels to describe its shape.',
  ] },
  { id: 'help.pixel-settings', title: 'Choose Pixel art, Smooth or a limited palette', workspace: 'image', section: 'getting-started', keywords: ['rendering', 'pixel', 'palette', '16 colours', '64 colors', 'dither', 'dithering', 'Bayer', 'Floyd Steinberg'], steps: [
    'File → New offers canvas dimensions, background, Pixel art or Smooth, colour count and dithering. Image → Pixel settings… changes the current document with a reversible preview.',
    'Pixel art gives generated text and shapes hard coverage and uses nearest-neighbour scaling by default. Smooth retains intermediate coverage and smooth scaling. Brush style can still deliberately create softness.',
    'A limited palette maps the final visible image and PNG output to exactly the chosen colour set, plus transparent pixels. Layers keep their underlying colours for later editing.',
    'Choose a preset palette, generate colours from the image, or enter custom hex colours. Bayer creates a regular dither pattern; Floyd–Steinberg distributes colour error. None produces flat colour regions.',
    'Use Image → Export PNG for lossless pixels. JPEG compression can reintroduce intermediate colours and edge artefacts.',
  ] },
  { id: 'help.downpixel', title: 'Make larger, crisp pixel blocks', workspace: 'image', section: 'getting-started', keywords: ['down-pixel', 'pixelate', 'bitcrusher', 'resolution', 'retro', 'filter'], steps: [
    'Choose Filters → Down-pixel…. Set a block size or logical pixel dimensions and inspect the live preview.',
    'Keep the canvas size to enlarge the sampled pixels into sharp blocks. Enable Resize canvas to logical dimensions to create a genuinely smaller image.',
    'OK applies the effect in one undo step. Cancel restores the original. Pair it with a limited palette or dithering in Image → Pixel settings….',
  ] },
  { id: 'help.automation', title: 'Record and reuse image actions', workspace: 'image', section: 'getting-started', keywords: ['automation', 'record', 'actions', 'replay', 'script', 'JavaScript', 'process'], steps: [
    'Choose Automation → Start recording, make edits, then Stop recording. Undo and Redo update the recorded sequence; unsupported actions pause it with a message.',
    'Automation → Actions… lets you rename, enable, remove and reorder steps. Preview on copy leaves the canvas unchanged. Apply once creates one undo step.',
    'Save actions… writes a portable .gsnv-actions file, including pasted or rendered text assets. Open actions… only loads it; it never runs automatically.',
    'JavaScript actions… builds a recipe in an isolated runner. Use the example helpers, such as return [ops.adjust({kind:"invert"})];. Code receives image dimensions and layer count, not file access or image bytes.',
    'Build recipe does not change your canvas. Use recipe opens the action editor, where you can preview or apply. Stop terminates a running script.',
  ] },
  { id: 'help.batch', title: 'Process a folder of images safely', workspace: 'image', section: 'getting-started', keywords: ['automation', 'batch', 'folder', 'timestamp', 'ZIP', 'multiple', 'process'], steps: [
    'First record or open an action. Choose Automation → Batch process… and select images or a folder. Only supported files directly inside that folder are included.',
    'Preview samples checks the inputs and shows one before/after example for each distinct size, up to 25 sizes. Coordinates scale to each input; explicit resize dimensions stay absolute.',
    'Run batch writes to a new timestamped child folder. Selected individual files require a destination folder. Browsers without folder writing offer a clearly labelled ZIP download instead.',
    'Originals remain untouched. Files process one at a time, with a report of successes and errors. Stop retains completed folder outputs and discards an incomplete ZIP.',
    'Review the samples carefully: positional actions are scaled geometrically, not adapted to the subject of each image.',
  ] },
  { id: 'help.mobile', title: 'Draw with a finger or Pencil', workspace: 'image', section: 'getting-started', keywords: ['iPad', 'iPhone', 'touch', 'stylus', 'Pencil', 'mobile', 'scroll'], steps: [
    'Choose a drawing tool, then draw on the canvas. Use the Zoom controls to magnify or reposition it without a mouse wheel.',
    'On a narrow screen, swipe the panel area at the bottom to reach colours, layers and history. Scroll within a panel to reach its remaining controls.',
    'Text fields still support normal selection and editing. The canvas and app controls should not select page text while drawing.',
  ] },
  { id: 'help.recovery', title: 'Where is my work stored?', workspace: 'shared', section: 'faq', keywords: ['recovery', 'autosave', 'storage', 'lost', 'restore', 'recent', 'backup'], steps: [
    'Recovery and stored projects are kept locally in this browser. File → Open stored project… lists retained projects when storage is available.',
    'If the Recovery panel offers Restore or Recover as copy, inspect that option before discarding anything. Conflicting versions are kept separate.',
    'Browser storage can be cleared or evicted. Save a real project file for a durable backup, especially before clearing website data or changing devices.',
  ] },
  { id: 'help.offline', title: 'Does this send my files to a server?', workspace: 'shared', section: 'faq', keywords: ['offline', 'privacy', 'upload', 'server', 'local', 'internet', 'update'], steps: [
    'Editing and file processing run locally in your browser. Opening an image or importing a font does not upload it.',
    'Wait for Ready offline before relying on an offline visit. A first load or application update needs the hosted files to download.',
    'If Update ready appears, save your work, close all tabs for this app, then reopen it to use the new version.',
  ] },
];
const normalize = (text: string) => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function searchHelp({ query, workspace, commands }: { query: string; workspace: HelpWorkspace; commands: readonly HelpCommand[] }): readonly HelpResult[] {
  if (typeof query !== 'string' || !WORKSPACES.has(workspace) || !Array.isArray(commands)) throw new TypeError('Help needs a query, workspace and command list.');
  const seen = new Set<string>();
  for (const command of commands) {
    if (!command || typeof command.id !== 'string' || !command.id || typeof command.label !== 'string' || !command.label || !WORKSPACES.has(command.workspace) ||
      !Array.isArray(command.path) || !command.path.every((part: unknown) => typeof part === 'string') || typeof command.enabled !== 'boolean' ||
      (command.shortcut !== undefined && typeof command.shortcut !== 'string') || (command.showMe !== undefined && typeof command.showMe !== 'boolean')) throw new TypeError('Invalid Help command metadata.');
    const key = `${command.workspace}:${command.id}`; if (seen.has(key)) throw new TypeError('Duplicate Help command.'); seen.add(key);
  }
  const local = commands.filter(command => command.workspace === workspace);
  const articles: HelpResult[] = ARTICLES.map(({ target, ...article }) => {
    const command = local.find(command => command.id === target);
    return { ...article, kind: 'article', ...(command ? { commandId: command.id } : {}), available: !!command?.enabled && command.showMe === true };
  });
  const entries: HelpResult[] = commands.map(command => ({ id: `command:${command.workspace}:${command.id}`, title: command.label, workspace: command.workspace,
    kind: 'command', section: 'search', keywords: [command.shortcut ?? '', ...command.path], commandId: command.id,
    available: command.workspace === workspace && command.enabled && command.showMe === true,
    steps: [`Find it in ${[...command.path, command.label].join(' → ')}.${command.shortcut ? ` Shortcut: ${command.shortcut}.` : ''}`, ...(command.enabled ? [] : ['This command is currently unavailable. Check the active document, tool or selection.'])] }));
  const terms = normalize(query).split(' ').filter(Boolean), phrase = terms.join(' ');
  const priority = (result: HelpResult) => result.workspace === workspace ? 0 : result.workspace === 'shared' ? 1 : 2;
  const ranked = [...articles, ...entries].map(result => {
    const title = normalize(result.title), keywords = normalize(result.keywords.join(' ')), content = normalize([result.title, ...result.keywords, ...result.steps].join(' '));
    const score = terms.length ? (title === phrase ? 100 : 0) + (title.includes(phrase) ? 30 : 0) + terms.reduce((total, term) => total + (title.includes(term) ? 8 : 0) + (keywords.includes(term) ? 4 : 0), 0) : 0;
    return { result, score, match: terms.every(term => content.includes(term)) };
  }).filter(entry => entry.match).sort((a, b) => priority(a.result) - priority(b.result) || b.score - a.score || (a.result.id < b.result.id ? -1 : a.result.id > b.result.id ? 1 : 0));
  return Object.freeze(ranked.map(({ result }) => Object.freeze({ ...result, keywords: Object.freeze([...result.keywords]), steps: Object.freeze([...result.steps]) })));
}
