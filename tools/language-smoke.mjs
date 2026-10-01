import {preview} from 'vite';
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';

const executable=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(path=>path&&existsSync(path));
assert.ok(executable,'Install Chrome / Edge or set CHROME_PATH');
const server=await preview({preview:{host:'127.0.0.1',port:0}});
const address=server.httpServer.address();
const browser=await chromium.launch({executablePath:executable,headless:true});
await mkdir('.artifacts/language-smoke',{recursive:true});
const context=await browser.newContext({locale:'en-US',viewport:{width:1280,height:800}});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const english=async(selector)=>{
 const text=await page.locator(selector).innerText();
 assert.doesNotMatch(text,/[\p{Script=Han}]/u,`${selector}: ${text}`);
};
try{
 await page.goto(`http://127.0.0.1:${address.port}`,{waitUntil:'networkidle'});
 await page.locator('[data-action=practice]').waitFor({timeout:60000});
 assert.equal(await page.locator('html').getAttribute('lang'),'en');
 assert.equal(await page.locator('[data-action=practice]').innerText(),'◇\nFree practice\nExplore · Create voxels · Save disguises\n↗');
 await english('.menu-content');await english('.house-ticket');
 assert.equal(await page.locator('[data-action=quick-hunter]').count(),0);
 assert.doesNotMatch(await page.locator('#ui').innerText(),/DEMO|v\d+\.\d+/i);
 await page.screenshot({path:'.artifacts/language-smoke/menu-en.png'});
 await page.locator('[data-action=language]').click();
 assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');
 await page.reload({waitUntil:'networkidle'});await page.locator('[data-action=practice]').waitFor({timeout:60000});
 assert.match(await page.locator('[data-action=practice]').innerText(),/自由练习/);
 await page.locator('[data-action=language]').click();
 await page.locator('[data-action=settings]').click();await english('#settings-dialog');
 await page.locator('[name=volume]').fill('0.35');
 await page.locator('[type=submit]').click();
 await page.locator('[data-action=models]').click();await english('.voxel-library');
 await page.locator('[data-category=preset]').click();
 await page.locator('.ve-model-card').first().waitFor();
 console.log('Preset titles:',await page.locator('.ve-model-card h3').allTextContents());
 await page.locator('[data-category=scene]').click();
 await page.waitForFunction(()=>document.querySelectorAll('.ve-model-card').length>20);
 for(const name of await page.locator('.ve-model-card h3').allTextContents())assert.doesNotMatch(name,/[\p{Script=Han}]/u,name);
 await page.keyboard.press('Escape');
 await page.locator('[data-action=practice]').click();
 await page.keyboard.press('Tab');
 await page.locator('.voxel-editor').waitFor();
 for(const tab of ['geometry','paint','selection']){
  await page.locator(`[data-tab=${tab}]`).click();
  // Part names are editable user data; form values retain their original language.
  const copy=await page.locator('.voxel-editor').evaluate(panel=>{
   const clone=panel.cloneNode(true);clone.querySelectorAll('[data-part]').forEach(node=>node.remove());return clone.textContent;
  });
  assert.doesNotMatch(copy,/[\p{Script=Han}]/u,copy);
 }
 await page.screenshot({path:'.artifacts/language-smoke/editor-en.png'});
 await page.locator('[data-tab=geometry]').click();
 await page.locator('[data-name]').fill('我的中文杯子');
 await page.locator('[data-action=save]').click();
 await page.waitForFunction(()=>document.querySelector('#toast')?.textContent?.includes('我的中文杯子'));
 assert.match(await page.locator('#toast').innerText(),/^Saved “我的中文杯子”/);
 await page.keyboard.press('Tab');await page.keyboard.press('Escape');
 await page.locator('[data-action=menu]').click();
 await page.locator('#pause-dialog [data-action=language]').click();
 assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');
 assert.match(await page.locator('#pause-dialog').innerText(),/游戏已暂停/);
 await page.locator('#pause-dialog [data-action=language]').click();await english('#pause-dialog .eyebrow');
 await page.locator('[data-action=end]').click();await english('.totals-dialog');
 await page.locator('[data-action=menu]').click();
 await page.locator('[data-action=settings]').click();
 await page.locator('[name=preparationSeconds]').fill('5');
 await page.locator('[name=huntSeconds]').fill('10');
 await page.locator('[name=role]').selectOption('hunter');
 await page.locator('[type=submit]').click();
 await page.locator('[data-action=hunt]').click();
 await page.waitForFunction(()=>document.querySelector('#phase-name')?.textContent==='The hunt is on',{},{timeout:20000});
 await english('#hud-bottom');await english('.hud-top');
 await page.waitForFunction(()=>document.querySelector('#phase-name')?.textContent==='Hideouts revealed',{},{timeout:25000});
 await english('#reveal-card');
 await page.screenshot({path:'.artifacts/language-smoke/reveal-en.png'});
 await page.locator('[data-action=menu]').click();
 await page.locator('[data-action=end]').click();
 await page.locator('[data-action=menu]').click();
 await page.setViewportSize({width:800,height:600});
 await page.screenshot({path:'.artifacts/language-smoke/menu-en-small.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS bilingual menu, settings, library, editor, HUD, pause, totals, persistence and custom names');
}catch(error){await page.screenshot({path:'.artifacts/language-smoke/failure.png'});throw error}
finally{await browser.close();await new Promise(resolve=>server.httpServer.close(resolve))}
