const assert=require('node:assert/strict'),path=require('node:path');const{loadGame}=require('./ai-harness.cjs');
const h=loadGame(path.resolve(__dirname,'../real-pool-web/game.js'));
(async()=>{
 const entries=[{n:0,x:50,y:25},{n:1,x:50,y:10},{n:2,x:72,y:20},{n:9,x:82,y:37}];
 h.setRandomSeed(1);const r=await h.plan(entries,'nine',null,false,'hard');
 assert(r.plan.positionPlanned);assert(r.plan.spinY||r.plan.spinX,'position fixture should choose real spin inputs');
 assert(r.result.safe&&r.result.potted);
 const neutral=h.trial(entries,{...r.plan,spinX:0,spinY:0});
 if(neutral.safe&&neutral.potted)assert(h.masterCost(r.result)<h.masterCost(neutral),'chosen spin should improve next-ball position cost');
 const actual=h.play(r.plan);assert.equal(actual.ballInHand,false);assert(actual.balls.find(b=>b.n===1).pocketed);
 const white=actual.balls.find(b=>b.n===0),predicted=r.result.balls.find(b=>b.n===0);
 assert(Math.hypot(white.x-predicted.x,white.y-predicted.y)<1e-8,'master trial and live cue position differ');
 h.setRandomSeed(1);const normal=await h.plan(entries,'nine',null,false,'normal');assert(!normal.plan.positionPlanned,'master position search leaked into normal difficulty');
 console.log(`PASS master spin/next-ball selection and exact trial/live final cue: spin ${r.plan.spinX}/${r.plan.spinY}`);
})().catch(e=>{console.error(e);process.exitCode=1;});
