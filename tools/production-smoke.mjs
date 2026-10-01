import {preview} from 'vite';
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';

const executable=[process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(candidate=>candidate&&existsSync(candidate));
if(!executable)throw new Error('Install Chrome / Edge or set CHROME_PATH before running the browser smoke check.');

const out='.artifacts/production-smoke';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:executable,headless:true});
const results=[];
try{
  // The same unchanged build must work at both common static-host locations.
  for(const base of ['/','/hideaway/']){
    const label=base==='/'?'root':'subpath',folder=`${out}/${label}`;
    await mkdir(folder,{recursive:true});
    const server=await preview({base,preview:{host:'127.0.0.1',port:0}});
    const address=server.httpServer.address();
    assert.ok(address&&typeof address==='object');
    const origin=`http://127.0.0.1:${address.port}`,url=origin+base;
    const context=await browser.newContext({viewport:{width:1280,height:800}});
    const page=await context.newPage(),errors=[],external=[],failed=[],models=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{
      if(/^https?:/.test(request.url())&&!request.url().startsWith(origin+'/'))external.push(request.url());
    });
    page.on('response',response=>{
      if(response.status()>=400)failed.push({url:response.url(),status:response.status()});
      if(response.url().endsWith('models/characters/hunter-kit.glb'))models.push({url:response.url(),status:response.status()});
    });
    let passed=false;
    try{
      await page.goto(url,{waitUntil:'networkidle'});
      await page.locator('[data-action=practice]').waitFor({timeout:60000});
      assert.equal(await page.evaluate(()=>typeof window.__game),'undefined');
      assert.deepEqual(models,[{url:`${url}models/characters/hunter-kit.glb`,status:200}]);
      await page.screenshot({path:`${folder}/menu.png`});
      await page.locator('[data-action=practice]').click();
      await page.keyboard.press('Tab');
      await page.locator('[data-preset]').selectOption('cup');
      assert.ok(await page.locator('.ve-footer').innerText());
      await page.locator('[data-action=save]').click();
      await page.screenshot({path:`${folder}/editor.png`});
      const panel=await page.locator('.voxel-editor').boundingBox();
      assert.ok(panel&&panel.x>=0&&panel.y>=0&&panel.y+panel.height<=800);
      await page.keyboard.press('Tab');
      await page.keyboard.press('Escape');
      await page.locator('[data-action=menu]').click();
      await page.locator('[data-action=end]').click();
      assert.equal(await page.locator('.total-list>div').count(),1);
      assert.deepEqual(errors,[]);
      assert.deepEqual(external,[]);
      assert.deepEqual(failed,[]);
      passed=true;
      console.log(`PASS production ${base}: boot, local assets, editor save and menu return`);
    }catch(error){
      await page.screenshot({path:`${folder}/failure.png`});
      throw error;
    }finally{
      results.push({base,passed,errors,external,failed,models});
      await context.close();
      await new Promise(resolve=>server.httpServer.close(resolve));
    }
  }
}finally{
  await writeFile(`${out}/result.json`,JSON.stringify(results,null,2));
  await browser.close();
}
