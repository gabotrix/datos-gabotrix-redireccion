# -*- coding: utf-8 -*-
"""
Redirección del dominio viejo datos.gabotrix.com → manizalesconstruye.camacolcaldas.com (27-sep-2026).

Todo el dominio viejo reenvía al nuevo con ruta, parámetros y ancla (index.html y 404.html → redirigir.js).
La excepción es el formulario de campo (/campo/): el teléfono guarda las visitas sin enviar en el almacenamiento del
dominio donde se abrió la app, y el dominio nuevo no las ve. Por eso /campo/ en el dominio viejo es una copia del
formulario vigente con un guardián al inicio:
  · si el teléfono no tiene visitas sin enviar (estado distinto de «enviada»), se va al dominio nuevo de inmediato;
  · si las tiene, la app abre aquí con un aviso, el ingeniero las envía como siempre y, cuando no queda ninguna,
    pasa sola al dominio nuevo.
La copia usa los mismos servicios (Supabase) y lee el mapa del dominio nuevo. El service worker se renombra para que
reemplace cualquier página de error que el teléfono haya guardado mientras el dominio viejo respondía 404.

Uso: python construir.py   (toma ../repo/campo, que debe estar en origin/main)
"""
import io, os, re, shutil
HERE = os.path.dirname(os.path.abspath(__file__)); SRC = os.path.join(os.path.dirname(HERE), "repo", "campo"); DST = os.path.join(HERE, "campo")
NUEVO = "https://manizalesconstruye.camacolcaldas.com"
if os.path.exists(DST): shutil.rmtree(DST)
shutil.copytree(SRC, DST)

GUARDIAN = r"""<script>
/* Guardián del dominio viejo: solo se queda aquí quien tenga visitas sin enviar en este teléfono. */
(function () {
  var NUEVO = '__NUEVO__';
  var destino = NUEVO + location.pathname + location.search + location.hash;
  window.__DOMINIO_VIEJO__ = true;
  function sinEnviar(lista) { return lista.filter(function (v) { return v && v.estado && v.estado !== 'enviada'; }).length; }
  function desdeRespaldo() { try { var t = JSON.parse(localStorage.getItem('psismo.visitas') || '{}'); return sinEnviar(Object.keys(t).map(function (k) { return t[k]; })); } catch (e) { return 0; } }
  /* Devuelve cuántas visitas sin enviar hay; -1 si no se pudo saber (entonces la app se queda aquí, por prudencia).
     No se abre la base si no existe: abrirla la crearía vacía y la app arrancaría sin sus almacenes. */
  function existeBase() {
    if (!indexedDB.databases) return Promise.resolve(null);   /* navegador sin la lista: no se sabe */
    return indexedDB.databases().then(function (l) { return l.some(function (x) { return x.name === 'psismo'; }); }).catch(function () { return null; });
  }
  function cuenta() {
    var n0 = desdeRespaldo();
    if (!window.indexedDB) return Promise.resolve(n0);
    return existeBase().then(function (hay) {
      if (hay === false) return n0;
      if (hay === null) return n0 > 0 ? n0 : -1;
      return new Promise(function (ok) {
        var listo = false, reloj = setTimeout(function () { if (!listo) { listo = true; ok(n0 || -1); } }, 8000), s;
        try { s = indexedDB.open('psismo'); } catch (e) { clearTimeout(reloj); return ok(n0 || -1); }
        s.onerror = function () { if (!listo) { listo = true; clearTimeout(reloj); ok(n0 || -1); } };
        s.onsuccess = function () {
          var d = s.result;
          var fin = function (n) { if (listo) return; listo = true; clearTimeout(reloj); try { d.close(); } catch (e) {} ok(n < 0 ? -1 : n + n0); };
          if (!d.objectStoreNames.contains('visitas')) return fin(0);
          try {
            var r = d.transaction('visitas', 'readonly').objectStore('visitas').getAll();
            r.onsuccess = function () { fin(sinEnviar(r.result || [])); };
            r.onerror = function () { fin(-1); };
          } catch (e) { fin(-1); }
        };
      });
    });
  }
  function aviso(n) {
    var b = document.createElement('div');
    b.id = 'avisoDominio';
    b.setAttribute('style', 'position:fixed;left:0;right:0;top:0;z-index:99999;background:#fac400;color:#0f2447;font:600 13px/1.4 system-ui,sans-serif;padding:10px 14px;box-shadow:0 4px 14px rgba(0,0,0,.2)');
    b.innerHTML = n > 0
      ? 'La app cambió de dirección. Este teléfono tiene ' + n + ' visita' + (n === 1 ? '' : 's') + ' sin enviar: envíela' + (n === 1 ? '' : 's') + ' desde aquí. Cuando no quede ninguna, pasará sola a la dirección nueva.'
      : 'La app cambió de dirección. No se pudo revisar si hay visitas sin enviar: envíe lo pendiente y luego <a style="color:#0f2447" href="' + destino + '">abra la dirección nueva</a>.';
    (document.body || document.documentElement).appendChild(b);
  }
  cuenta().then(function (n) {
    if (n === 0) { location.replace(destino); return; }
    var pinta = function () { if (!document.getElementById('avisoDominio')) aviso(n); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pinta); else pinta();
    /* cada 20 s: si ya se envió todo, pasar al dominio nuevo */
    setInterval(function () {
      cuenta().then(function (m) {
        if (m === 0) { location.replace(NUEVO + location.pathname + location.search + location.hash); return; }
        var a = document.getElementById('avisoDominio'); if (a) a.remove(); aviso(m);
      });
    }, 20000);
  });
})();
</script>""".replace("__NUEVO__", NUEVO)

p = os.path.join(DST, "visita.html"); s = io.open(p, encoding="utf-8").read()
s, k = re.subn(r"var MAPA_DATA = '\.\./mapa/data/'", f"var MAPA_DATA = '{NUEVO}/mapa/data/'", s); assert k == 1, "MAPA_DATA no encontrado"
s, k = re.subn(r"(<head[^>]*>)", r"\1" + GUARDIAN.replace("\\", "\\\\"), s, count=1); assert k == 1, "no hay <head>"
io.open(p, "w", encoding="utf-8").write(s)

p = os.path.join(DST, "sw.js"); w = io.open(p, encoding="utf-8").read()
w, k = re.subn(r"var CACHE = '([^']+)';", r"var CACHE = '\1-dominio-viejo';", w); assert k == 1
io.open(p, "w", encoding="utf-8").write(w)

# las páginas de coordinación no guardan nada en el teléfono: van directo al dominio nuevo
for f in ["panel.html", "supervision.html"]:
    q = os.path.join(DST, f)
    if os.path.exists(q): io.open(q, "w", encoding="utf-8").write(io.open(os.path.join(HERE, "index.html"), encoding="utf-8").read())
print("campo/ copiado con guardián · MAPA_DATA →", NUEVO, "· sw renombrado")
