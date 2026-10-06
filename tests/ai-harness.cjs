const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadGame(file) {
  const elements = new Map();
  const context = {setTransform() {}};
  const document = {getElementById(id) {
    if (!elements.has(id)) elements.set(id, {style:{setProperty(){}},classList:{add(){},remove(){},toggle(){}},getContext:()=>context,setAttribute(){}});
    return elements.get(id);
  }};
  let source = fs.readFileSync(file, 'utf8');
  source = source.slice(0, source.indexOf('  function roundedRect'));
  source += `
    function render() {}
    function moveSpinDot() {}
    globalThis.aiHarness = {
      async plan(entries, mode='nine', ownGroup=null, hand=false, difficulty='hard') {
        state.aiTicket++;state.aiThinking=false;state.aiPlan=null;state.mode=mode;state.opponent='ai';state.phase='aim';state.turn=1;state.breaking=false;state.ballInHand=hand;state.groups=[ownGroup==='solid'?'stripe':ownGroup==='stripe'?'solid':null,ownGroup];state.aiDifficulty=difficulty;
        state.balls=entries.map(q=>Object.assign(ball(q.n,q.x,q.y),q));state.shot=null;state.pocketAnimations=[];state.scores=[0,0];state.winner=null;
        const started=performance.now();const plan=await chooseAIPlan();
        return {plan,result:plan?simulateAIShot(plan):null,ms:performance.now()-started,cuePosition:{x:cue().x,y:cue().y}};
      },
      async escape(entries) {
        state.mode='nine';state.phase='aim';state.turn=1;state.opponent='ai';state.ballInHand=false;state.groups=[null,null];state.balls=entries.map(q=>ball(q.n,q.x,q.y));
        const plan=await searchEscape(aiTargets(),()=>true);return {plan,result:plan?simulateAIShot(plan):null};
      },
      trial(entries, plan, mode='nine', ownGroup=null) {
        state.mode=mode;state.turn=1;state.phase='aim';state.groups=[null,ownGroup];state.balls=entries.map(q=>ball(q.n,q.x,q.y));state.winner=null;state.scores=[0,0];
        return simulateAIShot(plan);
      },
      play(plan) {
        state.opponent='local';state.aiThinking=false;state.aim=plan.aim;state.power=plan.power;state.spinX=plan.spinX||0;state.spinY=plan.spinY||0;state.ballInHand=false;
        fire(true);for(let i=0;i<5600&&state.phase==='moving';i++)update(STEP);
        return {phase:state.phase,winner:state.winner,turn:state.turn,status:state.status,ballInHand:state.ballInHand,balls:state.balls.map(b=>({n:b.n,x:b.x,y:b.y,pocketed:b.pocketed}))};
      },
      async technique(entries,kind,mode='nine',ownGroup=null){
        this.setup(entries,{},false);state.turn=1;state.groups=[ownGroup==='solid'?'stripe':ownGroup==='stripe'?'solid':null,ownGroup];state.mode=mode;state.aiDifficulty='hard';
        const started=performance.now(),plan=await chooseAITechnique(kind);
        return {plan,result:plan?simulateAIShot(plan):null,ms:performance.now()-started};
      },
      tacticalOptions(entries,kind){this.setup(entries,{},false);state.turn=1;return masterAttackOptions(aiTargets(),kind);},
      safety(result){return safetyPosition(result);},
      spinPalette(){return MASTER_SPINS;},
      cushion(entry,nx,ny){const b=Object.assign(ball(0,30,20),entry);state.phase='aim';state.shot=null;railHit(b,nx,ny,false);return b;},
      masterCost(result){return masterPositionScore(result);},
      position(entries, mode='nine', ownGroup=null) {
        state.mode=mode;state.turn=1;state.groups=[null,ownGroup];
        return aiPositionScore({balls:entries.map(q=>ball(q.n,q.x,q.y))});
      },
      async cancel(entries) {
        state.mode='nine';state.phase='aim';state.turn=1;state.opponent='ai';state.ballInHand=false;state.groups=[null,null];state.balls=entries.map(q=>ball(q.n,q.x,q.y));
        let checks=0;return chooseAIPlan(()=>++checks<3);
      },
      setup(entries,plan={},breaking=false) {
        state.mode='nine';state.phase='aim';state.turn=0;state.opponent='local';state.ballInHand=false;state.breaking=breaking;state.groups=[null,null];state.shot=null;
        state.balls=entries.map(q=>Object.assign(ball(q.n,q.x,q.y),q));
        state.aim=plan.aim||0;state.power=plan.power??56;state.spinX=plan.spinX||0;state.spinY=plan.spinY||0;
      },
      predict(entries,plan={},breaking=false) {
        this.setup(entries,plan,breaking);return displayGuide();
      },
      trace(entries,plan={},breaking=false) {
        this.setup(entries,plan,breaking);fire();
        const events=state.shot,samples=[];for(let i=1;i<=5401&&state.phase==='moving';i++){
          update(STEP);samples.push({step:i,balls:state.balls.map(b=>({n:b.n,x:b.x,y:b.y,pocketed:b.pocketed}))});
        }
        return {samples,events,balls:state.balls};
      },
      breakTrial(mode='eight',power=45,seed=1,aim=.004,cueY=25,spinY=0) {
        state.mode=mode;state.phase='aim';state.turn=0;state.opponent='local';state.ballInHand=false;state.breaking=true;state.groups=[null,null];state.balls=[ball(0,25,cueY)];state.pocketAnimations=[];state.scores=[0,0];state.winner=null;
        if(mode==='eight')rackEight(seededRandom(seed));else rackNine(seededRandom(seed));
        state.power=power;state.aim=aim;state.spinX=0;state.spinY=spinY;fire();
        const initialSpeed=Math.hypot(cue().vx,cue().vy);let maxSpeed=initialSpeed;
        for(let i=0;i<5401&&state.phase==='moving';i++){update(STEP);maxSpeed=Math.max(maxSpeed,...state.balls.map(b=>Math.hypot(b.vx,b.vy)));}
        const objects=state.balls.filter(b=>b.n>0&&!b.pocketed);
        const width=Math.max(...objects.map(b=>b.x))-Math.min(...objects.map(b=>b.x));
        const height=Math.max(...objects.map(b=>b.y))-Math.min(...objects.map(b=>b.y));
        const crowded=objects.filter(a=>objects.some(b=>b!==a&&Math.hypot(a.x-b.x,a.y-b.y)<3.5)).length;
        return {initialSpeed,maxSpeed,width,height,crowded,potted:state.balls.filter(b=>b.n>0&&b.pocketed).length,positions:objects.map(b=>({n:b.n,x:b.x,y:b.y}))};
      },
      geometry(){return POCKET_GEOMETRY;},
      roll(entries,steps=1800){
        state.mode='nine';state.phase='moving';state.turn=0;state.opponent='local';state.breaking=false;state.ballInHand=false;state.groups=[null,null];state.scores=[0,0];state.winner=null;
        state.balls=entries.map(q=>Object.assign(ball(q.n,q.x,q.y),q));state.pocketAnimations=[];state.stopTime=0;state.shotTime=0;
        state.shot={shooter:0,breaking:false,firstHit:1,pocketed:[],railAfterHit:false,breakRails:new Set(),groupAtStart:null,eightReady:false};
        const events=state.shot;
        for(let i=0;i<steps&&state.phase==='moving';i++)update(STEP);
        return {events,balls:state.balls.map(b=>({...b})),phase:state.phase};
      },
      pair(a,b) {
        const one=Object.assign(ball(0,a.x,a.y),a),two=Object.assign(ball(1,b.x,b.y),b);state.phase='aim';state.shot=null;
        ballsCollide(one,two);return [one,two];
      },
      setRandomSeed(seed) {Math.random=seededRandom(seed);},
      params() {return {mouth:CORNER_MOUTH,speed45:cueLaunchSpeed(45,true),speed100:cueLaunchSpeed(100,true),rollDecel:ROLL_DECEL};}
    };
  })();`;
  const sandbox={Math:Object.create(Math),document,window:{devicePixelRatio:1},setTimeout,performance,console,URLSearchParams,Uint32Array};
  vm.createContext(sandbox);vm.runInContext(source,sandbox,{filename:path.basename(file)});
  return sandbox.aiHarness;
}
module.exports={loadGame};
