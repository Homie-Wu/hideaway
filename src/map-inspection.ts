import * as THREE from 'three';
import type {Game} from './game.ts';
import {WEAPONS} from './actors/weapons.ts';
import type {WeaponId} from './contracts.ts';
import type {WeaponRack} from './weapon-rack.ts';
import {layout,designRoom} from './world/design-layout.ts';

/** Accessible test entry points for background browsers that cannot capture the pointer. */
export function openGameplayInspection(game:Game) {
  const panel=document.createElement('div');panel.id='gameplay-inspection';
  panel.style.cssText='position:fixed;z-index:300;left:50%;transform:translateX(-50%);top:12px;max-width:calc(100vw - 32px);background:#172b27ed;color:#fff6df;padding:10px;border-radius:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;font:12px sans-serif';
  panel.innerHTML='<strong>开发验证</strong><button>打开建模</button><button>打开模型库</button><button data-action="range-start">猎人练靶</button><select aria-label="武器架枪械"></select><button data-action="rack-aim">瞄准架上武器</button><button data-action="rack-take">取用瞄准武器</button><select aria-label="练靶靶位"><option value="0">练习靶 1</option><option value="1">练习靶 2</option></select><button data-action="target-aim">瞄准练习靶</button><button data-action="fire">开火</button><button data-action="range-exit">返回主界面</button><output aria-live="polite" style="flex-basis:100%;font-size:11px;color:#d7e2bb">验证按钮通过实际物理传送、武器架取用和战斗逻辑操作。</output>';
  const buttons=panel.querySelectorAll('button');buttons[0].addEventListener('click',()=>{if(game.ui.screen==='pause')game.ui.hud();game.toggleEditor();});
  buttons[1].addEventListener('click',()=>{void game.models();});document.body.append(panel);
  const status=panel.querySelector('output')!,weapon=panel.querySelector<HTMLSelectElement>('[aria-label="武器架枪械"]')!,target=panel.querySelector<HTMLSelectElement>('[aria-label="练靶靶位"]')!;
  for(const id of ['knife','pistol','smg','shotgun'] as WeaponId[]){const option=document.createElement('option');option.value=id;option.textContent=WEAPONS[id].name;weapon.append(option);}
  weapon.value='pistol';
  const isHunter=()=>{
    if(game.running&&game.player?.alive&&game.player.role==='hunter'&&game.session.phase==='preparation')return true;
    status.textContent='请先点击“猎人练靶”进入真实准备回合。';return false;
  };
  const focus=(position:THREE.Vector3,point:THREE.Vector3,aim:boolean)=>{
    game.input.unlock();game.input.clear();game.inspectionActive=true;
    const player=game.player;game.physics.teleport(player.physical,position);player.velocity.set(0,0,0);player.crouch=false;player.aim=aim;game.firstPerson=true;game.eyeHeight=42;game.recoil.reset();
    const direction=point.clone().sub(position.clone().add(new THREE.Vector3(0,42,0))).normalize();
    game.yaw=Math.atan2(-direction.x,-direction.z);game.pitch=Math.asin(direction.y);player.yaw=game.yaw;player.previousYaw=player.yaw;player.pitch=game.pitch;
    game.ui.hud();game.hud();game.updateCamera(0);
  };
  panel.querySelector('[data-action="range-start"]')!.addEventListener('click',()=>{
    const saved=game.settings;game.settings={...saved,players:2,hunters:1,role:'hunter',preparationSeconds:360};
    try{game.start('hunt');}finally{game.settings=saved;}
    game.input.unlock();game.input.clear();game.inspectionActive=true;
    const center=layout.preparationFeatures.firingRange.targets[0];
    focus(new THREE.Vector3(850,.2,center[2]),new THREE.Vector3(...center),true);
    status.textContent='真实准备回合已启动；测试配置仅用于本次回合，个人设置未保存或更改。';
  });
  panel.querySelector('[data-action="rack-aim"]')!.addEventListener('click',()=>{
    if(!isHunter())return;
    const rack=game.map.group.userData.weaponRack as WeaponRack|undefined,id=weapon.value as WeaponId,mesh=rack?.weapons.find(item=>item.id===id)?.mesh;
    if(!mesh){status.textContent='找不到真实架上武器。';return;}
    game.map.group.updateMatrixWorld(true);
    const local=id==='knife'?new THREE.Vector3(0,8,0):id==='pistol'?new THREE.Vector3(0,4,0):new THREE.Vector3();
    focus(new THREE.Vector3(792,.2,-48),mesh.localToWorld(local),false);
    status.textContent=`已瞄准 ${WEAPONS[id].name}；真实命中轮廓：${game.rackSelection()??'未命中'}。`;
  });
  panel.querySelector('[data-action="rack-take"]')!.addEventListener('click',()=>{
    if(!isHunter())return;
    const taken=game.takeRackWeapon();game.hud();
    status.textContent=taken?`已通过真实武器架取用 ${WEAPONS[game.player.weapon].name}；${game.player.ammo} 发弹药。`:'瞄准未命中可取用的架上武器。';
  });
  panel.querySelector('[data-action="target-aim"]')!.addEventListener('click',()=>{
    if(!isHunter())return;
    const index=Number(target.value),center=layout.preparationFeatures.firingRange.targets[index];
    focus(new THREE.Vector3(850,.2,center[2]),new THREE.Vector3(...center),true);
    status.textContent=`已瞄准练习靶 ${index+1}，位置在原射击线前方；可自由开火。`;
  });
  panel.querySelector('[data-action="fire"]')!.addEventListener('click',()=>{
    if(!isHunter())return;
    const player=game.player,fired=game.combat.shoot(player,game.aimDirection(),game.session.phase);
    if(fired)game.recoil.add(player.weapon,player.aim);
    game.hud();status.textContent=fired?`已通过真实战斗逻辑射击 ${WEAPONS[player.weapon].name}；后坐力、靶板、冷却和弹药均正常模拟。`:'武器冷却、装填或切换中，请等待后再开火。';
  });
  panel.querySelector('[data-action="range-exit"]')!.addEventListener('click',()=>{game.inspectionActive=false;game.returnMenu();status.textContent='已返回主界面。';});
  // An inspection keeps native buttons usable even if a browser later grants the pending lock.
  document.addEventListener('pointerlockchange',()=>{if(game.inspectionActive&&game.input.locked)game.input.unlock();});
}

/** Local development review controls; production players see the normal game only. */
export function openMapInspection(game:Game,initial:string) {
  game.map.randomize(2026,0);game.physics.loadWorld(game.map.colliders);
  game.running=false;game.input.unlock();game.ui.root.hidden=true;
  const panel=document.createElement('div');panel.id='map-inspection';
  panel.style.cssText='position:fixed;z-index:200;left:20px;top:20px;padding:12px 16px;background:#172b27ed;color:#fff6df;border:1px solid #adbc9f;border-radius:12px;display:flex;gap:12px;align-items:center;font:14px sans-serif';
  panel.innerHTML='<strong>地图实景</strong><select aria-label="审查区域"></select><select aria-label="审查视角"><option value="overhead">俯视核对</option><option value="inside">室内视角</option></select><select aria-label="观察方位"><option value="SE">东南角</option><option value="SW">西南角</option><option value="NE">东北角</option><option value="NW">西北角</option></select><button>退出审查，进入游戏</button>';
  document.body.append(panel);
  const region=panel.querySelector('select')!,view=panel.querySelectorAll('select')[1],corner=panel.querySelectorAll('select')[2];
  for(const room of [{id:'site',name:'全场地'},{id:'ground',name:'一楼总览'},{id:'upper',name:'二楼总览'},...layout.rooms]){const option=document.createElement('option');option.value=room.id;option.textContent=room.name;region.append(option);}
  region.value=['site','ground','upper'].includes(initial)||layout.rooms.some(r=>r.id===initial)?initial:'kitchen';
  const originalMenu=game.menuCamera.bind(game);
  const update=()=>{
    const room=designRoom(region.value)??{id:region.value,name:region.value==='site'?'全场地':region.value==='upper'?'二楼总览':'一楼总览',floor:region.value==='upper'?1:0,bounds:region.value==='site'?[-608,-544,1560,1088]:layout.boundaries.house},[x,z,w,d]=room.bounds,base=room.floor*128;
    const outdoor=['front','back','west','east','balcony'].includes(room.id);
    const plane=view.value==='overhead'&&!outdoor&&room.id!=='site'?new THREE.Plane(new THREE.Vector3(0,-1,0),base+(room.id==='prep'?127:119)):null;
    game.rendering.renderer.localClippingEnabled=true;
    game.map.group.traverse(object=>{if(object instanceof THREE.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material]){material.clippingPlanes=plane?[plane]:null;material.clipShadows=!!plane;material.needsUpdate=true;}});
    const center=new THREE.Vector3(x+w/2,base+24,z+d/2),camera=game.rendering.camera;
    camera.fov=view.value==='inside'?76:58;camera.updateProjectionMatrix();
    if(view.value==='inside'){
      const east=corner.value.includes('E'),south=corner.value.includes('S');
      const narrow=w<=180;
      const inset=room.id==='living'?48:22;
      camera.position.set(x+(narrow?w/2:east?w-22:22),base+100,z+(south?d-inset:22));camera.lookAt(x+w*(narrow?.5:east?.35:.65),base+36,z+d*(south?.3:.7));
    }else{
      const height=Math.max(w,d)*(['site','ground','upper'].includes(room.id)?.95:1.2);
      camera.position.set(center.x,base+height,center.z+Math.max(6,d*.09));camera.lookAt(center);
    }
    camera.updateMatrixWorld(true);
    game.menuCamera=()=>{};
    panel.querySelector('strong')!.textContent=`地图实景 · ${room.name}`;
  };
  region.addEventListener('change',()=>{corner.value=region.value==='study'?'SW':'SE';update();});view.addEventListener('change',update);corner.addEventListener('change',update);update();
  panel.querySelector('button')!.addEventListener('click',()=>{
    game.map.group.traverse(object=>{if(object instanceof THREE.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material]){material.clippingPlanes=null;material.clipShadows=false;material.needsUpdate=true;}});
    game.menuCamera=originalMenu;game.ui.root.hidden=false;panel.remove();game.returnMenu();
  });
}
