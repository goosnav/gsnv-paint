/** Test-only native allocation ledger; no geometry oracle is derived from this fake. */
import assert from 'node:assert/strict';
import type { KernelSession } from './kernel-runtime.ts';

type NativeObject = { id: number; label: string; args: unknown[]; deleted: boolean; delete(): void };
type Rejection = 'wire' | 'face' | 'final-face' | 'revolve' | 'null' | 'compound' | 'shell' | 'invalid';
type Options = { reject?: Rejection; mass?: number; closed?: boolean; failAt?: number; cause?: unknown };

export function revolveKernelFake(options: Options = {}) {
  const trace: string[] = [], allocated: NativeObject[] = [], deleted: number[] = [];
  const retained = new Map<number, NativeObject>(), liveAtRetain: number[][] = [];
  let faceChecks = 0, issued = 0;
  const call = (label: string) => {
    trace.push(label);
    if (trace.length === options.failAt) throw options.cause;
  };
  const object = (label: string, args: unknown[] = [], methods: Record<string, unknown> = {}) => {
    const value: NativeObject = {
      id: allocated.length + 1, label, args, deleted: false,
      delete() {
        call(`delete ${this.id}:${this.label}`);
        assert.equal(this.deleted, false, 'each wrapper is deleted once');
        this.deleted = true; deleted.push(this.id);
      }, ...methods,
    };
    allocated.push(value); return value;
  };
  const constructor = (label: string, methods: () => Record<string, unknown> = () => ({})) =>
    function (...args: unknown[]) { call(`new ${label}`); return object(label, args, methods()); };
  const method = (label: string, action: () => unknown) => () => { call(label); return action(); };
  // Distinct enum identities catch casts or comparisons to an unrelated numeric value.
  const solid = { value: 2 }, compound = { value: 0 }, shell = { value: 3 };
  const library = {
    gp_Pnt: constructor('point'), gp_Dir: constructor('direction'),
    gp_Ax2: constructor('profile-axis'), gp_Circ: constructor('circle'), gp_Ax1: constructor('revolve-axis'),
    TopAbs_ShapeEnum: { TopAbs_SOLID: solid },
    BRepBuilderAPI_MakeEdge: constructor('edge-builder', () => ({ Edge: method('edge', () => object('edge')) })),
    BRepBuilderAPI_MakeWire: constructor('wire-builder', () => ({
      Add: method('wire.Add', () => undefined), IsDone: method('wire.IsDone', () => options.reject !== 'wire'),
      Wire: method('wire', () => object('wire')),
    })),
    BRepBuilderAPI_MakeFace: constructor('face-builder', () => ({
      IsDone: method('face.IsDone', () => options.reject !== (++faceChecks === 1 ? 'face' : 'final-face')),
      Face: method('face', () => object('face')),
    })),
    BRepPrimAPI_MakeRevol: constructor('revolve-builder', () => ({
      IsDone: method('revolve.IsDone', () => options.reject !== 'revolve'),
      Shape: method('shape', () => object('solid', [], {
        IsNull: method('shape.IsNull', () => options.reject === 'null'),
        ShapeType: method('shape.ShapeType', () => options.reject === 'compound' ? compound : options.reject === 'shell' ? shell : solid),
      })),
    })),
    BRepCheck_Analyzer: constructor('validator', () => ({ IsValid: method('validator.IsValid', () => options.reject !== 'invalid') })),
    GProp_GProps: constructor('properties', () => ({ Mass: method('mass', () => options.mass ?? 10) })),
    BRepGProp: { VolumeProperties: method('volume', () => undefined) },
  };
  const session = {
    library, generation: 7, isClosed: () => options.closed ?? false,
    retain(shape: NativeObject) {
      call('session.retain'); assert.equal(shape.deleted, false);
      liveAtRetain.push(allocated.filter(value => !value.deleted).map(value => value.id));
      retained.set(++issued, shape); return { id: issued, generation: 7 };
    },
    resolve(token: { id: number; generation: number }) {
      call('session.resolve'); assert.equal(token.generation, 7); assert.ok(retained.has(token.id)); return retained.get(token.id)!;
    },
    release(token: { id: number; generation: number }) {
      call('session.release'); assert.equal(token.generation, 7); assert.ok(retained.has(token.id));
      retained.get(token.id)!.delete(); retained.delete(token.id);
    },
  } as unknown as KernelSession;
  return { session, trace, allocated, deleted, retained, liveAtRetain };
}
