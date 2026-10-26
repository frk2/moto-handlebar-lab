import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {barShape,barCurve,placedBar,ergonomics,neutralRoll,len,sub} from './public/geometry.mjs';

const catalog=JSON.parse(await readFile(new URL('./data/bars.json',import.meta.url),'utf8'));
const bike=JSON.parse(await readFile(new URL('./data/bike.json',import.meta.url),'utf8'));
const rider={height:1780,posture:'standing'};

test('catalog rows are complete, unique and sourced',()=>{
 assert.ok(catalog.bars.length>=250,`only ${catalog.bars.length} bars`);
 const ids=new Set();
 for(const b of catalog.bars){
  assert.ok(!ids.has(b.id),`duplicate ${b.id}`);ids.add(b.id);
  assert.match(b.id,/^[A-Za-z0-9_.-]{1,120}$/);
  for(const k of ['brand','line','bend','dia','use'])assert.ok(typeof b[k]==='string'&&b[k],`${b.id} ${k}`);
  assert.ok(b.width>=500&&b.width<=1000,`${b.id} width ${b.width}`);
  assert.ok(b.rise>=0&&b.rise<=320,`${b.id} rise ${b.rise}`);
  assert.ok(b.pullback>=-20&&b.pullback<=200,`${b.id} pullback ${b.pullback}`);
  assert.match(b.source,/^https:\/\//,`${b.id} source`);
 }
 for(const brand of ['Renthal','Pro Taper','ODI'])assert.ok(catalog.bars.some(b=>b.brand===brand),brand);
});

test('every bar is built to its published width, rise and pullback',()=>{
 for(const b of catalog.bars){
  const s=barShape(b);
  assert.ok(len(sub(s.end,[b.width/2,b.rise,b.pullback]))<0.01,b.id);
  const {points}=barCurve(b);
  assert.ok(points.every(p=>p.every(Number.isFinite)),b.id);
  assert.ok(Math.abs(points[0][0]+b.width/2)<0.01&&Math.abs(points.at(-1)[0]-b.width/2)<0.01,b.id);
  const e=ergonomics(bike,b,{roll:0},rider);
  for(const [k,v] of Object.entries(e.metrics))if(typeof v==='number')assert.ok(Number.isFinite(v),`${b.id} ${k}`);
 }
});

test('roll, risers and rise move the hands the way a rider expects',()=>{
 const bar={width:800,rise:90,pullback:60,dia:'1-1/8 tapered'};
 const at=setup=>placedBar(bike,bar,setup);
 const base=at({roll:0}),fwd=at({roll:10}),back=at({roll:-10}),up=at({roll:0,riser:20}),ahead=at({roll:0,mountShift:15});
 assert.ok(fwd.hand[0]>base.hand[0]+5&&back.hand[0]<base.hand[0]-5);
 assert.ok(up.hand[1]>base.hand[1]+15);
 assert.ok(ahead.hand[0]>base.hand[0]+10);
 const tall=placedBar(bike,{...bar,rise:120},{roll:0});
 assert.ok(tall.hand[1]>base.hand[1]+20);
 // At 0° the clamp-to-bend section stands parallel to the steering axis.
 const knee=sub(base.mount.toWorld(base.shape.knee),base.mount.clamp),s=[-Math.sin(bike.rake*Math.PI/180),Math.cos(bike.rake*Math.PI/180)];
 assert.ok(Math.abs(knee[0]*s[1]-knee[1]*s[0])<0.5);
 assert.ok(neutralRoll(base.shape)>0);
 // Calibration: a stock-like bend reaches the grip seen in the photo (981, 1293 mm) within 40 mm.
 assert.ok(Math.hypot(base.end[0]-981,base.end[1]-1293)<40);
});

test('the rider stands more upright on taller bars',()=>{
 const low=ergonomics(bike,{width:800,rise:70,pullback:55,dia:'1-1/8 tapered'},{roll:0},rider).metrics;
 const high=ergonomics(bike,{width:800,rise:130,pullback:55,dia:'1-1/8 tapered'},{roll:0},rider).metrics;
 assert.ok(high.torsoLean<low.torsoLean);
 assert.ok(low.reached&&high.reached);
});

async function start(db){
 const proc=spawn(process.execPath,['server.mjs'],{cwd:new URL('.',import.meta.url),env:{...process.env,PORT:'0',HANDLEBAR_LAB_TEST_DB:db,EMPTYOS_DATASET_HANDLEBAR_LAB_DATA:''},stdio:['ignore','pipe','inherit']});
 const [line]=await once(proc.stdout,'data');const port=Number(String(line).match(/listening on (\d+)/)[1]);
 return {proc,url:`http://127.0.0.1:${port}`};
}
async function stop(proc){proc.kill('SIGTERM');await once(proc,'exit');}
const A='a'.repeat(32),B='0123456789abcdef0123456789abcdef';
const hdr=(visitor=A,extra={'Content-Type':'application/json','X-Handlebar-Lab-Client':'app'})=>({...(visitor?{'X-Handlebar-Lab-Visitor':visitor}:{}),...extra});
const write=(url,method,body,headers=hdr())=>fetch(url,{method,headers,body:JSON.stringify(body)});
const read=(url,visitor=A)=>fetch(url,{headers:hdr(visitor,{})});

test('service serves the app and keeps each browser\'s setup and shortlist separate across restarts',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'handlebar-lab-')),db=join(dir,'test.sqlite');
 let s=await start(db);
 try{
  const html=await (await fetch(s.url+'/')).text();
  assert.match(html,/<emptyos-badge><\/emptyos-badge><\/header>/);assert.match(html,/\/_system\/app\/badge\.js/);
  for(const p of ['/app.js','/geometry.mjs','/scene.js','/style.css','/bike.webp','/vendor/three.module.min.js','/vendor/OrbitControls.js'])assert.equal((await fetch(s.url+p)).status,200,p);
  for(const p of ['/server.mjs','/data/bars.json','/../thing.yaml','/test.mjs'])assert.equal((await fetch(s.url+p)).status,404,p);
  const cat=await (await fetch(s.url+'/api/catalog')).json();assert.equal(cat.bars.length,catalog.bars.length);assert.equal(cat.bike.name,'Beta RR 390');
  assert.equal((await fetch(s.url+'/api/state')).status,400);
  assert.equal((await read(s.url+'/api/state','short')).status,400);
  assert.equal((await (await read(s.url+'/api/state')).json()).setup,null);
  const [a,b]=catalog.bars;
  assert.equal((await write(s.url+'/api/setup','PUT',{current:a.id},hdr(A,{'Content-Type':'application/json'}))).status,403);
  assert.equal((await write(s.url+'/api/setup','PUT',{current:a.id},hdr(null))).status,400);
  assert.equal((await write(s.url+'/api/setup','PUT',{current:'nope'})).status,400);
  assert.equal((await write(s.url+'/api/setup','PUT',{current:a.id,currentRoll:45})).status,400);
  assert.equal((await write(s.url+'/api/setup','PUT',{current:'custom'})).status,400);
  assert.equal((await write(s.url+'/api/setup','PUT',{current:'custom',custom:{width:5000,rise:90,pullback:50}})).status,400);
  assert.equal((await write(s.url+'/api/shortlist/'+b.id,'PUT',{})).status,400,'shortlist needs a setup first');
  let r=await write(s.url+'/api/setup','PUT',{current:'custom',custom:{width:805,rise:95,pullback:58,dia:'7/8',label:'<b>Old bar</b>'},candidate:b.id,candidateRoll:4.5,currentRoll:-2,riser:10,mountShift:-5,riderHeight:1850,posture:'seated'});
  assert.equal(r.status,200);
  assert.equal((await write(s.url+'/api/shortlist/'+b.id,'PUT',{note:'try this'})).status,200);
  assert.equal((await write(s.url+'/api/shortlist/custom','PUT',{})).status,400);
  assert.equal((await write(s.url+'/api/shortlist/unknown-bar','PUT',{})).status,400);
  const big='x'.repeat(20000);assert.equal((await write(s.url+'/api/setup','PUT',{current:a.id,pad:big})).status,413);
  // A second browser sees nothing of the first and cannot remove its shortlist.
  assert.equal((await (await read(s.url+'/api/state',B)).json()).setup,null);
  assert.equal((await write(s.url+'/api/setup','PUT',{current:a.id},hdr(B))).status,200);
  assert.equal((await write(s.url+'/api/shortlist/'+b.id,'DELETE',{},hdr(B))).status,200);
  await stop(s.proc);
  const raw=new DatabaseSync(db),keys=raw.prepare('SELECT visitor FROM visitor_setup').all().map(x=>x.visitor);raw.close();
  assert.equal(keys.length,2);assert.ok(keys.every(k=>/^[0-9a-f]{64}$/.test(k)&&k!==A&&k!==B),'browser IDs are stored only as hashes');
  s=await start(db);
  const st=await (await read(s.url+'/api/state')).json();
  assert.deepEqual({...st.setup,custom:undefined},{current:'custom',currentRoll:-2,candidate:b.id,candidateRoll:4.5,riser:10,mountShift:-5,riderHeight:1850,posture:'seated',custom:undefined});
  assert.equal(st.setup.custom.label,'<b>Old bar</b>');assert.equal(st.setup.custom.dia,'7/8');
  assert.deepEqual(st.shortlist.map(x=>[x.bar_id,x.note]),[[b.id,'try this']]);
  assert.equal((await (await read(s.url+'/api/state',B)).json()).setup.current,a.id);
  assert.equal((await write(s.url+'/api/shortlist/'+b.id,'DELETE',{})).status,200);
  assert.equal((await (await read(s.url+'/api/state')).json()).shortlist.length,0);
  assert.equal((await fetch(s.url+'/api/nothing')).status,404);
 }finally{await stop(s.proc);await rm(dir,{recursive:true,force:true});}
});
