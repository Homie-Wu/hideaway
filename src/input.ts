export class Input {
 keys=new Set<string>();pressed=new Set<string>();buttons=new Set<number>();clicked=new Set<number>();dx=0;dy=0;wheel=0;canvas:HTMLCanvasElement;
 constructor(canvas:HTMLCanvasElement){this.canvas=canvas;
 window.addEventListener('keydown',e=>{if((e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable]'))return;if(!this.locked)return;if(e.code==='Escape'){this.unlock();this.clear();return}if(['Tab','Space','ControlLeft','ControlRight'].includes(e.code))e.preventDefault();if(!this.keys.has(e.code))this.pressed.add(e.code);this.keys.add(e.code)});
 window.addEventListener('keyup',e=>this.keys.delete(e.code));window.addEventListener('blur',()=>this.clear());document.addEventListener('pointerlockchange',()=>{this.dx=this.dy=0;this.keys.clear();this.buttons.clear()});
 canvas.addEventListener('mousedown',e=>{this.buttons.add(e.button);this.clicked.add(e.button)});window.addEventListener('mouseup',e=>this.buttons.delete(e.button));
 canvas.addEventListener('contextmenu',e=>e.preventDefault());window.addEventListener('mousemove',e=>{if(this.locked){this.dx+=e.movementX;this.dy+=e.movementY}});canvas.addEventListener('wheel',e=>{this.wheel+=Math.sign(e.deltaY);e.preventDefault()},{passive:false});
 }
 get locked(){return document.pointerLockElement===this.canvas} key(...codes:string[]){return codes.some(c=>this.keys.has(c))} tap(code:string){return this.pressed.has(code)}
 async lock(){try{await this.canvas.requestPointerLock()}catch{/* Browser may reject a rapid re-entry; next click retries. */}}
 unlock(){if(this.locked)document.exitPointerLock()}endFrame(){this.pressed.clear();this.clicked.clear();this.dx=this.dy=this.wheel=0}clear(){this.keys.clear();this.buttons.clear();this.endFrame()}
}
