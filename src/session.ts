import type {GameSettings,Phase,Role,RolePreference} from './contracts.ts';
export const DEFAULT_SETTINGS:GameSettings={players:6,hunters:2,preparationSeconds:360,huntSeconds:480,randomRatio:.2,forcedTauntSeconds:45,role:'random',gun:'pistol',volume:.65,musicVolume:.55,sensitivity:1,quality:'high'};
/** Partial Fisher-Yates: every H-element subset has equal probability. */
export function allocateRoles(players:number,hunters:number,preference:RolePreference,random:()=>number=Math.random):Role[]{
 if(!Number.isInteger(players)||players<2||players>8||!Number.isInteger(hunters)||hunters<1||hunters>=players)throw new RangeError('Invalid team size');
 const roles:Role[]=Array(players).fill('hider');
 if(preference==='hunter')roles[0]='hunter';
 const candidates=Array.from({length:players},(_,i)=>i).filter(i=>preference==='random'||i!==0);
 const count=hunters-(preference==='hunter'?1:0);
 for(let i=0;i<count;i++){const value=random();if(!Number.isFinite(value)||value<0||value>=1)throw new RangeError('Random source must return [0, 1)');const index=i+Math.floor(value*(candidates.length-i));[candidates[i],candidates[index]]=[candidates[index],candidates[i]];roles[candidates[i]]='hunter';}
 return roles;
}
export function recommendSettings(players:number){return{hunters:Math.max(1,Math.floor(players/3)),preparationSeconds:players<=4?240:360,huntSeconds:players<=4?360:players<=6?480:600}}
export function normalizeSettings(s:Partial<GameSettings>):GameSettings {
 const n={...DEFAULT_SETTINGS,...s};const num=(v:number,a:number,b:number)=>Number.isFinite(v)?Math.min(b,Math.max(a,v)):a;
 n.players=Math.round(num(n.players,2,8));n.hunters=Math.round(num(n.hunters,1,n.players-1));n.preparationSeconds=num(n.preparationSeconds,5,900);n.huntSeconds=num(n.huntSeconds,10,1800);n.randomRatio=num(n.randomRatio,0,1);n.forcedTauntSeconds=num(n.forcedTauntSeconds,0,180);n.volume=num(n.volume,0,1);n.musicVolume=num(n.musicVolume,0,1);n.sensitivity=num(n.sensitivity,.2,3);n.role=n.role==='hunter'||n.role==='hider'?n.role:'random';if(!['pistol','smg','shotgun'].includes(n.gun))n.gun='pistol';n.quality=n.quality==='medium'?'medium':'high';return n;
}
/** One survival point plus a diminishing size bonus, capped at three points per second. */
export function scoreRate(volume:number,nearVisibleHunter:boolean):number{return(1+Math.min(2,Math.log2(Math.max(512,volume)/512)/3))*(nearVisibleHunter?2:1)}
export function tauntReady(now:number,last:number):boolean{return now-last>=5}
export class Session {
 settings:GameSettings;phase:Phase='menu';round=0;remaining=0;elapsed=0;phaseElapsed=0;revealDuration=15;winner='';
 roles:Role[]=[];random:()=>number;
 constructor(settings:GameSettings,random:()=>number=Math.random){this.settings={...settings};this.random=random}
 assignRoles(){this.roles=allocateRoles(this.settings.players,this.settings.hunters,this.settings.role,this.random)}
 start(mode:'practice'|'hunt'){this.round=1;this.elapsed=0;this.winner='';if(mode==='practice')this.roles=['hider'];else this.assignRoles();this.transition(mode==='practice'?'practice':'preparation')}
 transition(phase:Phase){this.phase=phase;this.phaseElapsed=0;this.remaining=phase==='preparation'?this.settings.preparationSeconds:phase==='hunt'?this.settings.huntSeconds:phase==='reveal'?this.revealDuration:Infinity}
 advance(dt:number,aliveHiders:number,aliveHunters:number){this.elapsed+=dt;this.phaseElapsed+=dt;this.remaining=Math.max(0,this.remaining-dt);if(this.phase==='preparation'&&this.remaining<=0)this.transition('hunt');else if(this.phase==='hunt'&&(this.remaining<=0||aliveHiders===0||aliveHunters===0)){this.winner=aliveHiders===0?'猎人获胜':'躲藏者获胜';this.transition('reveal')}else if(this.phase==='reveal'&&this.remaining<=0){this.round++;this.assignRoles();this.transition('preparation')}}
 end(){this.transition('sessionEnd')}
}
