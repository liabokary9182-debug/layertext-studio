const assert=require('node:assert/strict'),path=require('node:path');
const {loadGame}=require('./ai-harness.cjs');
const h=loadGame(path.resolve(__dirname,'../real-pool-web/game.js'));
const old=loadGame(path.resolve(__dirname,'physics-before.js'));
const ordinary=[
 {entries:[{n:0,x:25,y:25},{n:1,x:55,y:25}],plan:{aim:0,power:56}},
 {entries:[{n:0,x:25,y:25},{n:1,x:55,y:25},{n:2,x:65,y:31}],plan:{aim:.025,power:90,spinY:-.6}},
 {entries:[{n:0,x:50,y:25},{n:1,x:50,y:9}],plan:{aim:-Math.PI/2,power:38,spinY:.6}},
 {entries:[{n:0,x:25,y:25},{n:1,x:70,y:18}],plan:{aim:-.12,power:100,spinX:.4,spinY:.3}},
 {entries:[{n:0,x:15,y:5},{n:1,x:70,y:35}],plan:{aim:-.7,power:75,spinX:-.4}}
];
for(const [i,f] of ordinary.entries()){
 old.setRandomSeed(4);h.setRandomSeed(4);
 const a=old.trace(f.entries,f.plan),b=h.trace(f.entries,f.plan);
 const geometry=h.geometry();let checked=0;
 const near=sample=>sample.balls.some(b=>geometry.some(p=>Math.hypot(b.x-p.mx,b.y-p.my)<p.radius+1.125+1.1));
 for(let step=0;step<Math.min(a.samples.length,b.samples.length);step++){
  if(near(a.samples[step])||near(b.samples[step])||a.samples[step].balls.some(ball=>Math.min(ball.x,100-ball.x,ball.y,50-ball.y)<1.7))break;
  assert(JSON.stringify(b.samples[step])===JSON.stringify(a.samples[step]),`outside-pocket trajectory changed fixture ${i+1} step ${step+1}`);checked++;
 }
 assert(checked>10,'insufficient unchanged trajectory coverage');
 console.log(`PASS original cloth/collisions outside pockets ${i+1}: ${checked} steps`);
}
assert.equal(h.params().rollDecel,old.params().rollDecel);
assert.equal(h.params().mouth,old.params().mouth*1.02);
assert(h.params().speed100<260&&h.params().speed100>240);
for(const mode of ['eight','nine'])for(const power of [56,100]){
 h.setRandomSeed(5);const b=h.breakTrial(mode,power,5);
 assert(b.maxSpeed<265,'break exceeded bounded cue energy');
 assert(b.width>30&&b.height>20,'rack stayed clustered');
 console.log(`PASS ${mode} break ${power}%: speed ${b.initialSpeed.toFixed(1)}, spread ${b.width.toFixed(1)}×${b.height.toFixed(1)}`);
}
const entries=[{n:0,x:25,y:25},{n:1,x:50,y:25}];
const low=h.predict(entries,{aim:0,power:15}),high=h.predict(entries,{aim:0,power:100});
assert.equal(JSON.stringify(low),JSON.stringify(high),'restored geometric guide changes with power');
assert.equal(high.targetNumber,1);assert.equal(high.shotPath.length,2);
const length=points=>Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y);
assert(length(high.targetPath)<=11.001);assert(length(high.cuePath)<=8.001);
console.log('PASS old short guide and unchanged cloth; pocket mouth retains +2%');
