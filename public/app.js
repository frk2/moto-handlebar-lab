import {ergonomics,METRICS} from './geometry.mjs';
import {createScene} from './scene.js';

const $=s=>document.querySelector(s);
function el(tag,attrs={},...kids){const n=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(v==null||v===false)continue;if(k==='class')n.className=v;else if(k.startsWith('on'))n.addEventListener(k.slice(2),v);else if(k in n&&k!=='list')n[k]=v;else n.setAttribute(k,v===true?'':v);}for(const k of kids.flat())if(k!=null)n.append(k.nodeType?k:String(k));return n;}
const pref={get(k,d){try{const v=localStorage.getItem('hl.'+k);return v==null?d:JSON.parse(v);}catch{return d;}},set(k,v){try{localStorage.setItem('hl.'+k,JSON.stringify(v));}catch{}}};
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),2600);}
async function api(path,method='GET',body){
 const r=await fetch(path,{method,headers:method==='GET'?{}:{'Content-Type':'application/json','X-Handlebar-Lab-Client':'app'},body:method==='GET'?undefined:JSON.stringify(body??{})});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||'Request failed.');return data;
}

const [catalog,saved]=await Promise.all([api('/api/catalog'),api('/api/state')]);
const bike=catalog.bike,byId=new Map(catalog.bars.map(b=>[b.id,b]));
const ui={unit:pref.get('unit','mm'),photo:pref.get('photo',0.9),showRider:pref.get('rider',true),showGhost:pref.get('ghost',false),sort:pref.get('sort',['fit',1]),brand:'',dia:'',use:'offroad',q:'',short:false};
const fallbackCandidate=catalog.bars.find(b=>b.brand==='Renthal'&&b.line==='Fatbar'&&/KTM/i.test(b.bend))?.id||catalog.bars[0].id;
let setup=saved.setup||{current:null,currentRoll:0,candidate:fallbackCandidate,candidateRoll:0,riser:0,mountShift:0,riderHeight:1780,posture:'standing',custom:null};
let shortlist=new Set(saved.shortlist.map(s=>s.bar_id));
const barOf=id=>id==='custom'?(setup.custom&&{...setup.custom,id:'custom',brand:'Custom',line:setup.custom.label||'My bar',bend:'Entered dimensions'}):byId.get(id);
const name=b=>b?`${b.brand} ${b.line} · ${b.bend}`:'—';
const len=v=>ui.unit==='in'?`${(v/25.4).toFixed(2)} in`:`${Math.round(v)} mm`;
const signedLen=v=>{let r=ui.unit==='in'?(v/25.4).toFixed(2):String(Math.round(v));if(+r===0)r=ui.unit==='in'?'0.00':'0';return `${v>0&&+r!==0?'+':''}${r} ${ui.unit}`;};

// ---------- bar pickers ----------
const lead=['Renthal','Pro Taper','ODI'],brands=[...new Set([...lead,...catalog.bars.map(b=>b.brand)])].filter(b=>catalog.bars.some(x=>x.brand===b));
function picker(host,key,{allowCustom}){
 const brandSel=el('select',{'aria-label':'Brand'}),lineSel=el('select',{'aria-label':'Model line'}),bendSel=el('select',{'aria-label':'Bend'}),spec=el('div',{class:'spec'}),custom=el('div',{class:'custom',hidden:true});
 const field=(label,k,attrs)=>el('label',{},label,el('input',{type:'number',step:'0.1',required:true,...attrs,'data-k':k}));
 custom.append(field('Width (mm)','width',{min:600,max:1000}),field('Rise (mm)','rise',{min:0,max:200}),field('Pullback (mm)','pullback',{min:-20,max:150}),field('Clamp width (mm, optional)','center',{min:80,max:300,required:false}),
  el('label',{},'Diameter',el('select',{'data-k':'dia'},...['1-1/8 tapered','7/8','36mm'].map(v=>el('option',{value:v},v)))),el('label',{},'Name',el('input',{'data-k':'label',maxLength:80,placeholder:'My bar'})));
 host.replaceChildren(el('div',{class:'picker'},brandSel,lineSel,bendSel,custom,spec));
 brandSel.append(el('option',{value:''},'Brand…'),...brands.map(b=>el('option',{value:b},b)),allowCustom?el('option',{value:'custom'},'Not listed – enter dimensions'):null);
 const fill=(sel,items,ph)=>{sel.replaceChildren(el('option',{value:''},ph),...items);};
 function sync(){
  const id=setup[key],b=id&&id!=='custom'?byId.get(id):null;
  brandSel.value=id==='custom'?'custom':b?.brand||'';
  const isCustom=brandSel.value==='custom';lineSel.hidden=bendSel.hidden=isCustom;custom.hidden=!isCustom;
  if(isCustom&&setup.custom)for(const i of custom.querySelectorAll('[data-k]'))i.value=setup.custom[i.dataset.k]??'';
  const lines=[...new Set(catalog.bars.filter(x=>x.brand===brandSel.value).map(x=>x.line))];
  fill(lineSel,lines.map(l=>el('option',{value:l},l)),'Line…');lineSel.value=b?.line||'';
  const bends=catalog.bars.filter(x=>x.brand===brandSel.value&&x.line===lineSel.value);
  fill(bendSel,bends.map(x=>el('option',{value:x.id},`${x.bend}${x.part?` (${x.part})`:''}`)),'Bend…');bendSel.value=b?.id||'';
  const bar=barOf(id);
  spec.textContent=bar?`${len(bar.width)} wide · ${len(bar.rise)} rise · ${len(bar.pullback)} pullback${bar.fits?` · ${bar.fits}`:''}${bar.similar_to_stock?` · Similar to ${bar.similar_to_stock}`:''}`:'';
 }
 brandSel.onchange=()=>{
  if(brandSel.value==='custom'){setup.custom||={width:800,rise:90,pullback:60,center:null,dia:'1-1/8 tapered',label:'My bar'};setup[key]='custom';changed();return;}
  const first=catalog.bars.find(x=>x.brand===brandSel.value);if(first){setup[key]=first.id;changed();}
 };
 lineSel.onchange=()=>{const first=catalog.bars.find(x=>x.brand===brandSel.value&&x.line===lineSel.value);if(first){setup[key]=first.id;changed();}};
 bendSel.onchange=()=>{if(bendSel.value){setup[key]=bendSel.value;changed();}};
 custom.oninput=()=>{const c={};for(const i of custom.querySelectorAll('[data-k]'))c[i.dataset.k]=i.type==='number'?(i.value===''?null:Number(i.value)):i.value;
  if([c.width,c.rise,c.pullback].every(Number.isFinite)){setup.custom=c;changed(false);}};
 return {sync};
}
const pickers=[picker($('#current-picker'),'current',{allowCustom:true}),picker($('#candidate-picker'),'candidate',{allowCustom:false})];

// ---------- compute & render ----------
const rider=()=>({height:setup.riderHeight,posture:setup.posture});
const mountOf=roll=>({roll,riser:setup.riser,mountShift:setup.mountShift});
function compute(){
 const cb=barOf(setup.current),nb=barOf(setup.candidate);
 return {current:cb&&{bar:cb,...ergonomics(bike,cb,mountOf(setup.currentRoll),rider())},candidate:nb&&{bar:nb,...ergonomics(bike,nb,mountOf(setup.candidateRoll),rider())}};
}
const three=createScene($('#scene'),bike,()=>render());
let first=true;
function describe(key,d){
 const a=Math.abs(d),small=key.startsWith('grip')&&!key.endsWith('sweep')?a<2:a<0.5;
 if(small)return ['flat','no change'];
 const words={gripHeightPeg:['higher','lower'],gripHeightSeat:['higher','lower'],gripReachPeg:['further forward','further back'],gripReachSeat:['further forward','further back'],
  gripWidth:['wider','narrower'],gripBacksweep:['more swept back','less swept back'],gripUpsweep:['more upswept','flatter'],torsoLean:['leaning further forward','more upright']}[key];
 return [d>0?'up':'down',words[d>0?0:1]];
}
function render(){
 for(const p of pickers)p.sync();
 for(const k of ['currentRoll','candidateRoll','riser','mountShift','riderHeight']){$('#'+k).value=setup[k];}
 $('#currentRoll-out').textContent=rollText(setup.currentRoll);$('#candidateRoll-out').textContent=rollText(setup.candidateRoll);
 $('#riser-out').textContent=signedLen(setup.riser);$('#mountShift-out').textContent=signedLen(setup.mountShift)+(setup.mountShift?setup.mountShift>0?' fwd':' back':'');
 $('#riderHeight-out').textContent=ui.unit==='in'?`${Math.floor(setup.riderHeight/25.4/12)}′ ${Math.round(setup.riderHeight/25.4%12)}″`:`${(setup.riderHeight/10).toFixed(0)} cm`;
 $('#photo').value=ui.photo;$('#photo-out').textContent=`${Math.round(ui.photo*100)}%`;
 for(const b of document.querySelectorAll('[data-posture]'))b.setAttribute('aria-pressed',b.dataset.posture===setup.posture);
 for(const b of document.querySelectorAll('[data-unit]'))b.setAttribute('aria-pressed',b.dataset.unit===ui.unit);
 $('#show-rider').checked=ui.showRider;$('#show-ghost').checked=ui.showGhost;
 $('#star').setAttribute('aria-pressed',shortlist.has(setup.candidate));$('#star').textContent=shortlist.has(setup.candidate)?'★ Shortlisted':'☆ Shortlist';
 const r=compute();
 $('#legend-current').textContent=name(r.current?.bar);$('#legend-candidate').textContent=name(r.candidate?.bar);
 if(r.current||r.candidate){three.update({...r,showRider:ui.showRider,showGhostRider:ui.showGhost,photoOpacity:ui.photo});if(first){three.view('three',true);first=false;}}
 renderCompare(r);renderTable(r);
}
const signedDeg=d=>{const r=d.toFixed(1);return +r===0?'0.0°':`${d>0?'+':''}${r}°`;};
const rollText=v=>v===0?'0° (rise ∥ forks)':`${v>0?'+':''}${v}° ${v>0?'forward':'back'}`;
function renderCompare({current:c,candidate:n}){
 if(!c||!n){$('#compare').replaceChildren(el('p',{class:'fine'},'Choose both bars to compare.'));$('#verdict').textContent='';return;}
 const rows=[['Width (tip to tip)',len(c.bar.width),len(n.bar.width),n.bar.width-c.bar.width,'endWidth'],['Rise (published)',len(c.bar.rise),len(n.bar.rise),n.bar.rise-c.bar.rise,'gripHeightPeg'],['Pullback (published)',len(c.bar.pullback),len(n.bar.pullback),n.bar.pullback-c.bar.pullback,'gripReachSeat']];
 const body=[];
 for(const [label,a,b,d] of rows)body.push(el('tr',{},el('td',{},label),el('td',{},a),el('td',{},b),el('td',{class:'delta flat'},signedLen(d))));
 body.push(el('tr',{},el('td',{colspan:4,class:'fine'},el('b',{},'At the hand (centre of grip), as mounted'))));
 for(const [key,label,unit] of METRICS){
  if(setup.posture==='standing'&&key.endsWith('Seat'))continue;
  const a=c.metrics[key],b=n.metrics[key],d=b-a,[cls,word]=describe(key,d);
  const fmt=unit==='mm'?len:v=>`${v.toFixed(1)}°`,fd=unit==='mm'?signedLen(d):signedDeg(d);
  body.push(el('tr',{},el('td',{},label),el('td',{},fmt(a)),el('td',{},fmt(b)),el('td',{class:'delta '+cls,title:word},fd,' ',el('small',{},word))));
 }
 $('#compare').replaceChildren(el('table',{},el('thead',{},el('tr',{},el('th',{},''),el('th',{},'Your bars'),el('th',{},'New bar'),el('th',{},'Change'))),el('tbody',{},body)));
 const m=k=>n.metrics[k]-c.metrics[k],parts=[];
 const dh=m('gripHeightPeg'),dr=m('gripReachPeg'),dw=m('gripWidth'),dt=m('torsoLean');
 if(Math.abs(dh)>=2)parts.push(`hands ${len(Math.abs(dh))} ${dh>0?'higher':'lower'}`);
 if(Math.abs(dr)>=2)parts.push(`${len(Math.abs(dr))} ${dr>0?'further forward':'closer to you'}`);
 if(Math.abs(dw)>=4)parts.push(`${len(Math.abs(dw))} ${dw>0?'wider':'narrower'} grip spacing`);
 let s=parts.length?`With the ${name(n.bar)} your ${parts.join(', ')}.`:'This bar puts your hands in almost the same place.';
 if(Math.abs(dt)>=0.5)s+=` ${setup.posture==='standing'?'Standing':'Seated'} with the same elbow bend, your torso is about ${Math.abs(dt).toFixed(1)}° ${dt<0?'more upright':'more bent over'}.`;
 if(!n.metrics.reached)s+=' At this height the rider model cannot reach the grips with bent elbows.';
 $('#verdict').textContent=s+' The rider is a simple proportional model; use it for direction and size of change, not as a fit.';
}

// ---------- full catalog table ----------
const COLS=[['brand','Brand'],['line','Line'],['bend','Bend'],['dia','Ø'],['width','Width'],['rise','Rise'],['pullback','Pullback'],['dHeight','Δ Hand height'],['dReach','Δ Hand fore/aft'],['dWidth','Δ Hand spacing'],['fit','Closest']];
let tableRows=[],tableKey='';
function renderTable({current:c}){
 const key=[setup.current,setup.currentRoll,setup.riser,setup.mountShift,JSON.stringify(setup.custom)].join('|');
 if(key!==tableKey){
  tableKey=key;
  tableRows=catalog.bars.map(b=>{
   if(!c)return {b};
   const m=ergonomics(bike,b,mountOf(setup.currentRoll),rider()).placed.hand,h=c.placed.hand;
   const d=[m[1]-h[1],m[0]-h[0],2*(Math.abs(m[2])-Math.abs(h[2]))];
   return {b,dHeight:d[0],dReach:d[1],dWidth:d[2],fit:Math.hypot(d[0],d[1],d[2]/2)};
  });
 }
 const q=ui.q.toLowerCase().trim();
 const useOk=b=>!ui.use||(ui.use==='offroad'?!['Road / Adventure','V-Twin'].includes(b.use):b.use===ui.use);
 let list=tableRows.filter(({b})=>useOk(b)&&(!ui.brand||b.brand===ui.brand)&&(!ui.dia||b.dia===ui.dia)&&(!ui.short||shortlist.has(b.id))&&(!q||[b.brand,b.line,b.bend,b.part,b.fits].join(' ').toLowerCase().includes(q)));
 const [sk,dir]=ui.sort,val=r=>sk in r?r[sk]:r.b[sk];
 list=list.slice().sort((x,y)=>{const a=val(x),b=val(y);if(a==null)return 1;if(b==null)return -1;return (typeof a==='string'?a.localeCompare(b):a-b)*dir;});
 $('#bar-count').textContent=`${list.length} of ${catalog.bars.length}`;
 $('#bars thead').replaceChildren(el('tr',{},el('th',{'aria-label':'Shortlist'},'★'),...COLS.map(([k,l])=>el('th',{'aria-sort':sk===k?(dir>0?'ascending':'descending'):'none',onclick:()=>{ui.sort=[k,sk===k?-dir:1];pref.set('sort',ui.sort);renderTable(compute());}},l))));
 const fmt=v=>v==null?'—':signedLen(v);
 $('#bars tbody').replaceChildren(...list.slice(0,600).map(r=>{const b=r.b;return el('tr',{class:b.id===setup.candidate?'sel':b.id===setup.current?'mine':null,title:b.notes||b.fits||'',onclick:()=>{setup.candidate=b.id;changed();$('.viewport').scrollIntoView({behavior:'smooth',block:'nearest'});}},
  el('td',{class:'star'},shortlist.has(b.id)?'★':''),el('td',{},b.brand),el('td',{},b.line),el('td',{},b.bend,b.part?el('small',{},` ${b.part}`):null,b.fits?el('div',{},el('small',{},b.fits)):null,b.similar_to_stock?el('div',{},el('small',{},'≈ '+b.similar_to_stock)):null),el('td',{},b.dia),
  el('td',{},len(b.width)),el('td',{},len(b.rise)),el('td',{},len(b.pullback)),el('td',{},fmt(r.dHeight)),el('td',{},fmt(r.dReach)),el('td',{},fmt(r.dWidth)),el('td',{},r.fit==null?'—':len(r.fit)));}));
}

// ---------- persistence ----------
let saveTimer;
function changed(rerender=true){if(rerender)render();else{for(const p of pickers)p.sync();const r=compute();three.update({...r,showRider:ui.showRider,showGhostRider:ui.showGhost,photoOpacity:ui.photo});renderCompare(r);tableKey='';renderTable(r);}
 clearTimeout(saveTimer);saveTimer=setTimeout(save,500);}
async function save(){if(!setup.current)return;try{const s=await api('/api/setup','PUT',setup);shortlist=new Set(s.shortlist.map(x=>x.bar_id));}catch(e){toast(e.message);}}

// ---------- controls ----------
for(const k of ['currentRoll','candidateRoll','riser','mountShift','riderHeight'])$('#'+k).addEventListener('input',e=>{setup[k]=Number(e.target.value);changed();});
for(const b of document.querySelectorAll('[data-posture]'))b.onclick=()=>{setup.posture=b.dataset.posture;changed();};
for(const b of document.querySelectorAll('[data-unit]'))b.onclick=()=>{ui.unit=b.dataset.unit;pref.set('unit',ui.unit);render();};
for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>three.view(b.dataset.view);
$('#photo').oninput=e=>{ui.photo=Number(e.target.value);pref.set('photo',ui.photo);render();};
$('#show-rider').onchange=e=>{ui.showRider=e.target.checked;pref.set('rider',ui.showRider);render();};
$('#show-ghost').onchange=e=>{ui.showGhost=e.target.checked;pref.set('ghost',ui.showGhost);render();};
$('#match-roll').onclick=()=>{setup.candidateRoll=setup.currentRoll;changed();};
$('#match-angle').onclick=()=>{
 const target=compute().current.metrics.gripUpsweep,nb=barOf(setup.candidate);
 const f=roll=>ergonomics(bike,nb,mountOf(roll),rider()).metrics.gripUpsweep-target;
 let lo=-20,hi=20;if(f(lo)>0||f(hi)<0){toast('This bar cannot match your grip angle within ±20° of roll.');return;}
 for(let i=0;i<30;i++){const mid=(lo+hi)/2;if(f(mid)<0)lo=mid;else hi=mid;}
 setup.candidateRoll=Math.round((lo+hi)/2*2)/2;changed();toast(`Rolled to ${rollText(setup.candidateRoll)} to match your grip up-sweep.`);
};
$('#star').onclick=async()=>{const id=setup.candidate;if(!id)return;try{const s=shortlist.has(id)?await api('/api/shortlist/'+encodeURIComponent(id),'DELETE'):await api('/api/shortlist/'+encodeURIComponent(id),'PUT',{});shortlist=new Set(s.shortlist.map(x=>x.bar_id));render();}catch(e){toast(e.message);}};
$('#q').oninput=e=>{ui.q=e.target.value;renderTable(compute());};
$('#f-brand').append(el('option',{value:''},'All brands'),...brands.map(b=>el('option',{value:b},b)));$('#f-brand').onchange=e=>{ui.brand=e.target.value;renderTable(compute());};
$('#f-dia').append(el('option',{value:''},'All diameters'),...[...new Set(catalog.bars.map(b=>b.dia))].map(d=>el('option',{value:d},d)));$('#f-dia').onchange=e=>{ui.dia=e.target.value;renderTable(compute());};
$('#f-use').append(el('option',{value:'offroad'},'Off-road'),el('option',{value:''},'All uses'),...[...new Set(catalog.bars.map(b=>b.use))].map(u=>el('option',{value:u},u)));$('#f-use').onchange=e=>{ui.use=e.target.value;renderTable(compute());};
$('#f-short').onchange=e=>{ui.short=e.target.checked;renderTable(compute());};

$('#bike-name').textContent=`${bike.name} · ${bike.variant}`;
$('#bike-notes').textContent=`Bike scaled from tyre sizes and wheelbase. Beta lists ${bike.published.seatHeight.value} mm seat height and ${bike.published.pegHeight.value} mm peg height. Bar mount height and offset are estimates, so set the riser and clamp sliders to match your bike.`;
$('#about').replaceChildren(el('h2',{},'About the numbers'),
 el('p',{},`${catalog.bars.length} bends from ${brands.join(', ')}. Width, rise and pullback come from each maker's published bend chart (sources are linked per bar in the data). Makers measure rise differently; these are normalised to the grip-end centreline above the clamp centreline. Where a maker does not publish clamp width, grip length or sweep angles, the 3D shape uses typical values (${'190 mm clamp section, 170 mm grip section, 9° back-sweep, 4° up-sweep'}), so the hand position is exact to the published numbers but the bend shape between is approximate.`),
 el('p',{},'Roll 0° stands each bar\'s rise section parallel to the fork legs, which is how most riders set a new bar. Positive roll moves the grips forward.'),
 ...bike.calibration.map(t=>el('p',{},t)),
 el('p',{},'Photo: ',el('a',{href:bike.photo.source,target:'_blank',rel:'noopener'},bike.photo.credit),'.'),
 ...(catalog.notes||[]).map(t=>el('p',{},t)));

if(!setup.current){
 const dlg=$('#first-run');const tmp=picker($('#first-picker'),'current',{allowCustom:true});
 const stock=catalog.bars.find(b=>/2020-2024/.test(b.oem_stock_for||''))||catalog.bars.find(b=>/2017–2024/.test(b.similar_to_stock||''));if(stock)setup.current=stock.id;
 tmp.sync();pickers.push(tmp);dlg.showModal();
 $('#first-form').onsubmit=e=>{if(!setup.current){e.preventDefault();toast('Choose your bars first.');return;}pickers.pop();save().then(render);};
 dlg.addEventListener('cancel',e=>e.preventDefault());
}
render();
