import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {registerHooks} from 'node:module';
import {createDefaultModel,createPresetModel,modelBounds} from '../src/voxel/model.ts';
import {layout} from '../src/world/design-layout.ts';
import * as storage from '../src/voxel/storage.ts';
import type {VoxelModel} from '../src/contracts.ts';
import {DEFAULT_SETTINGS} from '../src/session.ts';
import {UI} from '../src/ui.ts';
import {WeaponRack} from '../src/weapon-rack.ts';
import {Recoil} from '../src/recoil.ts';
registerHooks({load(url,context,next){return url.endsWith('.css')?{format:'module',source:'export default {};',shortCircuit:true}:next(url,context)}});
const {Game}=await import('../src/game.ts');

test('hunter preparation positions use the approved slots without arbitrary lobby offsets',()=>{
  const game:any=Object.create(Game.prototype);game.map={group:new THREE.Group(),lobbySpawn:layout.spawns.hunterPreparation};game.map.group.userData.spawns=layout.spawns;
  for(let index=0;index<8;index++){
    const position=game.preparationPosition(index);assert.deepEqual(position,layout.spawns.preparationSlots[index]);
    assert.ok(position[2]>layout.preparationFeatures.firingRange.rect[1]+layout.preparationFeatures.firingRange.rect[3]);
    position[0]=0;assert.notEqual(layout.spawns.preparationSlots[index][0],0);
  }
});

test('bots select complete scene disguise models after randomization while the player keeps their selection',()=>{
  const scene=[createPresetModel('cup'),createPresetModel('lamp')],selected=createPresetModel('book'),game:any=Object.create(Game.prototype);
  scene[0].name='场景陶瓷杯';scene[1].name='场景台灯';game.map={group:new THREE.Group()};game.map.group.userData.mimicModels=scene;game.selectedModel=selected;game.session={round:1};
  assert.deepEqual(game.roundModel(0),selected);
  for(let index=1;index<8;index++){
    const model=game.roundModel(index),source=scene[(index+1)%scene.length];assert.deepEqual(model,source);assert.deepEqual(modelBounds(model),modelBounds(source));
    model.parts[0].cells[0].color='#000000';assert.notEqual(source.parts[0].cells[0].color,'#000000');
  }
  game.map.group.userData.mimicModels=[createPresetModel('plant')];assert.equal(game.roundModel(1).name,game.map.group.userData.mimicModels[0].name);
});

test('actual round creation uses hunter slot ordinals and newly randomized scene models',()=>{
  const scene=createPresetModel('cup');scene.name='本轮真实场景杯';const game:any=Object.create(Game.prototype);
  Object.assign(game,{actors:[],climbers:new Map(),selectedModel:createPresetModel('book'),settings:{...DEFAULT_SETTINGS},session:{round:1,phase:'preparation',roles:['hider','hunter','hider','hunter'],settings:{...DEFAULT_SETTINGS}},input:{clear:()=>{}},bots:{reset:()=>{}},combat:{actors:[]},rendering:{scene:new THREE.Scene()},highlight:{visible:true},physics:{loadWorld:()=>{},step:()=>{},removeActor:()=>{},addActor:(_id:number,position:THREE.Vector3)=>({position:position.clone(),grounded:true,yaw:0})}});
  game.map={group:new THREE.Group(),colliders:[],hiderSpawn:layout.spawns.hider,lobbySpawn:layout.spawns.hunterPreparation,randomize:()=>{game.map.group.userData.mimicModels=[scene]}};game.map.group.userData.spawns=layout.spawns;
  game.createRound(false);
  try{
    assert.deepEqual(game.actors[1].position.toArray(),[784,.2,48]);assert.deepEqual(game.actors[3].position.toArray(),[808,.2,48]);
    assert.equal(game.actors[2].model.name,scene.name);assert.deepEqual(game.actors[2].model,scene);assert.equal(game.actors[0].model.name,game.selectedModel.name);
  }finally{game.clearActors();}
});

function rackFixture(){
  const game:any=Object.create(Game.prototype),events:string[]=[];
  game.map={group:new THREE.Group()};game.map.group.userData.preparationFeatures=layout.preparationFeatures;
  const spec=layout.furniture.find(f=>f.id===layout.preparationFeatures.weaponStation.furniture)!;
  const rack=new WeaponRack(game.map.group,spec);
  Object.assign(game,{session:{phase:'preparation'},settings:{sensitivity:1},editor:{active:false},yaw:0,pitch:0,recoil:new Recoil()});
  game.actors=[{id:0,role:'hunter',alive:true,weapon:'pistol',gun:'pistol',position:new THREE.Vector3(792,0,-48),bounds:{min:[-9,0,-7],max:[9,48,7]},velocity:new THREE.Vector3(1,0,0)}];
  game.input={locked:true,tap:(code:string)=>code==='KeyE',key:()=>false,buttons:new Set(),clicked:new Set(),wheel:0,dx:0,dy:0,unlock:()=>assert.fail('rack selection must keep pointer lock'),clear:()=>assert.fail('rack selection must keep controls')};
  game.physics={canFit:()=>true};
  game.combat={supplyWeapon:(_actor:unknown,weapon:string)=>events.push(weapon),shoot:()=>{events.push('shot');return true}};
  game.ui={toast:()=>{},weaponStation:()=>assert.fail('rack selection must not open a dialog')};
  game.moveActor=()=>events.push('move');
  const aim=(id:string)=>{
    const mesh=rack.weapons.find(w=>w.id===id)!.mesh;
    const local=id==='knife'?new THREE.Vector3(0,8,0):id==='pistol'?new THREE.Vector3(0,4,0):new THREE.Vector3(0,0,0);
    game.map.group.updateMatrixWorld(true);const target=mesh.localToWorld(local),eye=game.player.position.clone().add(new THREE.Vector3(0,42,0));
    const direction=target.sub(eye).normalize();game.yaw=Math.atan2(-direction.x,-direction.z);game.pitch=Math.asin(direction.y);
  };
  return{game,rack,events,aim};
}

test('nearby preparation hunters select all four actual rack silhouettes without a modal',()=>{
  const {game,rack,events,aim}=rackFixture();
  try{
    for(const id of ['knife','pistol','smg','shotgun']){aim(id);assert.equal(game.rackSelection(),id);assert.equal(game.takeRackWeapon(),true);}
    assert.deepEqual(events,['knife','pistol','smg','shotgun']);assert.equal(game.input.locked,true);
    assert.deepEqual(game.player.velocity.toArray(),[1,0,0],'taking a gun does not freeze the player');
    events.length=0;game.player.position.set(784,0,72);assert.equal(game.takeRackWeapon(),false);
    game.player.position.set(792,0,-48);game.session.phase='hunt';assert.equal(game.takeRackWeapon(),false);
    game.session.phase='preparation';game.player.role='hider';assert.equal(game.takeRackWeapon(),false);
    game.player.role='hunter';game.player.alive=false;assert.equal(game.takeRackWeapon(),false);assert.deepEqual(events,[]);
  }finally{rack.dispose();}
});

test('actual controls use a single left click at the rack and otherwise keep free fire and movement',()=>{
  const {game,rack,events,aim}=rackFixture();
  try{
    aim('shotgun');game.controls(1/60);assert.deepEqual(events,['move'],'E has no weapon interaction');
    events.length=0;game.input.buttons.add(0);game.input.clicked.add(0);game.controls(1/60);
    assert.deepEqual(events,['shotgun','move']);
    game.input.clicked.clear();game.controls(1/60);assert.deepEqual(events,['shotgun','move','move'],'holding the button does not repeatedly take guns');
    game.yaw=-Math.PI/2;game.pitch=0;game.controls(1/60);assert.deepEqual(events.slice(-2),['shot','move']);
    assert.equal(game.pitch,0,'recoil does not teleport the input angle on the firing frame');
  }finally{rack.dispose();}
});

test('hunter HUD distinguishes weapon supply, safe target practice and live hunt penalties',()=>{
  const nodes=new Map<string,any>(),node=(selector:string)=>{if(!nodes.has(selector))nodes.set(selector,{textContent:'',hidden:false,style:{},classList:{toggle:()=>{},add:()=>{},remove:()=>{}},innerHTML:''});return nodes.get(selector)};
  const ui:any={screen:'game',root:{dataset:{},querySelector:node},lastPhase:'preparation',lastRound:1};
  const data:any={phase:'preparation',round:1,remaining:90,actor:{name:'你',role:'hunter',hp:100,alive:true,score:0,model:createDefaultModel()},aliveHiders:4,aliveHunters:2,multiplier:1,cooldown:0,weapon:'pistol',ammo:12,reserve:72,reloading:false,room:'准备区',editing:false,locked:true,winner:'',rank:[],fps:60,nearWeaponStation:true,rackWeapon:'shotgun',trainingScore:2};
  UI.prototype.update.call(ui,data);assert.equal(node('#ability-key').textContent,'左键');assert.match(node('#ability-name').textContent,/霰弹枪/);assert.match(node('#ability-detail').textContent,/左键取用/);assert.match(node('#game-controls').textContent,/自由射击/);assert.doesNotMatch(node('#game-controls').textContent,/按 E|西墙 E|射击线后/);assert.equal(node('#hp').textContent,'100');assert.equal(node('#score').textContent,'0');
  data.rackWeapon=null;UI.prototype.update.call(ui,data);assert.equal(node('#ability-name').textContent,'武器架');assert.doesNotMatch(node('#ability-name').textContent,/霰弹枪/);
  data.nearWeaponStation=false;UI.prototype.update.call(ui,data);assert.match(node('#ability-detail').textContent,/练靶 2 分/);assert.equal(node('#ability-key').textContent,'R');assert.equal(node('#score').textContent,'0','target practice remains separate from round scoring');
  data.phase=ui.lastPhase='hunt';UI.prototype.update.call(ui,data);assert.match(node('#ability-detail').textContent,/误击实体扣血/);assert.doesNotMatch(node('#game-controls').textContent,/练靶/);
});

test('scene model library reads the current world models without changing sources or old saved model data',async()=>{
  let models:VoxelModel[]=[createPresetModel('cup')];models[0].name='实景杯';
  (storage as any).setSceneModelProvider(()=>models);
  try{
    const listed=(storage as any).listSceneModels() as VoxelModel[];assert.equal(listed.length,1);assert.deepEqual(listed[0],models[0]);listed[0].parts[0].cells[0].color='#000000';assert.notEqual(models[0].parts[0].cells[0].color,'#000000');
    models=[createPresetModel('book'),{...createDefaultModel(),parts:[]}];assert.equal((storage as any).listSceneModels().length,1);assert.equal((storage as any).listSceneModels()[0].name,models[0].name);
  }finally{(storage as any).setSceneModelProvider(()=>[]);}
});
