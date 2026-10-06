const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {loadGame}=require('./ai-harness.cjs');
const fixtures=require('./fixtures.cjs');
const root=path.resolve(__dirname,'..');
const h=loadGame(path.join(root,'real-pool-web/game.js'));

(async()=>{
  const rows=[];
  for(const f of fixtures){
    h.setRandomSeed(1);
    const r=await h.plan(f.entries,f.mode,f.group,f.hand);
    assert(r.plan,`${f.name}: no plan`);
    assert(r.plan.executionError,`${f.name}: actual difficulty inputs missing`);
    const actual=h.play(r.plan);
    if(actual.phase!=='gameover')assert.equal(actual.ballInHand,!r.result.safe,`${f.name}: trial/live foul mismatch`);
    assert.equal(actual.phase==='aim'||actual.phase==='gameover',true);
    for(const p of r.result.pocketed)assert(actual.balls.some(b=>b.n===p.n&&b.pocketed),`${f.name}: trial/live pocket mismatch`);
    if(f.name==='eight-final')assert.equal(actual.winner,1);
    rows.push({name:f.name,safe:r.result.safe,firstHit:r.result.firstHit,type:r.plan.type,potted:r.result.potted,ms:Math.round(r.ms),liveStatus:actual.status});
    console.log(`PASS ${f.name}: ${actual.status}`);
  }
  const narrow=fixtures.find(f=>f.name==='narrow-escape');
  const escape=await h.escape(narrow.entries);
  assert.equal(escape.result.safe,true,'expanded escape must find a legal route');
  assert.equal(h.play(escape.plan).ballInHand,false,'expanded escape must also be legal in live physics');
  console.log('PASS all-angle escape search and live playback');

  const clear=[{n:0,x:50,y:25},{n:1,x:50,y:10},{n:9,x:80,y:35}];
  const hidden=[{n:0,x:50,y:25},{n:1,x:50,y:10},{n:2,x:50,y:20},{n:3,x:50,y:5}];
  assert(h.position(hidden)>h.position(clear)+20,'blocked next ball must be penalised');
  assert.equal(await h.cancel(clear),null,'cancelled planning must not return a stale shot');
  assert.equal((await h.plan([{n:0,x:50,y:25}])).plan,null,'empty layout must not produce a shot');
  console.log('PASS continuation visibility, cancellation, and empty layout');

  const wrong=h.trial([{n:0,x:50,y:25},{n:1,x:80,y:25},{n:2,x:50,y:10}],{target:1,pocket:1,aim:-Math.PI/2,power:30});
  assert.equal(wrong.firstHit,2);assert.equal(wrong.safe,false);
  const early=h.trial([{n:0,x:50,y:25},{n:1,x:80,y:35},{n:8,x:50,y:10}],{target:8,pocket:1,aim:-Math.PI/2,power:30},'eight','solid');
  assert.equal(early.safe,false);assert.equal(early.winning,false);
  const nine=await h.plan([{n:0,x:50,y:25},{n:9,x:50,y:9}]);
  assert.equal(nine.result.winning,true);assert.equal(h.play(nine.plan).winner,1);
  for(const difficulty of ['easy','normal','hard']){
    h.setRandomSeed(1);const r=await h.plan(clear,'nine',null,false,difficulty);assert.equal(h.play(r.plan).ballInHand,!r.result.safe);
  }
  console.log('PASS wrong first contact, early eight, winning nine, and three difficulties');
  fs.writeFileSync(path.join(__dirname,'verified-results.json'),JSON.stringify({fixtures:rows,expandedEscape:{safe:escape.result.safe,firstHit:escape.result.firstHit,plan:escape.plan},checks:'all passed'},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
