// Pure geometry shared by the browser and the tests. Millimetres, degrees in inputs.
// World axes: x forward, y up, z toward the bike's right side. Rear axle at x=0.

export const DEFAULTS={center:190,control:170,backsweep:9,upsweep:4,handInset:70,bendRadius:55};
const rad=d=>d*Math.PI/180,deg=r=>r*180/Math.PI;
export const add=(a,b)=>a.map((v,i)=>v+b[i]);
export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const scale=(a,s)=>a.map(v=>v*s);
export const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
export const len=a=>Math.hypot(...a);
export const norm=a=>scale(a,1/(len(a)||1));
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

// Key points of one half of a bar in its own frame: u lateral, r rise, p pullback.
// rise is the grip-end centreline above the clamp centreline; pullback is measured the same way.
export function barShape(bar){
 const W=bar.width,R=bar.rise??0,P=bar.pullback??0;
 const center=Math.min(bar.center??DEFAULTS.center,W*0.45);
 const control=Math.min(bar.control??DEFAULTS.control,W/2-center/2-30);
 let dr;
 if(bar.knee_rise!=null)dr=Math.max(-control*0.5,Math.min(control*0.5,R-bar.knee_rise));
 else dr=control*Math.sin(rad(bar.upsweep??DEFAULTS.upsweep));
 const horiz=Math.sqrt(Math.max(control**2-dr**2,1));
 // Default back sweep never makes the riser lean further back than the grips.
 let a=rad(bar.backsweep??DEFAULTS.backsweep);
 if(bar.backsweep==null&&P>=0)a=Math.min(a,Math.asin(Math.min(1,P*0.8/horiz)));
 const end=[W/2,R,P],knee=[W/2-horiz*Math.cos(a),R-dr,P-horiz*Math.sin(a)];
 const grip=norm(sub(end,knee));
 return {center,control,end,knee,base:[center/2,0,0],grip,hand:sub(end,scale(grip,DEFAULTS.handInset)),
  backsweep:deg(a),upsweep:deg(Math.asin(dr/control))};
}

// Smooth centreline through the whole bar (left end to right end) with filleted bends.
export function barCurve(bar,steps=10){
 const s=barShape(bar),m=p=>[-p[0],p[1],p[2]];
 const pts=[m(s.end),m(s.knee),m(s.base),s.base,s.knee,s.end],out=[pts[0]];
 for(let i=1;i<pts.length-1;i++){
  const a=norm(sub(pts[i],pts[i-1])),b=norm(sub(pts[i+1],pts[i]));
  const turn=Math.acos(Math.max(-1,Math.min(1,dot(a,b))));
  const cut=Math.min(DEFAULTS.bendRadius*Math.tan(turn/2),len(sub(pts[i],pts[i-1]))*0.45,len(sub(pts[i+1],pts[i]))*0.45);
  if(cut<0.5){out.push(pts[i]);continue;}
  const p0=sub(pts[i],scale(a,cut)),p2=add(pts[i],scale(b,cut));
  for(let k=0;k<=steps;k++){const t=k/steps;out.push(add(add(scale(p0,(1-t)**2),scale(pts[i],2*t*(1-t))),scale(p2,t*t)));}
 }
 out.push(pts.at(-1));
 return {points:out,shape:s};
}

// Bar outer radius along its lateral position: tapered bars step down from the clamp section.
export function barRadius(bar,u){
 const grip=bar.dia==='7/8'?11.1:bar.dia==='1'?12.7:bar.dia==='3/4'?9.55:11.1;
 const clamp=bar.dia==='36mm'?18:bar.dia==='7/8'?11.1:bar.dia==='1'?12.7:bar.dia==='3/4'?9.55:14.3;
 const s=barShape(bar),a=s.center/2,b=s.knee[0];
 const t=Math.max(0,Math.min(1,(Math.abs(u)-a)/Math.max(b-a,1)));
 return clamp+(grip-clamp)*t*t*(3-2*t);
}

export function steering(bike){
 const e=rad(bike.rake),s=[-Math.sin(e),Math.cos(e),0],n=[Math.cos(e),Math.sin(e),0];
 const axle=[bike.wheelbase,bike.frontRadius,0],base=sub(axle,scale(n,bike.offset));
 return {s,n,axle,base,at:t=>add(base,scale(s,t))};
}

// Bar clamp centre and the bar's orientation. roll>0 rolls the bar forward.
// `neutral` is the extra forward roll that puts the bar's rise section parallel to the fork legs.
export function mount(bike,setup,neutral=0){
 const st=steering(bike);
 const clamp=add(st.at(bike.topClamp+(bike.riser??0)+(setup.riser??0)),scale(st.n,bike.mountOffset+(setup.mountShift??0)));
 const r=rad(-((setup.roll??0)+neutral)),rot=v=>[v[0]*Math.cos(r)-v[1]*Math.sin(r),v[0]*Math.sin(r)+v[1]*Math.cos(r),v[2]];
 const U=rot(st.s),B=rot(scale(st.n,-1)),L=[0,0,1];
 return {clamp,U,B,L,toWorld:p=>add(clamp,add(add(scale(L,p[0]),scale(U,p[1])),scale(B,p[2]))),dir:p=>add(add(scale(L,p[0]),scale(U,p[1])),scale(B,p[2]))};
}

// Side-view lean of the clamp-to-bend section; 0° roll stands this section parallel to the forks.
export function neutralRoll(shape){return deg(Math.atan2(shape.knee[2],shape.knee[1]));}

export function placedBar(bike,bar,setup){
 const {points,shape}=barCurve(bar),m=mount(bike,setup,neutralRoll(shape));
 const hand=m.toWorld(shape.hand),end=m.toWorld(shape.end),grip=m.dir(shape.grip);
 // Grip axis angles as the rider sees them, independent of fork rake.
 const back=deg(Math.atan2(-grip[0],grip[2])),up=deg(Math.atan2(grip[1],Math.hypot(grip[0],grip[2])));
 return {mount:m,shape,local:points,points:points.map(m.toWorld),hand,end,grip,backsweep:back,upsweep:up};
}

// Segment proportions after Drillis & Contini, scaled by standing height.
export function body(height){
 const h=height;
 return {shank:0.246*h,thigh:0.245*h,torso:0.288*h,neck:0.13*h,upperArm:0.186*h,forearm:0.146*h+0.045*h,
  shoulderHalf:0.129*h,hipHalf:0.09*h,ankleUp:0.039*h,ankleBack:0.06*h,head:0.065*h};
}

function twoBone(a,c,l1,l2,pole){
 const d=sub(c,a),dist=Math.min(len(d),l1+l2-0.01),dir=norm(d);
 const x=(l1*l1-l2*l2+dist*dist)/(2*dist),h=Math.sqrt(Math.max(l1*l1-x*x,0));
 const side=norm(sub(pole,scale(dir,dot(pole,dir))));
 const joint=add(add(a,scale(dir,x)),scale(side,h)),end=add(a,scale(dir,dist));
 const angle=deg(Math.acos(Math.max(-1,Math.min(1,dot(norm(sub(a,joint)),norm(sub(end,joint)))))));
 return {joint,end,angle,reached:len(d)<=l1+l2-0.01};
}

// A simple rider: feet on the pegs, then the most upright torso that puts the hands on the grips
// with elbows bent to `armReach` of full arm length.
export function riderPose(bike,placed,rider){
 const b=body(rider.height),standing=rider.posture!=='seated';
 const peg=[bike.peg[0],bike.peg[1],0];
 const ankle=add(peg,[-b.ankleBack,b.ankleUp,0]);
 let hip;
 if(standing){
  const kneeAngle=rad(rider.kneeAngle??145),reach=Math.sqrt(b.shank**2+b.thigh**2-2*b.shank*b.thigh*Math.cos(kneeAngle));
  const dx=-0.03*rider.height;hip=add(ankle,[dx,Math.sqrt(Math.max(reach**2-dx**2,1)),0]);
 }else hip=[bike.seatPoint[0],bike.seatPoint[1]+0.05*rider.height,0];
 const armLen=b.upperArm+b.forearm,target=armLen*(rider.armReach??0.9);
 const hand=placed.hand,shoulderOf=phi=>add(hip,[b.torso*Math.sin(phi),b.torso*Math.cos(phi),0]);
 const reach=phi=>len(sub([hand[0],hand[1],Math.abs(hand[2])],add(shoulderOf(phi),[0,0,b.shoulderHalf])));
 let phi=0;
 if(reach(0)>target){let lo=0,hi=rad(85);for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(reach(mid)>target)lo=mid;else hi=mid;}phi=hi;}
 const shoulder=shoulderOf(phi),torsoDir=norm(sub(shoulder,hip));
 const sides=[1,-1].map(side=>{
  const sh=add(shoulder,[0,0,side*b.shoulderHalf]),hd=[hand[0],hand[1],side*Math.abs(hand[2])];
  const arm=twoBone(sh,hd,b.upperArm,b.forearm,[-0.3,0.5,side*1]);
  const hp=add(hip,[0,0,side*b.hipHalf]),an=add(ankle,[0,0,side*(bike.pegHalf??190)]);
  const leg=twoBone(an,hp,b.shank,b.thigh,[1,0.2,0]);
  return {shoulder:sh,elbow:arm.joint,hand:hd,elbowAngle:arm.angle,reached:arm.reached,hip:hp,knee:leg.joint,ankle:an,kneeAngle:leg.angle,peg:[peg[0],peg[1],an[2]]};
 });
 const head=add(shoulder,scale(norm(add(torsoDir,[0.15,0,0])),b.neck));
 return {hip,shoulder,head,headRadius:b.head,sides,torsoLean:deg(phi),elbowAngle:sides[0].elbowAngle,kneeAngle:sides[0].kneeAngle,reached:sides.every(s=>s.reached)};
}

// Numbers the rider can feel, relative to the footpegs and seat.
export function ergonomics(bike,bar,setup,rider){
 const placed=placedBar(bike,bar,setup),pose=riderPose(bike,placed,rider),h=placed.hand;
 return {placed,pose,metrics:{
  gripHeightPeg:h[1]-bike.peg[1],gripReachPeg:h[0]-bike.peg[0],
  gripHeightSeat:h[1]-bike.seatPoint[1],gripReachSeat:h[0]-bike.seatPoint[0],
  gripWidth:2*Math.abs(h[2]),endWidth:2*Math.abs(placed.end[2]),
  gripBacksweep:placed.backsweep,gripUpsweep:placed.upsweep,
  clampHeight:placed.mount.clamp[1],
  torsoLean:pose.torsoLean,elbowAngle:pose.elbowAngle,kneeAngle:pose.kneeAngle,reached:pose.reached}};
}

export const METRICS=[
 ['gripHeightPeg','Grip height above pegs','mm'],['gripReachPeg','Grip ahead of pegs','mm'],
 ['gripHeightSeat','Grip height above seat','mm'],['gripReachSeat','Grip ahead of seat point','mm'],
 ['gripWidth','Hand spacing (grip centres)','mm'],['gripBacksweep','Grip back-sweep (as ridden)','°'],
 ['gripUpsweep','Grip up-sweep (as ridden)','°'],['torsoLean','Torso lean from vertical','°']];
