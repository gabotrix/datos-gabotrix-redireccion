/* Service worker de "Visita post-sismo".
   Guarda la aplicación entera la primera vez que se abre con señal; a partir de
   ahí arranca sin red. Los datos de las visitas no pasan por aquí: viven en
   IndexedDB, que ya funciona sin conexión por su cuenta.

   Se sirve junto a visita.html desde un servidor propio (https o localhost).
   Al publicar una versión nueva, subir CACHE para que se reemplace la vieja. */

var CACHE = 'psismo-v81-dominio-viejo';
// informe.js va aquí y no solo en la red: el informe del predio se arma al cerrar la visita,
// que es cuando menos señal hay. addAll es todo o nada, así que o entran los dos o se queda
// la versión anterior completa.
// La librería del PDF (html2canvas) también: el informe se descarga como archivo al cerrar la visita,
// sin señal, y sin ella caería a la vista de impresión. No va en IMPRESCINDIBLES: sin ella la
// aplicación abre igual y el informe sigue saliendo por la vista de impresión.
var ARCHIVOS = ['./', './visita.html', './informe.js', './manifest.webmanifest', './vendor/html2canvas.min.js'];
// Sin estos dos la aplicación no abre sin señal: la caché vieja no se borra hasta que la nueva los tenga.
var IMPRESCINDIBLES = ['./visita.html', './informe.js'];

// Sin .catch a propósito. Antes se tragaba el error y la instalación se daba por buena aunque una
// descarga se hubiera cortado: el SW nuevo se activaba, borraba la caché anterior y dejaba la nueva
// vacía, y la siguiente vez que el ingeniero abría la app sin señal no abría. Si waitUntil rechaza,
// el navegador descarta este SW, se queda con el anterior y su caché completa, y lo reintenta en la
// próxima carga con señal.
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ARCHIVOS); })
      .then(function () { return self.skipWaiting(); })
  );
});

// Segunda defensa: las cachés viejas se borran solo si la nueva tiene lo imprescindible. Mientras
// sigan ahí, el respaldo sin red (caches.match mira en todas) sirve la versión anterior.
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(IMPRESCINDIBLES.map(function (u) { return c.match(u); }));
    }).then(function (hay) {
      var completa = hay.every(function (x) { return !!x; });
      return caches.keys().then(function (ks) {
        return Promise.all(ks.map(function (k) {
          return (k === CACHE || !completa) ? null : caches.delete(k);
        }));
      });
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.method !== 'GET') return;
  if (new URL(r.url).origin !== location.origin) return;

  // Las teselas cifradas del mapa no pasan por aquí: son decenas de megabytes, se piden por rangos de bytes
  // (respuestas 206, que la caché del navegador ni siquiera admite) y solo sirven con señal.
  if (new URL(r.url).pathname.indexOf('/mapa/') === 0 || r.headers.get('range')) return;

  // Primero la red, para que una versión nueva llegue sola en cuanto haya señal;
  // si no hay red, lo guardado. Al revés, el evaluador seguiría con la versión
  // vieja hasta vaciar la caché a mano.
  e.respondWith(
    fetch(r).then(function (resp) {
      var copia = resp.clone();
      caches.open(CACHE).then(function (c) { c.put(r, copia); }).catch(function () {});
      return resp;
    }).catch(function () {
      return caches.match(r).then(function (hit) {
        return hit || caches.match('./visita.html');
      });
    })
  );
});
