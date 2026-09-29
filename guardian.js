/* Guardián del dominio viejo (v2, 29-sep-2026).

   Lo que un teléfono guardó sin enviar vive en el almacenamiento de ESTE dominio, y el nuevo no puede leerlo. La v1
   se quedaba aquí con un aviso amarillo mientras hubiera algo «sin enviar», y contaba como tal cualquier visita no
   enviada, también las vacías de «Nueva visita»: casi nadie salía nunca. La v2 se lleva el trabajo en vez de
   esperar a que se acabe:

     1. Pendiente es solo lo que tiene contenido: una visita terminada («lista») o una pasada del primer paso.
     2. Sin nada pendiente, directo al dominio nuevo.
     3. Con pendientes y con señal: primero se deja a la app enviar las terminadas, como hace siempre (hasta un
        minuto). Lo que quede se sube como borrador a campo-borrador —respuestas y cada fotografía, como la copia de
        respaldo que la app ya hace— y se pasa al dominio nuevo. Allí sale «Hay trabajo guardado en el servidor» y
        cada visita vuelve con «Traer», fotos incluidas.
     4. Sin señal, o si algo no sube: la app funciona aquí como siempre, sin aviso, y se reintenta al volver a abrir.
     5. Una visita con documentos (PDF) no cabe en un borrador: esa se envía desde aquí, y solo entonces sale una nota.

   Nada se borra de este teléfono: lo subido queda anotado (psismo.migradoAlNuevo, con la hora de su último cambio)
   para no volver a subirlo, y si la visita cambiara después se subiría otra vez. */
(function () {
  var NUEVO = '__NUEVO__';
  var API = 'https://ymbzpuxyvquvawfdntly.supabase.co/functions/v1/campo-borrador';
  var LS_MIGRADO = 'psismo.migradoAlNuevo';
  var ESPERA_LISTAS = 60000;
  window.__DOMINIO_VIEJO__ = true;

  /* La dirección con la que se abrió, tomada ya: al arrancar, la app limpia la barra (replaceState) y el ancla y los
     parámetros se perderían antes de irse. */
  var RUTA = location.pathname, BUSQUEDA = location.search, ANCLA = location.hash;
  function token() { try { return localStorage.getItem('psismo.token') || ''; } catch (e) { return ''; } }
  function tokenDelEnlace() { try { return new URLSearchParams(BUSQUEDA).get('e') || ''; } catch (e) { return ''; } }
  /* El enlace personal lleva ?e=<token>. Quien abre desde el icono no lo trae: se le pone el que el teléfono guardó,
     para que en el dominio nuevo no tenga que volver a pedir su enlace. */
  function destino() {
    var q = BUSQUEDA, t = token();
    if (t && !tokenDelEnlace()) q = (q ? q + '&' : '?') + 'e=' + encodeURIComponent(t);
    return NUEVO + RUTA + q + ANCLA;
  }
  function vete() { location.replace(destino()); }
  function leeJSON(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function migrado() { return leeJSON(LS_MIGRADO) || {}; }
  function anotaMigrado(v) { var m = migrado(); m[v.id] = v.tocada || 0; try { localStorage.setItem(LS_MIGRADO, JSON.stringify(m)); } catch (e) {} }

  function esFoto(x) { return typeof x === 'string' && /^data:image\/(jpeg|png|webp);base64,/i.test(x); }
  function esAdjunto(x) {
    if (!Array.isArray(x) || !x.length) return false;
    return x.some(function (y) { return (typeof y === 'string' && y.slice(0, 5) === 'data:') || (y && typeof y === 'object' && typeof y.datos === 'string'); });
  }
  function tieneDocumentos(v) {
    var D = v.D || {};
    return Object.keys(D).some(function (k) {
      return Array.isArray(D[k]) && D[k].some(function (y) { return (y && typeof y === 'object' && typeof y.datos === 'string') || (typeof y === 'string' && y.slice(0, 5) === 'data:' && !esFoto(y)); });
    });
  }
  function pendiente(v) { return !!(v && v.id && v.estado !== 'enviada' && (v.estado === 'lista' || (v.paso || 0) > 0)); }
  function porSubir(v) { return pendiente(v) && migrado()[v.id] !== (v.tocada || 0); }

  /* Las visitas de este teléfono: IndexedDB (con fotos) y el respaldo de localStorage (sin fotos), sin crear la base
     si no existe. Si la base no abre, la app también trabaja con el respaldo, así que eso es lo que hay. */
  function leeIDB() {
    return new Promise(function (ok) {
      if (!window.indexedDB) return ok([]);
      var listo = false, s, nueva = false;
      var reloj = setTimeout(function () { fin(null); }, 8000);
      function fin(l) { if (listo) return; listo = true; clearTimeout(reloj); ok(l); }
      try { s = indexedDB.open('psismo'); } catch (e) { return fin(null); }
      s.onupgradeneeded = function (ev) { if (ev.oldVersion === 0) { nueva = true; try { s.transaction.abort(); } catch (e) {} } };
      s.onerror = function (ev) { try { ev.preventDefault(); } catch (e) {} fin(nueva ? [] : null); };
      s.onblocked = function () { fin(null); };
      s.onsuccess = function () {
        var d = s.result;
        /* Que la app pueda abrir o actualizar la base aunque esta lectura siga en curso. */
        d.onversionchange = function () { try { d.close(); } catch (e) {} };
        if (!d.objectStoreNames.contains('visitas')) { try { d.close(); } catch (e) {} return fin([]); }
        try {
          var r = d.transaction('visitas', 'readonly').objectStore('visitas').getAll();
          r.onsuccess = function () { try { d.close(); } catch (e) {} fin(r.result || []); };
          r.onerror = function () { try { d.close(); } catch (e) {} fin(null); };
        } catch (e) { try { d.close(); } catch (x) {} fin(null); }
      };
    });
  }
  function visitas() {
    return leeIDB().then(function (idb) {
      var t = leeJSON('psismo.visitas') || {}, porId = {};
      Object.keys(t).forEach(function (k) { if (t[k] && t[k].id) porId[t[k].id] = t[k]; });
      (idb || []).forEach(function (v) { if (v && v.id) porId[v.id] = v; });   /* la de IndexedDB lleva las fotos */
      return Object.keys(porId).map(function (k) { return porId[k]; });
    });
  }

  function pide(cuerpo) {
    var ctl = window.AbortController ? new AbortController() : null;
    var reloj = ctl ? setTimeout(function () { ctl.abort(); }, 90000) : null;
    return fetch(API, {
      method: 'POST', signal: ctl ? ctl.signal : undefined,
      headers: { 'Content-Type': 'application/json', 'x-token-evaluador': token() },
      body: JSON.stringify(cuerpo)
    }).then(function (r) { if (reloj) clearTimeout(reloj); if (!r.ok) throw new Error('http ' + r.status); return r.json(); });
  }
  function titulo(v) {
    var r = v.resumen;
    if (typeof r === 'string' && r) return r.slice(0, 200);
    if (r && typeof r === 'object') return String(r.direccion || r.codigo || 'Visita sin dirección').slice(0, 200);
    return 'Visita sin dirección';
  }
  function fotosDe(v) {
    var D = v.D || {}, l = [];
    Object.keys(D).forEach(function (k) {
      if (!Array.isArray(D[k]) || !/^[\w-]+$/.test(k)) return;
      D[k].forEach(function (x, i) { if (esFoto(x)) l.push({ campo: k, orden: i, datos: x }); });
    });
    return l;
  }
  /* Una visita al servidor: las respuestas y después cada foto. Si algo falla, no se da por subida. */
  function sube(v, avance) {
    var R = {};
    Object.keys(v.D || {}).forEach(function (k) { if (k !== 'clave_dispositivo' && !esAdjunto(v.D[k])) R[k] = v.D[k]; });
    var fotos = fotosDe(v);
    return pide({ accion: 'guarda', visita: v.id, asignacion: v.asignacion || null, respuestas: R,
                  paso: v.paso || 0, resumen: titulo(v), dispositivo: ('dominio viejo · ' + (navigator.userAgent || '')).slice(0, 80) })
      .then(function () {
        return fotos.reduce(function (cadena, f, i) {
          return cadena.then(function () {
            avance(i + 1, fotos.length);
            return pide({ accion: 'foto', visita: v.id, campo: f.campo, orden: f.orden, datos: f.datos });
          });
        }, Promise.resolve());
      })
      .then(function () { anotaMigrado(v); return true; });
  }

  /* ---- lo que se ve: una capa mientras se sube, y la nota de los documentos */
  var capa = null, parar = false;
  function muestra(txt) {
    if (!document.body) return;
    if (!capa) {
      capa = document.createElement('div');
      capa.id = 'mudanza';
      capa.setAttribute('style', 'position:fixed;inset:0;z-index:99999;background:rgba(15,36,71,.92);color:#fff;display:flex;align-items:center;justify-content:center;padding:24px;font:15px/1.5 system-ui,-apple-system,sans-serif;text-align:center');
      capa.innerHTML = '<div style="max-width:340px"><div style="font-weight:700;font-size:17px;margin-bottom:8px">La app cambió de dirección</div>' +
        '<div id="mudanzaTxt"></div><div style="font-size:12.5px;opacity:.8;margin-top:10px">No cierre la app. Su trabajo sigue guardado en este teléfono.</div>' +
        '<button type="button" id="mudanzaNo" style="margin-top:18px;min-height:44px;padding:0 18px;border-radius:22px;border:1px solid rgba(255,255,255,.5);background:transparent;color:#fff;font:600 14px system-ui,sans-serif">Seguir aquí por ahora</button></div>';
      document.body.appendChild(capa);
      document.getElementById('mudanzaNo').onclick = function () { parar = true; quita(); };
    }
    document.getElementById('mudanzaTxt').textContent = txt;
  }
  function quita() { if (capa) { capa.remove(); capa = null; } }
  function notaDocumentos(n) {
    if (!document.body || document.getElementById('notaDominio')) return;
    try { if (sessionStorage.getItem('psismo.notaDominioCerrada') === '1') return; } catch (e) {}
    var b = document.createElement('div');
    b.id = 'notaDominio';
    b.setAttribute('style', 'position:fixed;left:0;right:0;top:0;z-index:99998;background:#0f2447;color:#fff;font:600 13px/1.4 system-ui,sans-serif;padding:10px 52px 10px 14px;box-shadow:0 4px 14px rgba(0,0,0,.2)');
    b.innerHTML = '<div>' + (n === 1 ? 'Una visita tiene documentos adjuntos' : n + ' visitas tienen documentos adjuntos') +
      ' y se envía' + (n === 1 ? '' : 'n') + ' desde aquí. Cuando se envíe' + (n === 1 ? '' : 'n') + ', la app pasará sola a la dirección nueva.</div>' +
      '<button type="button" aria-label="Cerrar" style="position:absolute;top:50%;right:6px;transform:translateY(-50%);width:40px;height:40px;border:0;border-radius:50%;background:rgba(255,255,255,.15);color:#fff;font:700 22px/40px system-ui,sans-serif;padding:0">×</button>';
    b.querySelector('button').onclick = function () { try { sessionStorage.setItem('psismo.notaDominioCerrada', '1'); } catch (e) {} b.remove(); };
    document.body.appendChild(b);
  }
  function cuandoHayCuerpo(fn) { if (document.body) fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function espera(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }

  /* Las terminadas las envía la app sola al arrancar con señal: se le da tiempo antes de subir nada. */
  function esperaListas(ids, desde) {
    return visitas().then(function (l) {
      var quedan = l.filter(function (v) { return ids[v.id] && v.estado === 'lista'; }).length;
      if (!quedan || parar || Date.now() - desde > ESPERA_LISTAS) return l;
      muestra('Enviando ' + (quedan === 1 ? 'la visita terminada' : 'las ' + quedan + ' visitas terminadas') + '…');
      return espera(4000).then(function () { return esperaListas(ids, desde); });
    });
  }

  function mudanza() {
    return visitas().then(function (l) {
      var p = l.filter(porSubir);
      if (!p.length) return vete();
      if (!token() || navigator.onLine === false) return;        /* sin señal: se trabaja aquí, sin aviso */
      var ids = {}; p.forEach(function (v) { ids[v.id] = true; });
      return new Promise(function (ok) { cuandoHayCuerpo(ok); }).then(function () {
        var hayListas = p.some(function (v) { return v.estado === 'lista'; });
        muestra('Revisando las visitas de este teléfono…');
        return (hayListas ? esperaListas(ids, Date.now()) : Promise.resolve(l)).then(function (l2) {
          var resto = l2.filter(function (v) { return ids[v.id] && porSubir(v); });
          var conDocs = resto.filter(tieneDocumentos), subir = resto.filter(function (v) { return !tieneDocumentos(v); });
          var fallos = 0;
          return subir.reduce(function (cadena, v, i) {
            return cadena.then(function () {
              if (parar) return;
              var base = 'Pasando su trabajo a la dirección nueva: visita ' + (i + 1) + ' de ' + subir.length;
              muestra(base + '…');
              return sube(v, function (k, n) { muestra(base + ' · foto ' + k + ' de ' + n + '…'); })
                .catch(function () { fallos++; });
            });
          }, Promise.resolve()).then(function () {
            if (parar) return;
            if (!fallos && !conDocs.length) {
              muestra(subir.length
                ? 'Listo. En la dirección nueva toque «Traer» en ' + (subir.length === 1 ? 'la visita' : 'cada visita') + ' para seguir donde la dejó.'
                : 'Listo. Abriendo la dirección nueva…');
              return espera(subir.length ? 3500 : 800).then(vete);
            }
            quita();
            if (conDocs.length) notaDocumentos(conDocs.length);
            /* si algo no subió, se reintenta al volver a abrir la app, sin aviso */
          });
        });
      });
    }).catch(function () { quita(); });
  }
  mudanza();
})();
