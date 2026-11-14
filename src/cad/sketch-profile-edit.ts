/**
 * PURPOSE    Enforce persistent profile ownership during sketch source edits.
 * KIND       CORE
 * CONTRACT   IN: structural sketch, optional exact ProfileAction, full document ID
 *            inventory, C03 context and tolerance. OUT: owned same-shaped sketch.
 *            RAISES: SketchProfileEditError for invalid membership/references/action;
 *            C71 and expression errors propagate. Missing action validates only.
 * GUARANTEES No mutation or repair of invalid input; detached seeds use current values.
 * TUNING     C71 owns profile size bounds.
 * DECISIONS  D1: Controlled members have one source authority. Alternative: silently
 *            discard competing constraints. Revisit if: composite constraints are supported.
 * LIMITS     No ID generation or revision change; caller supplies complete global IDs.
 * TESTBENCH  node --import tsx --test src/cad/sketch-profile-edit.test.ts
 */
import { materializeSketchProfile, type ProfileSource } from './sketch-profile-source.ts';
import type { DimensionRequest } from './dimension-expressions.ts';
export type ProfileAction={kind:'add-profile'|'edit-profile';profile:ProfileSource}|{kind:'detach-profile'|'remove-profile';id:string}|{kind:'construction';ids:string[];enabled:boolean};
type SketchState={entities:{id:string;kind:string;construction:boolean}[];constraints:{entityIds:string[];position?:{entityIds:string[]}}[];dimensions:{entityIds:string[]}[];profiles?:ProfileSource[]};
export function isProfileAction(action:{kind:string}):action is ProfileAction{return['add-profile','edit-profile','detach-profile','remove-profile','construction'].includes(action.kind);}
export function manageSketchProfiles<T extends SketchState>({sketch,action,usedIds,context,tolerance}:{sketch:T;action?:ProfileAction;usedIds:readonly string[];context:DimensionRequest['context'];tolerance:{linearMm:number;angularRad:number;relative:number}}):T {
  const fail=(message:string):never=>{throw Object.assign(new Error(`Profile: ${message}`),{name:'SketchProfileEditError'});};
  const evaluate=(profile:ProfileSource)=>materializeSketchProfile({profile,context,tolerance});
  const check=(s:SketchState)=>{
    if(s.profiles!==undefined&&!Array.isArray(s.profiles))fail('expected a profile array.');
    const members=new Set<string>(),profileIds=new Set<string>(),entities=new Map(s.entities.map(e=>[e.id,e]));
    for(const p of s.profiles??[]){
      evaluate(p);
      if(profileIds.has(p.id)||entities.has(p.id))fail('profile IDs must be unique and distinct from geometry.');profileIds.add(p.id);
      for(const id of p.entityIds){const e=entities.get(id);if(!e||e.kind!=='segment'||e.construction!==p.construction)fail('members must be existing segments with matching construction flags.');if(members.has(id))fail('controlled groups cannot overlap.');members.add(id);}
    }
    for(const c of s.constraints)if([...c.entityIds,...(c.position?.entityIds??[])].some(id=>members.has(id)))fail('detach the profile before constraining its individual members.');
    for(const d of s.dimensions)if(d.entityIds.some(id=>members.has(id)))fail('edit profile parameters instead of dimensioning controlled members.');
  };
  check(sketch);
  if(action){
    if(!action||typeof action!=='object'||Object.getPrototypeOf(action)!==Object.prototype||Object.values(Object.getOwnPropertyDescriptors(action)).some(d=>!('value'in d)))fail('expected a plain edit action.');
    const keys=action.kind==='add-profile'||action.kind==='edit-profile'?'kind profile':action.kind==='construction'?'kind ids enabled':'kind id';
    if(!isProfileAction(action)||Object.keys(action).sort().join(',')!==keys.split(' ').sort().join(','))fail('unknown or malformed action.');
  }
  const value=structuredClone(sketch);if(!action)return value;
  const profiles=value.profiles??[];
  const find=(id:string)=>profiles.find(p=>p.id===id)??fail('select an existing profile.');
  if(action.kind==='add-profile'||action.kind==='edit-profile'){
    const materialized=evaluate(action.profile),p=structuredClone(action.profile);
    if(action.kind==='add-profile'){
      const occupied=new Set([...usedIds,...value.entities.map(e=>e.id),...profiles.map(p=>p.id)]);
      if([p.id,...p.entityIds].some(id=>occupied.has(id)))fail('a profile or member ID is already used.');
      value.entities.push(...materialized.entities);value.profiles=[...profiles,p];
    }else{
      const old=find(p.id);
      if(old.kind!==p.kind||JSON.stringify(old.entityIds)!==JSON.stringify(p.entityIds)||(old.kind==='regular-polygon'&&p.kind==='regular-polygon'&&old.sides!==p.sides))fail('editing must preserve kind, member order and side count.');
      const replacements=new Map(materialized.entities.map(e=>[e.id,e]));value.entities=value.entities.map(e=>replacements.get(e.id)??e);value.profiles=profiles.map(source=>source.id===p.id?p:source);
    }
  }else if(action.kind==='detach-profile'||action.kind==='remove-profile'){
    const profile=find(action.id),ids=new Set(profile.entityIds);
    if(action.kind==='detach-profile'){const replacements=new Map(evaluate(profile).entities.map(e=>[e.id,e]));value.entities=value.entities.map(e=>replacements.get(e.id)??e);}
    else value.entities=value.entities.filter(e=>!ids.has(e.id));
    value.profiles=profiles.filter(p=>p.id!==action.id);
  }else if(action.kind==='construction'){
    if(typeof action.enabled!=='boolean'||!Array.isArray(action.ids)||!action.ids.length||new Set(action.ids).size!==action.ids.length||action.ids.some(id=>!value.entities.some(e=>e.id===id)))fail('select existing unique geometry to change construction mode.');
    const ids=new Set(action.ids);
    for(const profile of profiles){const touched=profile.entityIds.filter(id=>ids.has(id)).length;if(touched&&touched!==profile.entityIds.length)fail('select every member of a controlled profile.');if(touched)profile.construction=action.enabled;}
    for(const e of value.entities)if(ids.has(e.id))e.construction=action.enabled;
  }
  check(value);return value;
}
