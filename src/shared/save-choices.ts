/**
 * PURPOSE    Describe the available save formats for a workspace.
 * KIND       CORE
 * CONTRACT   IN: SaveChoiceRequest with a known workspace, project availability and unique commands.
 *            OUT: owned ordered choices, project first then supported exports present in commands.
 *            RAISES: TypeError for unknown workspace, malformed fields or duplicate command IDs.
 * GUARANTEES Pure; no I/O, mutation, inferred capabilities or codec implementation.
 * TUNING     FORMATS contains the explicit command labels and format ordering.
 * DECISIONS  D1: Match explicit command IDs. Alternative: guess from labels, which change with copy/localization;
 *            revisit if adapters expose a typed export registry. D2: Retain disabled formats
 *            for menu discoverability; callers may omit them from a selection dialog.
 * LIMITS     Describes only current exporters; does not verify their output or choose a codec.
 * TESTBENCH  src/shared/save-choices.test.ts -- run with: node --import tsx --test src/shared/save-choices.test.ts
 */
export type SaveChoiceRequest = { workspace: string; projectEnabled: boolean; commands: readonly { id: string; enabled: boolean }[] };
export type SaveChoice = { id: string; label: string; description: string; shortcut: string; icon: string; enabled: boolean };
const PROJECTS: Record<string,string> = { image:'Keep layers and edits',cad:'Keep the editable model',photo:'Keep the original and adjustments',video:'Keep clips and timeline edits',document:'Keep the editable document',slides:'Keep editable slides',audio:'Keep audio edits',spreadsheet:'Keep sheets, formulas and formatting',code:'Keep all project source files' };
const FORMATS: Record<string,readonly [string,string,string,string][]> = {
  image:[['image.exportPNG','Save PNG image…','.png · Flattened image with transparency','image']],
  cad:[['cad.exportSTEP','Save STEP model…','.step · Solid geometry for other CAD apps','cad'],['cad.exportSTL','Save STL mesh…','.stl · Mesh for 3D printing','cad']],
  photo:[['photo.export','Save JPEG or PNG image…','Choose image format, size and quality','image']],
  video:[['video.export','Save video…','MP4 or WebM, depending on browser support','video']],
  document:[['doc.pdf','Save PDF…','Print preview · Choose Save as PDF','pdf'],['doc.html','Save HTML…','.html · Formatted document','document'],['doc.text','Save plain text…','.txt · Text without formatting','text']],
  slides:[['slides.pdf','Save PDF…','.pdf · One slide per page','pdf']],
  audio:[['audio.export','Save WAV audio…','.wav · Edited audio','audio']],
  spreadsheet:[['sheet.xlsx','Save Excel workbook…','.xlsx · Sheets and supported formulas','spreadsheet'],['sheet.csv','Save CSV…','.csv · Values from the active sheet','table']],
  code:[['code.export','Save source file…','The currently selected source file','code']],
};
export function saveChoices(request: SaveChoiceRequest): SaveChoice[] {
  if (!request || !Object.hasOwn(FORMATS,request.workspace) || typeof request.projectEnabled!=='boolean' || !Array.isArray(request.commands)) throw new TypeError('Invalid save choices request.');
  const commands=new Map<string,boolean>();
  for (const command of request.commands) {
    if (!command || typeof command.id!=='string' || !command.id || typeof command.enabled!=='boolean' || commands.has(command.id)) throw new TypeError('Save commands need unique IDs and boolean availability.');
    commands.set(command.id,command.enabled);
  }
  return [{id:'file.save',label:'Save project file…',description:`.gsnv-${request.workspace} · ${PROJECTS[request.workspace]}`,shortcut:'Ctrl+S',icon:'save',enabled:request.projectEnabled},
    ...FORMATS[request.workspace]!.filter(([id])=>commands.has(id)).map(([id,label,description,icon])=>({id,label,description,icon,shortcut:'',enabled:commands.get(id)!}))];
}
