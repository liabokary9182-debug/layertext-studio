const fs=require('node:fs'),assert=require('node:assert/strict');
const {window,document,elements,delayed}=require('./pool-dom.cjs')(fs.readFileSync(process.argv[2] || '/workspace/mobile-pool-preview.html','utf8'));
(async()=>{
 if(elements.has('landscapeBtn')){
 const root=elements.get('mobile-pool-preview'),button=elements.get('landscapeBtn');
 assert.equal(root.classList.contains('is-landscape'),false);
 await button.click();assert.equal(root.classList.contains('is-landscape'),true);
 assert.equal(button.attrs['aria-pressed'],'true');assert.equal(root.style['--landscape-height'],'360px');
 assert.equal(root.style['--landscape-width'],'666px');assert.match(button.textContent,/竖屏/);
 window.__poolTest.setSpinAim();
 const game=elements.get('game');
 game.getBoundingClientRect=()=>({left:10,top:20,right:405,bottom:720,width:395,height:700});
 // World (70,35) maps to logical canvas (924,507), then clockwise display.
 game.emit('pointerdown',{pointerId:1,clientX:151.5,clientY:482});
 let aimed=JSON.parse(window.render_game_to_text());assert.equal(aimed.aimDegrees,18.43);
 const pad=elements.get('spinPad');pad.getBoundingClientRect=()=>({left:10,top:20,right:70,bottom:80,width:60,height:60});
 pad.emit('pointerdown',{pointerId:1,clientX:55,clientY:65});
 assert.deepEqual(JSON.parse(window.render_game_to_text()).spin,[0.5,0.5]);
 const before=window.render_game_to_text();
 await button.click();assert.equal(root.classList.contains('is-landscape'),false);assert.match(button.textContent,/横屏/);
 assert.equal(window.render_game_to_text(),before,'orientation must preserve game state');
 console.log('PASS rotated touch coordinates for aim/spin; switching preserves game state');
 console.log('PASS landscape button toggles dimensions, pressed state, and return label');
 }
 if(elements.has('fullscreenFeedback')){
 const root=elements.get('mobile-pool-preview'),button=elements.get('fullBtn'),feedback=elements.get('fullscreenFeedback');
 const before=window.render_game_to_text();
 await button.click();assert.equal(feedback.hidden,false);assert.match(feedback.textContent,/不允许系统全屏/);assert.equal(button.disabled,false);
 root.requestFullscreen=async()=>{document.fullscreenElement=root};
 document.exitFullscreen=async()=>{document.fullscreenElement=null};
 await button.click();assert.equal(document.fullscreenElement,root);assert.equal(button.attrs['aria-pressed'],'true');assert.equal(feedback.hidden,true);assert.match(button.textContent,/退出全屏/);
 await button.click();assert.equal(document.fullscreenElement,null);assert.equal(button.attrs['aria-pressed'],'false');assert.match(button.textContent,/全屏/);
 root.requestFullscreen=async()=>{throw new Error('Permissions policy rejected')};
 await button.click();assert.equal(feedback.hidden,false);assert.equal(button.attrs['aria-pressed'],'false');assert.equal(button.disabled,false);
 assert.equal(window.render_game_to_text(),before,'fullscreen must preserve game state');
 console.log('PASS fullscreen enter/exit, unavailable/rejected requests, and preserved game state');
 }
 if(elements.get('aiTestOverlay').classList.contains('hidden'))await elements.get('aiTestsBtn').click();
 if(window.PoolAudio?.setMusic){
  await elements.get('musicBtn').click();assert.equal(window.PoolAudio.musicEnabled(),true);assert.match(window.PoolAudio.musicInfo().title,/Gymnopedie/);
  await elements.get('musicBtn').click();assert.equal(window.PoolAudio.musicEnabled(),false);
  console.log('PASS bundled local music can play and pause through visible button');
 }
 assert.equal(elements.get('aiTestOverlay').classList.contains('hidden'),false,'scene chooser must be visible');
 elements.get('aiTestScene').value='narrow-escape';elements.get('aiTestDifficulty').value='hard';
 await elements.get('runAITest').click();
 let state=JSON.parse(window.render_game_to_text());assert.equal(state.aiPlan.target,1);assert.equal(state.phase,'aim');
 delayed.pop()();state=JSON.parse(window.render_game_to_text());assert.equal(state.phase,'moving');
 window.advanceTime(30000);state=JSON.parse(window.render_game_to_text());
 assert.equal(state.phase==='aim'||state.phase==='gameover',true);assert(!state.aiThinking);
 console.log('PASS mobile preview starts, scenario button plans and shoots, live shot completes with current difficulty and rules');
})().catch(e=>{console.error(e);process.exitCode=1;});
