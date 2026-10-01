import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SoundSystem} from '../src/actors/sound.ts';
import {UI} from '../src/ui.ts';
import {DEFAULT_SETTINGS} from '../src/session.ts';

class Param {
 value=1;setValueAtTime(v:number){this.value=v;}setTargetAtTime(v:number){this.value=v;}linearRampToValueAtTime(v:number){this.value=v;}exponentialRampToValueAtTime(v:number){this.value=v;}cancelAndHoldAtTime(){}
}
class Node {connect(_node:unknown){return _node;}disconnect(){}}
class Gain extends Node {gain=new Param();}
class Source extends Node {buffer:unknown;onended:unknown;loop=false;startTime=Infinity;start(at:number){this.startTime=at;}stop(){}}
class Context {
 static instances:Context[]=[];state='suspended';currentTime=0;sampleRate=12000;destination=new Node();resumeCalls=0;failFirst=true;sources:Source[]=[];gains:Gain[]=[];
 constructor(){Context.instances.push(this);}
 createGain(){const gain=new Gain();this.gains.push(gain);return gain;}
 createDynamicsCompressor(){return Object.assign(new Node(),{threshold:new Param(),knee:new Param(),ratio:new Param(),attack:new Param(),release:new Param()});}
 createBuffer(_channels:number,length:number){const pcm=new Float32Array(length);return{getChannelData:()=>pcm};}
 createBufferSource(){const source=new Source();this.sources.push(source);return source;}
 createStereoPanner(){return Object.assign(new Node(),{pan:new Param()});}
 createOscillator(){return Object.assign(new Source(),{frequency:new Param(),type:'sine'});}
 async resume(){this.resumeCalls++;if(this.failFirst&&this.resumeCalls===1)throw new Error('Autoplay denied');this.state='running';}
 async close(){this.state='closed';}
}

test('a denied audio unlock is safe and the next user gesture retries without creating duplicate contexts',async()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'window');Context.instances=[];
 Object.defineProperty(globalThis,'window',{configurable:true,value:{AudioContext:Context}});
 const sound=new SoundSystem();sound.setVolume(.4);sound.setMusicVolume(.3);
 try{
  assert.equal(sound.audioContext,null,'page load creates no autoplay audio context');
  await assert.doesNotReject(sound.init(),'a blocked unlock does not become an unhandled rejection');
  const context=Context.instances[0];assert.equal(context.state,'suspended');sound.updateMusic('menu',0,false);assert.equal(context.sources.length,0,'a blocked context cannot schedule audible music');
  await sound.init();assert.equal(context.state,'running');assert.equal(Context.instances.length,1);sound.updateMusic('menu',0,false);
  assert.ok(context.sources.some(source=>source.startTime<.3),'the next gesture starts actual menu notes');
  const sources=context.sources.length;sound.play('ui');assert.ok(context.sources.length>sources,'buttons schedule their audio-clock cleanup cue');
  assert.ok(context.gains.some(gain=>Math.abs(gain.gain.value-.38)<.001),'saved master volume survives lazy initialization');
  assert.ok(context.gains.some(gain=>gain.gain.value===.3),'saved music volume survives lazy initialization');
  sound.setVolume(0);const silent=context.sources.length;sound.play('ui');assert.equal(context.sources.length,silent,'master mute also silences button effects');
  sound.setMusicVolume(0);assert.ok(context.gains.some(gain=>gain.gain.value===0),'music mute does not need a new context');
 }finally{sound.dispose();if(original)Object.defineProperty(globalThis,'window',original);else Reflect.deleteProperty(globalThis,'window');}
});

type Listener=(event:any)=>void;
class Element {
 handlers=new Map<string,{listener:Listener;capture:boolean}[]>();disabled=false;value='';name='';dataset:Record<string,string>={};removed=false;
 children=new Map<string,Element>();
 readonly role:string;constructor(role='element'){this.role=role;}
 setAttribute(){}focus(){}remove(){this.removed=true;}
 addEventListener(type:string,listener:Listener,capture?:boolean){const listeners=this.handlers.get(type)??[];listeners.push({listener,capture:!!capture});this.handlers.set(type,listeners);}
 emit(type:string,event:any={}){for(const entry of this.handlers.get(type)??[])entry.listener(event);}
 querySelector(selector:string){return this.children.get(selector);}
 closest(selector:string){return selector==='button'&&this.role==='button'?this:null;}
 insertAdjacentHTML(){const form=new Element('form'),dialog=new Element('dialog');dialog.children.set('form',form);this.children.set('#settings-dialog',dialog);
  for(const name of ['randomRatio','players','volume','musicVolume']){const input=new Element('input');input.name=name;input.value=String(DEFAULT_SETTINGS[name as keyof typeof DEFAULT_SETTINGS]);form.children.set('[name='+name+']',input);if(name==='players')form.children.set('input',input);}
  form.children.set('output',new Element('output'));form.children.set('#settings-reset',new Element('button'));
 }
}
test('menu pointer and keyboard gestures unlock audio, and button feedback runs in capture before an action replaces the screen',()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'document'),root=new Element(),events:boolean[]=[];
 Object.defineProperty(globalThis,'document',{configurable:true,value:{querySelector:()=>new Element()}});
 try{
  const noop=()=>{};new UI(root as unknown as HTMLElement,{start:noop,menu:noop,resume:noop,settings:noop,models:noop,end:noop,edit:noop,next:noop,audio:(cue:boolean)=>events.push(cue)} as any,{...DEFAULT_SETTINGS});
  root.emit('pointerdown',{target:new Element()});root.emit('keydown',{repeat:false});root.emit('keydown',{repeat:true});
  const capture=root.handlers.get('click')?.find(handler=>handler.capture);assert.ok(capture,'feedback runs before start/role/settings actions remove the clicked element');
  capture!.listener({target:new Element('button')});const disabled=new Element('button');disabled.disabled=true;capture!.listener({target:disabled});capture!.listener({target:new Element()});
  assert.deepEqual(events,[false,false,true],'only intentional activation and enabled button clicks produce cues');
 }finally{if(original)Object.defineProperty(globalThis,'document',original);else Reflect.deleteProperty(globalThis,'document');}
});

test('settings volume sliders audition sound immediately and reset auditions defaults without saving unrelated settings',()=>{
 const root=new Element(),previews:unknown[]=[];let saves=0;
 const ui:any=Object.create(UI.prototype);Object.assign(ui,{root,screen:'menu',settings:{...DEFAULT_SETTINGS,volume:.2,musicVolume:.1},actions:{audioPreview:(volume:number,music:number)=>previews.push([volume,music]),settings:()=>saves++}});
 UI.prototype.showSettings.call(ui);
 const form=root.querySelector('#settings-dialog')!.querySelector('form')!,volume=form.querySelector('[name=volume]')!,music=form.querySelector('[name=musicVolume]')!;
 volume.value='.45';music.value='.25';volume.emit('input');music.value='0';music.emit('input');
 assert.deepEqual(previews,[[.45,.25],[.45,0]],'slider sound is audible while the form remains open');
 form.querySelector('#settings-reset')!.emit('click');assert.deepEqual(previews.at(-1),[DEFAULT_SETTINGS.volume,DEFAULT_SETTINGS.musicVolume]);assert.equal(saves,0,'audition does not persist other unfinished settings');
});
