(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d',{alpha:false,desynchronized:true});
  const $ = id => document.getElementById(id);
  const VIEW_W=1400,VIEW_H=790;
  // Keep the tablet canvas above 3K wide without forcing a 7.5 MP redraw
  // every frame on high-DPR screens.
  const PIXEL_RATIO=Math.min(2.4,Math.max(1.75,(window.devicePixelRatio||1)*1.08));
  canvas.width=Math.round(VIEW_W*PIXEL_RATIO);canvas.height=Math.round(VIEW_H*PIXEL_RATIO);
  ctx.setTransform(PIXEL_RATIO,0,0,PIXEL_RATIO,0,0);
  const W = 100, H = 50, R = 1.125, DISPLAY_R = R * 1.035;
  // The reference is an 82 mm corner mouth. Keep the current playable opening
  // and enlarge all six mouths by the same small amount for this preview.
  const CORNER_MOUTH = 82 * 1.05 * 1.05 * .98 * 1.02 * 1.025 * 1.02 * 1.02 * 1.02 / 25.4, SIDE_MOUTH = CORNER_MOUTH;
  const CUT = CORNER_MOUTH / Math.SQRT2, SIDE_L = W / 2 - SIDE_MOUTH / 2, SIDE_R = W / 2 + SIDE_MOUTH / 2;
  const THROAT_DEPTH = 1.5, THROAT_HALF = CORNER_MOUTH/2-R*.35;
  const SCALE = 11.2, OX = 140, OY = 115;
  const STEP = 1 / 180, COLORS = ['#f7f1e5','#f5b928','#1556ae','#c91f37','#623282','#dd742a','#086e5c','#70331e','#11131a'];
  // World distances are inches.  A solid sphere has I = 2/5 mr², so cloth
  // friction changes contact slip 3.5 times as fast as centre velocity.
  const GRAVITY = 386.09, SLIDE_DECEL = .20 * GRAVITY, ROLL_DECEL = .012 * GRAVITY;
  const PALETTE=COLORS.map(hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)));
  const POCKETS = [
    {x:0,y:0,name:'左上角袋'}, {x:50,y:0,name:'上中袋'}, {x:100,y:0,name:'右上角袋'},
    {x:0,y:50,name:'左下角袋'}, {x:50,y:50,name:'下中袋'}, {x:100,y:50,name:'右下角袋'}
  ];
  const state = {mode:null,opponent:'ai',aiDifficulty:'normal',aiTicket:0,aiThinking:false,phase:'menu',balls:[],pocketAnimations:[],turn:0,groups:[null,null],scores:[0,0],breaking:true,rackSeed:0,ballInHand:false,repositionAllowed:false,aim:-0.02,power:56,spinX:0,spinY:0,shot:null,stopTime:0,shotTime:0,status:'启动球场，选择对局',winner:null,drag:null};
  // Trial shots use the live collision/cloth functions, with isolated events.
  // Never play sounds, emit pocket flashes, or edit the real shot during trials.
  let physicsContext=null;
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const randomSeed = () => (window.crypto?.getRandomValues?.(new Uint32Array(1))[0] ?? (Math.random()*0x100000000)) >>> 0;
  function seededRandom(seed){let s=seed>>>0;return () => {s=(s+0x6D2B79F5)>>>0;let t=Math.imul(s^(s>>>15),1|s);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};}
  function shuffle(values,rng){for(let i=values.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[values[i],values[j]]=[values[j],values[i]];}return values;}
  const worldToScreen = (x,y) => ({x:OX+x*SCALE,y:OY+y*SCALE});
  const screenToWorld = (x,y) => ({x:(x-OX)/SCALE,y:(y-OY)/SCALE});
  const ball = (n,x,y) => {const a=(n*7%9-4)*.025,b=(n*11%9-4)*.025;return {n,x,y,vx:0,vy:0,rollVx:0,rollVy:0,spin:0,english:false,roll:0,rollHeading:0,q:[a,b,0,Math.sqrt(1-a*a-b*b)],sprite:null,spritePixels:null,spriteDirty:true,spriteAngle:0,pocketCandidate:null,pocketed:false};};
  const cue = () => state.balls.find(b => b.n === 0);
  const live = () => state.balls.filter(b => !b.pocketed);
  const activeBalls = () => state.balls.filter(b => !b.pocketed && b.n !== 0);
  const group = n => n >= 1 && n <= 7 ? 'solid' : n >= 9 && n <= 15 ? 'stripe' : null;
  const groupName = g => g === 'solid' ? '全色球' : g === 'stripe' ? '花色球' : '待分组';
  const actor = i => i===1&&state.opponent==='ai'?'电脑':`玩家 ${i+1}`;
  const currentGroup = () => state.groups[state.turn];
  const allGroupGone = g => g && !activeBalls().some(b => group(b.n) === g);
  const lowestNine = () => Math.min(...activeBalls().map(b => b.n));
  const say = text => {state.status=text; $('statusText').textContent=text;};
  function syncPowerUI() {
    $('power').value=String(state.power);
    $('powerReadout').textContent=Number(state.power.toFixed(1))+'%';
    $('cueMeter').setAttribute('aria-valuenow',String(state.power));
    $('cueMeter').style.setProperty('--power-height',`${Math.round(state.power*.65)}%`);
  }
  function init(mode) {
    state.aiTicket++;state.aiThinking=false;state.aiPlan=null;
    state.mode=mode; state.phase='aim'; state.turn=0; state.groups=[null,null]; state.scores=[0,0];
    state.breaking=true; state.ballInHand=false; state.repositionAllowed=false; state.aim=0; state.power=56; state.spinX=0; state.spinY=0;
    state.shot=null; state.stopTime=0; state.shotTime=0; state.winner=null;
    state.balls=[ball(0,25,25)];state.pocketAnimations=[];state.rackSeed=randomSeed();
    const rackRng=seededRandom(state.rackSeed);
    if (mode==='eight') rackEight(rackRng); else rackNine(rackRng);
    $('startOverlay').classList.add('hidden');$('menuOverlay').classList.add('hidden');$('player2Name').textContent=state.opponent==='ai'?'电脑':'玩家 2';
    syncPowerUI(); moveSpinDot();
    say(mode==='eight'?'八球开球：拖动画面瞄准，调节力度后击球。':'九球开球：先碰 1 号球。');
    updateUI(); render();
  }
  function rackEight(rng) {
    const solids=shuffle([1,2,3,4,5,6,7],rng),stripes=shuffle([9,10,11,12,13,14,15],rng);
    const rows=[[null],[null,null],[null,8,null],[null,null,null,null],[solids.pop(),null,null,null,stripes.pop()]];
    const remaining=shuffle([...solids,...stripes],rng);
    for(let row=0;row<5;row++) for(let col=0;col<=row;col++) {
      const n=rows[row][col]??remaining.pop();
      state.balls.push(ball(n,74+row*(Math.sqrt(3)*R+.01)+(rng()-.5)*.004,25+(col-row/2)*(2*R+.01)+(rng()-.5)*.004));
    }
  }
  function rackNine(rng) {
    const others=shuffle([2,3,4,5,6,7,8],rng);
    const rows=[[1],[others.pop(),others.pop()],[others.pop(),9,others.pop()],[others.pop(),others.pop()],[others.pop()]];
    rows.forEach((numbers,row) => numbers.forEach((n,col) => {
      state.balls.push(ball(n,74+row*(Math.sqrt(3)*R+.01)+(rng()-.5)*.004,25+(col-(numbers.length-1)/2)*(2*R+.01)+(rng()-.5)*.004));
    }));
  }
  function updateUI() {
    $('modeLabel').textContent=state.mode==='nine'?'九球':'八球';
    $('turnLabel').textContent=state.phase==='gameover'?'本局结束':state.phase==='moving'?'球正在运动':`${actor(state.turn)}的回合`;
    for(let i=0;i<2;i++) {
      $('player'+i).classList.toggle('active',i===state.turn);
      $('group'+i).textContent=state.mode==='nine'?'最小号优先':groupName(state.groups[i]);
      $('score'+i).textContent=state.scores[i];
    }
    $('shootBtn').disabled=state.phase!=='aim'||state.ballInHand||(state.opponent==='ai'&&state.turn===1);
    $('placeCueBtn').hidden=!(state.phase==='aim'&&state.repositionAllowed&&!(state.opponent==='ai'&&state.turn===1));
    $('placeCueBtn').textContent=state.ballInHand?'确认白球位置':'重新摆放白球';
    $('tipText').textContent=state.phase==='gameover'?'本局结束，可开启下一场。':state.ballInHand?'自由球：拖动白球，满意后确认位置。':'拖动瞄准，拉动球杆出杆。';
    syncAngleUI();
  }
  function syncAngleUI(){
    const degrees=((state.aim*180/Math.PI+180)%360+360)%360-180;
    $('angleReadout').textContent=degrees.toFixed(3)+'°';
    const ruler=$('angleRuler');
    ruler.setAttribute('aria-valuenow',degrees.toFixed(3));
    ruler.style.setProperty('--tick-offset',`${(-degrees*100)%100}px`);
  }
  function aimAt(x,y) {
    const c=cue(); if(!c||state.phase!=='aim'||state.ballInHand||(state.opponent==='ai'&&state.turn===1))return;
    const dx=x-c.x,dy=y-c.y;
    if(Math.hypot(dx,dy)<2)return;
    state.aim=Math.atan2(dy,dx); updateUI(); render();
  }
  function fire(byAI=false) {
    if(state.phase!=='aim'||state.ballInHand||(state.opponent==='ai'&&state.turn===1&&!byAI))return;
    const c=cue(); if(!c||c.pocketed)return;
    // A new stroke must never inherit a lingering flash from the last one.
    state.pocketAnimations=[];
    state.shot={shooter:state.turn,breaking:state.breaking,firstHit:null,pocketed:[],railAfterHit:false,breakRails:new Set(),groupAtStart:currentGroup(),eightReady:!!allGroupGone(currentGroup())};
    const breakForce=state.breaking?.99+Math.random()*.02:1;
    launchCue(c,breakForce);
    state.spinX=0;state.spinY=0;moveSpinDot();
    state.phase='moving';state.repositionAllowed=false;state.stopTime=0;state.shotTime=0;
    window.PoolAudio?.play('cue',Math.hypot(c.vx,c.vy));
    say(byAI&&state.aiPlan?`电脑：${state.aiPlan.description}`:`${actor(state.turn)}击球中…`);updateUI();render();
  }
  function cueLaunchSpeed(power,breaking=false,force=1){
    // Extra acceleration is confined to the upper end of the pullback.
    // Low-power touch shots keep their familiar response; full power is +40%.
    const boost=1+.4*(Math.max(0,(power-60)/40))**2;
    return (17+power*.78)*boost*(breaking?2.5+1.65*power/100:1)*force;
  }
  function launchCue(c,breakForce=1){
    applyCueImpulse(c,state.power,state.aim,state.spinX,state.spinY,state.breaking,breakForce);
  }
  function applyCueImpulse(c,power,aim,spinX=0,spinY=0,breaking=false,force=1){
    const speed=cueLaunchSpeed(power,breaking,force),shotAngle=aim-spinX*.018;
    const spinGain=1+.55*(power/100)**2;
    c.vx=Math.cos(shotAngle)*speed;c.vy=Math.sin(shotAngle)*speed;
    c.rollVx=Math.cos(shotAngle)*speed*spinY*1.05*spinGain;
    c.rollVy=Math.sin(shotAngle)*speed*spinY*1.05*spinGain;
    c.spin=spinX*speed*.42*spinGain;c.english=Math.abs(spinX)>.03;c.rollHeading=shotAngle;
  }
  function markPocket(b,index) {
    if(b.pocketed)return;
    if(!physicsContext&&state.phase==='moving'&&state.balls.includes(b)){
      const impact=Math.hypot(b.vx,b.vy);
      const pocket=POCKETS[index];
      state.pocketAnimations.push({visual:{...b,q:[...b.q]},entryX:b.x,entryY:b.y,effectX:pocket.x,effectY:pocket.y,pocket:index,age:0,impact});
      window.PoolAudio?.play('pocket',impact);
    }
    b.pocketed=true;b.vx=0;b.vy=0;b.rollVx=0;b.rollVy=0;b.spin=0;
    const events=physicsContext||state.shot;
    if(events)events.pocketed.push({n:b.n,pocket:index});
  }
  function pocketCheck(b) {
    // A ball falls only after travelling through the straight inner channel.
    let candidate=null,bestDepth=0;
    for(const [index,x,y] of [[0,b.x,b.y],[2,W-b.x,b.y],[3,b.x,H-b.y],[5,W-b.x,H-b.y]]){
      const depth=(CUT-x-y)/Math.SQRT2,lateral=(x-y)/Math.SQRT2;
      if(depth>0&&Math.abs(lateral)<THROAT_HALF+R*.2){
        if(depth>bestDepth){candidate=index;bestDepth=depth;}
        if(depth>THROAT_DEPTH){b.pocketCandidate=index;return markPocket(b,index);}
      }
    }
    if(Math.abs(b.x-W/2)<THROAT_HALF+R*.2){
      if(b.y<0){candidate=1;if(b.y<-THROAT_DEPTH){b.pocketCandidate=1;return markPocket(b,1);}}
      if(b.y>H){candidate=4;if(b.y>H+THROAT_DEPTH){b.pocketCandidate=4;return markPocket(b,4);}}
    }
    b.pocketCandidate=candidate;
    if(b.x < -6 || b.x > W+6 || b.y < -6 || b.y > H+6){
      // An escape outside a real throat is a collision-recovery case, never
      // evidence of a pocket. The old nearest-pocket fallback mislabeled it.
      const escapedX=b.x<-6||b.x>W+6,escapedY=b.y<-6||b.y>H+6;
      b.x=clamp(b.x,R,W-R);b.y=clamp(b.y,R,H-R);
      if(escapedX)b.vx*=-.45;
      if(escapedY)b.vy*=-.45;
      b.rollVx=b.vx;b.rollVy=b.vy;b.pocketCandidate=null;
    }
  }
  function railHit(b,nx,ny,jaw=false) {
    const dot=b.vx*nx+b.vy*ny;
    if(dot<0){
      const approach=-dot;
      const tangentX=-ny,tangentY=nx;
      const tangentBefore=b.vx*tangentX+b.vy*tangentY;
      const spinBefore=b.spin;
      const sideEnglish=Math.abs(spinBefore)>.5;
      const restitution=jaw?.69:.79;
      let tangentAfter=tangentBefore*(jaw?.94:.985);
      let spinAfter=spinBefore;
      if(sideEnglish){
        // Cushion friction trades side-spin for tangential travel. Running
        // English can increase translational speed, but never total energy.
        const slip=tangentBefore-spinBefore;
        const impulse=clamp(-slip*.19,-(1+restitution)*approach*.14,(1+restitution)*approach*.14);
        tangentAfter+=impulse;
        spinAfter-=2.5*impulse;
      }
      let normalAfter=approach*restitution;
      const energyBefore=approach*approach+tangentBefore*tangentBefore+.4*spinBefore*spinBefore;
      const energyAfter=normalAfter*normalAfter+tangentAfter*tangentAfter+.4*spinAfter*spinAfter;
      if(energyAfter>energyBefore*.985){const scale=Math.sqrt(energyBefore*.985/energyAfter);normalAfter*=scale;tangentAfter*=scale;spinAfter*=scale;}
      b.vx=nx*normalAfter+tangentX*tangentAfter;
      b.vy=ny*normalAfter+tangentY*tangentAfter;
      b.spin=spinAfter;
      // The cushion removes most forward roll. The brief skid afterward
      // dissipates more speed without bending a no-English bank's path.
      b.rollVx=b.vx*.25;b.rollVy=b.vy*.25;
      if(!physicsContext&&state.phase==='moving')window.PoolAudio?.play('rail',approach);
      b.hitRail=true;
      const events=physicsContext||state.shot;
      if(events){if(events.firstHit!==null)events.railAfterHit=true;if(b.n!==0)events.breakRails.add(b.n);}
    }
  }
  function collideJaw(b,x,y,side=false) {
    const dx=b.x-x,dy=b.y-y,dist=Math.hypot(dx,dy),min=R+(side?.05:.16);
    if(dist>=min)return;
    const nx=dist>1e-6?dx/dist:1,ny=dist>1e-6?dy/dist:0;
    b.x=x+nx*min;b.y=y+ny*min;railHit(b,nx,ny,true);
  }
  function throatWalls(b){
    // The pocket channel has two short, straight rubber-lined walls. Its
    // lateral coordinate is identical to the rendered throat below.
    for(const [cx,cy,index] of [[0,0,0],[W,0,2],[0,H,3],[W,H,5]]){
      const sx=cx===0?1:-1,sy=cy===0?1:-1;
      const ix=sx*(b.x-cx),iy=sy*(b.y-cy);
      const depth=(CUT-ix-iy)/Math.SQRT2;
      if(depth<=0||depth>=THROAT_DEPTH)continue;
      const lateral=(ix-iy)/Math.SQRT2;
      if(Math.abs(lateral)<=THROAT_HALF)continue;
      const sign=Math.sign(lateral),offset=Math.abs(lateral)-THROAT_HALF;
      b.x-=sx*sign*offset/Math.SQRT2;
      b.y+=sy*sign*offset/Math.SQRT2;
      railHit(b,-sx*sign/Math.SQRT2,sy*sign/Math.SQRT2,true);
    }
    for(const [cy,sign] of [[0,-1],[H,1]]){
      const depth=sign*(b.y-cy);
      if(depth<=0||depth>=THROAT_DEPTH)continue;
      const lateral=b.x-W/2;
      if(Math.abs(lateral)<=THROAT_HALF)continue;
      const wall=Math.sign(lateral);
      b.x=W/2+wall*THROAT_HALF;
      railHit(b,-wall,0,true);
    }
  }
  function rails(b) {
    const horiz = x => (x>=CUT&&x<=SIDE_L)||(x>=SIDE_R&&x<=W-CUT);
    if(b.y<R&&horiz(b.x)){b.y=R;railHit(b,0,1);}
    if(b.y>H-R&&horiz(b.x)){b.y=H-R;railHit(b,0,-1);}
    if(b.x<R&&b.y>=CUT&&b.y<=H-CUT){b.x=R;railHit(b,1,0);}
    if(b.x>W-R&&b.y>=CUT&&b.y<=H-CUT){b.x=W-R;railHit(b,-1,0);}
    const jaws=[[CUT,0],[SIDE_L,0],[SIDE_R,0],[W-CUT,0],[0,CUT],[W,CUT],[0,H-CUT],[W,H-CUT],[CUT,H],[SIDE_L,H],[SIDE_R,H],[W-CUT,H]];
    for(const [x,y] of jaws)collideJaw(b,x,y,x===SIDE_L||x===SIDE_R);
    throatWalls(b);
  }
  function ballsCollide(a,b) {
    const dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy,limit=2*R;
    if(d2>=limit*limit)return false;
    const dist=Math.sqrt(Math.max(d2,1e-9));const nx=dx/dist,ny=dy/dist;
    const overlap=limit-dist;
    a.x-=nx*overlap*.5;b.x+=nx*overlap*.5;a.y-=ny*overlap*.5;b.y+=ny*overlap*.5;
    const rel=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
    if(rel>=0)return false;
    const impulse=-(1+.94)*rel/2;
    a.vx-=impulse*nx;a.vy-=impulse*ny;b.vx+=impulse*nx;b.vy+=impulse*ny;
    const tx=-ny,ty=nx;
    const tangentSlip=(b.vx-a.vx)*tx+(b.vy-a.vy)*ty-(a.spin+b.spin);
    const tangentImpulse=clamp(-tangentSlip/7,-impulse*.055,impulse*.055);
    a.vx-=tangentImpulse*tx;a.vy-=tangentImpulse*ty;
    b.vx+=tangentImpulse*tx;b.vy+=tangentImpulse*ty;
    a.spin-=2.5*tangentImpulse;b.spin-=2.5*tangentImpulse;
    const events=physicsContext||state.shot;
    if(events && events.firstHit===null && (a.n===0||b.n===0)){
      events.firstHit=a.n===0?b.n:a.n;
    }
    if(!physicsContext&&state.phase==='moving')window.PoolAudio?.play('ball',-rel);
    return true;
  }
  function clothStep(b,dt) {
    const slipX=b.vx-b.rollVx,slipY=b.vy-b.rollVy,slip=Math.hypot(slipX,slipY);
    let rollingTime=dt;
    if(slip>1e-7){
      const slidingTime=Math.min(dt,slip/(3.5*SLIDE_DECEL));
      const delta=SLIDE_DECEL*slidingTime;
      const fx=slipX/slip*delta,fy=slipY/slip*delta;
      b.vx-=fx;b.vy-=fy;b.rollVx+=fx*2.5;b.rollVy+=fy*2.5;
      rollingTime=dt-slidingTime;
      if(rollingTime>0){b.rollVx=b.vx;b.rollVy=b.vy;}
    }else{b.rollVx=b.vx;b.rollVy=b.vy;}
    if(rollingTime>0){
      const speed=Math.hypot(b.vx,b.vy);
      // v(t) = max(0, v0 - µr g t); never reverse a nearly stopped ball.
      if(speed>0){
        const drag=Math.min(speed,ROLL_DECEL*rollingTime);
        b.vx-=b.vx/speed*drag;b.vy-=b.vy/speed*drag;
        b.rollVx=b.vx;b.rollVy=b.vy;
      }
    }
    // Cloth also slows rotation around the vertical axis. Keeping it as a
    // separate, bounded deceleration lets the ball finish its last visible
    // turn before the shot is declared settled.
    const sideSpeed=Math.abs(b.spin);
    if(sideSpeed>.0001){const drag=Math.min(sideSpeed,12*Math.min(1,sideSpeed/1.5)*dt);b.spin-=Math.sign(b.spin)*drag;}
  }
  function advanceBallOrientation(b,dt){
    const wx=-b.rollVy/R,wy=b.rollVx/R,wz=b.spin/R,rate=Math.hypot(wx,wy,wz);
    if(rate<.015)return;
    const half=rate*dt*.5,s=Math.sin(half)/rate,dq=[wx*s,wy*s,wz*s,Math.cos(half)],q=b.q;
    const next=[dq[3]*q[0]+dq[0]*q[3]+dq[1]*q[2]-dq[2]*q[1],dq[3]*q[1]-dq[0]*q[2]+dq[1]*q[3]+dq[2]*q[0],dq[3]*q[2]+dq[0]*q[1]-dq[1]*q[0]+dq[2]*q[3],dq[3]*q[3]-dq[0]*q[0]-dq[1]*q[1]-dq[2]*q[2]];
    const magnitude=Math.hypot(...next);b.q=next.map(v=>v/magnitude);
    // Position still renders every frame. Rebuild the costly sphere texture
    // only after its markings rotate enough to change a visible pixel.
    b.spriteAngle+=rate*dt;
    if(b.spriteAngle>=.08){b.spriteDirty=true;b.spriteAngle=0;}
  }
  function update(dt) {
    state.pocketAnimations=state.pocketAnimations.filter(a=>(a.age+=dt)<.58);
    if(state.phase!=='moving')return;
    state.shotTime+=dt;
    // During a hard break, reduce travel per collision check so a ball cannot
    // tunnel through the rack or escape a pocket mouth between two frames.
    const topSpeed=Math.max(0,...live().map(b=>Math.hypot(b.vx,b.vy)));
    const subdivisions=clamp(Math.ceil(topSpeed*dt/(R*.45)),1,8),subdt=dt/subdivisions;
    for(let sub=0;sub<subdivisions;sub++){
      const moving=live();
      for(const b of moving){
        clothStep(b,subdt);
        advanceBallOrientation(b,subdt);
        const rollSpeed=Math.hypot(b.rollVx,b.rollVy);
        if(rollSpeed>.01){b.roll+=rollSpeed*subdt/R;b.rollHeading=Math.atan2(b.rollVy,b.rollVx);}
        b.x+=b.vx*subdt;b.y+=b.vy*subdt;
        rails(b);pocketCheck(b);
      }
      for(let i=0;i<moving.length;i++)for(let j=i+1;j<moving.length;j++)if(!moving[i].pocketed&&!moving[j].pocketed)ballsCollide(moving[i],moving[j]);
    }
    if(live().every(b=>Math.hypot(b.vx,b.vy)<.12&&Math.hypot(b.rollVx,b.rollVy)<.12&&Math.abs(b.spin)<.12))state.stopTime+=dt;else state.stopTime=0;
    if(state.stopTime>.3||state.shotTime>30){for(const b of live()){b.vx=0;b.vy=0;b.rollVx=0;b.rollVy=0;b.spin=0;}endShot();}
  }
  function spotBall(n) {
    const b=state.balls.find(q=>q.n===n);if(!b)return;
    for(let step=0;step<55;step++){
      const x=75-step*2.3,y=25;
      if(x<R||live().some(q=>q!==b&&Math.hypot(q.x-x,q.y-y)<2*R+.1))continue;
      b.x=x;b.y=y;b.pocketed=false;b.vx=b.vy=b.rollVx=b.rollVy=b.spin=0;return;
    }
    b.x=75;b.y=25;b.pocketed=false;
  }
  function resetCueForHand() {
    const c=cue();c.pocketed=false;c.vx=c.vy=c.rollVx=c.rollVy=c.spin=0;
    for(let x=25;x>=6;x-=2.5){if(!activeBalls().some(b=>Math.hypot(b.x-x,b.y-25)<2*R+.2)){c.x=x;c.y=25;break;}}
    state.ballInHand=true;state.repositionAllowed=true;
  }
  function endShot() {
    const s=state.shot; if(!s)return;
    state.shot=null;state.phase='aim';state.breaking=false;
    const nums=s.pocketed.map(p=>p.n),objectPots=nums.filter(n=>n!==0),scratch=nums.includes(0);
    const wrongFirst=s.firstHit===null || (state.mode==='nine'?s.firstHit!==Math.min(...state.balls.filter(b=>b.n>0&&(!b.pocketed||nums.includes(b.n))).map(b=>b.n)):s.groupAtStart?(s.eightReady?s.firstHit!==8:group(s.firstHit)!==s.groupAtStart):s.firstHit===8);
    const noRail=s.firstHit!==null&&!s.railAfterHit&&objectPots.length===0;
    const foul=scratch||wrongFirst||noRail;
    const foulReason=scratch?'白球落袋':wrongFirst?'未先碰合法目标球':noRail?'碰球后未碰库或落袋':'';
    if(state.mode==='nine'){
      if(nums.includes(9)){
        if(foul||s.breaking)spotBall(9);
        else return finish(s.shooter,'合法打进 9 号球');
      }
      if(foul){state.turn=1-s.shooter;resetCueForHand();say(`${foulReason}，${actor(state.turn)}自由摆球。`);}
      else if(objectPots.length){state.scores[s.shooter]+=objectPots.filter(n=>n!==9).length;state.turn=s.shooter;say(`合法进球！${actor(state.turn)}继续。`);}
      else{state.turn=1-s.shooter;say(`未进球，轮到${actor(state.turn)}。`);}
    } else {
      const eight=s.pocketed.find(p=>p.n===8);
      if(eight){
        if(s.breaking){spotBall(8);say('开球打进 8 号球，8 号球重新摆放。');}
        else if(foul||!s.eightReady)return finish(1-s.shooter, foul?'打进 8 号球时犯规':'提前打进 8 号球');
        else return finish(s.shooter,'合法打进 8 号球');
      }
      const groupPots=objectPots.filter(n=>n!==8);
      if(!foul&&!s.breaking&&!s.groupAtStart&&groupPots.length){
        state.groups[s.shooter]=group(groupPots[0]);state.groups[1-s.shooter]=state.groups[s.shooter]==='solid'?'stripe':'solid';
      }
      if(foul){state.turn=1-s.shooter;resetCueForHand();say(`${foulReason}，${actor(state.turn)}自由摆球。`);}
      else if(s.breaking&&objectPots.length){state.turn=s.shooter;say(`开球进球，${actor(state.turn)}继续。`);}
      else if(s.groupAtStart&&groupPots.some(n=>group(n)===s.groupAtStart)){state.scores[s.shooter]+=groupPots.filter(n=>group(n)===s.groupAtStart).length;state.turn=s.shooter;say(`合法进球！${actor(state.turn)}继续。`);}
      else if(!s.groupAtStart&&groupPots.length){state.scores[s.shooter]+=groupPots.length;state.turn=s.shooter;say(`${actor(state.turn)}继续，已分配${groupName(state.groups[s.shooter])}。`);}
      else{state.turn=1-s.shooter;say(`轮到${actor(state.turn)}。`);}
    }
    if(scratch&&!state.ballInHand)resetCueForHand();
    updateUI();render();queueAI();
  }
  function finish(winner,reason) {
    state.winner=winner;state.turn=winner;state.phase='gameover';state.ballInHand=false;state.repositionAllowed=false;
    say(`${actor(winner)}获胜 · ${reason}。点击“新开一局”继续。`);
    updateUI();render();
  }
  function lineClear(x1,y1,x2,y2,ignored) {
    return lineClearIn(live(),x1,y1,x2,y2,ignored);
  }
  function lineClearIn(balls,x1,y1,x2,y2,ignored) {
    const dx=x2-x1,dy=y2-y1,len2=dx*dx+dy*dy;
    return balls.every(b=>{
      if(ignored.includes(b.n))return true;
      const t=clamp(((b.x-x1)*dx+(b.y-y1)*dy)/Math.max(len2,.01),0,1);
      return Math.hypot(b.x-x1-t*dx,b.y-y1-t*dy)>2*R+.25;
    });
  }
  function aiTargets(){
    return state.mode==='nine'?activeBalls().filter(b=>b.n===lowestNine()):activeBalls().filter(b=>currentGroup()?(allGroupGone(currentGroup())?b.n===8:group(b.n)===currentGroup()):b.n!==8);
  }
  function pocketAim(index,lateral=0){
    const p=POCKETS[index],side=p.x===W/2;
    const dx=side?0:(p.x===0?-Math.SQRT1_2:Math.SQRT1_2),dy=side?(p.y===0?-1:1):(p.y===0?-Math.SQRT1_2:Math.SQRT1_2);
    return {x:(side?p.x:p.x===0?CUT/2:W-CUT/2)+dx*.3-dy*lateral,y:(side?p.y:p.y===0?CUT/2:H-CUT/2)+dy*.3+dx*lateral};
  }
  function aiOptions(targets){
    const c=cue(),options=[];
    for(const target of targets)for(let pocket=0;pocket<6;pocket++)for(const lateral of [0,-.5,.5]){
      const p=pocketAim(pocket,lateral),pd=Math.hypot(p.x-target.x,p.y-target.y);
      if(pd<.1||!lineClear(target.x,target.y,p.x,p.y,[0,target.n]))continue;
      const nx=(p.x-target.x)/pd,ny=(p.y-target.y)/pd,gx=target.x-nx*2*R,gy=target.y-ny*2*R;
      const cd=Math.hypot(gx-c.x,gy-c.y),cos=((gx-c.x)*nx+(gy-c.y)*ny)/Math.max(cd,.01);
      if(gx<R||gx>W-R||gy<R||gy>H-R||cos<.28||!lineClear(c.x,c.y,gx,gy,[0,target.n]))continue;
      // Wide cuts and long object-ball travel are less forgiving than cue travel.
      options.push({target:target.n,pocket,aim:Math.atan2(gy-c.y,gx-c.x),cd,pd,cos,score:pd*.8+cd*.35+(1-cos)*70+Math.abs(lateral)*2});
    }
    return options.sort((a,b)=>a.score-b.score);
  }
  function simulateAIShot(plan){
    const balls=live().map(b=>({...b,q:[...b.q]})),c=balls.find(b=>b.n===0);
    const events={firstHit:null,pocketed:[],railAfterHit:false,breakRails:new Set()};
    const previous=physicsContext;physicsContext=events;
    try{
      applyCueImpulse(c,plan.power,plan.aim,0,plan.spinY||0,false);
      for(let frame=0;frame<3600;frame++){
        const remaining=balls.filter(b=>!b.pocketed);
        const speed=Math.max(0,...remaining.map(b=>Math.hypot(b.vx,b.vy))),subdivisions=clamp(Math.ceil(speed*STEP/(R*.45)),1,8),dt=STEP/subdivisions;
        for(let sub=0;sub<subdivisions;sub++){
          for(const b of remaining){if(b.pocketed)continue;clothStep(b,dt);b.x+=b.vx*dt;b.y+=b.vy*dt;rails(b);pocketCheck(b);}
          for(let i=0;i<remaining.length;i++)for(let j=i+1;j<remaining.length;j++){
            const a=remaining[i],b=remaining[j];
            if(!a.pocketed&&!b.pocketed&&(a.vx||a.vy||b.vx||b.vy))ballsCollide(a,b);
          }
        }
        if(remaining.every(b=>b.pocketed||Math.hypot(b.vx,b.vy)<.12&&Math.hypot(b.rollVx,b.rollVy)<.12&&Math.abs(b.spin)<.12))break;
      }
    }finally{physicsContext=previous;}
    const legal=aiTargets().some(b=>b.n===events.firstHit),scratch=events.pocketed.some(b=>b.n===0);
    const earlyEight=state.mode==='eight'&&events.pocketed.some(b=>b.n===8)&&!aiTargets().some(b=>b.n===8);
    return {...events,balls,safe:legal&&!scratch&&!earlyEight&&(events.railAfterHit||events.pocketed.length>0),potted:events.pocketed.some(b=>b.n===plan.target&&b.pocket===plan.pocket)};
  }
  function powerForSpeed(speed){
    let low=0,high=100;
    for(let i=0;i<14;i++){const mid=(low+high)/2;if(cueLaunchSpeed(mid)<speed)low=mid;else high=mid;}
    return clamp((low+high)/2,8,100);
  }
  function aiPositionScore(result){
    const c=result.balls.find(b=>b.n===0);
    const remaining=result.balls.filter(b=>!b.pocketed&&b.n!==0);
    const own=state.mode==='nine'?remaining.filter(b=>b.n===Math.min(...remaining.map(q=>q.n))):remaining.filter(b=>currentGroup()?group(b.n)===currentGroup():b.n!==8);
    const nextDistance=own.length?Math.min(...own.map(b=>Math.hypot(b.x-c.x,b.y-c.y))):0;
    const railDistance=Math.min(c.x,W-c.x,c.y,H-c.y);
    return nextDistance*.22+(railDistance<3?8:0);
  }
  function safetyPosition(result){
    const balls=result.balls.filter(b=>!b.pocketed),c=balls.find(b=>b.n===0),objects=balls.filter(b=>b.n!==0);
    const opponentGroup=state.groups[1-state.turn];
    let targets=state.mode==='nine'?objects.filter(b=>b.n===Math.min(...objects.map(q=>q.n))):objects.filter(b=>opponentGroup?group(b.n)===opponentGroup:b.n!==8);
    if(!targets.length&&state.mode==='eight')targets=objects.filter(b=>b.n===8);
    let threat=0,visible=0;
    for(const target of targets){
      if(lineClearIn(balls,c.x,c.y,target.x,target.y,[0,target.n]))visible++;
      for(let pocket=0;pocket<6;pocket++){
        const p=pocketAim(pocket),pd=Math.hypot(p.x-target.x,p.y-target.y);
        if(pd<.1||!lineClearIn(balls,target.x,target.y,p.x,p.y,[0,target.n]))continue;
        const nx=(p.x-target.x)/pd,ny=(p.y-target.y)/pd,gx=target.x-2*R*nx,gy=target.y-2*R*ny;
        const cd=Math.hypot(gx-c.x,gy-c.y),cos=((gx-c.x)*nx+(gy-c.y)*ny)/Math.max(cd,.01);
        if(gx<R||gx>W-R||gy<R||gy>H-R||cos<.28||!lineClearIn(balls,c.x,c.y,gx,gy,[0,target.n]))continue;
        threat=Math.max(threat,cos*Math.exp(-pd/65-cd/100));
      }
    }
    const distance=targets.length?Math.min(...targets.map(b=>Math.hypot(c.x-b.x,c.y-b.y))):W;
    return {score:threat*180+visible/Math.max(1,targets.length)*35-distance*.35,blocked:visible===0,threat};
  }
  function escapeRoutes(c,target){
    const walls=[{axis:'x',value:R},{axis:'x',value:W-R},{axis:'y',value:R},{axis:'y',value:H-R}];
    const reflect=(p,w)=>({...p,[w.axis]:2*w.value-p[w.axis]});
    const routes=[{...target,banks:0}];
    for(const wall of walls)routes.push({...reflect(target,wall),banks:1});
    // Unfold two successive cushions. The live simulator verifies the actual
    // rail order, cut-outs and blockers; mirrored geometry only proposes aims.
    for(const first of walls)for(const second of walls){
      if(first===second)continue;
      routes.push({...reflect(reflect(target,second),first),banks:2});
    }
    return routes.map(p=>({...p,distance:Math.hypot(p.x-c.x,p.y-c.y)})).sort((a,b)=>a.distance-b.distance);
  }
  function placeAICue(targets){
    // Ball in hand: align behind an unobstructed pot instead of placing next
    // to the first numbered ball regardless of its path to the pocket.
    const options=[];
    for(const target of targets)for(let pocket=0;pocket<6;pocket++){
      const p=pocketAim(pocket),pd=Math.hypot(p.x-target.x,p.y-target.y);
      if(pd<.1||!lineClear(target.x,target.y,p.x,p.y,[0,target.n]))continue;
      for(const distance of [12,18,8]){
        const x=target.x-(p.x-target.x)/pd*distance,y=target.y-(p.y-target.y)/pd*distance;
        if(validCuePosition(x,y)&&lineClear(x,y,target.x,target.y,[0,target.n]))options.push({x,y,score:pd+Math.abs(distance-12)});
      }
    }
    options.sort((a,b)=>a.score-b.score);
    if(options.length){cue().x=options[0].x;cue().y=options[0].y;return;}
    for(let y=R+2;y<H-R;y+=4)for(let x=R+2;x<W-R;x+=4)if(validCuePosition(x,y)){cue().x=x;cue().y=y;return;}
  }
  async function chooseAIPlan(isCurrent=()=>true){
    const targets=aiTargets();if(!targets.length)return null;
    if(state.ballInHand)placeAICue(targets);
    const successful=[];
    for(const option of aiOptions(targets).slice(0,12)){
      if(!isCurrent())return null;
      // Sliding balls reach natural roll at 5/7 initial speed. Estimate the
      // launch, then validate against the exact live cloth and jaw collisions.
      const contact=Math.sqrt(2*ROLL_DECEL*(option.pd+7))/.72/(.97*option.cos);
      const desired=Math.sqrt(contact*contact+2*ROLL_DECEL*option.cd)/.72;
      // Ball-to-ball friction throws a cut slightly off the contact normal.
      // Compensate in cue angle according to cut and cue distance, then test
      // both signs rather than applying one fixed error to every shot.
      const correction=.055*2*R/(Math.max(option.cd,4)*option.cos);
      for(const factor of [.88,1,1.15])for(const offset of [0,-correction*.5,correction*.5,-correction,correction]){
        const plan={...option,aim:option.aim+offset,power:powerForSpeed(desired*factor),spinY:0,type:'attack'};
        let result=simulateAIShot(plan);
        if(result.potted&&!result.safe){plan.spinY=-.65;result=simulateAIShot(plan);}
        if(result.safe&&result.potted)successful.push({...plan,score:option.score+aiPositionScore(result)+plan.power*.08+(plan.spinY?2:0)});
      }
      // Yield between targets so the UI and input remain responsive on tablets.
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    successful.sort((a,b)=>a.score-b.score);
    if(successful.length){
      // Difficulty changes tactical choice and acceptable margin, never adds
      // a large random aiming error after a physically validated shot.
      const pool=successful.filter(p=>p.score<=successful[0].score+(state.aiDifficulty==='easy'?20:state.aiDifficulty==='normal'?5:0));
      const best=pool[Math.floor(Math.random()*pool.length)];
      best.description=`${best.target} 号 → ${POCKETS[best.pocket].name} · ${best.spinY?'低杆控白球':'控制落点'}`;
      return best;
    }
    const c=cue(),defence=[];
    for(const target of targets){
      const routes=escapeRoutes(c,target);
      for(const route of routes){
        const baseAim=Math.atan2(route.y-c.y,route.x-c.x);
        const contactPower=powerForSpeed(Math.sqrt(2*ROLL_DECEL*(route.distance+9))/.72*(1+route.banks*.2));
        for(const offset of [0,-1.35*R,1.35*R])for(const factor of [.9,1.2,1.5]){
          if(!isCurrent())return null;
          const plan={target:target.n,pocket:null,aim:baseAim+Math.atan2(offset,route.distance),power:clamp(contactPower*factor,15,85),spinY:0,type:'safety',banks:route.banks};
          const result=simulateAIShot(plan);
          if(result.safe){
            const position=safetyPosition(result);
            defence.push({...plan,score:position.score+plan.power*.035+route.banks*.5,description:`先碰 ${target.n} 号 · ${route.banks?`${route.banks} 库解球`:'薄球防守'} · ${position.blocked?'藏白球，挡住对手首碰线':position.threat<.15?'拉开球距，压缩进攻空间':'避开白球落袋，控制落点'}`});
          }
        }
        await new Promise(resolve=>setTimeout(resolve,0));
      }
    }
    defence.sort((a,b)=>a.score-b.score);
    if(defence.length)return defence[0];
    // A completely snookered layout may have no safe two-cushion route.
    // Report that limitation instead of presenting a blocked shot as a pot.
    const t=targets[0];return {target:t.n,pocket:null,aim:Math.atan2(t.y-c.y,t.x-c.x),power:42,spinY:0,type:'escape',description:`尝试解球 · 先碰 ${t.n} 号，当前没有安全进攻线`};
  }
  async function queueAI() {
    if(state.opponent!=='ai'||state.turn!==1||state.phase!=='aim')return;
    const ticket=++state.aiTicket,isCurrent=()=>ticket===state.aiTicket&&state.opponent==='ai'&&state.turn===1&&state.phase==='aim';
    state.aiThinking=true;state.aiPlan=null;say('电脑正在判断球路…');render();
    const plan=await chooseAIPlan(isCurrent);
    if(!isCurrent()||!plan)return;
    state.aiPlan=plan;say(`电脑计划：${plan.description}`);render();
    // Show the selected ball and pocket for a full 2.5 seconds before shooting.
    setTimeout(()=>{
      if(!isCurrent())return;
      state.aiThinking=false;state.ballInHand=false;state.aim=plan.aim;state.power=plan.power;
      state.spinX=0;state.spinY=plan.spinY;moveSpinDot();syncPowerUI();updateUI();fire(true);
    },2500);
  }
  function validCuePosition(x,y) {
    return x>=R&&x<=W-R&&y>=R&&y<=H-R&&activeBalls().every(b=>Math.hypot(b.x-x,b.y-y)>=2*R+.06);
  }
  function placeCue(x,y,commit=true) {
    x=clamp(x,R,W-R);y=clamp(y,R,H-R);
    if(!validCuePosition(x,y))return false;
    cue().x=x;cue().y=y;
    if(commit){state.ballInHand=false;say(`白球已摆放。${actor(state.turn)}请瞄准击球。`);updateUI();}
    render();return true;
  }
  function roundedRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
  function fillRect(x,y,w,h,r,color){ctx.fillStyle=color;roundedRect(x,y,w,h,r);ctx.fill();}
  function drawTable() {
    const l=OX,t=OY,r=OX+W*SCALE,b=OY+H*SCALE;
    ctx.fillStyle='#090b0e';ctx.fillRect(0,0,VIEW_W,VIEW_H);
    const floor=ctx.createRadialGradient(700,365,90,700,365,800);floor.addColorStop(0,'#243035');floor.addColorStop(1,'#070d16');ctx.fillStyle=floor;ctx.fillRect(0,0,VIEW_W,VIEW_H);
    let seed=73451;for(let i=0;i<19000;i++){seed=(seed*1664525+1013904223)>>>0;const x=seed%VIEW_W;seed=(seed*1664525+1013904223)>>>0;const y=seed%VIEW_H;ctx.fillStyle=i%3?'#a4aaa50c':'#00000018';ctx.fillRect(x,y,2,2);}
    ctx.shadowColor='#000d';ctx.shadowBlur=38;ctx.shadowOffsetY=17;
    const frame=ctx.createLinearGradient(0,t-58,0,b+58);frame.addColorStop(0,'#353c3c');frame.addColorStop(.15,'#1c2526');frame.addColorStop(.55,'#090f13');frame.addColorStop(.85,'#1b2426');frame.addColorStop(1,'#353d3d');
    fillRect(l-61,t-61,W*SCALE+122,H*SCALE+122,33,frame);ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    ctx.strokeStyle='#6c79713d';ctx.lineWidth=2;roundedRect(l-59,t-59,W*SCALE+118,H*SCALE+118,32);ctx.stroke();
    // Cloth continues under the open pocket approaches, including the small
    // corner shelves exposed between the rubber and the rail cap.
    fillRect(l-39,t-39,W*SCALE+78,H*SCALE+78,19,'#10628e');
    // Dark, flat rail caps and plain pocket wells follow the top-down reference.
    for(const y of [t-58,b+35]){
      const metal=ctx.createLinearGradient(0,y,0,y+23);metal.addColorStop(0,'#515a59');metal.addColorStop(.16,'#303839');metal.addColorStop(.7,'#171f20');metal.addColorStop(1,'#0b1213');
      for(const [a,z] of [[0,SIDE_L],[SIDE_R,W]]){ctx.fillStyle=metal;ctx.fillRect(l+a*SCALE,y,(z-a)*SCALE,23);ctx.strokeStyle='#9baa9b3c';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(l+a*SCALE+7,y+2);ctx.lineTo(l+z*SCALE-7,y+2);ctx.stroke();}
      for(let k=4;k<23;k+=3){ctx.strokeStyle=k%2?'#d2e7e90a':'#00000024';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(l+31,y+k);ctx.lineTo(r-31,y+k);ctx.stroke();}
    }
    for(const [x,label] of [[l-59,'S686 台呢 · 精密球台'],[r+34,'八球 / 九球 · S686']]){
      const metal=ctx.createLinearGradient(x,0,x+25,0);metal.addColorStop(0,'#202a2a');metal.addColorStop(.54,'#364141');metal.addColorStop(1,'#172020');ctx.fillStyle=metal;ctx.fillRect(x,t,25,H*SCALE);
      ctx.save();ctx.translate(x+12,t+H*SCALE*.5);ctx.rotate(-Math.PI/2);ctx.fillStyle='#b8a065';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='600 10px sans-serif';ctx.fillText(label,0,0);ctx.restore();
    }
    const felt=ctx.createRadialGradient(l+W*SCALE*.45,t+H*SCALE*.34,16,l+W*SCALE*.5,t+H*SCALE*.5,710);
    felt.addColorStop(0,'#288fc2');felt.addColorStop(.42,'#197cac');felt.addColorStop(.82,'#10628e');felt.addColorStop(1,'#0b4669');ctx.fillStyle=felt;ctx.fillRect(l,t,W*SCALE,H*SCALE);
    // Directional, translucent fibres read as woven cloth at high pixel density.
    let clothSeed=19327;for(let i=0;i<56000;i++){clothSeed=(clothSeed*1664525+1013904223)>>>0;const x=l+(clothSeed>>>8)%(r-l);clothSeed=(clothSeed*1664525+1013904223)>>>0;const y=t+(clothSeed>>>8)%(b-t);ctx.fillStyle=i%4?'#d4f5ff08':'#032d480c';ctx.fillRect(x,y,1.15,.42);}
    const clothLight=ctx.createLinearGradient(0,t,0,b);clothLight.addColorStop(0,'#d8f6ff10');clothLight.addColorStop(.48,'#ffffff00');clothLight.addColorStop(1,'#001b371f');ctx.fillStyle=clothLight;ctx.fillRect(l,t,W*SCALE,H*SCALE);
    ctx.save();ctx.translate(l+W*SCALE*.51,t+H*SCALE*.51);ctx.rotate(-.035);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#c8f4ff22';ctx.font='italic 800 72px Arial, sans-serif';ctx.fillText('S686',0,0);
    ctx.fillStyle='#dcf8ff28';ctx.font='600 12px Arial, sans-serif';ctx.fillText('PRECISION CLOTH',0,36);ctx.restore();
    ctx.strokeStyle='#d7f1ff1b';ctx.lineWidth=1.1;ctx.setLineDash([4,12]);ctx.beginPath();ctx.moveTo(l+25*SCALE,t);ctx.lineTo(l+25*SCALE,b);ctx.stroke();ctx.setLineDash([]);
    const horizontal=(x1,x2,y,sign)=>{
      const outer=y-sign*29;
      ctx.beginPath();ctx.moveTo(x1+7,y);ctx.quadraticCurveTo(x1-4,y,x1-5,y-sign*8);
      ctx.lineTo(x1-11,outer);ctx.lineTo(x2+11,outer);ctx.lineTo(x2+5,y-sign*8);
      ctx.quadraticCurveTo(x2+4,y,x2-7,y);ctx.closePath();
      const g=ctx.createLinearGradient(0,outer,0,y);g.addColorStop(0,'#082943');g.addColorStop(.42,'#0c4d75');g.addColorStop(.82,'#10577e');g.addColorStop(1,'#12628b');ctx.fillStyle=g;ctx.fill();
      ctx.strokeStyle='#b5ebff12';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(x1+8,y-1);ctx.lineTo(x2-8,y-1);ctx.stroke();
    };
    for(const [a,z] of [[CUT,SIDE_L],[SIDE_R,W-CUT]]){horizontal(l+a*SCALE,l+z*SCALE,t,1);horizontal(l+a*SCALE,l+z*SCALE,b,-1);}
    // Side rails use the same tapered rubber nose as the long rails.
    for(const x of [l,r]){const sign=x===l?-1:1,upper=t+CUT*SCALE,lower=b-CUT*SCALE;ctx.beginPath();ctx.moveTo(x,upper+7);ctx.quadraticCurveTo(x,upper-4,x+sign*8,upper-5);ctx.lineTo(x+sign*29,upper-11);ctx.lineTo(x+sign*29,lower+11);ctx.lineTo(x+sign*8,lower+5);ctx.quadraticCurveTo(x,lower+4,x,lower-7);ctx.closePath();const g=ctx.createLinearGradient(x,0,x+sign*29,0);g.addColorStop(0,'#12628b');g.addColorStop(.25,'#10577e');g.addColorStop(.6,'#0c4d75');g.addColorStop(1,'#082943');ctx.fillStyle=g;ctx.fill();ctx.strokeStyle='#b5ebff12';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(x+sign,upper+8);ctx.lineTo(x+sign,lower-8);ctx.stroke();}
    // The visible mouth opens into a straight channel with rubber on both
    // sides. The same mouth width and depth control the physical colliders.
    for(const p of POCKETS){
      const side=p.x===W/2,mx=side?p.x:(p.x===0?CUT/2:W-CUT/2),my=side?p.y:(p.y===0?CUT/2:H-CUT/2);
      const q=worldToScreen(mx,my),dx=side?0:(p.x===0?-Math.SQRT1_2:Math.SQRT1_2),dy=side?(p.y===0?-1:1):(p.y===0?-Math.SQRT1_2:Math.SQRT1_2);
      const tx=-dy,ty=dx,half=(side?SIDE_MOUTH:CORNER_MOUTH)*SCALE/2,depth=THROAT_DEPTH*SCALE;
      ctx.save();ctx.transform(tx,ty,dx,dy,q.x,q.y);
      ctx.beginPath();ctx.moveTo(-half-2,-7);ctx.lineTo(-half,-1);ctx.lineTo(-half+4,depth+2);
      ctx.quadraticCurveTo(-half+9,depth+14,0,depth+15);ctx.quadraticCurveTo(half-9,depth+14,half-4,depth+2);
      ctx.lineTo(half,-1);ctx.lineTo(half+2,-7);ctx.closePath();
      // The approach and straight shelf are blue cloth, continuous with the
      // playing surface. Only the recessed drop at the back is a dark hole.
      ctx.fillStyle='#10628e';ctx.fill();
      // Solid, cloth-wrapped rubber cheeks blend into the rail noses. Each
      // cheek has a rounded lip, a broad top and a shaded vertical face; it
      // is a closed volume rather than two strokes painted onto the shelf.
      for(const s of [-1,1]){
        ctx.save();ctx.scale(s,1);
        const lip=side?0:-2,back=depth+7,outer=side?20:16;
        ctx.beginPath();ctx.moveTo(half+5,lip);
        ctx.bezierCurveTo(half+1,lip,half-2,lip+3,half-2,6);
        ctx.lineTo(half-3,depth+2);ctx.quadraticCurveTo(half-3,back,half+2,back);
        // Extend into the existing cushion, rather than ending in a detached
        // pill. The middle-pocket lip never protrudes past the rail nose.
        ctx.lineTo(half+outer,back);ctx.lineTo(half+outer+3,lip);ctx.closePath();
        const rubber=ctx.createLinearGradient(0,lip,0,back);
        rubber.addColorStop(0,'#12628b');rubber.addColorStop(.16,'#10577e');
        rubber.addColorStop(.5,'#0c4d75');rubber.addColorStop(1,'#082943');
        ctx.fillStyle=rubber;ctx.fill();
        // A narrow bevel is a filled surface with a soft gradient, never an
        // outline around the inner channel.
        ctx.beginPath();ctx.moveTo(half+5,lip+.5);
        ctx.bezierCurveTo(half+2,lip+1,half,lip+4,half,6);
        ctx.lineTo(half-1,depth+1);ctx.quadraticCurveTo(half-1,depth+4,half+1,depth+5);
        ctx.lineTo(half+3,depth+4);ctx.quadraticCurveTo(half+1,depth+2,half+1,depth);
        ctx.lineTo(half+2,6);ctx.quadraticCurveTo(half+2,lip+4,half+8,lip+2);ctx.closePath();
        const bevel=ctx.createLinearGradient(half-2,0,half+8,0);
        bevel.addColorStop(0,'#08294310');bevel.addColorStop(.45,'#08294324');bevel.addColorStop(1,'#08294300');
        ctx.fillStyle=bevel;ctx.fill();
        ctx.restore();
      }
      ctx.beginPath();ctx.ellipse(0,depth+7,half*.78,7,0,0,Math.PI*2);
      const drop=ctx.createRadialGradient(0,depth+9,1,0,depth+7,half*.85);drop.addColorStop(0,'#01070b');drop.addColorStop(.72,'#020f18');drop.addColorStop(1,'#0b3a51');ctx.fillStyle=drop;ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle='#a1a991';for(let x=12.5;x<=87.5;x+=12.5){if(x===50)continue;for(const y of [t-49,b+49]){ctx.beginPath();ctx.arc(l+x*SCALE,y,2,0,Math.PI*2);ctx.fill();}}
    for(let y=12.5;y<=37.5;y+=12.5)for(const x of [l-49,r+49]){ctx.beginPath();ctx.arc(x,t+y*SCALE,2,0,Math.PI*2);ctx.fill();}
  }
  function rotated(q,x,y,z){
    const tx=2*(q[1]*z-q[2]*y),ty=2*(q[2]*x-q[0]*z),tz=2*(q[0]*y-q[1]*x);
    return [x+q[3]*tx+q[1]*tz-q[2]*ty,y+q[3]*ty+q[2]*tx-q[0]*tz,z+q[3]*tz+q[0]*ty-q[1]*tx];
  }
  const BALL_SPRITE_SIZE=112,BALL_SPRITE_MID=56,BALL_SPRITE_RADIUS=53.3;
  const ballPixelMap=(()=>{
    const cells=[];
    for(let py=0;py<BALL_SPRITE_SIZE;py++)for(let px=0;px<BALL_SPRITE_SIZE;px++){
      const u=(px+.5-BALL_SPRITE_MID)/BALL_SPRITE_RADIUS,v=(py+.5-BALL_SPRITE_MID)/BALL_SPRITE_RADIUS,r2=u*u+v*v;
      if(r2>=1)continue;
      const z=Math.sqrt(1-r2),diffuse=Math.max(0,-u*.39-v*.5+z*.79),light=.49+.55*diffuse;
      const highlight=Math.pow(Math.max(0,-u*.45-v*.59+z*.68),98)*.72;
      const broadHighlight=Math.pow(Math.max(0,-u*.48-v*.57+z*.66),14)*.12;
      // Small overhead reflections make the resin read as polished and dense.
      const pinLight=Math.exp(-(((u+.36)/.065)**2+((v+.43)/.08)**2))*.38;
      const rimBounce=Math.pow(Math.max(0,u*.47+v*.31+z*.26),9)*.095;
      const grain=1+((((px*37+py*71)%17)-8)*.0012);
      const shade=(1-.36*Math.pow(1-z,1.25))*light*grain;
      cells.push([(py*BALL_SPRITE_SIZE+px)*4,u,v,z,shade,255*(highlight+broadHighlight+pinLight+rimBounce),Math.round(255*clamp((1-r2)*BALL_SPRITE_RADIUS*.75,0,1))]);
    }
    return cells;
  })();
  const numberBadges=new Map();
  function numberBadgePixels(n){
    if(numberBadges.has(n))return numberBadges.get(n);
    const icon=document.createElement('canvas');icon.width=icon.height=96;
    const g=icon.getContext('2d');
    // The reference balls use an ivory, three-lobed number insert with a
    // dark outline. It is painted in the sphere's local coordinates so both
    // colour and number roll together instead of facing the camera forever.
    g.beginPath();g.moveTo(48,6);
    g.bezierCurveTo(62,6,62,26,68,37);
    g.bezierCurveTo(75,49,91,54,88,68);
    g.bezierCurveTo(85,84,71,88,55,82);
    g.bezierCurveTo(49,80,46,80,41,82);
    g.bezierCurveTo(25,89,10,84,8,69);
    g.bezierCurveTo(6,55,20,49,27,37);
    g.bezierCurveTo(33,26,34,6,48,6);g.closePath();
    const shade=g.createRadialGradient(34,24,4,49,56,67);
    shade.addColorStop(0,'#fffef4');shade.addColorStop(.57,'#f1ebd8');shade.addColorStop(1,'#c5bbab');
    g.fillStyle=shade;g.fill();g.strokeStyle='#10151a';g.lineWidth=7;g.lineJoin='round';g.stroke();
    g.strokeStyle='#ffffff80';g.lineWidth=1.3;g.stroke();
    g.fillStyle='#101318';g.font=`900 ${n>9?44:59}px Arial`;
    g.textAlign='center';g.textBaseline='middle';g.fillText(String(n),48,54);
    const pixels=g.getImageData(0,0,96,96).data;
    numberBadges.set(n,pixels);return pixels;
  }
  function renderBallSprite(b){
    const size=BALL_SPRITE_SIZE,mid=BALL_SPRITE_MID,radius=BALL_SPRITE_RADIUS,sprite=b.sprite||document.createElement('canvas');
    if(!b.sprite)sprite.width=sprite.height=size;
    const sc=sprite.getContext('2d'),pixels=b.spritePixels||sc.createImageData(size,size),data=pixels.data;
    const pole=rotated(b.q,0,0,1);
    const badge=b.n>0?numberBadgePixels(b.n):null;
    const right=badge?rotated(b.q,1,0,0):null,up=badge?rotated(b.q,0,1,0):null;
    const cueMarks=b.n===0?[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].map(v=>rotated(b.q,...v)):null;
    const color=PALETTE[b.n<=8?b.n:b.n-8],ivory=[247,241,229];
    for(const [at,u,v,z,shade,specular,alpha] of ballPixelMap){
      const signedLatitude=u*pole[0]+v*pole[1]+z*pole[2],latitude=Math.abs(signedLatitude);
      const painted=b.n!==0&&(b.n<=8?latitude<.972:latitude<.52);
      const cueMark=cueMarks?.some(m=>u*m[0]+v*m[1]+z*m[2]>.991);
      const base=cueMark?[184,56,50]:painted?color:ivory;
      let badgeAt=-1,badgeAlpha=0;
      if(badge&&latitude>.69){
        // Project the number inserts from opposite poles onto the sphere.
        const side=signedLatitude<0?-1:1;
        const bx=(u*right[0]+v*right[1]+z*right[2])*side;
        const by=u*up[0]+v*up[1]+z*up[2];
        const tx=Math.round(48+bx*65),ty=Math.round(48+by*65);
        if(tx>=0&&tx<96&&ty>=0&&ty<96){badgeAt=(ty*96+tx)*4;badgeAlpha=badge[badgeAt+3]/255;}
      }
      for(let c=0;c<3;c++){
        const pigment=badgeAlpha?base[c]*(1-badgeAlpha)+badge[badgeAt+c]*badgeAlpha:base[c];
        data[at+c]=Math.min(255,pigment*shade+specular);
      }
      data[at+3]=alpha;
    }
    sc.putImageData(pixels,0,0);
    b.sprite=sprite;b.spritePixels=pixels;b.spriteDirty=false;
  }
  function drawBall(b,scale=1,worldX=b.x,worldY=b.y,alpha=1){
    if(!b.sprite||b.spriteDirty)renderBallSprite(b);
    const {x,y}=worldToScreen(worldX,worldY),rr=DISPLAY_R*SCALE*scale;
    ctx.save();ctx.globalAlpha=alpha;
    const speed=Math.hypot(b.vx,b.vy);
    if(state.phase==='moving'&&scale===1&&speed>28){
      const trail=Math.min(7,speed*.048),weight=Math.min(.16,speed/900);
      ctx.save();ctx.globalAlpha=alpha*weight;ctx.drawImage(b.sprite,x-rr-b.vx/speed*trail,y-rr-b.vy/speed*trail,rr*2,rr*2);ctx.restore();
    }
    ctx.shadowColor='#00111f9e';ctx.shadowBlur=5;ctx.fillStyle='#021b2b8a';ctx.beginPath();ctx.ellipse(x+2.3,y+rr*.69,rr*.9,rr*.35,0,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    ctx.drawImage(b.sprite,x-rr,y-rr,rr*2,rr*2);
    ctx.restore();
  }
  function drawPocketBanks(){
    if(state.mode!=='eight')return;
    for(const [numbers,x,title] of [ [[1,2,3,4,5,6,7],39,'纯 色'],[[9,10,11,12,13,14,15],VIEW_W-39,'花 色'] ]){
      ctx.save();
      fillRect(x-24,196,48,353,18,'#0a1925dc');
      ctx.strokeStyle='#7ad8e56b';ctx.lineWidth=1;roundedRect(x-24,196,48,353,18);ctx.stroke();
      ctx.fillStyle='#a8edf2';ctx.font='700 11px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(title,x,217);
      for(let i=0;i<numbers.length;i++){
        const n=numbers[i],y=251+i*41,potted=state.balls.find(b=>b.n===n)?.pocketed;
        ctx.fillStyle=potted?'#6cddea5f':'#3e61724d';ctx.beginPath();ctx.arc(x,y,14,0,Math.PI*2);ctx.fill();
        ctx.save();ctx.globalAlpha=potted?1:.42;
        const model=state.balls.find(b=>b.n===n);
        if(model){if(!model.sprite||model.spriteDirty)renderBallSprite(model);ctx.drawImage(model.sprite,x-11,y-11,22,22);}
        ctx.restore();
        if(!potted){ctx.strokeStyle='#acb8ae78';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,13,0,Math.PI*2);ctx.stroke();}
      }
      ctx.restore();
    }
  }
  function legalTarget(n){
    if(state.mode==='nine')return n===lowestNine();
    const g=currentGroup();return g?(allGroupGone(g)?n===8:group(n)===g):n!==8;
  }
  function guideLine(x,y,dx,dy,len,color,dashed=false){
    if(len<.2)return;
    const a=worldToScreen(x,y),b=worldToScreen(x+dx*len,y+dy*len);
    ctx.strokeStyle=color;ctx.shadowColor=color;ctx.shadowBlur=9;ctx.lineWidth=2.4;ctx.setLineDash(dashed?[8,7]:[]);
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);ctx.shadowBlur=0;
  }
  let guideCacheKey='',guideCache=null;
  let displayGuideKey='',displayGuideCache=null;
  function firstBallOnRay(x,y,dx,dy,excluded){
    let hit=null,distance=Infinity;
    for(const b of state.balls){
      if(b.pocketed||excluded.includes(b.n))continue;
      const along=(b.x-x)*dx+(b.y-y)*dy;
      if(along<=0)continue;
      const side2=(b.x-x)**2+(b.y-y)**2-along*along;
      if(side2>(2*R)**2)continue;
      const t=Math.max(0,along-Math.sqrt(Math.max(0,(2*R)**2-side2)));
      if(t<distance){hit=b;distance=t;}
    }
    return {ball:hit,distance};
  }
  function firstBoundaryOnRay(x,y,dx,dy){
    let distance=Infinity;
    for(const [component,edge,direction,outward] of [[x,R,dx,-1],[x,W-R,dx,1],[y,R,dy,-1],[y,H-R,dy,1]]){
      if(Math.abs(direction)<1e-8)continue;
      const t=(edge-component)/direction;
      if((t>1e-6||Math.abs(t)<=1e-6&&direction*outward>0)&&t<distance)distance=Math.max(0,t);
    }
    return Number.isFinite(distance)?distance:0;
  }
  function displayGuide(){
    const key=[state.aim,state.spinX,state.spinY,...state.balls.flatMap(b=>[b.n,b.x,b.y,b.pocketed?1:0])].join(',');
    if(key===displayGuideKey)return displayGuideCache;
    displayGuideKey=key;
    const a=cue();if(!a)return displayGuideCache=null;
    const angle=state.aim-state.spinX*.018,dx=Math.cos(angle),dy=Math.sin(angle);
    const boundary=firstBoundaryOnRay(a.x,a.y,dx,dy);
    const first=firstBallOnRay(a.x,a.y,dx,dy,[0]);
    const target=first.distance<boundary?first.ball:null;
    const distance=target?first.distance:boundary;
    const impact={x:a.x+dx*distance,y:a.y+dy*distance};
    const shotPath=[{x:a.x,y:a.y},impact],cuePath=[],targetPath=[];
    if(target){
      const nx=(target.x-impact.x)/(2*R),ny=(target.y-impact.y)/(2*R);
      const normalLength=Math.hypot(nx,ny)||1,unitX=nx/normalLength,unitY=ny/normalLength;
      const transfer=.97*Math.max(0,dx*unitX+dy*unitY);
      const tangentX=-unitY,tangentY=unitX;
      let cueVx=dx-transfer*unitX,cueVy=dy-transfer*unitY;
      let objectVx=transfer*unitX,objectVy=transfer*unitY;
      const normalizedSpin=state.spinX*.42*1.4;
      const tangentSlip=(objectVx-cueVx)*tangentX+(objectVy-cueVy)*tangentY-normalizedSpin;
      const tangentImpulse=clamp(-tangentSlip/7,-transfer*.055,transfer*.055);
      cueVx-=tangentImpulse*tangentX;cueVy-=tangentImpulse*tangentY;
      objectVx+=tangentImpulse*tangentX;objectVy+=tangentImpulse*tangentY;
      const objectSpeed=Math.hypot(objectVx,objectVy)||1;
      const objectDirX=objectVx/objectSpeed,objectDirY=objectVy/objectSpeed;
      const targetLimit=Math.min(11,firstBoundaryOnRay(target.x,target.y,objectDirX,objectDirY));
      const obstacle=firstBallOnRay(target.x,target.y,objectDirX,objectDirY,[0,target.n]);
      const objectLength=Math.max(0,Math.min(targetLimit,obstacle.distance));
      targetPath.push({x:target.x,y:target.y},{x:target.x+objectDirX*objectLength,y:target.y+objectDirY*objectLength});
      let outX=cueVx+state.spinY*.42*unitX,outY=cueVy+state.spinY*.42*unitY;
      const outSpeed=Math.hypot(outX,outY);
      if(outSpeed>.001){
        outX/=outSpeed;outY/=outSpeed;
        const cueLimit=firstBoundaryOnRay(impact.x,impact.y,outX,outY);
        const length=Math.max(0,Math.min(8,Math.max(2,outSpeed*10),cueLimit));
        cuePath.push(impact,{x:impact.x+outX*length,y:impact.y+outY*length});
      }
    }
    return displayGuideCache={shotPath,cuePath,targetPath,targetNumber:target?.n??null,shotBlocked:!target};
  }
  const guideStill=b=>Math.abs(b.vx)+Math.abs(b.vy)+Math.abs(b.rollVx)+Math.abs(b.rollVy)+Math.abs(b.spin)<.001;
  function predictedGuide(){
    const key=[state.aim,state.power,state.spinX,state.spinY,...state.balls.flatMap(b=>[b.n,b.x,b.y,b.pocketed?1:0])].join(',');
    if(key===guideCacheKey)return guideCache;
    guideCacheKey=key;
    const balls=state.balls.filter(b=>!b.pocketed).map(b=>({...b})),a=balls.find(b=>b.n===0);
    if(!a)return guideCache=null;
    launchCue(a);
    const shotPath=[{x:a.x,y:a.y}],cuePath=[],targetPath=[];
    let target=null,impactSteps=0,sample20=null,objectLength=0,cueLength=0,cueBlocked=false,objectBlocked=false,shotBlocked=false,targetPocket=null;
    let lastA=null,lastB=null;
    for(let step=1;step<=720;step++){
      const moving=balls.filter(b=>!b.pocketed);
      for(const b of moving){
        b.hitRail=false;
        if(guideStill(b))continue;
        clothStep(b,STEP);b.x+=b.vx*STEP;b.y+=b.vy*STEP;rails(b);pocketCheck(b);
      }
      for(let i=0;i<moving.length;i++)for(let j=i+1;j<moving.length;j++){
        const b=moving[i],c=moving[j];if(b.pocketed||c.pocketed)continue;
        if(guideStill(b)&&guideStill(c))continue;
        if(!ballsCollide(b,c))continue;
        if(!target&&(b===a||c===a)){
          target=b===a?c:b;impactSteps=step;
          shotPath.push({x:a.x,y:a.y});cuePath.push({x:a.x,y:a.y});targetPath.push({x:target.x,y:target.y});
          lastA={x:a.x,y:a.y};lastB={x:target.x,y:target.y};
        }else if(target){
          if((b===target||c===target)&&!objectBlocked){objectBlocked=true;targetPath.push({x:target.x,y:target.y});}
          if((b===a||c===a)&&!cueBlocked){cueBlocked=true;cuePath.push({x:a.x,y:a.y});}
        }
      }
      if(!target){
        if(a.hitRail){shotPath.push({x:a.x,y:a.y});shotBlocked=true;break;}
        if(step%3===0)shotPath.push({x:a.x,y:a.y});
        if(a.pocketed||Math.hypot(a.vx,a.vy)<.4||step===720)break;
        continue;
      }
      const elapsed=step-impactSteps;
      if(elapsed===36)sample20={x:target.x,y:target.y};
      if(elapsed>0){
        if(!cueBlocked&&!a.pocketed&&cueLength<9){cueLength+=Math.hypot(a.x-lastA.x,a.y-lastA.y);if(elapsed%3===0||a.hitRail)cuePath.push({x:a.x,y:a.y});lastA={x:a.x,y:a.y};if(a.hitRail)cueBlocked=true;}
        if(!objectBlocked&&target.pocketed&&!target.hitRail){
          let best=0,d=Infinity;POCKETS.forEach((p,i)=>{const distance=Math.hypot(target.x-p.x,target.y-p.y);if(distance<d){d=distance;best=i;}});
          targetPocket=best;targetPath.push({x:POCKETS[best].x,y:POCKETS[best].y});objectBlocked=true;
        }else if(!objectBlocked&&target.pocketed){targetPath.push({x:target.x,y:target.y});objectBlocked=true;
        }else if(!objectBlocked&&objectLength<90){
          objectLength+=Math.hypot(target.x-lastB.x,target.y-lastB.y);
          if(elapsed%3===0||target.hitRail)targetPath.push({x:target.x,y:target.y});
          lastB={x:target.x,y:target.y};if(target.hitRail)objectBlocked=true;
        }
      }
      if(elapsed>=36&&(cueBlocked||cueLength>=9||a.pocketed||Math.hypot(a.vx,a.vy)<.3)&&(objectBlocked||objectLength>=90||target.pocketed||Math.hypot(target.vx,target.vy)<.3))break;
      if(elapsed>=720)break;
    }
    return guideCache={shotPath,cuePath,targetPath,targetPocket,targetNumber:shotBlocked?null:target?.n??null,impactSteps,sample20,shotBlocked};
  }
  function guidePath(points,color,maxLength=Infinity,dashed=false){
    if(points.length<2)return;
    ctx.strokeStyle=color;ctx.shadowColor=color;ctx.shadowBlur=2;ctx.lineWidth=1.8;ctx.lineCap='round';
    ctx.setLineDash(dashed?[7,6]:[]);ctx.beginPath();
    let length=0,end=points[0];const start=worldToScreen(points[0].x,points[0].y);ctx.moveTo(start.x,start.y);
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],segment=Math.hypot(b.x-a.x,b.y-a.y);
      if(segment<1e-6)continue;
      const fraction=Math.min(1,(maxLength-length)/segment);
      end={x:a.x+(b.x-a.x)*fraction,y:a.y+(b.y-a.y)*fraction};
      length+=segment*fraction;if(length>=maxLength)break;
    }
    const finish=worldToScreen(end.x,end.y);ctx.lineTo(finish.x,finish.y);
    ctx.stroke();ctx.setLineDash([]);ctx.shadowBlur=0;
  }
  function pathLength(points){let length=0;for(let i=1;i<points.length;i++)length+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);return length;}
  function drawAim() {
    if(state.phase!=='aim'||state.ballInHand||(state.opponent==='ai'&&state.turn===1))return;
    const c=cue(),cueX=Math.cos(state.aim),cueY=Math.sin(state.aim),p=worldToScreen(c.x,c.y);
    const prediction=displayGuide(),color=prediction.targetNumber!==null&&!legalTarget(prediction.targetNumber)?'#ff627a':'#e5fff7';
    ctx.save();
    // The geometric first-contact line is stable while power changes and is
    // always drawn, including for low-power aiming at a distant ball.
    ctx.globalAlpha=.65;guidePath(prediction.shotPath,color);
    ctx.globalAlpha=1;guidePath(prediction.shotPath,color,Math.min(18,pathLength(prediction.shotPath)));
    if(prediction.targetNumber!==null){
      const hit=prediction.shotPath.at(-1),object=prediction.targetPath[0],end=worldToScreen(hit.x,hit.y),objectCenter=worldToScreen(object.x,object.y);
      ctx.strokeStyle=color;ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(end.x,end.y,R*SCALE,0,Math.PI*2);ctx.stroke();
      ctx.globalAlpha=.45;ctx.beginPath();ctx.moveTo(end.x,end.y);ctx.lineTo(objectCenter.x,objectCenter.y);ctx.stroke();ctx.globalAlpha=1;
      guidePath(prediction.cuePath,'#a0e6ff',8);
      guidePath(prediction.targetPath,color,11);
    }
    const gap=R*SCALE+14+state.power*.4,back=gap+230,butt=back-82;
    ctx.translate(p.x,p.y);ctx.rotate(state.aim+Math.PI);
    ctx.shadowColor='#00100d99';ctx.shadowBlur=9;ctx.shadowOffsetY=5;
    let g=ctx.createLinearGradient(0,-8,0,8);g.addColorStop(0,'#341c17');g.addColorStop(.28,'#87502d');g.addColorStop(.55,'#b67e43');g.addColorStop(.8,'#633620');g.addColorStop(1,'#241514');
    ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(butt,-5.4);ctx.lineTo(back-3,-8.6);ctx.quadraticCurveTo(back+2,-8.4,back+2,-4);ctx.lineTo(back+2,4);ctx.quadraticCurveTo(back+2,8.4,back-3,8.6);ctx.lineTo(butt,5.4);ctx.closePath();ctx.fill();
    ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    g=ctx.createLinearGradient(0,-6,0,6);g.addColorStop(0,'#8a6742');g.addColorStop(.24,'#e7c693');g.addColorStop(.49,'#fff1c9');g.addColorStop(.79,'#c1955f');g.addColorStop(1,'#755235');
    ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(gap+4,-2.7);ctx.lineTo(butt,-5.4);ctx.lineTo(butt,5.4);ctx.lineTo(gap+4,2.7);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#70442277';ctx.lineWidth=.7;for(const y of [-1.3,1.1]){ctx.beginPath();ctx.moveTo(gap+13,y*.45);ctx.lineTo(butt-7,y);ctx.stroke();}
    for(const d of [butt,butt+6,back-17]){ctx.fillStyle='#d9b870';ctx.fillRect(d,-6,2,12);ctx.fillStyle='#e6e3cb';ctx.fillRect(d+2,-5.6,1,11.2);}
    ctx.fillStyle='#253a3b';ctx.fillRect(back-14,-8.5,10,17);
    ctx.fillStyle='#e8ece2';ctx.fillRect(gap,-3.1,4,6.2);
    ctx.fillStyle='#54a9b2';ctx.beginPath();ctx.roundRect(gap-3,-3.4,3.3,6.8,1.5);ctx.fill();
    ctx.restore();
  }
  function drawPocketEffect(animation){
    const age=animation.age,life=clamp(1-age/.58,0,1);
    if(life<=0)return;
    const center=worldToScreen(animation.effectX,animation.effectY),power=clamp(animation.impact/28,.55,1.25);
    ctx.save();ctx.globalCompositeOperation='screen';
    const glow=ctx.createRadialGradient(center.x,center.y,2,center.x,center.y,47+age*25);
    glow.addColorStop(0,`rgba(170,244,255,${.35*life*power})`);
    glow.addColorStop(1,'rgba(69,180,255,0)');
    ctx.fillStyle=glow;ctx.beginPath();ctx.arc(center.x,center.y,47+age*25,0,Math.PI*2);ctx.fill();
    for(const offset of [0,.13]){
      const phase=clamp((age-offset)/.45,0,1);if(age<offset||phase>=1)continue;
      ctx.strokeStyle=`rgba(204,249,255,${(.84-offset)*Math.pow(1-phase,1.5)*power})`;
      ctx.lineWidth=2.4*(1-phase)+.5;
      ctx.beginPath();ctx.arc(center.x,center.y,7+phase*37,0,Math.PI*2);ctx.stroke();
    }
    for(let i=0;i<8;i++){
      const theta=i*Math.PI/4+animation.visual.n*.41,distance=11+age*(35+i%3*4),x=center.x+Math.cos(theta)*distance,y=center.y+Math.sin(theta)*distance;
      ctx.strokeStyle=`rgba(218,251,255,${.8*life*life*power})`;
      ctx.lineWidth=Math.max(.5,1.4*life);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(theta)*(4+7*life),y+Math.sin(theta)*(4+7*life));ctx.stroke();
      ctx.fillStyle=`rgba(240,254,255,${.95*life*life*power})`;
      ctx.beginPath();ctx.arc(x,y,Math.max(.4,2.1*life),0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
  let tableSurface=null;
  function render() {
    if(!tableSurface){
      drawTable();
      tableSurface=document.createElement('canvas');tableSurface.width=canvas.width;tableSurface.height=canvas.height;
      tableSurface.getContext('2d').drawImage(canvas,0,0);
    }else ctx.drawImage(tableSurface,0,0,VIEW_W,VIEW_H);
    drawPocketBanks();drawAim();for(const b of live())drawBall(b);
    for(const a of state.pocketAnimations){
      drawPocketEffect(a);
      if(a.age<.30){
        const t=clamp(a.age/.30,0,1),ease=1-(1-t)*(1-t);
        const directions=[[-Math.SQRT1_2,-Math.SQRT1_2],[0,-1],[Math.SQRT1_2,-Math.SQRT1_2],[-Math.SQRT1_2,Math.SQRT1_2],[0,1],[Math.SQRT1_2,Math.SQRT1_2]];
        const [dx,dy]=directions[a.pocket];
        // Keep the sinking ball and its flash at the *same* pocket. Using its
        // last simulation position can visually pair a corner pot with an
        // unrelated middle-pocket flash during a fast, crowded shot.
        drawBall(a.visual,1-.78*ease,a.effectX+dx*.65*ease,a.effectY+dy*.65*ease,1-t);
      }
    }
    if(state.ballInHand){const c=cue(),p=worldToScreen(c.x,c.y);ctx.strokeStyle='#fff4a3';ctx.lineWidth=2;ctx.setLineDash([5,5]);ctx.beginPath();ctx.arc(p.x,p.y,24,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
    if(state.aiThinking&&state.phase==='aim'){
      ctx.save();ctx.fillStyle='rgba(5,20,30,.85)';ctx.strokeStyle='rgba(130,234,255,.62)';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.roundRect(460,332,480,125,18);ctx.fill();ctx.stroke();
      ctx.fillStyle='#e4faff';ctx.textAlign='center';ctx.font='bold 24px sans-serif';ctx.fillText(state.aiPlan?`电脑 · ${state.aiPlan.type==='attack'?'选择进攻':'选择解球'}`:'电脑正在判断球路',700,373);
      ctx.fillStyle='#a8ecff';ctx.font='17px sans-serif';ctx.fillText(state.aiPlan?.description||'检查遮挡、袋口与白球落点',700,405);
      ctx.fillStyle='#86cbd5';ctx.font='13px sans-serif';ctx.fillText(state.aiPlan?'准备出杆 · 2.5 秒':'正在试算候选路线',700,433);ctx.restore();
    }
    if(state.phase==='gameover'){ctx.fillStyle='#06181bdc';ctx.fillRect(0,0,VIEW_W,VIEW_H);ctx.fillStyle='#f4d382';ctx.font='bold 58px sans-serif';ctx.textAlign='center';ctx.fillText(`${actor(state.winner)}获胜`,700,365);ctx.fillStyle='#d9e9df';ctx.font='22px sans-serif';ctx.fillText('点击右上角「新开一局」再来一场',700,410);}
  }
  let aimFramePending=false;
  function requestAimFrame(){
    if(aimFramePending)return;
    aimFramePending=true;
    requestAnimationFrame(()=>{aimFramePending=false;if(state.phase==='aim'){updateUI();render();}});
  }
  const sideways=()=>window.matchMedia('(orientation: portrait) and (max-width: 700px)').matches;
  function pointerWorld(e){
    const rect=canvas.getBoundingClientRect();
    return sideways()
      ?screenToWorld((e.clientY-rect.top)/rect.height*VIEW_W,(rect.right-e.clientX)/rect.width*VIEW_H)
      :screenToWorld((e.clientX-rect.left)/rect.width*VIEW_W,(e.clientY-rect.top)/rect.height*VIEW_H);
  }
  canvas.addEventListener('pointerdown',e=>{
    if(state.phase!=='aim'||(state.opponent==='ai'&&state.turn===1))return;
    canvas.setPointerCapture(e.pointerId);const p=pointerWorld(e);
    if(state.ballInHand){state.drag='place';placeCue(p.x,p.y,false);return;}
    const c=cue(),dx=p.x-c.x,dy=p.y-c.y,ax=Math.cos(state.aim),ay=Math.sin(state.aim);
    const behind=-(dx*ax+dy*ay),side=Math.abs(dx*ay-dy*ax);
    if(behind>=2.3&&behind<=27&&side<2.5){state.drag={kind:'power',start:p,pull:0,startingPower:state.power};return;}
    aimAt(p.x,p.y);
    state.drag={kind:'aim',startAngle:Math.atan2(p.y-c.y,p.x-c.x),startAim:state.aim,startRadius:Math.hypot(dx,dy)};
  });
  canvas.addEventListener('pointermove',e=>{
    if(!state.drag||state.phase!=='aim')return;const p=pointerWorld(e);
    if(state.drag==='place')placeCue(p.x,p.y,false);
    else if(state.drag.kind==='aim'){
      const c=cue(),angle=Math.atan2(p.y-c.y,p.x-c.x);
      const delta=Math.atan2(Math.sin(angle-state.drag.startAngle),Math.cos(angle-state.drag.startAngle));
      state.aim=state.drag.startAim+delta*clamp(state.drag.startRadius/70,.06,.24);requestAimFrame();
    }else {const d=state.drag.start;const pull=(d.x-p.x)*Math.cos(state.aim)+(d.y-p.y)*Math.sin(state.aim);state.drag.pull=Math.max(0,pull);state.power=state.drag.pull<.7?state.drag.startingPower:clamp(Math.round(5+(state.drag.pull-.7)*5.7),5,100);syncPowerUI();render();}
  });
  const pointerUp=e=>{if(state.drag==='place'&&state.phase==='aim'){const p=pointerWorld(e);if(placeCue(p.x,p.y,false))say('白球位置已预览，可继续调整或确认摆放。');}else if(state.drag?.kind==='power'){const p=pointerWorld(e),d=state.drag.start;state.drag.pull=Math.max(0,(d.x-p.x)*Math.cos(state.aim)+(d.y-p.y)*Math.sin(state.aim));if(state.drag.pull>=1.5){state.power=clamp(Math.round(5+(state.drag.pull-.7)*5.7),5,100);syncPowerUI();fire();}else{state.power=state.drag.startingPower;syncPowerUI();render();}}state.drag=null;};
  canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointercancel',()=>{if(state.drag?.kind==='power'){state.power=state.drag.startingPower;syncPowerUI();render();}state.drag=null;});
  const spinPad=$('spinPad');
  function moveSpinDot(){const dot=$('spinDot');dot.style.left=`${50+state.spinX*36}%`;dot.style.top=`${50-state.spinY*36}%`;}
  function setSpin(e){const rect=spinPad.getBoundingClientRect();const x=sideways()?(e.clientY-rect.top)/rect.height*2-1:(e.clientX-rect.left)/rect.width*2-1,y=sideways()?1-(rect.right-e.clientX)/rect.width*2:1-(e.clientY-rect.top)/rect.height*2;const k=Math.max(1,Math.hypot(x,y));state.spinX=clamp(x/k,-1,1);state.spinY=clamp(y/k,-1,1);moveSpinDot();requestAimFrame();}
  spinPad.addEventListener('pointerdown',e=>{spinPad.setPointerCapture(e.pointerId);setSpin(e);});
  spinPad.addEventListener('pointermove',e=>{if(spinPad.hasPointerCapture(e.pointerId))setSpin(e);});
  $('resetSpin').addEventListener('click',()=>{state.spinX=0;state.spinY=0;moveSpinDot();requestAimFrame();});
  $('power').addEventListener('input',e=>{state.power=Number(e.target.value);syncPowerUI();render();});
  const meter=$('cueMeter');let meterDrag=null;
  const meterAxis=e=>sideways()?-e.clientX:e.clientY;
  function updateMeterDrag(e){
    if(!meterDrag||meterDrag.id!==e.pointerId)return;
    const travel=clamp(meter.clientHeight*.72,95,360);
    const pull=Math.max(0,meterAxis(e)-meterDrag.startAxis);
    meterDrag.pull=pull;
    const progress=clamp((pull-6)/(travel-6),0,1);
    state.power=Math.round(5+95*Math.pow(progress,1.15));
    const track=meter.querySelector('.cue-track');
    meter.style.setProperty('--cue-pull',`${Math.round(progress*track.clientHeight*.2)}px`);
    syncPowerUI();requestAimFrame();
  }
  meter.addEventListener('pointerdown',e=>{
    if(state.phase!=='aim'||state.ballInHand||(state.opponent==='ai'&&state.turn===1))return;
    e.preventDefault();meterDrag={id:e.pointerId,startAxis:meterAxis(e),pull:0,startingPower:state.power};meter.classList.add('dragging');meter.setPointerCapture(e.pointerId);state.power=5;syncPowerUI();render();
  });
  meter.addEventListener('pointermove',e=>{
    updateMeterDrag(e);
  });
  meter.addEventListener('pointerup',e=>{
    if(!meterDrag||meterDrag.id!==e.pointerId)return;
    updateMeterDrag(e);
    const shoot=meterDrag.pull>=14,startingPower=meterDrag.startingPower;
    meterDrag=null;meter.classList.remove('dragging');meter.style.setProperty('--cue-pull','0px');
    if(shoot)fire();else{state.power=startingPower;syncPowerUI();render();}
  });
  meter.addEventListener('pointercancel',()=>{if(meterDrag){state.power=meterDrag.startingPower;syncPowerUI();render();}meterDrag=null;meter.classList.remove('dragging');meter.style.setProperty('--cue-pull','0px');});
  meter.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      e.preventDefault();state.power=clamp(state.power+(e.key==='ArrowDown'?5:-5),5,100);syncPowerUI();render();
    }
    if(e.key==='Enter'){e.preventDefault();fire();}
  });
  $('shootBtn').addEventListener('click',()=>fire());
  $('placeCueBtn').addEventListener('click',()=>{
    if(state.phase!=='aim'||!state.repositionAllowed||state.opponent==='ai'&&state.turn===1)return;
    if(state.ballInHand){if(!validCuePosition(cue().x,cue().y)){say('白球与目标球重叠，请选择空位。');return;}placeCue(cue().x,cue().y,true);}
    else{state.ballInHand=true;say('自由球：拖动白球，满意后确认位置。');updateUI();render();}
  });
  const angleRuler=$('angleRuler');let angleDrag=null;
  const rulerAxis=e=>sideways()?e.clientY:e.clientX;
  angleRuler.addEventListener('pointerdown',e=>{
    if(state.phase!=='aim'||state.ballInHand||(state.opponent==='ai'&&state.turn===1))return;
    e.preventDefault();angleDrag={id:e.pointerId,start:rulerAxis(e),aim:state.aim};angleRuler.setPointerCapture(e.pointerId);
  });
  angleRuler.addEventListener('pointermove',e=>{
    if(!angleDrag||angleDrag.id!==e.pointerId)return;
    state.aim=angleDrag.aim+(rulerAxis(e)-angleDrag.start)*.01*Math.PI/180;
    requestAimFrame();
  });
  const stopAngleDrag=()=>{angleDrag=null;};
  angleRuler.addEventListener('pointerup',stopAngleDrag);
  angleRuler.addEventListener('pointercancel',stopAngleDrag);
  angleRuler.addEventListener('keydown',e=>{
    if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;
    e.preventDefault();state.aim+=(e.key==='ArrowLeft'?-1:1)*Math.PI/18000;updateUI();render();
  });
  for(const [id,opponent] of [['versusAI','ai'],['versusLocal','local']])$(id).addEventListener('click',()=>{state.opponent=opponent;$('versusAI').classList.toggle('selected',opponent==='ai');$('versusLocal').classList.toggle('selected',opponent==='local');$('difficultySelect').hidden=opponent!=='ai';});
  document.querySelectorAll('[data-difficulty]').forEach(btn=>btn.addEventListener('click',()=>{
    state.aiDifficulty=btn.dataset.difficulty;
    document.querySelectorAll('[data-difficulty]').forEach(q=>q.classList.toggle('selected',q===btn));
  }));
  document.querySelectorAll('[data-mode]').forEach(btn=>btn.addEventListener('click',()=>init(btn.dataset.mode)));
  $('startBtn').addEventListener('click',()=>{$('startOverlay').classList.add('hidden');$('menuOverlay').classList.remove('hidden');});
  $('newBtn').addEventListener('click',()=>{state.aiTicket++;$('menuOverlay').classList.remove('hidden');state.phase='menu';updateUI();});
  $('rulesBtn').addEventListener('click',()=>$('rulesOverlay').classList.remove('hidden'));
  $('closeRules').addEventListener('click',()=>$('rulesOverlay').classList.add('hidden'));
  $('rulesOverlay').addEventListener('click',e=>{if(e.target.id==='rulesOverlay')$('rulesOverlay').classList.add('hidden');});
  async function fullscreen(){
    if(document.fullscreenElement){await document.exitFullscreen();return;}
    try{await document.documentElement.requestFullscreen?.();await screen.orientation?.lock?.('landscape');}catch{ /* 浏览器不支持锁定时仍保留横向页面 */ }
  }
  $('fullBtn').addEventListener('click',fullscreen);
  document.addEventListener('keydown',e=>{
    if(e.key==='f'||e.key==='F'){fullscreen();return;}
    if(e.key==='Escape'){$('rulesOverlay').classList.add('hidden');return;}
    if(state.phase!=='aim')return;
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){if(e.target===angleRuler)return;e.preventDefault();if(state.opponent==='ai'&&state.turn===1)return;state.aim+=(e.key==='ArrowLeft'?-1:1)*Math.PI/18000;updateUI();render();}
    if(e.key===' '){e.preventDefault();fire();}
  });
  let last=performance.now(),acc=0,manualTime=false;
  function frame(now){const elapsed=Math.min(.05,(now-last)/1000);last=now;const active=state.phase==='moving'||state.pocketAnimations.length>0;if(!manualTime){acc+=elapsed;while(acc>=STEP){update(STEP);acc-=STEP;}}if(active||state.phase==='moving'||state.pocketAnimations.length>0)render();requestAnimationFrame(frame);}
  window.advanceTime=ms=>{manualTime=true;acc=0;const steps=Math.ceil(ms/1000/STEP);for(let i=0;i<steps;i++)update(STEP);render();};
  window.render_game_to_text=()=>JSON.stringify({coordinates:`world inches, origin at top-left cushion nose; +x right, +y down; table 100x50; ball diameter 2.25; corner mouth ${CORNER_MOUTH}; side mouth ${SIDE_MOUTH}`,mode:state.mode,opponent:state.opponent,aiDifficulty:state.aiDifficulty,aiThinking:state.aiThinking,aiPlan:state.aiPlan?{target:state.aiPlan.target,pocket:state.aiPlan.pocket,type:state.aiPlan.type,power:+state.aiPlan.power.toFixed(1),description:state.aiPlan.description}:null,phase:state.phase,turn:state.turn+1,groups:state.groups,scores:state.scores,breaking:state.breaking,rackSeed:state.rackSeed,ballInHand:state.ballInHand,repositionAllowed:state.repositionAllowed,aimDegrees:+(state.aim*180/Math.PI).toFixed(2),power:state.power,spin:[+state.spinX.toFixed(2),+state.spinY.toFixed(2)],balls:state.balls.map(b=>({n:b.n,x:+b.x.toFixed(2),y:+b.y.toFixed(2),vx:+b.vx.toFixed(2),vy:+b.vy.toFixed(2),rollVx:+b.rollVx.toFixed(2),rollVy:+b.rollVy.toFixed(2),sideSpin:+b.spin.toFixed(2),roll:+b.roll.toFixed(2),pocketed:b.pocketed})),status:state.status,winner:state.winner});
  if(new URLSearchParams(location.search).has('test')){
    $('startOverlay').classList.add('hidden');$('menuOverlay').classList.remove('hidden');
    window.__poolTest={async planAI(entries,mode='nine',ownGroup=null,hand=false,difficulty='hard'){
    state.aiTicket++;state.aiThinking=false;state.aiPlan=null;state.mode=mode;state.opponent='ai';state.phase='aim';state.turn=1;state.breaking=false;state.ballInHand=hand;state.groups=[null,ownGroup];state.aiDifficulty=difficulty;state.balls=entries.map(q=>ball(q.n,q.x,q.y));state.shot=null;state.pocketAnimations=[];
    $('menuOverlay').classList.add('hidden');const started=performance.now();const plan=await chooseAIPlan();state.aiPlan=plan;render();return {plan,options:aiOptions(aiTargets()),result:plan?simulateAIShot(plan):null,ms:performance.now()-started};
  },fireAIPlanTest(){manualTime=true;state.ballInHand=false;state.aim=state.aiPlan.aim;state.power=state.aiPlan.power;state.spinX=0;state.spinY=state.aiPlan.spinY;fire(true);},getAIPottedTest(){return state.balls.filter(b=>b.pocketed).map(b=>({n:b.n,pocket:b.pocketCandidate}));},queueAITest(){queueAI();},getLaunchSpeed(power,breaking=false){return cueLaunchSpeed(power,breaking);},getPocketEvents(){return {effects:state.pocketAnimations.map(a=>({n:a.visual.n,pocket:a.pocket,x:a.effectX,y:a.effectY,ballX:a.entryX,ballY:a.entryY})),shot:state.shot?.pocketed||[]};},setMovingBalls(entries){
    manualTime=true;acc=0;
    state.aiTicket++;state.aiThinking=false;state.mode='nine';state.opponent='local';state.phase='moving';state.turn=0;state.breaking=false;state.ballInHand=false;state.pocketAnimations=[];state.balls=entries.map(q=>Object.assign(ball(q.n,q.x,q.y),{vx:q.vx||0,vy:q.vy||0,rollVx:q.rollVx||0,rollVy:q.rollVy||0,spin:q.spin||0,pocketCandidate:q.pocketCandidate??null}));
    state.shot={shooter:0,breaking:false,firstHit:1,pocketed:[],railAfterHit:false,breakRails:new Set(),groupAtStart:null,eightReady:false};state.stopTime=0;state.shotTime=0;$('menuOverlay').classList.add('hidden');updateUI();render();
  },setSpinAim(vertical=0,horizontal=0){
    state.pocketAnimations=[];
    state.aiTicket++;state.aiThinking=false;state.aiPlan=null;state.mode='nine';state.opponent='local';state.phase='aim';state.turn=0;state.breaking=false;state.ballInHand=false;
    state.balls=[ball(0,40,25),ball(1,55,25)];state.aim=0;state.power=70;state.spinY=vertical;state.spinX=horizontal;
    state.shot=null;$('menuOverlay').classList.add('hidden');syncPowerUI();moveSpinDot();updateUI();render();
  },getGuidePrediction(){return predictedGuide();
  },getDisplayGuide(){return displayGuide();
  },setGuideBalls(entries,aim=0,power=70,spinY=0,spinX=0){
    state.pocketAnimations=[];
    state.aiTicket++;state.aiThinking=false;state.aiPlan=null;state.mode='nine';state.opponent='local';state.phase='aim';state.turn=0;state.breaking=false;state.ballInHand=false;
    state.groups=[null,null];state.scores=[0,0];say('拖动瞄准，拉动右侧球杆出杆。');state.balls=entries.map(q=>ball(q.n,q.x,q.y));state.aim=aim;state.power=power;state.spinY=spinY;state.spinX=spinX;
    state.shot=null;$('menuOverlay').classList.add('hidden');syncPowerUI();moveSpinDot();updateUI();render();
  },fireTest(){fire();
  },setSpinShot(vertical=0,horizontal=0,power=70){
    manualTime=true;acc=0;
    state.pocketAnimations=[];
    state.aiTicket++;state.aiThinking=false;state.aiPlan=null;state.mode='nine';state.opponent='local';state.phase='aim';state.turn=0;state.breaking=false;state.ballInHand=false;
    state.balls=[ball(0,40,25),ball(1,55,25)];state.aim=0;state.power=power;state.spinY=vertical;state.spinX=horizontal;
    state.shot=null;$('menuOverlay').classList.add('hidden');syncPowerUI();moveSpinDot();updateUI();render();fire();
  },setGuideFixture(illegal=false){
    state.pocketAnimations=[];
    state.aiTicket++;state.aiThinking=false;state.aiPlan=null;state.mode='nine';state.opponent='local';state.phase='aim';state.turn=0;state.breaking=false;state.ballInHand=false;
    state.balls=[ball(0,25,25),ball(1,65,12),ball(illegal?2:1,50,25)];
    if(!illegal)state.balls.splice(1,1);
    state.aim=0;state.shot=null;$('menuOverlay').classList.add('hidden');updateUI();render();
  },setEightFinal(){
    state.pocketAnimations=[];
    state.aiTicket++;state.aiThinking=false;state.aiPlan=null;state.mode='eight';state.opponent='local';state.phase='aim';state.turn=0;state.breaking=false;state.ballInHand=false;state.groups=['solid','stripe'];state.scores=[7,0];state.balls=[ball(0,50,22),ball(8,50,8)];state.aim=-Math.PI/2;state.power=56;state.shot=null;
    state.spinX=0;state.spinY=-.85;$('player2Name').textContent='玩家 2';syncPowerUI();moveSpinDot();$('menuOverlay').classList.add('hidden');updateUI();render();
  },setNineFinal(){
    state.pocketAnimations=[];
    state.aiTicket++;state.aiThinking=false;state.aiPlan=null;state.mode='nine';state.opponent='local';state.phase='aim';state.turn=0;state.breaking=false;state.ballInHand=false;state.groups=[null,null];state.scores=[8,0];state.balls=[ball(0,50,22),ball(9,50,8)];state.aim=-Math.PI/2;state.power=56;state.shot=null;
    state.spinX=0;state.spinY=-.85;$('player2Name').textContent='玩家 2';syncPowerUI();moveSpinDot();$('menuOverlay').classList.add('hidden');updateUI();render();
  }};}
  const boot=$('boot'),bootStarted=performance.now(),bootDuration=window.matchMedia('(prefers-reduced-motion: reduce)').matches?100:1900;
  let bootDone=false;
  function dismissBoot(){if(bootDone)return;bootDone=true;boot.classList.add('done');setTimeout(()=>boot.remove(),600);}
  $('skipBoot').addEventListener('click',dismissBoot);
  function animateBoot(now){
    if(bootDone)return;
    const pct=clamp((now-bootStarted)/bootDuration,0,1);
    $('bootProgress').style.width=`${Math.round(pct*100)}%`;$('bootPercent').textContent=`${Math.round(pct*100)}%`;
    if(pct>=1)dismissBoot();else requestAnimationFrame(animateBoot);
  }
  syncPowerUI();render();requestAnimationFrame(frame);requestAnimationFrame(animateBoot);
})();
