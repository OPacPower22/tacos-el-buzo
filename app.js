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

const INSUMOS = [
  { id: 'bistec',    label: 'Bistec crudo',    unit: 'kg' },
  { id: 'longaniza', label: 'Longaniza cruda', unit: 'kg' },
  { id: 'arrachera', label: 'Arrachera cruda', unit: 'kg' },
  { id: 'ribeye',    label: 'Rib Eye crudo',   unit: 'kg' },
  { id: 'tortillas', label: 'Tortillas',       unit: 'kg' },
  { id: 'guacamole', label: 'Guacamole preparado', unit: 'kg' },
  { id: 'queso',     label: 'Queso rallado',   unit: 'kg' },
];

// Insumos que se registran/capturan en kg pero se guardan internamente en gramos
// (igual que el guacamole), para tener precisión pieza a pieza.
const GRAM_BASED_INSUMOS = ['guacamole', 'tortillas', 'queso'];

const MOVEMENT_LABELS = { compra: 'Compra', produccion: 'Producción', venta: 'Venta', ajuste: 'Ajuste' };

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
  const finished = {};
  PROTEINS.forEach(p => {
    prices[p.id] = defaultPricesForProtein(p.id);
    finished[p.id] = { taco: { piezas: 0, gramos: 0 }, quesadilla: { piezas: 0, gramos: 0 } };
  });
  return {
    // tortillas y queso se guardan en gramos (como el guacamole); se compran por kg.
    raw: { bistec: 5, longaniza: 5, arrachera: 3, ribeye: 2, tortillas: 10200, guacamole: 1500, queso: 1000 },
    finished,
    prices,
    guacPrice: 35,
    settings: {
      // Gramos de carne por pieza (taco o quesadilla), según el promedio real de operación.
      gramosPorProducto: { bistec: 61, longaniza: 61, arrachera: 41, ribeye: 41 },
      // El campechano mezcla longaniza y bistec en proporción propia (no 50/50).
      campechanoLonganiza: 41,
      campechanoBistec: 31,
      quesoGramos: 61,
      quesoPrecio: 10,
      gramosPorTortilla: 34,
      alertaStockBajoKg: 1,
      alertaTortillasKg: 2,
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
    return {
      raw: Object.assign(def.raw, parsed.raw),
      finished: Object.assign(def.finished, parsed.finished),
      prices: Object.assign(def.prices, parsed.prices),
      guacPrice: parsed.guacPrice ?? def.guacPrice,
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
function applyPrep(protein, tipoId, piezas, gramos, tortillas) {
  const p = proteinById(protein);
  if (p.combo) {
    const split = campechanoSplitKg(gramos);
    STATE.raw.longaniza -= split.longaniza;
    STATE.raw.bistec -= split.bistec;
  } else {
    STATE.raw[protein] -= gramos / 1000;
  }
  STATE.raw.tortillas -= tortillas * STATE.settings.gramosPorTortilla;
  const f = STATE.finished[protein][tipoId];
  f.piezas += piezas;
  f.gramos += gramos;
  pushMovement('produccion', { protein, tipo: tipoId, piezas, gramos, tortillas });
}

function computeSaleItemImpact(item) {
  // devuelve { piezas, gramos, quesoGramos } sin mutar el estado (para preview y para aplicar)
  if (item.protein === 'guacamole') {
    return { gramos: item.cantidad * 150 };
  }
  const f = STATE.finished[item.protein][item.tipo];
  let piezas;
  let gramos;
  if (item.formato === 'pieza') {
    piezas = item.cantidad;
  } else if (item.formato === 'orden5') {
    piezas = item.cantidad * 5;
  } else {
    const gpp = gramosPorPieza(STATE, item.protein);
    piezas = Math.round((item.cantidad * 1000) / gpp);
  }
  const avgGramos = f.piezas > 0 ? f.gramos / f.piezas : gramosPorPieza(STATE, item.protein);
  gramos = item.formato === 'kilo' ? item.cantidad * 1000 : piezas * avgGramos;
  const quesoGramos = item.conQueso ? piezas * STATE.settings.quesoGramos : 0;
  return { piezas, gramos, quesoGramos };
}

function applySaleItem(item) {
  if (item.protein === 'guacamole') {
    STATE.raw.guacamole -= item.cantidad * 150;
    return;
  }
  const impact = computeSaleItemImpact(item);
  const f = STATE.finished[item.protein][item.tipo];
  f.piezas -= impact.piezas;
  f.gramos -= impact.gramos;
  if (impact.quesoGramos) STATE.raw.queso -= impact.quesoGramos;
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

function openModal(html, onMount) {
  modalEl.innerHTML = html;
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
   TAB: PREPARAR
   ====================================================================== */
function renderPrepGrid() {
  const grid = document.getElementById('prepGrid');
  grid.innerHTML = PROTEINS.map(p => TIPOS.map(t => {
    const f = STATE.finished[p.id][t.id];
    const low = f.piezas <= 0;
    return `
      <button class="product-btn" data-protein="${p.id}" data-action="prep" data-tipo="${t.id}">
        <div class="p-icon">${t.icon}</div>
        <div class="p-name">${t.name} de ${p.name}</div>
        <div class="p-sub">${p.sub || ''}</div>
        <div class="p-stock ${low ? 'low' : ''}">${num(f.piezas)} piezas listas</div>
      </button>`;
  }).join('')).join('');
}

function openPrepModal(proteinId, tipoId) {
  const p = proteinById(proteinId), t = tipoById(tipoId);
  const rawInfo = p.combo
    ? p.combo.map(id => `${proteinById(id).name}: ${num(STATE.raw[id], 2)} kg`).join(' · ')
    : `${p.name} crudo: ${num(STATE.raw[proteinId], 2)} kg`;
  const gpp = gramosPorPieza(STATE, proteinId);
  const s = STATE.settings;
  const tortillasPzasAprox = Math.floor(STATE.raw.tortillas / s.gramosPorTortilla);
  const html = `
    <h3>Preparar ${t.name} de ${p.name}</h3>
    <p class="modal-sub">Materia prima disponible — ${rawInfo} · Tortillas: ${num(STATE.raw.tortillas / 1000, 2)} kg (~${num(tortillasPzasAprox)} pzas)</p>
    ${p.combo ? `<p class="field-hint">El campechano descuenta ${s.campechanoLonganiza} g de longaniza y ${s.campechanoBistec} g de bistec por cada pieza preparada.</p>` : ''}
    <div class="form-row">
      <label for="prepPiezas">Cantidad a preparar (piezas)</label>
      <input type="number" id="prepPiezas" min="0" step="1" value="10">
    </div>
    <div class="form-row">
      <label for="prepGramos">Cantidad de carne a utilizar (gramos)</label>
      <input type="number" id="prepGramos" min="0" step="10" value="${10 * gpp}">
      <span class="field-hint">Referencia: ~${gpp} g por pieza</span>
    </div>
    <div class="form-row">
      <label for="prepTortillas">Tortillas a utilizar</label>
      <input type="number" id="prepTortillas" min="0" step="1" value="10">
    </div>
    <div id="prepWarn"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="prepCancel">Cancelar</button>
      <button class="btn btn-primary" id="prepConfirm">Registrar preparación</button>
    </div>
  `;
  openModal(html, root => {
    const piezasInput = root.querySelector('#prepPiezas');
    const gramosInput = root.querySelector('#prepGramos');
    piezasInput.addEventListener('input', () => {
      gramosInput.value = Math.round((Number(piezasInput.value) || 0) * gpp);
      root.querySelector('#prepTortillas').value = piezasInput.value;
    });
    root.querySelector('#prepCancel').addEventListener('click', closeModal);
    root.querySelector('#prepConfirm').addEventListener('click', () => {
      const piezas = Number(piezasInput.value) || 0;
      const gramos = Number(gramosInput.value) || 0;
      const tortillas = Number(root.querySelector('#prepTortillas').value) || 0;
      if (piezas <= 0 || gramos <= 0) { toast('Captura cantidades mayores a cero'); return; }
      const wouldGoNegative = p.combo
        ? (() => { const sp = campechanoSplitKg(gramos); return STATE.raw.longaniza - sp.longaniza < 0 || STATE.raw.bistec - sp.bistec < 0; })()
        : (STATE.raw[proteinId] - gramos / 1000 < 0);
      const tortillasNegative = STATE.raw.tortillas - tortillas * STATE.settings.gramosPorTortilla < 0;
      if ((wouldGoNegative || tortillasNegative) && !root.dataset.forced) {
        root.querySelector('#prepWarn').innerHTML = `<div class="warn-box">⚠️ Esto dejará inventario en negativo (${wouldGoNegative ? 'carne cruda' : ''}${wouldGoNegative && tortillasNegative ? ' y ' : ''}${tortillasNegative ? 'tortillas' : ''}). Presiona de nuevo para confirmar de todas formas.</div>`;
        root.dataset.forced = '1';
        return;
      }
      applyPrep(proteinId, tipoId, piezas, gramos, tortillas);
      save();
      toast(`Preparación registrada: ${piezas} ${t.name.toLowerCase()}s de ${p.name}`);
      closeModal();
      renderPrepGrid();
      renderSellGrid();
      renderInventory();
    });
  });
}

/* ======================================================================
   TAB: VENDER
   ====================================================================== */
function renderSellGrid() {
  const grid = document.getElementById('sellGrid');
  const sections = TIPOS.map(t => {
    const cards = PROTEINS.map(p => {
      const f = STATE.finished[p.id][t.id];
      const low = f.piezas <= 0;
      const buttons = FORMATOS.map(fo => {
        const price = STATE.prices[p.id][t.id][fo.id];
        return `<button class="btn btn-sm" data-action="sell" data-protein="${p.id}" data-tipo="${t.id}" data-formato="${fo.id}">${fo.name}<br><span class="field-hint">${money(price)}</span></button>`;
      }).join('');
      return `
        <div class="product-btn" data-protein="${p.id}">
          <div class="p-icon">${t.icon}</div>
          <div class="p-name">${p.name}</div>
          <div class="p-stock ${low ? 'low' : ''}">${num(f.piezas)} piezas listas</div>
          <div class="format-buttons">${buttons}</div>
        </div>`;
    }).join('');
    return `<h3 class="section-title">${t.name}s</h3><div class="grid-buttons">${cards}</div>`;
  }).join('');

  const guacLow = STATE.raw.guacamole <= 0;
  const guacCard = `
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
    </div>`;

  grid.innerHTML = sections + guacCard;
}

function openSellModal(proteinId, tipoId, formatoId) {
  const p = proteinById(proteinId), t = tipoById(tipoId), fo = formatoById(formatoId);
  const price = STATE.prices[proteinId][tipoId][formatoId];
  const f = STATE.finished[proteinId][tipoId];
  const gpp = gramosPorPieza(STATE, proteinId);
  const piezasEquiv = cantidad => {
    if (formatoId === 'pieza') return cantidad;
    if (formatoId === 'orden5') return cantidad * 5;
    return Math.round((cantidad * 1000) / gpp);
  };
  const computeSubtotal = (cantidad, conQueso) => price * cantidad + (conQueso ? piezasEquiv(cantidad) * STATE.settings.quesoPrecio : 0);
  const html = `
    <h3>${fo.name} de ${t.name} — ${p.name}</h3>
    <p class="modal-sub">Disponible: ${num(f.piezas)} piezas · Precio: ${money(price)} / ${fo.unit}</p>
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
      if (impact.piezas > f.piezas) {
        warn += `<div class="warn-box">⚠️ Solo hay ${num(f.piezas)} piezas preparadas. Se agregará de todas formas.</div>`;
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

function renderTicket() {
  const itemsEl = document.getElementById('ticketItems');
  const totalEl = document.getElementById('ticketTotal');
  const confirmBtn = document.getElementById('confirmSaleBtn');
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
  const total = TICKET.reduce((s, it) => s + it.subtotal, 0);
  totalEl.textContent = money(total);
  confirmBtn.disabled = TICKET.length === 0;
}

function confirmSale() {
  if (TICKET.length === 0) return;
  TICKET.forEach(applySaleItem);
  const total = TICKET.reduce((s, it) => s + it.subtotal, 0);
  pushMovement('venta', { items: TICKET.map(({ protein, tipo, formato, cantidad, precioUnit, subtotal, label }) => ({ protein, tipo, formato, cantidad, precioUnit, subtotal, label })), total });
  save();
  toast(`Venta registrada por ${money(total)}`);
  TICKET = [];
  renderTicket();
  renderSellGrid();
  renderInventory();
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
  ];
  rawTbody.innerHTML = rawRows.map(r => `
    <tr>
      <td>${r.label}</td>
      <td>${num(r.value, 2)} ${r.unit}</td>
      <td>${stockTag(r.value, r.threshold)}</td>
      <td><button class="btn btn-ghost" data-adjust-raw="${r.id}">Ajustar</button></td>
    </tr>`).join('');

  const finTbody = document.querySelector('#finishedInventoryTable tbody');
  const rows = [];
  PROTEINS.forEach(p => TIPOS.forEach(t => {
    const f = STATE.finished[p.id][t.id];
    const avg = f.piezas > 0 ? f.gramos / f.piezas : 0;
    rows.push(`
      <tr>
        <td>${t.icon} ${t.name} — ${p.name}</td>
        <td class="${f.piezas < 0 ? 'field-hint' : ''}" style="${f.piezas < 0 ? 'color:var(--status-critical);font-weight:700;' : ''}">${num(f.piezas)}</td>
        <td>${num(f.gramos, 0)} g (${num(f.gramos / 1000, 2)} kg)</td>
        <td>${avg ? num(avg, 1) : '—'}</td>
        <td><button class="btn btn-ghost" data-adjust-finished="${p.id}|${t.id}">Ajustar</button></td>
      </tr>`);
  }));
  finTbody.innerHTML = rows.join('');
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

function openAdjustFinishedModal(proteinId, tipoId) {
  const p = proteinById(proteinId), t = tipoById(tipoId);
  const f = STATE.finished[proteinId][tipoId];
  const html = `
    <h3>Ajustar: ${t.name} — ${p.name}</h3>
    <p class="modal-sub">Piezas actuales: ${num(f.piezas)} · Carne actual: ${num(f.gramos)} g</p>
    <div class="form-row">
      <label for="adjPiezas">Nuevas piezas</label>
      <input type="number" id="adjPiezas" step="1" value="${f.piezas}">
    </div>
    <div class="form-row">
      <label for="adjGramos">Nuevos gramos de carne</label>
      <input type="number" id="adjGramos" step="1" value="${f.gramos}">
    </div>
    <div class="form-row">
      <label for="adjFNote">Motivo (opcional)</label>
      <input type="text" id="adjFNote" placeholder="Ej. conteo físico, merma...">
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="adjFCancel">Cancelar</button>
      <button class="btn btn-primary" id="adjFConfirm">Guardar ajuste</button>
    </div>`;
  openModal(html, root => {
    root.querySelector('#adjFCancel').addEventListener('click', closeModal);
    root.querySelector('#adjFConfirm').addEventListener('click', () => {
      const piezas = Number(root.querySelector('#adjPiezas').value);
      const gramos = Number(root.querySelector('#adjGramos').value);
      const nota = root.querySelector('#adjFNote').value.trim();
      pushMovement('ajuste', { target: 'finished', key: `${proteinId}|${tipoId}`, deltaPiezas: piezas - f.piezas, deltaGramos: gramos - f.gramos, nota });
      f.piezas = piezas;
      f.gramos = gramos;
      save();
      toast('Ajuste guardado');
      closeModal();
      renderInventory();
      renderPrepGrid();
      renderSellGrid();
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
    return m.items.map(it => `${it.cantidad}× ${it.label}`).join(', ');
  }
  if (m.type === 'ajuste') {
    return m.target === 'raw'
      ? `${m.key}: nuevo valor ${num(m.nuevo, 2)} (${m.delta >= 0 ? '+' : ''}${num(m.delta, 2)})${m.nota ? ' — ' + m.nota : ''}`
      : `${m.key.replace('|', ' / ')}: piezas ${m.deltaPiezas >= 0 ? '+' : ''}${m.deltaPiezas}, gramos ${m.deltaGramos >= 0 ? '+' : ''}${num(m.deltaGramos)}${m.nota ? ' — ' + m.nota : ''}`;
  }
  return '';
}

function renderDailyReport() {
  const dateInput = document.getElementById('dailyDate');
  const date = dateInput.value || todayStr();
  dateInput.value = date;
  const ventasDelDia = STATE.movements.filter(m => m.type === 'venta' && todayStr(new Date(m.ts)) === date);
  const produccionDelDia = STATE.movements.filter(m => m.type === 'produccion' && todayStr(new Date(m.ts)) === date);

  const totalVendido = ventasDelDia.reduce((s, m) => s + m.total, 0);
  const totalPiezasVendidas = ventasDelDia.reduce((s, m) => s + m.items.reduce((s2, it) => s2 + (it.protein === 'guacamole' ? 0 : it.cantidad), 0), 0);
  const totalCarnePreparada = produccionDelDia.reduce((s, m) => s + m.gramos, 0);
  const totalTicketsCount = ventasDelDia.length;

  document.getElementById('dailyStats').innerHTML = `
    <div class="stat-tile"><div class="st-label">Ventas totales</div><div class="st-value">${money(totalVendido)}</div></div>
    <div class="stat-tile"><div class="st-label">Tickets cobrados</div><div class="st-value">${num(totalTicketsCount)}</div></div>
    <div class="stat-tile"><div class="st-label">Piezas / porciones vendidas</div><div class="st-value">${num(totalPiezasVendidas)}</div></div>
    <div class="stat-tile"><div class="st-label">Carne preparada</div><div class="st-value">${num(totalCarnePreparada / 1000, 2)} kg</div></div>
  `;

  const agg = {};
  ventasDelDia.forEach(m => m.items.forEach(it => {
    const key = `${it.label}`;
    if (!agg[key]) agg[key] = { label: it.label, formato: it.formato, cantidad: 0, importe: 0 };
    agg[key].cantidad += it.cantidad;
    agg[key].importe += it.subtotal;
  }));
  const rows = Object.values(agg).sort((a, b) => b.importe - a.importe);
  const tbody = document.querySelector('#dailySalesTable tbody');
  tbody.innerHTML = rows.length ? rows.map(r => `
    <tr><td>${r.label}</td><td>${formatoById(r.formato)?.name || (r.formato === 'orden' ? 'Orden 150g' : r.formato)}</td><td>${num(r.cantidad, 2)}</td><td>${money(r.importe)}</td></tr>
  `).join('') : '<tr><td colspan="4" class="field-hint">Sin ventas en esta fecha.</td></tr>';
}

function renderMonthlyReport() {
  const monthInput = document.getElementById('monthlyMonth');
  const month = monthInput.value || monthStr();
  monthInput.value = month;
  const ventasDelMes = STATE.movements.filter(m => m.type === 'venta' && monthStr(new Date(m.ts)) === month);

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
  const totalPiezas = ventasDelMes.reduce((s, m) => s + m.items.reduce((s2, it) => s2 + (it.protein === 'guacamole' ? 0 : it.cantidad), 0), 0);

  document.getElementById('monthlyStats').innerHTML = `
    <div class="stat-tile"><div class="st-label">Ventas del mes</div><div class="st-value">${money(totalMes)}</div></div>
    <div class="stat-tile"><div class="st-label">Promedio diario (días con venta)</div><div class="st-value">${money(promedioDiario)}</div></div>
    <div class="stat-tile"><div class="st-label">Mejor día</div><div class="st-value">${maxDia.i >= 0 ? `Día ${maxDia.i + 1} — ${money(maxDia.v)}` : '—'}</div></div>
    <div class="stat-tile"><div class="st-label">Piezas / porciones vendidas</div><div class="st-value">${num(totalPiezas)}</div></div>
  `;

  const maxVal = Math.max(...porDia, 1);
  document.getElementById('monthlyChart').innerHTML = porDia.map((v, i) => `
    <div class="bar-col">
      <div class="bar-tip">Día ${i + 1}: ${money(v)}</div>
      <div class="bar" style="height:${Math.max(2, (v / maxVal) * 100)}%"></div>
      <div class="bar-day-label">${i + 1}</div>
    </div>`).join('');

  const agg = {};
  ventasDelMes.forEach(m => m.items.forEach(it => {
    if (!agg[it.label]) agg[it.label] = { label: it.label, cantidad: 0, importe: 0 };
    agg[it.label].cantidad += it.cantidad;
    agg[it.label].importe += it.subtotal;
  }));
  const rows = Object.values(agg).sort((a, b) => b.importe - a.importe);
  document.querySelector('#monthlyProductTable tbody').innerHTML = rows.length
    ? rows.map(r => `<tr><td>${r.label}</td><td>${num(r.cantidad, 2)}</td><td>${money(r.importe)}</td></tr>`).join('')
    : '<tr><td colspan="3" class="field-hint">Sin ventas en este mes.</td></tr>';
}

function renderHistory() {
  const filter = document.getElementById('historyFilter').value;
  const rows = STATE.movements
    .filter(m => filter === 'todos' || m.type === filter)
    .slice()
    .reverse()
    .slice(0, 200);
  const tbody = document.querySelector('#historyTable tbody');
  tbody.innerHTML = rows.length ? rows.map(m => `
    <tr>
      <td>${fmtDateTime(m.ts)}</td>
      <td><span class="tag good">${MOVEMENT_LABELS[m.type]}</span></td>
      <td>${movementDetailText(m)}</td>
      <td>${m.type === 'venta' ? money(m.total) : ''}</td>
    </tr>`).join('') : '<tr><td colspan="4" class="field-hint">Sin movimientos.</td></tr>';
}

/* ======================================================================
   TAB: CONFIGURACIÓN
   ====================================================================== */
function renderPricesTable() {
  const tbody = document.querySelector('#pricesTable tbody');
  const rows = [];
  PROTEINS.forEach(p => TIPOS.forEach(t => {
    const price = STATE.prices[p.id][t.id];
    rows.push(`
      <tr>
        <td>${t.icon} ${t.name} — ${p.name}</td>
        <td><input type="number" step="0.5" min="0" value="${price.pieza}" data-price="${p.id}|${t.id}|pieza" style="width:90px"></td>
        <td><input type="number" step="0.5" min="0" value="${price.orden5}" data-price="${p.id}|${t.id}|orden5" style="width:90px"></td>
        <td><input type="number" step="0.5" min="0" value="${price.kilo}" data-price="${p.id}|${t.id}|kilo" style="width:90px"></td>
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
  document.getElementById('alertaStockBajo').value = STATE.settings.alertaStockBajoKg;
  document.getElementById('alertaTortillasKg').value = STATE.settings.alertaTortillasKg;
}

function bindConfigInputs() {
  document.getElementById('priceGuac').addEventListener('change', e => { STATE.guacPrice = Number(e.target.value) || 0; save(); renderSellGrid(); });
  document.getElementById('quesoGramos').addEventListener('change', e => { STATE.settings.quesoGramos = Number(e.target.value) || 1; save(); });
  document.getElementById('quesoPrecio').addEventListener('change', e => { STATE.settings.quesoPrecio = Number(e.target.value) || 0; save(); });
  document.getElementById('campechanoLonganiza').addEventListener('change', e => { STATE.settings.campechanoLonganiza = Number(e.target.value) || 1; save(); });
  document.getElementById('campechanoBistec').addEventListener('change', e => { STATE.settings.campechanoBistec = Number(e.target.value) || 1; save(); });
  document.getElementById('gramosPorTortilla').addEventListener('change', e => { STATE.settings.gramosPorTortilla = Number(e.target.value) || 1; save(); });
  document.getElementById('alertaStockBajo').addEventListener('change', e => { STATE.settings.alertaStockBajoKg = Number(e.target.value) || 0; save(); renderInventory(); });
  document.getElementById('alertaTortillasKg').addEventListener('change', e => { STATE.settings.alertaTortillasKg = Number(e.target.value) || 0; save(); renderInventory(); });

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
  document.getElementById('prepGrid').addEventListener('click', e => {
    const btn = e.target.closest('[data-action="prep"]');
    if (btn) openPrepModal(btn.dataset.protein, btn.dataset.tipo);
  });

  document.getElementById('sellGrid').addEventListener('click', e => {
    const sellBtn = e.target.closest('[data-action="sell"]');
    if (sellBtn) { openSellModal(sellBtn.dataset.protein, sellBtn.dataset.tipo, sellBtn.dataset.formato); return; }
    const guacBtn = e.target.closest('[data-action="sell-guac"]');
    if (guacBtn) openGuacSellModal();
  });

  document.getElementById('ticketItems').addEventListener('click', e => {
    const rm = e.target.closest('[data-remove]');
    if (rm) { TICKET = TICKET.filter(it => it.id !== rm.dataset.remove); renderTicket(); }
  });
  document.getElementById('clearTicketBtn').addEventListener('click', () => { TICKET = []; renderTicket(); });
  document.getElementById('confirmSaleBtn').addEventListener('click', confirmSale);

  document.getElementById('purchaseForm').addEventListener('submit', handlePurchaseSubmit);

  document.getElementById('rawInventoryTable').addEventListener('click', e => {
    const btn = e.target.closest('[data-adjust-raw]');
    if (btn) openAdjustRawModal(btn.dataset.adjustRaw);
  });
  document.getElementById('finishedInventoryTable').addEventListener('click', e => {
    const btn = e.target.closest('[data-adjust-finished]');
    if (btn) { const [pid, tid] = btn.dataset.adjustFinished.split('|'); openAdjustFinishedModal(pid, tid); }
  });

  document.getElementById('dailyDate').addEventListener('change', renderDailyReport);
  document.getElementById('monthlyMonth').addEventListener('change', renderMonthlyReport);
  document.getElementById('historyFilter').addEventListener('change', renderHistory);

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
  renderPrepGrid();
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
