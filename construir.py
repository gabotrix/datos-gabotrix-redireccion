# -*- coding: utf-8 -*-
"""
Redirección del dominio viejo datos.gabotrix.com → manizalesconstruye.camacolcaldas.com (27-sep-2026).

Todo el dominio viejo reenvía al nuevo con ruta, parámetros y ancla (index.html y 404.html → redirigir.js).
La excepción es el formulario de campo (/campo/): el teléfono guarda las visitas sin enviar en el almacenamiento del
dominio donde se abrió la app, y el dominio nuevo no las ve. Por eso /campo/ en el dominio viejo es una copia del
formulario vigente con un guardián al inicio:
  · si el teléfono no tiene visitas pendientes (terminadas o pasadas del primer paso), se va al dominio nuevo de inmediato;
  · si las tiene, deja a la app enviar las terminadas, sube el resto como borrador (respuestas y fotos) a
    campo-borrador y se va: en el dominio nuevo cada visita vuelve con «Traer». Sin señal se queda aquí sin aviso.
    Solo una visita con documentos PDF se envía desde aquí (guardian.js, v2 del 29-sep-2026).
La copia usa los mismos servicios (Supabase) y lee el mapa del dominio nuevo. El service worker se renombra para que
reemplace cualquier página de error que el teléfono haya guardado mientras el dominio viejo respondía 404.

Uso: python construir.py   (toma ../repo/campo, que debe estar en origin/main)
"""
import io, os, re, shutil
HERE = os.path.dirname(os.path.abspath(__file__)); SRC = os.path.join(os.path.dirname(HERE), "repo", "campo"); DST = os.path.join(HERE, "campo")
NUEVO = "https://manizalesconstruye.camacolcaldas.com"
if os.path.exists(DST): shutil.rmtree(DST)
shutil.copytree(SRC, DST)

# El guardián vive en guardian.js (v2, 29-sep-2026: sube lo pendiente como borrador y se va; ver su cabecera).
GUARDIAN = "<script>\n" + io.open(os.path.join(HERE, "guardian.js"), encoding="utf-8").read().replace("__NUEVO__", NUEVO) + "\n</script>"

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
