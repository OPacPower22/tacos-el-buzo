'use strict';

/* ======================================================================
   CONSTANTES DEL NEGOCIO
   ====================================================================== */
const STORAGE_KEY = 'taqueria_pos_v1';
const THEME_KEY = 'taqueria_theme';

const PROTEINS = [
  { id: 'bistec',     name: 'Bistec',     icon: '🥩', combo: null },
  { id: 'longaniza',  name: 'Longaniza',  icon: '🌭', combo: null },
  { id: 'campechano', name: 'Campechano', icon: '🔀', combo: ['bistec', 'longaniza'], sub: 'Bistec y longaniza' },
  { id: 'arrachera',  name: 'Arrachera',  icon: '🍖', combo: null },
  { id: 'ribeye',     name: 'Rib Eye',    icon: '🥓', combo: null },
];

const TIPOS = [
  { id: 'taco',       name: 'Taco',       icon: '🌮' },
  { id: 'quesadilla', name: 'Quesadilla', icon: '🧀' },
];

const FORMATOS = [
  { id: 'pieza',  name: 'Pieza',      unit: 'pza',  step: 1,    def: 1 },
  { id: 'orden5', name: 'Orden (x5)', unit: 'orden', step: 1,   def: 1 },
  { id: 'kilo',   name: 'Kilo',       unit: 'kg',   step: 0.1,  def: 0.5 },
];

// Las quesadillas se venden únicamente por pieza (no por orden x5 ni por kilo).
function formatosForTipo(tipoId) {
  return tipoId === 'quesadilla' ? FORMATOS.filter(fo => fo.id === 'pieza') : FORMATOS;
}

const INSUMOS = [
  { id: 'bistec',    label: 'Bistec crudo',    unit: 'kg' },
  { id: 'longaniza', label: 'Longaniza cruda', unit: 'kg' },
  { id: 'arrachera', label: 'Arrachera cruda', unit: 'kg' },
  { id: 'ribeye',    label: 'Rib Eye crudo',   unit: 'kg' },
  { id: 'tortillas', label: 'Tortillas',       unit: 'kg' },
  { id: 'guacamole', label: 'Guacamole preparado', unit: 'kg' },
  { id: 'queso',     label: 'Queso rallado',   unit: 'kg' },
  { id: 'tortillasHarina', label: 'Tortillas de harina', unit: 'kg' },
];

// Insumos que se registran/capturan en kg pero se guardan internamente en gramos
// (igual que el guacamole), para tener precisión pieza a pieza.
const GRAM_BASED_INSUMOS = ['guacamole', 'tortillas', 'queso', 'tortillasHarina'];

const MOVEMENT_LABELS = {
  compra: 'Compra',
  produccion: 'Producción',
  venta: 'Venta',
  ajuste: 'Ajuste',
  edicion_venta: 'Edición de venta',
  cancelacion_venta: 'Cancelación de venta',
};

// Tortillas físicas usadas por pieza (no confundir con los gramos de una tortilla).
const TORTILLAS_POR_TIPO_DEFAULT = { taco: 2, quesadilla: 1 };

/* ======================================================================
   ESTADO Y PERSISTENCIA
   ====================================================================== */
function defaultPricesForProtein(id) {
  const base = {
    bistec:     { taco: { pieza: 18, orden5: 85,  kilo: 260 }, quesadilla: { pieza: 28, orden5: 130, kilo: 300 } },
    longaniza:  { taco: { pieza: 16, orden5: 75,  kilo: 230 }, quesadilla: { pieza: 26, orden5: 120, kilo: 270 } },
    campechano: { taco: { pieza: 18, orden5: 85,  kilo: 260 }, quesadilla: { pieza: 28, orden5: 130, kilo: 300 } },
    arrachera:  { taco: { pieza: 25, orden5: 120, kilo: 420 }, quesadilla: { pieza: 35, orden5: 165, kilo: 460 } },
    ribeye:     { taco: { pieza: 30, orden5: 145, kilo: 520 }, quesadilla: { pieza: 40, orden5: 190, kilo: 560 } },
  };
  return base[id];
}

function defaultState() {
  const prices = {};
  PROTEINS.forEach(p => { prices[p.id] = defaultPricesForProtein(p.id); });
  return {
    // tortillas y queso se guardan en gramos (como el guacamole); se compran por kg.
    raw: { bistec: 5, longaniza: 5, arrachera: 3, ribeye: 2, tortillas: 10200, guacamole: 1500, queso: 1000, tortillasHarina: 2000 },
    prices,
    guacPrice: 35,
    alambrePrice: 450,
    settings: {
      // Gramos de carne cruda por pieza (taco o quesadilla), verificado contra el Excel de operación:
      // arrachera/rib eye 40 g (~25 tacos/kg), bistec/longaniza 60 g (~16-17 tacos/kg).
      gramosPorProducto: { bistec: 60, longaniza: 60, arrachera: 40, ribeye: 40 },
      // El campechano combina longaniza y bistec en proporción propia (no 50/50): 60 g por pieza en total.
      campechanoLonganiza: 35,
      campechanoBistec: 25,
      quesoGramos: 61,
      quesoPrecio: 10,
      gramosPorTortilla: 34,
      // Tortillas físicas (piezas) usadas por producto: el taco lleva 2, la quesadilla 1.
      tortillasPorTipo: { ...TORTILLAS_POR_TIPO_DEFAULT },
      alertaStockBajoKg: 1,
      alertaTortillasKg: 2,
      // Alambre: 750 g totales (190 g c/u de bistec, arrachera, longaniza y queso),
      // servido con 4 tortillas de harina (tamaño distinto al de la tortilla de la quesadilla).
      alambre: { bistec: 190, arrachera: 190, longaniza: 190, queso: 190, tortillas: 4, gramosPorTortilla: 45 },
      alertaTortillasHarinaKg: 1,
    },
    movements: [],
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const def = defaultState();
    // merge shallow to survive future field additions
    const settings = Object.assign(def.settings, parsed.settings);
    settings.gramosPorProducto = Object.assign(def.settings.gramosPorProducto, parsed.settings?.gramosPorProducto);
    settings.tortillasPorTipo = Object.assign(def.settings.tortillasPorTipo, parsed.settings?.tortillasPorTipo);
    return {
      raw: Object.assign(def.raw, parsed.raw),
      prices: Object.assign(def.prices, parsed.prices),
      guacPrice: parsed.guacPrice ?? def.guacPrice,
      alambrePrice: parsed.alambrePrice ?? def.alambrePrice,
      settings,
      movements: parsed.movements || [],
    };
  } catch (e) {
    console.error('Error cargando datos, se usa estado por defecto', e);
    return defaultState();
  }
}

let STATE = loadState();
let TICKET = []; // ítems en construcción, no persistidos hasta cobrar

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE));
}

function pushMovement(type, detail) {
  STATE.movements.push({ id: uid(), ts: Date.now(), type, ...detail });
}

/* ======================================================================
   UTILIDADES
   ====================================================================== */
function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

function money(n) {
  return (n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}
function num(n, decimals = 0) {
  return (n || 0).toLocaleString('es-MX', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function proteinById(id) { return PROTEINS.find(p => p.id === id); }
function tipoById(id) { return TIPOS.find(t => t.id === id); }
function formatoById(id) { return FORMATOS.find(f => f.id === id); }
function formatoLabel(formatoId) {
  if (!formatoId) return '—';
  return formatoById(formatoId)?.name || (formatoId === 'orden' ? 'Orden' : formatoId);
}
function todayStr(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function monthStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function fmtDateTime(ts) {
  return new Date(ts).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function gramosPorPieza(state, proteinId) {
  if (proteinId === 'campechano') return state.settings.campechanoLonganiza + state.settings.campechanoBistec;
  return state.settings.gramosPorProducto[proteinId] || 1;
}
function campechanoSplitKg(gramos) {
  const s = STATE.settings;
  const total = s.campechanoLonganiza + s.campechanoBistec;
  return {
    longaniza: gramos * (s.campechanoLonganiza / total) / 1000,
    bistec: gramos * (s.campechanoBistec / total) / 1000,
  };
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ======================================================================
   LÓGICA DE NEGOCIO (mutaciones de estado)
   ====================================================================== */
// Piezas equivalentes a partir de la materia prima cruda disponible (solo para mostrar
// disponibilidad estimada en Vender; no bloquea la venta, igual que antes con "Preparar").
function piezasDisponiblesEstimadas(proteinId) {
  const p = proteinById(proteinId);
  if (p.combo) {
    const s = STATE.settings;
    return Math.floor(Math.min(
      (STATE.raw.bistec * 1000) / s.campechanoBistec,
      (STATE.raw.longaniza * 1000) / s.campechanoLonganiza,
    ));
  }
  const gpp = gramosPorPieza(STATE, proteinId);
  return Math.floor((STATE.raw[proteinId] * 1000) / gpp);
}

function alambreOrdenesDisponibles() {
  const a = STATE.settings.alambre;
  return Math.floor(Math.min(
    (STATE.raw.bistec * 1000) / a.bistec,
    (STATE.raw.arrachera * 1000) / a.arrachera,
    (STATE.raw.longaniza * 1000) / a.longaniza,
    STATE.raw.queso / a.queso,
    STATE.raw.tortillasHarina / (a.tortillas * a.gramosPorTortilla),
  ));
}

function computeSaleItemImpact(item) {
  // devuelve { piezas, gramos, gramosTortilla, quesoGramos } sin mutar el estado
  // (para preview del ticket y para aplicar/revertir contra materia prima cruda).
  if (item.protein === 'guacamole') {
    return { gramos: item.cantidad * 150 };
  }
  if (item.protein === 'alambre') {
    const a = STATE.settings.alambre;
    return {
      gramos: (a.bistec + a.arrachera + a.longaniza) * item.cantidad,
      gramosBistec: a.bistec * item.cantidad,
      gramosArrachera: a.arrachera * item.cantidad,
      gramosLonganiza: a.longaniza * item.cantidad,
      gramosQueso: a.queso * item.cantidad,
      gramosTortillaHarina: a.tortillas * a.gramosPorTortilla * item.cantidad,
    };
  }
  const gpp = gramosPorPieza(STATE, item.protein);
  let piezas;
  if (item.formato === 'pieza') {
    piezas = item.cantidad;
  } else if (item.formato === 'orden5') {
    piezas = item.cantidad * 5;
  } else {
    piezas = Math.round((item.cantidad * 1000) / gpp);
  }
  const gramos = item.formato === 'kilo' ? item.cantidad * 1000 : piezas * gpp;
  const tortillasPorPieza = STATE.settings.tortillasPorTipo[item.tipo] || 0;
  const gramosTortilla = piezas * tortillasPorPieza * STATE.settings.gramosPorTortilla;
  const quesoGramos = item.conQueso ? piezas * STATE.settings.quesoGramos : 0;
  return { piezas, gramos, gramosTortilla, quesoGramos };
}

function applySaleItem(item) {
  // Aplica el impacto en inventario (materia prima cruda) y lo guarda en el propio item
  // (item.impact), para poder revertirlo con exactitud si la venta se edita o cancela después.
  if (item.protein === 'guacamole') {
    const impact = { gramos: item.cantidad * 150 };
    STATE.raw.guacamole -= impact.gramos;
    item.impact = impact;
    return impact;
  }
  if (item.protein === 'alambre') {
    const impact = computeSaleItemImpact(item);
    STATE.raw.bistec -= impact.gramosBistec / 1000;
    STATE.raw.arrachera -= impact.gramosArrachera / 1000;
    STATE.raw.longaniza -= impact.gramosLonganiza / 1000;
    STATE.raw.queso -= impact.gramosQueso;
    STATE.raw.tortillasHarina -= impact.gramosTortillaHarina;
    item.impact = impact;
    return impact;
  }
  const impact = computeSaleItemImpact(item);
  const p = proteinById(item.protein);
  if (p.combo) {
    const split = campechanoSplitKg(impact.gramos);
    STATE.raw.longaniza -= split.longaniza;
    STATE.raw.bistec -= split.bistec;
  } else {
    STATE.raw[item.protein] -= impact.gramos / 1000;
  }
  STATE.raw.tortillas -= impact.gramosTortilla;
  if (impact.quesoGramos) STATE.raw.queso -= impact.quesoGramos;
  item.impact = impact;
  return impact;
}

function reverseSaleItemImpact(item) {
  // Ventas registradas antes de esta versión no traen "impact" guardado;
  // en ese caso se recalcula con los parámetros actuales como mejor aproximación.
  const impact = item.impact || computeSaleItemImpact(item);
  if (item.protein === 'guacamole') {
    STATE.raw.guacamole += impact.gramos;
    return;
  }
  if (item.protein === 'alambre') {
    STATE.raw.bistec += impact.gramosBistec / 1000;
    STATE.raw.arrachera += impact.gramosArrachera / 1000;
    STATE.raw.longaniza += impact.gramosLonganiza / 1000;
    STATE.raw.queso += impact.gramosQueso;
    STATE.raw.tortillasHarina += impact.gramosTortillaHarina;
    return;
  }
  const p = proteinById(item.protein);
  if (p.combo) {
    const split = campechanoSplitKg(impact.gramos);
    STATE.raw.longaniza += split.longaniza;
    STATE.raw.bistec += split.bistec;
  } else {
    STATE.raw[item.protein] += impact.gramos / 1000;
  }
  STATE.raw.tortillas += impact.gramosTortilla || 0;
  if (impact.quesoGramos) STATE.raw.queso += impact.quesoGramos;
}

function applyPurchase(insumoId, cantidad) {
  if (GRAM_BASED_INSUMOS.includes(insumoId)) STATE.raw[insumoId] += cantidad * 1000;
  else STATE.raw[insumoId] += cantidad;
}

/* ======================================================================
   MODAL GENÉRICO
   ====================================================================== */
const modalBackdrop = document.getElementById('modalBackdrop');
const modalEl = document.getElementById('modal');

function openModal(html, onMount, { wide = false } = {}) {
  modalEl.innerHTML = html;
  modalEl.classList.toggle('modal-wide', wide);
  modalBackdrop.classList.add('open');
  if (onMount) onMount(modalEl);
}
function closeModal() {
  modalBackdrop.classList.remove('open');
  modalEl.innerHTML = '';
}
modalBackdrop.addEventListener('click', e => { if (e.target === modalBackdrop) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* ======================================================================
   TAB: VENDER
   ====================================================================== */
function renderSellGrid() {
  const grid = document.getElementById('sellGrid');
  const sections = TIPOS.map(t => {
    const cards = PROTEINS.map(p => {
      const piezasEstimadas = piezasDisponiblesEstimadas(p.id);
      const low = piezasEstimadas <= 0;
      const buttons = formatosForTipo(t.id).map(fo => {
        const price = STATE.prices[p.id][t.id][fo.id];
        return `<button class="btn btn-sm" data-action="sell" data-protein="${p.id}" data-tipo="${t.id}" data-formato="${fo.id}">${fo.name}<br><span class="field-hint">${money(price)}</span></button>`;
      }).join('');
      return `
        <div class="product-btn" data-protein="${p.id}">
          <div class="p-icon">${t.icon}</div>
          <div class="p-name">${p.name}</div>
          <div class="p-stock ${low ? 'low' : ''}">~${num(piezasEstimadas)} piezas disponibles (materia prima)</div>
          <div class="format-buttons">${buttons}</div>
        </div>`;
    }).join('');
    return `<h3 class="section-title">${t.name}s</h3><div class="grid-buttons">${cards}</div>`;
  }).join('');

  const guacLow = STATE.raw.guacamole <= 0;
  const alambreOrdenes = alambreOrdenesDisponibles();
  const alambreLow = alambreOrdenes <= 0;
  const otrosCard = `
    <h3 class="section-title">Otros</h3>
    <div class="grid-buttons">
      <div class="product-btn" data-protein="guacamole">
        <div class="p-icon">🥑</div>
        <div class="p-name">Guacamole</div>
        <div class="p-stock ${guacLow ? 'low' : ''}">${num(STATE.raw.guacamole / 1000, 2)} kg disponibles</div>
        <div class="format-buttons">
          <button class="btn btn-sm" data-action="sell-guac">Orden 150g<br><span class="field-hint">${money(STATE.guacPrice)}</span></button>
        </div>
      </div>
      <div class="product-btn" data-protein="alambre">
        <div class="p-icon">🍢</div>
        <div class="p-name">Alambre</div>
        <div class="p-stock ${alambreLow ? 'low' : ''}">~${num(alambreOrdenes)} órdenes disponibles (materia prima)</div>
        <div class="format-buttons">
          <button class="btn btn-sm" data-action="sell-alambre">Orden 750g<br><span class="field-hint">${money(STATE.alambrePrice)}</span></button>
        </div>
      </div>
    </div>`;

  grid.innerHTML = sections + otrosCard;
}

function openSellModal(proteinId, tipoId, formatoId) {
  const p = proteinById(proteinId), t = tipoById(tipoId), fo = formatoById(formatoId);
  const price = STATE.prices[proteinId][tipoId][formatoId];
  const piezasEstimadas = piezasDisponiblesEstimadas(proteinId);
  const gpp = gramosPorPieza(STATE, proteinId);
  const tortillasPorPieza = STATE.settings.tortillasPorTipo[tipoId] || 0;
  const piezasEquiv = cantidad => {
    if (formatoId === 'pieza') return cantidad;
    if (formatoId === 'orden5') return cantidad * 5;
    return Math.round((cantidad * 1000) / gpp);
  };
  const computeSubtotal = (cantidad, conQueso) => price * cantidad + (conQueso ? piezasEquiv(cantidad) * STATE.settings.quesoPrecio : 0);
  const html = `
    <h3>${fo.name} de ${t.name} — ${p.name}</h3>
    <p class="modal-sub">Disponible (aprox.): ${num(piezasEstimadas)} piezas · Precio: ${money(price)} / ${fo.unit}</p>
    <p class="field-hint">Usa ${gpp} g de carne y ${tortillasPorPieza} tortilla${tortillasPorPieza === 1 ? '' : 's'} por pieza.</p>
    <div class="form-row">
      <label for="sellQty">Cantidad (${fo.unit})</label>
      <input type="number" id="sellQty" min="0" step="${fo.step}" value="${fo.def}">
    </div>
    <label class="checkbox-row" for="sellQueso">
      <input type="checkbox" id="sellQueso">
      Con queso extra (+${money(STATE.settings.quesoPrecio)} por pieza · ${STATE.settings.quesoGramos} g c/u)
    </label>
    <div class="form-row"><strong id="sellSubtotal">Subtotal: ${money(computeSubtotal(fo.def, false))}</strong></div>
    <div id="sellWarn"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="sellCancel">Cancelar</button>
      <button class="btn btn-primary" id="sellAdd">Agregar al ticket</button>
    </div>
  `;
  openModal(html, root => {
    const qtyInput = root.querySelector('#sellQty');
    const quesoCheck = root.querySelector('#sellQueso');
    const sub = root.querySelector('#sellSubtotal');
    const updateSubtotal = () => {
      sub.textContent = `Subtotal: ${money(computeSubtotal(Number(qtyInput.value) || 0, quesoCheck.checked))}`;
    };
    qtyInput.addEventListener('input', updateSubtotal);
    quesoCheck.addEventListener('change', updateSubtotal);
    root.querySelector('#sellCancel').addEventListener('click', closeModal);
    root.querySelector('#sellAdd').addEventListener('click', () => {
      const cantidad = Number(qtyInput.value) || 0;
      if (cantidad <= 0) { toast('Captura una cantidad mayor a cero'); return; }
      const conQueso = quesoCheck.checked;
      const subtotal = computeSubtotal(cantidad, conQueso);
      const item = { id: uid(), protein: proteinId, tipo: tipoId, formato: formatoId, cantidad, precioUnit: price, conQueso, subtotal, label: `${fo.name} — ${t.name} ${p.name}${conQueso ? ' (c/queso)' : ''}` };
      const impact = computeSaleItemImpact(item);
      let warn = '';
      const carneInsuficiente = p.combo
        ? (() => { const sp = campechanoSplitKg(impact.gramos); return sp.longaniza > STATE.raw.longaniza || sp.bistec > STATE.raw.bistec; })()
        : impact.gramos / 1000 > STATE.raw[proteinId];
      if (carneInsuficiente) {
        warn += `<div class="warn-box">⚠️ La carne cruda disponible no alcanza para esta venta. Se agregará de todas formas.</div>`;
      }
      if (impact.gramosTortilla > STATE.raw.tortillas) {
        warn += `<div class="warn-box">⚠️ Solo hay ${num(STATE.raw.tortillas / 1000, 2)} kg de tortillas disponibles. Se agregará de todas formas.</div>`;
      }
      if (conQueso && impact.quesoGramos > STATE.raw.queso) {
        warn += `<div class="warn-box">⚠️ Solo hay ${num(STATE.raw.queso / 1000, 2)} kg de queso disponible. Se agregará de todas formas.</div>`;
      }
      if (warn) root.querySelector('#sellWarn').innerHTML = warn;
      TICKET.push(item);
      renderTicket();
      closeModal();
    });
  });
}

function openGuacSellModal() {
  const html = `
    <h3>Guacamole — Orden 150 g</h3>
    <p class="modal-sub">Disponible: ${num(STATE.raw.guacamole / 1000, 2)} kg · Precio: ${money(STATE.guacPrice)} / orden</p>
    <div class="form-row">
      <label for="guacQty">Número de órdenes</label>
      <input type="number" id="guacQty" min="0" step="1" value="1">
    </div>
    <div class="form-row"><strong id="guacSubtotal">Subtotal: ${money(STATE.guacPrice)}</strong></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="guacCancel">Cancelar</button>
      <button class="btn btn-primary" id="guacAdd">Agregar al ticket</button>
    </div>
  `;
  openModal(html, root => {
    const qtyInput = root.querySelector('#guacQty');
    const sub = root.querySelector('#guacSubtotal');
    qtyInput.addEventListener('input', () => { sub.textContent = `Subtotal: ${money(STATE.guacPrice * (Number(qtyInput.value) || 0))}`; });
    root.querySelector('#guacCancel').addEventListener('click', closeModal);
    root.querySelector('#guacAdd').addEventListener('click', () => {
      const cantidad = Number(qtyInput.value) || 0;
      if (cantidad <= 0) { toast('Captura una cantidad mayor a cero'); return; }
      TICKET.push({ id: uid(), protein: 'guacamole', tipo: null, formato: 'orden', cantidad, precioUnit: STATE.guacPrice, subtotal: STATE.guacPrice * cantidad, label: 'Guacamole — orden 150g' });
      renderTicket();
      closeModal();
    });
  });
}

function openAlambreSellModal() {
  const ordenesDisponibles = alambreOrdenesDisponibles();
  const html = `
    <h3>Alambre — Orden 750 g</h3>
    <p class="modal-sub">Disponible (aprox.): ~${num(ordenesDisponibles)} órdenes · Precio: ${money(STATE.alambrePrice)} / orden</p>
    <p class="field-hint">190 g c/u de bistec, arrachera, longaniza y queso, preparado con cebolla y pimiento. Servido con 4 tortillas de harina.</p>
    <div class="form-row">
      <label for="alambreQty">Número de órdenes</label>
      <input type="number" id="alambreQty" min="0" step="1" value="1">
    </div>
    <div class="form-row"><strong id="alambreSubtotal">Subtotal: ${money(STATE.alambrePrice)}</strong></div>
    <div id="alambreWarn"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="alambreCancel">Cancelar</button>
      <button class="btn btn-primary" id="alambreAdd">Agregar al ticket</button>
    </div>
  `;
  openModal(html, root => {
    const qtyInput = root.querySelector('#alambreQty');
    const sub = root.querySelector('#alambreSubtotal');
    qtyInput.addEventListener('input', () => { sub.textContent = `Subtotal: ${money(STATE.alambrePrice * (Number(qtyInput.value) || 0))}`; });
    root.querySelector('#alambreCancel').addEventListener('click', closeModal);
    root.querySelector('#alambreAdd').addEventListener('click', () => {
      const cantidad = Number(qtyInput.value) || 0;
      if (cantidad <= 0) { toast('Captura una cantidad mayor a cero'); return; }
      const item = { id: uid(), protein: 'alambre', tipo: null, formato: 'orden', cantidad, precioUnit: STATE.alambrePrice, subtotal: STATE.alambrePrice * cantidad, label: 'Alambre — orden 750g' };
      if (cantidad > ordenesDisponibles) {
        root.querySelector('#alambreWarn').innerHTML = '<div class="warn-box">⚠️ La materia prima disponible no alcanza para esta venta. Se agregará de todas formas.</div>';
      }
      TICKET.push(item);
      renderTicket();
      closeModal();
    });
  });
}

/* ---- Descuento a nivel ticket (requiere nota del motivo) ---- */
let TICKET_DISCOUNT = null; // { type: 'percent'|'monto', value, nota }

function ticketSubtotal() {
  return TICKET.reduce((s, it) => s + it.subtotal, 0);
}
function ticketDiscountAmount() {
  if (!TICKET_DISCOUNT) return 0;
  const subtotal = ticketSubtotal();
  const amt = TICKET_DISCOUNT.type === 'percent' ? subtotal * (TICKET_DISCOUNT.value / 100) : TICKET_DISCOUNT.value;
  return Math.min(Math.max(amt, 0), subtotal);
}
function ticketTotal() {
  return ticketSubtotal() - ticketDiscountAmount();
}

function openDiscountModal() {
  if (TICKET.length === 0) { toast('Agrega artículos al ticket antes de aplicar un descuento'); return; }
  const current = TICKET_DISCOUNT;
  const html = `
    <h3>Aplicar descuento al ticket</h3>
    <p class="modal-sub">Subtotal actual: ${money(ticketSubtotal())}</p>
    <div class="form-row">
      <label for="discType">Tipo de descuento</label>
      <select id="discType">
        <option value="percent" ${current?.type === 'percent' || !current ? 'selected' : ''}>Porcentaje (%)</option>
        <option value="monto" ${current?.type === 'monto' ? 'selected' : ''}>Monto fijo ($)</option>
      </select>
    </div>
    <div class="form-row">
      <label for="discValue">Valor</label>
      <input type="number" id="discValue" min="0" step="0.01" value="${current?.value ?? ''}">
    </div>
    <div class="form-row">
      <label for="discNota">Motivo del descuento (obligatorio)</label>
      <input type="text" id="discNota" placeholder="Ej. cliente frecuente, promoción, cortesía..." value="${current?.nota ?? ''}">
    </div>
    <div id="discWarn"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="discCancel">Cancelar</button>
      <button class="btn btn-primary" id="discConfirm">Guardar descuento</button>
    </div>`;
  openModal(html, root => {
    root.querySelector('#discCancel').addEventListener('click', closeModal);
    root.querySelector('#discConfirm').addEventListener('click', () => {
      const type = root.querySelector('#discType').value;
      const value = Number(root.querySelector('#discValue').value);
      const nota = root.querySelector('#discNota').value.trim();
      if (!value || value <= 0) { toast('Captura un valor de descuento mayor a cero'); return; }
      if (!nota) {
        root.querySelector('#discWarn').innerHTML = '<div class="warn-box">⚠️ La nota del motivo es obligatoria para aplicar un descuento.</div>';
        return;
      }
      TICKET_DISCOUNT = { type, value, nota };
      renderTicket();
      closeModal();
    });
  });
}

function removeDiscount() {
  TICKET_DISCOUNT = null;
  renderTicket();
}

function renderTicket() {
  const itemsEl = document.getElementById('ticketItems');
  const totalEl = document.getElementById('ticketTotal');
  const confirmBtn = document.getElementById('confirmSaleBtn');
  const editBanner = document.getElementById('editBanner');
  if (EDITING_SALE_ID) {
    editBanner.style.display = 'flex';
    confirmBtn.textContent = 'Guardar cambios de venta';
  } else {
    editBanner.style.display = 'none';
    confirmBtn.textContent = 'Cobrar y registrar venta';
  }
  if (TICKET.length === 0) {
    itemsEl.innerHTML = '<p class="empty">Sin artículos todavía.</p>';
  } else {
    itemsEl.innerHTML = TICKET.map(it => `
      <div class="ticket-line">
        <div>
          <div class="tl-name">${it.cantidad} × ${it.label}</div>
          <div class="tl-sub">${money(it.precioUnit)} c/u${it.conQueso ? ' + queso extra' : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span>${money(it.subtotal)}</span>
          <button class="tl-remove" data-remove="${it.id}" title="Quitar">✕</button>
        </div>
      </div>`).join('');
  }

  const subtotal = ticketSubtotal();
  const discountAmount = ticketDiscountAmount();
  const subtotalRow = document.getElementById('ticketSubtotalRow');
  const discountRow = document.getElementById('ticketDiscountRow');
  if (TICKET_DISCOUNT) {
    subtotalRow.style.display = 'flex';
    document.getElementById('ticketSubtotal').textContent = money(subtotal);
    discountRow.style.display = 'flex';
    document.getElementById('ticketDiscountLabel').textContent = TICKET_DISCOUNT.type === 'percent'
      ? `Descuento (${num(TICKET_DISCOUNT.value, 2)}%)`
      : 'Descuento';
    document.getElementById('ticketDiscountNote').textContent = TICKET_DISCOUNT.nota;
    document.getElementById('ticketDiscountAmount').textContent = `-${money(discountAmount)}`;
  } else {
    subtotalRow.style.display = 'none';
    discountRow.style.display = 'none';
  }

  totalEl.textContent = money(ticketTotal());
  confirmBtn.disabled = TICKET.length === 0;
}

function saleItemsSnapshot() {
  return TICKET.map(({ protein, tipo, formato, cantidad, precioUnit, conQueso, subtotal, label, impact }) => ({ protein, tipo, formato, cantidad, precioUnit, conQueso, subtotal, label, impact }));
}

function confirmSale() {
  if (TICKET.length === 0) return;
  TICKET.forEach(applySaleItem);
  const subtotal = ticketSubtotal();
  const discountAmount = ticketDiscountAmount();
  const total = subtotal - discountAmount;
  const discount = TICKET_DISCOUNT ? { type: TICKET_DISCOUNT.type, value: TICKET_DISCOUNT.value, amount: discountAmount, nota: TICKET_DISCOUNT.nota } : null;
  pushMovement('venta', { items: saleItemsSnapshot(), subtotal, discount, total });
  save();
  toast(`Venta registrada por ${money(total)}`);
  TICKET = [];
  TICKET_DISCOUNT = null;
  renderTicket();
  renderSellGrid();
  renderInventory();
}

/* ---- Edición y cancelación de ventas ya registradas ---- */
let EDITING_SALE_ID = null;

function findSale(id) {
  return STATE.movements.find(m => m.id === id && m.type === 'venta');
}

function startEditSale(id) {
  const sale = findSale(id);
  if (!sale) return;
  if (sale.cancelled) { toast('Esta venta está cancelada y no se puede editar'); return; }
  EDITING_SALE_ID = id;
  TICKET = sale.items.map(it => ({ ...it, id: uid() }));
  TICKET_DISCOUNT = sale.discount ? { type: sale.discount.type, value: sale.discount.value, nota: sale.discount.nota } : null;
  document.querySelector('.tab-btn[data-tab="vender"]').click();
  renderTicket();
  toast('Editando venta: modifica los artículos y presiona "Guardar cambios"');
}

function cancelEditSale() {
  EDITING_SALE_ID = null;
  TICKET = [];
  TICKET_DISCOUNT = null;
  renderTicket();
}

function saveEditedSale() {
  const sale = findSale(EDITING_SALE_ID);
  if (!sale) { cancelEditSale(); return; }
  if (TICKET.length === 0) {
    toast('Una venta no puede quedar sin artículos. Usa "Cancelar edición" y luego "Cancelar venta" si quieres eliminarla.');
    return;
  }
  // Revierte el impacto original y aplica el de los artículos editados.
  sale.items.forEach(reverseSaleItemImpact);
  TICKET.forEach(applySaleItem);
  const subtotal = ticketSubtotal();
  const discountAmount = ticketDiscountAmount();
  const total = subtotal - discountAmount;
  sale.items = saleItemsSnapshot();
  sale.subtotal = subtotal;
  sale.discount = TICKET_DISCOUNT ? { type: TICKET_DISCOUNT.type, value: TICKET_DISCOUNT.value, amount: discountAmount, nota: TICKET_DISCOUNT.nota } : null;
  sale.total = total;
  sale.editedAt = Date.now();
  pushMovement('edicion_venta', { saleId: sale.id, total });
  save();
  toast('Venta actualizada e inventario ajustado');
  EDITING_SALE_ID = null;
  TICKET = [];
  TICKET_DISCOUNT = null;
  renderTicket();
  renderSellGrid();
  renderInventory();
  renderDailyReport();
  renderMonthlyReport();
  renderHistory();
}

function requestCancelSale(id) {
  const sale = findSale(id);
  if (!sale) return;
  if (sale.cancelled) { toast('Esta venta ya está cancelada'); return; }
  const html = `
    <h3>¿Cancelar esta venta?</h3>
    <p class="modal-sub">Venta del ${fmtDateTime(sale.ts)} por ${money(sale.total)}. Se devolverá al inventario todo lo que se descontó en esta venta.</p>
    <div class="form-row">
      <label for="cancelSaleNote">Motivo (opcional)</label>
      <input type="text" id="cancelSaleNote" placeholder="Ej. error de captura, cliente canceló...">
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="cancelSaleBack">Regresar</button>
      <button class="btn btn-danger" id="cancelSaleConfirm">Sí, cancelar venta</button>
    </div>`;
  openModal(html, root => {
    root.querySelector('#cancelSaleBack').addEventListener('click', closeModal);
    root.querySelector('#cancelSaleConfirm').addEventListener('click', () => {
      const nota = root.querySelector('#cancelSaleNote').value.trim();
      sale.items.forEach(reverseSaleItemImpact);
      sale.cancelled = true;
      sale.canceledAt = Date.now();
      pushMovement('cancelacion_venta', { saleId: sale.id, total: sale.total, nota });
      save();
      toast('Venta cancelada e inventario devuelto');
      closeModal();
      renderSellGrid();
      renderInventory();
      renderDailyReport();
      renderMonthlyReport();
      renderHistory();
    });
  });
}

function openSaleDetailModal(saleId) {
  const sale = findSale(saleId);
  if (!sale) return;
  const itemsHtml = sale.items.map(it => `
    <tr>
      <td>${it.label}${it.conQueso ? ' <span class="field-hint">(c/queso)</span>' : ''}</td>
      <td>${num(it.cantidad, 2)}</td>
      <td>${money(it.precioUnit)}</td>
      <td>${money(it.subtotal)}</td>
    </tr>`).join('');
  const cancelInfo = sale.cancelled
    ? `<div class="warn-box">⚠️ Venta cancelada el ${fmtDateTime(sale.canceledAt)}${cancelNotaFor(sale.id) ? ` — ${cancelNotaFor(sale.id)}` : ''}</div>`
    : '';
  const discountHtml = sale.discount
    ? `<div class="form-row"><strong>Descuento${sale.discount.type === 'percent' ? ` (${num(sale.discount.value, 2)}%)` : ''}:</strong> -${money(sale.discount.amount)}${sale.discount.nota ? ` — ${sale.discount.nota}` : ''}</div>`
    : '';
  const html = `
    <h3>Detalle de venta</h3>
    <p class="modal-sub">${fmtDateTime(sale.ts)}</p>
    ${cancelInfo}
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
    </div>
    <div class="form-row"><strong>Subtotal: ${money(sale.subtotal)}</strong></div>
    ${discountHtml}
    <div class="form-row"><strong>Total: ${money(sale.total)}</strong></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="saleDetailClose">Cerrar</button>
    </div>
  `;
  openModal(html, root => {
    root.querySelector('#saleDetailClose').addEventListener('click', closeModal);
  }, { wide: true });
}

function openDiscountDetailModal(ventasConDescuento, subtitle) {
  const totalDescuentos = ventasConDescuento.reduce((s, m) => s + (m.discount?.amount || 0), 0);
  const rowsHtml = ventasConDescuento.length ? ventasConDescuento.map(m => `
    <tr class="row-clickable" data-view-sale="${m.id}">
      <td>${fmtDateTime(m.ts)}</td>
      <td>${m.discount.type === 'percent' ? `${num(m.discount.value, 2)}%` : money(m.discount.value)}</td>
      <td>${m.discount.nota || '—'}</td>
      <td>-${money(m.discount.amount)}</td>
      <td>${money(m.total)}</td>
    </tr>`).join('') : '<tr><td colspan="5" class="field-hint">Sin descuentos en este periodo.</td></tr>';
  const html = `
    <h3>Detalle de descuentos</h3>
    <p class="modal-sub">${subtitle} · Total: ${money(totalDescuentos)}</p>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Fecha</th><th>Descuento</th><th>Motivo</th><th>Monto</th><th>Total venta</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <p class="field-hint">Haz click en una fila para ver el detalle completo de esa venta.</p>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="discountDetailClose">Cerrar</button>
    </div>
  `;
  openModal(html, root => {
    root.querySelector('#discountDetailClose').addEventListener('click', closeModal);
    root.querySelectorAll('[data-view-sale]').forEach(row => {
      row.addEventListener('click', () => openSaleDetailModal(row.dataset.viewSale));
    });
  }, { wide: true });
}

/* ======================================================================
   TAB: COMPRAS (entradas de insumos)
   ====================================================================== */
function renderPurchaseForm() {
  const sel = document.getElementById('purchaseInsumo');
  sel.innerHTML = INSUMOS.map(i => `<option value="${i.id}">${i.label}</option>`).join('');
  document.getElementById('purchaseUnit').textContent = INSUMOS[0].unit;
  sel.addEventListener('change', () => {
    document.getElementById('purchaseUnit').textContent = INSUMOS.find(i => i.id === sel.value).unit;
  });
}

function renderPurchaseHistory() {
  const tbody = document.querySelector('#purchaseHistory tbody');
  const rows = STATE.movements.filter(m => m.type === 'compra').slice(-15).reverse();
  tbody.innerHTML = rows.length ? rows.map(m => `
    <tr>
      <td>${fmtDateTime(m.ts)}</td>
      <td>${INSUMOS.find(i => i.id === m.insumo)?.label || m.insumo}</td>
      <td>${num(m.cantidad, 2)} ${INSUMOS.find(i => i.id === m.insumo)?.unit || ''}</td>
      <td>${m.nota || ''}</td>
    </tr>`).join('') : '<tr><td colspan="4" class="field-hint">Sin entradas registradas.</td></tr>';
}

function handlePurchaseSubmit(e) {
  e.preventDefault();
  const insumoId = document.getElementById('purchaseInsumo').value;
  const cantidad = Number(document.getElementById('purchaseQty').value);
  const nota = document.getElementById('purchaseNote').value.trim();
  if (!cantidad || cantidad <= 0) { toast('Captura una cantidad mayor a cero'); return; }
  applyPurchase(insumoId, cantidad);
  pushMovement('compra', { insumo: insumoId, cantidad, nota });
  save();
  toast('Entrada registrada');
  document.getElementById('purchaseForm').reset();
  document.getElementById('purchaseUnit').textContent = INSUMOS[0].unit;
  renderPurchaseHistory();
  renderInventory();
}

/* ======================================================================
   TAB: INVENTARIO
   ====================================================================== */
function stockTag(value, threshold) {
  if (value <= 0) return '<span class="tag critical">Agotado</span>';
  if (value <= threshold) return '<span class="tag warning">Bajo</span>';
  return '<span class="tag good">OK</span>';
}

function renderInventory() {
  const rawTbody = document.querySelector('#rawInventoryTable tbody');
  const s = STATE.settings;
  const rawRows = [
    { id: 'bistec', label: 'Bistec crudo', value: STATE.raw.bistec, unit: 'kg', threshold: s.alertaStockBajoKg },
    { id: 'longaniza', label: 'Longaniza cruda', value: STATE.raw.longaniza, unit: 'kg', threshold: s.alertaStockBajoKg },
    { id: 'arrachera', label: 'Arrachera cruda', value: STATE.raw.arrachera, unit: 'kg', threshold: s.alertaStockBajoKg },
    { id: 'ribeye', label: 'Rib Eye crudo', value: STATE.raw.ribeye, unit: 'kg', threshold: s.alertaStockBajoKg },
    { id: 'tortillas', label: 'Tortillas', value: STATE.raw.tortillas / 1000, unit: 'kg', threshold: s.alertaTortillasKg },
    { id: 'guacamole', label: 'Guacamole preparado', value: STATE.raw.guacamole / 1000, unit: 'kg', threshold: s.alertaStockBajoKg },
    { id: 'queso', label: 'Queso rallado', value: STATE.raw.queso / 1000, unit: 'kg', threshold: s.alertaStockBajoKg },
    { id: 'tortillasHarina', label: 'Tortillas de harina', value: STATE.raw.tortillasHarina / 1000, unit: 'kg', threshold: s.alertaTortillasHarinaKg },
  ];
  rawTbody.innerHTML = rawRows.map(r => `
    <tr>
      <td>${r.label}</td>
      <td>${num(r.value, 2)} ${r.unit}</td>
      <td>${stockTag(r.value, r.threshold)}</td>
      <td><button class="btn btn-ghost" data-adjust-raw="${r.id}">Ajustar</button></td>
    </tr>`).join('');
}

function openAdjustRawModal(insumoId) {
  const info = INSUMOS.find(i => i.id === insumoId);
  const current = GRAM_BASED_INSUMOS.includes(insumoId) ? STATE.raw[insumoId] / 1000 : STATE.raw[insumoId];
  const html = `
    <h3>Ajustar: ${info.label}</h3>
    <p class="modal-sub">Existencia actual: ${num(current, 2)} ${info.unit}</p>
    <div class="form-row">
      <label for="adjValue">Nueva existencia (${info.unit})</label>
      <input type="number" id="adjValue" step="0.01" value="${current}">
    </div>
    <div class="form-row">
      <label for="adjNote">Motivo (opcional)</label>
      <input type="text" id="adjNote" placeholder="Ej. conteo físico, merma...">
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="adjCancel">Cancelar</button>
      <button class="btn btn-primary" id="adjConfirm">Guardar ajuste</button>
    </div>`;
  openModal(html, root => {
    root.querySelector('#adjCancel').addEventListener('click', closeModal);
    root.querySelector('#adjConfirm').addEventListener('click', () => {
      const newVal = Number(root.querySelector('#adjValue').value);
      if (Number.isNaN(newVal)) { toast('Valor inválido'); return; }
      const nota = root.querySelector('#adjNote').value.trim();
      const delta = newVal - current;
      if (GRAM_BASED_INSUMOS.includes(insumoId)) STATE.raw[insumoId] = newVal * 1000;
      else STATE.raw[insumoId] = newVal;
      pushMovement('ajuste', { target: 'raw', key: insumoId, delta, nuevo: newVal, nota });
      save();
      toast('Ajuste guardado');
      closeModal();
      renderInventory();
    });
  });
}

/* ======================================================================
   TAB: REPORTES
   ====================================================================== */
function movementDetailText(m) {
  if (m.type === 'compra') {
    const i = INSUMOS.find(x => x.id === m.insumo);
    return `+${num(m.cantidad, 2)} ${i?.unit || ''} ${i?.label || m.insumo}${m.nota ? ' — ' + m.nota : ''}`;
  }
  if (m.type === 'produccion') {
    const p = proteinById(m.protein), t = tipoById(m.tipo);
    return `${m.piezas} ${t.name.toLowerCase()}(s) de ${p.name} · ${num(m.gramos)} g carne · ${m.tortillas} tortillas`;
  }
  if (m.type === 'venta') {
    const detail = m.items.map(it => `${it.cantidad}× ${it.label}`).join(', ');
    const descuento = m.discount ? ` · desc. ${money(m.discount.amount)} (${m.discount.nota})` : '';
    const tags = [m.cancelled ? 'CANCELADA' : null, m.editedAt ? 'editada' : null].filter(Boolean).join(', ');
    return `${detail}${descuento}${tags ? ` (${tags})` : ''}`;
  }
  if (m.type === 'ajuste') {
    return m.target === 'raw'
      ? `${m.key}: nuevo valor ${num(m.nuevo, 2)} (${m.delta >= 0 ? '+' : ''}${num(m.delta, 2)})${m.nota ? ' — ' + m.nota : ''}`
      : `${m.key.replace('|', ' / ')}: piezas ${m.deltaPiezas >= 0 ? '+' : ''}${m.deltaPiezas}, gramos ${m.deltaGramos >= 0 ? '+' : ''}${num(m.deltaGramos)}${m.nota ? ' — ' + m.nota : ''}`;
  }
  if (m.type === 'edicion_venta') {
    return `Venta editada · nuevo total ${money(m.total)}`;
  }
  if (m.type === 'cancelacion_venta') {
    return `Venta cancelada · ${money(m.total)}${m.nota ? ' — ' + m.nota : ''}`;
  }
  return '';
}

function getDailyReportData(date) {
  const ventasDelDia = STATE.movements.filter(m => m.type === 'venta' && !m.cancelled && todayStr(new Date(m.ts)) === date);
  const canceladasDelDia = STATE.movements.filter(m => m.type === 'venta' && m.cancelled && todayStr(new Date(m.ts)) === date);

  const totalVendido = ventasDelDia.reduce((s, m) => s + m.total, 0);
  const totalPiezasVendidas = ventasDelDia.reduce((s, m) => s + m.items.reduce((s2, it) => s2 + (it.protein === 'guacamole' || it.protein === 'alambre' ? 0 : it.cantidad), 0), 0);
  const totalCarneVendida = ventasDelDia.reduce((s, m) => s + m.items.reduce((s2, it) => s2 + (it.protein === 'guacamole' ? 0 : (it.impact?.gramos || 0)), 0), 0);
  const ventasConDescuento = ventasDelDia.filter(m => m.discount);
  const totalDescuentos = ventasConDescuento.reduce((s, m) => s + (m.discount?.amount || 0), 0);
  const totalTicketsCount = ventasDelDia.length;
  const totalCanceladas = canceladasDelDia.length;
  const totalCanceladasMonto = canceladasDelDia.reduce((s, m) => s + m.total, 0);

  const agg = {};
  ventasDelDia.forEach(m => m.items.forEach(it => {
    const key = `${it.label}`;
    if (!agg[key]) agg[key] = { label: it.label, formato: it.formato, cantidad: 0, importe: 0 };
    agg[key].cantidad += it.cantidad;
    agg[key].importe += it.subtotal;
  }));
  const rows = Object.values(agg).sort((a, b) => b.importe - a.importe);
  if (totalDescuentos > 0) {
    rows.push({ label: `Descuentos otorgados (${ventasConDescuento.length})`, formato: null, cantidad: ventasConDescuento.length, importe: -totalDescuentos });
  }

  return { date, totalVendido, totalPiezasVendidas, totalCarneVendida, totalDescuentos, totalTicketsCount, totalCanceladas, totalCanceladasMonto, canceladasDelDia, ventasConDescuento, rows };
}

function renderDailyReport() {
  const dateInput = document.getElementById('dailyDate');
  const date = dateInput.value || todayStr();
  dateInput.value = date;
  const data = getDailyReportData(date);

  document.getElementById('dailyStats').innerHTML = `
    <div class="stat-tile"><div class="st-label">Ventas totales</div><div class="st-value">${money(data.totalVendido)}</div></div>
    <div class="stat-tile"><div class="st-label">Tickets cobrados</div><div class="st-value">${num(data.totalTicketsCount)}</div></div>
    <div class="stat-tile"><div class="st-label">Piezas / porciones vendidas</div><div class="st-value">${num(data.totalPiezasVendidas)}</div></div>
    <div class="stat-tile"><div class="st-label">Carne vendida</div><div class="st-value">${num(data.totalCarneVendida / 1000, 2)} kg</div></div>
    <div class="stat-tile clickable" data-action="view-discounts-daily" title="Ver detalle de descuentos"><div class="st-label">Descuentos otorgados</div><div class="st-value">${money(data.totalDescuentos)}</div></div>
    <div class="stat-tile"><div class="st-label">Ventas canceladas</div><div class="st-value">${num(data.totalCanceladas)} (${money(data.totalCanceladasMonto)})</div></div>
  `;

  const tbody = document.querySelector('#dailySalesTable tbody');
  tbody.innerHTML = data.rows.length ? data.rows.map(r => `
    <tr><td>${r.label}</td><td>${formatoLabel(r.formato)}</td><td>${num(r.cantidad, 2)}</td><td>${money(r.importe)}</td></tr>
  `).join('') : '<tr><td colspan="4" class="field-hint">Sin ventas en esta fecha.</td></tr>';

  const cancelTbody = document.querySelector('#dailyCancelTable tbody');
  cancelTbody.innerHTML = data.canceladasDelDia.length ? data.canceladasDelDia.map(m => `
    <tr><td>${fmtDateTime(m.ts)}</td><td>${m.items.map(it => `${it.cantidad}× ${it.label}`).join(', ')}</td><td>${money(m.total)}</td><td>${cancelNotaFor(m.id) || '—'}</td></tr>
  `).join('') : '<tr><td colspan="4" class="field-hint">Sin cancelaciones en esta fecha.</td></tr>';
}

function cancelNotaFor(saleId) {
  const mov = STATE.movements.find(m => m.type === 'cancelacion_venta' && m.saleId === saleId);
  return mov?.nota;
}

function getMonthlyReportData(month) {
  const ventasDelMes = STATE.movements.filter(m => m.type === 'venta' && !m.cancelled && monthStr(new Date(m.ts)) === month);
  const canceladasDelMes = STATE.movements.filter(m => m.type === 'venta' && m.cancelled && monthStr(new Date(m.ts)) === month);

  const totalMes = ventasDelMes.reduce((s, m) => s + m.total, 0);
  const [y, mo] = month.split('-').map(Number);
  const diasEnMes = new Date(y, mo, 0).getDate();
  const porDia = Array.from({ length: diasEnMes }, () => 0);
  ventasDelMes.forEach(m => {
    const day = new Date(m.ts).getDate();
    porDia[day - 1] += m.total;
  });
  const diasConVenta = porDia.filter(v => v > 0).length;
  const promedioDiario = diasConVenta ? totalMes / diasConVenta : 0;
  const maxDia = porDia.reduce((best, v, i) => v > best.v ? { v, i } : best, { v: 0, i: -1 });
  const totalPiezas = ventasDelMes.reduce((s, m) => s + m.items.reduce((s2, it) => s2 + (it.protein === 'guacamole' || it.protein === 'alambre' ? 0 : it.cantidad), 0), 0);
  const ventasConDescuento = ventasDelMes.filter(m => m.discount);
  const totalDescuentos = ventasConDescuento.reduce((s, m) => s + (m.discount?.amount || 0), 0);
  const totalCanceladas = canceladasDelMes.length;
  const totalCanceladasMonto = canceladasDelMes.reduce((s, m) => s + m.total, 0);

  const agg = {};
  ventasDelMes.forEach(m => m.items.forEach(it => {
    if (!agg[it.label]) agg[it.label] = { label: it.label, cantidad: 0, importe: 0 };
    agg[it.label].cantidad += it.cantidad;
    agg[it.label].importe += it.subtotal;
  }));
  const rows = Object.values(agg).sort((a, b) => b.importe - a.importe);
  if (totalDescuentos > 0) {
    rows.push({ label: `Descuentos otorgados (${ventasConDescuento.length})`, cantidad: ventasConDescuento.length, importe: -totalDescuentos });
  }

  return { month, totalMes, porDia, diasConVenta, promedioDiario, maxDia, totalPiezas, totalDescuentos, totalCanceladas, totalCanceladasMonto, ventasConDescuento, rows };
}

function renderMonthlyReport() {
  const monthInput = document.getElementById('monthlyMonth');
  const month = monthInput.value || monthStr();
  monthInput.value = month;
  const data = getMonthlyReportData(month);

  document.getElementById('monthlyStats').innerHTML = `
    <div class="stat-tile"><div class="st-label">Ventas del mes</div><div class="st-value">${money(data.totalMes)}</div></div>
    <div class="stat-tile"><div class="st-label">Promedio diario (días con venta)</div><div class="st-value">${money(data.promedioDiario)}</div></div>
    <div class="stat-tile"><div class="st-label">Mejor día</div><div class="st-value">${data.maxDia.i >= 0 ? `Día ${data.maxDia.i + 1} — ${money(data.maxDia.v)}` : '—'}</div></div>
    <div class="stat-tile"><div class="st-label">Piezas / porciones vendidas</div><div class="st-value">${num(data.totalPiezas)}</div></div>
    <div class="stat-tile clickable" data-action="view-discounts-monthly" title="Ver detalle de descuentos"><div class="st-label">Descuentos otorgados</div><div class="st-value">${money(data.totalDescuentos)}</div></div>
    <div class="stat-tile"><div class="st-label">Ventas canceladas</div><div class="st-value">${num(data.totalCanceladas)} (${money(data.totalCanceladasMonto)})</div></div>
  `;

  const maxVal = Math.max(...data.porDia, 1);
  document.getElementById('monthlyChart').innerHTML = data.porDia.map((v, i) => `
    <div class="bar-col">
      <div class="bar-tip">Día ${i + 1}: ${money(v)}</div>
      <div class="bar" style="height:${Math.max(2, (v / maxVal) * 100)}%"></div>
      <div class="bar-day-label">${i + 1}</div>
    </div>`).join('');

  document.querySelector('#monthlyProductTable tbody').innerHTML = data.rows.length
    ? data.rows.map(r => `<tr><td>${r.label}</td><td>${num(r.cantidad, 2)}</td><td>${money(r.importe)}</td></tr>`).join('')
    : '<tr><td colspan="3" class="field-hint">Sin ventas en este mes.</td></tr>';
}

// Filtra movimientos por tipo y por rango de fechas (inclusivo), usando la fecha local
// de cada movimiento para que coincida con lo que el usuario ve/selecciona en los inputs.
function filterHistoryMovements() {
  const filter = document.getElementById('historyFilter').value;
  const from = document.getElementById('historyFrom').value;
  const to = document.getElementById('historyTo').value;
  return STATE.movements.filter(m => {
    if (filter !== 'todos' && m.type !== filter) return false;
    const d = todayStr(new Date(m.ts));
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

function renderHistory() {
  const rows = filterHistoryMovements()
    .slice()
    .reverse()
    .slice(0, 500);
  const tbody = document.querySelector('#historyTable tbody');
  tbody.innerHTML = rows.length ? rows.map(m => {
    let actions = '';
    if (m.type === 'venta') {
      actions = m.cancelled
        ? '<span class="tag critical">Cancelada</span>'
        : `<button class="btn btn-ghost btn-sm" data-edit-sale="${m.id}">Editar</button> <button class="btn btn-ghost btn-sm" data-cancel-sale="${m.id}">Cancelar</button>`;
    }
    // Las ventas y sus cancelaciones abren el detalle de la venta original al hacer click en la fila.
    const viewSaleId = m.type === 'venta' ? m.id : m.type === 'cancelacion_venta' ? m.saleId : null;
    return `
    <tr${viewSaleId ? ` class="row-clickable" data-view-sale="${viewSaleId}"` : ''}>
      <td>${fmtDateTime(m.ts)}</td>
      <td><span class="tag good">${MOVEMENT_LABELS[m.type]}</span></td>
      <td>${movementDetailText(m)}</td>
      <td>${m.type === 'venta' ? money(m.total) : ''}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="5" class="field-hint">Sin movimientos.</td></tr>';
}

/* ======================================================================
   IMPRESIÓN (PDF) Y ENVÍO POR WHATSAPP DE REPORTES
   ====================================================================== */
function printHtml(title, bodyHtml) {
  return `
    <div class="print-header">
      <img src="logo.png" alt="Logo">
      <div>
        <h1>Taquería POS</h1>
        <div>${title}</div>
      </div>
    </div>
    ${bodyHtml}
    <div class="print-footer">Generado el ${fmtDateTime(Date.now())}</div>
  `;
}

function printReport(innerHtml) {
  const area = document.getElementById('printArea');
  area.innerHTML = innerHtml;
  document.body.classList.add('printing');
  window.print();
}

window.addEventListener('afterprint', () => {
  document.body.classList.remove('printing');
  const area = document.getElementById('printArea');
  if (area) area.innerHTML = '';
});

function openWhatsApp(text) {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

function printDailyReport() {
  const date = document.getElementById('dailyDate').value || todayStr();
  const data = getDailyReportData(date);
  const rowsHtml = data.rows.length
    ? data.rows.map(r => `<tr><td>${r.label}</td><td>${formatoLabel(r.formato)}</td><td>${num(r.cantidad, 2)}</td><td>${money(r.importe)}</td></tr>`).join('')
    : '<tr><td colspan="4">Sin ventas en esta fecha.</td></tr>';
  const html = printHtml(`Reporte diario — ${data.date}`, `
    <div class="print-stats">
      <div class="print-stat"><strong>${money(data.totalVendido)}</strong><span>Ventas totales</span></div>
      <div class="print-stat"><strong>${num(data.totalTicketsCount)}</strong><span>Tickets cobrados</span></div>
      <div class="print-stat"><strong>${num(data.totalPiezasVendidas)}</strong><span>Piezas vendidas</span></div>
      <div class="print-stat"><strong>${num(data.totalCarneVendida / 1000, 2)} kg</strong><span>Carne vendida</span></div>
      <div class="print-stat"><strong>${money(data.totalDescuentos)}</strong><span>Descuentos otorgados</span></div>
      <div class="print-stat"><strong>${num(data.totalCanceladas)} (${money(data.totalCanceladasMonto)})</strong><span>Ventas canceladas</span></div>
    </div>
    <table class="print-table"><thead><tr><th>Producto</th><th>Formato</th><th>Cantidad</th><th>Importe</th></tr></thead><tbody>${rowsHtml}</tbody></table>
  `);
  printReport(html);
}

function printMonthlyReport() {
  const month = document.getElementById('monthlyMonth').value || monthStr();
  const data = getMonthlyReportData(month);
  const rowsHtml = data.rows.length
    ? data.rows.map(r => `<tr><td>${r.label}</td><td>${num(r.cantidad, 2)}</td><td>${money(r.importe)}</td></tr>`).join('')
    : '<tr><td colspan="3">Sin ventas en este mes.</td></tr>';
  const html = printHtml(`Reporte mensual — ${data.month}`, `
    <div class="print-stats">
      <div class="print-stat"><strong>${money(data.totalMes)}</strong><span>Ventas del mes</span></div>
      <div class="print-stat"><strong>${money(data.promedioDiario)}</strong><span>Promedio diario</span></div>
      <div class="print-stat"><strong>${data.maxDia.i >= 0 ? `Día ${data.maxDia.i + 1} — ${money(data.maxDia.v)}` : '—'}</strong><span>Mejor día</span></div>
      <div class="print-stat"><strong>${num(data.totalPiezas)}</strong><span>Piezas vendidas</span></div>
      <div class="print-stat"><strong>${money(data.totalDescuentos)}</strong><span>Descuentos otorgados</span></div>
      <div class="print-stat"><strong>${num(data.totalCanceladas)} (${money(data.totalCanceladasMonto)})</strong><span>Ventas canceladas</span></div>
    </div>
    <table class="print-table"><thead><tr><th>Producto</th><th>Cantidad</th><th>Importe</th></tr></thead><tbody>${rowsHtml}</tbody></table>
  `);
  printReport(html);
}

function printHistoryReport() {
  const rows = filterHistoryMovements().slice().reverse();
  const rowsHtml = rows.length
    ? rows.map(m => `<tr><td>${fmtDateTime(m.ts)}</td><td>${MOVEMENT_LABELS[m.type]}</td><td>${movementDetailText(m)}</td><td>${m.type === 'venta' ? money(m.total) : ''}</td></tr>`).join('')
    : '<tr><td colspan="4">Sin movimientos.</td></tr>';
  const html = printHtml('Historial de movimientos', `<table class="print-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Detalle</th><th>Importe</th></tr></thead><tbody>${rowsHtml}</tbody></table>`);
  printReport(html);
}

/* ---- Generación de imagen (JPG/PNG) de reportes para enviar por WhatsApp ----
   Se dibuja el reporte en un <canvas> (sin dependencias externas, funciona sin internet)
   y se comparte como archivo de imagen; si el navegador no soporta compartir archivos,
   se descarga la imagen y se abre WhatsApp con un texto resumen para adjuntarla a mano. */
const REPORT_IMAGE_COLORS = {
  bg: '#ffffff', brand: '#2a78d6', brandInk: '#ffffff',
  text: '#0b0b0b', textMuted: '#52514e', textFaint: '#898781',
  tileBg: '#f2f1ed', headBg: '#eef2f7', border: '#e1e0d9', stripe: '#f9f9f7',
};

function truncateText(ctx, text, maxWidth) {
  let t = String(text ?? '');
  if (ctx.measureText(t).width <= maxWidth) return t;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

function buildReportCanvas({ title, subtitle, stats = [], columns, rows, footerLines = [] }) {
  const C = REPORT_IMAGE_COLORS;
  const width = 960;
  const padding = 28;
  const brandH = 64;
  const titleH = 34 + (subtitle ? 22 : 0);
  const statTileH = 58;
  const statsH = stats.length ? statTileH + 20 : 0;
  const rowH = 28;
  const tableHeadH = 32;
  const tableH = tableHeadH + Math.max(rows.length, 1) * rowH;
  const footerH = 30 + footerLines.length * 16;
  const height = brandH + titleH + statsH + tableH + footerH + padding;

  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, width, height);

  // Barra de marca
  ctx.fillStyle = C.brand;
  ctx.fillRect(0, 0, width, brandH);
  ctx.fillStyle = C.brandInk;
  ctx.font = '700 22px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText('🌮 Taquería POS', padding, brandH / 2 + 8);

  let y = brandH + 34;
  ctx.fillStyle = C.text;
  ctx.font = '700 20px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText(title, padding, y);
  if (subtitle) {
    y += 22;
    ctx.fillStyle = C.textMuted;
    ctx.font = '400 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(subtitle, padding, y);
  }
  y += 26;

  // Tarjetas de estadísticas
  if (stats.length) {
    const gap = 12;
    const tileW = (width - padding * 2 - gap * (stats.length - 1)) / stats.length;
    stats.forEach((s, i) => {
      const x = padding + i * (tileW + gap);
      ctx.fillStyle = C.tileBg;
      ctx.fillRect(x, y, tileW, statTileH);
      ctx.fillStyle = C.textFaint;
      ctx.font = '400 11px system-ui, sans-serif';
      ctx.fillText(truncateText(ctx, s.label, tileW - 16), x + 10, y + 20);
      ctx.fillStyle = C.text;
      ctx.font = '700 16px system-ui, sans-serif';
      ctx.fillText(truncateText(ctx, s.value, tileW - 16), x + 10, y + 42);
    });
    y += statTileH + 20;
  }

  // Tabla
  const totalColW = width - padding * 2;
  const colX = [];
  let acc = padding;
  columns.forEach(c => { colX.push(acc); acc += totalColW * c.width; });

  ctx.fillStyle = C.headBg;
  ctx.fillRect(padding, y, totalColW, tableHeadH);
  ctx.fillStyle = C.text;
  ctx.font = '700 13px system-ui, sans-serif';
  columns.forEach((c, i) => ctx.fillText(truncateText(ctx, c.label, totalColW * c.width - 12), colX[i] + 8, y + tableHeadH / 2 + 4));
  y += tableHeadH;

  ctx.font = '400 13px system-ui, sans-serif';
  const dataRows = rows.length ? rows : [columns.map(() => '—')];
  dataRows.forEach((row, ri) => {
    if (rows.length && ri % 2 === 1) {
      ctx.fillStyle = C.stripe;
      ctx.fillRect(padding, y, totalColW, rowH);
    }
    ctx.fillStyle = C.text;
    row.forEach((cell, ci) => ctx.fillText(truncateText(ctx, cell, totalColW * columns[ci].width - 12), colX[ci] + 8, y + rowH / 2 + 4));
    y += rowH;
  });

  y += 14;
  ctx.fillStyle = C.textFaint;
  ctx.font = '400 12px system-ui, sans-serif';
  footerLines.forEach(line => { ctx.fillText(line, padding, y); y += 16; });

  return canvas;
}

function shareCanvasReport(canvas, filename, whatsappText) {
  canvas.toBlob(async blob => {
    if (!blob) { toast('No se pudo generar la imagen del reporte'); return; }
    let shared = false;
    if (navigator.canShare && navigator.share) {
      try {
        const file = new File([blob], filename, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Reporte Taquería POS', text: whatsappText });
          shared = true;
        }
      } catch (err) {
        // el usuario canceló el share o el navegador lo rechazó; se usa el respaldo de descarga
      }
    }
    if (!shared) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast('Imagen del reporte descargada. Ábrela en WhatsApp para adjuntarla.');
      openWhatsApp(whatsappText);
    }
  }, 'image/png');
}

function shareDailyReportWhatsApp() {
  const date = document.getElementById('dailyDate').value || todayStr();
  const data = getDailyReportData(date);
  const canvas = buildReportCanvas({
    title: `Reporte diario — ${data.date}`,
    stats: [
      { label: 'Ventas totales', value: money(data.totalVendido) },
      { label: 'Tickets cobrados', value: num(data.totalTicketsCount) },
      { label: 'Piezas vendidas', value: num(data.totalPiezasVendidas) },
      { label: 'Carne vendida', value: `${num(data.totalCarneVendida / 1000, 2)} kg` },
      { label: 'Descuentos', value: money(data.totalDescuentos) },
      { label: 'Canceladas', value: `${num(data.totalCanceladas)} (${money(data.totalCanceladasMonto)})` },
    ],
    columns: [{ label: 'Producto', width: 0.4 }, { label: 'Formato', width: 0.22 }, { label: 'Cant.', width: 0.16 }, { label: 'Importe', width: 0.22 }],
    rows: data.rows.map(r => [r.label, formatoLabel(r.formato), num(r.cantidad, 2), money(r.importe)]),
    footerLines: [`Generado el ${fmtDateTime(Date.now())}`],
  });
  const text = `📋 *Reporte diario — ${data.date}*\n💰 Ventas: ${money(data.totalVendido)} · 🧾 Tickets: ${num(data.totalTicketsCount)}\nImagen del reporte adjunta.`;
  shareCanvasReport(canvas, `reporte-diario-${data.date}.png`, text);
}

function shareMonthlyReportWhatsApp() {
  const month = document.getElementById('monthlyMonth').value || monthStr();
  const data = getMonthlyReportData(month);
  const canvas = buildReportCanvas({
    title: `Reporte mensual — ${data.month}`,
    stats: [
      { label: 'Ventas del mes', value: money(data.totalMes) },
      { label: 'Promedio diario', value: money(data.promedioDiario) },
      { label: 'Mejor día', value: data.maxDia.i >= 0 ? `Día ${data.maxDia.i + 1} — ${money(data.maxDia.v)}` : '—' },
      { label: 'Piezas vendidas', value: num(data.totalPiezas) },
      { label: 'Descuentos', value: money(data.totalDescuentos) },
      { label: 'Canceladas', value: `${num(data.totalCanceladas)} (${money(data.totalCanceladasMonto)})` },
    ],
    columns: [{ label: 'Producto', width: 0.5 }, { label: 'Cantidad', width: 0.25 }, { label: 'Importe', width: 0.25 }],
    rows: data.rows.map(r => [r.label, num(r.cantidad, 2), money(r.importe)]),
    footerLines: [`Generado el ${fmtDateTime(Date.now())}`],
  });
  const text = `📈 *Reporte mensual — ${data.month}*\n💰 Ventas del mes: ${money(data.totalMes)}\nImagen del reporte adjunta.`;
  shareCanvasReport(canvas, `reporte-mensual-${data.month}.png`, text);
}

function shareHistoryReportWhatsApp() {
  const filter = document.getElementById('historyFilter').value;
  const from = document.getElementById('historyFrom').value;
  const to = document.getElementById('historyTo').value;
  const rows = filterHistoryMovements().slice().reverse().slice(0, 30);
  const rango = from || to ? ` · ${from || '…'} a ${to || '…'}` : '';
  const canvas = buildReportCanvas({
    title: 'Historial de movimientos',
    subtitle: `Filtro: ${filter === 'todos' ? 'Todos' : MOVEMENT_LABELS[filter]}${rango} · últimos ${rows.length}`,
    columns: [{ label: 'Fecha', width: 0.2 }, { label: 'Tipo', width: 0.18 }, { label: 'Detalle', width: 0.44 }, { label: 'Importe', width: 0.18 }],
    rows: rows.map(m => [fmtDateTime(m.ts), MOVEMENT_LABELS[m.type], movementDetailText(m), m.type === 'venta' ? money(m.total) : '']),
    footerLines: [`Generado el ${fmtDateTime(Date.now())}`],
  });
  const text = '📋 *Historial de movimientos* — imagen adjunta.';
  shareCanvasReport(canvas, `historial-movimientos-${todayStr()}.png`, text);
}

/* ======================================================================
   TAB: CONFIGURACIÓN
   ====================================================================== */
function renderPricesTable() {
  const tbody = document.querySelector('#pricesTable tbody');
  const rows = [];
  PROTEINS.forEach(p => TIPOS.forEach(t => {
    const price = STATE.prices[p.id][t.id];
    const soloPieza = t.id === 'quesadilla';
    rows.push(`
      <tr>
        <td>${t.icon} ${t.name} — ${p.name}</td>
        <td><input type="number" step="0.5" min="0" value="${price.pieza}" data-price="${p.id}|${t.id}|pieza" style="width:90px"></td>
        <td>${soloPieza ? '<span class="field-hint">— (solo pieza)</span>' : `<input type="number" step="0.5" min="0" value="${price.orden5}" data-price="${p.id}|${t.id}|orden5" style="width:90px">`}</td>
        <td>${soloPieza ? '<span class="field-hint">— (solo pieza)</span>' : `<input type="number" step="0.5" min="0" value="${price.kilo}" data-price="${p.id}|${t.id}|kilo" style="width:90px">`}</td>
      </tr>`);
  }));
  tbody.innerHTML = rows.join('');
  tbody.querySelectorAll('input[data-price]').forEach(inp => {
    inp.addEventListener('change', () => {
      const [proteinId, tipoId, formatoId] = inp.dataset.price.split('|');
      STATE.prices[proteinId][tipoId][formatoId] = Number(inp.value) || 0;
      save();
      renderSellGrid();
      toast('Precio actualizado');
    });
  });
}

function renderGramosTable() {
  const tbody = document.querySelector('#gramosTable tbody');
  const rows = PROTEINS.filter(p => !p.combo).map(p => `
    <tr>
      <td>${p.name}</td>
      <td><input type="number" step="1" min="1" value="${STATE.settings.gramosPorProducto[p.id]}" data-gramos="${p.id}" style="width:90px"></td>
    </tr>`);
  tbody.innerHTML = rows.join('');
  tbody.querySelectorAll('input[data-gramos]').forEach(inp => {
    inp.addEventListener('change', () => {
      STATE.settings.gramosPorProducto[inp.dataset.gramos] = Number(inp.value) || 1;
      save();
      toast('Gramaje actualizado');
    });
  });
}

function renderConfigMisc() {
  document.getElementById('priceGuac').value = STATE.guacPrice;
  document.getElementById('quesoGramos').value = STATE.settings.quesoGramos;
  document.getElementById('quesoPrecio').value = STATE.settings.quesoPrecio;
  document.getElementById('campechanoLonganiza').value = STATE.settings.campechanoLonganiza;
  document.getElementById('campechanoBistec').value = STATE.settings.campechanoBistec;
  document.getElementById('gramosPorTortilla').value = STATE.settings.gramosPorTortilla;
  document.getElementById('tortillasPorTaco').value = STATE.settings.tortillasPorTipo.taco;
  document.getElementById('tortillasPorQuesadilla').value = STATE.settings.tortillasPorTipo.quesadilla;
  document.getElementById('alertaStockBajo').value = STATE.settings.alertaStockBajoKg;
  document.getElementById('alertaTortillasKg').value = STATE.settings.alertaTortillasKg;
  document.getElementById('alambrePrecio').value = STATE.alambrePrice;
  document.getElementById('alambreBistec').value = STATE.settings.alambre.bistec;
  document.getElementById('alambreArrachera').value = STATE.settings.alambre.arrachera;
  document.getElementById('alambreLonganiza').value = STATE.settings.alambre.longaniza;
  document.getElementById('alambreQueso').value = STATE.settings.alambre.queso;
  document.getElementById('alambreTortillas').value = STATE.settings.alambre.tortillas;
  document.getElementById('alambreGramosPorTortilla').value = STATE.settings.alambre.gramosPorTortilla;
  document.getElementById('alertaTortillasHarinaKg').value = STATE.settings.alertaTortillasHarinaKg;
}

function bindConfigInputs() {
  document.getElementById('priceGuac').addEventListener('change', e => { STATE.guacPrice = Number(e.target.value) || 0; save(); renderSellGrid(); });
  document.getElementById('quesoGramos').addEventListener('change', e => { STATE.settings.quesoGramos = Number(e.target.value) || 1; save(); });
  document.getElementById('quesoPrecio').addEventListener('change', e => { STATE.settings.quesoPrecio = Number(e.target.value) || 0; save(); });
  document.getElementById('campechanoLonganiza').addEventListener('change', e => { STATE.settings.campechanoLonganiza = Number(e.target.value) || 1; save(); });
  document.getElementById('campechanoBistec').addEventListener('change', e => { STATE.settings.campechanoBistec = Number(e.target.value) || 1; save(); });
  document.getElementById('gramosPorTortilla').addEventListener('change', e => { STATE.settings.gramosPorTortilla = Number(e.target.value) || 1; save(); });
  document.getElementById('tortillasPorTaco').addEventListener('change', e => { STATE.settings.tortillasPorTipo.taco = Number(e.target.value) || 0; save(); });
  document.getElementById('tortillasPorQuesadilla').addEventListener('change', e => { STATE.settings.tortillasPorTipo.quesadilla = Number(e.target.value) || 0; save(); });
  document.getElementById('alertaStockBajo').addEventListener('change', e => { STATE.settings.alertaStockBajoKg = Number(e.target.value) || 0; save(); renderInventory(); });
  document.getElementById('alertaTortillasKg').addEventListener('change', e => { STATE.settings.alertaTortillasKg = Number(e.target.value) || 0; save(); renderInventory(); });
  document.getElementById('alambrePrecio').addEventListener('change', e => { STATE.alambrePrice = Number(e.target.value) || 0; save(); renderSellGrid(); });
  document.getElementById('alambreBistec').addEventListener('change', e => { STATE.settings.alambre.bistec = Number(e.target.value) || 1; save(); renderSellGrid(); });
  document.getElementById('alambreArrachera').addEventListener('change', e => { STATE.settings.alambre.arrachera = Number(e.target.value) || 1; save(); renderSellGrid(); });
  document.getElementById('alambreLonganiza').addEventListener('change', e => { STATE.settings.alambre.longaniza = Number(e.target.value) || 1; save(); renderSellGrid(); });
  document.getElementById('alambreQueso').addEventListener('change', e => { STATE.settings.alambre.queso = Number(e.target.value) || 1; save(); renderSellGrid(); });
  document.getElementById('alambreTortillas').addEventListener('change', e => { STATE.settings.alambre.tortillas = Number(e.target.value) || 0; save(); renderSellGrid(); });
  document.getElementById('alambreGramosPorTortilla').addEventListener('change', e => { STATE.settings.alambre.gramosPorTortilla = Number(e.target.value) || 1; save(); renderSellGrid(); });
  document.getElementById('alertaTortillasHarinaKg').addEventListener('change', e => { STATE.settings.alertaTortillasHarinaKg = Number(e.target.value) || 0; save(); renderInventory(); });

  document.getElementById('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(STATE, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `taqueria-pos-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.raw || !parsed.finished) throw new Error('Formato inválido');
        STATE = parsed;
        save();
        toast('Respaldo importado correctamente');
        renderAll();
      } catch (err) {
        toast('Error al importar: archivo inválido');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    openModal(`
      <h3>¿Reiniciar todos los datos?</h3>
      <p class="modal-sub">Esto borrará inventario, precios, ventas e historial de este dispositivo de forma permanente. Considera exportar un respaldo antes.</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="resetCancel">Cancelar</button>
        <button class="btn btn-danger" id="resetConfirm">Sí, reiniciar</button>
      </div>`, root => {
      root.querySelector('#resetCancel').addEventListener('click', closeModal);
      root.querySelector('#resetConfirm').addEventListener('click', () => {
        STATE = defaultState();
        save();
        closeModal();
        toast('Datos reiniciados');
        renderAll();
      });
    });
  });
}

/* ======================================================================
   NAVEGACIÓN DE PESTAÑAS
   ====================================================================== */
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');
      if (btn.dataset.tab === 'reportes') { renderDailyReport(); renderMonthlyReport(); renderHistory(); }
      if (btn.dataset.tab === 'inventario') renderInventory();
      if (btn.dataset.tab === 'config') { renderPricesTable(); renderGramosTable(); renderConfigMisc(); }
    });
  });

  document.querySelectorAll('.report-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.report-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.report-view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`report-${btn.dataset.report}`).classList.add('active');
    });
  });
}

/* ======================================================================
   EVENTOS GLOBALES (delegación)
   ====================================================================== */
function initEvents() {
  document.getElementById('sellGrid').addEventListener('click', e => {
    const sellBtn = e.target.closest('[data-action="sell"]');
    if (sellBtn) { openSellModal(sellBtn.dataset.protein, sellBtn.dataset.tipo, sellBtn.dataset.formato); return; }
    const guacBtn = e.target.closest('[data-action="sell-guac"]');
    if (guacBtn) openGuacSellModal();
    const alambreBtn = e.target.closest('[data-action="sell-alambre"]');
    if (alambreBtn) openAlambreSellModal();
  });

  document.getElementById('ticketItems').addEventListener('click', e => {
    const rm = e.target.closest('[data-remove]');
    if (rm) { TICKET = TICKET.filter(it => it.id !== rm.dataset.remove); renderTicket(); }
  });
  document.getElementById('clearTicketBtn').addEventListener('click', () => { TICKET = []; TICKET_DISCOUNT = null; renderTicket(); });
  document.getElementById('addDiscountBtn').addEventListener('click', openDiscountModal);
  document.getElementById('removeDiscountBtn').addEventListener('click', removeDiscount);
  document.getElementById('confirmSaleBtn').addEventListener('click', () => {
    if (EDITING_SALE_ID) saveEditedSale();
    else confirmSale();
  });
  document.getElementById('cancelEditBtn').addEventListener('click', cancelEditSale);

  document.getElementById('purchaseForm').addEventListener('submit', handlePurchaseSubmit);

  document.getElementById('historyTable').addEventListener('click', e => {
    const editBtn = e.target.closest('[data-edit-sale]');
    if (editBtn) { startEditSale(editBtn.dataset.editSale); return; }
    const cancelBtn = e.target.closest('[data-cancel-sale]');
    if (cancelBtn) { requestCancelSale(cancelBtn.dataset.cancelSale); return; }
    const row = e.target.closest('[data-view-sale]');
    if (row) openSaleDetailModal(row.dataset.viewSale);
  });

  document.getElementById('rawInventoryTable').addEventListener('click', e => {
    const btn = e.target.closest('[data-adjust-raw]');
    if (btn) openAdjustRawModal(btn.dataset.adjustRaw);
  });

  document.getElementById('dailyDate').addEventListener('change', renderDailyReport);
  document.getElementById('monthlyMonth').addEventListener('change', renderMonthlyReport);
  document.getElementById('historyFilter').addEventListener('change', renderHistory);
  document.getElementById('historyFrom').addEventListener('change', renderHistory);
  document.getElementById('historyTo').addEventListener('change', renderHistory);
  document.getElementById('historyClearDates').addEventListener('click', () => {
    document.getElementById('historyFrom').value = '';
    document.getElementById('historyTo').value = '';
    renderHistory();
  });

  document.getElementById('panel-reportes').addEventListener('click', e => {
    const btn = e.target.closest('[data-report-action]');
    if (btn) {
      const actions = {
        'print-diario': printDailyReport,
        'whatsapp-diario': shareDailyReportWhatsApp,
        'print-mensual': printMonthlyReport,
        'whatsapp-mensual': shareMonthlyReportWhatsApp,
        'print-historial': printHistoryReport,
        'whatsapp-historial': shareHistoryReportWhatsApp,
      };
      actions[btn.dataset.reportAction]?.();
      return;
    }
    if (e.target.closest('[data-action="view-discounts-daily"]')) {
      const date = document.getElementById('dailyDate').value || todayStr();
      const data = getDailyReportData(date);
      openDiscountDetailModal(data.ventasConDescuento, `Reporte diario — ${data.date}`);
      return;
    }
    if (e.target.closest('[data-action="view-discounts-monthly"]')) {
      const month = document.getElementById('monthlyMonth').value || monthStr();
      const data = getMonthlyReportData(month);
      openDiscountDetailModal(data.ventasConDescuento, `Reporte mensual — ${data.month}`);
    }
  });

  bindConfigInputs();
}

/* ======================================================================
   TEMA Y RELOJ
   ====================================================================== */
function initTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') document.documentElement.dataset.theme = stored;
  document.getElementById('themeToggle').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme;
    const next = cur === 'dark' ? 'light' : cur === 'light' ? '' : 'dark';
    if (next) { document.documentElement.dataset.theme = next; localStorage.setItem(THEME_KEY, next); }
    else { delete document.documentElement.dataset.theme; localStorage.removeItem(THEME_KEY); }
  });
}
function initClock() {
  const el = document.getElementById('clock');
  const tick = () => { el.textContent = new Date().toLocaleString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  tick();
  setInterval(tick, 30000);
}

/* ======================================================================
   INIT
   ====================================================================== */
function renderAll() {
  renderSellGrid();
  renderTicket();
  renderPurchaseForm();
  renderPurchaseHistory();
  renderInventory();
  document.getElementById('dailyDate').value = todayStr();
  document.getElementById('monthlyMonth').value = monthStr();
  renderDailyReport();
  renderMonthlyReport();
  renderHistory();
  renderPricesTable();
  renderGramosTable();
  renderConfigMisc();
}

function init() {
  initTheme();
  initClock();
  initTabs();
  initEvents();
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
