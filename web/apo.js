// Apolonia · pedidos mayoristas de pastas.
// Una sola página, sin paso de compilación, con su propia base en Supabase:
// lo que ve y puede hacer cada cliente lo deciden los permisos de la base (RLS y funciones apo_*).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(n) || 0);
const VUELTA = location.origin + '/';
const TZ = 'America/Argentina/Buenos_Aires';
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const fechaHora = s => new Intl.DateTimeFormat('es-AR', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(s));
const fechaCorta = s => new Intl.DateTimeFormat('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(s));
const fechaDia = d => { if (!d) return ''; const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; };
const nro = n => String(n).padStart(8, '0');
const PLURAL = { caja: 'cajas', 'porción': 'porciones', unidad: 'unidades' };
const unidades = (n, u) => `${n} ${n === 1 ? u : (PLURAL[u] || u)}`;
const ESTADOS = { recibido: 'Recibido', en_preparacion: 'En preparación', enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado' };
const TIPOS = { restaurante: 'Restaurante · porciones', mayorista: 'Mayorista · cajas', prepizza: 'Pre pizzas' };
const TIPO_CORTO = { restaurante: 'Restaurante', mayorista: 'Mayorista', prepizza: 'Pre pizzas' };
const CATALOGO = { restaurante: 'Porciones para restaurantes', mayorista: 'Cajas para mayoristas', prepizza: 'Pre pizzas congeladas' };
const DOMINIO = '@clientes.apolonia.invalid';   // cuentas con usuario (sin email real)
const aEmail = v => { v = v.trim().toLowerCase(); return v.includes('@') ? v : v + DOMINIO; };
const usuarioDe = e => String(e || '').endsWith(DOMINIO) ? e.slice(0, -DOMINIO.length) : e;
const SEG_TIPOS = (sel = 'restaurante') => `<div class="seg">
  <label><input type="radio" name="tc" value="restaurante" ${sel === 'restaurante' ? 'checked' : ''}><b>Restaurante</b><span>Porciones congeladas</span></label>
  <label><input type="radio" name="tc" value="mayorista" ${sel === 'mayorista' ? 'checked' : ''}><b>Mayorista</b><span>Cajas congeladas</span></label>
  <label><input type="radio" name="tc" value="prepizza" ${sel === 'prepizza' ? 'checked' : ''}><b>Pre pizzas</b><span>Pre pizzas congeladas</span></label></div>`;
const errMsg = e => e?.message || String(e);

const ICON = {
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  ok: '<path d="M20 6 9 17l-5-5"/>',
  pdf: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M12 12v6M9 15l3 3 3-3"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6"/>',
  reload: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>'
};
const svg = (k, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${ICON[k]}</svg>`;

// ---------- Estado ----------
const S = {
  user: null, admin: false, cliente: null, config: null,
  productos: [], pedidos: [], clientes: [],
  tab: null, carrito: {}, filtro: 'activos', recuperar: false
};

function toast(t) {
  const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d);
  setTimeout(() => d.remove(), 2600);
}
function sheet(html) {
  $('#layer').innerHTML = `<div class="scrim"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
  $('#layer .scrim').addEventListener('click', e => { if (e.target.classList.contains('scrim')) cerrar(); });
  $$('#layer [data-close]').forEach(b => b.onclick = cerrar);
}
function cerrar() { $('#layer').innerHTML = ''; }
const sheetHead = (titulo, sub = '') => `<div class="sheet-head"><div><h2>${titulo}</h2>${sub ? `<div class="muted small" style="margin-top:4px">${sub}</div>` : ''}</div><button class="x" data-close aria-label="Cerrar">${svg('x')}</button></div>`;
const app = h => { $('#app').innerHTML = h; };
const cargando = () => app('<div class="loading"><div class="spin" aria-label="Cargando"></div></div>');

// ---------- Carrito (queda guardado en este navegador mientras se arma) ----------
const keyCarrito = () => 'apo_carrito_' + (S.user?.id || '');
function leerCarrito() { try { S.carrito = JSON.parse(localStorage.getItem(keyCarrito()) || '{}') || {}; } catch { S.carrito = {}; } }
function guardarCarrito() { try { localStorage.setItem(keyCarrito(), JSON.stringify(S.carrito)); } catch {} }
const ck = (id, v) => id + '|' + (v || '');
function lineas() {
  const out = [];
  for (const [k, q] of Object.entries(S.carrito)) {
    if (!q) continue;
    const [id, v] = k.split('|');
    const p = S.productos.find(x => x.id === id);
    if (!p) continue;
    out.push({ p, v, q, sub: p.precio * q });
  }
  return out.sort((a, b) => a.p.orden - b.p.orden || a.v.localeCompare(b.v));
}

// ---------- Arranque ----------
async function iniciar() {
  cargando();
  const { data: { session } } = await sb.auth.getSession();
  S.user = session?.user || null;
  if (S.recuperar) return vNuevaClave();
  if (!S.user) return vAcceso();
  const { data: esAdmin } = await sb.rpc('apo_es_admin');
  S.admin = !!esAdmin;
  if (S.admin) { S.tab = S.tab || 'pedidos'; return cargarAdmin(); }
  const { data: rol } = await sb.rpc('apo_mi_rol');
  if (rol === 'produccion') { S.tab = S.tab || 'producir'; return cargarProd(); }
  const { data: c } = await sb.from('apo_clientes').select('*').eq('user_id', S.user.id).maybeSingle();
  S.cliente = c;
  if (!c) return vCompletarAlta();
  if (c.estado === 'pendiente') return vPendiente();
  if (c.estado === 'bloqueado') return vBloqueado();
  S.tab = S.tab || 'pedir';
  leerCarrito();
  await cargarCliente();
}

function encabezado(sub) {
  return `<header class="head pad"><div class="head-row"><div class="brand"><img src="/logo.png" alt="Apolonia · La Fábrica"></div>
    <button class="icon-btn" id="salir" aria-label="Cerrar sesión" title="Cerrar sesión">${svg('out')}</button></div>
    ${sub ? `<div class="who">${sub}</div>` : ''}</header>`;
}
function conectarSalir() { const b = $('#salir'); if (b) b.onclick = async () => { await sb.auth.signOut(); S.tab = null; S.admin = false; iniciar(); }; }

// =====================================================================
// Acceso
// =====================================================================
function vAcceso(modo = 'entrar', aviso = '') {
  const alta = modo === 'alta';
  app(`<div class="auth-hero"><img src="/logo.png" alt="Apolonia · La Fábrica"><p>Pedidos mayoristas de pastas congeladas para restaurantes y distribuidores.</p></div>
  <div class="auth pad">
    <div class="tabs" role="tablist" style="position:static;padding-top:0">
      <button class="tab" role="tab" aria-selected="${!alta}" data-m="entrar">Ya tengo cuenta</button>
      <button class="tab" role="tab" aria-selected="${alta}" data-m="alta">Soy cliente nuevo</button>
    </div>
    <form id="f" class="section" novalidate>
      ${aviso}
      <div id="err"></div>
      ${alta ? `
        <div class="field"><label>¿Qué tipo de cliente sos?</label>
${SEG_TIPOS()}</div>
        <div class="field"><label for="rs">Nombre del negocio / razón social</label><input class="in" id="rs" required autocomplete="organization"></div>
        <div class="grid2">
          <div class="field"><label for="ct">Persona de contacto</label><input class="in" id="ct" autocomplete="name"></div>
          <div class="field"><label for="tel">Teléfono / WhatsApp</label><input class="in" id="tel" inputmode="tel" autocomplete="tel"></div>
        </div>
        <div class="grid2">
          <div class="field"><label for="cuit">CUIT</label><input class="in" id="cuit" inputmode="numeric"></div>
          <div class="field"><label for="dir">Dirección de entrega</label><input class="in" id="dir" autocomplete="street-address"></div>
        </div>` : ''}
      <div class="field"><label for="em">${alta ? 'Email' : 'Usuario o email'}</label><input class="in" id="em" type="${alta ? 'email' : 'text'}" required autocomplete="username" autocapitalize="none" spellcheck="false"></div>
      <div class="field"><label for="pw">Contraseña</label><input class="in" id="pw" type="password" required minlength="6" autocomplete="${alta ? 'new-password' : 'current-password'}">
        ${alta ? '<span class="hint">Mínimo 6 caracteres.</span>' : ''}</div>
      <button class="btn block" id="go">${alta ? 'Crear cuenta' : 'Entrar'}</button>
      ${alta ? '' : '<div style="text-align:center;margin-top:10px"><button type="button" class="link" id="olvide">Me olvidé la contraseña</button></div>'}
    </form>
  </div>`);
  $$('[data-m]').forEach(b => b.onclick = () => vAcceso(b.dataset.m));
  if (!alta) $('#olvide').onclick = vOlvide;
  $('#f').onsubmit = async e => {
    e.preventDefault();
    const err = t => { $('#err').innerHTML = `<div class="msg bad">${esc(t)}</div>`; };
    const email = alta ? $('#em').value.trim() : aEmail($('#em').value), password = $('#pw').value;
    if (!email || !password) return err('Completá email y contraseña.');
    $('#go').disabled = true;
    try {
      if (!alta) {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message.includes('Invalid') ? 'Usuario o contraseña incorrectos.' : error.message.includes('confirm') ? 'Todavía no confirmaste tu email. Revisá tu casilla.' : error.message);
        return iniciar();
      }
      const razon = $('#rs').value.trim();
      if (razon.length < 2) throw new Error('Poné el nombre de tu negocio.');
      if (password.length < 6) throw new Error('La contraseña tiene que tener al menos 6 caracteres.');
      const datos = { tipo: 'apolonia', razon_social: razon, contacto: $('#ct').value.trim(), telefono: $('#tel').value.trim(),
        cuit: $('#cuit').value.trim(), direccion: $('#dir').value.trim(), tipo_cliente: $('input[name=tc]:checked').value };
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: VUELTA, data: datos } });
      if (error) throw new Error(error.message.includes('registered') ? 'Ese email ya tiene cuenta. Entrá con tu contraseña.' : error.message);
      if (data.session) return iniciar();
      vAcceso('entrar', `<div class="msg good">¡Listo! Te mandamos un email a <b>${esc(email)}</b>. Abrí el enlace para confirmar la cuenta y después entrá acá.</div>`);
    } catch (x) { err(errMsg(x)); $('#go').disabled = false; }
  };
}

function vOlvide() {
  sheet(`${sheetHead('Recuperar contraseña', 'Si entrás con usuario (sin email), pedile a Apolonia una contraseña nueva. Si te registraste con email, te mandamos un enlace.')}
    <form id="fo"><div id="oerr"></div><div class="field"><label for="oe">Email</label><input class="in" id="oe" type="email" required autocomplete="email"></div>
    <button class="btn block" id="ogo">Mandar enlace</button></form>`);
  $('#fo').onsubmit = async e => {
    e.preventDefault(); $('#ogo').disabled = true;
    const v = $('#oe').value.trim();
    if (!v.includes('@')) { $('#oerr').innerHTML = '<div class="msg info">Las cuentas con usuario no tienen email: pedile a Apolonia que te ponga una contraseña nueva.</div>'; $('#ogo').disabled = false; return; }
    const { error } = await sb.auth.resetPasswordForEmail(v, { redirectTo: VUELTA });
    $('#oerr').innerHTML = error ? `<div class="msg bad">${esc(error.message)}</div>` : '<div class="msg good">Listo. Revisá tu email y abrí el enlace.</div>';
    $('#ogo').disabled = false;
  };
}

function vNuevaClave() {
  app(`${encabezado()}<div class="auth pad"><h2>Nueva contraseña</h2>
    <form id="fn" class="section"><div id="nerr"></div>
    <div class="field"><label for="np">Contraseña nueva</label><input class="in" id="np" type="password" minlength="6" autocomplete="new-password" required></div>
    <button class="btn block" id="ngo">Guardar</button></form></div>`);
  conectarSalir();
  $('#fn').onsubmit = async e => {
    e.preventDefault();
    const pw = $('#np').value;
    if (pw.length < 6) { $('#nerr').innerHTML = '<div class="msg bad">Mínimo 6 caracteres.</div>'; return; }
    $('#ngo').disabled = true;
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) { $('#nerr').innerHTML = `<div class="msg bad">${esc(error.message)}</div>`; $('#ngo').disabled = false; return; }
    S.recuperar = false; toast('Contraseña actualizada'); iniciar();
  };
}

function vCompletarAlta() {
  app(`${encabezado()}<main class="pad" style="max-width:480px;margin:0 auto">
    <div class="section"><h2>Completá los datos de tu negocio</h2><p class="muted">Los necesitamos para preparar tus pedidos y armar el remito.</p></div>
    <form id="fa" class="section"><div id="aerr"></div>
      <div class="field"><label>Tipo de cliente</label>${SEG_TIPOS()}</div>
      <div class="field"><label for="rs">Nombre del negocio / razón social</label><input class="in" id="rs" required></div>
      <div class="field"><label for="ct">Persona de contacto</label><input class="in" id="ct"></div>
      <div class="field"><label for="tel">Teléfono / WhatsApp</label><input class="in" id="tel" inputmode="tel"></div>
      <div class="field"><label for="cuit">CUIT</label><input class="in" id="cuit"></div>
      <div class="field"><label for="dir">Dirección de entrega</label><input class="in" id="dir"></div>
      <button class="btn block" id="ago">Enviar</button></form></main>`);
  conectarSalir();
  $('#fa').onsubmit = async e => {
    e.preventDefault();
    if ($('#rs').value.trim().length < 2) { $('#aerr').innerHTML = '<div class="msg bad">Poné el nombre de tu negocio.</div>'; return; }
    $('#ago').disabled = true;
    const { error } = await sb.rpc('apo_registrarme', { p_razon_social: $('#rs').value, p_contacto: $('#ct').value, p_cuit: $('#cuit').value,
      p_direccion: $('#dir').value, p_telefono: $('#tel').value, p_tipo: $('input[name=tc]:checked').value });
    if (error) { $('#aerr').innerHTML = `<div class="msg bad">${esc(errMsg(error))}</div>`; $('#ago').disabled = false; return; }
    iniciar();
  };
}

function vPendiente() {
  const c = S.cliente;
  app(`${encabezado(`Hola, <b>${esc(c.razon_social)}</b>`)}<main class="pad" style="max-width:480px;margin:0 auto">
    <div class="done"><div class="check" style="background:var(--yolk-soft);color:#7a5600">${svg('ok')}</div>
      <h2>Tu cuenta está en revisión</h2>
      <p class="muted">Apolonia tiene que habilitarte como cliente de tipo ${esc(TIPO_CORTO[c.tipo].toLowerCase())}. Apenas lo haga, vas a poder ver el catálogo y hacer pedidos desde acá.</p>
      <button class="btn sec" id="rev">${svg('reload')} Ya me habilitaron, actualizar</button></div></main>`);
  conectarSalir(); $('#rev').onclick = iniciar;
}
function vBloqueado() {
  app(`${encabezado()}<main class="pad"><div class="done"><h2>Tu cuenta no está habilitada</h2>
    <p class="muted">Comunicate con Apolonia para más información.</p></div></main>`);
  conectarSalir();
}

// =====================================================================
// Cliente
// =====================================================================
async function cargarCliente() {
  const [pr, pe, cf] = await Promise.all([
    sb.rpc('apo_mi_catalogo'),
    sb.from('apo_pedidos').select('*').order('creado_en', { ascending: false }).limit(60),
    sb.from('apo_config').select('*').maybeSingle()
  ]);
  S.productos = (pr.data || []).map(p => ({ ...p, precio: Number(p.precio) }));
  S.pedidos = pe.data || [];
  S.config = cf.data;
  // Saca del carrito lo que ya no está en el catálogo
  for (const k of Object.keys(S.carrito)) if (!S.productos.some(p => p.id === k.split('|')[0])) delete S.carrito[k];
  guardarCarrito();
  vCliente();
}

function vCliente() {
  const c = S.cliente;
  const tabs = [['pedir', 'Hacer pedido'], ['pedidos', 'Mis pedidos'], ['cuenta', 'Mis datos']];
  app(`${encabezado(`<b>${esc(c.razon_social)}</b> · ${[c.tipo, ...(c.tipos_extra || [])].map(t => esc(TIPOS[t])).join(' + ')}`)}
    <nav class="tabs pad" role="tablist">${tabs.map(([k, t]) => `<button class="tab" role="tab" data-t="${k}" aria-selected="${S.tab === k}">${t}</button>`).join('')}</nav>
    <main class="pad" id="main"></main><div id="cartbar"></div>`);
  conectarSalir();
  $$('[data-t]').forEach(b => b.onclick = () => { S.tab = b.dataset.t; vCliente(); });
  ({ pedir: vCatalogo, pedidos: vMisPedidos, cuenta: vMisDatos })[S.tab]();
}

function stepper(key, q) {
  return `<div class="stepper ${q ? 'on' : ''}" data-k="${esc(key)}">
    <button type="button" data-d="-1" aria-label="Uno menos" ${q ? '' : 'disabled'}>−</button>
    <input type="number" inputmode="numeric" min="0" max="10000" value="${q || ''}" placeholder="0" aria-label="Cantidad">
    <button type="button" data-d="1" aria-label="Uno más">+</button></div>`;
}

function vCatalogo() {
  const c = S.cliente;
  if (!S.productos.length) { $('#main').innerHTML = '<div class="empty section">Todavía no hay productos cargados para tu tipo de cliente.</div>'; return; }
  const tipos = [...new Set(S.productos.map(p => p.tipo))];
  $('#main').innerHTML = tipos.map(t => { const ps = S.productos.filter(p => p.tipo === t); return `<div class="section-title"><h2>${CATALOGO[t]}</h2>
      <span class="muted small">Precios por ${esc(ps[0]?.unidad || 'unidad')}</span></div>
    <div class="list">${ps.map(p => {
      const vs = p.variantes || [];
      return `<div class="card prod">
        <div><div class="prod-name">${esc(p.nombre)}</div><div class="prod-meta"><span class="code">${esc(p.codigo)}</span>${esc(p.presentacion)}</div></div>
        ${vs.length ? `<div class="prod-price">${money(p.precio)} <small>c/${esc(p.unidad)}</small></div>
          <div class="variants">${vs.map(v => `<div class="var-row"><span>${esc(v)}</span>${stepper(ck(p.id, v), S.carrito[ck(p.id, v)])}</div>`).join('')}</div>`
        : `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px"><div class="prod-price">${money(p.precio)} <small>c/${esc(p.unidad)}</small></div>${stepper(ck(p.id, ''), S.carrito[ck(p.id, '')])}</div>`}
      </div>`;
    }).join('')}</div>`; }).join('');
  $$('#main .stepper').forEach(st => {
    const k = st.dataset.k, inp = st.querySelector('input');
    const set = q => {
      q = Math.max(0, Math.min(10000, Math.floor(Number(q) || 0)));
      if (q) S.carrito[k] = q; else delete S.carrito[k];
      guardarCarrito();
      inp.value = q || ''; st.classList.toggle('on', !!q); st.querySelector('[data-d="-1"]').disabled = !q;
      barra();
    };
    st.querySelectorAll('button').forEach(b => b.onclick = () => set((S.carrito[k] || 0) + Number(b.dataset.d)));
    inp.onchange = () => set(inp.value);
    inp.onfocus = () => inp.select();
  });
  barra();
}

function barra() {
  const ls = lineas(), el = $('#cartbar');
  if (!el) return;
  if (!ls.length || S.tab !== 'pedir') { el.innerHTML = ''; return; }
  const tot = ls.reduce((a, l) => a + l.sub, 0), n = ls.reduce((a, l) => a + l.q, 0);
  el.innerHTML = `<div class="cartbar"><button class="btn dark" id="ver">${svg('cart')}<span class="grow" style="text-align:left">Revisar pedido · ${n} ${S.cliente.tipo === 'mayorista' ? (n === 1 ? 'caja' : 'cajas') : (n === 1 ? 'unidad' : 'unidades')}</span><span class="num">${money(tot)}</span></button></div>`;
  $('#ver').onclick = vRevisar;
}

function vRevisar() {
  const ls = lineas();
  if (!ls.length) return cerrar();
  const tot = ls.reduce((a, l) => a + l.sub, 0);
  sheet(`${sheetHead('Tu pedido', esc(S.cliente.razon_social))}
    <table class="items"><thead><tr><th>Producto</th><th class="r">Cant.</th><th class="r">Subtotal</th></tr></thead><tbody>
    ${ls.map(l => `<tr><td><b>${esc(l.p.nombre)}</b>${l.v ? ` · ${esc(l.v)}` : ''}<div class="muted small">${esc(l.p.presentacion)} · ${money(l.p.precio)} c/u</div></td>
      <td class="r num">${l.q}</td><td class="r num">${money(l.sub)}</td></tr>`).join('')}
    </tbody><tfoot><tr><td colspan="2">Total</td><td class="r num">${money(tot)}</td></tr></tfoot></table>
    <form id="fp" class="section">
      <div id="perr"></div>
      <div class="field"><label for="ent">¿Para cuándo lo necesitás? <span class="muted">(opcional)</span></label><input class="in" type="date" id="ent" min="${hoy()}"></div>
      <div class="field"><label for="nota">Nota para la fábrica <span class="muted">(opcional)</span></label><textarea class="in" id="nota" maxlength="500" placeholder="Horario de entrega, aclaraciones…"></textarea></div>
      <div class="row"><button type="button" class="btn sec" data-close>Seguir agregando</button><button class="btn grow" id="conf">Confirmar pedido</button></div>
    </form>`);
  $('#fp').onsubmit = async e => {
    e.preventDefault();
    $('#conf').disabled = true; $('#conf').textContent = 'Enviando…';
    const items = ls.map(l => ({ producto_id: l.p.id, variante: l.v, cantidad: l.q }));
    const { data, error } = await sb.rpc('apo_crear_pedido', { p_items: items, p_nota: $('#nota').value, p_entrega: $('#ent').value || null });
    if (error) { $('#perr').innerHTML = `<div class="msg bad">${esc(errMsg(error))}</div>`; $('#conf').disabled = false; $('#conf').textContent = 'Confirmar pedido'; return; }
    S.carrito = {}; guardarCarrito();
    const pedido = data;
    sheet(`<div class="done"><div class="check">${svg('ok')}</div><h2>¡Pedido #${esc(pedido.numero)} recibido!</h2>
      <p class="muted">Total ${money(pedido.total)}. Te avisamos los cambios de estado acá, en “Mis pedidos”.</p>
      <div class="list" style="max-width:340px;margin:20px auto 0">
        <button class="btn block" id="rem">${svg('pdf')} Descargar remito (PDF)</button>
        <button class="btn sec block" data-close>Listo</button></div></div>`);
    $('#rem').onclick = () => descargarRemito(pedido.id, $('#rem'));
    S.tab = 'pedidos'; await cargarCliente();
  };
}

function tarjetaPedido(p, conCliente = false) {
  return `<button class="card order" data-p="${p.id}">
    <div class="order-top"><span class="order-num">#${esc(p.numero)}</span><span class="st ${p.estado}">${ESTADOS[p.estado]}</span></div>
    ${conCliente ? `<div><b>${esc(p.cliente_razon_social)}</b> <span class="tipo">· ${TIPO_CORTO[p.tipo]}</span></div>` : ''}
    <div class="order-top"><span class="muted small">${fechaHora(p.creado_en)}${p.entrega_deseada ? ` · para el ${fechaDia(p.entrega_deseada)}` : ''}</span><span class="order-total">${money(p.total)}</span></div>
  </button>`;
}

function vMisPedidos() {
  $('#main').innerHTML = `<div class="section-title"><h2>Mis pedidos</h2><button class="btn sec small" id="rf">${svg('reload')} Actualizar</button></div>
    ${S.pedidos.length ? `<div class="list">${S.pedidos.map(p => tarjetaPedido(p)).join('')}</div>`
      : '<div class="empty">Todavía no hiciste pedidos. Andá a “Hacer pedido” para armar el primero.</div>'}`;
  $('#rf').onclick = cargarCliente;
  $$('[data-p]').forEach(b => b.onclick = () => vDetalle(b.dataset.p));
}

async function vDetalle(id) {
  const p = S.pedidos.find(x => x.id === id);
  sheet(`${sheetHead(`Pedido #${esc(p.numero)}`, fechaHora(p.creado_en))}<div class="loading" style="min-height:120px"><div class="spin"></div></div>`);
  const { data: items } = await sb.from('apo_pedido_items').select('*').eq('pedido_id', id).order('codigo');
  const admin = S.admin;
  sheet(`${sheetHead(`Pedido #${esc(p.numero)}`, `${fechaHora(p.creado_en)}`)}
    ${admin ? `<div class="card" style="margin-bottom:14px"><b>${esc(p.cliente_razon_social)}</b> <span class="tipo">· ${TIPO_CORTO[p.tipo]}</span>
      <div class="muted small">${[p.cliente_cuit && 'CUIT ' + esc(p.cliente_cuit), esc(p.cliente_direccion), esc(p.cliente_telefono)].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</div></div>` : ''}
    <div class="row between" style="margin-bottom:10px"><span class="st ${p.estado}">${ESTADOS[p.estado]}</span>
      ${p.entrega_deseada ? `<span class="small">Entrega pedida: <b>${fechaDia(p.entrega_deseada)}</b></span>` : ''}</div>
    <table class="items"><thead><tr><th>Producto</th><th class="r">Cant.</th><th class="r">Subtotal</th></tr></thead><tbody>
    ${(items || []).map(i => `<tr><td><b>${esc(i.nombre)}</b>${i.variante ? ` · ${esc(i.variante)}` : ''}<div class="muted small">${esc(i.presentacion)} · ${money(i.precio)} c/u</div></td>
      <td class="r num">${i.cantidad}</td><td class="r num">${money(i.subtotal)}</td></tr>`).join('')}
    </tbody><tfoot><tr><td colspan="2">Total</td><td class="r num">${money(p.total)}</td></tr></tfoot></table>
    ${p.nota ? `<div class="msg info section"><b>Nota:</b> ${esc(p.nota)}</div>` : ''}
    ${p.remito_oficial ? `<p class="small muted">Remito oficial N° <b>${esc(p.remito_oficial)}</b></p>` : ''}
    ${admin ? `<form id="fe" class="section card">
      <div class="grid2">
        <div class="field"><label for="es">Estado</label><select class="in" id="es">${Object.entries(ESTADOS).map(([k, t]) => `<option value="${k}" ${k === p.estado ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="field"><label for="ro">N° remito oficial <span class="muted">(opcional)</span></label><input class="in" id="ro" value="${esc(p.remito_oficial)}" placeholder="0001-00001234"></div>
      </div><button class="btn dark block" id="eg">Guardar cambios</button></form>` : ''}
    <div class="row section"><button class="btn block" id="rem">${svg('pdf')} Descargar remito (PDF)</button></div>`);
  $('#rem').onclick = () => descargarRemito(id, $('#rem'));
  if (admin) $('#fe').onsubmit = async e => {
    e.preventDefault(); $('#eg').disabled = true;
    const { error } = await sb.rpc('apo_admin_pedido', { p_pedido: id, p_estado: $('#es').value, p_remito_oficial: $('#ro').value });
    if (error) { toast(errMsg(error)); $('#eg').disabled = false; return; }
    toast('Pedido actualizado'); cerrar(); cargarAdmin();
  };
}

function vMisDatos() {
  const c = S.cliente;
  $('#main').innerHTML = `<div class="section-title"><h2>Mis datos</h2></div>
    <p class="muted small" style="margin-top:-4px">Estos datos salen en el remito. Para cambiar el tipo de cliente, hablá con Apolonia.</p>
    <form id="fd" class="card">
      <div class="field"><label for="rs">Nombre del negocio / razón social</label><input class="in" id="rs" value="${esc(c.razon_social)}"></div>
      <div class="grid2">
        <div class="field"><label for="ct">Persona de contacto</label><input class="in" id="ct" value="${esc(c.contacto)}"></div>
        <div class="field"><label for="tel">Teléfono / WhatsApp</label><input class="in" id="tel" value="${esc(c.telefono)}"></div>
        <div class="field"><label for="cuit">CUIT</label><input class="in" id="cuit" value="${esc(c.cuit)}"></div>
        <div class="field"><label for="dir">Dirección de entrega</label><input class="in" id="dir" value="${esc(c.direccion)}"></div>
      </div>
      <div class="field"><label>${c.email.endsWith(DOMINIO) ? 'Usuario' : 'Email'}</label><input class="in" value="${esc(usuarioDe(c.email))}" disabled></div>
      <button class="btn block" id="dg">Guardar</button></form>
    <div class="section-title"><h2>Contraseña</h2></div>
    <form id="fk" class="card"><div class="field"><label for="k1">Contraseña nueva</label><input class="in" id="k1" type="password" minlength="6" autocomplete="new-password"></div>
      <button class="btn sec block" id="kg">Cambiar contraseña</button></form>`;
  $('#fk').onsubmit = async e => {
    e.preventDefault();
    const pw = $('#k1').value;
    if (pw.length < 6) return toast('Mínimo 6 caracteres');
    $('#kg').disabled = true;
    const { error } = await sb.auth.updateUser({ password: pw });
    $('#kg').disabled = false;
    if (error) return toast(errMsg(error));
    $('#k1').value = ''; toast('Contraseña cambiada');
  };
  $('#fd').onsubmit = async e => {
    e.preventDefault();
    const v = { razon_social: $('#rs').value.trim(), contacto: $('#ct').value.trim(), telefono: $('#tel').value.trim(), cuit: $('#cuit').value.trim(), direccion: $('#dir').value.trim() };
    if (v.razon_social.length < 2) return toast('Poné el nombre de tu negocio');
    $('#dg').disabled = true;
    const { error } = await sb.from('apo_clientes').update(v).eq('user_id', c.user_id);
    $('#dg').disabled = false;
    if (error) return toast(errMsg(error));
    Object.assign(S.cliente, v); toast('Datos guardados'); vCliente();
  };
}

// =====================================================================
// Remito en PDF
// =====================================================================
function cargarScript(src) {
  return new Promise((ok, mal) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar el generador de PDF. Revisá la conexión.'));
    document.head.appendChild(s);
  });
}
let _logo = null;
async function logoDataUrl() {
  if (_logo) return _logo;
  try {
    const b = await (await fetch('/logo.png')).blob();
    _logo = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); });
  } catch { _logo = null; }
  return _logo;
}
async function descargarRemito(id, boton) {
  const txt = boton?.innerHTML;
  if (boton) { boton.disabled = true; boton.textContent = 'Generando…'; }
  try {
    await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
    const [{ data: p, error: e1 }, { data: items, error: e2 }, { data: cfg }] = await Promise.all([
      sb.from('apo_pedidos').select('*').eq('id', id).single(),
      sb.from('apo_pedido_items').select('*').eq('pedido_id', id).order('codigo'),
      sb.from('apo_config').select('*').maybeSingle()
    ]);
    if (e1 || e2) throw (e1 || e2);
    const c = cfg || { razon_social: 'Apolonia · La Fábrica', cuit: '', direccion: '', telefono: '', email: '', leyenda_remito: '' };
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 14;
    const ARS = n => '$ ' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Encabezado
    doc.setFillColor(253, 233, 12); doc.rect(0, 0, W, 34, 'F');
    const logo = await logoDataUrl();
    if (logo) doc.addImage(logo, 'PNG', M, 6, 66, 66 * 271 / 823);
    else { doc.setTextColor(17, 17, 17); doc.setFont('helvetica', 'bold'); doc.setFontSize(24); doc.text('Apolonia', M, 19); }
    doc.setFont('helvetica', 'normal'); doc.setTextColor(17, 17, 17); doc.setFontSize(8.5);
    const emisor = [c.razon_social, c.cuit && 'CUIT ' + c.cuit, c.direccion, [c.telefono, c.email].filter(Boolean).join(' · ')].filter(Boolean);
    doc.text(emisor, W - M, 11, { align: 'right' });

    // Caja del comprobante
    doc.setTextColor(17, 17, 17);
    doc.setDrawColor(17, 17, 17); doc.setLineWidth(0.4);
    doc.rect(W / 2 - 8, 38, 16, 14); doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text('X', W / 2, 48, { align: 'center' });
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.text('NO VÁLIDO COMO FACTURA', W / 2, 56, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text('REMITO', M, 45);
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(`N° ${nro(p.numero)}`, M, 51);
    doc.text(`Fecha: ${fechaCorta(p.creado_en)}`, W - M, 45, { align: 'right' });
    if (p.entrega_deseada) doc.text(`Entrega: ${fechaDia(p.entrega_deseada)}`, W - M, 51, { align: 'right' });
    if (p.remito_oficial) { doc.setFontSize(8.5); doc.text(`Remito oficial: ${p.remito_oficial}`, W - M, 56, { align: 'right' }); }

    // Cliente
    doc.setFillColor(246, 244, 236); doc.roundedRect(M, 61, W - 2 * M, 24, 2, 2, 'F');
    doc.setFontSize(8); doc.setTextColor(106, 103, 94); doc.text('CLIENTE ' + TIPO_CORTO[p.tipo].toUpperCase(), M + 4, 67);
    doc.setTextColor(17, 17, 17); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(p.cliente_razon_social, M + 4, 73);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text([p.cliente_cuit && 'CUIT: ' + p.cliente_cuit, p.cliente_telefono && 'Tel: ' + p.cliente_telefono].filter(Boolean).join('     ') || ' ', M + 4, 78.5);
    doc.text(p.cliente_direccion ? 'Entregar en: ' + p.cliente_direccion : ' ', M + 4, 83, { maxWidth: W - 2 * M - 8 });

    // Detalle
    doc.autoTable({
      startY: 90, margin: { left: M, right: M },
      head: [['Código', 'Producto', 'Presentación', 'Cant.', 'P. unit.', 'Subtotal']],
      body: items.map(i => [i.codigo, i.nombre + (i.variante ? ' · ' + i.variante : ''), i.presentacion, String(i.cantidad), ARS(i.precio), ARS(i.subtotal)]),
      foot: [['', '', '', String(items.reduce((a, i) => a + i.cantidad, 0)), 'TOTAL', ARS(p.total)]],
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.4, lineColor: [224, 220, 205], lineWidth: 0.2, textColor: [17, 17, 17] },
      headStyles: { fillColor: [17, 17, 17], textColor: [253, 233, 12], fontStyle: 'bold' },
      footStyles: { fillColor: [253, 233, 12], textColor: [17, 17, 17], fontStyle: 'bold', fontSize: 10.5 },
      columnStyles: { 0: { cellWidth: 18 }, 3: { halign: 'right', cellWidth: 15 }, 4: { halign: 'right', cellWidth: 26 }, 5: { halign: 'right', cellWidth: 30 } }
    });
    let y = doc.lastAutoTable.finalY + 8;
    if (p.nota) { doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text('Nota:', M, y); doc.setFont('helvetica', 'normal');
      const t = doc.splitTextToSize(p.nota, W - 2 * M - 12); doc.text(t, M + 11, y); y += t.length * 4.5 + 4; }

    // Firma
    if (y > 250) { doc.addPage(); y = 30; }
    y = Math.max(y + 14, 252);
    doc.setDrawColor(117, 104, 90); doc.setLineWidth(0.3);
    doc.line(M, y, M + 70, y); doc.line(W - M - 70, y, W - M, y);
    doc.setFontSize(8.5); doc.setTextColor(117, 104, 90);
    doc.text('Recibí conforme · Firma', M, y + 4.5); doc.text('Aclaración y DNI', W - M - 70, y + 4.5);
    if (c.leyenda_remito) { doc.setFontSize(7.5); doc.text(doc.splitTextToSize(c.leyenda_remito, W - 2 * M), W / 2, 287, { align: 'center' }); }

    const nombre = `Remito-Apolonia-${nro(p.numero)}.pdf`;
    doc.save(nombre);
  } catch (x) { toast(errMsg(x)); }
  finally { if (boton) { boton.disabled = false; boton.innerHTML = txt; } }
}

// =====================================================================
// Panel de Apolonia (dueño)
// =====================================================================
async function cargarAdmin() {
  const [pe, cl, pr, cf, pc] = await Promise.all([
    sb.from('apo_pedidos').select('*').order('creado_en', { ascending: false }).limit(300),
    sb.from('apo_clientes').select('*').order('creado_en', { ascending: false }),
    sb.from('apo_productos').select('*').order('tipo').order('orden'),
    sb.from('apo_config').select('*').maybeSingle(),
    sb.from('apo_precios_cliente').select('*')
  ]);
  S.precios = (pc.data || []).map(x => ({ ...x, precio: Number(x.precio) }));
  S.pedidos = pe.data || []; S.clientes = cl.data || [];
  S.productos = (pr.data || []).map(p => ({ ...p, precio: Number(p.precio) })); S.config = cf.data;
  vAdmin();
}

function vAdmin() {
  const pend = S.clientes.filter(c => c.estado === 'pendiente').length;
  const nuevos = S.pedidos.filter(p => p.estado === 'recibido').length;
  const tabs = [['pedidos', 'Pedidos', nuevos], ['produccion', 'A producir', 0], ['clientes', 'Clientes', pend], ['productos', 'Productos y precios', 0], ['datos', 'Datos del remito', 0]];
  app(`${encabezado('Panel de administración')}
    <nav class="tabs pad" role="tablist">${tabs.map(([k, t, n]) => `<button class="tab" role="tab" data-t="${k}" aria-selected="${S.tab === k}">${t}${n ? `<span class="pill">${n}</span>` : ''}</button>`).join('')}</nav>
    <main class="pad" id="main"></main>`);
  conectarSalir();
  $$('[data-t]').forEach(b => b.onclick = () => { S.tab = b.dataset.t; vAdmin(); });
  ({ pedidos: aPedidos, produccion: aProduccion, clientes: aClientes, productos: aProductos, datos: aDatos })[S.tab]();
}

function aPedidos() {
  const F = { activos: ['recibido', 'en_preparacion', 'enviado'], recibido: ['recibido'], en_preparacion: ['en_preparacion'], enviado: ['enviado'], entregado: ['entregado'], cancelado: ['cancelado'], todos: Object.keys(ESTADOS) };
  const lista = S.pedidos.filter(p => F[S.filtro].includes(p.estado));
  const hoyStr = hoy();
  const deHoy = S.pedidos.filter(p => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(p.creado_en)) === hoyStr && p.estado !== 'cancelado');
  $('#main').innerHTML = `
    <div class="kpis section">
      <div class="kpi"><b>${S.pedidos.filter(p => p.estado === 'recibido').length}</b><span>Nuevos sin preparar</span></div>
      <div class="kpi"><b>${deHoy.length}</b><span>Pedidos de hoy</span></div>
      <div class="kpi"><b>${money(deHoy.reduce((a, p) => a + Number(p.total), 0))}</b><span>Vendido hoy</span></div>
    </div>
    <div class="section-title"><div class="row"><label class="label" for="fl">Mostrar</label>
      <select class="in" id="fl" style="width:auto;min-height:40px;padding:6px 10px">
        <option value="activos">Pendientes de entregar</option>${Object.entries(ESTADOS).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}<option value="todos">Todos</option>
      </select></div><button class="btn sec small" id="rf">${svg('reload')} Actualizar</button></div>
    ${lista.length ? `<div class="list">${lista.map(p => tarjetaPedido(p, true)).join('')}</div>` : '<div class="empty">No hay pedidos en esta lista.</div>'}`;
  $('#fl').value = S.filtro;
  $('#fl').onchange = e => { S.filtro = e.target.value; aPedidos(); };
  $('#rf').onclick = cargarAdmin;
  $$('[data-p]').forEach(b => b.onclick = () => vDetalle(b.dataset.p));
}

async function aProduccion() {
  $('#main').innerHTML = '<div class="loading" style="min-height:200px"><div class="spin"></div></div>';
  const ids = S.pedidos.filter(p => p.estado === 'recibido' || p.estado === 'en_preparacion').map(p => p.id);
  let items = [];
  if (ids.length) { const { data } = await sb.from('apo_pedido_items').select('*').in('pedido_id', ids); items = data || []; }
  const grupo = {};
  for (const i of items) {
    const ped = S.pedidos.find(p => p.id === i.pedido_id);
    const tp = i.tipo || ped.tipo, k = tp + '|' + i.codigo + '|' + i.variante;
    grupo[k] = grupo[k] || { tipo: tp, codigo: i.codigo, nombre: i.nombre, variante: i.variante, unidad: i.unidad, presentacion: i.presentacion, q: 0 };
    grupo[k].q += i.cantidad;
  }
  const filas = Object.values(grupo).sort((a, b) => a.codigo.localeCompare(b.codigo) || a.variante.localeCompare(b.variante));
  const bloque = (tipo, titulo) => {
    const fs = filas.filter(f => f.tipo === tipo);
    if (!fs.length) return '';
    return `<div class="card section"><h3 style="margin-bottom:10px">${titulo}</h3><div class="produce">
      ${fs.map(f => `<span><span class="code">${esc(f.codigo)}</span>${esc(f.nombre)}${f.variante ? ` · <b style="font-family:inherit">${esc(f.variante)}</b>` : ''} <span class="muted small">${esc(f.presentacion)}</span></span><b>${unidades(f.q, f.unidad)}</b>`).join('')}
    </div></div>`;
  };
  $('#main').innerHTML = `<div class="section-title"><h2>A producir</h2><span class="muted small">${ids.length} pedido${ids.length === 1 ? '' : 's'} recibido${ids.length === 1 ? '' : 's'} o en preparación</span></div>
    ${filas.length ? Object.keys(CATALOGO).map(t => bloque(t, CATALOGO[t])).join('') : '<div class="empty">No hay pedidos pendientes de preparar.</div>'}`;
}

function aClientes() {
  const orden = { pendiente: 0, activo: 1, bloqueado: 2 };
  const cs = [...S.clientes].sort((a, b) => orden[a.estado] - orden[b.estado] || a.razon_social.localeCompare(b.razon_social));
  $('#main').innerHTML = `<div class="section-title"><h2>Clientes</h2><button class="btn small" id="nuevo-cli">+ Crear cliente</button></div>
    <p class="muted small" style="margin-top:-4px">Podés crearles usuario y contraseña vos, o que se registren solos en <b>${esc(location.host)}</b> y los habilitás acá.</p>
    ${cs.length ? `<div class="list">${cs.map(c => `<div class="card">
      <div class="row between"><div><b style="font-size:16px">${esc(c.razon_social)}</b> <span class="st ${c.estado}">${c.estado === 'pendiente' ? 'Pendiente de aprobar' : c.estado === 'activo' ? 'Habilitado' : 'Bloqueado'}</span></div></div>
      <div class="muted small" style="margin-top:4px">${[c.contacto, (c.email.endsWith(DOMINIO) ? 'Usuario: ' : '') + usuarioDe(c.email), c.telefono, c.cuit && 'CUIT ' + c.cuit, c.direccion].filter(Boolean).map(esc).join(' · ')}</div>
      <div class="row" style="margin-top:12px">
        <select class="in" data-tipo="${c.user_id}" style="width:auto;min-height:40px;padding:6px 10px" aria-label="Tipo de cliente">
          <option value="restaurante" ${c.tipo === 'restaurante' ? 'selected' : ''}>Restaurante · porciones</option>
          <option value="mayorista" ${c.tipo === 'mayorista' ? 'selected' : ''}>Mayorista · cajas</option>
          <option value="prepizza" ${c.tipo === 'prepizza' ? 'selected' : ''}>Pre pizzas</option></select>
        <span class="small muted">También ve:</span>${Object.keys(CATALOGO).filter(t => t !== c.tipo).map(t => `<label class="switch small"><input type="checkbox" data-extra="${c.user_id}" value="${t}" ${(c.tipos_extra || []).includes(t) ? 'checked' : ''}> ${TIPO_CORTO[t]}</label>`).join('')}
        <button class="btn sec small" data-preciosc="${c.user_id}">Precios${(S.precios || []).some(x => x.cliente_id === c.user_id) ? ' propios' : ''}</button>
        <button class="btn sec small" data-clave="${c.user_id}">Nueva contraseña</button>
        ${c.estado !== 'activo' ? `<button class="btn good small" data-est="activo" data-u="${c.user_id}">${svg('ok')} Habilitar</button>` : ''}
        ${c.estado !== 'bloqueado' ? `<button class="btn sec small" data-est="bloqueado" data-u="${c.user_id}">Bloquear</button>` : ''}
      </div></div>`).join('')}</div>` : '<div class="empty">Todavía no se registró ningún cliente. Pasales el link de la app.</div>'}`;
  const guardar = async (u, tipo, estado) => {
    const { error } = await sb.rpc('apo_admin_cliente', { p_user: u, p_tipo: tipo, p_estado: estado });
    if (error) return toast(errMsg(error));
    const c = S.clientes.find(x => x.user_id === u); Object.assign(c, { tipo, estado });
    toast(estado === 'activo' ? 'Cliente habilitado' : estado === 'bloqueado' ? 'Cliente bloqueado' : 'Guardado'); vAdmin();
  };
  $$('[data-est]').forEach(b => b.onclick = () => guardar(b.dataset.u, $(`[data-tipo="${b.dataset.u}"]`).value, b.dataset.est));
  $('#nuevo-cli').onclick = nuevoCliente;
  $$('[data-clave]').forEach(b => b.onclick = () => nuevaClave(S.clientes.find(x => x.user_id === b.dataset.clave)));
  $$('[data-extra]').forEach(i => i.onchange = async () => {
    const u = i.dataset.extra, tipos = $$(`[data-extra="${u}"]:checked`).map(x => x.value);
    const { error } = await sb.rpc('apo_admin_tipos_extra', { p_user: u, p_tipos: tipos });
    if (error) return toast(errMsg(error));
    S.clientes.find(x => x.user_id === u).tipos_extra = tipos; toast('Catálogos actualizados');
  });
  $$('[data-preciosc]').forEach(b => b.onclick = () => preciosCliente(S.clientes.find(x => x.user_id === b.dataset.preciosc)));
  $$('[data-tipo]').forEach(s => s.onchange = () => { const c = S.clientes.find(x => x.user_id === s.dataset.tipo); guardar(c.user_id, s.value, c.estado); });
}

const claveAzar = () => ['pasta', 'ravioles', 'noquis', 'tallarin', 'pizza', 'muzza', 'harina', 'tomate'][Math.floor(Math.random() * 8)] + (1000 + Math.floor(Math.random() * 9000));

function nuevoCliente() {
  sheet(`${sheetHead('Crear cliente', 'Le creás usuario y contraseña. Queda habilitado para pedir.')}
    <form id="fn"><div id="nerr"></div>
      <div class="field"><label>Tipo de cliente</label>${SEG_TIPOS()}</div>
      <div class="field"><label for="nr">Nombre del cliente</label><input class="in" id="nr" placeholder="Ej: Pentos Ramos"></div>
      <div class="field"><label for="nd">Dirección de entrega</label><input class="in" id="nd"></div>
      <div class="grid2">
        <div class="field"><label for="nu">Usuario</label><input class="in" id="nu" autocapitalize="none" spellcheck="false" placeholder="pentos.ramos"><span class="hint">Letras, números y punto. Sin espacios.</span></div>
        <div class="field"><label for="nk">Contraseña</label><input class="in" id="nk" value="${claveAzar()}"></div>
      </div>
      <button class="btn block" id="ng">Crear cliente</button></form>`);
  $('#nr').oninput = () => { $('#nu').value = $('#nr').value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, ''); };
  $('#fn').onsubmit = async e => {
    e.preventDefault();
    const v = { p_usuario: $('#nu').value.trim().toLowerCase(), p_clave: $('#nk').value.trim(), p_razon_social: $('#nr').value.trim(), p_direccion: $('#nd').value.trim(), p_tipo: $('input[name=tc]:checked').value };
    if (v.p_razon_social.length < 2) { $('#nerr').innerHTML = '<div class="msg bad">Poné el nombre del cliente.</div>'; return; }
    $('#ng').disabled = true;
    const { error } = await sb.rpc('apo_crear_usuario', v);
    if (error) { $('#nerr').innerHTML = `<div class="msg bad">${esc(errMsg(error))}</div>`; $('#ng').disabled = false; return; }
    sheet(`${sheetHead('Cliente creado')}<div class="card"><p style="margin-top:0"><b>${esc(v.p_razon_social)}</b></p>
      <p>Usuario: <b class="num">${esc(v.p_usuario)}</b><br>Contraseña: <b class="num">${esc(v.p_clave)}</b></p>
      <p class="muted small" style="margin-bottom:0">Pasale estos datos y el link de la app: <b>${esc(location.host)}</b></p></div>
      <div class="row section"><button class="btn sec grow" id="cp">Copiar datos</button><button class="btn grow" data-close>Listo</button></div>`);
    $('#cp').onclick = async () => { try { await navigator.clipboard.writeText(`Apolonia · pedidos\n${location.origin}\nUsuario: ${v.p_usuario}\nContraseña: ${v.p_clave}`); toast('Copiado'); } catch { toast('No se pudo copiar'); } };
    cargarAdmin();
  };
}

function nuevaClave(c) {
  sheet(`${sheetHead('Nueva contraseña', esc(c.razon_social))}
    <form id="fk"><div class="field"><label for="kk">Contraseña nueva</label><input class="in" id="kk" value="${claveAzar()}"></div>
    <button class="btn block" id="kg">Guardar</button></form>`);
  $('#fk').onsubmit = async e => {
    e.preventDefault(); $('#kg').disabled = true;
    const k = $('#kk').value.trim();
    const { error } = await sb.rpc('apo_admin_clave', { p_user: c.user_id, p_clave: k });
    if (error) { toast(errMsg(error)); $('#kg').disabled = false; return; }
    sheet(`${sheetHead('Contraseña cambiada')}<div class="card">Usuario: <b class="num">${esc(usuarioDe(c.email))}</b><br>Contraseña nueva: <b class="num">${esc(k)}</b></div>
      <div class="row section"><button class="btn block" data-close>Listo</button></div>`);
  };
}

function preciosCliente(c) {
  const ps = S.productos.filter(p => p.tipo === c.tipo || (c.tipos_extra || []).includes(p.tipo));
  const propio = id => S.precios.find(x => x.cliente_id === c.user_id && x.producto_id === id);
  sheet(`${sheetHead('Precios de ' + esc(c.razon_social), esc(CATALOGO[c.tipo]))}
    <div class="msg info">Si le ponés precio propio a algún producto, este cliente ve <b>solo</b> los productos con precio propio. Si dejás todo vacío, ve los productos generales a precio general.</div>
    <form id="fpc"><div class="list">${ps.map(p => `<div class="card prod ${p.activo ? '' : 'off'}">
      <div><div class="prod-name">${esc(p.nombre)}</div><div class="prod-meta"><span class="code">${esc(p.codigo)}</span>${p.general ? 'General: ' + money(p.precio) : 'Solo con precio propio'}</div></div>
      <div style="text-align:right"><label class="small muted" for="pc-${p.id}">Precio propio</label><br>
        <input class="in price-in" id="pc-${p.id}" data-pp="${p.id}" inputmode="decimal" placeholder="—" value="${propio(p.id) ? propio(p.id).precio : ''}"></div></div>`).join('')}</div>
    <button class="btn block section" id="pcg">Guardar precios</button></form>`);
  $('#fpc').onsubmit = async e => {
    e.preventDefault(); $('#pcg').disabled = true;
    for (const i of $$('[data-pp]')) {
      const raw = i.value.trim(), id = i.dataset.pp;
      const r = raw === '' ? await sb.from('apo_precios_cliente').delete().eq('cliente_id', c.user_id).eq('producto_id', id)
        : await sb.from('apo_precios_cliente').upsert({ cliente_id: c.user_id, producto_id: id, precio: Number(raw.replace(/\./g, '').replace(',', '.')) });
      if (r.error) { toast(errMsg(r.error)); $('#pcg').disabled = false; return; }
    }
    cerrar(); toast('Precios guardados'); cargarAdmin();
  };
}

function aProductos() {
  const bloque = (tipo, titulo) => `<div class="section-title"><h2>${titulo}</h2><button class="btn sec small" data-nuevo="${tipo}">+ Agregar</button></div>
    <div class="list">${S.productos.filter(p => p.tipo === tipo).map(p => `<div class="card prod ${p.activo ? '' : 'off'}">
      <div><div class="prod-name">${esc(p.nombre)}</div><div class="prod-meta"><span class="code">${esc(p.codigo)}</span>${esc(p.presentacion)}${p.variantes?.length ? ' · ' + p.variantes.map(esc).join(' / ') : ''}</div>
        ${(() => { const n = (S.precios || []).filter(x => x.producto_id === p.id).length; return (p.general ? '' : '<div class="small" style="margin-top:4px"><b>Solo clientes con precio propio</b></div>') + (n ? `<div class="small muted">${n} cliente${n === 1 ? '' : 's'} con precio propio</div>` : ''); })()}
        <div class="row" style="margin-top:8px"><label class="switch"><input type="checkbox" data-act="${p.id}" ${p.activo ? 'checked' : ''}> ${p.activo ? 'Visible' : 'Oculto'}</label>
        <button class="link small" data-edit="${p.id}">Editar</button></div></div>
      <div style="text-align:right"><label class="small muted" for="pr-${p.id}">Precio general</label><br>
        <input class="in price-in" id="pr-${p.id}" data-precio="${p.id}" inputmode="decimal" value="${p.precio}"></div>
    </div>`).join('')}</div>`;
  $('#main').innerHTML = `<div class="msg info section">Los cambios de precio valen para los pedidos nuevos. Los pedidos ya hechos mantienen el precio con el que se pidieron.</div>
    ${Object.keys(CATALOGO).map(t => bloque(t, CATALOGO[t])).join('')}`;
  $$('[data-precio]').forEach(i => i.onchange = async () => {
    const v = Number(String(i.value).replace(/\./g, '').replace(',', '.'));
    if (!(v >= 0)) { toast('Precio inválido'); return; }
    const { error } = await sb.from('apo_productos').update({ precio: v, actualizado_en: new Date().toISOString() }).eq('id', i.dataset.precio);
    if (error) return toast(errMsg(error));
    S.productos.find(p => p.id === i.dataset.precio).precio = v; i.value = v; toast('Precio actualizado');
  });
  $$('[data-act]').forEach(i => i.onchange = async () => {
    const { error } = await sb.from('apo_productos').update({ activo: i.checked }).eq('id', i.dataset.act);
    if (error) return toast(errMsg(error));
    S.productos.find(p => p.id === i.dataset.act).activo = i.checked; aProductos();
  });
  $$('[data-edit]').forEach(b => b.onclick = () => editarProducto(S.productos.find(p => p.id === b.dataset.edit)));
  $$('[data-nuevo]').forEach(b => b.onclick = () => {
    const t = b.dataset.nuevo, pref = { mayorista: 'C-', restaurante: 'T-', prepizza: 'P-' }[t];
    const max = Math.max(0, ...S.productos.filter(p => p.codigo.startsWith(pref)).map(p => parseInt(p.codigo.slice(2)) || 0));
    editarProducto({ tipo: t, codigo: pref + String(max + 1).padStart(3, '0'), nombre: '', presentacion: t === 'restaurante' ? 'Porción congelada' : '',
      unidad: { mayorista: 'caja', restaurante: 'porción', prepizza: 'unidad' }[t], variantes: [], precio: '', orden: max + 1, activo: true, general: true });
  });
}

function editarProducto(p) {
  const nuevo = !p.id;
  sheet(`${sheetHead(nuevo ? 'Nuevo producto' : 'Editar producto', CATALOGO[p.tipo])}
    <form id="fx"><div id="xerr"></div>
      <div class="grid2">
        <div class="field"><label for="xc">Código</label><input class="in" id="xc" value="${esc(p.codigo)}"></div>
        <div class="field"><label for="xp">Precio</label><input class="in" id="xp" inputmode="decimal" value="${esc(p.precio)}"></div>
      </div>
      <div class="field"><label for="xn">Nombre</label><input class="in" id="xn" value="${esc(p.nombre)}"></div>
      <div class="grid2">
        <div class="field"><label for="xpr">Presentación</label><input class="in" id="xpr" value="${esc(p.presentacion)}" placeholder="500 gramos, 12 unidades…"></div>
        <div class="field"><label for="xu">Se cuenta por</label><select class="in" id="xu">${['caja', 'porción', 'unidad'].map(u => `<option ${u === p.unidad ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label for="xv">Opciones a elegir <span class="muted">(opcional)</span></label><input class="in" id="xv" value="${esc((p.variantes || []).join(', '))}" placeholder="Ej: Carne, Jamón y queso">
        <span class="hint">Separadas por coma. El cliente elige cuántas quiere de cada una.</span></div>
      <label class="switch" style="margin-bottom:16px"><input type="checkbox" id="xgen" ${p.general !== false ? 'checked' : ''}> Lo ven todos los clientes de este tipo al precio general</label>
      <button class="btn block" id="xg">Guardar</button></form>`);
  $('#fx').onsubmit = async e => {
    e.preventDefault();
    const v = { tipo: p.tipo, codigo: $('#xc').value.trim(), nombre: $('#xn').value.trim(), presentacion: $('#xpr').value.trim(), unidad: $('#xu').value,
      variantes: $('#xv').value.split(',').map(s => s.trim()).filter(Boolean), precio: Number(String($('#xp').value).replace(/\./g, '').replace(',', '.')),
      orden: p.orden, general: $('#xgen').checked, actualizado_en: new Date().toISOString() };
    if (!v.codigo || !v.nombre || !(v.precio >= 0) || $('#xp').value === '') { $('#xerr').innerHTML = '<div class="msg bad">Completá código, nombre y precio.</div>'; return; }
    $('#xg').disabled = true;
    const { error } = nuevo ? await sb.from('apo_productos').insert(v) : await sb.from('apo_productos').update(v).eq('id', p.id);
    if (error) { $('#xerr').innerHTML = `<div class="msg bad">${esc(error.code === '23505' ? 'Ya existe un producto con ese código.' : errMsg(error))}</div>`; $('#xg').disabled = false; return; }
    cerrar(); toast('Producto guardado'); cargarAdmin();
  };
}

function aDatos() {
  const c = S.config || {};
  $('#main').innerHTML = `<div class="section-title"><h2>Datos del remito</h2></div>
    <p class="muted small" style="margin-top:-4px">Así aparece Apolonia en el encabezado de cada remito.</p>
    <form id="fc" class="card">
      <div class="field"><label for="cr">Razón social</label><input class="in" id="cr" value="${esc(c.razon_social)}"></div>
      <div class="grid2">
        <div class="field"><label for="cc">CUIT</label><input class="in" id="cc" value="${esc(c.cuit)}"></div>
        <div class="field"><label for="ct">Teléfono</label><input class="in" id="ct" value="${esc(c.telefono)}"></div>
        <div class="field"><label for="cd">Dirección</label><input class="in" id="cd" value="${esc(c.direccion)}"></div>
        <div class="field"><label for="ce">Email</label><input class="in" id="ce" value="${esc(c.email)}"></div>
      </div>
      <div class="field"><label for="cl">Leyenda al pie</label><textarea class="in" id="cl">${esc(c.leyenda_remito)}</textarea></div>
      <div class="row"><button class="btn grow" id="cg">Guardar</button></div></form>`;
  $('#fc').onsubmit = async e => {
    e.preventDefault(); $('#cg').disabled = true;
    const v = { razon_social: $('#cr').value.trim(), cuit: $('#cc').value.trim(), telefono: $('#ct').value.trim(), direccion: $('#cd').value.trim(),
      email: $('#ce').value.trim(), leyenda_remito: $('#cl').value.trim(), actualizado_en: new Date().toISOString() };
    const { error } = await sb.from('apo_config').update(v).eq('id', 1);
    $('#cg').disabled = false;
    if (error) return toast(errMsg(error));
    S.config = { ...c, ...v }; toast('Datos guardados');
  };
}

// =====================================================================
// Jefe de producción: qué producir y qué despachar. Sin precios ni datos comerciales.
// =====================================================================
const SIGUIENTE = { recibido: ['en_preparacion', 'Empezar a preparar'], en_preparacion: ['enviado', 'Marcar enviado'], enviado: ['entregado', 'Marcar entregado'] };

async function cargarProd() {
  const { data, error } = await sb.rpc('apo_prod_pedidos');
  if (error) { toast(errMsg(error)); S.pedidos = []; } else S.pedidos = data || [];
  vProd();
}

function vProd() {
  const pend = S.pedidos.filter(p => p.estado === 'recibido').length;
  const tabs = [['producir', 'A producir', 0], ['preparar', 'Pedidos', pend]];
  app(`${encabezado('Producción')}
    <nav class="tabs pad" role="tablist">${tabs.map(([k, t, n]) => `<button class="tab" role="tab" data-t="${k}" aria-selected="${S.tab === k}">${t}${n ? `<span class="pill">${n}</span>` : ''}</button>`).join('')}
      <button class="tab" id="rf" style="margin-left:auto">${svg('reload')} Actualizar</button></nav>
    <main class="pad" id="main"></main>`);
  conectarSalir();
  $$('[data-t]').forEach(b => b.onclick = () => { S.tab = b.dataset.t; vProd(); });
  $('#rf').onclick = cargarProd;
  (S.tab === 'producir' ? pProducir : pPedidos)();
}

function pProducir() {
  const activos = S.pedidos.filter(p => p.estado === 'recibido' || p.estado === 'en_preparacion');
  const g = {};
  for (const p of activos) for (const i of p.items || []) {
    const tp = i.tipo || p.tipo, k = tp + '|' + i.codigo + '|' + i.variante;
    g[k] = g[k] || { ...i, tipo: tp, cantidad: 0, pedidos: new Set() };
    g[k].cantidad += i.cantidad; g[k].pedidos.add(p.numero);
  }
  const filas = Object.values(g).sort((a, b) => a.codigo.localeCompare(b.codigo) || a.variante.localeCompare(b.variante));
  const bloque = t => {
    const fs = filas.filter(f => f.tipo === t);
    return fs.length ? `<div class="card section"><h3 style="margin-bottom:12px">${CATALOGO[t]}</h3><div class="produce" style="font-size:16px;gap:10px 12px">
      ${fs.map(f => `<span><b style="font-family:inherit">${esc(f.nombre)}</b>${f.variante ? ` · ${esc(f.variante)}` : ''}<br><span class="muted small">${esc(f.presentacion)} · pedidos ${[...f.pedidos].map(n => '#' + n).join(', ')}</span></span>
        <b style="font-size:18px">${unidades(f.cantidad, f.unidad)}</b>`).join('')}</div></div>` : '';
  };
  $('#main').innerHTML = `<div class="section-title"><h2>A producir</h2><span class="muted small">${activos.length} pedido${activos.length === 1 ? '' : 's'} sin despachar</span></div>
    ${filas.length ? Object.keys(CATALOGO).map(bloque).join('') : '<div class="empty">No hay nada pendiente de producir.</div>'}`;
}

function pPedidos() {
  const orden = { recibido: 0, en_preparacion: 1, enviado: 2, entregado: 3 };
  const ps = [...S.pedidos].sort((a, b) => orden[a.estado] - orden[b.estado] || (a.entrega_deseada || '9999').localeCompare(b.entrega_deseada || '9999') || a.numero - b.numero);
  $('#main').innerHTML = `<div class="section-title"><h2>Pedidos</h2><span class="muted small">Del más urgente al último</span></div>
    ${ps.length ? `<div class="list">${ps.map(p => `<div class="card">
      <div class="order-top"><span><span class="order-num">#${esc(p.numero)}</span> · <b>${esc(p.cliente)}</b> <span class="tipo">${TIPO_CORTO[p.tipo]}</span></span><span class="st ${p.estado}">${ESTADOS[p.estado]}</span></div>
      <div class="muted small" style="margin:4px 0 10px">Pedido ${fechaHora(p.creado_en)}${p.entrega_deseada ? ` · <b style="color:var(--fg)">Entregar el ${fechaDia(p.entrega_deseada)}</b>` : ''}${p.direccion ? ` · ${esc(p.direccion)}` : ''}</div>
      <table class="items"><tbody>${(p.items || []).map(i => `<tr><td>${esc(i.nombre)}${i.variante ? ` · <b>${esc(i.variante)}</b>` : ''} <span class="muted small">${esc(i.presentacion)}</span></td><td class="r num"><b>${unidades(i.cantidad, i.unidad)}</b></td></tr>`).join('')}</tbody></table>
      ${p.nota ? `<div class="msg info" style="margin:10px 0 0"><b>Nota:</b> ${esc(p.nota)}</div>` : ''}
      ${SIGUIENTE[p.estado] ? `<button class="btn ${p.estado === 'recibido' ? '' : 'dark'} block" style="margin-top:12px" data-av="${p.id}" data-est="${SIGUIENTE[p.estado][0]}">${SIGUIENTE[p.estado][1]}</button>` : ''}
    </div>`).join('')}</div>` : '<div class="empty">No hay pedidos pendientes.</div>'}`;
  $$('[data-av]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    const { error } = await sb.rpc('apo_prod_estado', { p_pedido: b.dataset.av, p_estado: b.dataset.est });
    if (error) { toast(errMsg(error)); b.disabled = false; return; }
    toast('Pedido actualizado'); cargarProd();
  });
}

// ---------- Eventos de sesión ----------
sb.auth.onAuthStateChange((ev) => {
  if (ev === 'PASSWORD_RECOVERY') { S.recuperar = true; setTimeout(vNuevaClave, 0); }
});
iniciar();
