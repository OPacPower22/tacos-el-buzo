# Taquería POS

Sistema standalone (sin instalación, sin internet, sin servidor) para llevar el control de ventas e inventario de una taquería: tacos y quesadillas de bistec, longaniza, campechano (bistec+longaniza) y arrachera, más órdenes de guacamole (150 g).

## Cómo usarlo

1. Copia toda la carpeta `taqueria-pos` (los 4 archivos: `index.html`, `style.css`, `app.js`, `logo.png`) a la computadora o tablet del negocio — por USB, o compartiendo la carpeta.
2. Abre `index.html` con doble clic. Se abre en tu navegador (Chrome, Edge o Firefox) y ya puedes usarlo.
3. Funciona 100% sin internet. No necesita instalación, cuenta, ni servidor.
4. Para tenerlo siempre a la mano, crea un acceso directo a `index.html` en el escritorio.

**Los datos se guardan en el propio navegador de ese dispositivo** (localStorage). Si abres la app en otra computadora, empieza con inventario en cero — usa **Configuración → Exportar respaldo** para moverlos.

## Pestañas del sistema

- **🧾 Vender** — botones por producto y guacamole; los tacos se venden por pieza, orden (x5) o kilo, y las **quesadillas únicamente por pieza**. Cada venta descuenta **directo de la materia prima** (carne cruda y tortillas, según el gramaje configurado) — no hay un paso previo de "preparar". Tacos y quesadillas se pueden marcar "con queso extra". Cada click arma un ticket; puedes aplicar un **descuento al ticket (% o $) con nota obligatoria del motivo**; "Cobrar y registrar venta" descuenta inventario y registra la venta del día.
- **📦 Compras** — registra entradas de materia prima (carne cruda, tortillas, guacamole, queso, queso para gratinar, aceite) cuando llega mercancía.
- **📊 Inventario** — existencias actuales de materia prima (kg de carne, tortillas, guacamole y queso). Cada renglón tiene un botón "Ajustar" para corregir por conteo físico. El inventario se actualiza automáticamente al vender, comprar, **editar o cancelar** una venta.
- **📈 Reportes** — reporte diario (por fecha), reporte mensual (con gráfica de ventas por día) e historial completo de movimientos. Cada reporte se puede **imprimir/guardar como PDF** o **enviar por WhatsApp como imagen** (JPG/PNG generada en el momento, sin depender de internet para crearla). Desde el historial, cualquier venta ya cobrada se puede **editar** (cambia los artículos y ajusta el inventario) o **cancelar con nota del motivo** (devuelve todo el inventario descontado); el reporte diario incluye una tabla de "Cancelaciones del día" con su nota documental.
- **⚙️ Configuración** — precios por producto/formato, precio de guacamole, gramaje de queso extra, mezcla del campechano, gramos por pieza, tortillas por pieza (taco/quesadilla) y umbrales de alerta de stock bajo. También exportar/importar respaldo en `.json` y reiniciar datos.

## Descuentos en ventas

- En la pestaña **Vender**, con artículos en el ticket, el botón **"🏷️ Aplicar descuento"** abre un formulario para capturar un descuento por porcentaje o monto fijo.
- La **nota del motivo es obligatoria** (ej. "cliente frecuente", "promoción", "cortesía") — sin nota no se puede guardar el descuento. Queda documentada en la venta y en el historial de movimientos.
- El descuento se aplica sobre el subtotal del ticket completo; se puede quitar con el botón ✕ antes de cobrar.

## Edición y cancelación de ventas

- Desde **Reportes → Historial de movimientos**, cada venta activa tiene botones **Editar** y **Cancelar**.
- **Editar** abre la venta en la pestaña Vender: puedes quitar artículos, agregar otros nuevos, cambiar cantidades o el descuento, y "Guardar cambios de venta" reemplaza la venta original y ajusta el inventario (revierte lo descontado por la venta anterior y aplica lo nuevo). Puedes cancelar la edición sin afectar nada.
- **Cancelar** pide una **nota del motivo** (ej. "error de captura", "cliente canceló"), devuelve al inventario todo lo que esa venta había descontado (carne, tortillas, queso, guacamole) y marca la venta como "Cancelada" — ya no cuenta en los reportes de ventas, pero queda documentada en el historial y en la tabla de "Cancelaciones del día" del reporte diario, para auditoría.

## Envío de reportes por WhatsApp (imagen)

- El botón **"📲 Enviar por WhatsApp"** de cada reporte genera una **imagen (PNG)** del reporte (encabezado, estadísticas y tabla), dibujada localmente en el navegador — no requiere internet para crearla.
- En navegadores/dispositivos que soportan compartir archivos (la mayoría de celulares), se abre directamente el selector para enviarla por WhatsApp u otra app.
- Si el navegador no soporta compartir archivos (típico en computadoras de escritorio), la imagen se descarga automáticamente y se abre WhatsApp Web con un texto resumen — solo hace falta adjuntar la imagen descargada al chat.

## Supuestos de diseño (ajustables en Configuración o pidiendo cambios)

- **Quesadillas** se venden únicamente **por pieza** (no por orden x5 ni por kilo), y usan el mismo gramaje de carne por pieza que el taco del mismo producto.
- **Gramos de carne cruda por pieza** (Configuración → "Gramos de carne por pieza"): verificado contra el Excel de operación (`vtas-tacos.xlsx`, hoja "Cálculo por taco") — bistec y longaniza 60 g/pieza (~16-17 tacos por kg), arrachera 40 g/pieza (~25 tacos por kg).
- **Campechano** no tiene materia prima propia: al vender campechano, la carne se descuenta según la mezcla configurada (Configuración → "Campechano — mezcla por pieza"), por defecto 35 g de longaniza + 25 g de bistec por pieza (60 g totales).
- **Queso extra**: al vender, se puede marcar "Con queso extra" — suma el precio configurado por pieza y descuenta queso rallado del inventario (por defecto 61 g y $10 por pieza).
- **Tortillas**: se compran y se controlan por **kg** (como llegan del proveedor, a 34 g por tortilla). Cada **taco usa 2 tortillas** y cada **quesadilla usa 1 tortilla** (Configuración → "Tortillas — parámetros de conversión y alertas"); el sistema descuenta esas tortillas automáticamente en gramos al registrar la venta.
- **Ventas "por kilo"** se convierten a piezas equivalentes usando el gramaje por pieza de cada producto — así el conteo de piezas se mantiene consistente con los kilos vendidos.
- Si una venta dejaría la materia prima en negativo, el sistema muestra una advertencia; puedes agregarla de todas formas (por si el conteo físico está desactualizado) y corregirlo después desde Inventario → Ajustar.
- Los precios y umbrales de alerta son valores de referencia iniciales — edítalos en Configuración según tu negocio.

## Respaldo de información

Ve a **Configuración → Exportar respaldo (.json)** regularmente (por ejemplo, al cerrar el día) y guarda el archivo en un USB o en la nube. Si necesitas restaurar información o pasar los datos a otra computadora, usa **Importar respaldo** con ese mismo archivo.
