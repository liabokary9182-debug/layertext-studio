(() => {
  'use strict';
  const startButton=document.getElementById('startBtn');
  const musicButton=document.getElementById('musicBtn');
  const AudioEngine=window.AudioContext||window.webkitAudioContext;
  let context=null,master=null,effects=null,limiter=null,meter=null,noiseBuffer=null,enabled=false,loop=null,nextBeat=0,beat=0;
  const effectStats={cue:0,ball:0,rail:0,pocket:0},lastEffect={cue:-1,ball:-1,rail:-1,pocket:-1};
  const interval=.46;
  // Original Lullaby-style melody, generated in-browser without an external recording.
  const melody=[659.25,783.99,880,783.99,659.25,587.33,523.25,0,
    587.33,659.25,783.99,659.25,587.33,523.25,493.88,0,
    523.25,659.25,783.99,659.25,587.33,523.25,440,0,
    493.88,587.33,659.25,587.33,523.25,493.88,392,0];
  const chords=[[261.63,329.63,392],[220,261.63,329.63],[174.61,261.63,349.23],[196,246.94,392]];
  function ensureContext(){
    if(!AudioEngine)return false;
    if(!context){
      context=new AudioEngine();
      limiter=context.createDynamicsCompressor();limiter.threshold.value=-12;limiter.knee.value=12;
      limiter.ratio.value=6;limiter.attack.value=.004;limiter.release.value=.13;
      meter=context.createAnalyser();meter.fftSize=1024;limiter.connect(meter);meter.connect(context.destination);
      master=context.createGain();master.gain.value=0;master.connect(limiter);
      effects=context.createGain();effects.gain.value=1.7;effects.connect(limiter);
      noiseBuffer=context.createBuffer(1,Math.round(context.sampleRate*.24),context.sampleRate);
      const samples=noiseBuffer.getChannelData(0);let seed=19731;
      for(let i=0;i<samples.length;i++){seed=(seed*1664525+1013904223)>>>0;samples[i]=(seed/2147483648-1)*Math.exp(-i/samples.length*2);}
    }
    if(context.state==='suspended')context.resume().catch(()=>{});
    return true;
  }
  function tone(at,f0,f1,length,volume,type='sine'){
    const oscillator=context.createOscillator(),gain=context.createGain();
    oscillator.type=type;oscillator.frequency.setValueAtTime(f0,at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30,f1),at+length);
    gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),at+.004);
    gain.gain.exponentialRampToValueAtTime(.0001,at+length);
    oscillator.connect(gain);gain.connect(effects);oscillator.start(at);oscillator.stop(at+length+.01);
  }
  function rustle(at,length,volume,cutoff){
    const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();
    source.buffer=noiseBuffer;filter.type='lowpass';filter.frequency.value=cutoff;
    gain.gain.setValueAtTime(Math.max(.0002,volume),at);
    gain.gain.exponentialRampToValueAtTime(.0001,at+length);
    source.connect(filter);filter.connect(gain);gain.connect(effects);source.start(at);source.stop(at+length+.005);
  }
  function play(kind,impact=20){
    if(!(kind in effectStats))return;
    effectStats[kind]++;
    if(!ensureContext())return;
    const at=context.currentTime,gap=kind==='ball'?.009:kind==='rail'?.025:.02;
    if(at-lastEffect[kind]<gap)return;
    lastEffect[kind]=at;
    const weight=Math.max(.25,Math.min(1,impact/55));
    if(kind==='cue'){
      tone(at,980,390,.105,.08+.09*weight,'triangle');
      rustle(at,.045,.027+.025*weight,3000);
    }else if(kind==='ball'){
      tone(at,1750,710,.088,.092+.17*weight,'sine');
      tone(at,890,370,.061,.03+.06*weight,'triangle');
      rustle(at,.024,.013+.019*weight,4200);
    }else if(kind==='rail'){
      tone(at,470,155,.13,.055+.09*weight,'triangle');
      rustle(at,.062,.018+.028*weight,1300);
    }else{
      tone(at,260,80,.22,.09+.12*weight,'sine');
      rustle(at,.18,.045+.06*weight,700);
    }
  }
  window.PoolAudio={play,unlock:ensureContext,stats:effectStats,contextState:()=>context?.state||'unavailable',
    outputLevel:()=>{if(!meter)return 0;const samples=new Float32Array(meter.fftSize);meter.getFloatTimeDomainData(samples);return Math.sqrt(samples.reduce((sum,v)=>sum+v*v,0)/samples.length);},
    musicEnabled:()=>enabled};
  function voice(frequency,at,length,volume,type='sine'){
    const oscillator=context.createOscillator(),gain=context.createGain();
    oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,at);
    gain.gain.setValueAtTime(.0001,at);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),at+.035);
    gain.gain.exponentialRampToValueAtTime(.0001,at+length);
    oscillator.connect(gain);gain.connect(master);
    oscillator.start(at);oscillator.stop(at+length+.03);
  }
  function schedule(){
    if(!enabled||!context)return;
    while(nextBeat<context.currentTime+.5){
      const note=melody[beat%melody.length];
      if(note){voice(note,nextBeat,.82,.065);voice(note/2,nextBeat,.9,.022,'triangle');}
      if(beat%8===0){for(const frequency of chords[Math.floor(beat/8)%chords.length])voice(frequency/2,nextBeat,interval*7.7,.014,'triangle');}
      nextBeat+=interval;beat++;
    }
  }
  async function setMusic(on){
    if(on&&!AudioEngine){musicButton.textContent='♫ 不支持音频';musicButton.disabled=true;return;}
    if(on){
      if(!ensureContext())return;
      try{await context.resume();}catch{return;}
      enabled=true;master.gain.setTargetAtTime(1,context.currentTime,.07);nextBeat=context.currentTime+.05;
      if(!loop)loop=window.setInterval(schedule,120);
      schedule();
    }else{enabled=false;if(master)master.gain.setTargetAtTime(0,context.currentTime,.05);}
    musicButton.textContent=enabled?'♫ Lullaby 开':'♫ Lullaby 关';
    musicButton.setAttribute('aria-pressed',String(enabled));
  }
  startButton.addEventListener('click',()=>setMusic(true));
  musicButton.addEventListener('click',()=>setMusic(!enabled));
  document.addEventListener('pointerdown',()=>ensureContext(),{once:true});
  document.addEventListener('visibilitychange',()=>{
    if(!context)return;
    if(document.hidden)context.suspend();else{context.resume().then(()=>{if(enabled){nextBeat=context.currentTime+.05;schedule();}}).catch(()=>{});}
  });
})();
