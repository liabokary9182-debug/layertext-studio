from pathlib import Path
import re, json, base64, sys

root=Path(__file__).resolve().parents[1]
site=root/'real-pool-web'
base=(root/'tests/phone-preview-template.html').read_text()
scripts=re.findall(r'<script>(.*?)</script>',base,re.S)
assert len(scripts)==3
game=(site/'game.js').read_text()
game=game.replace("const sideways=()=>window.matchMedia('(orientation: portrait) and (max-width: 700px)').matches;", "const sideways=()=>document.getElementById('mobile-pool-preview').classList.contains('is-landscape');")
game=game.replace("if(new URLSearchParams(location.search).has('test')){","if(true){",1)
game=game.replace("if(state.opponent!=='ai'||state.turn!==1||state.phase!=='aim')return;", "if(window.POOL_PREVIEW_SINGLE_SHOT||state.opponent!=='ai'||state.turn!==1||state.phase!=='aim')return;",1)
game,n=re.subn(r'  async function fullscreen\(\)\{.*?\n  \}',"  async function fullscreen(){await window.PoolPreviewFullscreen?.toggle();\n  }",game,count=1,flags=re.S)
assert n==1
audio=(site/'audio.js').read_text()
samples=[base64.b64encode((site/f'sounds/ball-clack-{i}.wav').read_bytes()).decode() for i in [1,2,3]]
start=audio.index('      loading=Promise.all(')
end=audio.index('      })).then(values',start)
audio=audio[:start]+'''      loading=Promise.all('''+json.dumps(samples)+'''.map(async sample=>{
        const bytes=Uint8Array.from(atob(sample),c=>c.charCodeAt(0));
        return context.decodeAudioData(bytes.buffer);
'''+audio[end:]
music='data:audio/mpeg;base64,'+base64.b64encode((site/'sounds/piano-preview.mp3').read_bytes()).decode()
audio=audio.replace("'./sounds/table-piano.mp3'",json.dumps(music))
audio=audio.replace("let musicTitle='Gymnopedie No. 1'", "let musicTitle='Gymnopedie No. 1（40秒试听）'")
controls=scripts[2]
fixtures_match=re.search(r'const fixtures=(\[.*?\]);',controls,re.S)
fixtures=json.loads(fixtures_match.group(1))
fixtures.append({'name':'position-nine','label':'大师杆法与下一球走位','entries':[{'n':0,'x':50,'y':25},{'n':1,'x':50,'y':10},{'n':2,'x':72,'y':20},{'n':9,'x':82,'y':37}]})
fixtures.extend([
 {'name':'pocket-slow-corner','label':'角袋慢球 · 检查停在袋内','pocketTest':[0,0,6,False]},
 {'name':'pocket-slow-side','label':'中袋慢球 · 检查落袋','pocketTest':[1,0,6,False]},
 {'name':'pocket-cut-side','label':'中袋 30° 切入','pocketTest':[1,30,16,False]},
 {'name':'pocket-miss-side','label':'打偏袋口 · 检查反弹','pocketTest':[1,0,8,True]}
 ,{'name':'master-bank','label':'大师翻袋专项','technique':'bank','entries':[{'n':0,'x':40,'y':25},{'n':1,'x':62,'y':18},{'n':9,'x':82,'y':37}]}
 ,{'name':'master-kick','label':'大师勾球进袋 · 有挡球','technique':'kick','entries':[{'n':0,'x':25,'y':25},{'n':1,'x':50,'y':10},{'n':2,'x':38,'y':18},{'n':9,'x':80,'y':38}]}
 ,{'name':'master-snooker','label':'大师做斯诺克 · 高杆加塞','technique':'snooker','mode':'eight','group':'solid','entries':[{'n':0,'x':50,'y':25},{'n':1,'x':35,'y':25},{'n':2,'x':62,'y':25},{'n':9,'x':85,'y':25},{'n':8,'x':20,'y':42}]}

])
controls=controls[:fixtures_match.start(1)]+json.dumps(fixtures,ensure_ascii=False)+controls[fixtures_match.end(1):]
controls=controls.replace('const expected={', "const expected={\n    'position-nine':'选择大师：观察进 1 号后的白球落点，以及下一杆打 2 号的角度。',")
controls=controls.replace('const expected={', "const expected={\n    'pocket-slow-corner':'无遮挡的角袋慢球应落袋。',\n    'pocket-slow-side':'无遮挡的中袋慢球应落袋。',\n    'pocket-cut-side':'检查斜入袋，目标球应落入上中袋。',\n    'pocket-miss-side':'球路打偏了袋口，应碰库反弹，不能自动吸入。',")
controls=controls.replace("window.PoolAudio?.unlock();", "window.PoolAudio?.unlock();\n      if(fixture.pocketTest){window.__poolTest.pocketRollingTest(...fixture.pocketTest);return;}")
controls=controls.replace("const update=()=>{expectation.textContent=expected[scene.value];};", "const update=()=>{expectation.textContent=expected[scene.value];run.textContent=scene.value.startsWith('pocket-')?'运行袋口试球':'观察电脑出杆';};")
controls=controls.replace('const expected={', "const expected={\n    'master-bank':'选择大师：观察目标球先碰库再进袋，以及低杆控白球。',\n    'master-kick':'选择大师：观察白球绕过挡球先碰下库，再合法打进 1 号。',\n    'master-snooker':'选择大师：观察高杆加塞后藏白球，遮住对手中心及边缘首碰线。',")
controls=controls.replace("document.getElementById('aiTestDifficulty').value);", "fixture.technique?'hard':document.getElementById('aiTestDifficulty').value,fixture.technique||null);")
controls=controls.replace("run.disabled=true;overlay.classList.add('hidden');", "if(fixture.technique)document.getElementById('aiTestDifficulty').value='hard';run.disabled=true;overlay.classList.add('hidden');")
controls=controls.replace("scene.value='narrow-escape'", "scene.value='master-kick'")
controls=controls.replace("mobilePoolRoot.querySelector('#aiTestOverlay').classList.remove('hidden');", "mobilePoolRoot.querySelector('#aiTestOverlay').classList.add('hidden');\nwindow.__poolTest.openTestMatch('eight');")
controls=controls.replace("first hit", "first contact")
clock_start=controls.index('  // Only the standalone review file uses manual time')
clock_end=controls.index('})();',clock_start)
controls=controls[:clock_start]+controls[clock_end:]
for old,new in zip(scripts,[game,audio,controls]):
    base=base.replace('<script>'+old+'</script>','<script>\n'+new+'\n</script>',1)
index=(site/'index.html').read_text()
new_rules=re.search(r'<div class="overlay hidden" id="rulesOverlay">.*?</div></div>',index,re.S).group(0)
base=re.sub(r'<div class="overlay hidden" id="rulesOverlay">.*?</div></div>',lambda _:new_rules,base,count=1,flags=re.S)
base=base.replace('♫ Lullaby 关','♫ 音乐关').replace('切换 Lullaby 背景音乐','切换本地背景音乐').replace('98.3 mm','100.3 mm')
base=base.replace('</style>','#mobile-pool-preview #musicBtn{display:inline-flex!important;min-height:44px;align-items:center;justify-content:center}\n</style>',1)
assert len(base.encode())<1000000
assert not re.search(r'\b(fetch|XMLHttpRequest|WebSocket)\s*\(',base)
assert not re.search(r'<(?:!doctype|html|head|body)\b',base,re.I)
assert len(re.findall(r'<script>',base))==3
path=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/workspace/pool-master-tactics-preview.html')
path.write_text(base)
print('Created',path,'bytes',path.stat().st_size)
