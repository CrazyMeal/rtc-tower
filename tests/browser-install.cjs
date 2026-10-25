const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const base='http://127.0.0.1:8080';
const fake=`(()=>{const e=new Event('beforeinstallprompt',{cancelable:true});window.__prompts=0;e.prompt=async()=>{window.__prompts++};e.userChoice=Promise.resolve({outcome:'accepted'});window.dispatchEvent(e)})()`;
const open=async(viewport,init)=>{const context=await browser.newContext({viewport});const page=await context.newPage();if(init)await page.addInitScript(init);await page.route('https://api-iv.rtcquebec.ca/**',r=>r.abort());await page.goto(base);return page};
// manifest and icons
let page=await open({width:390,height:844});
const manifest=await page.evaluate(async()=>(await fetch(document.querySelector('link[rel=manifest]').href)).json());
for(const icon of manifest.icons){const size=await page.evaluate(src=>new Promise((ok,ko)=>{const i=new Image();i.onload=()=>ok(i.naturalWidth);i.onerror=ko;i.src=src}),icon.src);assert.equal(`${size}x${size}`,icon.sizes)}
assert.equal(await page.locator('#install-app').isVisible(),false);
await page.evaluate(()=>navigator.serviceWorker.ready);
await page.evaluate(fake);assert.equal(await page.locator('#install-app').isVisible(),true);
await page.locator('#install-app').click();assert.equal(await page.evaluate(()=>window.__prompts),1);assert.equal(await page.locator('#install-app').isVisible(),false);
await page.evaluate(fake);assert.equal(await page.locator('#install-app').isVisible(),true);
await page.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));assert.equal(await page.locator('#install-app').isVisible(),false);
// small phone: header stays on one line, transfer becomes icon-only
await page.setViewportSize({width:360,height:800});await page.evaluate(fake);
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
assert.equal(await page.locator('#open-transfer span').isVisible(),false);
await page.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));assert.equal(await page.locator('#open-transfer span').isVisible(),true);
// desktop never shows it
page=await open({width:1440,height:1000});await page.evaluate(fake);assert.equal(await page.locator('#install-app').isVisible(),false);
// already running as an app
page=await open({width:390,height:844},`const mm=window.matchMedia.bind(window);window.matchMedia=q=>q.includes('standalone')?{matches:true,addEventListener(){},removeEventListener(){}}:mm(q)`);
await page.evaluate(fake);assert.equal(await page.locator('#install-app').isVisible(),false);
await browser.close();console.log('install ok');
})().catch(e=>{console.error(e);process.exit(1)});
