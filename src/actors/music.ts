import type {Phase} from '../contracts.ts';

export type MusicMood = 'cozy' | 'hunt' | 'urgent' | 'resolved';
export type MusicInstrument = 'marimba' | 'pluck' | 'pad' | 'bass' | 'brush' | 'kick' | 'shaker';
export interface MusicNote {beat:number;duration:number;midi:number;velocity:number;pan:number;instrument:MusicInstrument;}
export const MUSIC_BEAT_SECONDS = 60 / 92;
const PHRASE_BEATS = 64;

// "Sunlit hiding places": original 16-bar A / A' / B / A'' phrase, in C major.
// The search arrangement moves to relative A minor while keeping the same tempo.
const COZY_CHORDS = [0,1,2,3,0,1,2,3,4,1,2,3,0,4,2,3];
const MAJOR = [[48,55,60,64,71],[45,55,60,64,69],[41,53,57,60,64],[43,55,59,62,67],[50,57,60,65,69]];
const MINOR = [[45,57,60,64,67],[40,55,59,62,67],[41,53,57,60,64],[40,56,59,62,64],[50,57,60,65,69]];
const MELODY = [
 [64,67,69,67,64,62],[60,64,67,64,60,59],[60,65,69,67,65,64],[62,67,71,69,67,62],
 [64,67,72,71,69,67],[64,69,72,69,67,64],[65,69,72,74,72,69],[67,71,74,71,69,67],
 [65,69,72,69,65,64],[64,67,69,72,71,69],[69,72,76,74,72,69],[67,71,74,72,71,67],
 [64,67,72,67,64,62],[65,69,72,69,67,65],[65,69,72,69,65,62],[62,67,71,69,67,62],
];

/** A score is data, so both the live scheduler and offline audio checks use the same notes. */
export function composeMusic(mood:MusicMood):MusicNote[] {
 const notes:MusicNote[]=[];
 const search=mood==='hunt'||mood==='urgent',urgent=mood==='urgent';
 const add=(instrument:MusicInstrument,beat:number,midi:number,duration:number,velocity:number,pan=0)=>notes.push({instrument,beat,midi,duration,velocity,pan});
 for(let bar=0;bar<16;bar++){
  const b=bar*4,index=mood==='resolved'&&bar%4===3?0:COZY_CHORDS[bar];
  const chord=(search?MINOR:MAJOR)[index],melody=mood==='resolved'&&bar%4===3?[67,64,60,64,62,60]:MELODY[bar];
  // Long, softly voiced chords overlap the next bar's attack without creating a gap.
  chord.slice(1).forEach((pitch,i)=>add('pad',b,pitch,4.65,search?.037:.045,(i-1.5)*.2));
  const bassBeats=urgent?[0,.5,1,1.5,2,2.5,3,3.5]:[0,2];
  bassBeats.forEach((beat,i)=>add('bass',b+beat,chord[0]+(i%4===2?7:0),urgent?.47:1.6,urgent?.115:search?.12:.145));
  const motif=search?[0,2.5]:[0,.75,1.5,2,2.75,3.5];
  motif.forEach((beat,i)=>{
   const pitch=search?chord[1+(i+bar)%4]+12:melody[i];
   add('marimba',b+beat,pitch,search?1.25:.94,search?.105:mood==='resolved'?.15:.2,Math.sin(bar*.8)*.22);
  });
  // A softer answering pluck creates a second part, with variation across four-bar phrases.
  const answers=search?[1,3.25]:[.5,1.5,2.5,3.5];
  answers.forEach((beat,i)=>add('pluck',b+beat,chord[1+(i+bar)%4],.9,search?.063:.095,i%2?-.3:.3));
  add('brush',b+1,0,.35,search?.047:.09,-.17);add('brush',b+3,0,.4,search?.05:.1,.17);
  add('kick',b,0,.45,search?.055:.07);if(!search||urgent)add('kick',b+2,0,.4,.045);
  for(const beat of urgent?[.5,1.5,2.5,3.5]:[.5,2.5])add('shaker',b+beat,0,.2,search?.04:.06,.32);
  if(bar%4===3&&!search)add('pluck',b+3.75,bar===15?71:melody[5]+7,.6,.085,-.2);
 }
 return notes.sort((a,b)=>a.beat-b.beat);
}

/** Small original instrument samples: warm struck wood, nylon-like pluck, soft pad and brush kit. */
export function synthesizeMusicNote(instrument:MusicInstrument,midi:number,duration:number,sampleRate:number):Float32Array {
 const length=Math.max(2,Math.ceil(duration*sampleRate)),pcm=new Float32Array(length);
 const hz=440*2**((midi-69)/12),tau=Math.PI*2;
 let seed=0x19ab43+Math.round(midi)*73,noiseLow=0;
 for(let i=0;i<length;i++){
  const t=i/sampleRate,phase=tau*hz*t;
  const edge=Math.min(1,t/.008,Math.max(0,(length-1-i)/sampleRate)/.035);
  let value=0;
  if(instrument==='marimba'){
   value=(Math.sin(phase)*Math.exp(-t/ .38)+.34*Math.sin(phase*2.76)*Math.exp(-t/.065)+.13*Math.sin(phase*4.02)*Math.exp(-t/.033))*.67;
  }else if(instrument==='pluck'){
   value=(Math.sin(phase)*Math.exp(-t/.33)+.27*Math.sin(phase*2)*Math.exp(-t/.16)+.12*Math.sin(phase*3)*Math.exp(-t/.08))*.65;
  }else if(instrument==='pad'){
   const envelope=Math.min(1,t/.38,(duration-t)/.65);
   value=(Math.sin(phase)+.3*Math.sin(phase*1.003)+.16*Math.sin(phase*2)+.08*Math.sin(phase*2.997))*.42*envelope;
  }else if(instrument==='bass'){
   value=(Math.sin(phase)+.18*Math.sin(phase*2)+.045*Math.sin(phase*3))*.72*Math.min(1,t/.018,(duration-t)/.12)*Math.exp(-t/.85);
  }else if(instrument==='kick'){
   value=Math.sin(tau*(48*t+2.6*(1-Math.exp(-t*24))))*.75*Math.exp(-t*19);
  }else{
   seed=(Math.imul(seed,1664525)+1013904223)|0;
   const noise=(seed>>>0)/2147483648-1;
   noiseLow+=.2*(noise-noiseLow);
   value=(instrument==='brush'?noiseLow*1.5:noise-noiseLow)*Math.exp(-t*(instrument==='brush'?24:48))*.7;
  }
  pcm[i]=value*edge;
 }
 return pcm;
}

interface MusicVoice {source:AudioBufferSourceNode;gain:GainNode;pan:StereoPannerNode;}
interface MusicLayer {mood:MusicMood;gain:GainNode;score:MusicNote[];origin:number;cursor:number;cycle:number;end:number;voices:Set<MusicVoice>;}
const clampVolume=(value:number)=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;

/** Scheduled from the game frame, using the audio clock and a 240 ms lookahead. */
export class MusicDirector {
 private context:AudioContext;
 private volumeGain:GainNode;
 private duckGain:GainNode;
 private layers:MusicLayer[]=[];
 private active:MusicLayer|null=null;
 private cache=new Map<string,AudioBuffer>();
 private disposed=false;
 private duckUntil=0;
 private duckAmount=1;

 constructor(context:AudioContext,destination:AudioNode){
  this.context=context;
  this.volumeGain=context.createGain();this.volumeGain.gain.value=.55;
  this.duckGain=context.createGain();this.duckGain.gain.value=1;
  this.volumeGain.connect(this.duckGain);this.duckGain.connect(destination);
 }

 setVolume(value:number):void {
  if(!this.disposed)this.volumeGain.gain.setTargetAtTime(clampVolume(value),this.context.currentTime,.04);
 }

 /** Cue gain is independent of the user's music slider; repeated footsteps extend the duck. */
 duck(amount:number,duration:number):void {
  if(this.disposed)return;
  const now=this.context.currentTime;
  if(now<this.duckUntil&&clampVolume(amount)>this.duckAmount)return;
  this.duckAmount=clampVolume(amount);
  this.duckUntil=Math.max(this.duckUntil,now+duration);
  const param=this.duckGain.gain;
  param.cancelAndHoldAtTime(now);param.linearRampToValueAtTime(this.duckAmount,now+.025);
  param.setValueAtTime(this.duckAmount,this.duckUntil);param.linearRampToValueAtTime(1,this.duckUntil+.34);
 }

 update(phase:Phase,remaining:number,paused:boolean):void {
  if(this.disposed)return;
  const now=this.context.currentTime;
  for(const layer of [...this.layers])if(layer.end<=now)this.release(layer);
  const mood:MusicMood|null=paused||this.context.state!=='running'?null:
   phase==='hunt'?(remaining<=30?'urgent':'hunt'):phase==='reveal'||phase==='sessionEnd'?'resolved':'cozy';
  if(!mood){
   for(const layer of this.layers)if(layer.end>now+.18)this.fadeOut(layer,now,.18);
   this.active=null;return;
  }
  if(mood!==this.active?.mood){
   if(this.active)this.fadeOut(this.active,now,.75);
   this.active=this.createLayer(mood,now+.025);
  }
  for(const layer of this.layers)this.schedule(layer,now);
 }

 private createLayer(mood:MusicMood,origin:number):MusicLayer {
  const gain=this.context.createGain();gain.gain.setValueAtTime(0,origin);
  gain.gain.linearRampToValueAtTime(1,origin+.75);gain.connect(this.volumeGain);
  const layer:MusicLayer={mood,gain,score:composeMusic(mood),origin,cursor:0,cycle:0,end:Infinity,voices:new Set()};
  this.layers.push(layer);return layer;
 }

 private fadeOut(layer:MusicLayer,now:number,duration:number):void {
  layer.end=now+duration;
  layer.gain.gain.cancelAndHoldAtTime(now);layer.gain.gain.linearRampToValueAtTime(0,layer.end);
  for(const voice of layer.voices)voice.source.stop(layer.end+.005);
 }

 private schedule(layer:MusicLayer,now:number):void {
  // Seek directly after a background tab or long frame. Never burst-play overdue events.
  const elapsed=Math.max(0,(now-layer.origin)/MUSIC_BEAT_SECONDS);
  const nextBeat=layer.cycle*PHRASE_BEATS+layer.score[layer.cursor].beat;
  if(nextBeat<elapsed-.05){
   layer.cycle=Math.floor(elapsed/PHRASE_BEATS);
   const within=elapsed-layer.cycle*PHRASE_BEATS;
   layer.cursor=layer.score.findIndex(note=>note.beat>=within);
   if(layer.cursor<0){layer.cursor=0;layer.cycle++}
  }
  while(true){
   const note=layer.score[layer.cursor],at=layer.origin+(layer.cycle*PHRASE_BEATS+note.beat)*MUSIC_BEAT_SECONDS;
   if(at>=Math.min(now+.24,layer.end))break;
   if(at>=now)this.playNote(layer,note,at);
   if(++layer.cursor===layer.score.length){layer.cursor=0;layer.cycle++}
  }
 }

 private playNote(layer:MusicLayer,note:MusicNote,at:number):void {
  const duration=note.duration*MUSIC_BEAT_SECONDS,key=`${note.instrument}:${note.midi}:${note.duration}`;
  let buffer=this.cache.get(key);
  if(!buffer){
   // All instruments are mellow; 24 kHz samples preserve their spectrum and keep memory modest.
   const sampleRate=Math.min(24000,this.context.sampleRate),pcm=synthesizeMusicNote(note.instrument,note.midi,duration,sampleRate);
   buffer=this.context.createBuffer(1,pcm.length,sampleRate);buffer.getChannelData(0).set(pcm);this.cache.set(key,buffer);
  }
  const source=this.context.createBufferSource(),gain=this.context.createGain(),pan=this.context.createStereoPanner();
  source.buffer=buffer;gain.gain.value=note.velocity;pan.pan.value=note.pan;
  source.connect(gain);gain.connect(pan);pan.connect(layer.gain);
  const voice={source,gain,pan};layer.voices.add(voice);
  source.onended=()=>{source.disconnect();gain.disconnect();pan.disconnect();layer.voices.delete(voice)};
  source.start(at);source.stop(Math.min(at+duration+.005,layer.end+.005));
 }

 private release(layer:MusicLayer):void {
  for(const voice of layer.voices){voice.source.onended=null;voice.source.stop(this.context.currentTime);voice.source.disconnect();voice.gain.disconnect();voice.pan.disconnect()}
  layer.voices.clear();layer.gain.disconnect();this.layers=this.layers.filter(entry=>entry!==layer);
 }

 dispose():void {
  if(this.disposed)return;this.disposed=true;
  for(const layer of [...this.layers])this.release(layer);
  this.active=null;this.cache.clear();this.volumeGain.disconnect();this.duckGain.disconnect();
 }
}
