import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {layout} from '../src/world/design-layout.ts';
import {designArchitecture} from '../src/world/design-architecture.ts';
import {VoxelScene} from '../src/world/voxel-scene.ts';
import {buildFurnitureAsset} from '../src/world/voxel-furniture.ts';

test('framed artwork shows distinct landscape, botanical, abstract, city and space compositions',()=>{
  const base=layout.furniture.find(f=>f.kind==='wall-art')!;
  const pictures=['landscape','botanical','abstract','city','space'].map(artTheme=>buildFurnitureAsset({...base,rect:[0,0,64,4],height:32,artTheme}));
  const signatures=pictures.map(a=>a.palette.join('|')+':'+Array.from(a.cells).join(','));
  assert.equal(new Set(signatures).size,5,'changing the title must actually change the pixel composition');
});

test('wall art and corridor sconces attach their full back face to solid wall sections, including upper-floor frames',()=>{
  const scene=new VoxelScene();designArchitecture(scene,new THREE.Group());
  const walls=scene.boxes.filter(b=>b.kind==='wall');
  const failures:string[]=[];
  for(const f of layout.furniture.filter(f=>['wall-art','wall-light'].includes(f.kind))){
    const north=f.facing==='南',south=f.facing==='北',west=f.facing==='东';
    const horizontal=north||south,front=horizontal?f.rect[1]:f.rect[0],depth=horizontal?f.rect[3]:f.rect[2];
    const back=north||west?front:front+depth,along=horizontal?f.rect[0]:f.rect[1],length=horizontal?f.rect[2]:f.rect[3];
    for(let u=along+.5;u<along+length;u++)for(let y=f.y+.5;y<f.y+f.height;y++){
      const point=horizontal?[u,y,back+(north?-.01:.01)]:[back+(west?-.01:.01),y,u];
      if(!walls.some(b=>point.every((n,i)=>n>=b.center[i]-b.size[i]/2&&n<=b.center[i]+b.size[i]/2))) {failures.push(f.id);break;}
    }
  }
  assert.deepEqual([...new Set(failures)],[],'a frame touching the wall only at one end is still floating');
});
