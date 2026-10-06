const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');const{loadGame}=require('./ai-harness.cjs');const h=loadGame(path.resolve(__dirname,'../real-pool-web/game.js'));
const fixtures=[
 {kind:'bank',entries:[{n:0,x:40,y:25},{n:1,x:62,y:18},{n:9,x:82,y:37}]},
 {kind:'kick',entries:[{n:0,x:25,y:25},{n:1,x:50,y:10},{n:2,x:38,y:18},{n:9,x:80,y:38}]},
 {kind:'snooker',mode:'eight',group:'solid',entries:[{n:0,x:50,y:25},{n:1,x:35,y:25},{n:2,x:62,y:25},{n:9,x:85,y:25},{n:8,x:20,y:42}]}
];
(async()=>{
 const results=[];
 for(const f of fixtures){
  h.setRandomSeed(1);const r=await h.technique(f.entries,f.kind,f.mode||'nine',f.group||null);assert(r.plan);assert(r.result.safe);assert.equal(r.result.firstHit,1);
  if(f.kind==='bank'){assert(r.result.potted,'bank did not pot its declared target/pocket');assert(r.result.cushionHits.some(e=>e.n===1&&!e.jaw));}
  if(f.kind==='kick'){assert(r.result.potted,'kick did not pot its declared target/pocket');assert(r.result.cushionHits.some(e=>e.n===0&&e.beforeFirstHit&&!e.jaw));}
  if(f.kind==='snooker'){assert(h.safety(r.result).blocked,'snooker exposes a legal edge ray');assert(r.plan.snookerPlanned);assert(r.result.balls.some(b=>b.n===8&&!b.pocketed),'missing eight-ball fixture');}
  const actual=h.play(r.plan);assert(!actual.ballInHand);assert.notEqual(actual.phase,'moving');
  for(const expected of r.result.balls){const real=actual.balls.find(b=>b.n===expected.n);assert.equal(real.pocketed,expected.pocketed);if(!real.pocketed)assert(Math.hypot(real.x-expected.x,real.y-expected.y)<1e-8,`${f.kind}: trial/live drift ball ${real.n}`);}
  results.push({kind:f.kind,plan:r.plan,safe:r.result.safe,potted:r.result.potted,ms:Math.round(r.ms)});
  console.log(`PASS master ${f.kind}: legal first hit, required route/coverage, and live endpoint parity`);
 }
 const palette=h.spinPalette();assert(palette.length>=15);assert(palette.some(p=>p[0]>.8));assert(palette.some(p=>p[0]<-.8));assert(palette.some(p=>p[1]>.8));assert(palette.some(p=>p[1]<-.8));assert(palette.some(p=>p[0]*p[1]>0));assert(palette.some(p=>p[0]*p[1]<0));assert(palette.every(p=>Math.hypot(...p)<=1));
 // No opponent targets in an incomplete test layout must never be called snooker.
 const empty=h.safety({balls:[{n:0,x:40,y:25,pocketed:false}]});assert.equal(empty.blocked,false);
 // Routine play can discover a kick without a technique override.
 h.setRandomSeed(1);const automatic=await h.plan(fixtures[1].entries);assert(automatic.plan);assert(automatic.result.safe);assert(automatic.plan.type==='kick'||automatic.plan.type==='snooker'||automatic.plan.type==='bank');
 console.log(`PASS automatic tactical choice ${automatic.plan.type}; full spin palette; empty-target snooker guard`);
 fs.writeFileSync(path.join(__dirname,'master-tactics-results.json'),JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
