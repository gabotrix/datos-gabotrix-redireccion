/* datos.gabotrix.com → manizalesconstruye.camacolcaldas.com, conservando ruta, parámetros y ancla.
   Los enlaces personales de los ingenieros (?e=…#k=…), los de formularios de demolición (?t=…) y las
   posiciones del mapa (#zoom/lat/lon) llegan intactos. */
(function () {
  var NUEVO = 'https://manizalesconstruye.camacolcaldas.com';
  location.replace(NUEVO + location.pathname + location.search + location.hash);
})();
