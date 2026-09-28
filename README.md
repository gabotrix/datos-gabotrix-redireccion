# Redirección de datos.gabotrix.com

El dominio viejo de la sala de datos reenvía a **https://manizalesconstruye.camacolcaldas.com** con la ruta, los
parámetros y el ancla completos, para que no se rompa ningún enlace ya compartido.

`/campo/` es la excepción: una copia del formulario de campo con un guardián. Si el teléfono tiene visitas sin enviar
guardadas en el dominio viejo, la app abre aquí para enviarlas; cuando no queda ninguna, pasa sola al dominio nuevo.

Para refrescar la copia del formulario: `python construir.py` (lee `../repo/campo`), commit y push.
Cuando ningún teléfono tenga visitas pendientes en el dominio viejo, `campo/` puede borrarse y todo queda como redirección.
