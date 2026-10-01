import './styles.css';
import {Game} from './game.ts';
import {onLanguageChange,translate,syncDocumentLanguage} from './i18n.ts';

syncDocumentLanguage();

const ui=document.querySelector('#ui')!;
let bootFailed=false;
function renderLoading(){
  if(bootFailed){
    ui.innerHTML=`<div class="loading"><h1>${translate('公馆暂时无法打开')}</h1><p id="boot-error">${translate('请重新加载游戏。如果问题仍然存在，请检查浏览器是否支持 WebGL。')}</p><button id="boot-reload">${translate('重新加载')}</button></div>`;
    ui.querySelector('#boot-reload')!.addEventListener('click',()=>location.reload());
    return;
  }
  const message=ui.querySelector('.loading p')?.getAttribute('data-loading-message')??'正在打开公馆的大门…';
  ui.innerHTML=`<div class="loading"><div class="brand-mark">H</div><p>${translate(message)}</p><span>${translate('准备体素世界与物理引擎')}</span></div>`;
  ui.querySelector('.loading p')!.setAttribute('data-loading-message',message);
}
renderLoading();
const stopLoadingUpdates=onLanguageChange(()=>{if(bootFailed||ui.querySelector('.loading'))renderLoading()});
Game.create().then(async game=>{
  stopLoadingUpdates();
  if(import.meta.env.DEV||import.meta.env.MODE==='test'){
    (window as any).__game=game;
    const params=new URLSearchParams(location.search),review=params.get('map-review');
    if(review)(await import('./map-inspection.ts')).openMapInspection(game,review);
    else if(params.has('map-test'))(await import('./map-inspection.ts')).openGameplayInspection(game);
  }
}).catch(error=>{
  console.error(error);
  bootFailed=true;
  renderLoading();
});
