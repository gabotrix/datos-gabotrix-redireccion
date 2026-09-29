/* El informe del predio: el documento que se firma.
 *
 * Vive aquí y no dentro de una página porque lo arman DOS: el ingeniero en el teléfono
 * (campo/visita.html) al cerrar la visita, y la alcaldía desde el panel (campo/panel.html) sobre
 * una visita ya recibida. Tienen que salir idénticos —es el mismo documento— y mantener dos copias
 * era garantizar que en dos meses no lo fueran.
 *
 * Se usa así:
 *
 *   INFORME.abre({
 *     respuestas: {...},          // lo que respondió el formulario
 *     campos: {nombre: {label, lista}},   // el diccionario del formulario
 *     ref: 'identificador de la visita',
 *     listas: {id: [{v,l}]},      // para traducir los códigos guardados
 *     asignacion: {...}, logo: '…', perfil: {...}, version: '4.0.0-movil',
 *     hayDemolicion: bool,        // si la visita abrió el módulo de demolición y escombros
 *     esc: fn, textoValor: fn,    // los que ya tiene cada página
 *     fotoSrc: fn(campo, n, ruta) // solo si las fotos son rutas y no data URL
 *     correcciones: [{campo, antes, despues, motivo, creada_en}]   // opcional: el anexo del final
 *     aviso: 'texto'              // opcional: se enseña al pie del visor (p. ej., por qué no se descargó)
 *   });
 *
 *   INFORME.descarga(ctx)  ->  Promise   // el mismo documento, como archivo PDF que se descarga
 *                                        // (Informe-<dirección>-<fecha>.pdf); si falla, rechaza y quien
 *                                        // llama abre la vista de impresión de siempre (abre)
 *
 * Tres decisiones que conviene no perder, heredadas de donde nació:
 *  · el logo institucional es blanco y sobre papel desaparece: va sobre la banda azul;
 *  · Chrome no implementa los contadores de página de CSS y su pie imprime la URL y la fecha del
 *    sistema, que no van en un documento firmado: las hojas se arman a mano, en A4 exacto;
 *  · los rendimientos con que se convierten cantidades en materiales y jornales son de referencia
 *    y van impresos, para que un ingeniero de costos pueda revisarlos.
 */
window.INFORME = (function () {
  'use strict';

  // Lo que pone quien llama. Se rellenan en abre() antes de armar nada.
  var D = {}, idxCampo = {}, REF = '', FOTO = null, LISTAS = {}, ASIG = null, LOGO = '';
  var PERFIL_ = {}, VERSION = '', HAY_DEM = false;
  var CORRECCIONES = [];

  // La etiqueta de un valor de lista: en la base se guarda «uso_restringido» y en el documento
  // tiene que leerse «Uso restringido (Amarillo)».
  function etiqueta(f, val) {
    if (!f || !f.lista) return val;
    var l = (LISTAS[f.lista] || []).filter(function (x) { return x.v === val; })[0];
    return l ? l.l : val;
  }
  // Fecha y hora como se escriben aquí. Es la misma función del formulario: el informe la usa
  // para la trazabilidad y no tendría sentido que las dos páginas la formatearan distinto.
  function FDT(v) {
    if (!v) return '';
    var d = new Date(v); if (isNaN(d)) return '';
    function z(n) { return (n < 10 ? '0' : '') + n; }
    return z(d.getDate()) + '/' + z(d.getMonth() + 1) + '/' + d.getFullYear() +
           ' ' + z(d.getHours()) + ':' + z(d.getMinutes());
  }

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  var textoValor = function () { return ''; };
  var anota = function () {};

  // El visor y, debajo, lo del archivo: la espera mientras se arma el PDF y el aviso de que ya se
  // descargó. Llevan colores de respaldo porque el panel no tiene las mismas variables que el teléfono.
  var ESTILOS_VISOR = ".inf-espera{position:fixed;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(6,10,14,.5)}\n.inf-espera>div{max-width:320px;width:100%;background:var(--surface,#fff);color:var(--foreground,#0F2233);border-radius:16px;padding:20px 22px;text-align:center;box-shadow:0 18px 40px -20px rgba(0,0,0,.5);font-family:var(--font-sans,system-ui,sans-serif)}\n.inf-espera i{display:block;width:28px;height:28px;margin:0 auto 12px;border-radius:50%;border:3px solid rgba(11,60,93,.18);border-top-color:#0B3C5D;animation:infgira .8s linear infinite}\n.inf-espera b{display:block;font-size:15px;line-height:1.3}\n.inf-espera span{display:block;margin-top:6px;font-size:12.5px;line-height:1.45;opacity:.75}\n@keyframes infgira{to{transform:rotate(360deg)}}\n@media (prefers-reduced-motion:reduce){.inf-espera i{animation:none}}\n.inf-listo{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:85;width:calc(100% - 24px);max-width:520px;display:flex;align-items:center;gap:10px;padding:12px 12px 12px 16px;border-radius:14px;background:#0F2233;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.3);font:13px/1.4 var(--font-sans,system-ui,sans-serif)}\n.inf-listo span{flex:1;min-width:0;overflow-wrap:anywhere}\n.inf-listo a{flex:none;color:#fff;font-weight:700;text-decoration:underline;padding:6px 4px}\n.inf-listo button{flex:none;width:30px;height:30px;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:transparent;color:#fff;font-size:14px;line-height:1;padding:0}\n.inf-pie b.inf-aviso{display:block;color:var(--foreground,#0F2233);margin-bottom:4px}\n" +
    ".inf-capa{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;background:var(--background)}\n.inf-top{display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--primary);color:var(--primary-fg)}\n.inf-top .inf-tit{flex:1;min-width:0}\n.inf-top b{display:block;font-family:var(--font-display);font-size:14px;line-height:1.2}\n.inf-top span{display:block;font-size:10px;opacity:.75;font-family:var(--font-mono);letter-spacing:.02em}\n.inf-x{width:32px;height:32px;flex:none;border-radius:50%;border:1px solid color-mix(in oklab,var(--primary-fg) 35%,transparent);background:transparent;color:var(--primary-fg);font-size:13px;line-height:1;display:flex;align-items:center;justify-content:center}\n.inf-pdf{flex:none;min-height:36px;padding:0 16px;border-radius:999px;border:0;background:var(--secondary);color:oklch(0.245 0.075 253);font-weight:700;font-size:12.5px}\n.inf-marco{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;background:oklch(0.93 0.008 247)}\n.inf-marco iframe{width:100%;height:100%;border:0;display:block;background:transparent}\n.inf-pie{margin:0;padding:8px 14px calc(8px + env(safe-area-inset-bottom));font-size:10.5px;color:var(--muted-fg);background:var(--surface);border-top:1px solid var(--border)}";

  function inyectaEstilos() {
    if (document.getElementById('infEstilos')) return;
    var st = document.createElement('style');
    st.id = 'infEstilos';
    st.textContent = ESTILOS_VISOR;
    document.head.appendChild(st);
  }

  // ---------------------------------------------------------------- informe del predio
  // Al cerrar la visita queda un documento con el dictamen, el detalle del daño, la cuantificación de lo que hace
  // falta para recuperar el inmueble y el registro fotográfico. Se abre en una ventana aparte y se guarda como PDF
  // desde el propio teléfono (Imprimir → Guardar como PDF), sin subir nada y sin depender de la red.
  //
  // Tres decisiones que conviene dejar escritas:
  //  · El logo institucional es blanco, pensado para fondo oscuro. Sobre papel blanco desaparece, así que va sobre
  //    la banda azul de la plataforma. Se reutiliza el mismo archivo que ya trae la aplicación: no pesa de más.
  //  · Chrome no implementa los contadores de página de CSS y su pie automático imprime la URL y la fecha del
  //    sistema, que no van en un documento firmado. Por eso las hojas se arman a mano, en A4 exacto, y la propia
  //    ventana reparte los bloques y numera «N de M» antes de imprimir.
  //  · Los rendimientos con que se convierten las cantidades en materiales y jornales son de referencia y están
  //    impresos en el informe, para que un ingeniero de costos de la Alcaldía pueda revisarlos y corregirlos.

  // Rendimientos: insumo por unidad de obra (mat), jornal por unidad (mo) y escombro generado en m³ (esc).
  var APU_ITEMS = {
    retiro_panete: { nombre: 'Retiro de pañete en mal estado', unidad: 'm²', elemento: 'Muros',
      mat: [], mo: [['Ayudante de obra', 1 / 12]], esc: 0.03 },
    panete_nuevo: { nombre: 'Pañete de mortero 1:4, espesor 2 cm', unidad: 'm²', elemento: 'Muros',
      mat: [['Cemento gris', 'kg', 8.5], ['Arena de pega', 'm³', 0.022], ['Agua', 'L', 6]],
      mo: [['Oficial de obra', 1 / 10], ['Ayudante de obra', 1 / 10]], esc: 0 },
    // ML, no ml: es la abreviatura de «metro lineal», no un símbolo del SI como m² o m³. Va en
    // mayúsculas igual que en el formulario, para que el mismo número no aparezca con dos
    // unidades distintas dentro del mismo informe.
    resane_fisura: { nombre: 'Resane de fisura con malla de refuerzo', unidad: 'ML', elemento: 'Muros',
      mat: [['Mortero de reparación', 'kg', 1.2], ['Malla de fibra de vidrio', 'ml', 1.05]],
      mo: [['Oficial de obra', 1 / 25]], esc: 0.005 },
    pintura: { nombre: 'Pintura vinilo tipo 2, dos manos', unidad: 'm²', elemento: 'Muros',
      mat: [['Pintura vinilo', 'L', 0.25]], mo: [['Pintor', 1 / 35]], esc: 0 },
    teja_barro: { nombre: 'Reposición de teja de barro', unidad: 'und', elemento: 'Cubierta',
      mat: [['Teja de barro', 'und', 1], ['Mortero de fijación', 'kg', 0.3]],
      mo: [['Tejador', 1 / 120]], esc: 0.002 },
    teja_fibro: { nombre: 'Reposición de teja de fibrocemento', unidad: 'm²', elemento: 'Cubierta',
      mat: [['Teja de fibrocemento (1,80 m)', 'und', 0.67], ['Gancho de amarre', 'und', 6]],
      mo: [['Tejador', 1 / 25]], esc: 0.01 },
    teja_zinc: { nombre: 'Reposición de teja de zinc', unidad: 'm²', elemento: 'Cubierta',
      mat: [['Teja de zinc calibre 30', 'und', 0.6], ['Gancho de amarre', 'und', 6]],
      mo: [['Tejador', 1 / 28]], esc: 0.008 },
    correa_madera: { nombre: 'Cambio de correa en madera', unidad: 'ml', elemento: 'Estructura de cubierta',
      mat: [['Madera estructural 4x8 cm', 'ml', 1.05], ['Puntilla', 'kg', 0.08]],
      mo: [['Carpintero', 1 / 18], ['Ayudante de obra', 1 / 18]], esc: 0.004 },
    apuntalamiento: { nombre: 'Apuntalamiento provisional', unidad: 'ml', elemento: 'Medida de seguridad',
      mat: [['Puntal metálico', 'und', 0.7], ['Madera de arriostre', 'ml', 1.2]],
      mo: [['Oficial de obra', 1 / 20], ['Ayudante de obra', 1 / 20]], esc: 0 },
    muro_nuevo: { nombre: 'Muro divisorio nuevo en mampostería', unidad: 'm²', elemento: 'Muros',
      mat: [['Ladrillo de arcilla', 'und', 42], ['Cemento gris', 'kg', 12], ['Arena de pega', 'm³', 0.03]],
      mo: [['Oficial de obra', 1 / 8], ['Ayudante de obra', 1 / 8]], esc: 0 },
    // El muro que se reemplaza y no es de mampostería (drywall, otro): se levanta en su material, que
    // va en el origen de la fila. Sin rendimiento: el de arriba es de ladrillo.
    muro_nuevo_otro: { nombre: 'Muro divisorio nuevo, en el material del que se reemplaza', unidad: 'm²',
      elemento: 'Muros', mat: [], mo: [], esc: 0 },
    demolicion_muro: { nombre: 'Demolición manual de muro', unidad: 'm²', elemento: 'Demolición',
      mat: [], mo: [['Ayudante de obra', 1 / 6]], esc: 0.15 },
    retiro_escombro: { nombre: 'Cargue, retiro y disposición de escombros', unidad: 'm³', elemento: 'Escombros',
      mat: [], mo: [['Ayudante de obra', 1 / 2.5]], esc: 0, volqueta: 1 / 6 },
    // Lo que se mide en Reparabilidad desde el 23-sep y no tiene rendimiento: no hay APU en el sistema.
    // Entran en la tabla de cantidades con su unidad —es lo que imprime el informe desde que salieron los
    // jornales— y no suman insumos, jornales ni escombro, porque no hay de dónde sacarlos.
    reposicion_enchape: { nombre: 'Reposición de piso o enchape', unidad: 'm²', elemento: 'Pisos y enchapes',
      mat: [], mo: [], esc: 0 },
    fragua_boquilla: { nombre: 'Fragua y boquilla', unidad: 'm²', elemento: 'Pisos y enchapes', mat: [], mo: [], esc: 0 },
    reparacion_contrapiso: { nombre: 'Reparación de contrapiso', unidad: 'm²', elemento: 'Pisos y enchapes',
      mat: [], mo: [], esc: 0 },
    salida_electrica: { nombre: 'Reparación o cambio de salida eléctrica', unidad: 'und',
      elemento: 'Instalaciones eléctricas', mat: [], mo: [], esc: 0 },
    tablero_electrico: { nombre: 'Revisión o cambio del tablero eléctrico', unidad: 'und',
      elemento: 'Instalaciones eléctricas', mat: [], mo: [], esc: 0 },
    sanitario: { nombre: 'Reposición de sanitario', unidad: 'und', elemento: 'Baños', mat: [], mo: [], esc: 0 },
    lavamanos: { nombre: 'Reposición de lavamanos', unidad: 'und', elemento: 'Baños', mat: [], mo: [], esc: 0 },
    ducha: { nombre: 'Reposición de ducha', unidad: 'und', elemento: 'Baños', mat: [], mo: [], esc: 0 },
    griferia: { nombre: 'Reposición de grifería', unidad: 'und', elemento: 'Baños', mat: [], mo: [], esc: 0 },
    enchape_bano: { nombre: 'Enchape de baño', unidad: 'm²', elemento: 'Baños', mat: [], mo: [], esc: 0 },
    tuberia: { nombre: 'Reparación de tubería de agua o desagüe', unidad: 'ml', elemento: 'Baños',
      mat: [], mo: [], esc: 0 }
  };
  // Los materiales de muro (lista material_muro) para los que vale el rendimiento de muro_nuevo.
  var MAMPOSTERIA = { bloque_concreto: true, ladrillo_hueco: true, ladrillo_macizo: true };
  // Un maestro de obra dirige la cuadrilla: se estima un jornal por cada seis jornales de oficio.
  var MAESTRO_POR_JORNAL = 1 / 6;
  // Cuántas tejas de barro cubren un metro cuadrado de cubierta. Es el único factor de conversión del informe y
  // por eso queda impreso: cambia con el tipo de teja y hay que confirmarlo con el catálogo de la Alcaldía.
  var TEJAS_BARRO_M2 = 16;

  function apuCalcula(cantidades) {
    var obra = [], materiales = {}, mano = {}, escombro = 0, viajes = 0;
    cantidades.forEach(function (par) {
      var it = APU_ITEMS[par[0]], cant = +par[1];
      if (!it || !cant || cant <= 0) return;
      obra.push({ elemento: it.elemento, nombre: it.nombre, unidad: it.unidad, cantidad: cant, origen: par[2] || '' });
      it.mat.forEach(function (m) {
        var k = m[0] + '|' + m[1];
        materiales[k] = (materiales[k] || 0) + m[2] * cant;
      });
      it.mo.forEach(function (m) { mano[m[0]] = (mano[m[0]] || 0) + m[1] * cant; });
      escombro += (it.esc || 0) * cant;
      if (it.volqueta) viajes += it.volqueta * cant;
    });
    var jornales = 0, rol;
    for (rol in mano) jornales += mano[rol];
    if (jornales > 0) mano['Maestro de obra'] = (mano['Maestro de obra'] || 0) + jornales * MAESTRO_POR_JORNAL;
    var mats = [];
    Object.keys(materiales).forEach(function (k) {
      var p = k.split('|');
      mats.push({ insumo: p[0], unidad: p[1], cantidad: materiales[k] });
    });
    mats.sort(function (a, b) { return a.insumo.localeCompare(b.insumo); });
    var mo = [];
    Object.keys(mano).forEach(function (r) { mo.push({ rol: r, dias: mano[r] }); });
    mo.sort(function (a, b) { return b.dias - a.dias; });
    return { obra: obra, materiales: mats, mano: mo, escombro: escombro, viajes: viajes,
             jornales: jornales + (jornales > 0 ? jornales * MAESTRO_POR_JORNAL : 0) };
  }

  // Del formulario a las partidas de obra. Solo se convierte lo que el ingeniero midió; lo que quedó sin medir se
  // devuelve aparte, en «pendientes», y sale impreso para que nadie lo lea como «no hace falta».
  // El volumen de escombros se calcula siempre —sale de la huella por el número de pisos— pero solo significa
  // algo si la visita abrió el módulo de demolición. Sin esta puerta una edificación habitable aparecía con
  // ciento cuarenta metros cúbicos por retirar, y con ellos se inflaba todo el cálculo de jornales.
  function volumenEscombros() {
    var hay = HAY_DEM;
    var v = +D.volumen_final;
    return (hay && isFinite(v) && v > 0) ? v : 0;
  }

  // El paso 4 describe LA CASA; A.8 dice QUÉ SE VA A INTERVENIR. No tienen por qué coincidir: en
  // un apartamento de un octavo piso se interviene el cielo raso y arriba hay teja de barro. Se
  // cobraba el del paso 4 sin mirar el otro, y salían 41 m² de teja de zinc para una losa maciza.
  // Cuando se contradicen no se elige: se deja pendiente, que se ve y se corrige.
  function tipoSegunTexto(s) {
    var t = String(s || '').toLowerCase();
    if (!t) return '';
    if (/cielo\s*raso|losa|placa|concreto|drywall|dry wall|yeso|pl\u00e1stico/.test(t)) return 'no_es_cubierta';
    if (/zinc|met\u00e1lic|metalic|l\u00e1mina|lamina|teja de acero/.test(t)) return 'teja_zinc';
    if (/fibrocemento|fibro|asbesto|eternit|superboard|super board/.test(t)) return 'teja_fibrocemento';
    if (/barro|arcilla|espa\u00f1ola|colonial/.test(t)) return 'teja_barro';
    return '';
  }

  function apuDesdeVisita() {
    var num = function (k) { var v = +D[k]; return isFinite(v) && v > 0 ? v : 0; };
    var cant = [], pend = [];

    var panA = num('rep_panete_total_area'), panL = num('rep_panete_total_long');
    if (panA) { cant.push(['retiro_panete', panA, 'Pañete dañado por área']);
                cant.push(['panete_nuevo', panA, 'Pañete dañado por área']);
                cant.push(['pintura', panA, 'Pañete dañado por área']); }
    if (panL) cant.push(['resane_fisura', panL, 'Fisuras en pañete']);

    var colA = num('rep_col_total_area'), colL = num('rep_col_total_long');
    if (colA) { cant.push(['retiro_panete', colA, 'Recubrimiento de columna']);
                cant.push(['panete_nuevo', colA, 'Recubrimiento de columna']); }
    if (colL) cant.push(['resane_fisura', colL, 'Fisuras en recubrimiento de columna']);

    // El revoque del cielo raso (B.8) es un pañete en el cielo, y el recubrimiento de las vigas (B.9)
    // es el de las columnas: se convierten igual. Sus totales ya cuentan solo lo que se ve.
    var cieA = num('rep_cielo_total_area'), cieL = num('rep_cielo_total_long');
    if (cieA) { cant.push(['retiro_panete', cieA, 'Revoque de cielo raso por área']);
                cant.push(['panete_nuevo', cieA, 'Revoque de cielo raso por área']);
                cant.push(['pintura', cieA, 'Revoque de cielo raso por área']); }
    if (cieL) cant.push(['resane_fisura', cieL, 'Fisuras en revoque de cielo raso']);
    var vigA = num('rep_vig_total_area'), vigL = num('rep_vig_total_long');
    if (vigA) { cant.push(['retiro_panete', vigA, 'Recubrimiento de viga']);
                cant.push(['panete_nuevo', vigA, 'Recubrimiento de viga']); }
    if (vigL) cant.push(['resane_fisura', vigL, 'Fisuras en recubrimiento de viga']);

    // Muro divisorio: lo que se hace con cada uno lo dice su propia ficha (`rep_muro_destino`).
    //
    // ANTES LO DECIDÍA «¿La edificación debe demolerse?», que es una pregunta sobre el edificio
    // entero. Un ingeniero que la respondía bien —«no», la casa se queda en pie— veía desaparecer
    // los metros de los muros que sí había que tumbar, y como no hay ninguna otra pregunta que
    // diga «este muro se va», el informe le devolvía «la visita no dejó cantidades medidas». Iban
    // 624 m² así en 20 visitas de 7 ingenieros, con sus intenciones escritas en las notas
    // («para demoler y reemplazar», «demolición completa») donde nada las leía.
    //
    // El que se repara no suma obra aquí a propósito: el muro se conserva y su acabado entra por
    // el pañete. El que nadie clasificó no se adivina — va a pendientes, que se ve y se corrige.
    var muro = num('rep_muro_total');
    // Una edificación declarada para demolición o en reconstrucción se lleva sus muros por
    // delante, aunque la visita sea anterior a que existiera la pregunta por muro.
    //
    // «¿Debe demolerse?» cuenta solo donde el formulario la pregunta, que es con la casa NO
    // habitable (su relevant). Quien respondía «sí» con uso restringido y luego corregía a habitable
    // dejaba la respuesta escondida, y seguía tumbando los muros de una casa verde. La app ya la
    // borra al esconderla (borra_si_oculto); esto es para las visitas que la trajeron antes.
    var demoler = D.rep_demoler === 'si' && D.eva_clasif_habitabilidad !== 'habitable';
    var todos = !!muro && (D.eva_tipo_intervencion === 'reconstruccion' || demoler);
    // Lo que se reemplaza va por material: el muro nuevo se levanta en el del que se tumba, y el
    // rendimiento que hay es de mampostería. Un muro de drywall que se reemplazaba salía como «Muro
    // divisorio nuevo en mampostería». Los de mampostería (o sin material, como en las visitas de antes)
    // se cuantifican juntos, como siempre; cada otro material, aparte, con su nombre y su «¿cuál?».
    var reemplazos = [], sinClasificar = 0;
    function reemplaza(i, area) {
      var m = D[nFicha('rep_muro_material', i)] || '';
      var k = m && !MAMPOSTERIA[m] ? (valorFicha('rep_muro_material', i) || String(m)) : '';
      for (var j = 0; j < reemplazos.length; j++) if (reemplazos[j].k === k) { reemplazos[j].area += area; return; }
      reemplazos.push({ k: k, area: area });
    }
    // Con el total medido de una vez no hay área por ficha: el total entero sigue lo que dice la
    // ficha 1, que es la que describe ese total. Si se sumara por fichas, se perdería entero.
    if (D.rep_muro_modo === 'global') {
      if (todos || D.rep_muro_destino === 'reemplazar') reemplaza(1, muro);
      else if (!D.rep_muro_destino) sinClasificar = muro;
    } else {
      // Cada ficha es un TIPO de muro (desde el 23-sep): lo que se reemplaza es su área por cuántos
      // muros son así, su subtotal. En una visita anterior la ficha era un muro: subtotal = su área.
      var medido = 0;
      for (var iM = 1; iM <= 20; iM++) {
        var areaM = subtotalTipo('rep_muro_', iM, D[nFicha('rep_muro_area', iM)]);
        if (!areaM) continue;
        medido += areaM;
        var destM = D[nFicha('rep_muro_destino', iM)];
        if (todos || destM === 'reemplazar') reemplaza(iM, areaM);
        else if (!destM) sinClasificar += areaM;
      }
      // «Todos se reemplazan» con un total que no está repartido en las fichas: el resto, con la 1.
      if (todos && muro - medido > 0.005) reemplaza(1, muro - medido);
    }
    if (todos) sinClasificar = 0;
    sinClasificar = Math.round(sinClasificar * 100) / 100;
    reemplazos.forEach(function (r) {
      var a = Math.round(r.area * 100) / 100;
      if (!(a > 0)) return;
      var origen = 'Muro divisorio que se reemplaza' + (r.k ? ' · ' + r.k : '');
      cant.push(['demolicion_muro', a, origen]);
      cant.push([r.k ? 'muro_nuevo_otro' : 'muro_nuevo', a, origen]);
    });
    if (sinClasificar > 0) {
      pend.push(['Muro divisorio', sinClasificar + ' m² medidos sin decir si el muro se repara o se reemplaza. ' +
        'Las visitas anteriores al 21-sep-2026 no tenían esa pregunta: hay que confirmarlo con quien la hizo']);
    }
    // El formulario llena el muro 1 con las medidas de A.8 (arrastre_a8), y en A.8 se suele medir el
    // total de los muros. Si la visita describe más muros y el 1 sigue con lo de A.8, ese total puede
    // estar sumado otra vez: no se adivina, se dice. Solo en visitas donde el formulario arrastró.
    // cuántos MUROS (la suma de los tipos), no cuántos tipos: un solo tipo de tres muros con las
    // medidas de A.8 también cuenta tres veces lo que quizá ya era el total
    var nMuros = D.rep_muro_cuantos !== '' && D.rep_muro_cuantos != null && isFinite(+D.rep_muro_cuantos)
      ? Math.floor(+D.rep_muro_cuantos) : Math.floor(+D.rep_muro_elementos || 0);
    if (D.arrastre_a8 === 'si' && D.rep_muro_dano === 'si' && D.rep_muro_modo !== 'global' && nMuros >= 2 &&
        num('eva_ancho_muros') && +D.rep_muro_longitud === +D.eva_ancho_muros && +D.rep_muro_altura === +D.eva_alto_muros) {
      pend.push(['Muro divisorio', 'El muro 1 tiene las medidas de A.8 y la visita describe ' + nMuros + ' muros: si en ' +
        'A.8 se midió el total, el área de los muros está contada dos veces. Hay que confirmarlo con quien hizo la visita']);
    }

    // Ventanas y dinteles se miden en campo y no llegaban a ninguna parte: ni a las cantidades ni a lo
    // que falta. Sin rendimiento cargado no se pueden convertir en jornales, pero desaparecer no es una
    // opción: la medida entra en lo que falta medir, que es donde van las partidas que existen y todavía
    // no se saben presupuestar.
    var ven = num('rep_ven_total');
    if (ven) pend.push(['Ventanas', ven + ' m² de ventana dañada: el vidrio y la carpintería quedan por presupuestar']);
    var din = num('rep_din_total');
    if (din) pend.push(['Dinteles', din + ' m de vano con dintel dañado: queda por presupuestar']);

    // Pisos y enchapes (B.7), instalaciones eléctricas (B.10) y baños (B.11). No tienen rendimiento:
    // van a las cantidades con su unidad. Cada medida cuenta solo si su pregunta dijo que sí: una que
    // quedó escondida porque después se dijo que no, no se cobra.
    if (D.rep_enchape_dano === 'si') {
      var acab = multiple('rep_enchape_acabado'), enc = 'Piso o enchape' + (acab ? ': ' + acab : '');
      if (num('rep_enchape_area')) cant.push(['reposicion_enchape', num('rep_enchape_area'), enc]);
      if (D.rep_enchape_fragua === 'si' && num('rep_enchape_fragua_area')) {
        cant.push(['fragua_boquilla', num('rep_enchape_fragua_area'), enc]);
      }
      if (D.rep_enchape_contrapiso === 'si' && num('rep_enchape_contrapiso_area')) {
        cant.push(['reparacion_contrapiso', num('rep_enchape_contrapiso_area'), 'Contrapiso bajo el enchape']);
      }
    }
    if (D.rep_elec_dano === 'si') {
      if (num('rep_elec_puntos')) cant.push(['salida_electrica', num('rep_elec_puntos'), 'Instalaciones eléctricas']);
      if (D.rep_elec_tablero === 'si') cant.push(['tablero_electrico', 1, 'Tablero eléctrico']);
    }
    if (D.rep_bano_dano === 'si') {
      [['sanitario', 'rep_bano_sanitarios'], ['lavamanos', 'rep_bano_lavamanos'], ['ducha', 'rep_bano_duchas'],
       ['griferia', 'rep_bano_griferias'], ['enchape_bano', 'rep_bano_enchape'], ['tuberia', 'rep_bano_tuberia']
      ].forEach(function (p) { if (num(p[1])) cant.push([p[0], num(p[1]), 'Baños']); });
    }

    // La demolición de la edificación se estima una sola vez, en la visita del predio completo.
    // Desde la ficha de un apartamento no se estima: antes se calculaba el edificio entero y se le
    // pegaba a cada ficha, y un edificio de 30 fichas acababa contado 30 veces.
    if (HAY_DEM && D.unidad_npn && !num('volumen_final')) {
      pend.push(['Demolición de la edificación', 'no se estima desde la ficha de una unidad: ' +
        'el volumen del edificio se calcula una vez, en la visita del predio completo']);
    }
    // Lo mismo en las zonas comunes, que pueden ser varias por edificio: solo la que dice que estima el
    // edificio lo cuenta. Las demás salían con el edificio entero, y panel_resumen las sumaba todas.
    if (HAY_DEM && D.alcance === 'zonas_comunes' && D.dem_estima_edificio !== 'si' && !num('volumen_final')) {
      pend.push(['Demolición de la edificación', 'no se estima desde esta visita de zonas comunes: ' +
        'el volumen del edificio se calcula una sola vez, en la visita que lo estima']);
    }

    var cub = num('eva_area_cubierta');
    if (cub) {
      var t = D.tipo_cubierta, escrito = String(D.eva_mat_cubierta || '').trim();
      var dice = tipoSegunTexto(escrito);
      // Solo se cuantifica cuando lo escrito CONFIRMA el tipo, o cuando no se escribió nada. Que
      // no se reconozca el material no es permiso para usar el del paso 4: es justo la duda.
      if (dice === 'no_es_cubierta') {
        pend.push(['Cubierta', cub + ' m² medidos, pero el material anotado es «' + escrito +
          '»: eso no es una cubierta y no se cuantifica con rendimiento de teja']);
      } else if (escrito && !dice) {
        pend.push(['Cubierta', cub + ' m² medidos en «' + escrito +
          '»: ese material no se reconoce como teja, así que no se cuantifica']);
      } else if (dice && dice !== t) {
        pend.push(['Cubierta', cub + ' m² medidos: en la evaluación dice «' + escrito +
          '» y en la descripción de la casa «' + (valorCon('tipo_cubierta') || 'sin registrar') +
          '». No se cuantifica hasta saber cuál vale']);
      }
      else if (t === 'teja_barro') cant.push(['teja_barro', Math.round(cub * TEJAS_BARRO_M2), 'Cubierta en teja de barro']);
      else if (t === 'teja_fibrocemento') cant.push(['teja_fibro', cub, 'Cubierta en fibrocemento']);
      else if (t === 'teja_zinc') cant.push(['teja_zinc', cub, 'Cubierta en zinc']);
      else pend.push(['Cubierta', cub + ' m² medidos, tipo de teja «' + (valorCon('tipo_cubierta') || 'sin registrar') + '»: queda por presupuestar']);
    }

    var cie = num('eva_area_cielo');
    // Si además se midió el revoque en B.8, se dice que va aparte: puede ser el mismo cielo o no (un
    // cielo falso de drywall no tiene revoque), y quien lea no debe sumar las dos cifras sin mirarlo.
    if (cie) pend.push(['Cielo raso', cie + ' m² a intervenir en ' +
      (D.eva_mat_cielo || 'material sin anotar') + ': queda por presupuestar' +
      (cieA || cieL ? '. El revoque medido en B.8 va aparte, en las cantidades' : '')]);
    // El contrapiso sigue la regla del cielo raso: se mide en A.8 y no hay rendimiento con que
    // convertirlo en obra, así que va a lo que falta, con su material, en vez de desaparecer.
    // Si B.7 midió el contrapiso bajo el enchape, esa es la medida de detalle y ya está en las
    // cantidades: lo de A.8 se calla, como con los muros, para no contarlo dos veces.
    var cpi = num('eva_area_contrapiso');
    var cpiB7 = D.rep_enchape_dano === 'si' && D.rep_enchape_contrapiso === 'si' && num('rep_enchape_contrapiso_area');
    if (cpi && !cpiB7) pend.push(['Contrapiso', cpi + ' m² a intervenir en ' +
      (D.eva_mat_contrapiso || 'material sin anotar') + ': queda por presupuestar']);

    var est = num('eva_area_est_cubierta');
    if (est) {
      if (SELV(D.mat_sop_cubierta, 'madera')) pend.push(['Estructura de cubierta', est + ' m² en madera: el rendimiento de la correa va por metro lineal, falta la longitud']);
      else pend.push(['Estructura de cubierta', est + ' m² en ' + (multiple('mat_sop_cubierta') || textoValor('mat_sop_cubierta') || 'material sin registrar') + ': queda por presupuestar']);
    }
    // Lo marcado en A.8 solo se calla cuando reparabilidad trae la medida de detalle, que es la
    // buena. Antes también lo callaba el pañete —`!panA`—, y eso no se sostiene: el pañete no es
    // un muro, así que unos metros de muro marcados en A.8 desaparecían por haber medido otra cosa.
    var mur = num('eva_area_muros');
    if (mur && !muro) pend.push(['Muros a intervenir', mur + ' m² marcados en la evaluación, sin medida de detalle en reparabilidad']);
    var pla = num('eva_area_placa');
    if (pla) pend.push(['Placa', pla + ' m² a intervenir: la obra de placa se presupuesta con diseño, no con una cuenta rápida']);

    // Apuntalar: desde el 23-sep A.7 pide cuántos puntales, dónde y la longitud. Con la longitud es
    // una cantidad; sin ella sigue faltando, pero ya se sabe cuántos puntales y dónde. Una visita de
    // antes, que no trae ninguna de las dos cosas, sale como siempre.
    var medidas = D.eva_medidas || [];
    if (medidas.indexOf && medidas.indexOf('apuntalar') >= 0) {
      var apL = num('eva_apuntalar_longitud'), apN = num('eva_apuntalar_puntales');
      var apD = String(D.eva_apuntalar_donde == null ? '' : D.eva_apuntalar_donde).trim();
      if (apL) cant.push(['apuntalamiento', apL, 'Medida de seguridad']);
      else if (apN) pend.push(['Apuntalamiento', apN + (apN === 1 ? ' puntal' : ' puntales') +
        (apD ? ' en «' + apD + '»' : '') + '; falta la longitud a apuntalar en metros']);
      else pend.push(['Apuntalamiento', 'marcado como medida de seguridad; falta la longitud a apuntalar en metros']);
    }

    // El retiro va al final y sobre el total: lo que haya que demoler más lo que generan las propias obras de
    // reparación. Un pañete picado también son escombros que alguien tiene que cargar y botar.
    var dem = volumenEscombros(), propio = apuCalcula(cant).escombro;
    var esc = Math.round((dem + propio) * 100) / 100;
    if (esc > 0) {
      cant.push(['retiro_escombro', esc,
        dem > 0 ? 'Escombros de demolición y de obra' : 'Escombros generados por la obra']);
    }

    return { cantidades: cant, pendientes: pend, r: apuCalcula(cant), demolicion: dem };
  }

  // ---- armado del documento ----------------------------------------------------------------------------------
  var SEM_INF = { n: ['Ninguno', '#1F7A44'], l: ['Leve', '#86A81E'], m: ['Moderado', '#C98A00'],
                  s: ['Severo', '#B3261E'], na: ['No aplica', '#9AA8B5'] };
  var DANO_EST = [['eva_dano_columnas', 'Columnas'], ['eva_dano_muros_portantes', 'Muros portantes'],
    ['eva_dano_vigas', 'Vigas'], ['eva_dano_nodos', 'Nodos o conexiones'], ['eva_dano_riostras', 'Riostras'],
    ['eva_dano_entrepiso', 'Entrepiso']];
  var DANO_NO_EST = [['eva_dano_muros_fachada', 'Muros de fachada y antepechos'],
    ['eva_dano_muros_div', 'Muros divisorios'], ['eva_dano_ventanales', 'Ventanales y vidrios'],
    ['eva_dano_cielo_raso', 'Cielo raso y luminarias'], ['eva_dano_cubiertas', 'Cubiertas'],
    ['eva_dano_escaleras', 'Escaleras'], ['eva_dano_ascensores', 'Ascensores'], ['eva_dano_balcones', 'Balcones'],
    ['eva_dano_tanques', 'Tanques elevados'], ['eva_dano_gas', 'Instalaciones de gas'],
    ['eva_dano_electricas', 'Instalaciones eléctricas'], ['eva_dano_acueducto', 'Acueducto y alcantarillado'],
    ['eva_dano_otros', 'Otros']];
  var PELIGROS_INF = [['estado_colapso', 'Estado de colapso'], ['inclinacion', 'Inclinación evidente'],
    ['eva_riesgo_adyacentes', 'Riesgo por edificaciones adyacentes'],
    ['eva_licuacion', 'Licuación, asentamiento o subsidencia'], ['eva_mov_masa', 'Movimientos en masa cercanos'],
    ['eva_piso_debil', 'Piso débil'], ['eva_columna_corta', 'Columna corta'],
    ['eva_cambios_rigidez', 'Cambios drásticos de rigidez'], ['eva_amenaza_hidrica', 'Amenaza por cuerpos hídricos'],
    ['esc_asbesto', 'Evidencia de asbesto']];

  function n2(v) {
    var x = Number(v);
    if (!isFinite(x)) return '—';
    return x.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fechaLarga(iso) {
    var M = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre',
             'octubre', 'noviembre', 'diciembre'];
    var d = iso ? new Date(iso) : new Date();
    if (isNaN(d)) d = new Date();
    return d.getDate() + ' de ' + M[d.getMonth()] + ' de ' + d.getFullYear();
  }
  function bonito(v) {
    var t = String(v || '').replace(/_/g, ' ');
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  }

  // ¿está este valor elegido? Sirve igual si el campo guarda uno o varios.
  function SELV(v, c) { return Array.isArray(v) ? v.indexOf(c) > -1 : v === c; }

  // El documento del evaluador, con sus cuatro últimos dígitos. Completo, el informe —que se entrega
  // al propietario y circula— llevaba impresa la credencial de la sesión de campo de 21 de los 24
  // ingenieros, cuyo token es la cédula. Quién firmó lo dicen el nombre y la matrícula profesional.
  function documentoOculto(v) {
    var s = String(v == null ? '' : v).trim();
    if (s.length <= 4) return s;
    return new Array(s.length - 3).join('•') + s.slice(-4);
  }

  // «Otro» a secas no le dice nada a quien lee el documento: donde el formulario pidió cuál, el
  // informe lo imprime al lado, «Otro: bodega de café». El texto vive en <campo>_otro (o _otra),
  // que es lo que pone el motor; muros_divisorios guarda el suyo en muros_otro desde antes de la
  // regla. Es la misma regla del formulario para saber qué opción es un «otro»: el valor acaba en
  // otro, otros u otra.
  var CUAL_APARTE = { muros_divisorios: 'muros_otro' };
  function esOtro(v) { return /(^|_)(otro|otros|otra)$/.test(String(v)); }
  // «Mixto» también pide cuál: en sist_estructural y sist_entrepiso abre «Especifique cuáles», y el
  // PDF decía «Sistema estructural: Mixto» y se callaba lo que el ingeniero escribió (obligatorio).
  // El formulario lo decide con el `cuando` de cada subcampo; el panel no tiene subcampos, así que
  // aquí va la misma regla para las dos páginas, y una prueba la compara con el esquema.
  var ABRE_CUAL = { mixto: true };
  function pideCual(v) { return esOtro(v) || ABRE_CUAL[String(v)] === true; }
  function cualDe(name) {
    var k = [CUAL_APARTE[name], name + '_otro', name + '_otra'];
    for (var i = 0; i < k.length; i++) {
      var t = k[i] ? D[k[i]] : null;
      if (typeof t === 'string' && t.trim()) return t.trim();
    }
    return '';
  }
  function conCual(name, x, texto) {
    var c = pideCual(x) ? cualDe(name) : '';
    return c ? texto + ': ' + c : texto;
  }
  // La etiqueta de una respuesta única, con su «cuál» si es un «Otro».
  function valorCon(name) {
    var t = textoValor(name);
    return t ? conCual(name, D[name], t) : t;
  }

  function multiple(name) {
    var v = D[name], f = idxCampo[name];
    if (!v || !v.length || !f) return '';
    return (Array.isArray(v) ? v : [v]).map(function (x) { return conCual(name, x, etiqueta(f, x)); }).join(', ');
  }

  // Los pisos que marca el control 'pisos' del formulario: 's2', 's1' son sótanos y '1', '2'…
  // pisos. Se leen de abajo arriba —«S2, S1, 1, 2»— en el orden de la edificación y no en el que
  // se tocaron. El panel usa esta misma función para su ficha: es una sola regla para las dos.
  // «Otro» (23-sep: terraza, mezanine, cubierta) va al final y, si se da, con su «¿cuál?»: «1, 2, Otro:
  // terraza». El panel escribe el «¿cuál?» en su propia fila, así que lo pasa vacío.
  function textoPisos(v, cual) {
    var a = Array.isArray(v) ? v : (v === '' || v === null || v === undefined ? [] : [v]);
    function nivel(x) {
      var m = /^s(\d+)$/i.exec(String(x));
      if (m) return -Number(m[1]);
      return /^\d+$/.test(String(x)) ? Number(x) : Infinity;   // lo que no sea un piso, al final
    }
    return a.filter(function (x) { return x !== '' && x !== null && x !== undefined; })
      .slice().sort(function (x, y) {
        var p = nivel(x), q = nivel(y);
        return p === q ? String(x).localeCompare(String(y)) : (p < q ? -1 : 1);
      })
      .map(function (x) {
        var m = /^s(\d+)$/i.exec(String(x));
        if (m) return 'S' + m[1];
        if (String(x) === 'otro') {
          var c = String(cual == null ? '' : cual).trim();
          return c ? 'Otro: ' + c : 'Otro';
        }
        return String(x);
      })
      .join(', ');
  }
  function escalaHTML(v) {
    if (!v || v === 'na') return '<span class="na">No aplica</span>';
    var orden = ['n', 'l', 'm', 's'], h = '<span class="esc">';
    orden.forEach(function (o) {
      h += '<i class="' + (o === v ? 'on' : '') + '"' + (o === v ? ' style="background:' + SEM_INF[o][1] + '"' : '') +
           '>' + o.toUpperCase() + '</i>';
    });
    return h + '</span>';
  }
  function filaDanoHTML(par) {
    var v = D[par[0]];
    if (!v) return '';
    var s = SEM_INF[v] || SEM_INF.na;
    return '<tr><td>' + esc(par[1]) + '</td><td class="c">' + escalaHTML(v) + '</td>' +
           '<td class="c est" style="color:' + s[1] + '">' + esc(s[0]) + '</td></tr>';
  }
  function tablaDano(titulo, lista) {
    var filas = lista.map(filaDanoHTML).join('');
    if (!filas) return '';
    return '<table><thead><tr><th>' + esc(titulo) + '</th><th class="c">Escala</th>' +
           '<th class="c">Nivel</th></tr></thead><tbody>' + filas + '</tbody></table>';
  }

  // Las fotografías se guardan como data URL dentro de la visita: entran directo en el documento y el informe
  // sigue saliendo sin señal.
  function fotosInforme() {
    var out = [];
    Object.keys(D).forEach(function (k) {
      if (k === 'evaluador_firma') return;
      var v = D[k];
      var arr = Array.isArray(v) ? v : (typeof v === 'string' ? [v] : null);
      if (!arr || !arr.length || typeof arr[0] !== 'string') return;
      // En el teléfono la foto ES el dato (data URL). En el panel el dato es la ruta en Storage y
      // hay que pedir una URL firmada. Quien llama sabe cuál de las dos cosas tiene.
      if (arr[0].slice(0, 5) !== 'data:') {
        if (!FOTO) return;
        arr = arr.map(function (ruta, n) { return FOTO(k, n, ruta); }).filter(Boolean);
        if (!arr.length) return;
      }
      var f = idxCampo[k];
      // El rótulo sale del propio formulario: «Fotografía del daño - Columnas» se queda en «Columnas».
      var lab = (f && f.label) ? String(f.label)
        .replace(/^Fotograf[ií]as? (del da[nñ]o )?(en |de )?(el |la |los |las )?/i, '')
        .replace(/^- /, '').trim() : k;
      lab = lab.charAt(0).toUpperCase() + lab.slice(1);
      arr.forEach(function (src) { out.push([lab, src]); });
    });
    return out;
  }

  function rej(pares) {
    var h = '';
    pares.forEach(function (p) {
      if (!p[1] && p[1] !== 0) return;
      h += '<div' + (p[2] ? ' class="' + p[2] + '"' : '') + '><span>' + esc(p[0]) + '</span>' +
           '<b' + (p[3] ? ' class="mono"' : '') + '>' + esc(String(p[1])) + '</b></div>';
    });
    return h ? '<div class="rej">' + h + '</div>' : '';
  }

  // ---- lo que se mide en Reparabilidad desde el 23-sep ---------------------------------------------
  // Cada cifra con su unidad. Se imprime solo lo que la visita trae, así que un informe anterior a la
  // fase 3 sale igual que antes.
  function nFicha(n, i) { return i === 1 ? n : n + '_' + i; }
  // Cada ficha de reparabilidad es un TIPO desde el 23-sep: cuántos elementos son así (vacío = 1, como
  // en el formulario) y su subtotal. El subtotal es el que calculó el teléfono (<prefijo>subtotal) o,
  // si la visita no lo trae —las de antes, en el panel—, la medida de la ficha, que era la de un
  // elemento: la misma cuenta del formulario, round(round(medida, 2) × cuántos, 2).
  function igualesTipo(pre, i) {
    var v = D[nFicha(pre + 'iguales', i)];
    return v === '' || v === null || v === undefined || !isFinite(+v) ? 1 : +v;
  }
  function centesimas(x) { return Math.round(Number(x) * 100) / 100; }
  function subtotalTipo(pre, i, medida) {
    var s = D[nFicha(pre + 'subtotal', i)];
    if (s !== '' && s !== null && s !== undefined && isFinite(+s)) return +s > 0 ? +s : 0;
    var m = +medida;
    return isFinite(m) && m > 0 ? centesimas(centesimas(m) * igualesTipo(pre, i)) : 0;
  }
  function und(n) { var x = D[n]; return x === '' || x === null || x === undefined || !isFinite(+x) ? '' : String(+x) + ' und'; }
  function conUnidad(n, u) { var x = +D[n]; return D[n] !== '' && D[n] !== undefined && isFinite(x) && x > 0 ? n2(x) + ' ' + u : ''; }
  // La etiqueta de una respuesta de la ficha i, con su «¿cuál?» si es un «Otro». El motor escribe el de
  // la ficha 2 como <campo>_otro_2, no <campo>_2_otro, así que cualDe() no lo encuentra solo.
  function valorFicha(base, i) {
    var n = nFicha(base, i), t = textoValor(n);
    if (!t || !pideCual(D[n])) return t;
    var c = String(D[nFicha(base + '_otro', i)] == null ? '' : D[nFicha(base + '_otro', i)]).trim();
    return c ? t + ': ' + c : t;
  }
  function notaDe(n, titulo) {
    var t = String(D[n] == null ? '' : D[n]).trim();
    return t ? '<p class="nota"><b>' + esc(titulo) + '.</b> ' + esc(t) + '</p>' : '';
  }
  var ELEMENTOS_A8 = ['muros', 'cubierta', 'cielo', 'est_cubierta', 'placa', 'contrapiso'];
  var MODOS_INF = [['Muros divisorios', 'rep_muro_modo', 'rep_muro_dano'],
                   ['Recubrimiento de columnas', 'rep_col_modo', 'rep_col_dano'],
                   ['Recubrimiento de vigas', 'rep_vig_modo', 'rep_vig_dano']];

  // Pañete, columnas, ventanas, dinteles, cielo raso y vigas, por tipos (23-sep): cada fila es un tipo
  // con sus medidas, lo que da cada elemento, cuántos son y su subtotal; debajo, el total del apartado,
  // que es el mismo de las cantidades de obra. Los muros tienen su propia tabla (material, qué se hace).
  var TIPOS_INF = [
    { pre: 'rep_Panete_', titulo: 'Pañete', varios: 'Zonas', forma: true,
      totales: [['rep_panete_total_area', 'm²'], ['rep_panete_total_long', 'm']] },
    { pre: 'rep_col_', titulo: 'Recubrimiento de columnas', varios: 'Columnas', forma: true, modo: 'rep_col_modo',
      totales: [['rep_col_total_area', 'm²'], ['rep_col_total_long', 'm']] },
    { pre: 'rep_ven_', titulo: 'Ventanas', varios: 'Ventanas', totales: [['rep_ven_total', 'm²']] },
    { pre: 'rep_din_', titulo: 'Dinteles', varios: 'Dinteles', totales: [['rep_din_total', 'm']] },
    // `notas`: el apartado imprime las observaciones de cada tipo (los de la fase 3; los de antes no
    // las imprimían y así siguen, para no cambiar el documento de las visitas ya enviadas)
    { pre: 'rep_cielo_', titulo: 'Revoque de cielo raso', varios: 'Zonas', forma: true, notas: 'zona',
      totales: [['rep_cielo_total_area', 'm²'], ['rep_cielo_total_long', 'm']] },
    { pre: 'rep_vig_', titulo: 'Recubrimiento de vigas', varios: 'Vigas', forma: true, modo: 'rep_vig_modo', notas: 'viga',
      totales: [['rep_vig_total_area', 'm²'], ['rep_vig_total_long', 'm']] }
  ];
  // [qué se midió, medida de un elemento sin el subtotal del teléfono, unidad] del tipo i
  function medidasTipo(t, i) {
    var g = function (b) { var x = +D[nFicha(t.pre + b, i)]; return isFinite(x) && x > 0 ? x : 0; };
    var tipo = D[nFicha(t.pre + 'tipo', i)];
    if (t.pre === 'rep_ven_') return [g('alto') && g('ancho') ? n2(g('alto')) + ' × ' + n2(g('ancho')) + ' m' : '', g('alto') * g('ancho'), 'm²'];
    if (t.pre === 'rep_din_') return [g('ancho') ? 'Vano de ' + n2(g('ancho')) + ' m' : '', g('ancho'), 'm'];
    if (tipo === 'lineal') {
      var an = textoValor(nFicha(t.pre + 'ancho_fisura', i));
      return ['Fisura' + (an ? ' de ' + an : ''), g('longitud'), 'm'];
    }
    if (tipo !== 'area') return ['', 0, 'm²'];
    if (t.pre === 'rep_col_' && g('lado_a') && g('altura')) {
      return ['Sección ' + n2(g('lado_a')) + ' × ' + n2(g('lado_b') || g('lado_a')) + ' m, tramo de ' + n2(g('altura')) + ' m', 0, 'm²'];
    }
    if (t.pre === 'rep_vig_' && g('base') && g('peralte') && g('largo')) {
      return ['Base ' + n2(g('base')) + ', peralte ' + n2(g('peralte')) + ', tramo de ' + n2(g('largo')) + ' m', 0, 'm²'];
    }
    return [t.pre === 'rep_col_' || t.pre === 'rep_vig_' ? 'Área escrita' : 'Por área', g('area'), 'm²'];
  }
  function tiposReparabilidad() {
    var out = [];
    TIPOS_INF.forEach(function (t) {
      if (D[t.pre + 'dano'] !== 'si') return;
      var global = t.modo && D[t.modo] === 'global';
      var tot = t.totales.map(function (x) { return conUnidad(x[0], x[1]); }).filter(Boolean).join(' y ');
      // las observaciones de cada tipo, en el mismo bloque que su tabla: un solo apartado por título
      var obs = '';
      if (t.notas) {
        for (var k = 1; k <= 20; k++) {
          obs += notaDe(nFicha(t.pre + 'notas', k), global ? 'Observaciones' : 'Observaciones, ' + t.notas + ' tipo ' + k);
        }
      }
      if (global) {
        if (tot || obs) out.push('<h3>' + esc(t.titulo) + '</h3>' + (tot ? rej([['El total, medido de una vez', tot, 'w2']]) : '') + obs);
        return;
      }
      var n = Math.min(20, Math.max(0, Math.floor(+D[t.pre + 'elementos'] || 0))), filas = [], cuantos = 0;
      for (var i = 1; i <= n; i++) {
        var m = medidasTipo(t, i), cu = igualesTipo(t.pre, i), sub = subtotalTipo(t.pre, i, m[1]);
        if (!m[0] && !sub) continue;
        cuantos += cu;
        filas.push('<tr><td>Tipo ' + i + '</td><td>' + esc(m[0] || '—') + '</td>' +
          '<td class="d">' + (sub ? esc(n2(centesimas(sub / cu)) + ' ' + m[2]) : '—') + '</td>' +
          '<td class="d">' + esc(String(cu)) + '</td><td class="d">' + (sub ? esc(n2(sub) + ' ' + m[2]) : '—') + '</td></tr>');
      }
      if (!filas.length) {
        if (obs) out.push('<h3>' + esc(t.titulo) + '</h3>' + obs);
        return;
      }
      out.push('<h3>' + esc(t.titulo) + '</h3><table><thead><tr><th>Tipo</th><th>Medidas</th>' +
        '<th class="d">Por elemento</th><th class="d">' + esc(t.varios) + '</th><th class="d">Subtotal</th></tr></thead><tbody>' +
        filas.join('') + '<tr><td colspan="3"><b>Total</b></td><td class="d"><b>' + esc(String(cuantos)) + '</b></td>' +
        '<td class="d"><b>' + esc(tot || '—') + '</b></td></tr></tbody></table>' + obs);
    });
    return out;
  }

  // Devuelve los trozos del apartado, cada uno en su bloque: el reparto en hojas mueve bloques
  // enteros y uno muy alto se cortaría.
  function detalleReparabilidad() {
    var trozos = [];
    // cómo se midió cada apartado que lo pregunta: uno por uno o el total de una vez
    var modos = MODOS_INF.filter(function (m) { return D[m[2]] === 'si' && D[m[1]]; })
      .map(function (m) { return [m[0], textoValor(m[1]), 'w2']; });
    // lo que se trajo de A.8 al muro 1 y sigue igual: la medida no se tomó dos veces
    var deA8 = D.arrastre_a8 === 'si' && D.rep_muro_dano === 'si' && D.rep_muro_modo !== 'global' &&
               +D.rep_muro_altura === +D.eva_alto_muros && +D.rep_muro_longitud === +D.eva_ancho_muros;
    if (modos.length) {
      trozos.push('<h3>Cómo se midió</h3>' + rej(modos) +
        (deA8 ? '<p class="nota">La altura y la longitud del muro 1 son las que se midieron en A.8.</p>' : ''));
    }

    // Cada tipo de muro con su material (y su «¿cuál?»), lo que se hace con él, su área, cuántos muros
    // son así y su subtotal. El material se pide en cada ficha y no salía en ninguna parte del
    // documento: un muro de drywall que se reemplaza se leía como uno de ladrillo.
    if (D.rep_muro_dano === 'si') {
      var global = D.rep_muro_modo === 'global';
      var nM = global ? 1 : Math.min(20, Math.max(1, Math.floor(+D.rep_muro_elementos || 1)));
      var muros = [], nMur = 0;
      for (var q = 1; q <= nM; q++) {
        var mat = valorFicha('rep_muro_material', q), des = textoValor(nFicha('rep_muro_destino', q));
        var ar = global ? '' : conUnidad(nFicha('rep_muro_area', q), 'm²');
        var sub = global ? conUnidad('rep_muro_total', 'm²')
                         : (subtotalTipo('rep_muro_', q, D[nFicha('rep_muro_area', q)]) ? n2(subtotalTipo('rep_muro_', q, D[nFicha('rep_muro_area', q)])) + ' m²' : '');
        if (!mat && !des && !ar && !sub) continue;
        var cu = global ? '' : igualesTipo('rep_muro_', q);
        if (cu) nMur += cu;
        muros.push([global ? 'Muros (el total)' : 'Tipo ' + q, mat, des, ar, cu === '' ? '' : String(cu), sub]);
      }
      if (muros.length) {
        trozos.push('<h3>Muros divisorios</h3><table><thead><tr><th>Tipo</th><th>Material</th><th>Qué se hace</th>' +
          '<th class="d">Área de cada muro</th><th class="d">Muros</th><th class="d">Subtotal</th></tr></thead><tbody>' +
          muros.map(function (f) {
            return '<tr><td>' + esc(f[0]) + '</td><td>' + esc(f[1] || '—') + '</td><td>' + esc(f[2] || '—') + '</td>' +
                   '<td class="d">' + esc(f[3] || '—') + '</td><td class="d">' + esc(f[4] || '—') + '</td>' +
                   '<td class="d">' + esc(f[5] || '—') + '</td></tr>';
          }).join('') +
          (global ? '' : '<tr><td colspan="4"><b>Total</b></td><td class="d"><b>' + esc(String(nMur)) + '</b></td>' +
                         '<td class="d"><b>' + esc(conUnidad('rep_muro_total', 'm²') || '—') + '</b></td></tr>') +
          '</tbody></table>');
      }
    }

    // Los demás apartados por tipos: sus medidas, lo que da cada elemento, cuántos son y el subtotal,
    // con el total de siempre debajo. En una visita anterior cada ficha era un elemento, y así sale:
    // un tipo de uno.
    tiposReparabilidad().forEach(function (t) { trozos.push(t); });

    // el daño de cada muro que se repara, y las fisuras del pañete y del revoque del cielo. La
    // longitud es la de un elemento; si el tipo tiene varios, se dice por cuántos va («0,80 m × 3»).
    var porCuantos = function (pre, i, t) {
      var n = igualesTipo(pre, i);
      return t && n !== 1 ? t + ' × ' + n : t;
    };
    var filas = [];
    if (D.rep_muro_dano === 'si') {
      for (var i = 1; i <= 20; i++) {
        var td = valorFicha('rep_muro_tipo_dano', i);
        if (!td) continue;
        var fis = D[nFicha('rep_muro_tipo_dano', i)] === 'fisura';
        filas.push([D.rep_muro_modo === 'global' ? 'Muros (el total)' : 'Muro tipo ' + i, td,
                    fis ? textoValor(nFicha('rep_muro_ancho_fisura', i)) : '',
                    fis ? porCuantos('rep_muro_', i, conUnidad(nFicha('rep_muro_long_fisura', i), 'ML')) : '']);
      }
    }
    [['rep_Panete_', 'Pañete'], ['rep_cielo_', 'Revoque de cielo raso']].forEach(function (b) {
      if (D[b[0] + 'dano'] !== 'si') return;
      for (var j = 1; j <= 20; j++) {
        var an = textoValor(nFicha(b[0] + 'ancho_fisura', j));
        if (!an || D[nFicha(b[0] + 'tipo', j)] !== 'lineal') continue;
        filas.push([b[1] + ', zona tipo ' + j, 'Fisura', an, porCuantos(b[0], j, conUnidad(nFicha(b[0] + 'longitud', j), 'ML'))]);
      }
    });
    if (filas.length) {
      trozos.push('<h3>Daños que se reparan</h3><table><thead><tr><th>Elemento</th><th>Daño</th>' +
        '<th>Ancho de la fisura</th><th class="d">Longitud</th></tr></thead><tbody>' +
        filas.map(function (f) {
          return '<tr><td>' + esc(f[0]) + '</td><td>' + esc(f[1]) + '</td><td>' + esc(f[2] || '—') + '</td>' +
                 '<td class="d">' + esc(f[3] || '—') + '</td></tr>';
        }).join('') + '</tbody></table>');
    }

    if (D.rep_enchape_dano === 'si') {
      trozos.push('<h3>Pisos y enchapes</h3>' + rej([
        ['Acabado', multiple('rep_enchape_acabado'), 'w2'],
        ['Área dañada', conUnidad('rep_enchape_area', 'm²')],
        ['Fragua y boquilla', D.rep_enchape_fragua === 'si' ? conUnidad('rep_enchape_fragua_area', 'm²') : textoValor('rep_enchape_fragua')],
        ['Contrapiso afectado', D.rep_enchape_contrapiso === 'si' ? conUnidad('rep_enchape_contrapiso_area', 'm²')
          : textoValor('rep_enchape_contrapiso')]
      ]) + notaDe('rep_enchape_notas', 'Observaciones'));
    }
    if (D.rep_elec_dano === 'si') {
      trozos.push('<h3>Instalaciones eléctricas</h3>' + rej([
        ['Puntos o salidas dañadas', und('rep_elec_puntos')],
        ['Cajas', und('rep_elec_cajas')],
        ['Tomacorrientes', und('rep_elec_tomas')],
        ['Interruptores', und('rep_elec_interruptores')],
        ['Luminarias', und('rep_elec_luminarias')],
        ['Tablero eléctrico dañado', textoValor('rep_elec_tablero')]
      ]) + '<p class="nota">Cajas, tomacorrientes, interruptores y luminarias son el detalle de los puntos: ' +
        'no se suman a ellos.</p>' + notaDe('rep_elec_notas', 'Observaciones'));
    }
    if (D.rep_bano_dano === 'si') {
      trozos.push('<h3>Baños</h3>' + rej([
        ['Baños afectados', und('rep_bano_cantidad')],
        ['Sanitarios', und('rep_bano_sanitarios')],
        ['Lavamanos', und('rep_bano_lavamanos')],
        ['Duchas', und('rep_bano_duchas')],
        ['Griferías', und('rep_bano_griferias')],
        ['Enchape de baño', conUnidad('rep_bano_enchape', 'm²')],
        ['Tubería', conUnidad('rep_bano_tuberia', 'ml')]
      ]) + notaDe('rep_bano_notas', 'Observaciones'));
    }
    return trozos;
  }

  // ---------------------------------------------------------------- anexo: correcciones
  // La visita se firmó como sale en el documento, y la firma no se toca. Lo que se corrigió después
  // se dice al final, con su fecha y su motivo: un documento firmado que cambiara sin decirlo no se
  // distinguiría de uno manipulado.
  //
  // La bitácora nombra el dato de tres formas: «respuestas.<campo>» (el editor del teléfono),
  // «foto.<campo>» o «documento.<campo>» (adjuntos) y la columna a secas (lo corregido desde el
  // panel o con la pantalla de los siete datos básicos). Los valores llegan como texto; las listas
  // y los puntos, en JSON.
  var COLUMNAS_CORREGIDAS = {
    codigo_registro: 'Código de registro', direccion: 'Dirección', barrio_vereda: 'Barrio / vereda',
    municipio: 'Municipio', habitabilidad: 'Clasificación de habitabilidad', nivel_dano: 'Nivel de daño',
    estado_colapso: 'Estado de colapso', num_pisos: 'Número de pisos', volumen_escombros: 'Volumen de escombros'
  };
  var UNIDAD_COLUMNA = { volumen_escombros: 'm³' };

  // Lo que el documento no imprime tampoco lo imprime el anexo. El cuerpo nunca enseña el teléfono de
  // quien atendió (decisión #9), el documento del propietario (Ley 1581) ni la clave del equipo, y el
  // anexo los estaba imprimiendo en cuanto alguien los completaba desde el editor: «Teléfono de quien
  // atendió: — → 3005556677», en el PDF del teléfono y en el del panel. De esos se dice que cambiaron,
  // no a qué. Lo mismo con el perfil del evaluador, que no se corrige desde aquí.
  var NO_SE_IMPRIME = { atendio_telefono: true, propietario_documento: true, clave_dispositivo: true };
  function reservado(k) { return NO_SE_IMPRIME[k] === true || /^evaluador_/.test(k); }

  // Los calculados del formulario (tipo calc). El teléfono los manda al corregir, porque el servidor no
  // los recalcula, y la bitácora anota cada uno: corregir la longitud de un muro dejaba en el anexo
  // firmado «rep_muro_area: 8.92 → 9.97» y «rep_muro_total: 8.92 → 9.97», con la clave en crudo. Aquí
  // se cuentan en una línea. La lista es la de visita.html (las fichas 2..20 y el detalle de A.3 los
  // genera el motor); el panel no tiene el esquema, así que la regla vive aquí, una sola para las dos
  // páginas, y una prueba la compara con los calc del esquema.
  var CALCULADOS = {};
  ['cod_registro', 'area_huella_mapa', 'longitud', 'latitud', 'precision_gps', 'area_huella_campo', 'hab_total',
   'eva_sugerencia', 'eva_area_muros', 'eva_area_cubierta', 'eva_area_cielo', 'eva_area_est_cubierta', 'eva_area_placa',
   'eva_area_contrapiso', 'rep_muro_area', 'rep_muro_total', 'rep_panete_total_long', 'rep_panete_total_area',
   'rep_col_total_long', 'rep_col_total_area', 'rep_ven_total', 'rep_din_total', 'rep_cielo_total_long',
   'rep_cielo_total_area', 'rep_vig_total_long', 'rep_vig_total_area', 'dem_area_huella', 'dem_pisos_n',
   'dem_area_pisos', 'dem_factor', 'dem_volumen_calc', 'dem_volumen', 'esc_volumen', 'fecha_texto', 'volumen_final',
   // 23-sep: cada ficha de reparabilidad es un tipo, con su subtotal; y cuántos elementos suman los tipos
   'rep_muro_subtotal', 'rep_Panete_subtotal', 'rep_col_subtotal', 'rep_ven_subtotal', 'rep_din_subtotal',
   'rep_cielo_subtotal', 'rep_vig_subtotal', 'rep_muro_cuantos', 'rep_Panete_cuantos', 'rep_col_cuantos',
   'rep_ven_cuantos', 'rep_din_cuantos', 'rep_cielo_cuantos', 'rep_vig_cuantos'
  ].forEach(function (n) { CALCULADOS[n] = true; });
  function esCalculado(k) {
    return CALCULADOS[k] === true || CALCULADOS[String(k).replace(/_([2-9]|1\d|20)$/, '')] === true ||
           /^eva_det_[a-z_]+_\d+_(area|subtotal)$/.test(k) || /^eva_(peor|peorlbl|areadet|numdet)_[a-z_]+$/.test(k);
  }
  // Los calculados que el documento sí enseña con su nombre: esos siguen saliendo como un dato más.
  var CALC_CON_NOMBRE = {
    cod_registro: ['Código de registro'], volumen_final: ['Volumen de escombros', 'm³'],
    hab_total: ['Personas que habitan'], area_huella_campo: ['Huella medida en campo', 'm²']
  };

  // Un número como lo escribe el documento: con coma decimal, sin el ruido de la coma flotante
  // (152.73600000000002) y con su unidad. Solo si el dato es una medida: un teléfono o un código que
  // son solo dígitos no se tocan.
  function numeroCorregido(x, unidad) {
    var t = String(x);
    if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
    var n = Number(t);
    var s = /\./.test(t) ? n.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : t;
    return unidad ? s + ' ' + unidad : s;
  }
  function valorCorregido(f, v, unidad) {
    if (v === null || v === undefined || v === '') return '—';
    var x = String(v), t;
    if (/^[\[{]/.test(x)) { try { x = JSON.parse(x); } catch (e) { x = String(v); } }
    if (Array.isArray(x) && f && f.ui === 'pisos') {
      t = textoPisos(x);          // «S1, 2», como en el cuerpo, y no «s1, 2»
    } else if (Array.isArray(x)) {
      t = x.map(function (y) { return y && typeof y === 'object' ? (y.nombre || '') : etiqueta(f, y); }).join(', ');
    } else if (x && typeof x === 'object') {
      t = typeof x.lat === 'number' ? x.lat.toFixed(5) + ', ' + x.lon.toFixed(5) : (x.nombre || '');
    } else if (!(f && f.lista) && numeroCorregido(x, unidad) !== null) {
      t = numeroCorregido(x, unidad);
    } else {
      t = String(etiqueta(f, x));
    }
    return t.length > 90 ? t.slice(0, 87) + '…' : t;
  }
  // [nombre, qué cambió], o null para un calculado sin nombre propio (se cuenta aparte).
  function datoCorregido(c) {
    var k = String(c.campo || ''), m = /^(respuestas|foto|documento)\.(.+)$/.exec(k), clase = m ? m[1] : '';
    if (m) k = m[2];
    var f = idxCampo[k] || (LISTAS[k] ? { lista: k } : null);
    var doc = CALC_CON_NOMBRE[k];
    var nombre = (doc && doc[0]) || (f && f.label) || COLUMNAS_CORREGIDAS[k] || k;
    if (clase === 'foto') return [nombre, c.antes ? 'fotografía quitada' : 'fotografía añadida'];
    if (clase === 'documento') {
      var d = valorCorregido(null, c.antes || c.despues);
      return [nombre, (c.antes ? 'documento quitado' : 'documento añadido') + (d !== '—' && d ? ': ' + d : '')];
    }
    if (reservado(k)) return [nombre, 'actualizado (dato reservado: no se imprime)'];
    if (clase === 'respuestas' && esCalculado(k) && !doc) return null;
    var u = (doc && doc[1]) || (f && f.unidad) || UNIDAD_COLUMNA[k] || '';
    return [nombre, valorCorregido(f, c.antes, u) + ' → ' + valorCorregido(f, c.despues, u)];
  }
  function anexoCorrecciones(H) {
    var lista = (CORRECCIONES || []).filter(function (c) { return c && c.campo; });
    if (!lista.length) return [];
    lista = lista.slice().sort(function (a, b) {
      return String(a.creada_en || '').localeCompare(String(b.creada_en || ''));
    });
    // Una corrección = un guardado: sus filas de bitácora llevan la misma hora y el mismo motivo.
    var grupos = [], ult = null;
    lista.forEach(function (c) {
      var k = String(c.creada_en || '') + '|' + (c.motivo || '');
      if (!ult || ult.k !== k) { ult = { k: k, fecha: c.creada_en, motivo: c.motivo || '', datos: [], calc: 0 }; grupos.push(ult); }
      var d = datoCorregido(c);
      if (d) ult.datos.push(d); else ult.calc++;
    });
    // Los calculados del guardado, en una línea al final de sus datos.
    grupos.forEach(function (g) {
      if (g.calc) g.datos.push(['Valores calculados', (g.calc === 1 ? 'uno se actualizó' : g.calc + ' se actualizaron') +
        ' con estos cambios']);
    });
    // En bloques que quepan en una hoja: el reparto no parte un bloque, y uno más alto que la hoja
    // saldría cortado. Un guardado con muchos cambios se parte en filas de doce.
    var filas = [], bloques = [], actual = [], lineas = 0;
    grupos.forEach(function (g) {
      for (var i = 0; i < g.datos.length; i += 12) {
        filas.push({ fecha: g.fecha, motivo: g.motivo, sigue: i > 0, datos: g.datos.slice(i, i + 12) });
      }
    });
    filas.forEach(function (f) {
      if (actual.length && lineas + f.datos.length > 24) { bloques.push(actual); actual = []; lineas = 0; }
      actual.push(f); lineas += f.datos.length;
    });
    if (actual.length) bloques.push(actual);
    return bloques.map(function (b, i) {
      return (i === 0 ? H('Correcciones') + '<p class="nota">La visita se firmó como se lee arriba y la firma' +
          ' no cambia. Estos son los cambios hechos después, cada uno con su fecha y su motivo; la bitácora' +
          ' guarda además quién los hizo.</p>' : '') +
        '<table><thead><tr><th>Fecha</th><th>Qué cambió</th><th>Motivo</th></tr></thead><tbody>' +
        b.map(function (f) {
          return '<tr><td class="elem">' + esc(FDT(f.fecha)) + (f.sigue ? ' (sigue)' : '') + '</td><td>' +
            f.datos.map(function (d) { return '<b>' + esc(d[0]) + ':</b> ' + esc(d[1]); }).join('<br>') +
            '</td><td class="obs">' + esc(f.sigue ? '' : f.motivo) + '</td></tr>';
        }).join('') + '</tbody></table>';
    });
  }

  function informeDoc() {
    var a = ASIG || {};
    var A = apuDesdeVisita(), R = A.r;
    var logo = LOGO || '';
    if (!logo) { try { logo = document.querySelector('.marca .logo img').src; } catch (e) {} }

    var clas = D.eva_clasif_habitabilidad;
    var dict = { habitable: ['Habitable (Verde)', '#1F7A44'], uso_restringido: ['Uso restringido (Amarillo)', '#C98A00'],
                 no_habitable: ['No habitable (Rojo)', '#B3261E'] }[clas] ||
               ['Sin clasificar', '#8A9AA9'];
    if (D.estado_colapso === 'total') dict = ['Colapso total', '#B3261E'];

    // La evaluación de daños es un módulo que puede no diligenciarse: el paso 7 pregunta si hay
    // que hacerla y, cuando se contesta que no, exige el motivo y con cuál módulo se sigue.
    //
    // El informe no lo contaba: los tres sellos salían «Sin clasificar · Sin clasificar · Sin
    // definir», que se lee como un informe roto o a medias. Y no lo está — de las 26 visitas
    // reales, las 4 que salen así son exactamente las 4 que contestaron que no, tres de ellas
    // porque el predio ya estaba levantado. Un documento que calla el motivo obliga a preguntar
    // por teléfono qué pasó con esa visita.
    //
    // Se conservan los tres sellos: el que cambia es el contenido, no la forma.
    var sinEval = D.estado_colapso !== 'total' &&
                  !!D.gate_evaluacion && D.gate_evaluacion !== 'si';
    var previa = '';
    if (sinEval) {
      previa = textoValor('eva_previa_clasif') || '';
      // La fecha, el tipo y la entidad vienen prellenados desde la asignación; se añaden si están,
      // porque una clasificación anterior sin fecha ni autor no se puede usar para decidir nada.
      var det = [D.eva_previa_fecha || '', D.eva_previa_tipo || '', D.eva_previa_entidad || ''].filter(Boolean).join(' · ');
      if (previa && det) previa += ' (' + det + ')';
      // Sin clasificación, decir al menos que la hubo y quién la hizo. La casilla se queda vacía
      // más veces de las que parece: el formulario sólo admite habitable / uso restringido / no
      // habitable, y las categorías de la Alcaldía —«Habitable Post-Intervención», «Peligro de
      // colapso», «Uso habilitado»— no entran, así que el dato existe y no llega. «Hubo una y la
      // hizo la Alcaldía» sigue sirviendo para ir a buscarla; «No registrada» no sirve para nada.
      else if (!previa && D.eva_previa === 'si') previa = det ? 'Sí · ' + det : 'Sí, sin detalle';
    }

    var npn = String(D.unit_Code || a.npn_unidad || a.npn || '');
    // Consecutivo del documento. No puede salir de un contador central: el informe se arma en el teléfono y sin
    // señal. Con la fecha de la inspección y el final del identificador local de la visita queda único y se
    // puede rastrear; la ficha catastral va impresa aparte, en la identificación y en la trazabilidad.
    var fi = D.fecha_hora_inspeccion ? new Date(D.fecha_hora_inspeccion) : new Date();
    if (isNaN(fi)) fi = new Date();
    var dosD = function (n) { return (n < 10 ? '0' : '') + n; };
    var ref = 'INF-' + fi.getFullYear() + dosD(fi.getMonth() + 1) + dosD(fi.getDate()) + '-' +
      (String(REF || '').replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase() || '0000');
    var fecha = fechaLarga(D.fecha_hora_inspeccion);
    // Una visita de las zonas comunes no es la de ninguna vivienda, y el documento lo dice desde el
    // título: sin eso, el informe de la fachada y la cubierta de un edificio se leería como el
    // dictamen de un apartamento.
    var comunes = D.alcance === 'zonas_comunes';
    // Registro sin daños (desde el 25-sep): solo deja constancia de que no se afectó. El documento no
    // puede leerse como una evaluación a medias —«Sin clasificar», «no dejó cantidades»—: dice lo que es.
    var sinDanos = D.sin_danos === 'si';
    // Ya reparado (29-sep): el mismo registro corto, pero la edificación sí se afectó. El documento no
    // puede decir «no se afectó». Las listas van aquí porque el panel no las trae en su esquema.
    var reparado = sinDanos && D.sin_danos_situacion === 'reparado';
    var R_QUE = { muros: 'Muros', panete_fachada: 'Pañete o fachada', cubierta: 'Cubierta o techo', cielo_raso: 'Cielo raso',
      pisos: 'Pisos o enchapes', ventanas: 'Ventanas, puertas o vidrios', instalaciones: 'Instalaciones',
      estructura: 'Columnas, vigas o placa', otro: 'Otro' };
    var R_QUIEN = { propietario: 'El propietario', arrendatario: 'El arrendatario', copropiedad: 'La copropiedad o administración',
      contratista: 'Un contratista o maestro de obra', otro: 'Otro' };
    var queRep = (Array.isArray(D.reparado_que) ? D.reparado_que : String(D.reparado_que || '').split(/[\s,]+/))
      .filter(Boolean).map(function (x) { return R_QUE[x] || x; }).join(', ');
    var titulo = reparado ? 'Registro de visita · Daños ya reparados'
      : sinDanos ? 'Registro de visita · Sin daños por el sismo'
      : 'Informe de evaluación de daños y recursos de recuperación' + (comunes ? ' · Zonas comunes del edificio' : '');
    // En un edificio, el predio y la ficha evaluada son dos números distintos: unit_Code es el del
    // predio matriz (termina en 00000000) y la ficha es unidad_npn, con su rótulo («Piso 3 · Unidad
    // 0301»). El documento llamaba «de la ficha» al del predio y no nombraba la ficha en ninguna parte,
    // y la matrícula que sale al lado es la de la ficha. Las zonas comunes no son de ninguna ficha.
    var ficha = comunes ? '' : String(D.unidad_npn || '');
    var fichaRotulo = ficha ? String(D.unidad_label || '') : '';

    var bloques = [];
    function B(html) { if (html) bloques.push('<section class="blq">' + html + '</section>'); }
    // Los apartados se numeran solos: si una visita no abre demolición, el informe no salta del 9 al 11.
    var nSec = 0;
    function H(t) { return '<h2><i>' + (++nSec) + '</i>' + esc(t) + '</h2>'; }

    // dictamen y cifras gruesas
    if (reparado) B('<div class="dictamen">' +
        '<div class="sello am"><span>Resultado de la visita</span><b style="color:#1F7A44">Ya reparado</b></div>' +
        '<div class="sello"><span>Habitabilidad</span><b>Habitable (Verde)</b></div>' +
        '<div class="sello"><span>Intervención</span><b>No requiere</b></div></div>' +
      '<p class="nota">Se registró que ' + (ficha ? 'la unidad' : 'la edificación') + ' se afectó con el sismo y ya se ' +
        'reparó por completo: no lleva evaluación de daños, reparabilidad ni presupuesto. La constancia son la ' +
        'fotografía de lo reparado y la firma.</p>' +
      rej([['Qué se reparó', queRep || '—', 'w2'], ['Quién hizo la reparación', R_QUIEN[D.reparado_quien] || D.reparado_quien || '—'],
           ['Qué daño tuvo y cómo quedó', D.reparado_detalle || '—', 'w3']]) +
      (D.sin_danos_grupo && D.sin_danos_unidades
        ? '<p class="nota">Se registró en un mismo recorrido junto con otras unidades del edificio (' +
          esc(D.sin_danos_unidades) + '); cada una tiene su propia visita.</p>' : ''));
    else if (sinDanos) B('<div class="dictamen">' +
        '<div class="sello am"><span>Resultado de la visita</span><b style="color:#1F7A44">Sin daños</b></div>' +
        '<div class="sello"><span>Habitabilidad</span><b>Habitable (Verde)</b></div>' +
        '<div class="sello"><span>Intervención</span><b>No requiere</b></div></div>' +
      '<p class="nota">Se registró que ' + (ficha ? 'la unidad' : 'la edificación') + ' no se afectó con el sismo: ' +
        'no lleva evaluación de daños, reparabilidad ni presupuesto. La constancia son la fotografía y la firma.</p>' +
      (D.sin_danos_grupo && D.sin_danos_unidades
        ? '<p class="nota">Se registró en un mismo recorrido junto con otras unidades del edificio (' +
          esc(D.sin_danos_unidades) + '); cada una tiene su propia visita.</p>' : ''));
    else B('<div class="dictamen">' +
      (sinEval
        ? '<div class="sello am"><span>Evaluación de daños</span><b>No se diligenció</b></div>' +
          '<div class="sello"><span>Motivo</span><b>' +
            esc(textoValor('motivo_evaluacion') || 'No registrado') + '</b></div>' +
          '<div class="sello"><span>Clasificación anterior</span><b>' +
            esc(previa || 'No registrada') + '</b></div>'
        : '<div class="sello am"><span>Clasificación de habitabilidad</span><b style="color:' + dict[1] + '">' + esc(dict[0]) + '</b></div>' +
          '<div class="sello"><span>Nivel de daño</span><b>' + esc(textoValor('eva_nivel_dano') || 'Sin clasificar') + '</b></div>' +
          '<div class="sello"><span>Intervención requerida</span><b>' + esc(textoValor('eva_tipo_intervencion') || 'Sin definir') + '</b></div>') +
      '</div>' +
      // Qué sí trae el documento, dicho en una línea: sin esto, un informe sin dictamen parece
      // que no aporta nada, cuando puede llevar la reparabilidad entera medida.
      (sinEval && D.modulo_continuar
        ? '<p class="nota">Esta visita no repitió la evaluación de daños; se dedicó a <b>' +
          esc(textoValor('modulo_continuar') || String(D.modulo_continuar)) + '</b>.</p>'
        : '') +
      // Habitable no quiere decir que no haya nada que hacer. Si el ingeniero dijo que requiere
      // reparaciones locativas, la visita pasó por Reparabilidad y el documento lo dice junto al
      // dictamen verde: si no, unas cantidades de obra en una casa habitable parecerían un error.
      (!sinEval && clas === 'habitable' && D.eva_habitable_reparaciones === 'si'
        ? '<p class="nota">Habitable, con <b>reparaciones locativas</b> por hacer: lo que se midió en ' +
          'Reparabilidad va en la cuantificación.</p>'
        : '') +
      // Jornales, días de obra, insumos y viajes de volqueta salieron del informe: eran cuentas
      // nuestras sobre rendimientos sin validar, y una cifra impresa en un expediente se lee como
      // firme. Queda lo que se midió.
      (A.demolicion + R.escombro > 0
        ? '<div class="kpis">' +
          '<div><b>' + n2(A.demolicion + R.escombro) + '</b><span>m³ de escombro</span></div>' +
          '</div>'
        : '<p class="alerta">Esta visita no registró cantidades medidas. El dictamen y el detalle del ' +
          'daño sí quedan completos.</p>'));

    // La matrícula inmobiliaria: la del catastro y lo que se vio en sitio. Si no coincide van las dos,
    // porque cuál vale lo decide quien lee el expediente; si el catastro no la traía, la que se anotó.
    var matC = String(D.matricula_catastro == null ? '' : D.matricula_catastro).trim();
    var matS = String(D.matricula_campo == null ? '' : D.matricula_campo).trim();

    // 1. identificación
    B(H('Identificación del predio y de la evaluación') +
      rej([
        ['Alcance de la visita', comunes ? 'Zonas comunes del edificio' : '', 'w2'],
        ['Dirección', D.direccion || a.direccion, 'w2'],
        ['Barrio / vereda', D.barrio_vereda || a.barrio],
        ['Municipio', textoValor('municipio')],
        ['Número predial de la ficha', ficha, 'w2', true],
        ['Ficha evaluada', fichaRotulo, 'w2'],
        ['Número predial del predio', npn, 'w2', true],
        ['Matrícula inmobiliaria', matC ? matC + ' (catastro)' : (matS ? matS + ' (anotada en sitio)' : ''), 'w2', true],
        ['Verificación en sitio', matC ? textoValor('matricula_coincide') : ''],
        ['Matrícula en sitio', matC && matS && matS !== matC ? matS : '', null, true],
        ['Código de registro', sinDanos ? '' : D.cod_registro],   // sin localización, el calculado sale «-N-»
        ['Manzana', D.manzana],
        ['Nombre de la edificación', D.nombre_edificacion || a.nombre_edificacion, 'w2'],
        ['Zona', textoValor('zona')],
        ['Coordenadas WGS 84', textoValor('predio_punto') || (D.latitud && D.longitud ? (+D.latitud).toFixed(6) + ' · ' + (+D.longitud).toFixed(6) : '')],
        ['Evaluador', PERFIL_.evaluador_nombre, 'w2'],
        ['Documento', documentoOculto(PERFIL_.evaluador_num_doc)],
        ['Matrícula profesional', PERFIL_.evaluador_matricula],
        ['Entidad', bonito(textoValor('entidad') || PERFIL_.entidad), 'w2'],
        ['Fecha y hora de la inspección', FDT(D.fecha_hora_inspeccion)]
      ]) +
      (comunes ? '<p class="nota">Visita de las zonas comunes del edificio: fachada, cubierta, escaleras ' +
        'y estructura. No es la de ninguna vivienda ni la reemplaza: cada una se evalúa en su propia visita.</p>' : '') +
      (D.matricula_obs ? '<p class="nota"><b>Sobre la matrícula.</b> ' + esc(D.matricula_obs) + '</p>' : ''));

    // 2. la edificación (un registro sin daños no la describe: si no trae nada, el apartado no sale)
    var filasEdif = rej([
        ['Tipo de edificación', textoValor('tipo_edificacion')],
        ['Uso principal', valorCon('uso')],
        // Desde el 23-sep: los demás usos de una edificación mixta. Va aparte porque «Uso principal»
        // es una sola respuesta, y así la leen el Excel y lo demás.
        ['Otros usos', multiple('usos_adicionales')],
        ['Año de construcción', textoValor('ano_construccion')],
        ['Pisos sobre el suelo', D.num_pisos],
        ['Sótanos', D.num_sotanos],
        ['Frente × fondo', D.dim_frente && D.dim_fondo ? D.dim_frente + ' × ' + D.dim_fondo + ' m' : ''],
        ['Huella medida en campo', D.area_huella_campo ? n2(D.area_huella_campo) + ' m²' : ''],
        ['Material de la estructura', multiple('mat_estructural')],
        ['Sistema estructural', multiple('sist_estructural'), 'w2'],
        ['Material de entrepiso', multiple('mat_entrepiso')],
        ['Sistema de entrepiso', multiple('sist_entrepiso')],
        // El material del soporte es obligatorio en el paso 4 y no salía en ninguna parte del PDF.
        ['Material del soporte de la cubierta', multiple('mat_sop_cubierta'), 'w2'],
        ['Soporte de cubierta', multiple('sop_cubierta'), 'w2'],
        ['Tipo de cubierta', valorCon('tipo_cubierta')],
        ['Muros divisorios', multiple('muros_divisorios'), 'w2']
      ]);
    if (!sinDanos || filasEdif) B(H('La edificación') + filasEdif +
      // Si parte de esto se trajo de otra visita del mismo edificio, consta: quien firma no lo
      // levantó, lo confirmó. D.copiado_campos solo guarda lo que llegó así y no se cambió después.
      (D.copiado_de && Array.isArray(D.copiado_campos) && D.copiado_campos.length
        ? '<p class="nota">' + D.copiado_campos.length + (D.copiado_campos.length === 1 ? ' dato' : ' datos') +
          ' de la localización, la identificación y el sistema estructural se trajeron de otra visita del ' +
          'mismo edificio (identificador ' + esc(D.copiado_de) + ') y quedaron marcados para confirmarlos en sitio.</p>'
        : ''));

    // 3. ocupación
    var hab = [D.hab_hombres, D.hab_mujeres, D.hab_menores, D.hab_mayores].some(function (x) { return +x > 0; });
    // Quién atendió: la relación con el predio y el nombre. El teléfono de esa persona se guarda con
    // la visita pero NO va aquí: el documento circula, y el número no le sirve a quien lo lee.
    B(H('Ocupación y contacto') +
      rej([
        ['Atendió la visita', valorCon('atendio_quien'), 'w2'],
        ['Nombre de quien atendió', D.atendio_nombre, 'w2'],
        ['Estado al momento de la visita', textoValor('estado_ocupacion')],
        ['Personas que habitan', hab ? String(D.hab_total || '') : ''],
        ['Hombres', hab ? String(D.hab_hombres || 0) : ''],
        ['Mujeres', hab ? String(D.hab_mujeres || 0) : ''],
        ['Menores de 18', hab ? String(D.hab_menores || 0) : ''],
        ['Mayores de 60', hab ? String(D.hab_mayores || 0) : ''],
        ['Propietario o responsable', D.propietario, 'w2'],
        ['Celular de contacto', D.propietario_celular]
      ]) +
      (D.propietario || D.atendio_nombre ? '<p class="nota">Datos personales de uso restringido (Ley 1581 de 2012). No pueden ' +
        'divulgarse ni usarse para fin distinto de la atención del sismo.</p>' : ''));

    // 4. entorno y peligro
    var filasPel = PELIGROS_INF.map(function (p) {
      var v = textoValor(p[0]);
      if (!v) return '';
      var malo = /^(S[ií]|Total|Parcial|Evidente)/i.test(v);
      return '<tr><td>' + esc(p[1]) + '</td><td class="c"><b class="' + (malo ? 'si' : 'no') + '">' + esc(v) + '</b></td></tr>';
    }).join('');
    // En un registro sin daños la tabla solo diría «en pie», que ya dice el dictamen.
    if (filasPel && !sinDanos) {
      B(H('Entorno, peligro global y condiciones geotécnicas') +
        '<table><thead><tr><th>Condición</th><th class="c">Hallazgo</th></tr></thead><tbody>' + filasPel + '</tbody></table>' +
        rej([['Morfología del sitio', valorCon('eva_morfologia')],
             ['Tipo de amenaza', valorCon('eva_tipo_amenaza')],
             ['Distancia al cuerpo hídrico', D.eva_distancia_hidrica ? D.eva_distancia_hidrica + ' m' : ''],
             ['Tipo de inspección', textoValor('eva_tipo_inspeccion')]]) +
        (D.eva_obs_hidrica ? '<p class="nota"><b>Observaciones del entorno.</b> ' + esc(D.eva_obs_hidrica) + '</p>' : ''));
    }

    // 5 y 6. daño
    var tEst = tablaDano('Elemento estructural', DANO_EST);
    var tNo = tablaDano('Elemento no estructural', DANO_NO_EST);
    if (tEst) B(H('Daño en elementos estructurales') + tEst);
    if (tNo) B(H('Daño en elementos no estructurales') + tNo);

    // resumen del daño
    var todos = DANO_EST.concat(DANO_NO_EST).map(function (p) { return D[p[0]]; })
      .filter(function (v) { return v && v !== 'na'; });
    if (todos.length) {
      var conteo = ['s', 'm', 'l', 'n'].map(function (k) {
        return [k, SEM_INF[k][0], SEM_INF[k][1], todos.filter(function (v) { return v === k; }).length];
      });
      B(H('Resumen del daño') +
        '<div class="barra">' + conteo.filter(function (c) { return c[3]; }).map(function (c) {
          return '<span style="flex:' + c[3] + ';background:' + c[2] + '"><i>' + c[3] + '</i></span>';
        }).join('') + '</div>' +
        '<div class="leyenda">' + conteo.map(function (c) {
          return '<span><i style="background:' + c[2] + '"></i>' + c[1] + ' <b>' + c[3] + '</b></span>';
        }).join('') + '</div>' +
        '<p class="nota">' + todos.length + ' elementos evaluados sobre la escala Ninguno · Leve · Moderado · Severo ' +
        'del formulario oficial. Los marcados «no aplica» no entran en el conteo.</p>');
    }

    // 8. cuantificación
    // Dónde están los daños. Desde el 23-sep los pisos se marcan con botones; antes se escribían a
    // mano, y en esas visitas sale el texto tal cual se escribió. Si una visita vieja se corrigió y
    // tiene las dos cosas, van las dos: el texto puede decir algo que los botones no («terraza»).
    var pisosB = textoPisos(D.rep_pisos, D.rep_pisos_otro), pisosT = String(D.rep_piso == null ? '' : D.rep_piso).trim();
    var pisos = pisosB && pisosT && pisosT !== pisosB ? pisosB + ' · escrito antes: ' + pisosT : (pisosB || pisosT);
    var h8 = H('Cuantificación de la recuperación') +
      rej([['Pisos en los que se encuentran los daños', pisos, 'w2']]);
    if (sinDanos && !R.obra.length) {
      // nada que cuantificar, y no es una falta: el apartado no sale
    } else if (R.obra.length) {
      h8 += '<p class="muestra">Lo que se midió en sitio. No es un presupuesto: el costo lo calcula ' +
        'la Alcaldía a partir de estas cantidades.</p>' +
        '<table><thead><tr><th>Obra</th><th>Elemento</th><th class="d">Cantidad</th><th>Unidad</th></tr></thead><tbody>' +
        R.obra.map(function (o) {
          return '<tr><td>' + esc(o.nombre) + '</td><td class="elem">' + esc(o.origen || o.elemento) + '</td>' +
                 '<td class="d">' + n2(o.cantidad) + '</td><td>' + esc(o.unidad) + '</td></tr>';
        }).join('') + '</tbody></table>';
      B(h8);
    } else {
      B(h8 + '<p class="alerta">La visita no dejó cantidades medidas.</p>');
    }

    if (A.pendientes.length) {
      B('<h3>Lo que falta medir</h3>' +
        '<table><thead><tr><th>Elemento</th><th>Qué falta</th></tr></thead><tbody>' +
        A.pendientes.map(function (p) {
          return '<tr><td>' + esc(p[0]) + '</td><td class="obs">' + esc(p[1]) + '</td></tr>';
        }).join('') + '</tbody></table>' +
        '<p class="nota">Estas partidas quedan por fuera de las cifras de arriba. No significa que no se ' +
        'necesiten: significa que todavía no están medidas.</p>');
    }

    // el detalle de lo que se mide en Reparabilidad desde el 23-sep, cada parte en su bloque
    detalleReparabilidad().forEach(function (t, k) { B((k === 0 ? H('Detalle de la reparabilidad') : '') + t); });

    // 9. recomendaciones
    // Apuntalar: cuántos puntales, cuánto y dónde, cuando A.7 lo preguntó (desde el 23-sep).
    var apunt = SELV(D.eva_medidas, 'apuntalar') ? [
      D.eva_apuntalar_puntales ? D.eva_apuntalar_puntales + (+D.eva_apuntalar_puntales === 1 ? ' puntal' : ' puntales') : '',
      conUnidad('eva_apuntalar_longitud', 'm'),
      String(D.eva_apuntalar_donde == null ? '' : D.eva_apuntalar_donde).trim()
    ].filter(Boolean).join(' · ') : '';
    var recs = [
      ['Evaluación adicional', multiple('eva_adicional')],
      ['Medidas de seguridad', multiple('eva_medidas')],
      ['Servicios a desconectar', multiple('eva_servicios_desconectar')],
      ['Restringir el paso', multiple('eva_restringir_paso')],
      ['Apuntalamiento', apunt],
      ['Elementos a intervenir', multiple('eva_elementos_interv')]
    ].filter(function (r) { return r[1]; });
    // #29: cuánto se afectó cada elemento de A.8 y qué reparación pide. Solo si la visita lo trae.
    var filasA8 = D.eva_tipo_intervencion === 'ninguna' ? [] : ELEMENTOS_A8.filter(function (e) {
      return SELV(D.eva_elementos_interv, e) && (D['eva_afect_' + e] || D['eva_rep_' + e]);
    });
    var tablaA8 = filasA8.length
      ? '<table><thead><tr><th>Elemento a intervenir</th><th>Afectación</th><th>Reparación</th></tr></thead><tbody>' +
        filasA8.map(function (e) {
          return '<tr><td>' + esc(etiqueta(idxCampo.eva_elementos_interv, e)) + '</td><td>' +
                 esc(textoValor('eva_afect_' + e) || '—') + '</td><td>' + esc(textoValor('eva_rep_' + e) || '—') + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '';
    if (recs.length || tablaA8 || D.comentarios_finales || D.eva_obs_elementos || D.eva_medidas_obs) {
      B(H('Recomendaciones y medidas de seguridad') +
        (recs.length ? '<ol class="recs">' + recs.map(function (r) {
          return '<li><b>' + esc(r[0]) + '</b><span>' + esc(r[1]) + '</span></li>';
        }).join('') + '</ol>' : '') + tablaA8 +
        (D.eva_medidas_obs ? '<p class="nota"><b>Sobre las medidas de seguridad.</b> ' + esc(D.eva_medidas_obs) + '</p>' : '') +
        (D.eva_obs_elementos ? '<p class="nota"><b>Sobre los elementos a intervenir.</b> ' + esc(D.eva_obs_elementos) + '</p>' : '') +
        (D.comentarios_finales ? '<p class="lede">' + esc(D.comentarios_finales) + '</p>' : ''));
    }

    // Los documentos de soporte se nombran aunque el informe no los incruste: si no aparecen,
    // nadie sabe que existen y el acta que trajo el propietario se queda en un bucket.
    var sop = Array.isArray(D.obs_documentos) ? D.obs_documentos : [];
    if (sop.length) {
      B(H('Documentos de soporte') +
        '<ol class="recs">' + sop.map(function (d) {
          var kb = typeof d.bytes === 'number' ? Math.max(1, Math.round(d.bytes / 1024)) + ' KB' : '';
          return '<li><b>' + esc(d.nombre || 'documento') + '</b><span>' +
                 esc([d.tipo || '', kb].filter(Boolean).join(' · ')) + '</span></li>';
        }).join('') + '</ol>' +
        '<p class="nota">Se adjuntaron con la visita y se consultan desde la sala de datos.</p>');
    }

    // demolición y escombros
    // Desde el 23-sep la demolición parcial dice qué pisos se tumban (y, si no es la planta entera,
    // cuánta área de cada uno), y D.4 cuánto hay que cargar los escombros hasta la volqueta.
    var pisosDem = D.dem_tipo === 'media' ? textoPisos(D.dem_pisos, D.dem_pisos_otro) : '';
    var trasiego = D.esc_trasiego_m !== '' && D.esc_trasiego_m !== null && D.esc_trasiego_m !== undefined &&
                   isFinite(+D.esc_trasiego_m) ? n2(+D.esc_trasiego_m) + ' m' : '';
    // Solo con el módulo abierto. Lo que se respondió de la demolición se queda en la visita aunque
    // después se corrija el dictamen (una casa que pasó de amarillo a verde), y salía aquí, en el PDF
    // de una casa habitable, con la urgencia y el tipo de una demolición que ya no aplica.
    if (HAY_DEM && (D.dem_urgencia || D.dem_tipo || volumenEscombros() > 0 || trasiego || D.esc_trasiego_obs)) {
      B(H('Demolición y escombros') +
        rej([
          ['Urgencia de la demolición', textoValor('dem_urgencia')],
          ['Tipo de demolición', textoValor('dem_tipo')],
          ['Esta visita estima el edificio entero', comunes ? textoValor('dem_estima_edificio') : ''],
          ['Pisos que se demuelen', pisosDem],
          ['Área que se demuele en cada piso', pisosDem ? (conUnidad('dem_area_piso', 'm²') || 'La planta entera (la huella)') : ''],
          ['Volumen de escombros', volumenEscombros() > 0 ? n2(volumenEscombros()) + ' m³' : ''],
          ['Escombros ya retirados', textoValor('esc_retirados')],
          ['Fachadas sobre vía', textoValor('esc_frentes_via')],
          ['Vía más ancha de acceso', textoValor('esc_ancho_via')],
          ['Distancia de trasiego', trasiego],
          ['Posibilidad de acopio', textoValor('esc_acopio')],
          ['Urgencia del retiro', textoValor('esc_urgencia')]
        ]) +
        (D.dem_notas ? '<p class="nota"><b>Observaciones de la demolición.</b> ' + esc(D.dem_notas) + '</p>' : '') +
        (D.esc_trasiego_obs ? '<p class="nota"><b>Sobre el trasiego.</b> ' + esc(D.esc_trasiego_obs) + '</p>' : '') +
        (D.esc_notas ? '<p class="nota"><b>Observaciones de escombros.</b> ' + esc(D.esc_notas) + '</p>' : ''));
    }

    // registro fotográfico, en grupos de seis para que ninguno parta una hoja
    var fotos = fotosInforme();
    if (fotos.length) {
      for (var i = 0; i < fotos.length; i += 6) {
        var grupo = fotos.slice(i, i + 6);
        B((i === 0 ? H('Registro fotográfico') +
            (D.foto_descripcion ? '<p class="nota">' + esc(D.foto_descripcion) + '</p>' : '') : '') +
          '<div class="fotos">' + grupo.map(function (f) {
            return '<figure><img src="' + f[1] + '" alt=""><figcaption>' + esc(f[0]) + '</figcaption></figure>';
          }).join('') + '</div>');
      }
    }

    // La tabla de rendimientos explicaba de dónde salían los insumos y los jornales. Sin ellos en el
    // documento, no hay nada que explicar. APU_ITEMS sigue en el código: si la Alcaldía valida sus
    // rendimientos, volver a encenderlo es descomentar, no reescribir.

    // La rúbrica no pasa por fotosInforme() —no es una fotografía del daño— pero llega igual de las
    // dos formas y necesita la misma regla: en el teléfono el dato ES la imagen (data URL) y entra
    // tal cual; desde el panel es una ruta en Storage y hay que pedirle la URL firmada a quien
    // llama. Sin esto, todo informe armado desde el panel salía con la firma rota.
    var firma = typeof D.evaluador_firma === 'string' ? D.evaluador_firma
      : (Array.isArray(D.evaluador_firma) ? D.evaluador_firma[0] : '');
    if (firma && firma.slice(0, 5) !== 'data:') firma = (FOTO && FOTO('evaluador_firma', 0, firma)) || '';
    B('<div class="firmas">' +
      '<div>' + (firma ? '<img class="rubrica" src="' + firma + '" alt="">' : '') +
      '<b>' + esc(PERFIL_.evaluador_nombre || '') + '</b>' +
      '<span>' + esc(bonito(textoValor('entidad') || PERFIL_.entidad)) +
      (PERFIL_.evaluador_matricula ? ' · Matrícula ' + esc(PERFIL_.evaluador_matricula) : '') + '<br>' +
      'Evaluador que realizó la inspección</span></div>' +
      '<div><b>Infimanizales</b><span>Alcaldía de Manizales<br>Recibido y revisado</span></div>' +
      '</div>' +
      '<div class="traza"><b>Trazabilidad.</b> Visita levantada el ' + esc(FDT(D.fecha_hora_inspeccion) || fecha) +
      ' con el formulario versión ' + esc(VERSION) + ', identificador local ' +
      esc(String(REF || '—')) + '. ' + (ficha ? 'Ficha catastral ' + esc(ficha) + ' del predio ' + esc(npn || '—')
        : (comunes ? 'Zonas comunes del predio ' : 'Predio ') + esc(npn || '—')) + '. ' +
      'Documento generado en el teléfono del evaluador; los datos viajan cifrados al consolidado de la ' +
      'reconstrucción. Toda corrección posterior queda en bitácora con el valor anterior, el nuevo, el motivo ' +
      'y quién la hizo.</div>');

    // Después de la firma: lo que se corrigió cuando la visita ya estaba firmada.
    anexoCorrecciones(H).forEach(function (b) { B(b); });

    return { bloques: bloques, ref: ref, fecha: fecha, logo: logo, npn: ficha || npn, titulo: titulo };
  }

  function informeEstilos() {
    return '@page{size:A4;margin:0}' +
      ':root{--tinta:#0F2233;--tinta-2:#55677A;--tinta-3:#8A9AA9;--linea:#DCE4EC;--linea-2:#EFF3F7;' +
      '--azul:#0B3C5D;--ambar:#C98A00;--verde:#1F7A44;--rojo:#B3261E;--papel:#fff;' +
      '--sans:"DM Sans","Segoe UI",system-ui,sans-serif}' +
      '*{box-sizing:border-box}' +
      'html,body{margin:0;padding:0;background:#f2f5f8}' +
      'body{font-family:var(--sans);color:var(--tinta);font-size:9.3pt;line-height:1.42;' +
      '-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '.hoja{width:210mm;height:297mm;background:var(--papel);position:relative;padding:0 13mm 14mm;' +
      'page-break-after:always;overflow:hidden;margin:0 auto 8mm;display:flex;flex-direction:column;' +
      'box-shadow:0 2px 18px rgba(15,34,51,.14)}' +
      '.hoja:last-child{page-break-after:auto;margin-bottom:0}' +
      'main{flex:1;padding-top:7mm;overflow:hidden}' +
      '.banda{background:var(--azul);margin:0 -13mm;padding:7mm 13mm 6mm;display:flex;align-items:center;gap:14px;' +
      'border-bottom:3px solid var(--ambar)}' +
      '.banda img{height:13mm;width:auto}' +
      '.banda .tit{flex:1;border-left:1px solid rgba(255,255,255,.28);padding-left:14px}' +
      '.banda .tit b{display:block;color:#fff;font-size:12.2pt;line-height:1.2;letter-spacing:-.01em}' +
      '.banda .tit span{display:block;color:#B9CBDA;font-size:8pt;margin-top:2px}' +
      '.banda .ref{text-align:right}' +
      '.banda .ref b{display:block;color:#fff;font-size:10.5pt;font-family:ui-monospace,Consolas,monospace}' +
      '.banda .ref span{display:block;color:#B9CBDA;font-size:7.6pt;margin-top:2px}' +
      '.pie{position:absolute;left:13mm;right:13mm;bottom:7mm;border-top:1px solid var(--linea);padding-top:4px;' +
      'display:flex;gap:12px;font-size:7pt;color:var(--tinta-3)}' +
      '.pie .np{margin-left:auto;font-weight:700;color:var(--azul)}' +
      '.blq{break-inside:avoid}' +
      'h2{font-size:10.4pt;margin:11px 0 6px;display:flex;align-items:center;gap:8px;color:var(--azul)}' +
      'h2 i{background:var(--azul);color:#fff;width:17px;height:17px;border-radius:4px;display:inline-grid;' +
      'place-items:center;font-size:7.8pt;font-style:normal;font-weight:700}' +
      'h2::after{content:"";flex:1;height:1px;background:var(--linea)}' +
      'h3{font-size:9pt;margin:10px 0 3px;color:var(--azul);text-transform:uppercase;letter-spacing:.06em}' +
      '.dictamen{display:flex;gap:9px;margin-bottom:9px}' +
      '.sello{flex:1;border:1px solid var(--linea);border-top:3px solid var(--azul);border-radius:7px;' +
      'padding:7px 11px;background:#FBFCFE}' +
      '.sello.am{border-top-color:var(--ambar);background:#FFFBF2}' +
      '.sello span{display:block;font-size:7.1pt;color:var(--tinta-3);text-transform:uppercase;letter-spacing:.05em}' +
      '.sello b{font-size:10.6pt;line-height:1.25;display:block;margin-top:1px}' +
      '.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin-bottom:4px}' +
      '.kpis div{border:1px solid var(--linea);border-radius:7px;padding:7px 9px;text-align:center;background:#FBFCFE}' +
      '.kpis b{display:block;font-size:14.5pt;color:var(--azul);line-height:1.1;font-variant-numeric:tabular-nums}' +
      '.kpis span{font-size:7.1pt;color:var(--tinta-2);text-transform:uppercase;letter-spacing:.04em}' +
      '.rej{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--linea);border-radius:7px;overflow:hidden}' +
      '.rej div{padding:6px 10px;border-right:1px solid var(--linea-2);border-bottom:1px solid var(--linea-2)}' +
      '.rej div.w2{grid-column:span 2}' +
      '.rej span{display:block;font-size:7.1pt;color:var(--tinta-3);text-transform:uppercase;letter-spacing:.04em}' +
      '.rej b{font-weight:600;font-size:9.2pt}' +
      '.mono{font-family:ui-monospace,Consolas,monospace;font-size:8.4pt;letter-spacing:-.02em}' +
      'p.lede{margin:6px 0 0;font-size:9.6pt;line-height:1.5;border-left:3px solid var(--ambar);' +
      'padding:4px 0 4px 12px;background:#FFFBF2}' +
      'table{width:100%;border-collapse:collapse;margin-top:3px}' +
      'th{background:var(--azul);color:#fff;font-size:7.6pt;text-align:left;padding:5px 8px;font-weight:600}' +
      'td{border-bottom:1px solid var(--linea-2);padding:4.5px 8px;vertical-align:middle;font-size:8.8pt}' +
      'tbody tr:nth-child(even) td{background:#FAFCFD}' +
      'td.c,th.c{text-align:center}td.d,th.d{text-align:right;font-variant-numeric:tabular-nums}' +
      'td.elem{color:var(--tinta-2);font-size:8.2pt}' +
      'td.obs{color:var(--tinta-2);font-size:7.9pt}' +
      'tfoot td{border-top:2px solid var(--azul);border-bottom:none;font-weight:700;background:#F4F7FA}' +
      '.esc{display:inline-flex;gap:2px}' +
      '.esc i{width:15px;height:15px;border-radius:3px;display:grid;place-items:center;font-style:normal;' +
      'font-size:7pt;font-weight:700;color:var(--tinta-3);background:#EDF1F5;border:1px solid var(--linea)}' +
      '.esc i.on{color:#fff;border-color:transparent}' +
      '.na{font-size:7.4pt;color:var(--tinta-3)}' +
      'td.est{font-size:7.8pt;font-weight:700}' +
      'b.si{color:var(--rojo)}b.no{color:var(--verde)}' +
      '.nota{font-size:7.7pt;color:var(--tinta-2);margin:5px 0 0}' +
      '.alerta{border-left:3px solid var(--ambar);background:#FFFBF2;padding:8px 12px;font-size:8.5pt;' +
      'margin-top:9px;border-radius:0 6px 6px 0}' +
      '.muestra{border-left:3px solid var(--azul);background:#F4F8FB;padding:8px 12px;font-size:8.4pt;' +
      'margin:4px 0 8px;border-radius:0 6px 6px 0}' +
      'ol.recs{margin:4px 0 0;padding-left:18px}' +
      'ol.recs li{margin-bottom:5px}ol.recs b{display:block;font-size:9.2pt}' +
      'ol.recs span{color:var(--tinta-2);font-size:8.2pt}' +
      '.fotos{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:3px}' +
      '.fotos figure{margin:0}' +
      '.fotos img{width:100%;height:34mm;object-fit:cover;border-radius:6px;border:1px solid var(--linea);display:block}' +
      '.fotos figcaption{font-size:7.2pt;color:var(--tinta-2);margin-top:3px;line-height:1.3}' +
      '.firmas{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:14mm}' +
      '.firmas div{border-top:1px solid var(--tinta);padding-top:5px;position:relative}' +
      '.firmas b{display:block;font-size:9pt}.firmas span{color:var(--tinta-3);font-size:7.5pt;line-height:1.5}' +
      '.firmas .rubrica{position:absolute;bottom:100%;left:0;height:16mm;margin-bottom:2px}' +
      '.traza{margin-top:8px;border:1px solid var(--linea);border-radius:7px;padding:8px 11px;font-size:7.5pt;' +
      'color:var(--tinta-2);background:#FBFCFE;line-height:1.5}' +
      '.traza b{color:var(--tinta)}' +
      '.barra{display:flex;height:26px;border-radius:6px;overflow:hidden;margin-top:2px}' +
      '.barra span{display:grid;place-items:center}' +
      '.barra i{font-style:normal;color:#fff;font-size:8.5pt;font-weight:700}' +
      '.leyenda{display:flex;gap:16px;margin-top:6px;font-size:7.8pt;color:var(--tinta-2);flex-wrap:wrap}' +
      '.leyenda span{display:flex;align-items:center;gap:5px}' +
      '.leyenda i{width:9px;height:9px;border-radius:2px;display:inline-block}' +
      '.leyenda b{color:var(--tinta)}' +
      '@media print{html,body{background:#fff}.hoja{margin:0;box-shadow:none}}';
  }

  // La ventana reparte los bloques en hojas A4 midiendo lo que cabe, numera «N de M» y deja el botón de imprimir.
  function informeReparto() {
    return '(function(){' +
      'var crudo=document.getElementById("crudo"),doc=document.getElementById("doc");' +
      'var banda=document.getElementById("banda").innerHTML,pie=document.getElementById("piebase").innerHTML;' +
      'var hojas=[],main=null;' +
      'function nueva(){var h=document.createElement("div");h.className="hoja";' +
      'h.innerHTML=\'<div class="banda">\'+banda+\'</div><main></main><div class="pie">\'+pie+\'</div>\';' +
      'doc.appendChild(h);hojas.push(h);main=h.querySelector("main");return main;}' +
      'nueva();' +
      'var b=[].slice.call(crudo.children);' +
      'for(var i=0;i<b.length;i++){main.appendChild(b[i]);' +
      'if(main.scrollHeight>main.clientHeight&&main.children.length>1){nueva();main.appendChild(b[i]);}}' +
      'crudo.parentNode.removeChild(crudo);' +
      'for(var j=0;j<hojas.length;j++){hojas[j].querySelector(".np").textContent=(j+1)+" de "+hojas.length;}' +
            '})();';
  }


  // El informe se muestra dentro de la propia aplicación, en un marco aparte, y se guarda con el diálogo de
  // impresión del teléfono («Guardar como PDF»). No se abre una ventana nueva a propósito: los navegadores
  // embebidos —WhatsApp, Gmail, el propio Android— bloquean las ventanas emergentes, y el ingeniero suele entrar
  // por el enlace que le llega por WhatsApp. El marco además aísla los estilos del documento de los de la app.
  // Imprimir NO puede ir por el iframe, y esto costó un informe inservible.
  //
  // Antes se pedía imprimir el marco y, si eso fallaba, se imprimía la página entera. En el
  // teléfono falla siempre, así que lo que salía era la PÁGINA: una sola hoja tamaño Carta con
  // la pantalla de la aplicación —«Guardar y volver a la bandeja», «Volver al formulario»—
  // encima del informe aplastado. La capa del visor es `position:fixed`, y al imprimirla el
  // navegador la recorta a lo que cabe en pantalla: de ahí la hoja única. Y el `@page size:A4`
  // del informe no llegaba a mandar porque no era su documento el que se estaba imprimiendo;
  // el PDF salía en Carta, que es la pista que lo delató.
  //
  // Un iframe NO se pagina al imprimir el documento que lo contiene: se dibuja su caja visible y
  // punto. Da igual cuánto CSS de impresión se le ponga al padre. Por eso el informe se abre como
  // documento propio y se imprime allí: así cada `.hoja` es una página de verdad y manda su @page.
  //
  // La ventana se abre DENTRO del gesto del botón, que es lo que distingue una ventana legítima
  // de un emergente para el bloqueador.
  //
  // Y si aun así la bloquean, NO se vuelve al `window.print()` de antes —sería devolver el mismo
  // PDF roto sin que nadie se entere—: se deja un enlace al propio informe. Tocar un enlace es un
  // gesto que ningún bloqueador discute, así que siempre queda una forma de llegar al documento.
  function imprime(inf, capa) {
    var w;
    try { w = window.open('', '_blank'); } catch (e) { w = null; }
    if (!w) { enlaceDeRespaldo(inf, capa); return; }
    w.document.open();
    w.document.write(informeHTML(inf));
    w.document.close();
    // El reparto en hojas corre solo al cargar, pero las fotografías todavía se están pintando:
    // imprimir antes de tiempo las saca en blanco.
    var lanza = function () { try { w.focus(); w.print(); } catch (e) {} };
    if (w.document.readyState === 'complete') setTimeout(lanza, 400);
    else w.addEventListener('load', function () { setTimeout(lanza, 400); });
  }

  // El informe como archivo, para abrirlo con un toque cuando la ventana no se pudo abrir sola.
  // El Blob vive mientras viva la pestaña; no se sube nada y sigue funcionando sin señal.
  function enlaceDeRespaldo(inf, capa) {
    var pie = capa.querySelector('.inf-pie');
    if (!pie) return;
    var url;
    try { url = URL.createObjectURL(new Blob([informeHTML(inf)], { type: 'text/html' })); }
    catch (e) { pie.textContent = 'No se pudo preparar el informe en este navegador.'; return; }
    pie.innerHTML = '';
    var a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = 'Abrir el informe para guardarlo en PDF';
    a.style.cssText = 'font-weight:700;text-decoration:underline';
    pie.appendChild(a);
    pie.appendChild(document.createTextNode(
      ' — el navegador no dejó abrirlo solo. Ábralo aquí y use Imprimir → Guardar como PDF.'));
  }

  function abreInforme(aviso) {
    var inf = informeDoc();
    var vieja = document.getElementById('infCapa');
    if (vieja) vieja.parentNode.removeChild(vieja);

    var capa = document.createElement('div');
    capa.className = 'inf-capa';
    capa.id = 'infCapa';
    capa.innerHTML =
      '<div class="inf-top">' +
        '<button type="button" class="inf-x" data-a="infcierra" aria-label="Cerrar el informe">&#10005;</button>' +
        '<div class="inf-tit"><b>Informe del predio</b><span>' + esc(inf.ref) + '</span></div>' +
        '<button type="button" class="inf-pdf" data-a="infpdf">Guardar en PDF</button>' +
      '</div>' +
      '<div class="inf-marco"><iframe id="infMarco" title="Informe del predio"></iframe></div>' +
      // Si se llegó aquí porque el archivo no se pudo armar, se dice arriba de todo: sin eso el
      // ingeniero cree que el botón «Descargar» abre esto a propósito y no sabe que falló.
      '<p class="inf-pie">' + (aviso ? '<b class="inf-aviso">' + esc(aviso) + '</b>' : '') +
      'El informe se abre en otra pestaña y aparece el diálogo de impresión: ' +
      'elija <b>Guardar como PDF</b>. Se arma en el teléfono, no necesita señal.</p>';
    document.body.appendChild(capa);

    var marco = document.getElementById('infMarco');
    var doc = marco.contentDocument || marco.contentWindow.document;
    doc.open();
    doc.write(informeHTML(inf));
    doc.close();

    // La hoja es A4 (210 mm ≈ 794 px) y el teléfono tiene 360: en pantalla se reduce para que quepa a lo ancho,
    // y el marco crece hasta el alto del documento para que se desplace uno solo y no dos. Al imprimir no se
    // aplica: el zoom va dentro de @media screen.
    function ajusta() {
      if (!marco.parentNode) return;
      var z = Math.min(1, (marco.parentNode.clientWidth - 12) / 794);
      var st = doc.getElementById('zoomPantalla');
      if (!st) { st = doc.createElement('style'); st.id = 'zoomPantalla'; doc.head.appendChild(st); }
      st.textContent = '@media screen{#doc{zoom:' + z.toFixed(4) + '}body{padding:6px 0}}';
      marco.style.height = (doc.documentElement.scrollHeight + 8) + 'px';
    }
    ajusta();
    setTimeout(ajusta, 250);
    window.addEventListener('resize', ajusta);

    capa.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('[data-a]') : null;
      if (!b) return;
      if (b.dataset.a === 'infcierra') {
        window.removeEventListener('resize', ajusta);
        capa.parentNode.removeChild(capa); return;
      }
      if (b.dataset.a === 'infpdf') imprime(inf, capa);
    });
    anota('informe');
  }

  // `paraArchivo`: el mismo documento, sin lo que solo sirve en pantalla (el margen gris entre hojas y
  // su sombra), para fotografiar cada hoja tal cual se imprimiría.
  function informeHTML(inf, paraArchivo) {
    return '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
      '<title>' + esc('Informe de evaluación ' + inf.ref) + '</title>' +
      '<style>' + informeEstilos() +
      (paraArchivo ? 'html,body{background:#fff!important}.hoja{margin:0!important;box-shadow:none!important}' : '') +
      '</style></head><body>' +
      '<div id="banda" hidden>' +
        (inf.logo ? '<img src="' + inf.logo + '" alt="Infimanizales · Alcaldía de Manizales">' : '') +
        '<div class="tit"><b>' + esc(inf.titulo || 'Informe de evaluación de daños y recursos de recuperación') + '</b>' +
        '<span>Evaluación rápida post-sismo · Reconstrucción de Manizales</span></div>' +
        '<div class="ref"><b>' + esc(inf.ref) + '</b><span>' + esc(inf.fecha) + '</span></div>' +
      '</div>' +
      '<div id="piebase" hidden>' +
        '<span>Infimanizales · Alcaldía de Manizales · operado por Camacol Regional Caldas</span>' +
        '<span>Datos personales · uso restringido, Ley 1581 de 2012</span><span class="np"></span>' +
      '</div>' +
      '<div id="crudo" hidden>' + inf.bloques.join('') + '</div>' +
      '<div id="doc"></div>' +
      '<scr' + 'ipt>' + informeReparto() + '</scr' + 'ipt></body></html>';
  }

  // ---------------------------------------------------------------- el informe como archivo PDF
  // Lo pidió Julián el 23-sep: «cuando le dé al informe predio del PDF, descargar automáticamente».
  // La vista de impresión obliga a pasar por el diálogo del teléfono (Imprimir → Guardar como PDF), y
  // en campo eso se pierde: la mitad no encuentra la opción y la otra mitad guarda una hoja en blanco.
  //
  // CÓMO. Cada hoja A4 del documento de siempre se fotografía con html2canvas y el PDF se arma aquí,
  // una imagen JPEG por página. Es el MISMO documento que se imprime: las mismas hojas, el mismo
  // reparto, el mismo anexo de correcciones; no hay una segunda maqueta que mantener. El texto no se
  // puede seleccionar —es una imagen—, que es el precio de no depender del diálogo de impresión.
  //
  // POR QUÉ SIN jsPDF. Un PDF de imágenes JPEG es una de las cosas más simples que hay en el formato:
  // cada página dibuja su imagen tal cual llega del lienzo (DCTDecode, sin volver a comprimir).
  // Escribirlo son sesenta líneas; jsPDF son 420 KB más que el teléfono tendría que guardar sin señal.
  //
  // SIN SEÑAL. html2canvas va en campo/vendor/ y el service worker lo guarda con lo demás: sin él, el
  // primer informe sin señal fallaría. Se carga solo al pedir un PDF, no al abrir la aplicación.
  //
  // SI FALLA —la librería no llegó, el teléfono se quedó sin memoria, un navegador que no deja—, la
  // promesa se rechaza y quien llama abre la vista de impresión de siempre, diciendo por qué.
  var LIBRERIA_PDF = 'vendor/html2canvas.min.js';
  // Dónde está este archivo: la librería se busca a su lado, venga la página de donde venga.
  var URL_INFORME = (function () {
    try { var s = document.currentScript; return s && s.src ? String(s.src) : ''; } catch (e) { return ''; }
  })();
  // Escala 2 sobre una hoja de 794 px da 1588 × 2246 px (unos 190 ppp): el texto de 7 puntos se lee.
  // Calidad 0,8: medido con las visitas del 22-sep, el PDF queda en 150-400 KB por hoja con fotos.
  var ESCALA_PDF = 2, CALIDAD_PDF = 0.8;
  var A4_PT = [595.28, 841.89];
  var textoLibreria = '', cargandoPdf = null, descargando = false, ultimoPdf = '';

  function urlLibreria() {
    try { return new URL(LIBRERIA_PDF, URL_INFORME || location.href).href; } catch (e) { return LIBRERIA_PDF; }
  }
  // Se trae el TEXTO de la librería y se ejecuta dentro del marco donde está el documento, no en la
  // página. Cargada en la página, html2canvas escribía con las letras de la página (el teléfono tiene
  // DM Sans incrustada) sobre un documento maquetado con las del marco (que no la tiene): cada palabra
  // salía más ancha que su hueco y se comía el espacio siguiente —«Identificacióndel predio»—. Dentro
  // del marco, maqueta y dibujo usan las mismas letras. El texto se guarda y sirve para los siguientes.
  function cargaLibreria() {
    if (textoLibreria) return Promise.resolve(textoLibreria);
    if (cargandoPdf) return cargandoPdf;
    var tope = new Promise(function (ok, mal) { setTimeout(function () { mal(new Error('sin_libreria')); }, 20000); });
    cargandoPdf = Promise.race([fetch(urlLibreria()).then(function (r) {
      if (!r.ok) throw new Error('sin_libreria');
      return r.text();
    }), tope]).then(function (t) {
      if (String(t).indexOf('html2canvas') < 0) throw new Error('sin_libreria');
      textoLibreria = t;
      return t;
    }).then(null, function () {
      // Si no llegó (sin señal y sin la copia guardada), la próxima vez se vuelve a intentar.
      cargandoPdf = null;
      throw new Error('sin_libreria');
    });
    return cargandoPdf;
  }
  function libreriaEnMarco(f, texto) {
    var d = f.contentDocument || f.contentWindow.document, w = f.contentWindow;
    if (!w.html2canvas) {
      var s = d.createElement('script');
      s.text = texto;
      (d.head || d.documentElement).appendChild(s);
    }
    if (typeof w.html2canvas !== 'function') throw new Error('sin_libreria');
    return w.html2canvas;
  }

  // «Informe-K-23-45-12-2026-09-23.pdf»: sin tildes, sin «#» ni barras, que algunos teléfonos no
  // aceptan en un nombre de archivo, y con la fecha de la inspección, no la de hoy.
  function nombreArchivo() {
    var a = ASIG || {};
    var base = String(D.direccion || a.direccion || D.cod_registro || 'predio');
    try { base = base.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
    base = base.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'predio';
    var f = D.fecha_hora_inspeccion ? new Date(D.fecha_hora_inspeccion) : new Date();
    if (isNaN(f)) f = new Date();
    var z = function (n) { return (n < 10 ? '0' : '') + n; };
    return 'Informe-' + base + '-' + f.getFullYear() + '-' + z(f.getMonth() + 1) + '-' + z(f.getDate()) + '.pdf';
  }

  // La espera tapa la pantalla a propósito: mientras se arma el archivo, tocar otra visita cambiaría
  // debajo los datos que se están imprimiendo.
  function espera(titulo, detalle) {
    var c = document.getElementById('infEspera');
    if (!titulo) { if (c) c.parentNode.removeChild(c); return; }
    if (!c) {
      c = document.createElement('div');
      c.id = 'infEspera'; c.className = 'inf-espera';
      c.setAttribute('role', 'status'); c.setAttribute('aria-live', 'polite');
      c.innerHTML = '<div><i></i><b></b><span></span></div>';
      document.body.appendChild(c);
    }
    c.querySelector('b').textContent = titulo;
    c.querySelector('span').textContent = detalle || '';
  }
  function pesoTexto(b) {
    return b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  }
  // Dicho al terminar, con el nombre y el peso, y con un enlace por si el teléfono no enseñó la
  // descarga: hay navegadores que la guardan sin avisar y el ingeniero vuelve a pulsar.
  function avisoListo(nombre, bytes, url) {
    var v = document.getElementById('infListo');
    if (v) v.parentNode.removeChild(v);
    v = document.createElement('div');
    v.id = 'infListo'; v.className = 'inf-listo'; v.setAttribute('role', 'status');
    var t = document.createElement('span');
    t.textContent = 'PDF descargado: ' + nombre + ' (' + pesoTexto(bytes) + '). Está en Descargas.';
    var a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Abrir';
    var x = document.createElement('button');
    x.type = 'button'; x.setAttribute('aria-label', 'Cerrar el aviso'); x.innerHTML = '&#10005;';
    x.addEventListener('click', function () { if (v.parentNode) v.parentNode.removeChild(v); });
    v.appendChild(t); v.appendChild(a); v.appendChild(x);
    document.body.appendChild(v);
    setTimeout(function () { if (v.parentNode) v.parentNode.removeChild(v); }, 15000);
  }

  // El documento en un marco invisible del ancho de una hoja. Se escribe igual que el del visor, así
  // que el reparto en hojas es el mismo: la página 3 del PDF es la página 3 que se imprimiría.
  function marcoDeArchivo(inf) {
    var f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.setAttribute('tabindex', '-1');
    f.style.cssText = 'position:fixed;left:-12000px;top:0;width:820px;height:1200px;border:0;' +
                      'visibility:hidden;pointer-events:none';
    document.body.appendChild(f);
    var d = f.contentDocument || f.contentWindow.document;
    d.open(); d.write(informeHTML(inf, true)); d.close();
    return f;
  }
  function imagenCargada(im) {
    if (im.complete && im.naturalWidth) return Promise.resolve();
    return new Promise(function (ok) {
      im.addEventListener('load', function () { ok(); });
      im.addEventListener('error', function () { ok(); });
      setTimeout(ok, 15000);
    });
  }
  function esperaMarco(f) {
    var d = f.contentDocument || f.contentWindow.document;
    var imgs = Array.prototype.slice.call(d.images || []);
    var fuentes = d.fonts && d.fonts.ready ? d.fonts.ready.then(null, function () {}) : Promise.resolve();
    return Promise.all(imgs.map(imagenCargada).concat([fuentes])).then(function () { return d; });
  }

  // Las fotografías del registro van con object-fit:cover (cada una llena su recuadro sin
  // deformarse) y html2canvas 1.4 no lo sabe dibujar: las estiraría. Se recortan antes, al tamaño
  // de su recuadro, como las pinta el navegador. Una foto de otro sitio (la URL firmada de una visita
  // enviada) se pide con CORS; si el almacén no lo permitiera, se queda como está.
  function copiaConCors(im) {
    var src = String(im.currentSrc || im.src || '');
    if (src.slice(0, 5) === 'data:' || src.slice(0, 5) === 'blob:') return Promise.resolve(im);
    return new Promise(function (ok) {
      var c = new Image();
      c.crossOrigin = 'anonymous';
      c.onload = function () { ok(c); };
      c.onerror = function () { ok(null); };
      c.src = src;
      setTimeout(function () { ok(null); }, 15000);
    });
  }
  function recortaFoto(im) {
    var w = im.clientWidth, h = im.clientHeight;
    if (!w || !h || !im.naturalWidth || !im.naturalHeight) return Promise.resolve();
    return copiaConCors(im).then(function (fuente) {
      if (!fuente || !fuente.naturalWidth) return;
      var cw = Math.round(w * ESCALA_PDF), ch = Math.round(h * ESCALA_PDF);
      var c = im.ownerDocument.createElement('canvas');
      c.width = cw; c.height = ch;
      var r = Math.max(cw / fuente.naturalWidth, ch / fuente.naturalHeight);
      var sw = cw / r, sh = ch / r;
      try {
        c.getContext('2d').drawImage(fuente, (fuente.naturalWidth - sw) / 2, (fuente.naturalHeight - sh) / 2, sw, sh, 0, 0, cw, ch);
        var u = c.toDataURL('image/jpeg', 0.86);
        im.style.objectFit = 'fill';
        im.src = u;
        return imagenCargada(im);
      } catch (e) { /* lienzo manchado por una imagen sin CORS: se queda como estaba */ }
    });
  }

  function jpegDe(c) {
    return new Promise(function (ok, mal) {
      var w = c.width, h = c.height;
      function listo(bytes) {
        c.width = 0; c.height = 0;             // suelta la memoria del lienzo ya, no al final
        ok({ bytes: bytes, w: w, h: h });
      }
      function porTexto() {
        var u = c.toDataURL('image/jpeg', CALIDAD_PDF), bin = atob(u.slice(u.indexOf(',') + 1));
        var a = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
        if (a.length < 4 || a[0] !== 0xFF || a[1] !== 0xD8) return mal(new Error('lienzo_vacio'));
        listo(a);
      }
      if (!w || !h) return mal(new Error('lienzo_vacio'));
      if (!c.toBlob) return porTexto();
      c.toBlob(function (b) {
        if (!b) return mal(new Error('lienzo_vacio'));
        var fr = new FileReader();
        fr.onload = function () {
          var a = new Uint8Array(fr.result);
          if (a.length < 4 || a[0] !== 0xFF || a[1] !== 0xD8) return mal(new Error('lienzo_vacio'));
          listo(a);
        };
        fr.onerror = function () { mal(new Error('lienzo_vacio')); };
        fr.readAsArrayBuffer(b);
      }, 'image/jpeg', CALIDAD_PDF);
    });
  }

  // Texto de un diccionario PDF en UTF-16 con BOM: así una dirección con tildes sale bien en las
  // propiedades del archivo sin tener que tratar con la codificación propia del formato.
  function textoPdf(s) {
    var h = '<FEFF';
    String(s == null ? '' : s).slice(0, 200).split('').forEach(function (ch) {
      h += ('000' + ch.charCodeAt(0).toString(16).toUpperCase()).slice(-4);
    });
    return h + '>';
  }
  function fechaPdf() {
    var d = new Date(), z = function (n) { return (n < 10 ? '0' : '') + n; };
    return 'D:' + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + z(d.getHours()) + z(d.getMinutes()) + z(d.getSeconds());
  }
  // El archivo: catálogo, árbol de páginas, propiedades y, por cada hoja, su página, su contenido
  // (dibujar la imagen a página completa) y la imagen JPEG. La tabla de referencias apunta al byte
  // donde empieza cada objeto, así que se cuenta lo escrito byte a byte.
  function pdfDeHojas(paginas, titulo) {
    var partes = [], pos = 0, offs = [], i;
    function bytes(s) {
      var u = new Uint8Array(s.length);
      for (var k = 0; k < s.length; k++) u[k] = s.charCodeAt(k) & 255;
      return u;
    }
    function pon(x) { if (typeof x === 'string') x = bytes(x); partes.push(x); pos += x.length; }
    function obj(n, cuerpo) { offs[n] = pos; pon(n + ' 0 obj\n' + cuerpo + '\nendobj\n'); }
    var W = A4_PT[0], H = A4_PT[1], n = paginas.length, hijos = [];
    for (i = 0; i < n; i++) hijos.push((4 + 3 * i) + ' 0 R');
    pon('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [' + hijos.join(' ') + '] /Count ' + n + ' >>');
    obj(3, '<< /Title ' + textoPdf(titulo) + ' /Producer ' + textoPdf('Visita post-sismo · Infimanizales') +
           ' /CreationDate (' + fechaPdf() + ') >>');
    for (i = 0; i < n; i++) {
      var p = paginas[i], np = 4 + 3 * i, nc = np + 1, ni = np + 2;
      obj(np, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /XObject << /I' + i +
              ' ' + ni + ' 0 R >> /ProcSet [/PDF /ImageC] >> /Contents ' + nc + ' 0 R >>');
      var cs = 'q ' + W + ' 0 0 ' + H + ' 0 0 cm /I' + i + ' Do Q';
      obj(nc, '<< /Length ' + cs.length + ' >>\nstream\n' + cs + '\nendstream');
      offs[ni] = pos;
      pon(ni + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + p.w + ' /Height ' + p.h +
          ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + p.bytes.length + ' >>\nstream\n');
      pon(p.bytes);
      pon('\nendstream\nendobj\n');
    }
    var total = 4 + 3 * n, xref = pos, t = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
    for (i = 1; i < total; i++) t += ('000000000' + offs[i]).slice(-10) + ' 00000 n \n';
    pon(t + 'trailer\n<< /Size ' + total + ' /Root 1 0 R /Info 3 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    return new Blob(partes, { type: 'application/pdf' });
  }

  function bajaArchivo(blob, nombre) {
    if (ultimoPdf) { try { URL.revokeObjectURL(ultimoPdf); } catch (e) {} }
    var url = ultimoPdf = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = nombre; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { if (a.parentNode) a.parentNode.removeChild(a); }, 0);
    return url;
  }

  // Todo el camino, con la espera a la vista. `inf` ya está armado: se arma antes de la primera
  // espera, mientras la página tiene todavía cargada la visita que se pidió.
  function descargaInforme(inf) {
    if (descargando) return Promise.reject(new Error('ya_descargando'));
    descargando = true;
    var nombre = nombreArchivo(), marco = null, t0 = Date.now();
    var reloj = null, perdido = false;
    espera('Preparando el informe en PDF…', 'Se arma en el teléfono, no necesita señal.');
    var trabajo = cargaLibreria().then(function (texto) {
      if (perdido) throw new Error('tardo');
      marco = marcoDeArchivo(inf);
      var h2c = libreriaEnMarco(marco, texto);
      return esperaMarco(marco).then(function (d) {
        var fotos = Array.prototype.slice.call(d.querySelectorAll('.fotos img'));
        return fotos.reduce(function (cad, im) { return cad.then(function () { return recortaFoto(im); }); }, Promise.resolve())
          .then(function () { return d; });
      }).then(function (d) {
        var hojas = Array.prototype.slice.call(d.querySelectorAll('#doc > .hoja'));
        if (!hojas.length) throw new Error('sin_hojas');
        var paginas = [];
        return hojas.reduce(function (cad, hoja, i) {
          return cad.then(function () {
            if (perdido) throw new Error('tardo');
            espera('Preparando el informe en PDF…', 'Página ' + (i + 1) + ' de ' + hojas.length + '.');
            // html2canvas copia el documento entero en cada llamada, con todas sus fotos: con 65
            // fotos y 8 hojas eran 520 imágenes que decodificar. Las otras hojas no se copian.
            return h2c(hoja, { scale: ESCALA_PDF, backgroundColor: '#ffffff', useCORS: true, logging: false,
                               windowWidth: 820, windowHeight: 1200, scrollX: 0, scrollY: 0,
                               ignoreElements: function (el) {
                                 return el !== hoja && !!el.classList && el.classList.contains('hoja');
                               } })
              .then(jpegDe).then(function (p) { paginas.push(p); });
          });
        }, Promise.resolve()).then(function () { return paginas; });
      });
    }).then(function (paginas) {
      // Si ya se dio por perdido, la vista de impresión está abierta: una descarga que llegara ahora
      // sería una sorpresa, no una ayuda.
      if (perdido) throw new Error('tardo');
      var blob = pdfDeHojas(paginas, inf.titulo + ' · ' + inf.ref);
      var url = bajaArchivo(blob, nombre);
      anota('informe', { detalle: { pdf: 'archivo', paginas: paginas.length, kb: Math.round(blob.size / 1024),
                                    ms: Date.now() - t0 } });
      avisoListo(nombre, blob.size, url);
      return { nombre: nombre, bytes: blob.size, paginas: paginas.length, url: url, blob: blob };
    });
    // Un teléfono que se queda sin memoria a veces no falla: se queda callado. A los 90 segundos se
    // da por perdido y se pasa a la vista de impresión.
    var tope = new Promise(function (ok, mal) {
      reloj = setTimeout(function () { perdido = true; mal(new Error('tardo')); }, 90000);
    });
    function limpia() {
      if (reloj) clearTimeout(reloj);
      espera('');
      if (marco && marco.parentNode) marco.parentNode.removeChild(marco);
      descargando = false;
    }
    return Promise.race([trabajo, tope]).then(function (r) { limpia(); return r; },
      function (e) {
        limpia();
        anota('informe', { detalle: { pdf: 'falla', motivo: String(e && e.message || e).slice(0, 80) } });
        throw e;
      });
  }

  // Lo que pasa cada página: se guarda aquí antes de armar nada. `doc` no toca la telemetría.
  function ponContexto(ctx, conAnota) {
    D = (ctx && ctx.respuestas) || {};
    idxCampo = (ctx && ctx.campos) || {};
    REF = (ctx && ctx.ref) || '';
    FOTO = (ctx && ctx.fotoSrc) || null;
    LISTAS = (ctx && ctx.listas) || {};
    ASIG = (ctx && ctx.asignacion) || null;
    LOGO = (ctx && ctx.logo) || '';
    PERFIL_ = (ctx && ctx.perfil) || {};
    VERSION = (ctx && ctx.version) || '';
    HAY_DEM = !!(ctx && ctx.hayDemolicion);
    CORRECCIONES = (ctx && Array.isArray(ctx.correcciones)) ? ctx.correcciones : [];
    if (ctx && ctx.esc) esc = ctx.esc;
    if (ctx && ctx.textoValor) textoValor = ctx.textoValor;
    if (conAnota) anota = (ctx && ctx.anota) || function () {};
  }

  return {
    abre: function (ctx) {
      ponContexto(ctx, true);
      inyectaEstilos();
      abreInforme(ctx && ctx.aviso);
    },
    doc: function (ctx) {
      ponContexto(ctx, false);
      return informeDoc();
    },
    // El PDF como archivo. El documento se arma YA, sin esperar a nada: textoValor() lee la visita
    // que la página tiene cargada, y dentro de un segundo podría ser otra.
    descarga: function (ctx) {
      ponContexto(ctx, true);
      inyectaEstilos();
      var inf;
      try { inf = informeDoc(); } catch (e) { return Promise.reject(e); }
      return descargaInforme(inf);
    },
    // la lectura de los pisos marcados, para que el panel los escriba igual que el documento
    pisos: textoPisos
  };
})();
