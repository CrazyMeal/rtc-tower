const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
// Tuesday 2026-10-27, 07:40 in Québec (EDT).
await page.clock.install({time:new Date('2026-10-27T11:40:00Z')});
const stops={'5419':{nom:'Galeries/5419',route:'70',direction:'1',to:'Val-Bélair'},'5015':{nom:'R.-Bourassa/5015',route:'71',direction:'0',to:'Terminus Gare-du-Palais'}};
await page.route('https://api-iv.rtcquebec.ca/**',route=>{
  const stop=new URL(route.request().url()).searchParams.get('noArret'),s=stops[stop];
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({arret:{noArret:stop,nom:s.nom,description:s.nom},parcours:{noParcours:s.route,codeDirection:s.direction,codeTypeService:0,descriptionDirection:s.to},horaires:[7,17,27].map(m=>({depart:new Date(Date.now()+m*60000).toISOString(),ntr:true,annule:false}))})});
});
const fav=(stop,r,d,name)=>({stop,route:r,direction:d,mode:'route',label:'',name});
await page.addInitScript(()=>{ if(localStorage.getItem('rtc-tower.favorites.v1')===null) localStorage.setItem('rtc-tower.favorites.v1',JSON.stringify({version:2,favorites:[
  {stop:'5419',route:'70',direction:'1',mode:'route',label:'',name:'Galeries/5419'},{stop:'5015',route:'71',direction:'0',mode:'route',label:'',name:'R.-Bourassa/5015'}],
  groups:[{id:'g-work',name:'Travail',favorites:['5419:70:1'],triggers:[{days:[1,2,3,4,5],from:'05:00'}]},{id:'g-back',name:'Retour',favorites:['5015:71:0'],triggers:[{days:[1,2,3,4,5],from:'13:00'}]}]})); });
const pill=name=>page.getByRole('button',{name,exact:true});
const tile=key=>page.locator(`.tile[data-favorite="${key}"]`);
await page.goto('http://127.0.0.1:8080');
await tile('5419:70:1').waitFor();
// Morning: the work group is shown automatically.
assert.equal(await page.locator('.tile').count(),1);
assert.equal(await pill('Travail').getAttribute('aria-pressed'),'true');
assert.match(await page.locator('.view-status').innerText(),/Automatique · jusqu’à 13 h 00/);
assert.equal(await page.locator('#count').innerText(),'1');
// Afternoon: the view switches by itself.
await page.clock.fastForward('09:30:00');
await tile('5015:71:0').waitFor();
assert.equal(await page.locator('.tile').count(),1);
assert.equal(await pill('Retour').getAttribute('aria-pressed'),'true');
// Manual choice, then back to automatic.
await pill('Tous').click();
await page.waitForFunction(()=>document.querySelectorAll('.tile').length===2);
assert.match(await page.locator('.view-status').innerText(),/Choisi manuellement · retour automatique demain 05 h 00/);
await page.getByRole('button',{name:'Revenir en auto'}).click();
await page.waitForFunction(()=>document.querySelectorAll('.tile').length===1);
assert.equal(await pill('Retour').getAttribute('aria-pressed'),'true');
// A manual choice survives a reload.
await pill('Travail').click();await tile('5419:70:1').waitFor();
await page.reload();await tile('5419:70:1').waitFor();
assert.equal(await pill('Travail').getAttribute('aria-pressed'),'true');
assert.match(await page.locator('.view-status').innerText(),/Choisi manuellement/);
// Create a group from the dialog; it opens right away.
await page.getByRole('button',{name:'+ Groupe'}).click();
await page.locator('#group-name').fill('Soir');
await page.locator('#member-list label',{hasText:'R.-Bourassa'}).locator('input').check();
await page.locator('#group-form button[type=submit]').click();
await tile('5015:71:0').waitFor();
assert.equal(await pill('Soir').getAttribute('aria-pressed'),'true');
assert.equal(await page.locator('.tile').count(),1);
// Group membership from a tile menu, in the "Tous" view.
await pill('Tous').click();await page.waitForFunction(()=>document.querySelectorAll('.tile').length===2);
await page.getByLabel('Options pour Galeries/5419',{exact:true}).click();
await page.getByRole('button',{name:'Groupe Soir : Galeries/5419'}).click();
await page.getByRole('button',{name:'Groupe Soir : Galeries/5419'}).waitFor();
assert.equal(await page.getByRole('button',{name:'Groupe Soir : Galeries/5419'}).getAttribute('aria-pressed'),'true');
await pill('Soir').click();await page.waitForFunction(()=>document.querySelectorAll('.tile').length===2);
// Deleting the group falls back to automatic.
await page.getByRole('button',{name:'Modifier',exact:true}).click();
await page.locator('#group-delete').click();
await page.waitForFunction(()=>![...document.querySelectorAll('.view-pill')].some(p=>p.textContent==='Soir'));
assert.equal(await page.locator('.view-pill').count(),3);
// Invalid group is refused with a message.
await page.getByRole('button',{name:'+ Groupe'}).click();await page.locator('#group-form button[type=submit]').click();
assert.match(await page.locator('#group-error').innerText(),/Donnez un nom/);await page.locator('#group-cancel').click();
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/rtc-groups-mobile.png',fullPage:true});
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'+ Groupe'}).click();await page.screenshot({path:'/tmp/rtc-groups-dialog.png'});await page.locator('#group-cancel').click();
await page.screenshot({path:'/tmp/rtc-groups-desktop.png'});
assert.deepEqual(errors,[]);
console.log('PASS: automatic group by day/time, auto switch over time, manual choice and return to auto, persistence, group creation, membership from tile menu, deletion, validation, mobile overflow; no JS errors.');
await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
