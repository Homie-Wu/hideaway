import {dictionary as uiTranslations} from './ui-translations.ts';
import {dictionary as gameTranslations} from './game-translations.ts';
import {editorTranslations,translateEditorDynamic} from './voxel/editor-translations.ts';
import {dictionary as sceneTranslations} from './scene-translations.ts';

export type Language='zh-CN'|'en';
const storageKey='hideaway-language';
export function detectLanguage(saved:string|null,languages:readonly string[]):Language {
 if(saved==='zh-CN'||saved==='en')return saved;
 return languages[0]?.toLowerCase().startsWith('zh')?'zh-CN':'en';
}
let language:Language='zh-CN';
if(typeof window!=='undefined'){
 let saved:null|string=null;
 try{saved=window.localStorage.getItem(storageKey)}catch{}
 language=detectLanguage(saved,typeof navigator==='undefined'?[]:navigator.languages);
}
const listeners=new Set<()=>void>();
const dictionary={...uiTranslations,...gameTranslations,...editorTranslations,...sceneTranslations};
const keys=Object.keys(dictionary).sort((a,b)=>b.length-a.length);
const pattern=new RegExp(keys.map(key=>key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
export const getLanguage=():Language=>language;
export function translate(text:string):string {
 if(language==='zh-CN')return text;
 const dynamic=translateEditorDynamic(text);
 if(dynamic!==undefined)return dynamic;
 const round=text.match(/^第 (\d+) 局(.*)$/);
 if(round)return `Round ${round[1]}${translate(round[2])}`;
 return text.replace(pattern,key=>dictionary[key]);
}
export function syncDocumentLanguage():void {
 if(typeof document==='undefined')return;
 document.documentElement.lang=language;
 document.title=language==='en'?'HIDEAWAY — Prop Hunt':'藏物公馆 · HIDEAWAY';
 document.querySelector('#game')?.setAttribute('aria-label',language==='en'?'HIDEAWAY 3D game':'藏物公馆三维游戏画面');
}
export function setLanguage(next:Language):void {
 if(next!== 'zh-CN'&&next!=='en')return;
 if(next===language)return;
 language=next;
 try{if(typeof window!=='undefined')window.localStorage.setItem(storageKey,next)}catch{}
 syncDocumentLanguage();
 listeners.forEach(listener=>listener());
}
export function onLanguageChange(listener:()=>void):()=>void {
 listeners.add(listener);return()=>listeners.delete(listener);
}
/** Translate freshly rendered interface text, never form values or stored assets. */
export function localizeElement(root:HTMLElement):void {
 if(!root.childNodes)return;
 const visit=(node:Node):void=>{
  if(node.nodeType===3){if(node.textContent)node.textContent=translate(node.textContent);return}
  if(node.nodeType===1){const element=node as HTMLElement;
   if(element.hasAttribute('data-user-text'))return;
   for(const name of ['aria-label','title','placeholder']){
    const value=element.getAttribute(name);if(value)element.setAttribute(name,translate(value));
   }
  }
  node.childNodes.forEach(visit);
 };
 visit(root);
}
