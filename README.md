# Taquería POS

Sistema standalone (sin instalación, sin internet, sin servidor) para llevar el control de ventas e inventario de una taquería: tacos y quesadillas de bistec, longaniza, campechano (bistec+longaniza), arrachera y rib eye, más órdenes de guacamole (150 g).

## Cómo usarlo

1. Copia toda la carpeta `taqueria-pos` (los 4 archivos: `index.html`, `style.css`, `app.js`, `logo.png`) a la computadora o tablet del negocio — por USB, o compartiendo la carpeta.
2. Abre `index.html` con doble clic. Se abre en tu navegador (Chrome, Edge o Firefox) y ya puedes usarlo.
3. Funciona 100% sin internet. No necesita instalación, cuenta, ni servidor.
4. Para tenerlo siempre a la mano, crea un acceso directo a `index.html` en el escritorio.

**Los datos se guardan en el propio navegador de ese dispositivo** (localStorage). Si abres la app en otra computadora, empieza con inventario en cero — usa **Configuración → Exportar respaldo** para moverlos.

## Pestañas del sistema

- **🔥 Preparar** — botones por producto (ej. "Taco de Bistec"). Al elegir uno, capturas cuántas piezas preparaste y cuánta carne (gramos) y tortillas usaste. Esto resta de la materia prima cruda y suma al inventario de producto listo para vender.
- **🧾 Vender** — botones por producto y guacamole; los tacos se venden por pieza, orden (x5) o kilo, y las **quesadillas únicamente por pieza**. Tacos y quesadillas se pueden marcar "con queso extra". Cada click arma un ticket; "Cobrar y registrar venta" descuenta inventario y registra la venta del día.
- **📦 Compras** — registra entradas de materia prima (carne cruda, tortillas, guacamole, queso) cuando llega mercancía.
- **📊 Inventario** — existencias actuales de materia prima (kg de carne, tortillas, guacamole y queso) y de producto preparado (piezas de tacos/quesadillas por sabor, con su gramaje). Cada renglón tiene un botón "Ajustar" para corregir por conteo físico. El inventario se actualiza automáticamente al preparar, vender, comprar, **editar o cancelar** una venta.
- **📈 Reportes** — reporte diario (por fecha), reporte mensual (con gráfica de ventas por día) e historial completo de movimientos. Cada reporte se puede **imprimir/guardar como PDF** o **enviar por WhatsApp** con un resumen de texto. Desde el historial, cualquier venta ya cobrada se puede **editar** (cambia los artículos y ajusta el inventario) o **cancelar** (devuelve todo el inventario descontado).
- **⚙️ Configuración** — precios por producto/formato, precio de guacamole, gramaje de queso extra, mezcla del campechano, gramos por pieza y por tortilla, y umbrales de alerta de stock bajo. También exportar/importar respaldo en `.json` y reiniciar datos.

## Edición y cancelación de ventas

- Desde **Reportes → Historial de movimientos**, cada venta activa tiene botones **Editar** y **Cancelar**.
- **Editar** abre la venta en la pestaña Vender: puedes quitar artículos, agregar otros nuevos o cambiar cantidades, y "Guardar cambios de venta" reemplaza la venta original y ajusta el inventario (revierte lo descontado por la venta anterior y aplica lo nuevo). Puedes cancelar la edición sin afectar nada.
- **Cancelar** devuelve al inventario todo lo que esa venta había descontado (piezas, carne, queso, guacamole) y marca la venta como "Cancelada" — ya no cuenta en los reportes de ventas, pero queda en el historial para auditoría.
- Las ventas registradas antes de esta función siguen pudiéndose editar/cancelar; como no guardaban el detalle exacto de lo descontado, el sistema usa el promedio actual de gramaje como mejor aproximación al revertir el inventario.

## Supuestos de diseño (ajustables en Configuración o pidiendo cambios)

- **Quesadillas** se venden únicamente **por pieza** (no por orden x5 ni por kilo), y usan el mismo gramaje de carne por pieza que el taco del mismo producto.
- **Gramos de carne por pieza** (Configuración → "Gramos de carne por pieza"): valores tomados del registro real de operación — bistec y longaniza 61 g, arrachera y rib eye 41 g.
- **Campechano** no tiene materia prima propia: al preparar campechano, la carne se descuenta según la mezcla configurada (Configuración → "Campechano — mezcla por pieza"), por defecto 41 g de longaniza + 31 g de bistec por pieza.
- **Queso extra**: al vender, se puede marcar "Con queso extra" — suma el precio configurado por pieza y descuenta queso rallado del inventario (por defecto 61 g y $10 por pieza).
- **Tortillas** se compran y se controlan por **kg** (como llegan del proveedor); al preparar se captura la cantidad de piezas usadas y el sistema las convierte a gramos con el parámetro "Gramos de tortilla por pieza" (por defecto 34 g/pieza, según el consumo real registrado).
- **Ventas "por kilo"** se convierten a piezas equivalentes usando el gramaje por pieza de cada producto — así el conteo de piezas se mantiene consistente con los kilos vendidos.
- Si una preparación o venta dejaría el inventario en negativo, el sistema muestra una advertencia; puedes confirmar de todas formas (por si el conteo físico está desactualizado) y corregirlo después desde Inventario → Ajustar.
- Los precios y umbrales de alerta son valores de referencia iniciales — edítalos en Configuración según tu negocio.

## Respaldo de información

Ve a **Configuración → Exportar respaldo (.json)** regularmente (por ejemplo, al cerrar el día) y guarda el archivo en un USB o en la nube. Si necesitas restaurar información o pasar los datos a otra computadora, usa **Importar respaldo** con ese mismo archivo.
