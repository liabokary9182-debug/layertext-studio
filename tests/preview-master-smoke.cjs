const fs=require('node:fs'),assert=require('node:assert/strict');
let seed=1;
const testMath=Object.create(Math);
testMath.random=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};
const {window,elements,delayed}=require('./pool-dom.cjs')(fs.readFileSync(process.argv[2]||'/workspace/pool-master-tactics-preview.html','utf8'),{Math:testMath});
(async()=>{
 for(const kind of ['bank','kick','snooker']){
  await elements.get('aiTestsBtn').click();
  seed=1;elements.get('aiTestScene').value='master-'+kind;
  // A named master drill must use hard even after the regular tier is changed.
  elements.get('aiTestDifficulty').value='easy';
  await elements.get('runAITest').click();
  let state=JSON.parse(window.render_game_to_text());
  assert.equal(elements.get('aiTestDifficulty').value,'hard');
  assert.equal(state.aiDifficulty,'hard');assert.equal(state.aiPlan.type,kind);
  assert.equal(state.phase,'aim');assert.equal(state.power,state.aiPlan.power);
  assert.deepEqual(state.spin,[state.aiPlan.spinX,state.aiPlan.spinY]);
  assert.equal(elements.get('spinDot').style.left,`${50+state.spin[0]*36}%`);
  assert.equal(elements.get('spinDot').style.top,`${50-state.spin[1]*36}%`);
  if(kind==='bank')assert(state.spin[1]<0);
  if(kind==='snooker'){assert(state.spin[0]<0&&state.spin[1]>0);assert(state.aiPlan.snookerPlanned);}
  assert(delayed.length);delayed.pop()();
  assert.equal(JSON.parse(window.render_game_to_text()).phase,'moving');
  window.advanceTime(30000);state=JSON.parse(window.render_game_to_text());
  assert.equal(state.phase,'aim');assert(!state.ballInHand);assert(!state.aiThinking);
  if(kind!=='snooker')assert(state.balls.find(b=>b.n===1).pocketed);
  else{assert.equal(state.turn,1);assert(state.balls.some(b=>b.n===8&&!b.pocketed));}
  console.log(`PASS phone master ${kind}: selected tier, visible cue point/power, and actual legal shot`);
 }
 await elements.get('aiTestsBtn').click();elements.get('aiTestScene').value='master-kick';
 const pending=elements.get('runAITest').click();
 await elements.get('newBtn').click();await pending;
 const cancelled=JSON.parse(window.render_game_to_text());
 assert.equal(cancelled.phase,'menu');assert.equal(cancelled.aiPlan,null);assert(!cancelled.aiThinking);
 assert(!elements.get('runAITest').disabled);
 console.log('PASS cancelling an in-progress master technique leaves no stale plan or thinking state');
})().catch(e=>{console.error(e);process.exitCode=1;});
