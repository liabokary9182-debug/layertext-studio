const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');const{loadGame}=require('./ai-harness.cjs');
const h=loadGame(path.resolve(__dirname,'../real-pool-web/game.js')),old=loadGame(path.resolve(__dirname,'pockets-before.js'));
const geometry=h.geometry(),base=[{n:0,x:50,y:25},{n:9,x:88,y:25}];
const run=(engine,q,steps)=>engine.roll([...base,q],steps);const object=result=>result.balls.find(b=>b.n===1);
let reproduced=0,clear=0,blocked=0;const results=[];
for(const p of geometry){
 const slow={n:1,x:p.well.x-p.nx*.18,y:p.well.y-p.ny*.18,vx:p.nx*.8,vy:p.ny*.8,rollVx:p.nx*.8,rollVy:p.ny*.8};
 const before=run(old,slow),after=run(h,slow);
 assert(!object(before).pocketed,`old failure not reproduced ${p.index}`);assert(object(after).pocketed,`slow ball left inside well ${p.index}`);
 assert.equal(after.events.pocketed.find(b=>b.n===1).pocket,p.index);reproduced++;
 for(const speed of [6,16,65,150])for(const degrees of [-30,-15,0,15,30]){
  const angle=degrees*Math.PI/180,dx=p.nx*Math.cos(angle)+p.tx*Math.sin(angle),dy=p.ny*Math.cos(angle)+p.ty*Math.sin(angle);
  const distance=Math.min(8,speed*speed/(2*h.params().rollDecel)*.7);
  const q={n:1,x:p.well.x-dx*distance,y:p.well.y-dy*distance,vx:dx*speed,vy:dy*speed,rollVx:dx*speed,rollVy:dy*speed};
  const r=run(h,q);
  assert(object(r).pocketed,`clear path rejected pocket ${p.index}, ${degrees}°, speed ${speed}, final ${object(r).x}/${object(r).y}`);
  assert.equal(r.events.pocketed.find(b=>b.n===1).pocket,p.index);clear++;
 }
 results.push({pocket:p.index,oldSlowPocketed:false,newSlowPocketed:true,clearPaths:20});
}
// Off-mouth and nearly stopped on the shelf must remain on the table.
for(const p of geometry){
 const q={n:1,x:p.mx-p.nx*4+p.tx*(p.radius+1.4),y:p.my-p.ny*4+p.ty*(p.radius+1.4),vx:p.nx*8,vy:p.ny*8,rollVx:p.nx*8,rollVy:p.ny*8};
 const r=run(h,q);assert(!object(r).pocketed,`off-mouth was attracted to pocket ${p.index}`);blocked++;
 const shelf={n:1,x:p.mx-p.nx*1.3,y:p.my-p.ny*1.3,vx:p.nx*.1,vy:p.ny*.1,rollVx:p.nx*.1,rollVy:p.ny*.1};
 assert(!object(run(h,shelf)).pocketed,`supported shelf ball swallowed ${p.index}`);
}
// Impacting each visible rubber tip transfers/dissipates energy, not a hidden wall.
for(const p of geometry)for(const face of p.faces){
 const q={n:1,x:face.ax-p.nx*3,y:face.ay-p.ny*3,vx:p.nx*12,vy:p.ny*12,rollVx:p.nx*12,rollVy:p.ny*12};
 const r=run(h,q,36);assert(object(r).hitRail,'visible rubber face was not collided with');
}
console.log(`PASS ${reproduced} old slow-ball failures reproduced and fixed; ${clear} clear pot paths; ${blocked} off-mouth rejections; 12 visible tip collisions`);
fs.writeFileSync(path.join(__dirname,'pocket-results.json'),JSON.stringify({reproduced,clear,blocked,results},null,2));
