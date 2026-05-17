// ── Baby Tracker Service Worker ───────────────────────────────────────────────
const DB_NAME    = 'baby_tracker_sw';
const DB_VERSION = 1;
const STORE      = 'alerts';

// ── IndexedDB helpers ─────────────────────────────────────────────────────────
function openDB(){
  return new Promise(function(resolve,reject){
    var req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=function(e){e.target.result.createObjectStore(STORE,{keyPath:'id'});};
    req.onsuccess=function(e){resolve(e.target.result);};
    req.onerror=function(e){reject(e.target.error);};
  });
}
function getAlert(){
  return openDB().then(function(db){
    return new Promise(function(resolve,reject){
      var tx=db.transaction(STORE,'readonly');
      var req=tx.objectStore(STORE).get('next');
      req.onsuccess=function(e){resolve(e.target.result||null);};
      req.onerror=function(e){reject(e.target.error);};
    });
  });
}
function clearAlert(){
  return openDB().then(function(db){
    return new Promise(function(resolve,reject){
      var tx=db.transaction(STORE,'readwrite');
      var req=tx.objectStore(STORE).delete('next');
      req.onsuccess=resolve;req.onerror=reject;
    });
  });
}

// ── Core check ────────────────────────────────────────────────────────────────
function checkAndNotify(){
  return getAlert().then(function(alert){
    if(!alert)return;
    var now=Date.now();
    if(now>=alert.nextAlertTime){
      var overMin=Math.round((now-alert.nextAlertTime)/60000);
      var body=overMin>0?alert.body+' (לפני '+overMin+' דק׳)':alert.body;
      return self.registration.showNotification('🍼 '+alert.title,{
        body:body,
        tag:'feed-alert',
        requireInteraction:true,
        actions:[{action:'ok',title:'הבנתי ✓'}]
      }).then(function(){return clearAlert();});
    }
  }).catch(function(){});
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
self.addEventListener('install',function(){self.skipWaiting();});
self.addEventListener('activate',function(e){
  e.waitUntil(clients.claim().then(checkAndNotify));
});

// Check every minute while SW is alive
setInterval(checkAndNotify,60*1000);

// Background sync (fires when network available, also keeps SW alive)
self.addEventListener('sync',function(e){
  if(e.tag==='check-feeds')e.waitUntil(checkAndNotify());
});

// Periodic background sync (Chrome 80+ — fires every ~15min even when browser closed)
self.addEventListener('periodicsync',function(e){
  if(e.tag==='check-feeds')e.waitUntil(checkAndNotify());
});

// Notification click → open app
self.addEventListener('notificationclick',function(e){
  e.notification.close();
  e.waitUntil(
    clients.matchAll({type:'window',includeUncontrolled:true}).then(function(cs){
      if(cs.length)return cs[0].focus();
      return clients.openWindow(self.registration.scope);
    })
  );
});

// Message from main page: store new alert
self.addEventListener('message',function(e){
  if(e.data&&e.data.type==='SET_ALERT'){
    openDB().then(function(db){
      var tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put({id:'next',
        nextAlertTime:e.data.nextAlertTime,
        title:e.data.title,
        body:e.data.body
      });
    }).catch(function(){});
  }
  if(e.data&&e.data.type==='CLEAR_ALERT'){clearAlert();}
});
