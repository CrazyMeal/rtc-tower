const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const page=await (await browser.newContext({viewport:{width:1100,height:900}})).newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const fav=(stop,route,mode='route')=>({stop,route,direction:'1',mode,label:'',name:'Arrêt '+stop});
await page.addInitScript(cfg=>localStorage.setItem('rtc-tower.favorites.v1',cfg),JSON.stringify({version:2,favorites:[fav('1001','70'),fav('1002','584'),fav('1003','803'),fav('1004','910'),fav('1005','70','all')],groups:[{id:'g-a',name:'Maison',favorites:['1001:70:1'],triggers:[{days:[1,2,3,4,5,6,7],from:'00:00'}]}]}));
// The RTC never answers: colours must still come from the route numbers, whatever group is shown.
await page.route('https://api-iv.rtcquebec.ca/**',route=>route.abort());
await page.goto('http://127.0.0.1:8080');await page.locator('.tile').first().waitFor();
await page.getByRole('button',{name:/^Modifier le groupe/}).click();
const badge=stop=>page.locator('#member-list label',{hasText:'· '+stop}).locator('.route-badge');
for(const [stop,cls] of [['1001','is-lebus'],['1002','is-express'],['1003','is-metrobus'],['1004','is-couchetard'],['1005','is-unknown']]) assert.equal(await badge(stop).evaluate((n,c)=>n.classList.contains(c),cls),true,stop+' '+cls);
assert.equal(await page.locator('.member-dir:not(:has(*))').filter({hasText:'→'}).count(),0,'no direction without data');
assert.deepEqual(errors,[]);
console.log('PASS: group editor colours never-loaded routes from their number (leBus, eXpress, Métrobus, Couche-tard), neutral for whole-stop favorites; no JS errors.');
await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
