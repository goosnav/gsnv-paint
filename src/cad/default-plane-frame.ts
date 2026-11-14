/**
 * PURPOSE    Map a default sketch plane to a right-handed world frame.
 * KIND       CORE
 * CONTRACT   IN: exact XY, XZ or YZ plane tag. OUT: owned Frame and column-major
 *            rigid localToWorld matrix. RAISES: DefaultPlaneError for other values.
 * GUARANTEES Deterministic, no mutation/I/O; U cross V is the positive normal.
 * TUNING     None; bases are the persisted default-plane convention.
 * DECISIONS  D1: XZ normal is -Y to preserve handedness. Alternative: mirrored
 *            coordinates corrupt winding. Revisit if: a versioned plane convention changes.
 * LIMITS     Origin planes only; face/offset/angled frames belong to C18.
 * TESTBENCH  node --import tsx --test src/cad/default-plane-frame.test.ts
 */
export type DefaultPlane = 'XY' | 'XZ' | 'YZ';
type Vec3 = [number,number,number];
export function defaultPlaneFrame(plane: DefaultPlane): {frame:{origin:Vec3;x:Vec3;y:Vec3;normal:Vec3};localToWorld:number[]} {
  if(!['XY','XZ','YZ'].includes(plane))throw Object.assign(new Error('Choose the XY, XZ or YZ sketch plane.'),{name:'DefaultPlaneError'});
  const x:Vec3=plane==='YZ'?[0,1,0]:[1,0,0],y:Vec3=plane==='XY'?[0,1,0]:[0,0,1];
  const normal:Vec3=plane==='XY'?[0,0,1]:plane==='XZ'?[0,-1,0]:[1,0,0];
  return{frame:{origin:[0,0,0],x,y,normal},localToWorld:[...x,0,...y,0,...normal,0,0,0,0,1]};
}
