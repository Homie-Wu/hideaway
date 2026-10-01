import * as THREE from 'three';
import type { VoxelModel } from '../contracts.ts';
import { cloneModel, modelBounds, validateModel, createDefaultModel, createPresetModel } from './model.ts';
import { createModelView, disposeModelView } from './meshing.ts';
import { translate, localizeElement, onLanguageChange } from '../i18n.ts';

export interface SavedModel {id:string;name:string;model:VoxelModel;thumbnail:string;updated:number;}
const KEY='hideaway.models.v1';
let sceneModelProvider:()=>VoxelModel[]=()=>[];
const activeLibraries=new WeakMap<HTMLElement,(notifyClose?:boolean)=>void>();
const thumbnails=new Map<string,string>();
function thumbnailKey(model:VoxelModel):string{
  // Names and generated part IDs do not change the native image. Keep only a compact content key.
  const content=JSON.stringify([model.pivot,model.parts.map(part=>[part.position,part.rotation,part.cells])]);
  let a=2166136261,b=2246822519;
  for(let i=0;i<content.length;i++){const char=content.charCodeAt(i);a=Math.imul(a^char,16777619);b=Math.imul(b^char,3266489917);}
  return `${content.length}:${a>>>0}:${b>>>0}`;
}
export function setSceneModelProvider(provider:()=>VoxelModel[]):void{sceneModelProvider=provider;}
/** A fresh snapshot reflects the current randomized world and protects its source models. */
export function listSceneModels():VoxelModel[]{return sceneModelProvider().filter(model=>validateModel(model).valid).map(cloneModel);}
export async function listModels():Promise<SavedModel[]>{
  const raw=localStorage.getItem(KEY);if(!raw)return [];let rows:unknown;try{rows=JSON.parse(raw);}catch{throw new Error('模型库数据无法读取，请检查浏览器本地存储');}
  if(!Array.isArray(rows))throw new Error('模型库格式无效');
  return rows.filter((r):r is SavedModel=>!!r&&typeof r==='object'&&typeof r.id==='string'&&typeof r.name==='string'&&validateModel(r.model).valid).sort((a,b)=>b.updated-a.updated);
}
export async function saveModel(model:VoxelModel,thumbnail?:string):Promise<void>{
  const result=validateModel(model);if(!result.valid)throw new Error(result.reason);const models=await listModels(),name=model.name.trim().slice(0,32)||'未命名模型';
  const previous=models.find(m=>m.name===name),id=previous?.id??globalThis.crypto.randomUUID();
  const entry:SavedModel={id,name,model:cloneModel({...model,name,version:2}),thumbnail:thumbnail??makeThumbnail(model),updated:Date.now()};
  localStorage.setItem(KEY,JSON.stringify([entry,...models.filter(m=>m.id!==id)]));
}
export async function deleteModel(id:string):Promise<void>{const models=await listModels();localStorage.setItem(KEY,JSON.stringify(models.filter(m=>m.id!==id)));}
/** Geometry-derived thumbnail; no WebGL context or asset download is required. */
export function makeThumbnail(model:VoxelModel):string{
  const key=thumbnailKey(model),cached=thumbnails.get(key);if(cached!==undefined)return cached;
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;const ctx=canvas.getContext('2d');if(!ctx)return '';
  ctx.fillStyle='#e5e6d7';ctx.fillRect(0,0,320,240);const bounds=modelBounds(model),height=bounds.max[1]-bounds.min[1];const scale=Math.min(8,180/Math.max(4,height+(bounds.max[0]-bounds.min[0]+bounds.max[2]-bounds.min[2])*.3));
  const camera=new THREE.PerspectiveCamera(35,4/3,.1,200);const center=new THREE.Vector3(...bounds.min).add(new THREE.Vector3(...bounds.max)).multiplyScalar(.5);camera.position.copy(center).add(new THREE.Vector3(45,35,45));camera.lookAt(center);camera.updateMatrixWorld();
  const view=createModelView(model);view.updateMatrixWorld(true);const triangles:{pts:THREE.Vector3[];depth:number;color:string}[]=[];const normal=new THREE.Vector3(),v=new THREE.Vector3(),color=new THREE.Color();
  for(const object of view.children){const mesh=object as THREE.Mesh,geometry=mesh.geometry,position=geometry.getAttribute('position'),colors=geometry.getAttribute('color'),normals=geometry.getAttribute('normal');
    for(let i=0;i<position.count;i+=3){normal.fromBufferAttribute(normals,i).transformDirection(mesh.matrixWorld);if(normal.dot(new THREE.Vector3(45,35,45))<=0)continue;
      const pts:THREE.Vector3[]=[];let depth=0;for(let j=0;j<3;j++){v.fromBufferAttribute(position,i+j).applyMatrix4(mesh.matrixWorld).sub(center);depth+=v.x+v.z+v.y*.3;pts.push(new THREE.Vector3(160+(v.x-v.z)*.707*scale,122+(v.x+v.z)*.34*scale-v.y*.88*scale,0));}
      color.fromBufferAttribute(colors,i);triangles.push({pts,depth,color:`#${color.getHexString()}`});
    }
  }
  ctx.save();ctx.translate(160,190);ctx.scale(1,.25);ctx.beginPath();ctx.ellipse(0,0,70,35,0,0,Math.PI*2);ctx.fillStyle='rgba(58,69,52,.11)';ctx.fill();ctx.restore();
  triangles.sort((a,b)=>a.depth-b.depth);for(const t of triangles){ctx.beginPath();ctx.moveTo(t.pts[0].x,t.pts[0].y);ctx.lineTo(t.pts[1].x,t.pts[1].y);ctx.lineTo(t.pts[2].x,t.pts[2].y);ctx.closePath();ctx.fillStyle=t.color;ctx.fill();ctx.strokeStyle=t.color;ctx.lineWidth=.45;ctx.stroke();}disposeModelView(view);const thumbnail=canvas.toDataURL('image/png');
  if(thumbnails.size>=128)thumbnails.delete(thumbnails.keys().next().value!);thumbnails.set(key,thumbnail);return thumbnail;
}
export interface ModelLibraryOptions {onClose?:()=>void;onEdit?:(model:VoxelModel)=>void;}
export async function openModelLibrary(container:HTMLElement,onLoad:(model:VoxelModel)=>void,notify:(message:string)=>void=()=>{},options:ModelLibraryOptions={}):Promise<()=>void>{
  activeLibraries.get(container)?.(false);container.querySelector('.voxel-library')?.remove();const panel=document.createElement('section');panel.className='voxel-library';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','模型库');
  panel.innerHTML='<header><div><span class="ve-eyebrow">VOXEL COLLECTION</span><h2>模型库</h2></div><button class="ve-close" aria-label="关闭模型库">×</button></header><div class="ve-tabs" role="group" aria-label="模型分类"><button data-category="saved" aria-pressed="true">我的模型</button><button data-category="scene" aria-pressed="false">场景物件</button><button data-category="preset" aria-pressed="false">基础预设</button></div><p class="ve-note">按原尺寸使用 · 游戏中按 Tab 编辑，保存到「我的模型」。</p><div class="ve-library-grid"></div>';container.append(panel);
  localizeElement(panel);
  let category:'saved'|'scene'|'preset'='saved',closed=false,generation=0,unsubscribe=()=>{};
  const close=(notifyClose=true)=>{if(closed)return;closed=true;generation++;unsubscribe();document.removeEventListener('keydown',escape,true);activeLibraries.delete(container);panel.remove();if(notifyClose)options.onClose?.()};
  const escape=(event:KeyboardEvent)=>{if(event.code==='Escape'){event.preventDefault();event.stopImmediatePropagation();close()}};document.addEventListener('keydown',escape,true);activeLibraries.set(container,close);
  panel.querySelector('.ve-close')!.addEventListener('click',()=>close());
  const yieldToInput=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
  const refresh=async()=>{if(closed)return;const current=++generation,selectedCategory=category,isCurrent=()=>!closed&&current===generation;const grid=panel.querySelector('.ve-library-grid')!;grid.replaceChildren();
    panel.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(button=>{const selected=button.dataset.category===category;button.setAttribute('aria-pressed',String(selected));button.classList.toggle('active',selected)});
    try{
      const entries:{model:VoxelModel;thumbnail?:string;id?:string}[]=selectedCategory==='saved'?await listModels():(selectedCategory==='scene'?[...sceneModelProvider()]:[createDefaultModel(),...['plant','book','crate','lamp','cup','chair'].map(createPresetModel)]).map(model=>({model}));
      if(!isCurrent())return;
      const pending:{model:VoxelModel;image:HTMLImageElement}[]=[];let cards=0,batchStart=performance.now();
      for(let i=0;i<entries.length;i++){
        if(!isCurrent())return;
        const source=entries[i];
        if(selectedCategory==='scene'&&!validateModel(source.model).valid)continue;
        const entry={...source,model:cloneModel(source.model)};
        const card=document.createElement('article');card.className='ve-model-card';const img=document.createElement('img');if(entry.thumbnail)img.src=entry.thumbnail;else pending.push({model:entry.model,image:img});const displayName=selectedCategory==='saved'?entry.model.name:translate(entry.model.name);img.alt=displayName;img.width=320;img.height=240;const title=document.createElement('h3');title.textContent=displayName;title.setAttribute('data-user-text','');
        const bounds=modelBounds(entry.model),size=bounds.max.map((v,axis)=>v-bounds.min[axis]);const sub=document.createElement('p');sub.textContent=translate(`${size.join(' × ')} · ${entry.model.parts.reduce((sum,p)=>sum+p.cells.length,0)} 体素`);const actions=document.createElement('div');
        const load=document.createElement('button');load.textContent=translate('使用模型');load.addEventListener('click',()=>{onLoad(cloneModel(entry.model));close()});actions.append(load);
        if(options.onEdit){const edit=document.createElement('button');edit.textContent=translate('使用并编辑');edit.addEventListener('click',()=>{options.onEdit!(cloneModel(entry.model));close()});actions.append(edit);}
        if(entry.id){const remove=document.createElement('button');remove.textContent=translate('删除');remove.className='ve-subtle';let confirmed=false;remove.addEventListener('click',async()=>{if(!confirmed){confirmed=true;remove.textContent=translate('再次点击删除');return;}try{await deleteModel(entry.id!);if(isCurrent())await refresh();}catch{if(isCurrent())notify(translate('删除失败，请检查浏览器存储权限'));}});actions.append(remove);}
        card.append(img,title,sub,actions);grid.append(card);cards++;
        if(i+1<entries.length&&(cards%4===0||performance.now()-batchStart>=8)){await yieldToInput();batchStart=performance.now();}
      }
      if(!cards){const empty=document.createElement('p');empty.className='ve-empty';empty.textContent=translate(selectedCategory==='scene'?'当前场景没有可模仿物件。':'这里还没有收藏。进入练习模式，制作并保存你的第一件伪装。');grid.append(empty);}
      // Cards can already be used; each thumbnail gets its own task so input remains responsive.
      for(const entry of pending){await yieldToInput();if(!isCurrent())return;entry.image.src=makeThumbnail(entry.model);}
    }catch(error){if(isCurrent())notify(translate(error instanceof Error?error.message:'模型库读取失败'));}
  };
  panel.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(button=>button.addEventListener('click',()=>{category=button.dataset.category as typeof category;void refresh()}));
  unsubscribe=onLanguageChange(()=>{
    panel.setAttribute('aria-label',translate('模型库'));
    const heading=panel.querySelector('h2');if(heading)heading.textContent=translate('模型库');
    panel.querySelector('.ve-close')?.setAttribute('aria-label',translate('关闭模型库'));
    panel.querySelector('.ve-tabs')?.setAttribute('aria-label',translate('模型分类'));
    const names:Record<string,string>={saved:'我的模型',scene:'场景物件',preset:'基础预设'};
    panel.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(button=>button.textContent=translate(names[button.dataset.category!]));
    const note=panel.querySelector('.ve-note');if(note)note.textContent=translate('按原尺寸使用 · 游戏中按 Tab 编辑，保存到「我的模型」。');
    void refresh();
  });
  void refresh();return ()=>close();
}
