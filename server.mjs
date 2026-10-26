import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

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
CREATE TABLE IF NOT EXISTS visitor_setup(visitor TEXT PRIMARY KEY,data TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS visitor_shortlist(visitor TEXT NOT NULL,bar_id TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,PRIMARY KEY(visitor,bar_id));
PRAGMA user_version=2;`);
// v1 kept one owner setup in `setup`/`shortlist`. Since the app went public every browser saves under its own ID; those tables are retained but unused.
const LIMITS={visitors:50000,shortlist:200};
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
// Public requests carry no identity: each browser sends its own random 128-bit ID, stored only as a hash.
function visitorOf(req){const v=req.headers['x-handlebar-lab-visitor'];if(typeof v!=='string'||!/^[0-9a-f]{32}$/.test(v))throw new InputError('This browser has no Handlebar Lab ID. Reload the page.');return createHash('sha256').update(v).digest('hex');}
function state(visitor){
 const row=one('SELECT data,updated_at FROM visitor_setup WHERE visitor=?',visitor);
 return {setup:row?JSON.parse(row.data):null,updated_at:row?.updated_at??null,shortlist:rows('SELECT bar_id,note,created_at FROM visitor_shortlist WHERE visitor=? ORDER BY created_at,bar_id',visitor).filter(r=>barIds.has(r.bar_id))};
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
  if(req.method==='GET'&&path==='/api/state'){json(state(visitorOf(req)));return;}
  if(req.method==='PUT'&&path==='/api/setup'){
   const v=visitorOf(req),s=validSetup(await readBody(req)),at=new Date().toISOString();
   if(!one('SELECT 1 FROM visitor_setup WHERE visitor=?',v)&&one('SELECT count(*) AS n FROM visitor_setup').n>=LIMITS.visitors)throw new InputError('Handlebar Lab cannot save new setups right now.',503);
   run('INSERT INTO visitor_setup(visitor,data,updated_at) VALUES(?,?,?) ON CONFLICT(visitor) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at',v,JSON.stringify(s),at);json(state(v));return;
  }
  const match=path.match(/^\/api\/shortlist\/([A-Za-z0-9_.-]{1,120})$/);
  if(match&&req.method==='PUT'){
   const v=visitorOf(req),body=await readBody(req),id=barId(match[1],'bar');if(id==='custom')throw new InputError('Only catalog bars can be shortlisted.');
   if(!one('SELECT 1 FROM visitor_setup WHERE visitor=?',v))throw new InputError('Choose your bars before shortlisting.');
   if(!one('SELECT 1 FROM visitor_shortlist WHERE visitor=? AND bar_id=?',v,id)&&one('SELECT count(*) AS n FROM visitor_shortlist WHERE visitor=?',v).n>=LIMITS.shortlist)throw new InputError(`A shortlist holds up to ${LIMITS.shortlist} bars.`);
   const note=typeof body.note==='string'?body.note.trim().slice(0,300):'';
   run('INSERT INTO visitor_shortlist(visitor,bar_id,note,created_at) VALUES(?,?,?,?) ON CONFLICT(visitor,bar_id) DO UPDATE SET note=excluded.note',v,id,note,new Date().toISOString());json(state(v));return;
  }
  if(match&&req.method==='DELETE'){const v=visitorOf(req);await readBody(req);run('DELETE FROM visitor_shortlist WHERE visitor=? AND bar_id=?',v,match[1]);json(state(v));return;}
  json({error:'Not found.'},404);
 }catch(error){if(!error.status)console.error(error);json({error:error.status?error.message:'Unable to save. Please try again.'},error.status||500);}
});
server.listen(Number(process.env.PORT??4342),'127.0.0.1',()=>console.log(`Handlebar Lab listening on ${server.address().port}`));
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>server.close(()=>{db.close();process.exit(0);}));
