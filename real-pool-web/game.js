(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const W = 100, H = 50, R = 1.125;
  const CORNER_MOUTH = 5, SIDE_MOUTH = 5.7;
  const CUT = CORNER_MOUTH / Math.SQRT2, SIDE_L = W / 2 - SIDE_MOUTH / 2, SIDE_R = W / 2 + SIDE_MOUTH / 2;
  const SCALE = 11.2, OX = 140, OY = 115;
  const STEP = 1 / 180, COLORS = ['#fafaf6','#e7bb27','#2772cf','#d43c39','#7653a0','#e98525','#218c56','#842831','#121924'];
  const POCKETS = [
    {x:0,y:0,name:'左上角袋'}, {x:50,y:0,name:'上中袋'}, {x:100,y:0,name:'右上角袋'},
    {x:0,y:50,name:'左下角袋'}, {x:50,y:50,name:'下中袋'}, {x:100,y:50,name:'右下角袋'}
  ];
  const state = {mode:null,opponent:'ai',aiDifficulty:'normal',aiTicket:0,phase:'menu',balls:[],turn:0,groups:[null,null],scores:[0,0],breaking:true,ballInHand:false,aim:-0.02,power:56,spinX:0,spinY:0,calledPocket:null,shot:null,stopTime:0,shotTime:0,status:'选择八球或九球开始',winner:null,drag:null};
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const worldToScreen = (x,y) => ({x:OX+x*SCALE,y:OY+y*SCALE});
  const screenToWorld = (x,y) => ({x:(x-OX)/SCALE,y:(y-OY)/SCALE});
  const ball = (n,x,y) => ({n,x,y,vx:0,vy:0,spin:0,slip:0,roll:0,rollHeading:0,pocketed:false});
  const cue = () => state.balls.find(b => b.n === 0);
  const live = () => state.balls.filter(b => !b.pocketed);
  const activeBalls = () => state.balls.filter(b => !b.pocketed && b.n !== 0);
  const group = n => n >= 1 && n <= 7 ? 'solid' : n >= 9 && n <= 15 ? 'stripe' : null;
  const groupName = g => g === 'solid' ? '全色球' : g === 'stripe' ? '花色球' : '待分组';
  const actor = i => i===1&&state.opponent==='ai'?'电脑':`玩家 ${i+1}`;
  const currentGroup = () => state.groups[state.turn];
  const allGroupGone = g => g && !activeBalls().some(b => group(b.n) === g);
  const needsEightCall = () => state.mode === 'eight' && currentGroup() && allGroupGone(currentGroup());
  const lowestNine = () => Math.min(...activeBalls().map(b => b.n));
  const say = text => {state.status=text; $('statusText').textContent=text;};
  function syncPowerUI() {
    $('power').value=String(state.power);
    $('powerReadout').textContent=state.power+'%';
    $('cueMeter').setAttribute('aria-valuenow',String(state.power));
    $('cueMeter').style.setProperty('--power-height',`${Math.round(state.power*.65)}%`);
  }
  function init(mode) {
    state.aiTicket++;
    state.mode=mode; state.phase='aim'; state.turn=0; state.groups=[null,null]; state.scores=[0,0];
    state.breaking=true; state.ballInHand=false; state.aim=0; state.power=56; state.spinX=0; state.spinY=0;
    state.calledPocket=null; state.shot=null; state.stopTime=0; state.shotTime=0; state.winner=null;
    state.balls=[ball(0,25,25)];
    if (mode==='eight') rackEight(); else rackNine();
    $('menuOverlay').classList.add('hidden');$('player2Name').textContent=state.opponent==='ai'?'电脑':'玩家 2';
    syncPowerUI(); moveSpinDot();
    say(mode==='eight'?'八球开球：拖动画面瞄准，调节力度后击球。':'九球开球：先碰 1 号球。');
    updateUI(); render();
  }
  function rackEight() {
    const rows=[[1],[2,9],[10,8,3],[4,11,12,5],[13,6,7,14,15]];
    for(let row=0;row<5;row++) for(let col=0;col<=row;col++) {
      state.balls.push(ball(rows[row][col],74+row*(Math.sqrt(3)*R+.025),25+(col-row/2)*(2*R+.025)));
    }
  }
  function rackNine() {
    const rows=[[1],[2,3],[4,9,5],[6,7],[8]];
    rows.forEach((numbers,row) => numbers.forEach((n,col) => {
      state.balls.push(ball(n,74+row*(Math.sqrt(3)*R+.025),25+(col-(numbers.length-1)/2)*(2*R+.025)));
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
    $('shootBtn').disabled=state.phase!=='aim'||state.ballInHand||(state.opponent==='ai'&&state.turn===1)||(needsEightCall()&&state.calledPocket===null);
    $('callPocketBox').hidden=!needsEightCall()||state.phase==='gameover';
    $('pocketName').textContent=state.calledPocket===null?'尚未选袋':POCKETS[state.calledPocket].name;
    $('tipText').textContent=state.phase==='gameover'?'本局结束。点击「新开一局」继续。':state.ballInHand?'自由球：拖动或点击球台摆放白球。':needsEightCall()?'清空己方球后，先点击袋口指定 8 号球落袋。':'拖动画面瞄准；拉动球杆松手击球，或调节力度后点击击球。';
    $('angleReadout').textContent=(state.aim*180/Math.PI).toFixed(1)+'°';
  }
  function aimAt(x,y) {
    const c=cue(); if(!c||state.phase!=='aim'||state.ballInHand||(state.opponent==='ai'&&state.turn===1))return;
    const dx=x-c.x,dy=y-c.y;
    if(Math.hypot(dx,dy)<2)return;
    state.aim=Math.atan2(dy,dx); updateUI(); render();
  }
  function fire(byAI=false) {
    if(state.phase!=='aim'||state.ballInHand||(state.opponent==='ai'&&state.turn===1&&!byAI))return;
    if(needsEightCall()&&state.calledPocket===null){say('先点击袋口，指定 8 号球落袋。');return;}
    const c=cue(); if(!c||c.pocketed)return;
    state.shot={shooter:state.turn,breaking:state.breaking,firstHit:null,pocketed:[],railAfterHit:false,breakRails:new Set(),calledPocket:state.calledPocket,groupAtStart:currentGroup(),eightReady:!!allGroupGone(currentGroup())};
    const speed=23+state.power*1.08;
    c.vx=Math.cos(state.aim)*speed; c.vy=Math.sin(state.aim)*speed;
    c.spin=state.spinX*speed*.055;c.slip=1;c.rollHeading=state.aim;
    state.phase='moving';state.stopTime=0;state.shotTime=0;state.calledPocket=null;
    say(`${actor(state.turn)}击球中…`);updateUI();render();
  }
  function markPocket(b,index) {
    if(b.pocketed)return;
    b.pocketed=true;b.vx=0;b.vy=0;b.spin=0;
    if(state.shot)state.shot.pocketed.push({n:b.n,pocket:index});
  }
  function pocketCheck(b) {
    if(b.x < -R*.55 && b.y<CUT+R && b.y>-R*3) return markPocket(b, b.y<H/2?0:3);
    if(b.x > W+R*.55 && b.y<CUT+R && b.y>-R*3) return markPocket(b,2);
    if(b.x < -R*.55 && b.y>H-CUT-R && b.y<H+R*3) return markPocket(b,3);
    if(b.x > W+R*.55 && b.y>H-CUT-R && b.y<H+R*3) return markPocket(b,5);
    if(b.y < -R*.28) {
      if(b.x<CUT+R && b.x>-R*3)return markPocket(b,0);
      if(b.x>W-CUT-R && b.x<W+R*3)return markPocket(b,2);
      if(Math.abs(b.x-W/2)<SIDE_MOUTH/2+R*.26)return markPocket(b,1);
    }
    if(b.y > H+R*.28) {
      if(b.x<CUT+R && b.x>-R*3)return markPocket(b,3);
      if(b.x>W-CUT-R && b.x<W+R*3)return markPocket(b,5);
      if(Math.abs(b.x-W/2)<SIDE_MOUTH/2+R*.26)return markPocket(b,4);
    }
    if(b.x < -6 || b.x > W+6 || b.y < -6 || b.y > H+6) markPocket(b,0);
  }
  function railHit(b,nx,ny) {
    const dot=b.vx*nx+b.vy*ny;
    if(dot<0){b.vx-=1.83*dot*nx;b.vy-=1.83*dot*ny;
      const tangentX=-ny,tangentY=nx;
      b.vx+=tangentX*b.spin*.23;b.vy+=tangentY*b.spin*.23;b.spin*=.56;
      if(state.shot){if(state.shot.firstHit!==null)state.shot.railAfterHit=true;if(b.n!==0)state.shot.breakRails.add(b.n);}
    }
  }
  function collideJaw(b,x,y,side=false) {
    const dx=b.x-x,dy=b.y-y,dist=Math.hypot(dx,dy),min=R+(side?.05:.16);
    if(dist>=min)return;
    const nx=dist>1e-6?dx/dist:1,ny=dist>1e-6?dy/dist:0;
    b.x=x+nx*min;b.y=y+ny*min;railHit(b,nx,ny);
  }
  function rails(b) {
    const horiz = x => (x>=CUT&&x<=SIDE_L)||(x>=SIDE_R&&x<=W-CUT);
    if(b.y<R&&horiz(b.x)){b.y=R;railHit(b,0,1);}
    if(b.y>H-R&&horiz(b.x)){b.y=H-R;railHit(b,0,-1);}
    if(b.x<R&&b.y>=CUT&&b.y<=H-CUT){b.x=R;railHit(b,1,0);}
    if(b.x>W-R&&b.y>=CUT&&b.y<=H-CUT){b.x=W-R;railHit(b,-1,0);}
    const jaws=[[CUT,0],[SIDE_L,0],[SIDE_R,0],[W-CUT,0],[0,CUT],[W,CUT],[0,H-CUT],[W,H-CUT],[CUT,H],[SIDE_L,H],[SIDE_R,H],[W-CUT,H]];
    for(const [x,y] of jaws)collideJaw(b,x,y,x===SIDE_L||x===SIDE_R);
  }
  function ballsCollide(a,b) {
    const dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy,limit=2*R;
    if(d2>=limit*limit)return;
    const dist=Math.sqrt(Math.max(d2,1e-9));const nx=dx/dist,ny=dy/dist;
    const overlap=limit-dist;
    a.x-=nx*overlap*.5;b.x+=nx*overlap*.5;a.y-=ny*overlap*.5;b.y+=ny*overlap*.5;
    const rel=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
    if(rel>=0)return;
    const impulse=-(1+.95)*rel/2;
    a.vx-=impulse*nx;a.vy-=impulse*ny;b.vx+=impulse*nx;b.vy+=impulse*ny;
    a.slip=Math.max(a.slip,.35);b.slip=Math.max(b.slip,.55);
    const spinEffect=(a.spin-b.spin)*.035;
    a.vx+=-ny*spinEffect;a.vy+=nx*spinEffect;b.vx+=-ny*spinEffect;b.vy+=nx*spinEffect;
    a.spin*=.72;b.spin*=.72;
    if(state.shot && state.shot.firstHit===null && (a.n===0||b.n===0)){
      state.shot.firstHit=a.n===0?b.n:a.n;
      const c=a.n===0?a:b;
      c.vx+=Math.cos(state.aim)*state.spinY*state.power*.095;
      c.vy+=Math.sin(state.aim)*state.spinY*state.power*.095;
    }
  }
  function update(dt) {
    if(state.phase!=='moving')return;
    state.shotTime+=dt;
    const moving=live();
    for(const b of moving){
      const v=Math.hypot(b.vx,b.vy);
      if(v>0){
        const drag=12.8+15*b.slip+v*.022;
        const newV=Math.max(0,v-drag*dt);
        b.vx*=newV/v;b.vy*=newV/v;
        b.roll+=newV*dt/R;
        b.rollHeading=Math.atan2(b.vy,b.vx);
      }
      b.slip*=Math.exp(-5.8*dt);
      b.x+=b.vx*dt;b.y+=b.vy*dt;b.spin*=Math.max(0,1-2.2*dt);
      rails(b);pocketCheck(b);
    }
    for(let i=0;i<moving.length;i++)for(let j=i+1;j<moving.length;j++)if(!moving[i].pocketed&&!moving[j].pocketed)ballsCollide(moving[i],moving[j]);
    if(live().every(b=>Math.hypot(b.vx,b.vy)<.32))state.stopTime+=dt;else state.stopTime=0;
    if(state.stopTime>.38||state.shotTime>20){for(const b of live()){b.vx=0;b.vy=0;}endShot();}
  }
  function spotBall(n) {
    const b=state.balls.find(q=>q.n===n);if(!b)return;
    for(let step=0;step<55;step++){
      const x=75-step*2.3,y=25;
      if(x<R||live().some(q=>q!==b&&Math.hypot(q.x-x,q.y-y)<2*R+.1))continue;
      b.x=x;b.y=y;b.pocketed=false;b.vx=b.vy=0;return;
    }
    b.x=75;b.y=25;b.pocketed=false;
  }
  function resetCueForHand() {
    const c=cue();c.pocketed=false;c.vx=c.vy=0;c.spin=0;
    for(let x=25;x>=6;x-=2.5){if(!activeBalls().some(b=>Math.hypot(b.x-x,b.y-25)<2*R+.2)){c.x=x;c.y=25;break;}}
    state.ballInHand=true;
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
        else if(foul||!s.eightReady||eight.pocket!==s.calledPocket)return finish(1-s.shooter, foul?'打进 8 号球时犯规':!s.eightReady?'提前打进 8 号球':'8 号球未进指定袋口');
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
    state.calledPocket=null;updateUI();render();queueAI();
  }
  function finish(winner,reason) {
    state.winner=winner;state.turn=winner;state.phase='gameover';state.ballInHand=false;
    say(`${actor(winner)}获胜 · ${reason}。点击“新开一局”继续。`);
    updateUI();render();
  }
  function lineClear(x1,y1,x2,y2,ignored) {
    const dx=x2-x1,dy=y2-y1,len2=dx*dx+dy*dy;
    return live().every(b=>{
      if(ignored.includes(b.n))return true;
      const t=clamp(((b.x-x1)*dx+(b.y-y1)*dy)/Math.max(len2,.01),0,1);
      return Math.hypot(b.x-x1-t*dx,b.y-y1-t*dy)>2*R+.25;
    });
  }
  function queueAI() {
    if(state.opponent!=='ai'||state.turn!==1||state.phase!=='aim')return;
    const ticket=++state.aiTicket;say('电脑正在判断球路…');
    setTimeout(()=>{
      if(ticket!==state.aiTicket||state.opponent!=='ai'||state.turn!==1||state.phase!=='aim')return;
      const targets=state.mode==='nine'?activeBalls().filter(b=>b.n===lowestNine()):activeBalls().filter(b=>currentGroup()? (allGroupGone(currentGroup())?b.n===8:group(b.n)===currentGroup()):b.n!==8);
      if(!targets.length)return;
      if(state.ballInHand){
        const target=targets[0];let placed=false;
        for(let radius=11;radius<35&&!placed;radius+=3)for(const dy of [0,-5,5,-10,10]){
          const x=clamp(target.x-radius,R,W-R),y=clamp(target.y+dy,R,H-R);
          if(validCuePosition(x,y)){placeCue(x,y,true);placed=true;break;}
        }
        if(!placed)placeCue(25,25,true);
      }
      const c=cue(),options=[];let best=null;
      for(const target of targets)for(let i=0;i<POCKETS.length;i++){
        const p=POCKETS[i],pd=Math.hypot(p.x-target.x,p.y-target.y);
        if(pd<.1)continue;
        const gx=target.x-(p.x-target.x)/pd*2*R,gy=target.y-(p.y-target.y)/pd*2*R;
        if(gx<R||gx>W-R||gy<R||gy>H-R)continue;
        const cd=Math.hypot(gx-c.x,gy-c.y);
        const cueClear=lineClear(c.x,c.y,gx,gy,[0,target.n]);
        const objectClear=lineClear(target.x,target.y,p.x,p.y,[0,target.n]);
        const cutAngle=Math.abs(Math.atan2(p.y-target.y,p.x-target.x)-Math.atan2(target.y-c.y,target.x-c.x));
        const score=cd+pd*.55+(cueClear?0:140)+(objectClear?0:110)+Math.abs(Math.sin(cutAngle))*12;
        options.push({target,pocket:i,x:gx,y:gy,score,cd,pd});
      }
      options.sort((a,b)=>a.score-b.score);
      const pool=state.aiDifficulty==='easy'?options.slice(0,Math.min(5,options.length)):state.aiDifficulty==='normal'?options.slice(0,Math.min(2,options.length)):options.slice(0,1);
      best=pool[Math.floor(Math.random()*pool.length)]||null;
      if(!best){const t=targets[0];best={target:t,pocket:0,x:t.x,y:t.y,cd:Math.hypot(t.x-c.x,t.y-c.y),pd:35};}
      const error=state.aiDifficulty==='easy'?.038:state.aiDifficulty==='normal'?.013:.003;
      state.aim=Math.atan2(best.y-c.y,best.x-c.x)+(Math.random()*2-1)*error;
      const powerError=state.aiDifficulty==='easy'?12:state.aiDifficulty==='normal'?5:2;
      state.power=clamp(Math.round(48+best.cd*.72+best.pd*.28+(Math.random()*2-1)*powerError),38,100);
      state.calledPocket=needsEightCall()?best.pocket:null;
      syncPowerUI();
      say(`电脑瞄准 ${best.target.n} 号球。`);updateUI();render();fire(true);
    },850);
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
    ctx.fillStyle='#111318';ctx.fillRect(0,0,canvas.width,canvas.height);
    const glow=ctx.createRadialGradient(700,360,40,700,360,750);glow.addColorStop(0,'#32383a');glow.addColorStop(1,'#0b1014');ctx.fillStyle=glow;ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.shadowColor='#000b';ctx.shadowBlur=32;ctx.shadowOffsetY=16;
    fillRect(l-73,t-73,W*SCALE+146,H*SCALE+146,60,'#111619');ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    const wood=ctx.createLinearGradient(0,t-70,0,b+70);wood.addColorStop(0,'#51595b');wood.addColorStop(.22,'#242b2e');wood.addColorStop(.55,'#151a1e');wood.addColorStop(.85,'#323b40');wood.addColorStop(1,'#13191d');
    fillRect(l-67,t-67,W*SCALE+134,H*SCALE+134,54,wood);
    ctx.lineWidth=3;ctx.strokeStyle='#a7b2b2';roundedRect(l-62,t-62,W*SCALE+124,H*SCALE+124,50);ctx.stroke();
    fillRect(l-36,t-36,W*SCALE+72,H*SCALE+72,33,'#102313');
    const felt=ctx.createRadialGradient(700,350,50,700,350,740);felt.addColorStop(0,'#55cb27');felt.addColorStop(.72,'#37a31a');felt.addColorStop(1,'#167916');ctx.fillStyle=felt;ctx.fillRect(l,t,W*SCALE,H*SCALE);
    ctx.fillStyle='#ffffff08';ctx.fillRect(l,t,W*SCALE,H*SCALE);
    ctx.strokeStyle='#a8d0af44';ctx.lineWidth=2;ctx.setLineDash([5,13]);ctx.beginPath();ctx.moveTo(l+25*SCALE,t);ctx.lineTo(l+25*SCALE,b);ctx.stroke();ctx.setLineDash([]);
    const rail=(x1,y1,x2,y2)=>{ctx.strokeStyle='#125a13';ctx.lineWidth=27;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.strokeStyle='#9bf051';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();};
    [[CUT,SIDE_L],[SIDE_R,W-CUT]].forEach(([a,z])=>{rail(l+a*SCALE,t,l+z*SCALE,t);rail(l+a*SCALE,b,l+z*SCALE,b);});
    rail(l,t+CUT*SCALE,l,b-CUT*SCALE);rail(r,t+CUT*SCALE,r,b-CUT*SCALE);
    for(const p of POCKETS){const pos=worldToScreen(p.x,p.y);ctx.beginPath();ctx.arc(pos.x,pos.y,p.x===50?SIDE_MOUTH*SCALE*.5:CORNER_MOUTH*SCALE*.5,0,Math.PI*2);ctx.fillStyle='#05090b';ctx.fill();ctx.lineWidth=5;ctx.strokeStyle='#909fa0';ctx.stroke();}
    ctx.fillStyle='#e7c887b9';for(let x=12.5;x<=87.5;x+=12.5){if(x===50)continue;for(const y of [t-49,b+49]){ctx.save();ctx.translate(l+x*SCALE,y);ctx.rotate(Math.PI/4);ctx.fillRect(-4,-4,8,8);ctx.restore();}}
    for(let y=12.5;y<=37.5;y+=12.5)for(const x of [l-48,r+48]){ctx.save();ctx.translate(x,t+y*SCALE);ctx.rotate(Math.PI/4);ctx.fillRect(-4,-4,8,8);ctx.restore();}
  }
  function drawBall(b) {
    const {x,y}=worldToScreen(b.x,b.y),rr=R*SCALE;
    ctx.save();ctx.shadowColor='#00120caa';ctx.shadowBlur=7;ctx.shadowOffsetY=5;
    ctx.beginPath();ctx.arc(x,y,rr,0,Math.PI*2);
    let color=COLORS[b.n<=8?b.n:b.n-8];
    const grad=ctx.createRadialGradient(x-rr*.4,y-rr*.55,rr*.05,x,y,rr*1.1);grad.addColorStop(0,'#fff9');grad.addColorStop(.23,color);grad.addColorStop(1,'#16251aaa');
    ctx.fillStyle=grad;ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    const motion=Math.hypot(b.vx,b.vy)>1;
    const sweep=Math.sin(b.roll),depth=Math.cos(b.roll);
    if(b.n>8){ctx.save();ctx.beginPath();ctx.arc(x,y,rr-.6,0,Math.PI*2);ctx.clip();ctx.translate(x,y);ctx.rotate(motion?b.rollHeading*.35:0);const band=motion?sweep*rr*.48:0;ctx.fillStyle='#f9f5e9';ctx.fillRect(-rr,-rr+band,rr*2,rr*.43);ctx.fillRect(-rr,rr*.57+band,rr*2,rr*.43);ctx.restore();}
    if(b.n!==0){const shift=motion?sweep*rr*.43:0,shrink=motion?Math.max(.28,Math.abs(depth)):1;ctx.save();ctx.translate(x,y);ctx.rotate(motion?b.rollHeading*.28:0);ctx.beginPath();ctx.ellipse(0,shift,rr*.46,rr*.46*shrink,0,0,Math.PI*2);ctx.fillStyle='#fffdf2';ctx.fill();ctx.fillStyle='#172029';ctx.font=`bold ${rr*.73*shrink}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(b.n),0,shift+1);ctx.restore();}
    else if(motion){ctx.beginPath();ctx.ellipse(x+sweep*rr*.35,y+depth*rr*.25,rr*.14,rr*.1,0,0,Math.PI*2);ctx.fillStyle='#b5d1cf88';ctx.fill();}
    ctx.restore();
  }
  function legalTarget(n){
    if(state.mode==='nine')return n===lowestNine();
    const g=currentGroup();return g?(allGroupGone(g)?n===8:group(n)===g):n!==8;
  }
  function guideLimit(x,y,dx,dy,max,ignore){
    if(dx>0)max=Math.min(max,(W-R-x)/dx);else if(dx<0)max=Math.min(max,(R-x)/dx);
    if(dy>0)max=Math.min(max,(H-R-y)/dy);else if(dy<0)max=Math.min(max,(R-y)/dy);
    for(const b of activeBalls()){
      if(b===ignore)continue;
      const ox=b.x-x,oy=b.y-y,t=ox*dx+oy*dy;
      if(t<=0)continue;
      const off=ox*ox+oy*oy-t*t,rad=2*R;
      if(off<rad*rad)max=Math.min(max,Math.max(0,t-Math.sqrt(rad*rad-off)));
    }
    return Math.max(0,max);
  }
  function guideLine(x,y,dx,dy,len,color,dashed=false){
    if(len<.2)return;
    const a=worldToScreen(x,y),b=worldToScreen(x+dx*len,y+dy*len);
    ctx.strokeStyle=color;ctx.shadowColor=color;ctx.shadowBlur=9;ctx.lineWidth=2.4;ctx.setLineDash(dashed?[8,7]:[]);
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);ctx.shadowBlur=0;
  }
  function drawAim() {
    if(state.phase!=='aim'||state.ballInHand)return;
    const c=cue(),dirX=Math.cos(state.aim),dirY=Math.sin(state.aim),p=worldToScreen(c.x,c.y);
    let max=115,target=null;
    if(dirX>0)max=Math.min(max,(W-R-c.x)/dirX);else if(dirX<0)max=Math.min(max,(R-c.x)/dirX);
    if(dirY>0)max=Math.min(max,(H-R-c.y)/dirY);else if(dirY<0)max=Math.min(max,(R-c.y)/dirY);
    for(const b of activeBalls()){
      const dx=b.x-c.x,dy=b.y-c.y,projection=dx*dirX+dy*dirY;
      if(projection<=0)continue;
      const off2=dx*dx+dy*dy-projection*projection,rad=2*R;
      if(off2<rad*rad){const d=projection-Math.sqrt(rad*rad-off2);if(d>0&&d<max){max=d;target=b;}}
    }
    const end=worldToScreen(c.x+dirX*max,c.y+dirY*max),color=target&&!legalTarget(target.n)?'#ff5c55':'#f3f7e6';
    ctx.save();guideLine(c.x,c.y,dirX,dirY,max,color,true);
    if(target){
      ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(end.x,end.y,R*SCALE,0,Math.PI*2);ctx.stroke();
      const nx=(target.x-(c.x+dirX*max))/(2*R),ny=(target.y-(c.y+dirY*max))/(2*R),norm=Math.hypot(nx,ny);
      if(norm>.01){
        const ox=nx/norm,oy=ny/norm;
        guideLine(target.x,target.y,ox,oy,guideLimit(target.x,target.y,ox,oy,40,target),color);
        const tangentX=dirX-(dirX*ox+dirY*oy)*ox,tangentY=dirY-(dirX*ox+dirY*oy)*oy,tm=Math.hypot(tangentX,tangentY);
        if(tm>.12)guideLine(c.x+dirX*max,c.y+dirY*max,tangentX/tm,tangentY/tm,guideLimit(c.x+dirX*max,c.y+dirY*max,tangentX/tm,tangentY/tm,22,target),color,true);
      }
    }
    const gap=R*SCALE+14+state.power*.4,back=gap+230;
    const cueGrad=ctx.createLinearGradient(p.x-dirX*back,p.y-dirY*back,p.x-dirX*gap,p.y-dirY*gap);
    cueGrad.addColorStop(0,'#492619');cueGrad.addColorStop(.3,'#a86636');cueGrad.addColorStop(.75,'#dfb377');cueGrad.addColorStop(.96,'#f6dfb5');cueGrad.addColorStop(1,'#5bb4b9');
    ctx.strokeStyle='#0008';ctx.lineWidth=13;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(p.x-dirX*back,p.y-dirY*back+4);ctx.lineTo(p.x-dirX*gap,p.y-dirY*gap+4);ctx.stroke();
    ctx.strokeStyle=cueGrad;ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(p.x-dirX*back,p.y-dirY*back);ctx.lineTo(p.x-dirX*gap,p.y-dirY*gap);ctx.stroke();ctx.restore();
  }
  function drawPocketCalls() {
    if(!needsEightCall()||state.phase!=='aim')return;
    POCKETS.forEach((p,i)=>{const q=worldToScreen(p.x,p.y);ctx.beginPath();ctx.arc(q.x,q.y,25,0,Math.PI*2);ctx.fillStyle=state.calledPocket===i?'#f4cb75':'#142a29dd';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#fff2c3';ctx.stroke();ctx.fillStyle=state.calledPocket===i?'#102a28':'#fff5d1';ctx.font='bold 14px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(i+1),q.x,q.y);});
  }
  function render() {
    drawTable();drawAim();for(const b of live())drawBall(b);drawPocketCalls();
    if(state.ballInHand){const c=cue(),p=worldToScreen(c.x,c.y);ctx.strokeStyle='#fff4a3';ctx.lineWidth=2;ctx.setLineDash([5,5]);ctx.beginPath();ctx.arc(p.x,p.y,24,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
    if(state.phase==='gameover'){ctx.fillStyle='#06181bdc';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#f4d382';ctx.font='bold 58px sans-serif';ctx.textAlign='center';ctx.fillText(`${actor(state.winner)}获胜`,700,365);ctx.fillStyle='#d9e9df';ctx.font='22px sans-serif';ctx.fillText('点击右上角「新开一局」再来一场',700,410);}
  }
  function pointerWorld(e){const rect=canvas.getBoundingClientRect();return screenToWorld((e.clientX-rect.left)/rect.width*canvas.width,(e.clientY-rect.top)/rect.height*canvas.height);}
  canvas.addEventListener('pointerdown',e=>{
    if(state.phase!=='aim'||(state.opponent==='ai'&&state.turn===1))return;
    canvas.setPointerCapture(e.pointerId);const p=pointerWorld(e);
    if(needsEightCall()){
      let best=-1,d=3.5;POCKETS.forEach((q,i)=>{const dist=Math.hypot(q.x-p.x,q.y-p.y);if(dist<d){d=dist;best=i;}});
      if(best>=0){state.calledPocket=best;say(`已指定${POCKETS[best].name}。`);updateUI();render();return;}
    }
    if(state.ballInHand){state.drag='place';placeCue(p.x,p.y,false);return;}
    const c=cue(),dx=p.x-c.x,dy=p.y-c.y,ax=Math.cos(state.aim),ay=Math.sin(state.aim);
    const behind=-(dx*ax+dy*ay),side=Math.abs(dx*ay-dy*ax);
    if(behind>=2.5&&behind<=24&&side<1.9){state.drag={kind:'power',start:p,pull:0};return;}
    state.drag='aim';aimAt(p.x,p.y);
  });
  canvas.addEventListener('pointermove',e=>{
    if(!state.drag||state.phase!=='aim')return;const p=pointerWorld(e);
    if(state.drag==='place')placeCue(p.x,p.y,false);
    else if(state.drag==='aim')aimAt(p.x,p.y);
    else {const d=state.drag.start;const pull=(d.x-p.x)*Math.cos(state.aim)+(d.y-p.y)*Math.sin(state.aim);state.drag.pull=Math.max(0,pull);state.power=clamp(Math.round(14+state.drag.pull*7),5,100);syncPowerUI();render();}
  });
  const pointerUp=e=>{if(state.drag==='place'&&state.phase==='aim'){const p=pointerWorld(e);placeCue(p.x,p.y,true);}else if(state.drag?.kind==='power'&&state.drag.pull>=1.5){fire();}state.drag=null;};
  canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointercancel',()=>{state.drag=null;});
  const spinPad=$('spinPad');
  function moveSpinDot(){const dot=$('spinDot');dot.style.left=`${50+state.spinX*36}%`;dot.style.top=`${50-state.spinY*36}%`;}
  function setSpin(e){const rect=spinPad.getBoundingClientRect();const x=(e.clientX-rect.left)/rect.width*2-1,y=1-(e.clientY-rect.top)/rect.height*2;const k=Math.max(1,Math.hypot(x,y));state.spinX=clamp(x/k,-1,1);state.spinY=clamp(y/k,-1,1);moveSpinDot();}
  spinPad.addEventListener('pointerdown',e=>{spinPad.setPointerCapture(e.pointerId);setSpin(e);});
  spinPad.addEventListener('pointermove',e=>{if(spinPad.hasPointerCapture(e.pointerId))setSpin(e);});
  $('resetSpin').addEventListener('click',()=>{state.spinX=0;state.spinY=0;moveSpinDot();});
  $('power').addEventListener('input',e=>{state.power=Number(e.target.value);syncPowerUI();render();});
  const meter=$('cueMeter');let meterDrag=null;
  meter.addEventListener('pointerdown',e=>{
    if(state.phase!=='aim'||state.ballInHand||(state.opponent==='ai'&&state.turn===1))return;
    meterDrag={id:e.pointerId,startY:e.clientY,pull:0};meter.setPointerCapture(e.pointerId);
  });
  meter.addEventListener('pointermove',e=>{
    if(!meterDrag||meterDrag.id!==e.pointerId)return;
    const pull=clamp(e.clientY-meterDrag.startY,0,meter.clientHeight*.65);
    meterDrag.pull=pull;state.power=clamp(Math.round(5+pull/(meter.clientHeight*.65)*95),5,100);
    meter.style.setProperty('--cue-pull',`${pull*.42}px`);syncPowerUI();render();
  });
  meter.addEventListener('pointerup',e=>{
    if(!meterDrag||meterDrag.id!==e.pointerId)return;
    const shoot=meterDrag.pull>9;meterDrag=null;meter.style.setProperty('--cue-pull','0px');
    if(shoot)fire();
  });
  meter.addEventListener('pointercancel',()=>{meterDrag=null;meter.style.setProperty('--cue-pull','0px');});
  meter.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      e.preventDefault();state.power=clamp(state.power+(e.key==='ArrowDown'?5:-5),5,100);syncPowerUI();render();
    }
    if(e.key==='Enter'){e.preventDefault();fire();}
  });
  $('shootBtn').addEventListener('click',()=>fire());
  $('aimLeft').addEventListener('click',()=>{if(state.opponent==='ai'&&state.turn===1)return;state.aim-=Math.PI/360;updateUI();render();});
  $('aimRight').addEventListener('click',()=>{if(state.opponent==='ai'&&state.turn===1)return;state.aim+=Math.PI/360;updateUI();render();});
  for(const [id,opponent] of [['versusAI','ai'],['versusLocal','local']])$(id).addEventListener('click',()=>{state.opponent=opponent;$('versusAI').classList.toggle('selected',opponent==='ai');$('versusLocal').classList.toggle('selected',opponent==='local');$('difficultySelect').hidden=opponent!=='ai';});
  document.querySelectorAll('[data-difficulty]').forEach(btn=>btn.addEventListener('click',()=>{
    state.aiDifficulty=btn.dataset.difficulty;
    document.querySelectorAll('[data-difficulty]').forEach(q=>q.classList.toggle('selected',q===btn));
  }));
  document.querySelectorAll('[data-mode]').forEach(btn=>btn.addEventListener('click',()=>init(btn.dataset.mode)));
  $('newBtn').addEventListener('click',()=>{state.aiTicket++;$('menuOverlay').classList.remove('hidden');state.phase='menu';updateUI();});
  $('rulesBtn').addEventListener('click',()=>$('rulesOverlay').classList.remove('hidden'));
  $('closeRules').addEventListener('click',()=>$('rulesOverlay').classList.add('hidden'));
  $('rulesOverlay').addEventListener('click',e=>{if(e.target.id==='rulesOverlay')$('rulesOverlay').classList.add('hidden');});
  function fullscreen(){if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen?.();}
  $('fullBtn').addEventListener('click',fullscreen);
  document.addEventListener('keydown',e=>{
    if(e.key==='f'||e.key==='F'){fullscreen();return;}
    if(e.key==='Escape'){$('rulesOverlay').classList.add('hidden');return;}
    if(state.phase!=='aim')return;
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();if(state.opponent==='ai'&&state.turn===1)return;state.aim+=(e.key==='ArrowLeft'?-1:1)*Math.PI/360;updateUI();render();}
    if(e.key===' '){e.preventDefault();fire();}
  });
  let last=performance.now(),acc=0;
  function frame(now){const elapsed=Math.min(.05,(now-last)/1000);last=now;acc+=elapsed;while(acc>=STEP){update(STEP);acc-=STEP;}render();requestAnimationFrame(frame);}
  window.advanceTime=ms=>{const steps=Math.ceil(ms/1000/STEP);for(let i=0;i<steps;i++)update(STEP);render();};
  window.render_game_to_text=()=>JSON.stringify({coordinates:`world inches, origin at top-left cushion nose; +x right, +y down; table 100x50; ball diameter 2.25; corner mouth ${CORNER_MOUTH}; side mouth ${SIDE_MOUTH}`,mode:state.mode,opponent:state.opponent,aiDifficulty:state.aiDifficulty,phase:state.phase,turn:state.turn+1,groups:state.groups,scores:state.scores,breaking:state.breaking,ballInHand:state.ballInHand,aimDegrees:+(state.aim*180/Math.PI).toFixed(1),power:state.power,spin:[+state.spinX.toFixed(2),+state.spinY.toFixed(2)],calledPocket:state.calledPocket,balls:state.balls.map(b=>({n:b.n,x:+b.x.toFixed(2),y:+b.y.toFixed(2),vx:+b.vx.toFixed(2),vy:+b.vy.toFixed(2),roll:+b.roll.toFixed(2),pocketed:b.pocketed})),status:state.status,winner:state.winner});
  if(new URLSearchParams(location.search).has('test'))window.__poolTest={setMovingBalls(entries){
    state.aiTicket++;state.mode='nine';state.opponent='local';state.phase='moving';state.turn=0;state.breaking=false;state.ballInHand=false;state.balls=entries.map(q=>Object.assign(ball(q.n,q.x,q.y),{vx:q.vx||0,vy:q.vy||0}));
    state.shot={shooter:0,breaking:false,firstHit:1,pocketed:[],railAfterHit:false,breakRails:new Set(),calledPocket:null,groupAtStart:null,eightReady:false};state.stopTime=0;state.shotTime=0;updateUI();render();
  },setGuideFixture(illegal=false){
    state.aiTicket++;state.mode='nine';state.opponent='local';state.phase='aim';state.turn=0;state.breaking=false;state.ballInHand=false;
    state.balls=[ball(0,25,25),ball(1,65,12),ball(illegal?2:1,50,25)];
    if(!illegal)state.balls.splice(1,1);
    state.aim=0;state.shot=null;state.calledPocket=null;$('menuOverlay').classList.add('hidden');updateUI();render();
  },setEightFinal(){
    state.aiTicket++;state.mode='eight';state.opponent='local';state.phase='aim';state.turn=0;state.breaking=false;state.ballInHand=false;state.groups=['solid','stripe'];state.scores=[7,0];state.balls=[ball(0,50,22),ball(8,50,8)];state.aim=-Math.PI/2;state.power=56;state.calledPocket=null;state.shot=null;
    $('player2Name').textContent='玩家 2';syncPowerUI();$('menuOverlay').classList.add('hidden');updateUI();render();
  },setNineFinal(){
    state.aiTicket++;state.mode='nine';state.opponent='local';state.phase='aim';state.turn=0;state.breaking=false;state.ballInHand=false;state.groups=[null,null];state.scores=[8,0];state.balls=[ball(0,50,22),ball(9,50,8)];state.aim=-Math.PI/2;state.power=56;state.calledPocket=null;state.shot=null;
    $('player2Name').textContent='玩家 2';syncPowerUI();$('menuOverlay').classList.add('hidden');updateUI();render();
  }};
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

