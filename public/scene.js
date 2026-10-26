import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {barRadius,steering} from './geometry.mjs';

const MM=0.001,v3=p=>new THREE.Vector3(p[0]*MM,p[1]*MM,p[2]*MM);

// Tube along a polyline whose radius can change per point (tapered bars, grips).
function tube(points,radii,material,segments=18){
 const n=points.length,tangents=[],normals=[],pos=[],idx=[];
 for(let i=0;i<n;i++)tangents.push(new THREE.Vector3().subVectors(points[Math.min(i+1,n-1)],points[Math.max(i-1,0)]).normalize());
 let normal=new THREE.Vector3(0,1,0);if(Math.abs(normal.dot(tangents[0]))>0.9)normal.set(1,0,0);
 normal.sub(tangents[0].clone().multiplyScalar(normal.dot(tangents[0]))).normalize();
 for(let i=0;i<n;i++){
  if(i>0){const axis=new THREE.Vector3().crossVectors(tangents[i-1],tangents[i]);const s=axis.length();if(s>1e-6){normal.applyAxisAngle(axis.normalize(),Math.asin(Math.min(1,s)));}}
  normals.push(normal.clone());
  const bin=new THREE.Vector3().crossVectors(tangents[i],normal);
  for(let k=0;k<=segments;k++){const a=k/segments*Math.PI*2,r=radii[i];pos.push(points[i].x+(normal.x*Math.cos(a)+bin.x*Math.sin(a))*r,points[i].y+(normal.y*Math.cos(a)+bin.y*Math.sin(a))*r,points[i].z+(normal.z*Math.cos(a)+bin.z*Math.sin(a))*r);}
 }
 for(let i=0;i<n-1;i++)for(let k=0;k<segments;k++){const a=i*(segments+1)+k,b=a+segments+1;idx.push(a,b,a+1,b,b+1,a+1);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();
 return new THREE.Mesh(g,material);
}
function rod(a,b,r,material){
 const A=v3(a),B=v3(b),d=new THREE.Vector3().subVectors(B,A),m=new THREE.Mesh(new THREE.CylinderGeometry(r*MM,r*MM,d.length(),12),material);
 m.position.copy(A).addScaledVector(d,0.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return m;
}
function ball(p,r,material){const m=new THREE.Mesh(new THREE.SphereGeometry(r*MM,16,12),material);m.position.copy(v3(p));return m;}
function dispose(group){group.traverse(o=>{o.geometry?.dispose();});group.clear();}

export function createScene(canvas,bike,onReady){
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,0.01,50);
 const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.minDistance=0.25;controls.maxDistance=8;
 scene.add(new THREE.HemisphereLight(0xffffff,0x8a8070,1.6));
 const sun=new THREE.DirectionalLight(0xffffff,2.2);sun.position.set(1.5,3,2);scene.add(sun);
 const fill=new THREE.DirectionalLight(0xffffff,0.8);fill.position.set(-2,1,-2);scene.add(fill);

 const ground=new THREE.Mesh(new THREE.CircleGeometry(2.6,64),new THREE.MeshStandardMaterial({color:0x9a9384,transparent:true,opacity:0.18}));
 ground.rotation.x=-Math.PI/2;ground.position.set(bike.wheelbase/2*MM,-0.001,0);scene.add(ground);
 const grid=new THREE.GridHelper(4,40,0x7d776b,0xb5ae9f);grid.position.set(bike.wheelbase/2*MM,0,0);grid.material.transparent=true;grid.material.opacity=0.35;scene.add(grid);

 // Side photo billboard, scaled so its axles land on the modelled axles.
 const photo=new THREE.Group();scene.add(photo);
 const c=bike.photo;
 new THREE.TextureLoader().load(c.src,tex=>{
  tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=renderer.capabilities.getMaxAnisotropy();
  const w=c.width/c.pxPerMm,h=c.height/c.pxPerMm;
  const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,alphaTest:0.04,side:THREE.DoubleSide,depthWrite:false,opacity:0.92});
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(w*MM,h*MM),mat);
  const cx=(c.width/2-c.rearAxle[0])/c.pxPerMm,cy=(c.rearAxle[1]-c.height/2)/c.pxPerMm+bike.rearRadius;
  plane.position.set(cx*MM,cy*MM,0);plane.renderOrder=-1;photo.add(plane);onReady?.();
 });

 // Context hardware the photo cannot show from other angles.
 const st=steering(bike),metal=new THREE.MeshStandardMaterial({color:0x3a3d40,metalness:0.6,roughness:0.4}),
  forkMat=new THREE.MeshStandardMaterial({color:0xc8a238,metalness:0.7,roughness:0.3}),tyre=new THREE.MeshStandardMaterial({color:0x1d1d1d,roughness:0.9,transparent:true,opacity:0.55});
 const hardware=new THREE.Group();scene.add(hardware);
 const forkHalf=bike.forkSpacing/2,topC=st.at(bike.topClamp),lowC=st.at(bike.topClamp-bike.clampSpacing);
 for(const side of [-1,1]){
  const top=[topC[0]+st.n[0]*bike.offset,topC[1]+st.n[1]*bike.offset,side*forkHalf],axle=[st.axle[0],st.axle[1],side*forkHalf];
  hardware.add(rod(axle,top,bike.forkDia/2,forkMat));
  hardware.add(rod([bike.peg[0]-40,bike.peg[1],side*(bike.pegHalf-60)],[bike.peg[0]+15,bike.peg[1],side*(bike.pegHalf+50)],12,metal));
 }
 for(const C of [topC,lowC]){
  const plate=new THREE.Mesh(new THREE.BoxGeometry((bike.offset+50)*MM,18*MM,(bike.forkSpacing+70)*MM),metal);
  plate.position.copy(v3([C[0]+st.n[0]*bike.offset/2,C[1]+st.n[1]*bike.offset/2,0]));plate.rotation.z=-bike.rake*Math.PI/180;hardware.add(plate);
 }
 hardware.add(rod(st.at(bike.topClamp-bike.clampSpacing-40),st.at(bike.topClamp+12),15,metal));
 for(const [axle,r] of [[[0,bike.rearRadius,0],bike.rearRadius],[st.axle,bike.frontRadius]]){
  const t=new THREE.Mesh(new THREE.TorusGeometry((r-45)*MM,45*MM,12,64),tyre);t.position.copy(v3(axle));hardware.add(t);
 }

 const dynamic=new THREE.Group();scene.add(dynamic);
 const mats={
  current:new THREE.MeshStandardMaterial({color:0x5b7fa6,metalness:0.5,roughness:0.35,transparent:true,opacity:0.55,depthWrite:false}),
  candidate:new THREE.MeshStandardMaterial({color:0xe0601b,metalness:0.55,roughness:0.3}),
  grip:new THREE.MeshStandardMaterial({color:0x1b1b1b,roughness:0.85}),
  gripGhost:new THREE.MeshStandardMaterial({color:0x2b3a4a,roughness:0.85,transparent:true,opacity:0.45,depthWrite:false}),
  clamp:new THREE.MeshStandardMaterial({color:0x2c2c2c,metalness:0.6,roughness:0.35}),
  rider:new THREE.MeshStandardMaterial({color:0x2f6d5a,roughness:0.6,transparent:true,opacity:0.5,depthWrite:false}),
  riderGhost:new THREE.MeshStandardMaterial({color:0x5b7fa6,roughness:0.6,transparent:true,opacity:0.25,depthWrite:false}),
  hand:new THREE.MeshBasicMaterial({color:0xe0601b,depthTest:false,transparent:true}),
  handGhost:new THREE.MeshBasicMaterial({color:0x5b7fa6,depthTest:false,transparent:true})};
 // Dimension legs between hand centres, drawn through everything so they stay readable.
 const AXES={reach:0x7d4fc4,height:0x2f7d5a,width:0x1f7f99};
 const dimMats=Object.fromEntries(Object.entries(AXES).map(([k,c])=>[k,new THREE.MeshBasicMaterial({color:c,depthTest:false,transparent:true})]));
 const directMat=new THREE.LineDashedMaterial({color:0x1f2326,dashSize:0.008,gapSize:0.006,depthTest:false,transparent:true,opacity:0.8});
 const overlay=document.createElement('div');overlay.className='dims';canvas.parentElement.append(overlay);
 function callout(rows,title){
  const el=document.createElement('div');el.className='callout';
  el.append(Object.assign(document.createElement('b'),{textContent:title}));
  for(const [cls,text] of rows){const r=document.createElement('span');r.className='row '+cls;r.textContent=text;el.append(r);}
  overlay.append(el);
 }
 function addDims(c,n,fmt){
  // Right hand, facing the default camera. Legs run fore/aft, then up/down, then in/out.
  const C=[c[0],c[1],Math.abs(c[2])],N=[n[0],n[1],Math.abs(n[2])],P1=[N[0],C[1],C[2]],P2=[N[0],N[1],C[2]];
  const legs=[['reach',C,P1,N[0]-C[0],d=>d>0?'forward':'back','fore/aft'],['height',P1,P2,N[1]-C[1],d=>d>0?'higher':'lower','height'],['width',P2,N,N[2]-C[2],d=>d>0?'further out':'further in','in/out']];
  const rows=[];
  for(const [k,a,b,d,word,name] of legs){
   if(Math.abs(d)<0.5){rows.push([k+' none',`same ${name}`]);continue;}
   const m=rod(a,b,1.3,dimMats[k]);m.renderOrder=12;dynamic.add(m);
   for(const e of [a,b]){const t=ball(e,2.2,dimMats[k]);t.renderOrder=12;dynamic.add(t);}
   rows.push([k,`${fmt(Math.abs(d))} ${word(d)}`]);
  }
  const total=Math.hypot(N[0]-C[0],N[1]-C[1],N[2]-C[2]);
  if(total>=0.5){const g=new THREE.BufferGeometry().setFromPoints([v3(C),v3(N)]),l=new THREE.Line(g,directMat);l.computeLineDistances();l.renderOrder=12;dynamic.add(l);}
  rows.push(['total',total>=0.5?`${fmt(total)} in total`:'same hand position']);
  callout(rows,'Right hand centre moves');
 }

 function addBar(bar,placed,material,gripMat){
  const pts=placed.points.map(v3),radii=placed.local.map(p=>barRadius(bar,p[0])*MM);
  dynamic.add(tube(pts,radii,material));
  // Grips: the outer 130 mm of each end.
  for(const side of [-1,1]){
   const e=placed.end.slice(),g=placed.grip.slice();if(side<0){e[2]=-e[2];g[2]=-g[2];}
   const a=e.map((v,i)=>v-g[i]*130);dynamic.add(rod(a,e,16,gripMat));
  }
 }
 function addClamps(placed){
  const m=placed.mount;
  for(const side of [-1,1]){
   const c=m.clamp.slice();c[2]=side*bike.clampHalf;
   const a=c.map((v,i)=>v-m.U[i]*(bike.riser+18)),b=c.map((v,i)=>v+m.U[i]*20);
   dynamic.add(rod([a[0],a[1],c[2]],[b[0],b[1],c[2]],20,mats.clamp));
  }
 }
 function addRider(pose,material,r){
  const parts=[[pose.hip,pose.shoulder,r*1.6]];
  for(const s of pose.sides)parts.push([s.shoulder,s.elbow,r],[s.elbow,s.hand,r*0.85],[s.hip,s.knee,r*1.3],[s.knee,s.ankle,r*1.05],[s.ankle,s.peg,r*0.7],[s.shoulder,pose.shoulder,r],[s.hip,pose.hip,r*1.3]);
  for(const [a,b,w] of parts)dynamic.add(rod(a,b,w,material));
  dynamic.add(ball(pose.head,pose.headRadius,material));
  for(const s of pose.sides)for(const j of [s.elbow,s.knee,s.shoulder])dynamic.add(ball(j,r*1.2,material));
 }

 let frame={target:new THREE.Vector3(),eye:null,hand:new THREE.Vector3()},anim=null,last=null,activeView='three';
 function update(state){
  last=state;const {current,candidate,photoOpacity}=state,hideRiders=activeView==='rider'||activeView==='hands',showRider=state.showRider&&!hideRiders,showGhostRider=state.showGhostRider&&!hideRiders;
  dispose(dynamic);overlay.replaceChildren();
  if(current){addBar(current.bar,current.placed,mats.current,mats.gripGhost);if(showGhostRider)addRider(current.pose,mats.riderGhost,22);}
  if(candidate){addBar(candidate.bar,candidate.placed,mats.candidate,mats.grip);if(showRider)addRider(candidate.pose,mats.rider,24);
  }
  // Hand-centre markers, visible through the grips.
  for(const [side,mat] of [[current,mats.handGhost],[candidate,mats.hand]])if(side)for(const s of [-1,1]){const h=side.placed.hand.slice();h[2]=s*Math.abs(h[2]);const m=ball(h,4.5,mat);m.renderOrder=11;dynamic.add(m);}
  if(state.showDims&&current&&candidate)addDims(current.placed.hand,candidate.placed.hand,state.fmtLen);
  addClamps((candidate||current).placed);
  photo.children.forEach(p=>{p.material.opacity=photoOpacity;p.visible=photoOpacity>0.01;});
  const main=candidate||current,hand=main.placed.hand;frame.target=v3(main.placed.mount.clamp);frame.eye=v3(main.pose.head);frame.hand=v3([hand[0],hand[1],Math.abs(hand[2])]);
 }
 const views={
  side:[[0,0.1,4.2],'bike'],three:[[2.3,1.15,2.5],'mid'],hands:[[0.26,0.12,0.16],'hand'],front:[[1.7,0.3,0],'bar'],top:[[-0.05,1.6,0.001],'bar'],rider:[[-0.75,0.5,0],'bar']};
 function view(name,instant=false){
  const close=v=>v==='rider'||v==='hands',was=activeView;activeView=name;if(last&&(close(was)||close(name)))update(last);
  const [o,on]=views[name],offset=new THREE.Vector3(...o);
  let target=on==='bike'?v3([bike.wheelbase/2+120,820,0]):on==='mid'?v3([bike.wheelbase*0.62,1000,0]):on==='hand'?frame.hand.clone():frame.target.clone(),pos=target.clone().add(offset);
  // From just behind the rider's eyes, with an eye-like field of view, looking down at the grips.
  if(name==='rider'&&frame.eye){pos=frame.eye.clone().add(new THREE.Vector3(-0.05,0.03,0));target=frame.target.clone().add(new THREE.Vector3(0.05,-0.05,0));}
  camera.fov=name==='rider'?55:35;camera.updateProjectionMatrix();
  if(instant){camera.position.copy(pos);controls.target.copy(target);controls.update();return;}
  anim={from:camera.position.clone(),to:pos,tFrom:controls.target.clone(),tTo:target,t:0};
 }
 function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
 new ResizeObserver(resize).observe(canvas);resize();
 renderer.setAnimationLoop(()=>{
  if(anim){anim.t=Math.min(1,anim.t+0.06);const e=1-(1-anim.t)**3;camera.position.lerpVectors(anim.from,anim.to,e);controls.target.lerpVectors(anim.tFrom,anim.tTo,e);if(anim.t>=1)anim=null;}
  controls.update();renderer.render(scene,camera);
 });
 return {update,view};
}
