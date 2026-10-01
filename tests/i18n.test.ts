import {test} from 'node:test';
import assert from 'node:assert/strict';
import {detectLanguage,getLanguage,setLanguage,translate,onLanguageChange} from '../src/i18n.ts';
import {readFileSync} from 'node:fs';

test('saved language wins; Chinese browsers use Chinese and other browsers use English',()=>{
 assert.equal(detectLanguage('en',['zh-CN']),'en');
 assert.equal(detectLanguage('zh-CN',['en-US']),'zh-CN');
 assert.equal(detectLanguage(null,['zh-TW']),'zh-CN');
 assert.equal(detectLanguage('invalid',['fr-FR']),'en');
});
test('every built-in scene prop, furnishing and alternative has an English display name',()=>{
 const layout=JSON.parse(readFileSync(new URL('../src/world/layout.json',import.meta.url),'utf8'));
 const previous=getLanguage();try{
  setLanguage('en');
  for(const item of [...layout.props,...layout.furniture]){
   assert.doesNotMatch(translate(item.name),/[\p{Script=Han}]/u,item.name);
   for(const alternative of item.alternatives??[])assert.doesNotMatch(translate(alternative.name),/[\p{Script=Han}]/u,alternative.name);
  }
 }finally{setLanguage(previous)}
});
test('language changes translate gameplay and editor copy without changing custom saved names',()=>{
 const previous=getLanguage();let changes=0;const stop=onLanguageChange(()=>changes++);
 try{
  setLanguage('en');
  assert.equal(translate('第 12 局'),'Round 12');
  assert.equal(translate('游戏设置'),'Settings');
  assert.equal(translate('已保存「我的中文杯子」到我的模型'),'Saved “我的中文杯子” to My Models');
  assert.equal(translate('已选 23 个体素'),'23 voxels selected');
  const before=changes;setLanguage('en');assert.equal(changes,before);
  setLanguage('zh-CN');assert.equal(translate('游戏设置'),'游戏设置');
 }finally{stop();setLanguage(previous)}
});
test('short static labels do not leave untranslated pieces in common HUD values',()=>{
 const previous=getLanguage();try{
  setLanguage('en');
  for(const copy of ['左键取用手枪 · 补满弹药','自由观战 · WASD 飞行 · SPACE 上升 · CTRL 下降','第 2 局 · 本轮身份','练靶 20 分 · 回合不计分']){
   assert.doesNotMatch(translate(copy),/[\p{Script=Han}]/u,copy);
  }
 }finally{setLanguage(previous)}
});
