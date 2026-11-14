/** Test-only C37 native/virtual-filesystem call ledger; no geometry oracle. */
import assert from 'node:assert/strict';
import type { KernelSession } from './kernel-runtime.ts';
import type { STEPRequest } from './step-exchange.ts';

type Rejection = 'unit' | 'transfer' | 'write' | 'partial-write' | 'empty-file' | 'read' | 'entity' | 'roots' | 'stats' | 'invalid' | 'no-solids' | 'restore';
type Options = { action: 'import' | 'export'; reject?: Rejection; failAt?: number; cause?: unknown };
type Native = { id: number; label: string; index?: number; deleted: boolean; delete(): void };
const bytes = new TextEncoder().encode('ISO-10303-21;\nEND-ISO-10303-21;\n');

export function stepFaultFixture(options: Options) {
  const trace: string[] = [], allocated: Native[] = [], files = new Map<string, Uint8Array>();
  const retained = new Map<number, Native>();
  let issued = 0, unit = 'CM';
  const call = (label: string) => { trace.push(label); if (trace.length === options.failAt) throw options.cause; };
  const method = (label: string, action: (...args: any[]) => any) => (...args: any[]) => { call(label); return action(...args); };
  const object = (label: string, methods: Record<string, unknown> = {}): Native => {
    const value: Native = { id: allocated.length + 1, label, deleted: false,
      delete() { call(`delete ${this.id}:${this.label}`); assert.equal(this.deleted, false); this.deleted = true; }, ...methods };
    allocated.push(value); return value;
  };
  const constructor = (label: string, methods: (...args: any[]) => Record<string, unknown> = () => ({})) =>
    function (...args: any[]) { call(`new ${label}`); return object(label, methods(...args)); };
  const shape = (index: number): Native => object(`shape-${index}`, { index,
    IsNull: method(`shape-${index}.IsNull`, () => false),
    ShapeType: method(`shape-${index}.ShapeType`, () => index < 0 ? 'compound' : 'solid'),
    IsSame: method(`shape-${index}.IsSame`, (other: Native) => other.index === index),
  });
  const library = {
    STEPControl_Writer: constructor('writer', () => ({
      Model: method('writer.Model', () => object('write-model', {
        SetLocalLengthUnit: method('model.SetLocalLengthUnit', () => undefined),
        SetWriteLengthUnit: method('model.SetWriteLengthUnit', () => undefined),
      })),
      Transfer: method('writer.Transfer', () => options.reject === 'transfer' ? 'failed' : 'done'),
      Write: method('writer.Write', (path: string) => {
        if (options.reject !== 'write') files.set(path, options.reject === 'empty-file' ? new Uint8Array() : bytes.slice());
        return ['write', 'partial-write'].includes(options.reject ?? '') ? 'failed' : 'done';
      }),
    })),
    STEPControl_Reader: constructor('reader', () => ({
      ReadFile: method('reader.ReadFile', () => options.reject === 'read' ? 'failed' : 'done'),
      StepModel: method('reader.StepModel', () => object('read-model', {
        NbEntities: method('model.NbEntities', () => 2),
        IsErrorEntity: method('model.IsErrorEntity', () => options.reject === 'entity'),
        IsUnknownEntity: method('model.IsUnknownEntity', () => false),
        Value: method('model.Value', () => object('entity')),
      })),
      SetSystemLengthUnit: method('reader.SetSystemLengthUnit', () => undefined),
      NbRootsForTransfer: method('reader.NbRootsForTransfer', () => 2),
      TransferRoots: method('reader.TransferRoots', () => options.reject === 'roots' ? 1 : 2),
      GetStatsTransfer: method('reader.GetStatsTransfer', () => ({ nbMapped: 2, nbWithResult: 2, nbWithFail: options.reject === 'stats' ? 1 : 0 })),
      OneShape: method('reader.OneShape', () => shape(-1)),
    })),
    NCollection_HSequence_handle_Standard_Transient: constructor('entities', () => ({ Append: method('entities.Append', () => undefined) })),
    Message_ProgressRange: constructor('progress'),
    BRepCheck_Analyzer: constructor('validator', () => ({ IsValid: method('validator.IsValid', () => options.reject !== 'invalid') })),
    GProp_GProps: constructor('properties', () => ({ Mass: method('properties.Mass', () => 24) })),
    BRepGProp: { VolumeProperties: method('VolumeProperties', () => undefined) },
    TopExp_Explorer: constructor('explorer', (_shape: Native, kind: string) => {
      let at = 0; const count = kind === 'solid' && options.reject !== 'no-solids' ? 2 : 0;
      return { More: method('explorer.More', () => at < count), Next: method('explorer.Next', () => { at++; }), Current: method('explorer.Current', () => shape(at)) };
    }),
    Interface_Static: {
      CVal: method('unit.read', () => unit),
      SetCVal: (_name: string, value: string) => {
        call(value === 'CM' ? 'unit.restore' : 'unit.set');
        if (options.reject === (value === 'CM' ? 'restore' : 'unit')) return false;
        unit = value; return true;
      },
    },
    IFSelect_ReturnStatus: { IFSelect_RetDone: 'done' }, STEPControl_StepModelType: { STEPControl_ManifoldSolidBrep: 'brep' },
    TopAbs_ShapeEnum: { TopAbs_SOLID: 'solid', TopAbs_SHAPE: 'shape', TopAbs_SHELL: 'shell', TopAbs_FACE: 'face', TopAbs_WIRE: 'wire', TopAbs_EDGE: 'edge', TopAbs_VERTEX: 'vertex' },
    FS: {
      writeFile: method('FS.writeFile', (path: string, value: Uint8Array) => { files.set(path, value.slice()); }),
      readFile: method('FS.readFile', (path: string) => { assert.ok(files.has(path)); return files.get(path)!; }),
      readdir: method('FS.readdir', (path: string) => { assert.equal(path, '/'); return ['.', '..', ...[...files.keys()].map(name => name.slice(1))]; }),
      unlink: method('FS.unlink', (path: string) => { assert.ok(files.has(path)); files.delete(path); }),
    },
  };
  const session = { generation: 1, library, isClosed: () => false,
    retain: method('session.retain', (value: Native) => { assert.equal(value.deleted, false); retained.set(++issued, value); return { id: issued, generation: 1 }; }),
    resolve: method('session.resolve', (token: { id: number }) => { assert.ok(retained.has(token.id)); return retained.get(token.id)!; }),
    release: method('session.release', (token: { id: number }) => { const value = retained.get(token.id)!; value.delete(); retained.delete(token.id); }),
  } as unknown as KernelSession;
  const source = options.action === 'export' ? shape(0) : null;
  if (source) retained.set(++issued, source);
  const request: STEPRequest = options.action === 'import' ? { action: 'import', session, units: 'inch', bytes: bytes.slice() } :
    { action: 'export', session, units: 'inch', bodies: { shapes: [{ bodyId: 'source', token: { id: 1, generation: 1 } }], topology: [], operands: [], diagnostics: [] } };
  return { request, trace, allocated, retained, files, source, currentUnit: () => unit };
}
