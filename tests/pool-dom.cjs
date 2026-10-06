const vm=require('node:vm');
module.exports=function loadFragment(fragment,options={}){
const scriptPattern=/<script>([\s\S]*?)<\/script>/g;
const scripts=[...fragment.matchAll(scriptPattern)].map(m=>m[1]);
const markup=fragment.replace(scriptPattern,'');
const elements=new Map(),all=[];
function element(tag='div',attrs={}){
 const classes=new Set((attrs.class||'').split(/\s+/));
 const listeners={};
 const ctx=new Proxy({
  createLinearGradient(){return {addColorStop(){}}},createRadialGradient(){return {addColorStop(){}}},
  createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)}},getImageData(x,y,w,h){return {data:new Uint8ClampedArray(w*h*4)}}
 },{get(target,key){return key in target?target[key]:()=>{}},set(target,key,value){target[key]=value;return true}});
 const e={tag,attrs,id:attrs.id,dataset:{},value:attrs.value||'',hidden:'hidden' in attrs,disabled:false,textContent:'',clientWidth:360,style:{setProperty(k,v){this[k]=v}},
  classList:{add(c){classes.add(c)},remove(c){classes.delete(c)},toggle(c,on){if(on)classes.add(c);else classes.delete(c)},contains(c){return classes.has(c)}},
  setPointerCapture(){},emit(name,event){for(const fn of listeners[name]||[])fn(event)},addEventListener(name,fn){(listeners[name]??=[]).push(fn)},async click(){if(this.disabled)return;const jobs=[];for(const fn of listeners.click||[])jobs.push(fn({target:this}));await Promise.all(jobs)},
  appendChild(child){all.push(child)},getContext(){return ctx},setAttribute(k,v){this.attrs[k]=v},remove(){},querySelector(sel){return elements.get(sel.slice(1))},getBoundingClientRect(){return {left:0,top:0,right:360,bottom:205,width:360,height:205}}};
 for(const [key,value] of Object.entries(attrs))if(key.startsWith('data-'))e.dataset[key.slice(5)]=value;
 return e;
}
for(const match of markup.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)){
 const attrs={};for(const a of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))attrs[a[1]]=a[2]??'';
 const e=element(match[1],attrs);all.push(e);if(e.id)elements.set(e.id,e);
}
const delayed=[],frames=[];
const document={getElementById:id=>elements.get(id),createElement:tag=>element(tag),addEventListener(){},documentElement:element('html'),
 querySelectorAll:selector=>all.filter(e=>selector==='[data-mode]'?'mode' in e.dataset:selector==='[data-difficulty]'?'difficulty' in e.dataset:false)};
const window={dispatchEvent(){},addEventListener(){},devicePixelRatio:1,matchMedia:()=>({matches:false})};
class TestAudio{constructor(src){this.src=src;this.paused=true;}async play(){this.paused=false;}pause(){this.paused=true;}}
const context={Math:options.Math||Math,Audio:TestAudio,Event,window,document,screen:{},location:{search:''},performance:options.performance||performance,console,URLSearchParams,Uint32Array,Uint8Array,Uint8ClampedArray,atob,
 requestAnimationFrame(fn){if(options.captureFrames)frames.push(fn);return 1},setTimeout(fn,ms){if(ms>=600){delayed.push(fn);return delayed.length;}return setTimeout(fn,ms);},clearTimeout(){}};
vm.createContext(context);for(const source of scripts)vm.runInContext(source,context);

return {window,document,elements,all,delayed,context,frames};
};
