const assert=require('node:assert/strict'),path=require('node:path');const{loadGame}=require('./ai-harness.cjs');const h=loadGame(path.resolve(__dirname,'../real-pool-web/game.js'));
const energy=b=>b.vx*b.vx+b.vy*b.vy+.4*((b.rollVx||0)**2+(b.rollVy||0)**2+(b.spin||0)**2);
for(const spin of [-30,-12,12,30])for(const [nx,ny] of [[0,1],[0,-1],[1,0],[-1,0]]){
 const tx=-ny,ty=nx,entry={vx:-24*nx+18*tx,vy:-24*ny+18*ty,rollVx:-24*nx+18*tx,rollVy:-24*ny+18*ty,spin};
 const b=h.cushion(entry,nx,ny);assert(b.vx*nx+b.vy*ny>0);assert(energy(b)<=energy(entry)+1e-8,'cushion creates energy');
}
const left=h.cushion({vx:18,vy:-24,spin:-22,rollVx:18,rollVy:-24},0,1),right=h.cushion({vx:18,vy:-24,spin:22,rollVx:18,rollVy:-24},0,1);assert(Math.abs(left.vx-right.vx)>2,'opposite English has no rebound effect');
const positions=[];
for(const spinY of [-.85,0,.85]){
 const r=h.trace([{n:0,x:40,y:25},{n:1,x:55,y:25}],{aim:0,power:70,spinY});
 const hit=r.samples.findIndex(s=>s.balls.find(b=>b.n===1).x>55.001);assert(hit>=0);positions.push(r.samples[hit+90].balls.find(b=>b.n===0).x);
}
assert(positions[0]<positions[1]-3,'draw fails to pull back after head-on hit');assert(positions[2]>positions[1]+3,'follow fails to advance after head-on hit');
console.log(`PASS cushion energy/rebound across 16 spin cases; opposite English; draw/centre/follow x=${positions.map(x=>x.toFixed(2)).join('/')}`);
