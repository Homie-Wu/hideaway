import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { EditorHooks, VoxelModel, VoxelPart, Vec3 } from '../contracts.ts';
import { cloneModel, createDefaultModel, createPresetModel, DEFAULT_COLOR, modelBounds, modelVolume, partMatrix, validateModel } from './model.ts';
import { createModelView, updateModelView, disposeModelView } from './meshing.ts';
import { ModelHistory, editVolume, volumeRange, splitSelection, duplicateSelection, mergeParts, transformPart, snapPart, autoSnapPart } from './operations.ts';
import { saveModel, openModelLibrary } from './storage.ts';
import { faceColor, normalFace, paintSurface, floodSurface, surfaceCells, FACE_NORMALS } from './surfaces.ts';
import './editor.css';
import { translate, onLanguageChange } from '../i18n.ts';

type Tab='geometry'|'paint'|'selection';
interface Pick { cell:Vec3;partId:string;normal:THREE.Vector3;mesh:THREE.Mesh; }
interface Drag { start:Vec3;end:Vec3;partId:string;mode:'add'|'remove'|'selection';plane:THREE.Plane;inverse:THREE.Matrix4;axis:number;depth:number; }
interface Selection {partId:string;a:Vec3;b:Vec3;}
const palette=['#b6c793','#718a65','#486855','#ded4b4','#ad8666','#745748','#d5a185','#af6870','#738d9c','#434b50','#f0eddf','#8b8498'];
const labels:Record<Tab,string>={geometry:'几何',paint:'涂色',selection:'选择'};
const clamp=(n:number)=>Math.max(0,Math.min(31,Math.floor(n)));
const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

export class VoxelEditor {
  active=false;
  private scene:THREE.Scene;private camera:THREE.PerspectiveCamera;private canvas:HTMLCanvasElement;private hooks:EditorHooks;private container:HTMLElement;
  private panel:HTMLElement;private hint:HTMLElement;private history:ModelHistory;private root=new THREE.Group();private view:THREE.Group;
  private preview=new THREE.Group();private selectionBox=new THREE.Group();private frame:THREE.LineSegments;private grid:THREE.GridHelper;private pivotMark:THREE.AxesHelper;
  private raycaster=new THREE.Raycaster();private pointer=new THREE.Vector2();private tab:Tab='geometry';private color=DEFAULT_COLOR;private recent:string[]=[];private brushSize=1;private bucket=false;
  private partId='';private selection:Selection|null=null;private drag:Drag|null=null;private orbit=false;private lastX=0;private lastY=0;private yaw=.7;private pitch=.55;private distance=65;private target=new THREE.Vector3();
  private shift=false;private painting=false;private paintBase:VoxelModel|null=null;private paintCandidate:VoxelModel|null=null;private erase=false;private rejectUntil=0;private hovered:Pick|null=null;
  private transformBase:VoxelModel|null=null;private transformId='';private transformCandidate:VoxelModel|null=null;private transformMode:'move'|'rotate'='move';private transformAxis:'x'|'y'|'z'='x';
  private libraryClose:(()=>void)|null=null;
  private controls:TransformControls;private transformProxy=new THREE.Object3D();private transformCenter=new THREE.Vector3();private gizmoDragging=false;
  private surfacePreview=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({color:0xffd48d,transparent:true,opacity:.52,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2}));
  private partOutline=new THREE.Group();private outlinePart='';private invalidView:THREE.Group|null=null;
  constructor(scene:THREE.Scene,camera:THREE.PerspectiveCamera,canvas:HTMLCanvasElement,container:HTMLElement,hooks:EditorHooks){
    this.scene=scene;this.camera=camera;camera.layers.enable(2);this.raycaster.layers.enable(2);this.canvas=canvas;this.container=container;this.hooks=hooks;this.history=new ModelHistory(createDefaultModel(),hooks.validate);this.view=createModelView(this.history.model);
    (this.view.userData.voxelState.material as THREE.Material).visible=false;this.root.add(this.view);this.root.visible=false;scene.add(this.root);
    const box=new THREE.BoxGeometry(1,1,1),edge=new THREE.EdgesGeometry(box);
    for(const [group,color,opacity] of [[this.preview,0xc8e8ac,.16],[this.selectionBox,0xffd5a1,.07]] as const){group.add(new THREE.Mesh(box,new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false})),new THREE.LineSegments(edge,new THREE.LineBasicMaterial({color,transparent:true,opacity:.95,depthTest:false})));group.visible=false;group.renderOrder=10;this.root.add(group);}
    this.frame=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(32,32,32)),new THREE.LineBasicMaterial({color:0xc6d5ae,transparent:true,opacity:.25}));this.root.add(this.frame);
    this.grid=new THREE.GridHelper(32,32,0xb9cda3,0x9db38c);(this.grid.material as THREE.Material).transparent=true;(this.grid.material as THREE.Material).opacity=.2;this.root.add(this.grid);
    this.pivotMark=new THREE.AxesHelper(4);this.pivotMark.position.y=.04;this.root.add(this.pivotMark);
    this.root.add(this.surfacePreview,this.partOutline,this.transformProxy);this.surfacePreview.visible=false;
    // Route all pointer input ourselves so orbit, paint, selection and handles never share a gesture.
    this.controls=new TransformControls(camera);this.controls.getRaycaster().layers.enable(2);this.controls.getHelper().traverse(o=>o.layers.set(2));this.controls.setSize(.8);this.controls.setSpace('local');scene.add(this.controls.getHelper());this.controls.detach();
    this.controls.addEventListener('objectChange',()=>{if(this.gizmoDragging)this.previewGizmo();});
    this.panel=document.createElement('aside');this.panel.className='voxel-editor';this.panel.hidden=true;this.panel.setAttribute('aria-label',translate('体素建模工具'));container.append(this.panel);
    this.hint=document.createElement('div');this.hint.className='voxel-editor-hint';this.hint.hidden=true;container.append(this.hint);
    canvas.addEventListener('contextmenu',e=>{if(this.active)e.preventDefault();});
    canvas.addEventListener('pointerdown',this.onDown,{capture:true});window.addEventListener('pointermove',this.onMove);window.addEventListener('pointerup',this.onUp);
    canvas.addEventListener('wheel',this.onWheel,{passive:false,capture:true});window.addEventListener('keydown',this.onKey,{capture:true});window.addEventListener('keyup',e=>{this.shift=e.shiftKey;this.updateTransformSnap();});
    onLanguageChange(()=>{this.panel.setAttribute('aria-label',translate('体素建模工具'));if(this.active)this.renderUI();});
    window.addEventListener('blur',()=>{this.orbit=false;this.drag=null;this.shift=false;if(this.paintBase||this.transformBase)this.cancelPreview();});
  }
  get model():VoxelModel{return cloneModel(this.history.model);}
  get cameraTarget():THREE.Vector3{return this.target.clone();}
  open(model:VoxelModel):void{
    this.rejectUntil=0;this.panel.classList.remove('ve-rejected');this.preview.visible=false;this.surfacePreview.visible=false;
    this.history=new ModelHistory(model,this.hooks.validate);this.partId=model.parts[0]?.id??'';this.selection=null;this.active=true;this.root.visible=true;this.panel.hidden=false;this.hint.hidden=false;document.exitPointerLock?.();
    this.yaw=this.hooks.getYaw()+Math.PI/4;this.pitch=.48;const b=modelBounds(model);this.distance=Math.max(45,new THREE.Vector3(...b.max).sub(new THREE.Vector3(...b.min)).length()*2.4);this.refresh();this.updateCamera();
  }
  close():void{if(!this.active)return;this.libraryClose?.();this.libraryClose=null;this.cancelPreview();this.active=false;this.controls.detach();this.root.visible=false;this.panel.hidden=true;this.hint.hidden=true;this.drag=null;this.orbit=false;this.hooks.onClose();}
  load(model:VoxelModel):boolean{return this.commit(cloneModel(model));}
  update(_dt:number):void{
    if(!this.active)return;this.root.position.copy(this.hooks.getPosition());this.root.rotation.y=this.hooks.getYaw();this.root.traverse(o=>o.layers.set(2));this.root.updateMatrixWorld(true);this.updateCamera();
    if(this.rejectUntil&&performance.now()>this.rejectUntil){this.rejectUntil=0;this.panel.classList.remove('ve-rejected');if(!this.drag&&!this.hovered)this.preview.visible=false;this.setPreviewColor(0xc8e8ac);}
  }
  private updateCamera():void{
    const model=this.history.model,b=modelBounds(model);this.target.set((b.min[0]+b.max[0])*.5,(b.min[1]+b.max[1])*.5,(b.min[2]+b.max[2])*.5).applyAxisAngle(new THREE.Vector3(0,1,0),this.hooks.getYaw()).add(this.hooks.getPosition());
    this.camera.position.set(this.target.x+Math.sin(this.yaw)*Math.cos(this.pitch)*this.distance,this.target.y+Math.sin(this.pitch)*this.distance,this.target.z+Math.cos(this.yaw)*Math.cos(this.pitch)*this.distance);this.camera.lookAt(this.target);this.camera.updateMatrixWorld(true);
  }
  private currentPart(model=this.history.model):VoxelPart{return model.parts.find(p=>p.id===this.partId)??model.parts[0];}
  private refresh():void{
    const model=this.history.model;if(!model.parts.some(p=>p.id===this.partId))this.partId=model.parts[0]?.id??'';
    updateModelView(this.view,model);this.root.position.copy(this.hooks.getPosition());this.root.rotation.y=this.hooks.getYaw();this.frame.position.set(16-model.pivot[0],16-model.pivot[1],16-model.pivot[2]);this.grid.position.set(16-model.pivot[0],-model.pivot[1]+.02,16-model.pivot[2]);this.root.traverse(o=>o.layers.set(2));this.root.updateMatrixWorld(true);this.outlinePart='';this.drawSelection();this.renderUI();
  }
  private commit(candidate:VoxelModel):boolean{
    candidate.parts=candidate.parts.filter(p=>p.cells.length);const result=this.history.commit(candidate);if(!result.valid){this.reject(result.reason??'无法执行此操作');updateModelView(this.view,this.history.model);this.hooks.onChange(cloneModel(this.history.model));return false;}
    this.hooks.onChange(cloneModel(this.history.model));this.refresh();return true;
  }
  private mutate(action:(model:VoxelModel)=>void):boolean{const model=cloneModel(this.history.model);action(model);return this.commit(model);}
  private reject(message:string):void{this.rejectUntil=performance.now()+1200;this.panel.classList.add('ve-rejected');this.setPreviewColor(0xf38675);this.notify(message);this.hint.textContent=translate(message);}
  private undo(redo=false):void{const result=redo?this.history.redo():this.history.undo();if(!result.valid){this.reject(result.reason??'操作被阻挡');return;}this.selection=null;this.hooks.onChange(cloneModel(this.history.model));this.refresh();}
  private pointRay(e:PointerEvent|WheelEvent):void{const rect=this.canvas.getBoundingClientRect();this.pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);}
  private pick(e:PointerEvent,add=false):Pick|null{
    this.pointRay(e);const hit=this.raycaster.intersectObjects(this.view.children,false)[0];if(!hit||!hit.face)return null;
    const mesh=hit.object as THREE.Mesh,normal=hit.face.normal.clone(),point=mesh.worldToLocal(hit.point.clone()).addScaledVector(normal,add?.015:-.015);
    return {cell:[Math.floor(point.x),Math.floor(point.y),Math.floor(point.z)],partId:mesh.userData.partId as string,normal,mesh};
  }
  private onDown=(e:PointerEvent):void=>{
    if(!this.active)return;e.preventDefault();e.stopImmediatePropagation();this.canvas.setPointerCapture(e.pointerId);this.shift=e.shiftKey;this.lastX=e.clientX;this.lastY=e.clientY;
    if(this.tab==='selection'&&e.button===0&&this.controls.object){const pointer=this.controlPointer(e);this.updateTransformSnap();this.controls.pointerHover(pointer);if(this.controls.axis){this.beginGizmo();this.controls.pointerDown(pointer);this.gizmoDragging=this.controls.dragging;return;}}
    if(e.button===1){this.orbit=true;return;}if(e.button!==0&&e.button!==2)return;
    const add=this.tab==='geometry'&&e.button===0,pick=this.pick(e,add);if(!pick)return;this.partId=pick.partId;this.hovered=pick;
    if(this.tab==='paint'){
      if(e.altKey&&e.button===0){const p=this.currentPart(),c=p.cells.find(c=>c.x===pick.cell[0]&&c.y===pick.cell[1]&&c.z===pick.cell[2]);if(c){this.color=faceColor(c,normalFace(pick.normal));this.renderUI();}return;}
      if(this.bucket){this.mutate(model=>floodSurface(model,this.partId,pick.cell,normalFace(pick.normal),e.button===2?null:this.color,c=>this.faceVisible(pick,c)));this.rememberColor();return;}
      this.paintBase=cloneModel(this.history.model);this.paintCandidate=cloneModel(this.history.model);this.painting=true;this.erase=e.button===2;this.paintAt(pick);return;
    }
    if(e.shiftKey||this.tab==='selection'){
      const axis=Math.abs(pick.normal.x)>.5?0:Math.abs(pick.normal.y)>.5?1:2;
      this.drag={start:pick.cell,end:[...pick.cell],partId:pick.partId,mode:this.tab==='selection'?'selection':add?'add':'remove',plane:new THREE.Plane().setFromNormalAndCoplanarPoint(pick.normal,new THREE.Vector3(...pick.cell).addScalar(.5)),inverse:pick.mesh.matrixWorld.clone().invert(),axis,depth:0};this.showBox(this.preview,pick.cell,pick.cell,pick.partId);this.setPreviewColor(this.drag.mode==='remove'?0xefaa92:this.drag.mode==='selection'?0xffd5a1:0xc8e8ac);this.hint.textContent=translate('拖动确定宽高 · 滚轮伸展第三维 · 松开确认 · Esc 取消');
    }else this.mutate(model=>editVolume(model,pick.partId,pick.cell,pick.cell,add?'add':'remove',this.color));
  };
  private onMove=(e:PointerEvent):void=>{
    if(!this.active)return;this.shift=e.shiftKey;
    if(this.gizmoDragging){this.updateTransformSnap();this.controls.pointerMove(this.controlPointer(e,-1));return;}
    if(this.orbit){this.yaw-=(e.clientX-this.lastX)*.008;this.pitch=THREE.MathUtils.clamp(this.pitch+(e.clientY-this.lastY)*.006,-.1,1.4);this.lastX=e.clientX;this.lastY=e.clientY;this.updateCamera();return;}
    if(this.drag){this.pointRay(e);const localRay=this.raycaster.ray.clone().applyMatrix4(this.drag.inverse),point=localRay.intersectPlane(this.drag.plane,new THREE.Vector3());if(point){const end=point.toArray().map(clamp) as Vec3;end[this.drag.axis]=clamp(this.drag.start[this.drag.axis]+this.drag.depth);this.drag.end=end;this.showBox(this.preview,this.drag.start,end,this.drag.partId);const {min,max}=volumeRange(this.drag.start,end);this.hint.textContent=translate(`${max[0]-min[0]+1} × ${max[1]-min[1]+1} × ${max[2]-min[2]+1} 体素 · 滚轮调整深度 · 松开确认 · Esc 取消`); }return;}
    if(this.painting){const pick=this.pick(e);if(pick)this.paintAt(pick);return;}
    if(e.target!==this.canvas){this.hovered=null;this.surfacePreview.visible=false;if(!this.rejectUntil)this.preview.visible=false;return;}
    if(this.tab==='selection'&&this.controls.object){this.controls.pointerHover(this.controlPointer(e));if(this.controls.axis){this.preview.visible=false;return;}}
    this.hovered=this.pick(e,this.tab==='geometry');this.preview.visible=false;this.surfacePreview.visible=false;
    if(this.hovered){if(this.tab==='paint')this.showSurface(this.hovered);else if(this.tab==='selection')this.showPartOutline(this.hovered.partId);else{const p=this.hovered.cell;this.showBox(this.preview,p,p,this.hovered.partId);if(!this.rejectUntil)this.setPreviewColor(0xc8e8ac);}}
  };
  private onUp=(_e:PointerEvent):void=>{
    if(!this.active)return;this.orbit=false;
    if(this.gizmoDragging){this.controls.pointerUp(this.controlPointer(_e,0));this.gizmoDragging=false;this.endTransform();return;}
    if(this.drag){const d=this.drag;this.drag=null;if(d.mode==='selection'){this.selection={partId:d.partId,a:d.start,b:d.end};this.partId=d.partId;if(d.start.every((n,i)=>n===d.end[i]))this.selectAll();else{this.drawSelection();this.renderUI();}}else{const mode=d.mode;this.mutate(model=>editVolume(model,d.partId,d.start,d.end,mode,this.color));}this.preview.visible=false;}
    if(this.painting){this.painting=false;const candidate=this.paintCandidate;this.paintBase=null;this.paintCandidate=null;if(candidate)this.commit(candidate);this.rememberColor();}
  };
  private onWheel=(e:WheelEvent):void=>{
    if(!this.active)return;e.preventDefault();e.stopImmediatePropagation();if(this.gizmoDragging)return;
    if(this.drag){const d=this.drag;d.depth=THREE.MathUtils.clamp(d.depth+(e.deltaY<0?1:-1),-31,31);d.end[d.axis]=clamp(d.start[d.axis]+d.depth);this.showBox(this.preview,d.start,d.end,d.partId);const {min,max}=volumeRange(d.start,d.end);this.hint.textContent=translate(`${max[0]-min[0]+1} × ${max[1]-min[1]+1} × ${max[2]-min[2]+1} 体素 · 滚轮调整深度 · 松开确认`);}
    else{this.distance=THREE.MathUtils.clamp(this.distance*Math.exp(e.deltaY*.001),20,140);this.updateCamera();}
  };
  private onKey=(e:KeyboardEvent):void=>{
    if(!this.active)return;this.shift=e.shiftKey;this.updateTransformSnap();if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement||e.target instanceof HTMLTextAreaElement){if(e.code!=='Escape')return;}
    if(e.code==='Tab'){e.preventDefault();e.stopImmediatePropagation();this.close();return;}
    if(e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(this.libraryClose&&this.container.querySelector('.voxel-library')){this.libraryClose();this.libraryClose=null;return;}if(this.drag||this.painting||this.transformBase){this.drag=null;this.cancelPreview();this.preview.visible=false;this.renderUI();}else this.close();return;}
    if((e.ctrlKey||e.metaKey)&&e.code==='KeyZ'){e.preventDefault();e.stopImmediatePropagation();if(this.transformBase||this.painting||this.drag){this.drag=null;this.cancelPreview();this.preview.visible=false;this.renderUI();}else this.undo(e.shiftKey);return;}
    if((e.ctrlKey||e.metaKey)&&e.code==='KeyY'){e.preventDefault();e.stopImmediatePropagation();this.undo(true);return;}
    if(e.code==='Delete'&&this.tab==='selection'){e.preventDefault();e.stopImmediatePropagation();this.selectionAction('delete');}
  };
  private paintAt(pick:Pick):void{
    if(!this.paintCandidate)return;
    paintSurface(this.paintCandidate,pick.partId,pick.cell,normalFace(pick.normal),this.erase?null:this.color,this.brushSize,c=>this.faceVisible(pick,c));const check=this.hooks.validate(this.paintCandidate,this.history.model);if(!check.valid){this.reject(check.reason??'涂色被阻挡');return;}updateModelView(this.view,this.paintCandidate);this.hooks.onChange(cloneModel(this.paintCandidate));this.showSurface(pick);
  }
  private cancelPreview():void{
    this.paintBase=null;this.paintCandidate=null;this.painting=false;this.transformBase=null;this.transformCandidate=null;this.gizmoDragging=false;this.controls.dragging=false;this.controls.axis=null;this.clearInvalidView();updateModelView(this.view,this.history.model);this.hooks.onChange(cloneModel(this.history.model));this.outlinePart='';this.drawSelection();this.syncGizmo();
  }
  private rememberColor():void{this.recent=[this.color,...this.recent.filter(c=>c!==this.color)].slice(0,8);if(this.tab==='paint')this.renderUI();}
  private showBox(group:THREE.Group,a:Vec3,b:Vec3,partId:string):void{
    const part=this.history.model.parts.find(p=>p.id===partId);if(!part){group.visible=false;return;}const {min,max}=volumeRange(a,b);group.visible=true;group.position.set((min[0]+max[0]+1)/2,(min[1]+max[1]+1)/2,(min[2]+max[2]+1)/2).applyMatrix4(partMatrix(part)).sub(new THREE.Vector3(...this.history.model.pivot));group.rotation.set(...part.rotation);group.scale.set(max[0]-min[0]+1.015,max[1]-min[1]+1.015,max[2]-min[2]+1.015);
  }
  private setPreviewColor(color:number):void{for(const c of this.preview.children)((c as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(color);}
  private faceVisible(pick:Pick,cell:{x:number;y:number;z:number}):boolean{
    const point=new THREE.Vector3(cell.x+.5,cell.y+.5,cell.z+.5).addScaledVector(pick.normal,.502).applyMatrix4(pick.mesh.matrixWorld),direction=point.clone().sub(this.camera.position),distance=direction.length();
    const ray=new THREE.Raycaster(this.camera.position,direction.normalize(),0,distance+.03);ray.layers.enable(2);const hit=ray.intersectObjects(this.view.children,false)[0];
    return !hit||hit.distance>=distance-.04;
  }
  private showSurface(pick:Pick):void{
    const p=(this.paintCandidate??this.history.model).parts.find(p=>p.id===pick.partId);if(!p)return;const face=normalFace(pick.normal),axis=FACE_NORMALS[face].findIndex(v=>v!==0),u=(axis+1)%3,v=(axis+2)%3,positions:number[]=[];
    for(const cell of surfaceCells(p,pick.cell,face,this.brushSize)){if(!this.faceVisible(pick,cell))continue;const origin=[cell.x,cell.y,cell.z];origin[axis]+=FACE_NORMALS[face][axis]>0?1.012:-.012;
      for(const [a,b] of [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]]){const point=[...origin];point[u]+=a;point[v]+=b;positions.push(...point);}}
    this.surfacePreview.geometry.dispose();this.surfacePreview.geometry=new THREE.BufferGeometry();this.surfacePreview.geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    this.surfacePreview.position.set(p.position[0]-this.history.model.pivot[0],p.position[1]-this.history.model.pivot[1],p.position[2]-this.history.model.pivot[2]);this.surfacePreview.rotation.set(...p.rotation);this.surfacePreview.material.color.set(this.color);this.surfacePreview.visible=true;this.preview.visible=false;
  }
  private showPartOutline(partId:string):void{
    this.partOutline.visible=this.tab==='selection';if(this.outlinePart===partId)return;this.outlinePart=partId;
    for(const c of this.partOutline.children){const line=c as THREE.LineSegments;line.geometry.dispose();(line.material as THREE.Material).dispose();}this.partOutline.clear();
    for(const object of this.view.children){if(object.userData.partId!==partId)continue;const mesh=object as THREE.Mesh,line=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:0xffce7b,transparent:true,opacity:.95,depthTest:false}));line.position.copy(mesh.position);line.quaternion.copy(mesh.quaternion);line.renderOrder=12;this.partOutline.add(line);}
  }
  private controlPointer(e:PointerEvent,button=e.button):PointerEvent{const rect=this.canvas.getBoundingClientRect();return {x:(e.clientX-rect.left)/rect.width*2-1,y:-(e.clientY-rect.top)/rect.height*2+1,button} as unknown as PointerEvent;}
  private updateTransformSnap():void{this.controls.setTranslationSnap(null);this.controls.setRotationSnap(this.shift?null:Math.PI/12);}
  private syncGizmo():void{
    if(!this.active||this.tab!=='selection'||!this.selection||this.gizmoDragging){if(!this.gizmoDragging)this.controls.detach();return;}
    const p=this.currentPart();if(!p)return;const cells=this.selection?.partId===p.id?p.cells.filter(c=>c.x>=Math.min(this.selection!.a[0],this.selection!.b[0])&&c.x<=Math.max(this.selection!.a[0],this.selection!.b[0])&&c.y>=Math.min(this.selection!.a[1],this.selection!.b[1])&&c.y<=Math.max(this.selection!.a[1],this.selection!.b[1])&&c.z>=Math.min(this.selection!.a[2],this.selection!.b[2])&&c.z<=Math.max(this.selection!.a[2],this.selection!.b[2])):p.cells;
    if(!cells.length){this.controls.detach();return;}const box=new THREE.Box3();for(const c of cells){box.expandByPoint(new THREE.Vector3(c.x,c.y,c.z));box.expandByPoint(new THREE.Vector3(c.x+1,c.y+1,c.z+1));}box.getCenter(this.transformCenter);
    this.transformProxy.position.copy(this.transformCenter).applyMatrix4(partMatrix(p)).sub(new THREE.Vector3(...this.history.model.pivot));this.transformProxy.rotation.set(...p.rotation);this.transformProxy.updateMatrixWorld(true);this.controls.setMode(this.transformMode==='move'?'translate':'rotate');this.controls.attach(this.transformProxy);this.updateTransformSnap();
  }
  private beginGizmo():void{this.transformBase=cloneModel(this.history.model);this.transformId=this.selectedPart(this.transformBase);this.transformCandidate=null;this.preview.visible=false;this.surfacePreview.visible=false;this.hint.textContent=translate('拖动坐标轴 / 平面 · Shift 连续 · Esc 取消 · 松开确认');}
  private previewGizmo():void{
    if(!this.transformBase)return;const candidate=cloneModel(this.transformBase),p=candidate.parts.find(p=>p.id===this.transformId)!;
    p.rotation=this.transformProxy.rotation.toArray().slice(0,3) as Vec3;
    p.position=this.transformProxy.position.clone().add(new THREE.Vector3(...candidate.pivot)).sub(this.transformCenter.clone().applyQuaternion(this.transformProxy.quaternion)).toArray() as Vec3;
    if(!this.shift&&this.transformMode==='move')autoSnapPart(candidate,p.id,'move');this.applyTransformPreview(candidate);
  }
  private clearInvalidView():void{if(this.invalidView){this.root.remove(this.invalidView);disposeModelView(this.invalidView);this.invalidView=null;}}
  private applyTransformPreview(candidate:VoxelModel):void{
    const local=validateModel(candidate),check=local.valid?this.hooks.validate(candidate,this.history.model):local;this.clearInvalidView();
    if(!check.valid){this.transformCandidate=null;this.invalidView=createModelView(candidate);const material=this.invalidView.userData.voxelState.material as THREE.MeshStandardMaterial;material.color.set(0xf87868);material.vertexColors=false;material.transparent=true;material.opacity=.48;material.depthWrite=false;material.depthTest=false;material.wireframe=true;this.root.add(this.invalidView);updateModelView(this.view,this.history.model);this.hooks.onChange(cloneModel(this.history.model));this.reject(check.reason??'变换无效，松开不会提交');return;}
    this.transformCandidate=candidate;this.panel.classList.remove('ve-rejected');this.rejectUntil=0;updateModelView(this.view,candidate);this.hooks.onChange(cloneModel(candidate));this.outlinePart='';this.showPartOutline(this.transformId);this.hint.textContent=translate(`${this.shift?'连续变换':'移动 1 格 · 旋转 15°'} · Esc 取消 · 松开一次确认`);
  }
  private drawSelection():void{if(this.selection&&this.tab==='selection')this.showBox(this.selectionBox,this.selection.a,this.selection.b,this.selection.partId);else this.selectionBox.visible=false;this.partOutline.visible=this.tab==='selection';if(this.tab==='selection')this.showPartOutline(this.partId);}
  private selectAll():void{
    const p=this.currentPart();if(!p||!p.cells.length)return;const box=new THREE.Box3();for(const c of p.cells)box.expandByPoint(new THREE.Vector3(c.x,c.y,c.z));this.selection={partId:p.id,a:box.min.toArray() as Vec3,b:box.max.toArray() as Vec3};this.drawSelection();this.renderUI();
  }
  private selectedPart(model:VoxelModel):string{
    if(!this.selection)return this.partId;return splitSelection(model,this.selection.partId,this.selection.a,this.selection.b)??this.partId;
  }
  private selectionAction(action:'copy'|'delete'|'split'|'merge'):void{
    if(action==='merge'){if(this.mutate(mergeParts)){this.partId=this.history.model.parts[0].id;this.selection=null;this.refresh();this.notify('分件已合并；自由角度已烘焙到体素网格');}return;}
    if(!this.selection)this.selectAll();const s=this.selection;if(!s)return;
    let nextId=this.partId;
    const accepted=this.mutate(model=>{if(action==='delete')editVolume(model,s.partId,s.a,s.b,'remove');else if(action==='copy')nextId=duplicateSelection(model,s.partId,s.a,s.b)??nextId;else nextId=splitSelection(model,s.partId,s.a,s.b)??nextId;});
    if(accepted){this.partId=nextId;this.selection=null;this.refresh();if(action!=='delete')this.selectAll();}
  }
  private transformStep(mode:'move'|'rotate'|'mirror',axis:'x'|'y'|'z',direction:number,shift:boolean):void{
    let nextId=this.partId;const amount=mode==='move'?direction*(shift?.1:1):mode==='rotate'?THREE.MathUtils.degToRad(direction*(shift?1:15)):1;
    const accepted=this.mutate(model=>{nextId=this.selectedPart(model);transformPart(model,nextId,mode,axis,amount);if(!shift&&mode!=='mirror')autoSnapPart(model,nextId,mode);});if(accepted){this.partId=nextId;if(this.selection)this.selection.partId=nextId;this.refresh();}
  }
  private beginTransform(mode:'move'|'rotate',axis:'x'|'y'|'z'):void{this.transformBase=cloneModel(this.history.model);this.transformId=this.selectedPart(this.transformBase);this.transformMode=mode;this.transformAxis=axis;this.transformCandidate=null;}
  private previewTransform(value:number):void{
    if(!this.transformBase)return;const candidate=cloneModel(this.transformBase);const step=this.transformMode==='move'?1:15;const amount=this.shift?value:Math.round(value/step)*step;transformPart(candidate,this.transformId,this.transformMode,this.transformAxis,this.transformMode==='rotate'?THREE.MathUtils.degToRad(amount):amount);if(!this.shift)autoSnapPart(candidate,this.transformId,this.transformMode);
    this.applyTransformPreview(candidate);
    const output=this.panel.querySelector('[data-transform-value]');if(output)output.textContent=`${amount.toFixed(this.shift&&this.transformMode==='move'?1:0)}${this.transformMode==='rotate'?'°':translate(' 格')}`;
  }
  private endTransform():void{if(!this.transformBase)return;const candidate=this.transformCandidate;this.transformBase=null;this.transformCandidate=null;this.clearInvalidView();if(candidate){const id=this.transformId;if(this.commit(candidate)){this.partId=id;if(this.selection)this.selection.partId=id;this.refresh();}}else{this.hooks.onChange(cloneModel(this.history.model));this.refresh();}}
  private notify(message:string):void{this.hooks.notify(translate(message));}
  private localizeUI(root:Element):void{
    // Translate only UI text at the render boundary; preserve editable model data.
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    let node:Node|null;
    while((node=walker.nextNode())){
      if(node.parentElement?.closest('[data-part]'))continue;
      const source=node.textContent??'',trimmed=source.trim();
      if(trimmed)node.textContent=source.replace(trimmed,translate(trimmed));
    }
    root.querySelectorAll('[aria-label],[title]').forEach(element=>{
      for(const attribute of ['aria-label','title']){
        const source=element.getAttribute(attribute);if(source)element.setAttribute(attribute,translate(source));
      }
    });
  }
  private renderUI():void{
    const m=this.history.model,p=this.currentPart();const b=modelBounds(m);const dimensions=b.max.map((v,i)=>Math.ceil(v-b.min[i]));
    this.panel.innerHTML=`<header class="ve-header"><div><span class="ve-eyebrow">VOXEL WORKSHOP</span><h2>伪装工坊<span>32³</span></h2></div><button class="ve-close" data-action="close" title="退出建模 Tab">×</button></header><div class="ve-name-row"><input aria-label="模型名称" data-name maxlength="32" value="${escapeHtml(m.name)}"><button data-action="save" title="保存至本地模型库">保存</button></div><div class="ve-tabs" role="tablist">${(['geometry','paint','selection'] as Tab[]).map(t=>`<button role="tab" aria-selected="${t===this.tab}" data-tab="${t}" class="${t===this.tab?'active':''}">${labels[t]}</button>`).join('')}</div><div class="ve-content">${this.tab==='geometry'?this.geometryUI():this.tab==='paint'?this.paintUI():this.selectionUI()}</div><div class="ve-part"><label>当前分件<select data-part aria-label="当前分件">${m.parts.map(part=>`<option value="${part.id}"${part.id===p?.id?' selected':''}>${escapeHtml(part.name)} · ${part.cells.length}</option>`).join('')}</select></label></div><div class="ve-history"><button data-action="undo" ${this.history.canUndo?'':'disabled'}>↶ 撤销 <kbd>Ctrl Z</kbd></button><button data-action="redo" ${this.history.canRedo?'':'disabled'}>↷ 重做 <kbd>Ctrl Y</kbd></button></div><footer class="ve-footer"><span><strong>${modelVolume(m).toLocaleString()}</strong> 体素</span><span>${dimensions.join(' × ')} · ${m.parts.length} 件</span></footer>`;
    this.hint.innerHTML=`<span><kbd>中键拖动</kbd> 环绕视角</span><span><kbd>滚轮</kbd> 缩放</span><span><kbd>Tab</kbd> 继续探索</span>`;
    this.localizeUI(this.panel);this.localizeUI(this.hint);
    this.panel.dataset.mode=this.tab;
    this.panel.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button=>button.onclick=()=>{this.cancelPreview();this.tab=button.dataset.tab as Tab;this.preview.visible=false;this.surfacePreview.visible=false;this.drawSelection();this.renderUI();});
    this.panel.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button=>button.onclick=()=>this.action(button.dataset.action!));
    this.panel.querySelector<HTMLSelectElement>('[data-part]')!.onchange=e=>{this.partId=(e.target as HTMLSelectElement).value;this.selection=null;if(this.tab==='selection')this.selectAll();else{this.drawSelection();this.renderUI();}};
    this.panel.querySelector<HTMLInputElement>('[data-name]')!.onchange=e=>{this.history.model.name=(e.target as HTMLInputElement).value.trim()||'我的伪装';this.hooks.onChange(cloneModel(this.history.model));};
    if(this.tab==='paint')this.bindPaint();if(this.tab==='selection')this.bindSelection();this.syncGizmo();
    const preset=this.panel.querySelector<HTMLSelectElement>('[data-preset]');if(preset)preset.onchange=()=>{if(preset.value){const kind=preset.value;if(this.commit(kind==='base'?createDefaultModel():createPresetModel(kind)))this.selection=null;}};
  }
  private geometryUI():string{return `<div class="ve-tool-title"><span>逐格雕塑</span><span class="ve-pill">实时碰撞</span></div><div class="ve-instructions"><p><kbd>左键</kbd><span>增加体素</span><kbd>右键</kbd><span>删除体素</span></p><p><kbd>Shift + 拖动</kbd><span>拉出三维体积</span></p><p><kbd>拖动时滚轮</kbd><span>向第三个方向延展</span></p></div><div class="ve-note">半透明区域为操作预览，松开鼠标确认。超过建模范围或碰到实体会拒绝修改。</div><label class="ve-field">从轮廓开始<select data-preset aria-label="预制模型"><option value="">选择一个基础造型…</option><option value="base">8³ 基础方块</option><option value="plant">窗边绿植</option><option value="book">复古书册</option><option value="crate">木制收纳箱</option><option value="lamp">蘑菇台灯</option><option value="cup">陶瓷马克杯</option><option value="chair">橡木餐椅</option></select></label><button class="ve-wide ve-subtle" data-action="library">打开我的模型库 ↗</button>`;}
  private paintUI():string{
    return `<div class="ve-tool-title"><span>表面着色</span><button class="ve-mini ${this.bucket?'active':''}" data-action="bucket">${this.bucket?'● 油漆桶':'○ 画笔'}</button></div><div class="ve-palette">${palette.map(c=>`<button style="--swatch:${c}" class="${c===this.color?'selected':''}" data-color="${c}" aria-label="颜色 ${c}"></button>`).join('')}</div><div class="ve-color-main"><input type="color" aria-label="自定义颜色" data-color-input value="${this.color}"><input aria-label="十六进制颜色" data-hex value="${this.color}" maxlength="7"><select data-color-mode aria-label="颜色输入方式"><option>RGB</option><option>HSV</option></select></div><div class="ve-color-values" data-channels></div><label class="ve-field">画笔直径 <output data-brush-value>${this.brushSize}</output><input type="range" min="1" max="7" step="2" value="${this.brushSize}" data-brush aria-label="画笔大小"></label>${this.recent.length?`<div class="ve-recent"><span>最近</span>${this.recent.map(c=>`<button style="--swatch:${c}" data-color="${c}" aria-label="最近颜色 ${c}"></button>`).join('')}</div>`:''}<div class="ve-instructions"><p><kbd>左键</kbd><span>${this.bucket?'填充同平面连通区':'只涂命中表面'}</span><kbd>右键</kbd><span>清除颜色</span></p><p><kbd>Alt + 左键</kbd><span>吸取命中面颜色</span></p></div>`;
  }
  private selectionUI():string{
    const s=this.selection,p=this.currentPart(),selected=s?p.cells.filter(c=>c.x>=Math.min(s.a[0],s.b[0])&&c.x<=Math.max(s.a[0],s.b[0])&&c.y>=Math.min(s.a[1],s.b[1])&&c.y<=Math.max(s.a[1],s.b[1])&&c.z>=Math.min(s.a[2],s.b[2])&&c.z<=Math.max(s.a[2],s.b[2])).length:0;
    return `<div class="ve-tool-title"><span>${selected?`已选 ${selected} 个体素`:'选择分件 · 拖动框选'}</span><button class="ve-mini" data-action="all">全选分件</button></div>
      <div class="ve-action-grid"><button data-action="copy">复制</button><button data-action="delete">删除</button><button data-action="split">分离为 Part</button><button data-action="merge">合并 Part</button></div>
      <div class="ve-transform-mode"><label>场景手柄<select data-transform-mode aria-label="变换方式"><option value="move" ${this.transformMode==='move'?'selected':''}>↗ 移动坐标轴 / 平面</option><option value="rotate" ${this.transformMode==='rotate'?'selected':''}>◌ 旋转圆环</option></select></label></div>
      <div class="ve-gizmo-note"><strong>${this.transformMode==='move'?'拖动彩色箭头或平面拖柄':'拖动彩色轴向圆环'}</strong><span>默认 1 格 / 15° · Shift 连续 · Esc 取消</span></div>
      <details class="ve-details" data-numeric><summary>精确数值与镜像</summary><div class="ve-transform-mode"><select data-transform-axis aria-label="变换轴">${['x','y','z'].map(axis=>`<option value="${axis}" ${this.transformAxis===axis?'selected':''}>${axis.toUpperCase()} 轴</option>`).join('')}</select><input type="number" value="0" step="${this.transformMode==='move'?.1:1}" data-transform-number aria-label="变换增量"><button data-transform-apply>应用</button></div><div class="ve-action-grid">${(['x','y','z'] as const).map(axis=>`<button data-mirror="${axis}">${axis.toUpperCase()} 镜像</button>`).join('')}</div></details>
      <details class="ve-details"><summary>模型内部吸附与 Pivot</summary><div class="ve-snap-grid"><button data-snap="grid">模型网格 1 格</button><button data-snap="surface">模型底面 y=0</button><button data-snap="part">模型内相邻 Part</button><button data-snap="angle">角度 15°</button></div><div class="ve-note">以上仅调整模型内部位置，不改变角色藏点。</div><div class="ve-pivot-fields">${this.history.model.pivot.map((n,i)=>`<label>${['X','Y','Z'][i]}<input type="number" min="0" max="32" step="0.5" value="${Number(n.toFixed(2))}" data-pivot="${i}" aria-label="Pivot ${['X','Y','Z'][i]}"></label>`).join('')}</div><button class="ve-wide ve-subtle" data-action="pivot">Pivot 设为模型底面中心</button></details>`;
  }
  private action(action:string):void{
    if(action==='close')this.close();else if(action==='undo')this.undo();else if(action==='redo')this.undo(true);
    else if(action==='save'){const model=cloneModel(this.history.model);void saveModel(model).then(()=>this.notify(`已保存「${model.name}」到我的模型`)).catch(error=>this.notify(`保存失败：${error instanceof Error?error.message:'存储不可用'}`));}
    else if(action==='library')void openModelLibrary(this.container,model=>this.load(model),(message)=>this.notify(message)).then(close=>{this.libraryClose=close;});
    else if(action==='bucket'){this.bucket=!this.bucket;this.renderUI();}
    else if(action==='all')this.selectAll();else if(['copy','delete','split','merge'].includes(action))this.selectionAction(action as 'copy'|'delete'|'split'|'merge');
    else if(action==='pivot')this.mutate(model=>{const b=modelBounds(model);model.pivot=[model.pivot[0]+(b.min[0]+b.max[0])*.5,model.pivot[1]+b.min[1],model.pivot[2]+(b.min[2]+b.max[2])*.5];});
  }
  private bindPaint():void{
    this.panel.querySelectorAll<HTMLButtonElement>('[data-color]').forEach(b=>b.onclick=()=>{this.color=b.dataset.color!;this.renderUI();});
    const input=this.panel.querySelector<HTMLInputElement>('[data-color-input]')!,hex=this.panel.querySelector<HTMLInputElement>('[data-hex]')!,mode=this.panel.querySelector<HTMLSelectElement>('[data-color-mode]')!;
    input.oninput=()=>{this.color=input.value;hex.value=this.color;this.renderChannels(mode.value);};hex.onchange=()=>{if(/^#[\da-f]{6}$/i.test(hex.value)){this.color=hex.value.toLowerCase();input.value=this.color;this.renderChannels(mode.value);}else hex.value=this.color;};mode.onchange=()=>this.renderChannels(mode.value);this.renderChannels('RGB');
    const brush=this.panel.querySelector<HTMLInputElement>('[data-brush]')!;brush.oninput=()=>{this.brushSize=Number(brush.value);this.panel.querySelector('[data-brush-value]')!.textContent=brush.value;};
  }
  private renderChannels(mode:string):void{
    const wrap=this.panel.querySelector('[data-channels]');if(!wrap)return;const rgb=[parseInt(this.color.slice(1,3),16),parseInt(this.color.slice(3,5),16),parseInt(this.color.slice(5,7),16)];const c=rgb.map(v=>v/255),max=Math.max(...c),min=Math.min(...c),d=max-min;let h=0;if(d){if(max===c[0])h=((c[1]-c[2])/d)%6;else if(max===c[1])h=(c[2]-c[0])/d+2;else h=(c[0]-c[1])/d+4;}h=(h*60+360)%360;
    const values=mode==='RGB'?rgb:[Math.round(h),Math.round(max?d/max*100:0),Math.round(max*100)],maxima=mode==='RGB'?[255,255,255]:[360,100,100],names=mode==='RGB'?['R','G','B']:['H','S','V'];wrap.innerHTML=values.map((value,i)=>`<label>${names[i]}<input type="number" min="0" max="${maxima[i]}" value="${value}" aria-label="${names[i]} 颜色通道"></label>`).join('');
    this.localizeUI(wrap);
    wrap.querySelectorAll<HTMLInputElement>('input').forEach(input=>input.onchange=()=>{const values=[...wrap.querySelectorAll<HTMLInputElement>('input')].map((input,i)=>Math.min(maxima[i],Math.max(0,Number(input.value)||0)));let out=values;
      if(mode==='HSV'){const [h,s,v]=[values[0]/60,values[1]/100,values[2]/100],chroma=v*s,x=chroma*(1-Math.abs(h%2-1)),m=v-chroma;const sector=Math.floor(h)%6;out=([[chroma,x,0],[x,chroma,0],[0,chroma,x],[0,x,chroma],[x,0,chroma],[chroma,0,x]][sector]).map(n=>Math.round((n+m)*255));}
      this.color=`#${out.map(n=>Math.round(n).toString(16).padStart(2,'0')).join('')}`;this.panel.querySelector<HTMLInputElement>('[data-color-input]')!.value=this.color;this.panel.querySelector<HTMLInputElement>('[data-hex]')!.value=this.color;
    });
  }
  private bindSelection():void{
    const mode=this.panel.querySelector<HTMLSelectElement>('[data-transform-mode]')!,axis=this.panel.querySelector<HTMLSelectElement>('[data-transform-axis]')!,number=this.panel.querySelector<HTMLInputElement>('[data-transform-number]')!;
    mode.onchange=()=>{this.transformMode=mode.value as 'move'|'rotate';this.renderUI();};axis.onchange=()=>{this.transformAxis=axis.value as 'x'|'y'|'z';};
    this.panel.querySelector<HTMLButtonElement>('[data-transform-apply]')!.onclick=e=>{this.shift=e.shiftKey;this.beginTransform(this.transformMode,this.transformAxis);this.previewTransform(Number(number.value));this.endTransform();};
    this.panel.querySelectorAll<HTMLButtonElement>('[data-mirror]').forEach(b=>b.onclick=()=>this.transformStep('mirror',b.dataset.mirror as 'x'|'y'|'z',1,false));
    this.panel.querySelectorAll<HTMLButtonElement>('[data-snap]').forEach(b=>b.onclick=()=>{let nextId=this.partId;if(this.mutate(model=>{nextId=this.selectedPart(model);snapPart(model,nextId,b.dataset.snap as 'grid'|'surface'|'part'|'angle');})){this.partId=nextId;if(this.selection)this.selection.partId=nextId;this.refresh();}});
    this.panel.querySelectorAll<HTMLInputElement>('[data-pivot]').forEach(input=>input.onchange=()=>this.mutate(model=>{model.pivot[Number(input.dataset.pivot)]=Number(input.value);}));
  }
}
