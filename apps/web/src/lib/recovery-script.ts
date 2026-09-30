// Inline <head> script: recovers a tab whose page files fail to load (usually an old tab after a
// deployment removed the old version's files). It runs before, and without, the app's own code,
// so it still works when that code is what failed.
//
// - Remembers where the last link click was going.
// - When a script or stylesheet from /_next/static/ fails (or the app reports a ChunkLoadError
//   through window.__uvRecover), it loads that destination (else reloads this page) with the new
//   version. If that fails too, it tries once more past any saved copy (a one-off ?__uv= address,
//   removed again on arrival). A page from an older version than one this browser has already
//   loaded (remembered per build in localStorage) gets an extra try. Counted per page per minute,
//   so it can never loop.
// - If those were already tried, it shows a self-styled "Reload" screen instead of leaving a blank
//   or unstyled page.
// - A page brought back by back/forward from before an update reloads to the current version.
// - Blank-page guard: a few seconds after the page loads (or comes back from the back/forward
//   cache), if it shows no text at all or its styles never arrived, it reports it (owner console →
//   Errors) and recovers the same way. This turns "white screen until I refresh" into an automatic
//   refresh, whatever caused it.

// Written as a plain string (not a function turned into text): the production minifier rewrites
// functions to use helpers from elsewhere in the bundle, which don't exist inside the page.
/** The script's source, for `<script dangerouslySetInnerHTML>`. */
export const recoveryScript = `(function(){
var KEY='universe-chunk-reload',BKEY='universe-builds',click=null,busy=false;
if(/[?&]__uv=/.test(location.search)){try{var q=new URL(location.href);q.searchParams.delete('__uv');history.replaceState(history.state,'',q.pathname+q.search+q.hash);}catch(x){}}
function build(){var s=document.querySelector('script[src*="/_next/static/chunks/webpack-"]');return s?s.getAttribute('src'):'';}
function builds(){try{return JSON.parse(localStorage.getItem(BKEY)||'{}')||{};}catch(x){return {};}}
function newest(){var b=builds(),k='',t=0;for(var h in b){if(b[h]>t){t=b[h];k=h;}}return k;}
function outdated(){var m=build(),n=newest();return !!m&&!!n&&m!==n;}
function seen(){var m=build();if(!m)return;var b=builds();if(b[m])return;b[m]=Date.now();var o={};Object.keys(b).sort(function(x,y){return b[y]-b[x];}).slice(0,5).forEach(function(k){o[k]=b[k];});try{localStorage.setItem(BKEY,JSON.stringify(o));}catch(x){}}
if(document.readyState==='loading')addEventListener('DOMContentLoaded',seen);else seen();
function fresh(to){try{var u=new URL(to,location.href);u.searchParams.set('__uv',Date.now().toString(36));return u.href;}catch(x){return to;}}
addEventListener('click',function(e){var el=e.target,a=el&&el.closest?el.closest('a[href]'):null;if(a&&a.origin===location.origin&&!a.target&&!a.hasAttribute('download'))click={h:a.href,t:Date.now()};},true);
function screen(to){
  if(document.getElementById('universe-reload-screen')||!document.body)return;
  var dark=document.documentElement.classList.contains('dark')||!window.matchMedia||matchMedia('(prefers-color-scheme: dark)').matches;
  var d=document.createElement('div');d.id='universe-reload-screen';d.setAttribute('role','alertdialog');
  d.style.cssText='position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:'+(dark?'#0a0d13':'#f7f7fb');
  d.innerHTML='<div style="max-width:380px;width:100%;text-align:center;border-radius:24px;padding:32px;box-shadow:0 20px 50px rgba(0,0,0,.25);background:'+(dark?'#121622;border:1px solid rgba(255,255,255,.08)':'#fff;border:1px solid rgba(0,0,0,.08)')+'">'
    +'<div style="font-size:36px" aria-hidden="true">&#10024;</div>'
    +'<h1 style="margin:12px 0 8px;font-size:20px;color:'+(dark?'#fff':'#111')+'">This page needs a reload</h1>'
    +'<p style="margin:0;font-size:14px;line-height:1.6;color:#8b8b95">It didn&#39;t finish loading, or UniVerse was just updated. Reload to continue.</p>'
    +'<button type="button" style="margin-top:22px;height:42px;padding:0 22px;border:0;border-radius:12px;background:#4f46e5;color:#fff;font-size:14px;font-weight:700;cursor:pointer">Reload</button></div>';
  d.querySelector('button').addEventListener('click',function(){try{sessionStorage.removeItem(KEY);}catch(x){}location.assign(fresh(to));});
  document.body.appendChild(d);
}
window.__uvRecover=function(){
  if(busy)return true;
  var to=click&&Date.now()-click.t<15000?click.h:location.href,last={};
  try{last=JSON.parse(sessionStorage.getItem(KEY)||'{}');}catch(x){}
  var n=last.u===to&&Date.now()-(last.t||0)<60000?(last.n||1):0;
  // A copy of an older version (an old tab, or one brought back with the back button) can always
  // move to the new one. The current version gets a plain retry, then one past any saved copy.
  if(n>=(outdated()?3:2)){
    var show=function(){setTimeout(function(){screen(to);},800);};
    if(document.readyState==='complete')show();else addEventListener('load',show);
    return false;
  }
  busy=true;
  try{sessionStorage.setItem(KEY,JSON.stringify({u:to,t:Date.now(),n:n+1}));}catch(x){}
  if(n>=1)location.assign(fresh(to));else if(to===location.href)location.reload();else location.assign(to);
  return true;
};
function blank(){
  var b=document.body;if(!b)return 'no page body';
  if(document.getElementById('universe-reload-screen'))return '';
  var css=document.querySelectorAll('link[rel="stylesheet"]');
  for(var i=0;i<css.length;i++){if(!css[i].sheet&&!css[i].disabled&&String(css[i].href).indexOf('/_next/static/')>=0)return 'styles did not load';}
  return (b.innerText||'').replace(/\\s+/g,'').length<2?'nothing on screen':'';
}
function guard(ms){
  setTimeout(function(){
    if(document.visibilityState==='hidden')return;
    var why=blank();if(!why)return;
    try{navigator.sendBeacon('/api/errors',new Blob([JSON.stringify({errors:[{kind:'render',message:'Blank page: '+why,path:location.pathname}]})],{type:'application/json'}));}catch(x){}
    click=null;window.__uvRecover();
  },ms);
}
if(document.readyState==='complete')guard(4000);else addEventListener('load',function(){guard(4000);});
setTimeout(function(){if(document.readyState!=='complete')guard(0);},20000);
// Back/forward brought back a page from before an update: load the current version instead.
addEventListener('pageshow',function(e){if(!e.persisted)return;if(outdated()){location.reload();return;}guard(2500);});
addEventListener('error',function(e){
  var t=e.target;if(!t||!t.tagName)return;
  var js=t.tagName==='SCRIPT',css=t.tagName==='LINK'&&t.rel==='stylesheet';
  if((js||css)&&String(js?t.src:t.href).indexOf('/_next/static/')>=0)window.__uvRecover();
},true);
})();`;
