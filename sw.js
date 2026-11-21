const CACHE='wochenplanung-ipad-v5';
const ASSETS=['./','./index.html','./style.css','./app.js','./pdf.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(name=>name.startsWith('wochenplanung-ipad-')&&name!==CACHE).map(name=>caches.delete(name)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
 // Fresh files when online, installed app remains usable offline.
 event.respondWith(fetch(req).then(res=>{
   if(res.ok){const copy=res.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{}));}
   return res;
 }).catch(async()=>{
   const cache=await caches.open(CACHE);
   return await cache.match(req,{ignoreSearch:true})||await cache.match('./index.html')||Response.error();
 }));
});
