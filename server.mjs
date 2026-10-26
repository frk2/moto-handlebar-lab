import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('.',import.meta.url));
const bars=JSON.parse(readFileSync(root+'data/bars.json','utf8'));
const bike=JSON.parse(readFileSync(root+'data/bike.json','utf8'));
const barIds=new Set(bars.bars.map(b=>b.id));
const dbPath=process.env.HANDLEBAR_LAB_TEST_DB||process.env.EMPTYOS_DATASET_HANDLEBAR_LAB_DATA;
if(!dbPath)throw new Error('EMPTYOS_DATASET_HANDLEBAR_LAB_DATA is required. Tests may use HANDLEBAR_LAB_TEST_DB.');
const db=new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS setup(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS shortlist(bar_id TEXT PRIMARY KEY,note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
PRAGMA user_version=1;`);
const rows=(sql,...args)=>db.prepare(sql).all(...args);
const one=(sql,...args)=>db.prepare(sql).get(...args);
const run=(sql,...args)=>db.prepare(sql).run(...args);
class InputError extends Error {constructor(message,status=400){super(message);this.status=status;}}
function num(v,name,min,max){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new InputError(`Enter a ${name} between ${min} and ${max}.`);return Math.round(v*10)/10;}
function barId(v,name,optional=false){if(optional&&v==null)return null;if(v!=='custom'&&!barIds.has(v))throw new InputError(`Choose a ${name} from the catalog.`);return v;}

// A bar not in the catalog can be entered by its published dimensions.
function customBar(v){
 if(v==null)return null;
 if(typeof v!=='object')throw new InputError('Enter your bar dimensions.');
 const dia=['1-1/8 tapered','7/8','36mm'].includes(v.dia)?v.dia:'1-1/8 tapered';
 return {width:num(v.width,'width (mm)',600,1000),rise:num(v.rise,'rise (mm)',0,200),pullback:num(v.pullback,'pullback (mm)',-20,150),
  center:v.center==null||v.center===''?null:num(v.center,'clamp width (mm)',80,300),dia,label:String(v.label??'').trim().slice(0,80)||'My bar'};
}
function validSetup(body){
 const custom=customBar(body.custom);
 const s={
  current:barId(body.current,'current bar'),currentRoll:num(body.currentRoll??0,'current bar roll (°)',-30,30),
  candidate:barId(body.candidate,'comparison bar',true),candidateRoll:num(body.candidateRoll??0,'comparison bar roll (°)',-30,30),
  riser:num(body.riser??0,'riser change (mm)',-20,60),mountShift:num(body.mountShift??0,'clamp shift (mm)',-30,30),
  riderHeight:num(body.riderHeight??1780,'rider height (mm)',1400,2100),posture:body.posture==='seated'?'seated':'standing',custom};
 if((s.current==='custom'||s.candidate==='custom')&&!custom)throw new InputError('Enter your bar dimensions.');
 return s;
}
function state(){
 const row=one('SELECT data,updated_at FROM setup WHERE id=1');
 return {setup:row?JSON.parse(row.data):null,updated_at:row?.updated_at??null,shortlist:rows('SELECT bar_id,note,created_at FROM shortlist ORDER BY created_at,bar_id').filter(r=>barIds.has(r.bar_id))};
}
async function readBody(req){if(!req.headers['content-type']?.startsWith('application/json')||req.headers['x-handlebar-lab-client']!=='app')throw new InputError('JSON app requests are required.',403);let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>16384)throw new InputError('This request is too large.',413);}try{return JSON.parse(body);}catch{throw new InputError('Invalid JSON.');}}
const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',webp:'image/webp',png:'image/png',svg:'image/svg+xml'};
const assets=Object.fromEntries(['index.html','app.js','geometry.mjs','scene.js','style.css','bike.webp','vendor/three.module.min.js','vendor/OrbitControls.js'].map(f=>[f==='index.html'?'/':'/'+f,f]));
const cache=Object.fromEntries(Object.entries(assets).map(([path,file])=>[path,readFileSync(root+'public/'+file)]));

const server=http.createServer(async(req,res)=>{
 const json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
 try{
  const url=new URL(req.url,'http://localhost'),path=url.pathname;
  if(req.method==='GET'&&cache[path]){const file=assets[path];res.writeHead(200,{'Content-Type':types[file.split('.').pop()],'Cache-Control':file.startsWith('vendor/')||file==='bike.webp'?'public, max-age=86400':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});res.end(cache[path]);return;}
  if(req.method==='GET'&&path==='/api/catalog'){json({...bars,bike});return;}
  if(req.method==='GET'&&path==='/api/state'){json(state());return;}
  if(req.method==='PUT'&&path==='/api/setup'){
   const s=validSetup(await readBody(req)),at=new Date().toISOString();
   run('INSERT INTO setup(id,data,updated_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at',JSON.stringify(s),at);json(state());return;
  }
  const match=path.match(/^\/api\/shortlist\/([A-Za-z0-9_.-]{1,120})$/);
  if(match&&req.method==='PUT'){
   const body=await readBody(req),id=barId(match[1],'bar');if(id==='custom')throw new InputError('Only catalog bars can be shortlisted.');
   const note=typeof body.note==='string'?body.note.trim().slice(0,300):'';
   run('INSERT INTO shortlist(bar_id,note,created_at) VALUES(?,?,?) ON CONFLICT(bar_id) DO UPDATE SET note=excluded.note',id,note,new Date().toISOString());json(state());return;
  }
  if(match&&req.method==='DELETE'){await readBody(req);run('DELETE FROM shortlist WHERE bar_id=?',match[1]);json(state());return;}
  json({error:'Not found.'},404);
 }catch(error){if(!error.status)console.error(error);json({error:error.status?error.message:'Unable to save. Please try again.'},error.status||500);}
});
server.listen(Number(process.env.PORT??4342),'127.0.0.1',()=>console.log(`Handlebar Lab listening on ${server.address().port}`));
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>server.close(()=>{db.close();process.exit(0);}));
