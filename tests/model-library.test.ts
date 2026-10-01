import {afterEach,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {openModelLibrary,setSceneModelProvider} from '../src/voxel/storage.ts';
import type {VoxelModel} from '../src/contracts.ts';

class Element {
  children:Element[]=[];parent?:Element;className='';textContent='';src='';alt='';dataset:Record<string,string>={};attributes=new Map<string,string>();events=new Map<string,(()=>void)[]>();
  classList={toggle:()=>{}};
  readonly tagName:string;
  constructor(tagName:string){this.tagName=tagName;}
  set innerHTML(_value:string){const close=new Element('button');close.className='ve-close';const grid=new Element('div');grid.className='ve-library-grid';this.replaceChildren(close,...['saved','scene','preset'].map(category=>{const button=new Element('button');button.dataset.category=category;return button;}),grid);}
  setAttribute(key:string,value:string){this.attributes.set(key,value);}
  append(...items:Element[]){items.forEach(item=>{item.parent=this;this.children.push(item);});}
  replaceChildren(...items:Element[]){this.children.forEach(item=>item.parent=undefined);this.children=[];this.append(...items);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(item=>item!==this);this.parent=undefined;}
  addEventListener(event:string,callback:()=>void){if(!this.events.has(event))this.events.set(event,[]);this.events.get(event)!.push(callback);}
  click(){this.events.get('click')?.forEach(callback=>callback());}
  querySelector(selector:string):Element|undefined{return this.querySelectorAll(selector)[0];}
  querySelectorAll(selector:string):Element[]{return this.children.flatMap(child=>[...(selector==='[data-category]'?child.dataset.category!==undefined:selector.startsWith('.')?child.className.split(' ').includes(selector.slice(1)):child.tagName===selector)?[child]:[],...child.querySelectorAll(selector)]);}
}

let container:Element,canvases:number,originalDocument:PropertyDescriptor|undefined,originalStorage:PropertyDescriptor|undefined,saved:string|null;
const model=(name:string,color='#37a682'):VoxelModel=>({version:2,name,pivot:[.5,0,.5],parts:[{id:name,name:'主体',position:[0,0,0],rotation:[0,0,0],cells:[{x:0,y:0,z:0,color}]}]});
const delay=()=>new Promise<void>(resolve=>setTimeout(resolve,1));
const category=(name:string)=>container.querySelectorAll('[data-category]').find(button=>button.dataset.category===name)!;
const grid=()=>container.querySelector('.ve-library-grid')!;
const names=()=>grid().children.filter(card=>card.tagName==='article').map(card=>card.querySelector('h3')!.textContent);
async function until(predicate:()=>boolean){for(let i=0;i<1000&&!predicate();i++)await delay();assert.ok(predicate(),'Incremental library loading completed');}

beforeEach(()=>{
  originalDocument=Object.getOwnPropertyDescriptor(globalThis,'document');originalStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');container=new Element('div');canvases=0;saved=null;
  const context=new Proxy({}, {get:()=>()=>{},set:()=>true});
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:(tag:string)=>{if(tag==='canvas'){canvases++;return {width:0,height:0,getContext:()=>context,toDataURL:()=>`data:image/png;base64,test-${canvases}`};}return new Element(tag);},addEventListener:()=>{},removeEventListener:()=>{}}});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>saved,setItem:(_key:string,value:string)=>saved=value}});
});
afterEach(()=>{setSceneModelProvider(()=>[]);for(const [key,original] of [['document',originalDocument],['localStorage',originalStorage]] as const){if(original)Object.defineProperty(globalThis,key,original);else Reflect.deleteProperty(globalThis,key);}});

test('89 scene models show usable first cards before generating thumbnails or blocking on the whole catalog',async()=>{
  setSceneModelProvider(()=>Array.from({length:89},(_,i)=>model(`场景 ${i}`,'#28a397')));
  const selected:string[]=[],close=await openModelLibrary(container as unknown as HTMLElement,entry=>selected.push(entry.name));
  category('scene').click();
  try{
    assert.ok(names().length>0&&names().length<89,'Only the first group of cards is built in the click task');
    assert.equal(canvases,0,'Thumbnail geometry is deferred until the click task has returned');
    grid().children[0].querySelector('button')!.click();assert.deepEqual(selected,['场景 0']);
    await delay();assert.equal(container.querySelector('.voxel-library'),undefined,'The first card remains usable while the rest is pending');
  }finally{close();}
});

test('a pending saved-model refresh cannot append stale results after switching to the scene category',async()=>{
  const legacy=model('旧存档','#8866aa');legacy.version=1;saved=JSON.stringify([{id:'legacy',name:legacy.name,model:legacy,thumbnail:'data:image/png;base64,legacy',updated:1}]);
  setSceneModelProvider(()=>[model('实时物件 A','#69b267'),model('实时物件 B','#69b268')]);
  const close=await openModelLibrary(container as unknown as HTMLElement,()=>{});
  try{category('saved').click();category('scene').click();await delay();assert.deepEqual(names(),['实时物件 A','实时物件 B']);}finally{close();}
});

test('switching or closing cancels queued thumbnails and repeated native occupancy shares a cached image',async()=>{
  setSceneModelProvider(()=>[model('重复杯 A','#3d8ab7'),model('重复杯 B','#3d8ab7')]);
  const close=await openModelLibrary(container as unknown as HTMLElement,()=>{});
  category('scene').click();await until(()=>grid().querySelectorAll('img').length===2&&grid().querySelectorAll('img').every(img=>img.src!==''));
  const images=grid().querySelectorAll('img').map(img=>img.src);assert.equal(canvases,1,'Names and part IDs do not duplicate thumbnail geometry');assert.equal(images[0],images[1]);
  category('saved').click();category('scene').click();await until(()=>grid().querySelectorAll('img').length===2&&grid().querySelectorAll('img').every(img=>img.src!==''));assert.equal(canvases,1,'Returning to the category reuses the native thumbnail cache');
  category('preset').click();close();const count=canvases;await delay();await delay();assert.equal(canvases,count,'Closing stops work from the pending category');assert.equal(container.querySelector('.voxel-library'),undefined);
});
