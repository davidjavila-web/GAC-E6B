const CACHE='e6b-v12';
const ASSETS=['/','/index.html','/manifest.json','/icon-192.png','/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',e=>{e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(nr=>{if(nr.ok&&e.request.method==='GET'){const c=nr.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c));}return nr;}).catch(()=>caches.match('/index.html'))));});
