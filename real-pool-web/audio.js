(() => {
  'use strict';
  const startButton=document.getElementById('startBtn');
  const musicButton=document.getElementById('musicBtn');
  const musicFile=document.getElementById('musicFile');
  const musicPanel=document.getElementById('musicPanel'),musicFrame=document.getElementById('musicFrame'),musicStatus=document.getElementById('musicStatus');
  const AudioEngine=window.AudioContext||window.webkitAudioContext;
  let context=null,effects=null,limiter=null,meter=null,recordings=[],loading=null;
  let music=null,musicUrl=null,enabled=false,lastBall=0;
  let widget=null,widgetLoading=null,wanted=false,onlineReady=false,musicPosition=0,musicState='idle';
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
    musicButton.textContent=enabled?'♫ Lullaby 开':musicState==='loading'?'♫ 音乐加载中':'♫ Lullaby 关';
    musicButton.setAttribute('aria-pressed',String(enabled));
    musicButton.title=music?'开关本机导入的音频':'Enzalla · Lullaby，点击开关背景音乐';
  }
  function musicMessage(state,text){musicState=state;musicStatus.textContent=text;updateMusicButton();}
  function loadOnlineMusic(){
    if(onlineReady&&widget)return Promise.resolve(widget);
    if(widgetLoading)return widgetLoading;
    musicMessage('loading','正在连接 Enzalla 的官方播放器…');
    widgetLoading=new Promise((resolve,reject)=>{
      const api=document.createElement('script');api.src='https://w.soundcloud.com/player/api.js?v=1';api.async=true;
      let timeout=setTimeout(()=>reject(Error('播放器连接超时')),30000);
      api.onerror=()=>{clearTimeout(timeout);reject(Error('播放器暂时无法连接'));};
      api.onload=()=>{
        clearTimeout(timeout);timeout=setTimeout(()=>reject(Error('播放器连接超时')),30000);
        musicFrame.src='https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fenzalla%2Flullaby&auto_play=false&color=%2310628e&show_artwork=false&show_comments=false&show_playcount=false&sharing=false';
        widget=window.SC.Widget(musicFrame);const events=window.SC.Widget.Events;
        widget.bind(events.READY,()=>{
          clearTimeout(timeout);onlineReady=true;widget.setVolume(35);
          widget.getCurrentSound(sound=>{musicFrame.title=`${sound.user.username} · ${sound.title}`;});
          if(!music)musicMessage('ready','Enzalla · Lullaby · 官方在线播放');resolve(widget);
        });
        widget.bind(events.PLAY,()=>{if(music){widget.pause();return;}enabled=true;wanted=true;musicMessage('playing','正在播放 Enzalla · Lullaby');});
        widget.bind(events.PAUSE,()=>{if(music)return;enabled=false;musicMessage('paused','Enzalla · Lullaby · 已暂停');});
        widget.bind(events.PLAY_PROGRESS,event=>{musicPosition=event.currentPosition;});
        widget.bind(events.FINISH,()=>{if(wanted&&!music){widget.seekTo(0);widget.play();}});
        widget.bind(events.ERROR,()=>{if(music)return;enabled=false;wanted=false;musicPanel.hidden=false;musicMessage('error','官方播放器暂不可用，可稍后重试或导入本机音频。');});
      };
      document.head.appendChild(api);
    }).catch(error=>{widgetLoading=null;if(!music){enabled=false;wanted=false;musicPanel.hidden=false;musicMessage('error',`${error.message}，可使用下方播放键或本机音频。`);}return null;});
    return widgetLoading;
  }
  async function setMusic(on){
    wanted=on;
    if(!music){
      if(!on){widget?.pause();enabled=false;updateMusicButton();return;}
      const player=await loadOnlineMusic();if(!player||!wanted||music)return;
      player.play();
      setTimeout(()=>{if(wanted&&!enabled&&!music){musicPanel.hidden=false;musicMessage('ready','点播放器的播放键即可开启音乐。');}},2500);
      return;
    }
    if(on){try{await music.play();enabled=true;}catch{enabled=false;}}
    else{music.pause();enabled=false;}
    updateMusicButton();
  }
  musicFile.addEventListener('change',async()=>{
    const file=musicFile.files?.[0];if(!file)return;
    wanted=false;widget?.pause();
    if(music){music.pause();music.src='';}
    if(musicUrl)URL.revokeObjectURL(musicUrl);
    musicUrl=URL.createObjectURL(file);music=new Audio(musicUrl);music.loop=true;music.volume=.45;
    await setMusic(true);
  });
  musicButton.addEventListener('click',()=>{const on=musicState==='loading'?!wanted:!enabled;if(on)musicPanel.hidden=false;setMusic(on);});
  document.getElementById('closeMusic').addEventListener('click',()=>{musicPanel.hidden=true;});
  document.getElementById('localMusicBtn').addEventListener('click',()=>musicFile.click());
  startButton.addEventListener('click',()=>{ensureContext();setMusic(true);});
  document.addEventListener('pointerdown',ensureContext,{once:true});
  document.addEventListener('visibilitychange',()=>{
    if(!context)return;
    if(document.hidden)context.suspend();else context.resume().catch(()=>{});
  });
  window.PoolAudio={play,unlock:ensureContext,stats:effectStats,contextState:()=>context?.state||'unavailable',
    samplesReady:()=>recordings.length===3,waitForSamples:()=>loading||Promise.resolve(),
    outputLevel:()=>{if(!meter)return 0;const samples=new Float32Array(meter.fftSize);meter.getFloatTimeDomainData(samples);return Math.sqrt(samples.reduce((sum,v)=>sum+v*v,0)/samples.length);},
    musicEnabled:()=>enabled,musicInfo:()=>({source:music?'local':'SoundCloud',state:musicState,ready:onlineReady,position:musicPosition,title:'Lullaby',artist:'Enzalla'})};
  updateMusicButton();
})();
