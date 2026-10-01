import {test} from 'node:test';
import assert from 'node:assert/strict';
import {composeMusic, synthesizeMusicNote, MUSIC_BEAT_SECONDS, MusicDirector} from '../src/actors/music.ts';

test('original music contains a complete 16-bar phrase with melody, harmony, bass and rhythm',()=>{
 for(const mood of ['cozy','hunt','urgent','resolved'] as const){
  const notes=composeMusic(mood);
  assert.ok(notes.length>100,`${mood} has a full arrangement`);
  assert.ok(notes.some(note=>note.beat>=60),`${mood} has its closing bar`);
  assert.ok(notes.every(note=>note.beat>=0&&note.beat<64&&note.duration>0&&note.velocity>0));
  for(const instrument of ['marimba','pad','bass','brush'])assert.ok(notes.some(note=>note.instrument===instrument),`${mood}: ${instrument}`);
  assert.deepEqual(notes,composeMusic(mood),'score is repeatable at the loop boundary');
 }
 assert.ok(composeMusic('urgent').filter(note=>note.instrument==='bass').length>composeMusic('hunt').filter(note=>note.instrument==='bass').length,'final seconds add a quicker bass pulse');
 assert.ok(composeMusic('hunt').filter(note=>note.instrument==='marimba').length<composeMusic('cozy').filter(note=>note.instrument==='marimba').length,'hunt leaves room for sound cues');
});

class FakeParam {
 value=1;events:{at:number;value:number}[]=[];
 setValueAtTime(value:number,at:number){this.value=value;this.events.push({at,value})}
 linearRampToValueAtTime(value:number,at:number){this.value=value;this.events.push({at,value})}
 setTargetAtTime(value:number,at:number){this.value=value;this.events.push({at,value})}
 cancelScheduledValues(_at:number){} cancelAndHoldAtTime(_at:number){}
}
class FakeNode {connections:FakeNode[]=[];connect(node:FakeNode){this.connections.push(node);return node}disconnect(){this.connections=[]}}
class FakeGain extends FakeNode {gain=new FakeParam()}
class FakeBuffer {
 readonly length:number;readonly sampleRate:number;readonly duration:number;data:Float32Array;
 constructor(length:number,sampleRate:number){this.length=length;this.sampleRate=sampleRate;this.duration=length/sampleRate;this.data=new Float32Array(length)}
 getChannelData(){return this.data}copyToChannel(data:Float32Array){this.data.set(data)}
}
class FakeSource extends FakeNode {
 buffer:FakeBuffer|null=null;startTime=Infinity;stopTime=Infinity;onended:(()=>void)|null=null;
 start(at:number){this.startTime=at}stop(at:number){this.stopTime=Math.min(this.stopTime,at)}
}
class FakeContext {
 currentTime=0;sampleRate=12000;state='running';sources:FakeSource[]=[];gains:FakeGain[]=[];destination=new FakeNode();
 createGain(){const node=new FakeGain();this.gains.push(node);return node}
 createBuffer(_channels:number,length:number,sampleRate:number){return new FakeBuffer(length,sampleRate)}
 createBufferSource(){const node=new FakeSource();this.sources.push(node);return node}
 createStereoPanner(){return Object.assign(new FakeNode(),{pan:new FakeParam()})}
 advance(time:number){this.currentTime=time;for(const source of this.sources)if(source.onended&&Math.min(source.stopTime,source.startTime+(source.buffer?.duration??0))<=time){const end=source.onended;source.onended=null;end()}}
}
const director=()=>{const context=new FakeContext();return{context,music:new MusicDirector(context as unknown as AudioContext,context.destination as unknown as AudioNode)}};

test('music uses a bounded lookahead, survives a stalled frame, and plays the next loop',()=>{
 const {context,music}=director();music.update('preparation',25,false);
 assert.ok(context.sources.length>0);
 assert.ok(context.sources.every(source=>source.startTime>=0&&source.startTime<.3));
 context.advance(20);const before=context.sources.length;music.update('preparation',5,false);
 const recovered=context.sources.slice(before);
 assert.ok(recovered.length<15,'a stalled frame does not burst all missed notes');
 assert.ok(recovered.every(source=>source.startTime>=20),'never schedules missed notes in the past');
 context.advance(64*MUSIC_BEAT_SECONDS+.01);music.update('preparation',5,false);
 assert.ok(context.sources.some(source=>source.startTime>41.7),'phrase loops');music.dispose();
});

test('music crossfades phases, fades on pause, returns to menu music, and releases every source on disposal',()=>{
 const {context,music}=director();music.update('practice',0,false);const first=context.sources.slice();
 context.advance(.1);music.update('hunt',50,false);
 assert.ok(context.sources.length>first.length,'next arrangement begins during previous release');
 assert.ok(first.some(source=>source.stopTime>.1),'prior notes fade instead of being cut');
 context.advance(1.2);music.update('hunt',29,false);const beforePause=context.sources.length;
 context.advance(1.3);music.update('hunt',29,true);context.advance(2);music.update('hunt',29,true);
 assert.equal(context.sources.length,beforePause,'pause never schedules more notes');
 assert.ok(context.sources.every(source=>source.stopTime<=2||source.startTime+(source.buffer?.duration??0)<=2),'all paused voices stop');
 music.update('hunt',28,false);assert.ok(context.sources.length>beforePause,'resume restarts the arrangement');
 music.update('menu',0,false);context.advance(3);const beforeMenu=context.sources.length;music.update('menu',0,false);assert.ok(context.sources.length>beforeMenu,'returning to menu keeps the cozy score scheduled');
 const atMenu=context.sources.length;
 music.dispose();assert.ok(context.sources.every(source=>source.connections.length===0));
 music.update('practice',0,false);assert.equal(context.sources.length,atMenu,'disposed music stays silent');
});

test('the menu plays the original cozy score after audio is unlocked and settings keep the phrase continuous',()=>{
 const {context,music}=director();music.update('menu',0,false);
 assert.ok(context.sources.length>0,'an unlocked main menu must have background music');
 const sources=context.sources.map(source=>({source,stop:source.stopTime}));context.advance(.1);music.update('menu',0,false);
 assert.ok(sources.every(({source,stop})=>source.stopTime===stop),'opening menu settings does not shorten the scheduled notes');
 context.advance(.4);const before=context.sources.length;music.update('menu',0,false);
 assert.ok(context.sources.length>before,'menu music continues scheduling after the first click');
 music.dispose();
});

test('music volume and cue ducking use independent gain controls',()=>{
 const {context,music}=director();music.setVolume(.3);music.update('practice',0,false);
 assert.ok(context.gains.some(gain=>gain.gain.value===.3),'own music gain is applied');
 music.duck(.25,1);assert.ok(context.gains.some(gain=>gain.gain.events.some(event=>event.value===.25)),'important sound cues reduce music');
 music.setVolume(0);assert.ok(context.gains.some(gain=>gain.gain.value===0));
 music.setVolume(Number.NaN);music.dispose();
});

test('footsteps do not indefinitely extend the deeper taunt duck',()=>{
 const {context,music}=director();music.duck(.25,1);
 const gain=context.gains.find(gain=>gain.gain.events.some(event=>event.value===.25))!;
 context.advance(.9);music.duck(.68,.2);
 assert.ok(gain.gain.events.at(-1)!.at<=1.34,'the taunt releases at its original end');
 context.advance(1.1);music.duck(.68,.2);
 assert.ok(gain.gain.events.some(event=>event.at>=1.1&&event.value===.68),'walking returns to the lighter duck');music.dispose();
});

test('pausing during a phase crossfade stops both arrangements promptly',()=>{
 const {context,music}=director();music.update('practice',0,false);
 context.advance(.1);music.update('hunt',40,false);
 context.advance(.2);music.update('hunt',40,true);
 assert.ok(context.sources.every(source=>source.stopTime<=.405),'old and new phase fade together on pause');music.dispose();
});

test('procedural instruments produce bounded, non-silent PCM with click-free boundaries',()=>{
 for(const instrument of ['marimba','pluck','pad','bass','brush','kick','shaker'] as const){
  const pcm=synthesizeMusicNote(instrument,60,2*MUSIC_BEAT_SECONDS,12000);
  let square=0,peak=0;for(const sample of pcm){assert.ok(Number.isFinite(sample));square+=sample*sample;peak=Math.max(peak,Math.abs(sample))}
  assert.ok(Math.sqrt(square/pcm.length)>.01,`${instrument} is audible`);
  assert.ok(peak<1,`${instrument} has headroom`);
  assert.ok(Math.abs(pcm[0])<.0001&&Math.abs(pcm[pcm.length-1])<.0001,`${instrument} has no edge click`);
 }
});

test('a rendered phrase has sustained musical energy, headroom, and a quieter search mix',()=>{
 const measured:Record<string,number>={};
 for(const mood of ['cozy','hunt','urgent','resolved'] as const){
  const sampleRate=12000,length=Math.round(64*MUSIC_BEAT_SECONDS*sampleRate),mix=new Float32Array(length);
  const samples=new Map<string,Float32Array>();
  for(const note of composeMusic(mood)){
   const key=`${note.instrument}:${note.midi}:${note.duration}`;
   let pcm=samples.get(key);if(!pcm){pcm=synthesizeMusicNote(note.instrument,note.midi,note.duration*MUSIC_BEAT_SECONDS,sampleRate);samples.set(key,pcm)}
   const offset=Math.round(note.beat*MUSIC_BEAT_SECONDS*sampleRate);
   // Same gain as one stereo channel at normal master/music defaults. Wrap tails across the loop.
   const gain=note.velocity*Math.cos((note.pan+1)*Math.PI/4)*.55*.65*.95;
   for(let i=0;i<pcm.length;i++)mix[(offset+i)%length]+=pcm[i]*gain;
  }
  let energy=0,peak=0,minWindow=1;
  for(let offset=0;offset<length;offset+=sampleRate){
   let windowEnergy=0;const count=Math.min(sampleRate,length-offset);
   for(let i=offset;i<offset+count;i++){windowEnergy+=mix[i]*mix[i];peak=Math.max(peak,Math.abs(mix[i]))}
   energy+=windowEnergy;minWindow=Math.min(minWindow,Math.sqrt(windowEnergy/count));
  }
  measured[mood]=Math.sqrt(energy/length);
  assert.ok(measured[mood]>.004,`${mood} remains audible at default gain: ${measured[mood]}`);
  assert.ok(minWindow>.0015,`${mood} has no empty one-second sections: ${minWindow}`);
  assert.ok(peak<.25,`${mood} leaves headroom for positional effects: ${peak}`);
  assert.ok(Math.abs(mix[0]-mix[length-1])<.006,`${mood} has no discontinuity at the loop seam`);
 }
 assert.ok(measured.hunt<measured.cozy*.85,`search mix (${measured.hunt}) is below preparation (${measured.cozy})`);
});
