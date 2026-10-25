const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const page=await (await browser.newContext({viewport:{width:390,height:844}})).newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const stops={'5419':{route:'70',to:'Val-Bélair'},'5015':{route:'71',to:'Terminus Gare-du-Palais'}};
const calls={'5419':0,'5015':0};let online=true;
await page.route('https://api-iv.rtcquebec.ca/**',route=>{
  if(!online)return route.abort();
  const stop=new URL(route.request().url()).searchParams.get('noArret'),s=stops[stop];calls[stop]++;
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({arret:{noArret:stop,nom:'Arrêt '+stop,description:''},parcours:{noParcours:s.route,codeDirection:'0',codeTypeService:0,descriptionDirection:s.to},horaires:[]})});
});
// Favorites saved before directions were kept: no "to" yet. Only the first is in the shown group.
await page.addInitScript(()=>{if(localStorage.getItem('rtc-tower.favorites.v1')===null)localStorage.setItem('rtc-tower.favorites.v1',JSON.stringify({version:2,favorites:[
  {stop:'5419',route:'70',direction:'0',mode:'route',label:'',name:'Arrêt 5419'},{stop:'5015',route:'71',direction:'0',mode:'route',label:'',name:'Arrêt 5015'}],
  groups:[{id:'g-a',name:'Maison',favorites:['5419:70:0'],triggers:[{days:[1,2,3,4,5,6,7],from:'00:00'}]}]}));});
await page.goto('http://127.0.0.1:8080');await page.locator('.tile').first().waitFor();
assert.equal(calls['5015'],0,'the hidden stop is not polled');
// Opening the editor asks once about the stop that was never shown, and both directions appear.
await page.getByRole('button',{name:/^Modifier le groupe/}).click();
const dir=stop=>page.locator('#member-list label',{hasText:'· '+stop}).locator('.member-dir');
await dir('5419').waitFor();await dir('5015').waitFor();
assert.equal(await dir('5015').innerText(),'→ Terminus Gare-du-Palais');assert.equal(calls['5015'],1);
const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('rtc-tower.favorites.v1')).favorites.map(f=>f.to));
assert.deepEqual(stored,['Val-Bélair','Terminus Gare-du-Palais'],'directions are saved with the favorites');
// A reload with the RTC unreachable still shows them, and nothing is asked again when it is back.
await page.getByRole('button',{name:'Annuler'}).click();online=false;await page.reload();await page.locator('.tile').first().waitFor();
await page.getByRole('button',{name:/^Modifier le groupe/}).click();
assert.equal(await dir('5419').innerText(),'→ Val-Bélair');assert.equal(await dir('5015').innerText(),'→ Terminus Gare-du-Palais');
await page.getByRole('button',{name:'Annuler'}).click();online=true;const before={...calls};
await page.getByRole('button',{name:/^Modifier le groupe/}).click();await page.waitForTimeout(500);
assert.equal(calls['5015'],before['5015'],'no request once every direction is known');
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
assert.deepEqual(errors,[]);
console.log('PASS: directions are learned once, saved with the favorites, survive a reload offline and are not requested again; no JS errors.');
await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
