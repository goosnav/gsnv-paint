/**
 * PURPOSE    Compile a linear sketch into PlaneGCS primitives.
 * KIND       CORE
 * CONTRACT   IN: valid C50 sketch, C03 context and positive tolerance. OUT: vendor
 *            primitives plus pure accept(snapshot) restoring solved entities by ID.
 *            RAISES: SketchProgramError for bad targets or missing/nonfinite points or collapsed solved edges.
 * GUARANTEES No I/O, solver imitation or input mutation; exact endpoints share a point.
 * TUNING     Document tolerance bounds positive driving dimensions.
 * DECISIONS  D1: Share exact endpoint coordinates. Alternative: disconnected duplicate
 *            points would open drawn loops. Revisit if: full coincidence constraints land.
 * LIMITS     Supported C50 constraints only; C03 errors propagate; acceptance assumes solver success.
 * TESTBENCH  src/cad/linear-sketch-program.test.ts -- run with: node --import tsx --test src/cad/linear-sketch-program.test.ts
 */
import type { SketchPrimitive } from '@salusoft89/planegcs';
import type { CADContent } from './editable-cad-content.ts';
import { evaluateDimension, type DimensionRequest } from './dimension-expressions.ts';
type Request = { sketch: CADContent['graph']['features'][0]['definition']['sketch']; context: DimensionRequest['context']; tolerance: number };
export function linearSketchProgram(request: Request): { primitives: SketchPrimitive[]; accept(snapshot: SketchPrimitive[]): Request['sketch']['entities'] } {
  const fail = (message: string): never => { throw Object.assign(new Error(message), { name: 'SketchProgramError' }); };
  const sketch = JSON.parse(JSON.stringify(request.sketch)) as Request['sketch'];
  const points: Extract<SketchPrimitive,{type:'point'}>[] = [], lines: Extract<SketchPrimitive,{type:'line'}>[] = [], relations: SketchPrimitive[] = [];
  const pointIds = new Map<string,string>(), used = new Set([...sketch.entities,...sketch.constraints,...sketch.dimensions].map(v=>v.id));
  const point = (v: readonly number[]) => {
    const key = JSON.stringify(v); if (pointIds.has(key)) return pointIds.get(key)!;
    let id = `p${points.length}`; while (used.has(id)) id = `_${id}`; used.add(id);
    points.push({ id, type:'point', x:v[0]!, y:v[1]!, fixed:false }); pointIds.set(key,id); return id;
  };
  for (const e of sketch.entities) lines.push({ id:e.id, type:'line', p1_id:point(e.a), p2_id:point(e.b) });
  const line = (id: string) => lines.find(v=>v.id===id) ?? fail(`Missing segment ${id}.`);
  for (const c of sketch.constraints) {
    const l = line(c.entityIds[0]!);
    if (c.kind === 'fix') points.find(p=>p.id===(c.pointRoles[0]==='a'?l.p1_id:l.p2_id))!.fixed = true;
    else relations.push({ id:c.id, type:c.kind==='horizontal'?'horizontal_l':'vertical_l', l_id:l.id });
  }
  for (const d of sketch.dimensions) {
    const l = line(d.entityIds[0]!);
    const distance = evaluateDimension({ expression:d.value, context:request.context }).value;
    if (distance <= request.tolerance) fail(`Dimension ${d.id} must be positive and exceed the tolerance.`);
    relations.push({ id:d.id, type:'p2p_distance', p1_id:l.p1_id, p2_id:l.p2_id, distance });
  }
  return { primitives:[...points,...lines,...relations], accept(snapshot) {
    const solved = new Map(snapshot.filter(p=>p.type==='point').map(p=>[p.id,p]));
    const xy = (id:string): [number,number] => {
      const p = solved.get(id); if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) fail(`Solver point ${id} is missing or nonfinite.`);
      return [p!.x,p!.y];
    };
    return sketch.entities.map(e=> { const l=line(e.id),a=xy(l.p1_id),b=xy(l.p2_id); if(Math.hypot(b[0]-a[0],b[1]-a[1])<=request.tolerance)fail(`Sketch: constraints collapsed edge ${e.id}. Remove a constraint or change a dimension.`); return {...e,a,b}; });
  } };
}
