const fs=require('node:fs'),assert=require('node:assert/strict');
const d=require('./pool-dom.cjs')(fs.readFileSync(process.argv[2]||'/workspace/pool-pocket-physics-preview.html','utf8'));
(async()=>{
 for(const [name,pot] of [['pocket-slow-corner',true],['pocket-slow-side',true],['pocket-cut-side',true],['pocket-miss-side',false]]){
  await d.elements.get('aiTestsBtn').click();d.elements.get('aiTestScene').value=name;
  await d.elements.get('runAITest').click();assert.equal(JSON.parse(d.window.render_game_to_text()).phase,'moving');
  d.window.advanceTime(15000);const state=JSON.parse(d.window.render_game_to_text());
  assert.equal(state.balls.find(b=>b.n===1).pocketed,pot,name);
  console.log(`PASS phone pocket test ${name}: potted=${pot}`);
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
