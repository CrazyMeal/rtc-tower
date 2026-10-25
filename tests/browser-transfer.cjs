const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const errors=[];
const open=async(init)=>{const context=await browser.newContext({viewport:{width:1100,height:900},acceptDownloads:true});await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:'http://127.0.0.1:8080'});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://api-iv.rtcquebec.ca/**',route=>{const stop=new URL(route.request().url()).searchParams.get('noArret');return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({arret:{noArret:stop,nom:'Arrêt '+stop,description:''},parcours:{noParcours:stop==='5419'?'70':'71',codeDirection:stop==='5419'?'1':'0',codeTypeService:0,descriptionDirection:'Quelque part'},horaires:[7,17].map(m=>({depart:new Date(Date.now()+m*60000).toISOString(),ntr:true,annule:false}))})})});
  if(init)await page.addInitScript(init);return {context,page};};
const config={version:2,favorites:[{stop:'5419',route:'70',direction:'1',mode:'route',label:'Maison',name:'Galeries/5419'},{stop:'5015',route:'71',direction:'0',mode:'route',label:'',name:'R.-Bourassa/5015'}],groups:[{id:'g-work',name:'Travail',favorites:['5419:70:1'],triggers:[{days:[1,2,3,4,5,6,7],from:'00:00'}]},{id:'g-back',name:'Retour',favorites:['5015:71:0'],triggers:[]}]};
// A: source device with groups.
const A=await open(`if(localStorage.getItem('rtc-tower.favorites.v1')===null)localStorage.setItem('rtc-tower.favorites.v1',${JSON.stringify(JSON.stringify(config))})`);
await A.page.goto('http://127.0.0.1:8080');await A.page.locator('.tile').first().waitFor();
await A.page.locator('#open-transfer').click();
await A.page.waitForFunction(()=>document.querySelector('#transfer-link').value.includes('#import=1.'));
const link=await A.page.locator('#transfer-link').inputValue();
assert.ok(await A.page.locator('#transfer-local').isVisible(),'local server warning shown');
await A.page.locator('#transfer-copy').click();await A.page.getByText('Lien copié.').waitFor();assert.equal(await A.page.evaluate(()=>navigator.clipboard.readText()),link);
const [download]=await Promise.all([A.page.waitForEvent('download'),A.page.locator('#transfer-download').click()]);
assert.match(download.suggestedFilename(),/^rtc-tower-\d{4}-\d{2}-\d{2}\.json$/);const file=await download.path();
// B: empty device opens the link; cancel keeps its own config.
const B=await open();await B.page.goto('http://127.0.0.1:8080');await B.page.locator('.tile').first().waitFor();assert.equal(await B.page.locator('.tile').count(),1);
await B.page.goto(link);await B.page.locator('#import-dialog[open]').waitFor();assert.ok((await B.page.locator('#import-summary').innerText()).includes('2 arrêts, 2 groupes (Travail, Retour)'));
assert.equal(await B.page.evaluate(()=>location.hash),'','hash cleaned immediately');
await B.page.locator('#import-cancel').click();assert.equal(await B.page.locator('.tile').count(),1);assert.equal(await B.page.locator('.view-pill').count(),0);
await B.page.goto(link);await B.page.locator('#import-dialog[open]').waitFor();await B.page.getByRole('button',{name:'Remplacer',exact:true}).click();
await B.page.getByRole('button',{name:'Travail',exact:true}).waitFor();assert.equal(await B.page.locator('.view-pill').count(),3);assert.ok((await B.page.locator('.tile').first().innerText()).includes('Maison'));
await B.page.reload();await B.page.getByRole('button',{name:'Retour',exact:true}).waitFor();assert.equal(await B.page.locator('#import-dialog[open]').count(),0,'reload does not re-ask');
// Tampered link: error notice, config untouched.
await B.page.goto(link.slice(0,-12)+'AAAAAAAAAAAA');await B.page.locator('#transfer-notice').waitFor({state:'visible'});assert.ok((await B.page.locator('#transfer-notice').innerText()).includes('lien de transfert'));assert.equal(await B.page.locator('.view-pill').count(),3);
// Pasted link in the dialog.
const C=await open();await C.page.goto('http://127.0.0.1:8080');await C.page.locator('.tile').first().waitFor();await C.page.locator('#open-transfer').click();await C.page.locator('#transfer-paste').fill(link);await C.page.locator('#transfer-paste-go').click();await C.page.locator('#import-dialog[open]').waitFor();await C.page.getByRole('button',{name:'Remplacer',exact:true}).click();await C.page.getByRole('button',{name:'Travail',exact:true}).waitFor();
// File import into a third device, plus a bad file.
const D=await open();await D.page.goto('http://127.0.0.1:8080');await D.page.locator('.tile').first().waitFor();await D.page.locator('#open-transfer').click();
require('node:fs').writeFileSync('/tmp/rtc-bad.json','{"hello":1}');await D.page.locator('#transfer-file').setInputFiles('/tmp/rtc-bad.json');await D.page.getByText('n’est pas un export RTC Tower',{exact:false}).waitFor();
await D.page.locator('#transfer-file').setInputFiles(file);await D.page.locator('#import-dialog[open]').waitFor();await D.page.getByRole('button',{name:'Remplacer',exact:true}).click();await D.page.getByRole('button',{name:'Retour',exact:true}).waitFor();assert.equal(await D.page.locator('.view-pill').count(),3);
// Blocked storage then import recovers saving.
const E=await open(`Storage.prototype.getItem=function(){throw new Error('blocked')}`);await E.page.goto('http://127.0.0.1:8080');await E.page.locator('#storage-warning').waitFor({state:'visible'});
await E.page.goto(link);await E.page.locator('#import-dialog[open]').waitFor();await E.page.getByRole('button',{name:'Remplacer',exact:true}).click();await E.page.getByRole('button',{name:'Travail',exact:true}).waitFor();assert.equal(await E.page.locator('#storage-warning').isVisible(),false);
await E.page.setViewportSize({width:390,height:844});assert.ok(await E.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
assert.deepEqual(errors,[]);
console.log('PASS: export link/copy/download, local-host warning, import via link (cancel, replace, hash cleanup, no re-ask), tampered link, pasted link, file import, bad file, recovery from blocked storage; no JS errors.');
await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
