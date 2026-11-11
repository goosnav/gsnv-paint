import { session, type Session } from './session.ts';

let state: Session<{ width: number }> = { workspace: 'cad', documents: {}, histories: {}, saved: {}, dirty: {}, message: '' };
const original = { id: 'plate', title: 'Plate', format: 'gsnv-cad', version: 1, identity: 'r0', value: { width: 100 } };
state = session({ state, event: { type: 'open', workspace: 'cad', snapshot: original, isSaved: true } }).state;
state = session({ state, event: { type: 'commit', workspace: 'cad', snapshot: { ...original, identity: 'r1', value: { width: 120 } }, label: 'Change width' } }).state;
state = session({ state, event: { type: 'saved', workspace: 'cad', documentId: 'plate', identity: 'r0' } }).state;
console.log('After an earlier save finishes:', { width: state.documents.cad?.value.width, dirty: state.dirty.cad });
state = session({ state, event: { type: 'undo', workspace: 'cad' } }).state;
console.log('After undo:', { width: state.documents.cad?.value.width, dirty: state.dirty.cad, message: state.message });
