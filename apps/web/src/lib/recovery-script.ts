// Inline <head> script: recovers a tab whose page files fail to load (usually an old tab after a
// deployment removed the old version's files). It runs before, and without, the app's own code,
// so it still works when that code is what failed.
//
// - Remembers where the last link click was going.
// - When a script or stylesheet from /_next/static/ fails (or the app reports a ChunkLoadError
//   through window.__uvRecover), it loads that destination (else reloads this page) with the new
//   version: at most once per page per minute, so it can never loop.
// - If that was already tried, it shows a self-styled "Reload" screen instead of leaving a blank
//   or unstyled page.

// Written as a plain string (not a function turned into text): the production minifier rewrites
// functions to use helpers from elsewhere in the bundle, which don't exist inside the page.
/** The script's source, for `<script dangerouslySetInnerHTML>`. */
export const recoveryScript = `(function(){
var KEY='universe-chunk-reload',click=null,busy=false;
addEventListener('click',function(e){var el=e.target,a=el&&el.closest?el.closest('a[href]'):null;if(a&&a.origin===location.origin&&!a.target&&!a.hasAttribute('download'))click={h:a.href,t:Date.now()};},true);
function screen(to){
  if(document.getElementById('universe-reload-screen')||!document.body)return;
  var dark=document.documentElement.classList.contains('dark')||!window.matchMedia||matchMedia('(prefers-color-scheme: dark)').matches;
  var d=document.createElement('div');d.id='universe-reload-screen';d.setAttribute('role','alertdialog');
  d.style.cssText='position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:'+(dark?'#0a0d13':'#f7f7fb');
  d.innerHTML='<div style="max-width:380px;width:100%;text-align:center;border-radius:24px;padding:32px;box-shadow:0 20px 50px rgba(0,0,0,.25);background:'+(dark?'#121622;border:1px solid rgba(255,255,255,.08)':'#fff;border:1px solid rgba(0,0,0,.08)')+'">'
    +'<div style="font-size:36px" aria-hidden="true">&#10024;</div>'
    +'<h1 style="margin:12px 0 8px;font-size:20px;color:'+(dark?'#fff':'#111')+'">UniVerse has been updated</h1>'
    +'<p style="margin:0;font-size:14px;line-height:1.6;color:#8b8b95">Reload to continue with the latest version.</p>'
    +'<button type="button" style="margin-top:22px;height:42px;padding:0 22px;border:0;border-radius:12px;background:#4f46e5;color:#fff;font-size:14px;font-weight:700;cursor:pointer">Reload</button></div>';
  d.querySelector('button').addEventListener('click',function(){try{sessionStorage.removeItem(KEY);}catch(x){}location.assign(to);});
  document.body.appendChild(d);
}
window.__uvRecover=function(){
  if(busy)return true;
  var to=click&&Date.now()-click.t<15000?click.h:location.href,last={};
  try{last=JSON.parse(sessionStorage.getItem(KEY)||'{}');}catch(x){}
  if(last.u===to&&Date.now()-(last.t||0)<60000){
    var show=function(){setTimeout(function(){screen(to);},800);};
    if(document.readyState==='complete')show();else addEventListener('load',show);
    return false;
  }
  busy=true;
  try{sessionStorage.setItem(KEY,JSON.stringify({u:to,t:Date.now()}));}catch(x){}
  if(to===location.href)location.reload();else location.assign(to);
  return true;
};
addEventListener('error',function(e){
  var t=e.target;if(!t||!t.tagName)return;
  var js=t.tagName==='SCRIPT',css=t.tagName==='LINK'&&t.rel==='stylesheet';
  if((js||css)&&String(js?t.src:t.href).indexOf('/_next/static/')>=0)window.__uvRecover();
},true);
})();`;
