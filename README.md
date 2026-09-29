# Redirección de datos.gabotrix.com

El dominio viejo de la sala de datos reenvía a **https://manizalesconstruye.camacolcaldas.com** con la ruta, los
parámetros y el ancla completos, para que no se rompa ningún enlace ya compartido.

`/campo/` es la excepción: una copia del formulario de campo con un guardián (`guardian.js`). Lo que un teléfono
guardó sin enviar vive en el almacenamiento del dominio viejo y el nuevo no puede leerlo, así que el guardián
(v2, 29-sep-2026):

- sin visitas pendientes (terminadas o pasadas del primer paso), va directo al dominio nuevo, con el enlace personal
  (`?e=`) aunque se haya abierto desde el icono;
- con pendientes y con señal, deja que la app envíe las terminadas (hasta un minuto), sube el resto como borrador a
  `campo-borrador` (respuestas y cada foto) y se va. En el dominio nuevo sale «Hay trabajo guardado en el servidor» y
  cada visita vuelve con «Traer», fotos incluidas;
- sin señal, o si algo no sube, la app funciona aquí sin aviso y lo reintenta al volver a abrirse;
- una visita con documentos PDF no cabe en un borrador: esa se envía desde aquí, con una nota azul.

Lo subido queda anotado en el teléfono (`psismo.migradoAlNuevo`) y no se sube dos veces; nada se borra de él.

Para refrescar la copia del formulario: `python construir.py` (lee `../repo/campo`, que debe estar en `origin/main`),
commit y PR. Cuando ningún teléfono tenga visitas pendientes en el dominio viejo, `campo/` puede borrarse y todo queda
como redirección.
