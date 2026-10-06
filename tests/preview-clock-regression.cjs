const fs=require('node:fs'),assert=require('node:assert/strict');
const fragment=fs.readFileSync(process.argv[2]||'/workspace/pool-original-tuning-preview.html','utf8');
// Release only the test fixture's time freeze; run the unmodified live clock.
const source=fragment.replace('},setMovingBalls(entries){\n    manualTime=true;', '},setMovingBalls(entries){\n    manualTime=false;');
assert(source!==fragment,'clock fixture instrument failed');
function sample(rate){
 const d=require('./pool-dom.cjs')(source,{captureFrames:true,performance:{now:()=>0}});
 d.window.__poolTest.setMovingBalls([{n:0,x:35,y:25,vx:24,vy:0,rollVx:24,rollVy:0}]);
 for(let i=1;i<=rate;i++){const jobs=d.frames.splice(0);for(const fn of jobs)fn(i*1000/rate);}
 return JSON.parse(d.window.render_game_to_text()).balls[0];
}
const sixty=sample(60),oneTwenty=sample(120);
assert(Math.abs(sixty.x-oneTwenty.x)<=.13,'high refresh changes game time by more than one tick');
assert(sixty.x>55&&sixty.x<58,'expected one second of original rolling friction');
console.log(`PASS preview fixed-step clock at 60/120 Hz: x=${sixty.x}/${oneTwenty.x}`);
