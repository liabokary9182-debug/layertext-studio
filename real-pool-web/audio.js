(() => {
  'use strict';
  const startButton=document.getElementById('startBtn');
  const musicButton=document.getElementById('musicBtn');
  const musicFile=document.getElementById('musicFile');
  const musicPanel=document.getElementById('musicPanel'),musicStatus=document.getElementById('musicStatus');
  const AudioEngine=window.AudioContext||window.webkitAudioContext;
  let context=null,effects=null,limiter=null,meter=null,recordings=[],loading=null;
  let music=null,musicUrl=null,enabled=false,lastBall=0;
  const effectStats={cue:0,ball:0,rail:0,pocket:0},lastEffect={cue:-1,ball:-1,rail:-1,pocket:-1};

  function ensureContext(){
    if(!AudioEngine)return false;
    if(!context){
      context=new AudioEngine();
      limiter=context.createDynamicsCompressor();limiter.threshold.value=-15;limiter.knee.value=10;
      limiter.ratio.value=4;limiter.attack.value=.005;limiter.release.value=.12;
      meter=context.createAnalyser();meter.fftSize=1024;limiter.connect(meter);meter.connect(context.destination);
      effects=context.createGain();effects.gain.value=1.05;effects.connect(limiter);
      loading=Promise.all([1,2,3].map(async i=>{
        const response=await fetch(`./sounds/ball-clack-${i}.wav`);
        if(!response.ok)throw Error(`Pool sound ${i}: HTTP ${response.status}`);
        return context.decodeAudioData(await response.arrayBuffer());
      })).then(values=>{recordings=values;}).catch(error=>console.warn('台球录音未加载，使用柔和的合成回退音效。',error));
    }
    if(context.state==='suspended')context.resume().catch(()=>{});
    return true;
  }
  function tone(at,f0,f1,length,volume,type='sine'){
    const oscillator=context.createOscillator(),gain=context.createGain();
    oscillator.type=type;oscillator.frequency.setValueAtTime(f0,at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30,f1),at+length);
    gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),at+.003);
    gain.gain.exponentialRampToValueAtTime(.0001,at+length);
    oscillator.connect(gain);gain.connect(effects);oscillator.start(at);oscillator.stop(at+length+.01);
  }
  function recordedClack(at,weight,kind){
    if(!recordings.length)return false;
    const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();
    source.buffer=recordings[lastBall++%recordings.length];
    const rate={cue:.92,ball:.98,rail:.72,pocket:.62}[kind];
    source.playbackRate.value=rate*(1+(Math.random()-.5)*.045);
    filter.type='lowpass';filter.frequency.value={cue:1350,ball:1500,rail:850,pocket:550}[kind];
    gain.gain.value={cue:.37,ball:.34,rail:.22,pocket:.16}[kind]*(.5+.5*weight);
    source.connect(filter);filter.connect(gain);gain.connect(effects);source.start(at);
    return true;
  }
  function play(kind,impact=20){
    if(!(kind in effectStats))return;
    effectStats[kind]++;
    if(!ensureContext())return;
    const at=context.currentTime,gap=kind==='ball'?.012:kind==='rail'?.025:.02;
    if(at-lastEffect[kind]<gap)return;
    lastEffect[kind]=at;
    const weight=Math.max(.2,Math.min(1,impact/55));
    if(kind==='cue'){
      if(!recordedClack(at,weight,kind))tone(at,570,270,.067,.04+.04*weight);
      tone(at,145,90,.06,.011+.008*weight);
    }else if(kind==='ball'){
      if(!recordedClack(at,weight,kind)){
        tone(at,690,430,.065,.035+.045*weight);
        tone(at,360,210,.085,.015+.015*weight);
      }
    }else if(kind==='rail'){
      if(!recordedClack(at,weight,kind))tone(at,270,115,.09,.025+.025*weight,'triangle');
      tone(at,110,70,.09,.008+.012*weight);
    }else{
      recordedClack(at,weight,kind);
      tone(at,135,65,.2,.022+.025*weight);
      tone(at+.018,78,44,.16,.009+.012*weight);
    }
  }
  function updateMusicButton(){
    musicButton.textContent=enabled?'♫ 音乐开':'♫ 音乐关';
    musicButton.setAttribute('aria-pressed',String(enabled));
    musicButton.setAttribute('aria-label',enabled?'关闭背景音乐':'播放背景音乐');
  }
  let musicTicket=0,wanted=false,musicState='idle';
  let musicTitle='Gymnopedie No. 1',musicArtist='Kevin MacLeod';
  music=new Audio('./sounds/table-piano.mp3');music.loop=true;music.volume=.24;music.preload='auto';
  function message(text){if(musicStatus)musicStatus.textContent=text;updateMusicButton();}
  async function setMusic(on){
    const ticket=++musicTicket;wanted=on;
    if(!on){music.pause();enabled=false;musicState='paused';message('背景音乐已暂停');return;}
    try{
      musicState='loading';
      await music.play();
      if(ticket!==musicTicket){if(!wanted)music.pause();return;}
      enabled=true;musicState='playing';message(`${musicArtist} · ${musicTitle} · 本地循环播放`);
    }catch{
      if(ticket!==musicTicket)return;
      enabled=false;musicState='blocked';message('点击顶部音乐键开始播放');
    }
  }
  musicFile?.addEventListener('change',async()=>{
    const file=musicFile.files?.[0];if(!file)return;
    musicTicket++;music.pause();music.src='';
    if(musicUrl)URL.revokeObjectURL(musicUrl);
    musicUrl=URL.createObjectURL(file);music.src=musicUrl;musicTitle=file.name;musicArtist='本机音频';
    await setMusic(true);
  });
  musicButton.addEventListener('click',()=>{ensureContext();return setMusic(!wanted);});
  document.getElementById('closeMusic')?.addEventListener('click',()=>{musicPanel.hidden=true;});
  document.getElementById('localMusicBtn')?.addEventListener('click',()=>musicFile?.click());
  document.addEventListener('pointerdown',e=>{
    ensureContext();
    if(e.target?.id!=='musicBtn')setMusic(true);
  },{once:true});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){context?.suspend();music.pause();}
    else{context?.resume().catch(()=>{});if(wanted)setMusic(true);}
  });
  window.PoolAudio={play,unlock:ensureContext,stats:effectStats,contextState:()=>context?.state||'unavailable',
    samplesReady:()=>recordings.length===3,waitForSamples:()=>loading||Promise.resolve(),
    outputLevel:()=>{if(!meter)return 0;const samples=new Float32Array(meter.fftSize);meter.getFloatTimeDomainData(samples);return Math.sqrt(samples.reduce((sum,v)=>sum+v*v,0)/samples.length);},
    setMusic,musicEnabled:()=>enabled,musicInfo:()=>({source:musicUrl?'local-import':'bundled-local',state:musicState,title:musicTitle,artist:musicArtist})};
  message('Gymnopedie No. 1 · Kevin MacLeod · CC BY 4.0 · 本地音频');
})();
