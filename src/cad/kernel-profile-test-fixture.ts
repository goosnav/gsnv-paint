/** Test-only native allocation ledger for the profile/prism ownership boundary. */
import assert from 'node:assert/strict';
import type { KernelSession } from './kernel-runtime.ts';
import type { ProfileRegion } from './sketch-regions.ts';

type NativeObject = { id: number; label: string; deleted: boolean; delete(): void };
type Rejection = 'outline-wire' | 'hole-wire' | 'outer-face' | 'hole-face' | 'prism' | 'invalid';
type Options = { reject?: Rejection; closed?: boolean; failAt?: number; cause?: unknown };

export const mixedRegion: ProfileRegion = {
  outer: { kind: 'polygon', points: [[0, 0], [100, 0], [100, 60], [0, 60]] },
  holes: [
    { kind: 'circle', center: [20, 30], radius: 5 },
    { kind: 'polygon', points: [[40, 20], [40, 40], [60, 40], [60, 20]] },
  ],
};
export const annulusRegion: ProfileRegion = {
  outer: { kind: 'circle', center: [0, 0], radius: 10 },
  holes: [{ kind: 'circle', center: [0, 0], radius: 4 }],
};

export function profileKernelFake(options: Options = {}) {
  const trace: string[] = [], allocated: NativeObject[] = [], deleted: number[] = [];
  const retained: NativeObject[] = [], liveAtRetain: number[][] = [], directions: unknown[][] = [];
  let wires = 0, faceChecks = 0;
  const call = (label: string) => {
    trace.push(label);
    if (trace.length === options.failAt) throw options.cause;
  };
  const object = (label: string, methods: Record<string, unknown> = {}) => {
    const value = {
      id: allocated.length + 1, label, deleted: false,
      delete() {
        call(`delete ${this.id}:${this.label}`);
        assert.equal(this.deleted, false, 'native wrapper deleted once');
        this.deleted = true;
        deleted.push(this.id);
      },
      ...methods,
    };
    allocated.push(value);
    return value;
  };
  const constructor = (label: string, make: (...args: unknown[]) => object = () => object(label)) =>
    function (...args: unknown[]) { call(`new ${label}`); return make(...args); };
  const method = (label: string, action: () => unknown) => () => { call(label); return action(); };
  const library = {
    gp_Pnt: constructor('point'), gp_Vec: constructor('vector'),
    gp_Dir: constructor('direction', (...args) => { directions.push(args); return object('direction'); }),
    gp_Ax2: constructor('axis'), gp_Circ: constructor('circle'),
    BRepBuilderAPI_MakeEdge: constructor('edge-builder', () => object('edge-builder', {
      Edge: method('edge', () => object('edge')),
    })),
    BRepBuilderAPI_MakeWire: constructor('wire-builder', () => {
      const hole = ++wires > 1;
      return object('wire-builder', {
        Add: method('wire.Add', () => undefined),
        IsDone: method('wire.IsDone', () => options.reject !== (hole ? 'hole-wire' : 'outline-wire')),
        Wire: method('wire', () => object('wire')),
      });
    }),
    BRepBuilderAPI_MakeFace: constructor('face-builder', () => object('face-builder', {
      Add: method('face.Add', () => undefined),
      IsDone: method('face.IsDone', () => options.reject !== (++faceChecks === 1 ? 'outer-face' : 'hole-face')),
      Face: method('face', () => object('face')),
    })),
    BRepPrimAPI_MakePrism: constructor('prism-builder', () => object('prism-builder', {
      IsDone: method('prism.IsDone', () => options.reject !== 'prism'),
      Shape: method('solid', () => object('solid')),
    })),
    BRepCheck_Analyzer: constructor('validator', () => object('validator', {
      IsValid: method('validator.IsValid', () => options.reject !== 'invalid'),
    })),
  };
  const session = {
    library, generation: 7, isClosed: () => options.closed ?? false,
    retain(shape: NativeObject) {
      call('session.retain');
      liveAtRetain.push(allocated.filter(v => !v.deleted).map(v => v.id));
      retained.push(shape);
      return { id: retained.length, generation: 7 };
    },
  } as unknown as KernelSession;
  return { session, trace, allocated, deleted, retained, liveAtRetain, directions };
}
