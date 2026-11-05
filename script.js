/* =====================================================================
   CARTILLA DIGITAL LOTO · v3 — script.js
   Creada por Mabel Segura Borda · Auxiliar de EHS
   ===================================================================== */
"use strict";

/* ---------------------------------------------------------------------
   1. CONFIGURACIÓN GOOGLE SHEETS
   URL del Web App de Apps Script (termina en /exec). Los resultados de la
   evaluación se envían ahí. Si cambias la implementación, pega la nueva URL.
   --------------------------------------------------------------------- */
const DEFAULT_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwD-2FnLziMlZ2Mc3nHcU6ZH5BDQlXqcAIFZBunrZ_p_wiv4u6gOAAlQj18bBO_VPCvKQ/exec";
const PASS_PCT = 80; // % mínimo para aprobar la autoevaluación

const RECORDS_KEY = "sst_loto_records";
const STATE_KEY = "cartilla_loto_v3";

/* Mapa de imágenes (lo genera el armado; no editar a mano) */
const IMG = {};
const I = (n) => n;

/* ---------------------------------------------------------------------
   2. UTILIDADES, ESTADO Y SONIDO
   --------------------------------------------------------------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  raw(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } },
  setRaw(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};
const getScriptUrl = () => DEFAULT_SCRIPT_URL;

function img(n, alt, attrs = "") {
  const m = IMG[n];
  if (!m) return "";
  return `<img src="${m.src}" width="${m.w}" height="${m.h}" alt="${esc(alt)}" loading="lazy" decoding="async" ${attrs}>`;
}

const state = Object.assign({
  avatar: "👷", name: "", empId: "", area: "", cargo: "", machine: "",
  xp: 0, awarded: {}, medals: {}, done: [], current: 0, startTime: Date.now(),
  flipped: [], scanned: [], ficha: [], accSeen: [], sound: true, projector: false, simErrors: 0
}, store.get(STATE_KEY, {}));
const save = () => store.set(STATE_KEY, state);
/* Se quitó el módulo "Lista de verificación" (antes 7): la evaluación pasa de 8 a 7 */
if (!state.sinLista) {
  const mover = (arr) => (arr || []).filter((k) => k !== 7).map((k) => (k === 8 ? 7 : k));
  state.done = mover(state.done); state.visited = mover(state.visited);
  if (state.current === 7) state.current = 6; else if (state.current === 8) state.current = 7;
  state.sinLista = true; save();
}

let actx = null;
function tone(freq, dur, type = "sine", when = 0, vol = 0.08) {
  if (!state.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, actx.currentTime + when);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + when + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(actx.currentTime + when); o.stop(actx.currentTime + when + dur + 0.02);
  } catch (e) {}
}
const sfx = {
  ok() { tone(660, .12, "triangle"); tone(990, .18, "triangle", .1); },
  bad() { tone(180, .25, "sawtooth", 0, .05); },
  click() { tone(520, .05, "sine", 0, .04); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, .22, "triangle", i * .11)); },
  flip() { tone(400, .08, "sine", 0, .04); tone(600, .08, "sine", .06, .04); }
};

/* ---------------------------------------------------------------------
   3. INSIGNIAS, XP, AVISOS, CONFETI
   --------------------------------------------------------------------- */
const MEDALS = [
  ["reg", "🪪", "Identificado"],
  ["flip", "🃏", "Explorador de energías"],
  ["scan", "🔍", "Cazador de energías"],
  ["locks", "🔒", "Candado correcto"],
  ["acc", "🧰", "Experto en accesorios"],
  ["sim", "⚡", "Energía cero"],
  ["fire", "🔥", "Fuera de la línea de fuego"],
  ["cert", "🏆", "Certificado LOTO"]
];
function toast(msg, ic = "⭐") {
  const t = $("#toast");
  t.innerHTML = `<i>${ic}</i><span>${msg}</span>`;
  t.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("show"), 2300);
}
function award(key, pts, msg) {
  if (state.awarded[key]) return;
  state.awarded[key] = true; state.xp += pts; save(); updateHud();
  const c = $("#hudXpChip"); c.classList.add("bump"); setTimeout(() => c.classList.remove("bump"), 350);
  toast(`+${pts} XP · ${msg}`);
}
const medalQueue = [];
function unlockMedal(key) {
  if (state.medals[key]) return;
  state.medals[key] = true; save(); updateHud();
  const m = MEDALS.find((x) => x[0] === key);
  medalQueue.push(m);
  if (medalQueue.length === 1) showMedal();
}
function showMedal() {
  const m = medalQueue[0]; if (!m) return;
  $("#mpIc").textContent = m[1]; $("#mpName").textContent = m[2];
  $("#medalpop").classList.add("open");
  sfx.win(); confetti();
}
$("#mpOk").addEventListener("click", () => { $("#medalpop").classList.remove("open"); medalQueue.shift(); setTimeout(showMedal, 250); });

function confetti(n = 60) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#0000a0", "#00a1ff", "#ffc629", "#e11d48", "#2a3bdf", "#0ea371"];
  for (let i = 0; i < n; i++) {
    const c = document.createElement("span");
    c.className = "confetti";
    c.style.left = Math.random() * 100 + "vw";
    c.style.background = colors[i % colors.length];
    c.style.animationDelay = Math.random() * .5 + "s";
    c.style.animationDuration = 1.4 + Math.random() * 1.2 + "s";
    c.style.borderRadius = Math.random() > .5 ? "50%" : "3px";
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 3200);
  }
}

/* ---------------------------------------------------------------------
   4. NAVEGACIÓN
   --------------------------------------------------------------------- */
const modules = $$(".module");
const N = modules.length;
function moduleStatus(i) { return state.done.includes(i) ? "done" : ""; }

function buildNav() {
  $("#tabs").innerHTML = modules.map((m, i) => `<button class="tab" type="button" data-go="${i}"><span class="n">${i === 0 ? "★" : i}</span>${m.dataset.title}</button>`).join("");
  $("#drawerList").innerHTML = modules.map((m, i) => `<button class="drawer__item" type="button" data-go="${i}"><span class="ic">${m.dataset.icon}</span><span>${i === 0 ? "" : i + ". "}${m.dataset.title}</span><span class="st"></span></button>`).join("");
  $("#route").innerHTML = modules.slice(1).map((m, k) => {
    const i = k + 1;
    return `<button class="route__card" type="button" data-go="${i}" data-i="${i}"><span class="ic">${m.dataset.icon}</span><span><span class="n">Módulo ${i}</span><h3>${m.dataset.title}</h3><span style="font-size:.82rem;color:var(--muted);font-weight:600">${m.dataset.desc}</span></span><span class="st">Pendiente</span></button>`;
  }).join("");
  $("#medalList").innerHTML = MEDALS.map(([k, ic, name]) => `<span class="medal" data-medal="${k}">${ic} ${name}</span>`).join("");
}

function go(i, opts = {}) {
  requestAnimationFrame(() => typeof fitCert === "function" && fitCert());
  i = Math.max(0, Math.min(N - 1, Number(i)));
  const prev = state.current;
  modules.forEach((m, k) => m.classList.toggle("is-active", k === i));
  state.current = i; state.visited = state.visited || []; if (!state.visited.includes(i)) state.visited.push(i); save();
  closeDrawer();
  updateHud();
  observeReveals(modules[i]);
  if (opts.scroll !== false) window.scrollTo({ top: 0, behavior: prev === i ? "smooth" : "auto" });
  const tab = $$(".tab")[i];
  const tabs = $("#tabs");
  if (tab) tabs.scrollTo({ left: tab.offsetLeft - (tabs.clientWidth - tab.offsetWidth) / 2, behavior: "smooth" });
  if (opts.sound !== false) sfx.click();
}
function completeAndNext() {
  const i = state.current;
  if (!state.done.includes(i)) {
    state.done.push(i); save();
    award("mod-" + i, 15, `Módulo “${modules[i].dataset.title}” completado`);
  }
  if (i < N - 1) go(i + 1); else updateHud();
}
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-go]");
  if (t) { e.preventDefault(); go(t.dataset.go); }
});
$("#footPrev").addEventListener("click", () => go(state.current - 1));
$("#footNext").addEventListener("click", completeAndNext);
$("#bbPrev").addEventListener("click", () => go(state.current - 1));
$("#bbNext").addEventListener("click", completeAndNext);
$("#bbMenu").addEventListener("click", () => { $("#drawer").classList.add("open"); $("#drawer").setAttribute("aria-hidden", "false"); });
function closeDrawer() { $("#drawer").classList.remove("open"); $("#drawer").setAttribute("aria-hidden", "true"); }
$("#drawer").addEventListener("click", (e) => { if (e.target.hasAttribute("data-close")) closeDrawer(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeLightbox(); closePop(); closeDrawer(); return; }
  if (e.target.matches("input, select, textarea")) return;
  if ($(".lightbox.open, .pop.open, .medalpop.open")) return;
  if (e.key === "ArrowRight") go(state.current + 1);
  if (e.key === "ArrowLeft") go(state.current - 1);
});

function updateHud() {
  const i = state.current;
  $("#hudAvatar").textContent = state.avatar;
  $("#hudName").textContent = state.name ? state.name.split(" ")[0] : "Sin registrar";
  $("#hudXP").textContent = state.xp;
  const pct = Math.round((state.done.length / N) * 100);
  $("#hudRing").style.strokeDashoffset = 100.5 * (1 - pct / 100);
  $("#hudPct").textContent = pct + "%";
  $("#bbBar").style.width = pct + "%";
  $$(".tab").forEach((t, k) => { t.classList.toggle("is-active", k === i); t.classList.toggle("is-done", state.done.includes(k) && k !== i); });
  $$(".drawer__item").forEach((t, k) => { t.classList.toggle("is-active", k === i); t.querySelector(".st").textContent = state.done.includes(k) ? "✓" : ""; });
  $$(".route__card").forEach((c) => { const k = +c.dataset.i; const d = state.done.includes(k); c.classList.toggle("done", d); c.querySelector(".st").textContent = d ? "✓ Completado" : "Pendiente"; });
  $$(".medal").forEach((m) => m.classList.toggle("on", !!state.medals[m.dataset.medal]));
  const mc = Object.values(state.medals).filter(Boolean).length;
  $("#statMedals").textContent = `${mc}/${MEDALS.length}`;
  $("#bbNum").textContent = i === 0 ? "Inicio" : `Módulo ${i} de ${N - 1}`;
  $("#bbTitle").textContent = modules[i].dataset.title;
  $("#bbPrev").disabled = i === 0;
  $("#footPrev").disabled = i === 0;
  $("#footPrev").style.visibility = i === 0 ? "hidden" : "visible";
  $("#footMid").textContent = i === 0 ? "Comienza tu ruta" : `Módulo ${i} de ${N - 1} · ${modules[i].dataset.title}`;
  $("#footNext").textContent = i === 0 ? "Empezar →" : i === N - 1 ? "✓ Marcar como completado" : "✓ Completar y seguir →";
}

/* ---------------------------------------------------------------------
   5. REVELADO, VISOR DE IMÁGENES, GALERÍAS
   --------------------------------------------------------------------- */
const io = "IntersectionObserver" in window
  ? new IntersectionObserver((en) => en.forEach((x) => { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } }), { threshold: .06 })
  : null;
function observeReveals(scope) { $$(".reveal:not(.in)", scope).forEach((el) => io ? io.observe(el) : el.classList.add("in")); }
window.addEventListener("beforeprint", () => $$(".reveal").forEach((el) => el.classList.add("in")));

function openLightbox(src, cap) { $("#lbImg").src = src; $("#lbImg").alt = cap || ""; $("#lbCap").textContent = cap || ""; $("#lightbox").classList.add("open"); }
function closeLightbox() { $("#lightbox").classList.remove("open"); $("#lbImg").removeAttribute("src"); }
$("#lbX").addEventListener("click", closeLightbox);
$("#lightbox").addEventListener("click", (e) => { if (e.target.id === "lightbox" || e.target.classList.contains("lightbox__in")) closeLightbox(); });
document.addEventListener("click", (e) => {
  const z = e.target.closest("[data-zoom]");
  if (z) { openLightbox(z.dataset.zoom, z.dataset.cap); return; }
  const im = e.target.closest(".slide img, .photo img, .viewer img, .crop img, .stepview__img img, .acc__photo img");
  if (im) openLightbox(im.currentSrc || im.src, im.alt);
});

const CAP = {
  1: "Quiénes deben aplicar LOTO", 2: "Personal autorizado", 3: "Personal afectado", 4: "Un candado – una vida", 6: "El candado es personal",
  7: "¿Qué energías debo bloquear?", 8: "Los 8 tipos de energía", 9: "Energía eléctrica", 10: "Energía neumática", 11: "Energía hidráulica", 12: "Energía térmica", 13: "Energía potencial o almacenada", 14: "Energía cinética", 15: "Radiación", 16: "Energía química",
  18: "Antes de aplicar LOTO", 20: "Los 3 tipos de materiales LOTO", 21: "Candado y tarjeta = EPP de LOTO", 22: "Código de colores", 23: "¿Cuándo necesito un accesorio?", 24: "Menú de accesorios", 41: "Kit de accesorios",
  56: "Procedimientos específicos", 57: "Las secciones del procedimiento", 66: "Sección 6", 67: "Pasos para bloquear", 68: "Sección 7", 69: "Pasos para desbloquear",
  70: "Excepciones a LOTO", 71: "Ajuste menor: definición", 73: "Regla 2: rutinaria y repetitiva", 75: "Reglas 3 y 4", 76: "Regla 5: línea de fuego", 77: "Línea de fuego", 78: "Resumen de las 5 reglas", 79: "Limpieza: requisitos", 80: "Limpieza: análisis de riesgo", 81: "Previo a la limpieza"
};
function buildSlides() {
  $$("[data-slides]").forEach((box) => {
    box.innerHTML = box.dataset.slides.split(",").map((n) => +n).map((n) => `<button class="slide" type="button">${img(n, "Diapositiva del curso: " + (CAP[n] || "LOTO"))}<span>${CAP[n] || ""}</span></button>`).join("");
  });
}

/* Visor con varias fotos (accesorios y fichas) */
function viewer(frames, id) {
  return `<div class="viewer" id="${id}">${frames.map((f, k) => `<div data-frame="${k}" ${k ? "hidden" : ""}>${img(f[0], f[1])}</div>`).join("")}</div>
  <div class="viewer__nav"><button class="roundbtn" type="button" data-vprev="${id}" aria-label="Anterior" ${frames.length < 2 ? "disabled" : ""}>‹</button>
  <span style="flex:1;text-align:center;font-weight:700;font-size:.85rem;color:var(--text-2)" id="${id}-cap">${frames[0][1]}</span>
  <span class="viewer__dots">${frames.map((_, k) => `<i class="${k ? "" : "on"}"></i>`).join("")}</span>
  <button class="roundbtn" type="button" data-vnext="${id}" aria-label="Siguiente" ${frames.length < 2 ? "disabled" : ""}>›</button></div>`;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-vprev],[data-vnext]"); if (!b) return;
  const id = b.dataset.vprev || b.dataset.vnext, dir = b.dataset.vnext ? 1 : -1;
  const v = document.getElementById(id); const fr = $$("[data-frame]", v);
  let cur = fr.findIndex((f) => !f.hidden); cur = (cur + dir + fr.length) % fr.length;
  fr.forEach((f, k) => (f.hidden = k !== cur));
  const nav = v.nextElementSibling;
  $$(".viewer__dots i", nav).forEach((d, k) => d.classList.toggle("on", k === cur));
  $(`#${id}-cap`).textContent = $("img", fr[cur]).alt;
  sfx.click();
});

/* ---------------------------------------------------------------------
   6. REGISTRO Y TARJETA
   --------------------------------------------------------------------- */
function updateTag() {
  $("#tagName").textContent = $("#inName").value.trim() || "Tu nombre";
  $("#tagEmp").textContent = $("#inEmp").value.trim() || "—";
  $("#tagArea").textContent = $("#inArea").value.trim() || "—";
  $("#tagCargo").textContent = $("#inCargo").value.trim() || "—";
  $("#tagMachine").textContent = $("#inMachine").value.trim() || "—";
  $("#tagDate").textContent = new Date().toLocaleDateString("es-CO");
  $("#tagAv").textContent = state.avatar;
}
["#inName", "#inEmp", "#inArea", "#inCargo", "#inMachine"].forEach((s) => $(s).addEventListener("input", updateTag));
$("#avatars").addEventListener("click", (e) => {
  const b = e.target.closest(".avatar"); if (!b) return;
  $$(".avatar").forEach((a) => a.classList.remove("sel")); b.classList.add("sel");
  state.avatar = b.dataset.av; save(); updateHud(); updateTag(); sfx.click();
});
$("#btnRegister").addEventListener("click", () => {
  const fb = $("#regFb"), name = $("#inName").value.trim(), emp = $("#inEmp").value.trim(), area = $("#inArea").value.trim().replace(/\s+/g, " "), cargo = $("#inCargo").value.trim().replace(/\s+/g, " ");
  const falta = [name.length < 5 && "nombre completo", !emp && "número de empleado", !area && "área", !cargo && "cargo"].filter(Boolean);
  if (falta.length) { fb.className = "fb show bad"; fb.textContent = "Completa: " + falta.join(", ") + "."; sfx.bad(); return; }
  Object.assign(state, { name, empId: emp, area, cargo, machine: $("#inMachine").value.trim() }); save(); updateHud();
  fb.className = "fb show ok"; fb.textContent = `¡Listo, ${name.split(" ")[0]}! Tu registro quedó guardado. Ya puedes empezar.`;
  sfx.ok(); award("reg", 20, "Registro completo"); unlockMedal("reg");
});

/* ---------------------------------------------------------------------
   7. ENERGÍAS: TARJETAS QUE GIRAN
   --------------------------------------------------------------------- */
const ENERGIES = [
  { k: "elec", name: "Eléctrica", desc: "Flujo de corriente eléctrica que alimenta circuitos y motores; puede causar descargas, quemaduras o electrocución.", em: "⚡", c: "#ffc629", where: ["Motores", "Tableros eléctricos de máquina", "Centro de control de motores", "Subestaciones eléctricas"] },
  { k: "neum", name: "Neumática", desc: "Aire o gas comprimido bajo presión utilizado para accionar cilindros, válvulas y sistemas de empaque.", em: "💨", c: "#00a1ff", where: ["Líneas de aire para limpieza y transporte de producto", "Embolsadoras, encartonadoras, máquinas de empaque secundario y de sellado de cajas"] },
  { k: "hidr", name: "Hidráulica", desc: "Fluidos o líquidos a alta presión en tuberías y pistones para mover mecanismos y cargas pesadas.", em: "💧", c: "#2a6bff", where: ["Volteadores de totes o kones, que usan pistones hidráulicos para generar el movimiento", "Montacargas que mueven sus tenazas o sistemas push / pull por medio de mecanismos hidráulicos"] },
  { k: "term", name: "Térmica", desc: "Calor o frío extremo proveniente de equipos, resistencias o vapor, con riesgo de quemaduras severas.", em: "🔥", c: "#ff6b3d", where: ["Estufas, hornos, secadores y equipos de empaque que usan temperatura para derretir pegante"] },
  { k: "pot", name: "Potencial o almacenada", desc: "Energía acumulada por gravedad, resortes comprimidos o tensión mecánica con riesgo de liberación súbita.", em: "🏗️", c: "#8b5cf6", where: ["Tolvas", "Dampers", "Rodillos", "Entre otros"] },
  { k: "cin", name: "Cinética", desc: "Energía de piezas y componentes mecánicos en movimiento o rotación que continúan girando por inercia.", em: "🌀", c: "#0ea371", where: ["Poleas y correas en los compresores de aire y sopladores", "Válvulas rotatorias"], note: "Para controlarla, asegúrate de que el sistema se detenga por completo, aún después de apagarse." },
  { k: "rad", name: "Radiación", desc: "Emisión de ondas o partículas electromagnéticas (soldadura, rayos X o láser) que pueden dañar tejidos y ojos.", em: "☢️", c: "#e11d48", where: ["Emisiones de luz intensas en trabajos de soldadura: estar muy cerca o mirarlas detenidamente puede generar daños irreversibles", "Equipos de inspección a través de rayos X: su mantenimiento y servicio lo ejecutan solo especialistas certificados"] },
  { k: "quim", name: "Química", desc: "Sustancias reactivas, corrosivas o tóxicas que pueden liberar calor, gases peligrosos o provocar lesiones graves.", em: "🧪", c: "#14b8a6", title: "Riesgo a las personas", where: ["Quemaduras", "Intoxicaciones", "Pérdida de conciencia", "Lesiones graves", "Muerte"] }
];
function buildFlips() {
  $("#flipgrid").innerHTML = ENERGIES.map((e, i) => `
    <button class="flip ${state.flipped.includes(i) ? "seen" : ""}" type="button" data-flip="${i}" style="--c:${e.c}" aria-label="Energía ${e.name}: tocar para ver dónde se encuentra">
      <span class="flip__in">
        <span class="flip__f">
          <span class="flip__emoji">${e.em}</span>
          <span class="flip__body">
            <span class="flip__name">${e.name}</span>
            <span class="flip__desc">${e.desc}</span>
          </span>
          <span class="flip__hint">👆 Toca para girar</span>
        </span>
        <span class="flip__b"><h4>${e.title || "En la planta la encontramos en:"}</h4><ul>${e.where.map((w) => `<li>${w}</li>`).join("")}</ul>${e.note ? `<p><b>${e.note}</b></p>` : ""}</span>
      </span>
    </button>`).join("");
  updateFlipCount();
}
function updateFlipCount() {
  const n = state.flipped.length;
  $("#flipCount").textContent = `Descubiertas ${n}/8`;
  $("#flipBar").style.width = (n / 8) * 100 + "%";
}
$("#flipgrid").addEventListener("click", (e) => {
  const f = e.target.closest(".flip"); if (!f) return;
  f.classList.toggle("is-flipped"); sfx.flip();
  const i = +f.dataset.flip;
  if (!state.flipped.includes(i)) {
    state.flipped.push(i); save(); f.classList.add("seen"); updateFlipCount();
    if (state.flipped.length === 8) { award("flip", 30, "¡Descubriste las 8 energías!"); unlockMedal("flip"); }
  }
});

/* ---------------------------------------------------------------------
   8. ESCÁNER DE PLANTA
   --------------------------------------------------------------------- */
const SPOTS = [
  { x: 92, y: 120, label: "Tablero eléctrico de máquina", e: "elec" },
  { x: 245, y: 70, label: "Tolva", e: "pot" },
  { x: 405, y: 190, label: "Horno / secador", e: "term" },
  { x: 580, y: 120, label: "Línea de aire de la embolsadora", e: "neum" },
  { x: 810, y: 285, label: "Volteador de totes con pistones", e: "hidr" },
  { x: 95, y: 360, label: "Productos químicos", e: "quim" }
];
function buildScan() {
  state.scanned = (state.scanned || []).filter((idx) => typeof idx === "number" && idx < SPOTS.length);
  const t = (x, y, s, w = 800, f = "#3b4470") => `<text x="${x}" y="${y}" text-anchor="middle" font-family="Inter, Segoe UI, sans-serif" font-size="${s}" font-weight="${w}" fill="${f}">`;
  $("#scanStage").innerHTML = `
  <svg class="plant" viewBox="0 0 1000 430" role="img" aria-label="Línea de producción con 6 puntos de energía para identificar">
    <rect x="0" y="380" width="1000" height="50" fill="#cfd5ea"/>
    <rect x="160" y="318" width="590" height="18" rx="9" fill="#0000a0"/><line x1="170" y1="327" x2="740" y2="327" stroke="#8a93f5" stroke-width="3" stroke-dasharray="14 10"/>
    <rect x="190" y="336" width="10" height="44" fill="#3b4470"/><rect x="470" y="336" width="10" height="44" fill="#3b4470"/><rect x="720" y="336" width="10" height="44" fill="#3b4470"/>
    <!-- tablero -->
    <rect x="40" y="90" width="104" height="200" rx="12" fill="#fff" stroke="#3b4470" stroke-width="3"/>
    <rect x="56" y="150" width="30" height="50" rx="5" fill="#dfe3ff"/><rect x="98" y="150" width="30" height="50" rx="5" fill="#dfe3ff"/><circle cx="70" cy="240" r="8" fill="#e11d48"/><circle cx="114" cy="240" r="8" fill="#0ea371"/>
    ${t(92, 310, 13)}Tablero</text>
    <!-- tolva -->
    <path d="M190 40 H300 L268 150 H222 Z" fill="#eef0ff" stroke="#3b4470" stroke-width="3"/><rect x="230" y="150" width="30" height="40" fill="#eef0ff" stroke="#3b4470" stroke-width="3"/>
    ${t(245, 30, 13)}Tolva</text>
    <!-- horno -->
    <rect x="330" y="160" width="150" height="150" rx="14" fill="#fff" stroke="#3b4470" stroke-width="3"/><rect x="350" y="190" width="110" height="60" rx="8" fill="#ffe1d6"/>
    ${t(405, 232, 26, 400)}🔥</text>${t(405, 290, 13)}Horno</text>
    <!-- embolsadora + línea de aire -->
    <rect x="520" y="170" width="120" height="140" rx="14" fill="#fff" stroke="#3b4470" stroke-width="3"/>${t(580, 250, 13)}Embolsadora</text>
    <path d="M560 170 V110 H670 V20" fill="none" stroke="#00a1ff" stroke-width="8" stroke-linecap="round"/>${t(620, 100, 12, 700, "#0077c2")}línea de aire</text>
    <!-- volteador -->
    <rect x="760" y="250" width="100" height="70" rx="10" fill="#fff" stroke="#3b4470" stroke-width="3"/><rect x="790" y="230" width="12" height="40" fill="#2a6bff"/>
    ${t(810, 340, 12)}Volteador</text>
    <!-- químicos -->
    <rect x="40" y="330" width="34" height="50" rx="6" fill="#14b8a6"/><rect x="80" y="320" width="34" height="60" rx="6" fill="#0d9488"/><rect x="120" y="335" width="30" height="45" rx="6" fill="#14b8a6"/>
    ${t(95, 405, 12)}Químicos</text>
    ${SPOTS.map((s, i) => {
      const done = state.scanned.includes(i); const en = ENERGIES.find((e) => e.k === s.e);
      return `<g class="hot ${done ? "done" : ""}" data-spot="${i}" tabindex="0" role="button" aria-label="Punto ${i + 1}: ${s.label}">
        <circle class="pulse" cx="${s.x}" cy="${s.y}" r="20" fill="${done ? "#0ea371" : "#e11d48"}"/>
        <circle class="dot" cx="${s.x}" cy="${s.y}" r="20" fill="${done ? "#0ea371" : "#e11d48"}" stroke="#fff" stroke-width="4"/>
        <text x="${s.x}" y="${s.y + 6}" text-anchor="middle" font-size="${done ? 18 : 17}" font-weight="900" fill="#fff" font-family="Inter, sans-serif">${done ? en.em : "?"}</text>
      </g>`;
    }).join("")}
  </svg>`;
  $("#scanCount").textContent = `${state.scanned.length}/${SPOTS.length} identificadas`;
}
let activeSpot = null;
function openSpot(i) {
  activeSpot = i; const s = SPOTS[i];
  $("#popBox").innerHTML = `<h3>📍 ${s.label}</h3><p>¿Qué energía peligrosa hay aquí?</p>
    <div class="opts">${ENERGIES.map((e) => `<button class="opt" type="button" data-en="${e.k}"><span class="em">${e.em}</span>${e.name}</button>`).join("")}</div>
    <div class="fb" id="popFb"></div><div class="btn-row"><button class="btn btn--ghost" type="button" data-closepop>Cerrar</button></div>`;
  $("#pop").classList.add("open"); sfx.click();
}
function closePop() { $("#pop").classList.remove("open"); }
$("#pop").addEventListener("click", (e) => {
  if (e.target.id === "pop" || e.target.hasAttribute("data-closepop")) { closePop(); return; }
  const b = e.target.closest("[data-en]"); if (!b || activeSpot === null) return;
  const s = SPOTS[activeSpot], fb = $("#popFb"), en = ENERGIES.find((x) => x.k === s.e);
  if (b.dataset.en === s.e) {
    b.classList.add("ok"); sfx.ok();
    fb.className = "fb show ok"; fb.innerHTML = `✅ ¡Correcto! <b>${s.label}</b>: energía <b>${en.name}</b>.`;
    if (!state.scanned.includes(activeSpot)) { state.scanned.push(activeSpot); save(); award("scan-" + activeSpot, 10, "Energía identificada"); }
    $("#scanFoot").textContent = `✅ ${s.label} → ${en.name}. ${state.scanned.length < SPOTS.length ? "Sigue con otro punto rojo." : "¡Escaneaste toda la línea!"}`;
    setTimeout(() => { closePop(); buildScan(); if (state.scanned.length >= SPOTS.length) unlockMedal("scan"); }, 900);
  } else {
    b.classList.add("bad"); sfx.bad();
    fb.className = "fb show bad"; fb.textContent = "❌ No es esa. Vuelve a mirar las tarjetas de arriba e intenta otra vez.";
  }
});
$("#scanStage").addEventListener("click", (e) => { const g = e.target.closest("[data-spot]"); if (g) openSpot(+g.dataset.spot); });
$("#scanStage").addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.dataset.spot) { e.preventDefault(); openSpot(+e.target.dataset.spot); } });

/* ---------------------------------------------------------------------
   9. JUEGO DE PREGUNTAS (candados y excepciones)
   --------------------------------------------------------------------- */
function quizGame({ root, counter, questions, options, medal, key }) {
  const body = $(".game__body", root);
  let order = shuffle(questions), idx = 0, hits = 0;
  function render() {
    const q = order[idx];
    $(counter).textContent = `${idx + 1} / ${order.length}`;
    body.innerHTML = `<div class="progressbar" style="margin-bottom:16px"><i style="width:${(idx / order.length) * 100}%"></i></div>
      <div class="scenario">${q.q}</div>
      <div class="opts">${options.map((o) => `<button class="opt" type="button" data-o="${esc(o[0])}"><span class="em">${o[1]}</span>${o[0]}</button>`).join("")}</div>
      <div class="fb"></div><div class="btn-row"><button class="btn btn--primary" type="button" data-next hidden>Siguiente →</button></div>`;
  }
  body.addEventListener("click", (e) => {
    const nx = e.target.closest("[data-next]");
    if (nx) { if (idx < order.length - 1) { idx++; render(); } else finish(); return; }
    const rs = e.target.closest("[data-restart]");
    if (rs) { order = shuffle(questions); idx = 0; hits = 0; render(); return; }
    const b = e.target.closest("[data-o]"); if (!b || body.dataset.lock === "1") return;
    body.dataset.lock = "1";
    const q = order[idx], ok = b.dataset.o === q.a;
    $$(".opt", body).forEach((o) => { if (o.dataset.o === q.a) o.classList.add("ok"); else if (o !== b) o.classList.add("dim"); });
    if (!ok) b.classList.add("bad");
    ok ? sfx.ok() : sfx.bad();
    if (ok) { hits++; award(`${key}-${q.q.slice(0, 30)}`, 10, "¡Correcto!"); }
    const fb = $(".fb", body); fb.className = "fb show " + (ok ? "ok" : "bad");
    fb.innerHTML = (ok ? "✅ <b>¡Correcto!</b> " : "❌ <b>No es correcto.</b> ") + q.why;
    const n = $("[data-next]", body); n.hidden = false; n.textContent = idx < order.length - 1 ? "Siguiente →" : "Ver resultado";
    setTimeout(() => (body.dataset.lock = "0"), 50);
  });
  function finish() {
    const pass = hits >= Math.ceil(order.length * .75);
    $(counter).textContent = `${hits}/${order.length} aciertos`;
    body.innerHTML = `<div style="text-align:center;padding:10px">
      <div style="font-size:3.4rem">${pass ? "🎉" : "💪"}</div>
      <h3 style="font-size:1.4rem;margin:6px 0">${hits} de ${order.length} correctas</h3>
      <p style="color:var(--text-2)">${pass ? "¡Muy bien! Ganaste la insignia." : "Repasa el módulo y vuelve a intentarlo (necesitas 3 de cada 4)."}</p>
      <div class="btn-row" style="justify-content:center"><button class="btn btn--ghost" type="button" data-restart>↺ Jugar otra vez</button></div></div>`;
    if (pass) unlockMedal(medal);
  }
  body.dataset.lock = "0";
  render();
}

quizGame({
  root: $("#gLocks"), counter: "#gLocksCount", medal: "locks", key: "locks",
  options: [["Rojo", "🔴"], ["Azul", "🔵"], ["Amarillo o dorado", "🟡"]],
  questions: [
    { q: "Es tu candado, es de tu propiedad y solo tú lo usas.", a: "Rojo", why: "Candado rojo = propiedad de alguien (individual)." },
    { q: "Hoy no tienes tu candado y te asignan uno de uso individual que no es tuyo.", a: "Azul", why: "Candado azul = de uso individual, pero no pertenece a la persona (préstamo)." },
    { q: "Una máquina quedará fuera de servicio mientras llega un repuesto.", a: "Amarillo o dorado", why: "Amarillo o dorado = para bloquear equipo fuera de servicio." },
    { q: "Un equipo estará en mantenimiento prolongado.", a: "Amarillo o dorado", why: "Amarillo o dorado = mantenimiento prolongado o fuera de servicio." }
  ]
});

quizGame({
  root: $("#gFire"), counter: "#gFireCount", medal: "fire", key: "fire",
  options: [["Excepción: sin LOTO, cumpliendo las reglas", "✅"], ["Debe aplicar LOTO", "🔒"]],
  questions: [
    { q: "Producción normal. Una bolsa se atasca varias veces por turno. <b>Una sola persona</b> activa el <b>micro de seguridad y el paro de emergencia</b> y la retira <b>sin meter la mano en la línea de fuego</b>.", a: "Excepción: sin LOTO, cumpliendo las reglas", why: "Cumple las 5 reglas del ajuste menor." },
    { q: "El mismo atasco, pero lo resuelven <b>dos compañeros</b> al mismo tiempo.", a: "Debe aplicar LOTO", why: "Regla 3: si es más de una persona se debe aplicar el procedimiento de LOTO de la máquina." },
    { q: "En producción normal hay que hacer un <b>pequeño cambio de herramienta</b> que se repite en cada turno. Lo hace <b>una sola persona</b>, con el <b>micro de seguridad y el paro de emergencia</b> activados, y sus manos <b>no cruzan la línea de fuego</b>.", a: "Excepción: sin LOTO, cumpliendo las reglas", why: "Cumple las 5 reglas del ajuste menor: actividad normal, rutinaria y repetitiva (los pequeños cambios de herramientas son un ejemplo del curso), una sola persona, 2 métodos de interrupción y fuera de la línea de fuego." },
    { q: "Atasco en producción normal, una persona, pero <b>solo presiona el paro de emergencia</b>.", a: "Debe aplicar LOTO", why: "Regla 4: deben existir al menos 2 métodos para interrumpir el circuito de control." },
    { q: "Para sacar una caja hay que <b>meter el brazo donde puede ser atrapado</b> por la máquina.", a: "Debe aplicar LOTO", why: "Regla 5: la mano o parte del cuerpo no debe cruzar ni quedar dentro de la línea de fuego." },
    { q: "Limpiar una banda que debe seguir en movimiento: <b>baja velocidad</b>, <b>uso exclusivo de manguera</b> a distancia segura, manos lejos de la banda y <b>análisis de riesgo publicado y entrenado</b>.", a: "Excepción: sin LOTO, cumpliendo las reglas", why: "Cumple los requisitos mandatorios de la limpieza que es excepción de LOTO." },
    { q: "Limpiar la banda en movimiento <b>pasando la mano con un trapo sobre ella</b>.", a: "Debe aplicar LOTO", why: "No se pueden colocar las manos ni ninguna parte del cuerpo sobre la banda o equipo en movimiento: no cumple la excepción." }
  ]
});

/* ---------------------------------------------------------------------
   10. ACCESORIOS
   --------------------------------------------------------------------- */
const ACC = [
  { name: "Cangrejo", sub: "para 6 candados", em: "🦀", use: "Bloquear una energía y poner más de 1 candado.", img: "img/cangrejo.jpg" },
  { name: "Caja de LOTO grupal", sub: "lock box", em: "🧰", use: "Que un grupo pueda bloquear una máquina de forma rápida, eficiente y segura.", img: "img/caja-grupal.jpg" },
  { name: "Válvula de bola", sub: "líneas de aire y tuberías", em: "🟢", use: "Bloquear de manera segura el cierre de una válvula de bola.", img: "img/valvula-aire.jpg" },
  { name: "Válvula de volante", sub: "vapor, agua u otros fluidos", em: "♨️", use: "Impedir la manipulación o apertura de válvulas que regulan la entrada de vapor, agua u otros fluidos a una máquina.", img: "img/valvula-vapor.jpg" },
  { name: "Pastilla o breaker", sub: "uno solo en tablero", em: "🔌", use: "Inmovilizar los breakers de los tableros eléctricos.", img: "img/breaker.jpg" },
  { name: "Extensión eléctrica", sub: "conector tipo extensión", em: "🔋", use: "Evitar que una máquina sea conectada a la corriente eléctrica.", img: "img/extension-electrica.jpg" }
];
let accCur = 0;
function buildAcc() {
  state.accSeen = (state.accSeen || []).filter((idx) => typeof idx === "number" && idx < ACC.length);
  $("#accList").innerHTML = ACC.map((a, i) => `<button class="acc__item ${state.accSeen.includes(i) ? "seen" : ""}" type="button" data-acc="${i}"><span class="em">${a.em}</span><span>${a.name}<br><small style="font-weight:600;opacity:.75">${a.sub}</small></span></button>`).join("");
  showAcc(accCur, false);
}
function showAcc(i, snd = true) {
  accCur = i;
  $$(".acc__item").forEach((b, k) => b.classList.toggle("is-active", k === i));
  if (!state.accSeen.includes(i)) { state.accSeen.push(i); save(); }
  $$(".acc__item")[i].classList.add("seen");
  const a = ACC[i];
  const photoHtml = a.img ? `<div class="acc__photo"><img src="${a.img}" alt="${esc(a.name)}" loading="lazy" onerror="this.parentElement.style.display='none'"></div>` : "";
  $("#accPanel").innerHTML = `<div class="acc__panel-in"><div class="acc__hero"><span class="em">${a.em}</span><div><small style="font-weight:800;color:var(--muted)">Accesorio ${i + 1} de ${ACC.length}</small><h3>${a.name} <span style="font-weight:600;color:var(--muted);font-size:.95rem">· ${a.sub}</span></h3></div></div>
    ${photoHtml}
    <div class="acc__use"><small>Sirve para</small>${a.use}</div>
    <div class="acc__steps"><div class="accart"><span>${a.em}</span><p>Se usa cuando el <b>dispositivo aislador no está diseñado</b> para colocar candado y tarjeta, o cuando se <b>requiere LOTO grupal</b> y la máquina solo acepta un candado y tarjeta.</p></div></div></div>`;
  if (snd) sfx.click();
  if (state.accSeen.length >= ACC.length) award("acc-seen", 20, "Revisaste todos los accesorios");
}
$("#accList").addEventListener("click", (e) => { const b = e.target.closest("[data-acc]"); if (b) showAcc(+b.dataset.acc); });

function matchGame() {
  const L = $("#mLeft"), R = $("#mRight"), fb = $("#mFb");
  let sel = null, matched = 0, errors = 0;
  fb.className = "fb"; $("#gMatchCount").textContent = `0/${ACC.length} parejas`;
  L.innerHTML = shuffle(ACC.map((a, i) => [a, i])).map(([a, i]) => `<button class="opt" type="button" data-i="${i}"><span class="em">${a.em}</span>${a.name}</button>`).join("");
  R.innerHTML = shuffle(ACC.map((a, i) => [a, i])).map(([a, i]) => `<button class="opt" type="button" data-i="${i}" style="font-weight:600">${a.use}</button>`).join("");
  L.onclick = (e) => { const b = e.target.closest(".opt"); if (!b || b.classList.contains("done")) return; $$(".opt", L).forEach((x) => x.classList.remove("sel")); b.classList.add("sel"); sel = b; sfx.click(); };
  R.onclick = (e) => {
    const b = e.target.closest(".opt"); if (!b || b.classList.contains("done")) return;
    if (!sel) { fb.className = "fb show info"; fb.textContent = "👈 Primero toca un accesorio en la columna izquierda."; return; }
    if (sel.dataset.i === b.dataset.i) {
      sel.classList.remove("sel"); sel.classList.add("ok", "done"); b.classList.add("ok", "done"); matched++; sel = null; sfx.ok();
      $("#gMatchCount").textContent = `${matched}/${ACC.length} parejas`;
      fb.className = "fb show ok"; fb.textContent = `✅ ¡Pareja correcta! (${matched}/${ACC.length})`;
      if (matched === ACC.length) { fb.textContent = `🎉 ¡Completaste las ${ACC.length} parejas con ${errors} error(es)!`; award("acc-match", 40, "Accesorios dominados"); unlockMedal("acc"); }
    } else {
      errors++; sfx.bad(); b.classList.add("bad"); setTimeout(() => b.classList.remove("bad"), 450);
      fb.className = "fb show bad"; fb.textContent = "❌ Esa no es su función. Intenta con otra.";
    }
  };
}
$("#mReset").addEventListener("click", matchGame);

/* ---------------------------------------------------------------------
   11. PASO A PASO (VISOR) + IMPRESIÓN
   --------------------------------------------------------------------- */
const STEPS = [
  { v: "Prepara", t: "Ten listos tu <b>candado y tu tarjeta LOTO</b> y los accesorios que necesites. El equipo debe estar <b>parado y sin materiales</b>.", ic: "🧰" },
  { v: "Identifica", t: "Ubica <b>todas las fuentes de energía</b> del equipo y sus <b>puntos de bloqueo</b>, según el procedimiento específico.", ic: "🔎" },
  { v: "Apaga", t: "Detén el equipo con el <b>botón de parada (STOP)</b>.", ic: "🛑" },
  { v: "Desenergiza", t: "Aísla y corta todas las <b>fuentes de energía</b> que alimentan el equipo mediante sus <b>dispositivos de aislamiento</b>.", ic: "⚡" },
  { v: "Candadea", t: "Pon <b>tu candado y tu tarjeta LOTO</b> en <b>cada punto de bloqueo</b>.", ic: "🔒" },
  { v: "Libera", t: "Libera la <b>energía que quedó almacenada</b> y comprueba que el equipo <b>no arranca</b>.", ic: "🔁" },
  { v: "Verifica", t: "Confirma que <b>cada integrante</b> tenga puesto <b>su propio candado y tarjeta</b>.", ic: "👥" }
];
let stepCur = 0;
function stepMedia(s) {
  return `<div class="stepart ${s.warn ? "warn" : ""}"><span>${s.ic}</span></div>`;
}
function buildStepper() {
  $("#timeline").innerHTML = STEPS.map((s, i) => `<button class="tl ${s.warn ? "warn" : ""}" type="button" data-step="${i}"><span class="d">${s.warn ? "?" : i + 1}</span>${s.v}</button>`).join("");
  $("#stepsPrint").innerHTML = STEPS.map((s, i) => `<div class="card" style="display:grid;grid-template-columns:200px 1fr;gap:14px;align-items:center;margin-bottom:8px">${stepMedia(s)}<div><b style="font-size:1.2rem;color:var(--mars)">${i + 1}. ${s.v}</b><p>${s.t}</p></div></div>`).join("");
  showStep(0, false);
}
function showStep(i, snd = true) {
  stepCur = Math.max(0, Math.min(STEPS.length - 1, i));
  const s = STEPS[stepCur];
  $$(".tl").forEach((t, k) => { t.classList.toggle("on", k === stepCur); t.classList.toggle("past", k < stepCur && !STEPS[k].warn); });
  $("#stepview").innerHTML = `<div class="stepview__img">${stepMedia(s)}</div>
    <div class="stepview__body"><div class="stepview__num">Paso ${stepCur + 1} de ${STEPS.length}</div><div class="stepview__verb">${s.v}</div><p class="stepview__text">${s.t}</p>
    <div class="stepview__ctrl"><button class="btn btn--ghost" type="button" data-steppre ${stepCur === 0 ? "disabled" : ""}>← Anterior</button><button class="btn btn--primary" type="button" data-stepnext>${stepCur < STEPS.length - 1 ? "Siguiente paso →" : "Ir al simulador 🕹️"}</button></div></div>`;
  const tl = $$(".tl")[stepCur], tw = $("#timeline");
  tw.scrollTo({ left: tl.offsetLeft - (tw.clientWidth - tl.offsetWidth) / 2, behavior: "smooth" });
  if (snd) sfx.click();
}
$("#stepper").addEventListener("click", (e) => {
  const t = e.target.closest("[data-step]"); if (t) { showStep(+t.dataset.step); return; }
  if (e.target.closest("[data-steppre]")) showStep(stepCur - 1);
  if (e.target.closest("[data-stepnext]")) { if (stepCur < STEPS.length - 1) showStep(stepCur + 1); else $("#gSim").scrollIntoView({ behavior: "smooth", block: "start" }); }
});

/* ---------------------------------------------------------------------
   12. SIMULADOR DE BLOQUEO (BANDA TRANSPORTADORA)
   --------------------------------------------------------------------- */
const SIM = ["Prepara", "Identifica", "Apaga", "Desenergiza", "Candadea", "Libera", "Verifica"];
const SIM_MSG = [
  "Candado y tarjeta listos. La banda está vacía.",
  "Encontraste las dos energías: el interruptor del tablero y la válvula de aire.",
  "Botón STOP presionado: la banda se detuvo.",
  "Bajaste el interruptor y cerraste la válvula de aire.",
  "Tu candado y tu tarjeta quedaron en el interruptor y en la válvula.",
  "Sacaste el aire de la manguera y probaste arrancar: la banda no se movió.",
  "Cada persona tiene su propio candado y tarjeta. ¡Energía cero!"
];
let simPos = 0;
function setGauge(id, txt, cool) { const g = $(id); $("b", g).textContent = txt; g.classList.toggle("cool", cool); g.classList.toggle("hot", !cool); }
function simRender() {
  $("#simSteps").innerHTML = shuffleOnce.map((i) => `<button class="simbtn ${i < simPos ? "done" : ""}" type="button" data-sim="${i}"><span>${SIM[i]}</span><span class="s">${i < simPos ? "✅" : "⏳"}</span></button>`).join("");
  $("#simCount").textContent = `Paso ${simPos}/${SIM.length}`;
  const m = $("#machine");
  m.classList.toggle("stopped", simPos >= 3);
  setGauge("#gMotion", simPos >= 3 ? "Detenida" : "En marcha", simPos >= 3);
  setGauge("#gElec", simPos >= 4 ? "Aislada" : "Presente", simPos >= 4);
  setGauge("#gAir", simPos >= 6 ? "En cero" : simPos >= 4 ? "Cerrada" : "Presente", simPos >= 4);
  const lk = $("#gLocksG"); $("b", lk).textContent = simPos >= 5 ? "2 de 2 puntos" : "0 de 2 puntos"; lk.classList.toggle("cool", simPos >= 5);
  $("#simSwitch").setAttribute("fill", simPos >= 4 ? "#e11d48" : "#0ea371");
  $("#simSwitch").setAttribute("y", simPos >= 4 ? "66" : "58");
  $("#simAirLine").setAttribute("stroke", simPos >= 4 ? "#cfd5ea" : "#00a1ff");
  $("#simStop").setAttribute("fill", simPos >= 3 ? "#e11d48" : "#b9c0dd");
  $("#lk1").classList.toggle("on", simPos >= 5); $("#lk2").classList.toggle("on", simPos >= 5);
  const b = $("#simBadge");
  if (simPos >= 7) { b.className = "badge badge--green"; b.textContent = "✓ ENERGÍA CERO"; }
  else if (simPos >= 3) { b.className = "badge badge--sun"; b.textContent = "◐ EN PROCESO DE BLOQUEO"; }
  else { b.className = "badge badge--red"; b.textContent = "● EQUIPO ENERGIZADO"; }
}
let shuffleOnce = shuffle(SIM.map((_, i) => i));
$("#simSteps").addEventListener("click", (e) => {
  const b = e.target.closest("[data-sim]"); if (!b) return;
  const i = +b.dataset.sim, fb = $("#simFb");
  if (i < simPos) return;
  if (i === simPos) {
    simPos++; sfx.ok(); simRender();
    fb.className = "fb show ok"; fb.innerHTML = `✅ <b>${SIM[i]}:</b> ${SIM_MSG[i]}`;
    if (simPos === SIM.length) { award("sim", 50, "¡Banda en energía cero!"); unlockMedal("sim"); }
  } else {
    state.simErrors++; save(); sfx.bad();
    b.classList.add("bad"); setTimeout(() => b.classList.remove("bad"), 450);
    fb.className = "fb show bad"; fb.innerHTML = `⚠️ <b>${SIM[i]}</b> no es el paso que sigue. Piensa: ¿qué debes hacer antes?`;
  }
});
$("#simReset").addEventListener("click", () => { simPos = 0; shuffleOnce = shuffle(SIM.map((_, i) => i)); $("#simFb").className = "fb"; simRender(); });

/* ---------------------------------------------------------------------
   13. HERRAMIENTA: 5 REGLAS DEL AJUSTE MENOR
   --------------------------------------------------------------------- */
const RULES = [
  { b: "Actividad normal de operación", s: "Deben realizarse durante actividades normales de operación." },
  { b: "Rutinaria y repetitiva", s: "Rutinaria: durante el proceso normal de producción. Repetitiva: repetida de forma regular durante el turno.", ex: "Ej.: desatascar paquetes, cajas o bolsas; pequeños cambios de herramientas." },
  { b: "Una sola persona", s: "El ajuste menor debe ser ejecutado por una sola persona. Si es más de una persona se debe aplicar el procedimiento de LOTO de la máquina." },
  { b: "Al menos 2 métodos de interrupción", s: "Deben existir al menos 2 métodos para interrumpir el circuito de control y así prevenir el arranque inesperado del equipo.", ex: "Ej.: activar micro de seguridad y paro de emergencia." },
  { b: "Fuera de la línea de fuego", s: "La mano o parte del cuerpo expuesta no debe cruzar o quedar dentro de la línea de fuego.", ex: "Ej.: no debe existir el riesgo de ser atrapado, quemado, golpeado o cortado." }
];
const RULE_IMG = [
  `<svg viewBox="0 0 280 180" role="img" aria-label="Línea en producción normal"><rect width="280" height="180" fill="#eef0ff"/><rect x="60" y="22" width="120" height="70" rx="12" fill="#fff" stroke="#0000a0" stroke-width="3"/><text x="120" y="54" text-anchor="middle" font-family="Inter, sans-serif" font-weight="900" font-size="14" fill="#0000a0">LÍNEA</text><text x="120" y="72" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="10" fill="#3b4470">produciendo</text><circle class="rblink" cx="164" cy="36" r="6" fill="#0ea371"/><g class="rspin" style="transform-origin:216px 52px"><circle cx="216" cy="52" r="20" fill="#ffc629" stroke="#0000a0" stroke-width="3" stroke-dasharray="7 5"/><circle cx="216" cy="52" r="6" fill="#0000a0"/></g><rect x="14" y="112" width="252" height="16" rx="8" fill="#dfe3ff"/><line class="rbelt" x1="22" y1="120" x2="258" y2="120" stroke="#0000a0" stroke-width="4" stroke-dasharray="10 8"/><g class="rslide"><rect x="30" y="88" width="28" height="24" rx="4" fill="#c98a3c"/><rect x="100" y="88" width="28" height="24" rx="4" fill="#c98a3c"/><rect x="170" y="88" width="28" height="24" rx="4" fill="#c98a3c"/></g><rect x="50" y="144" width="180" height="24" rx="12" fill="#0ea371"/><text x="140" y="160" text-anchor="middle" font-family="Inter, sans-serif" font-weight="800" font-size="11" fill="#fff">● EN OPERACIÓN NORMAL</text></svg>`,
  `<svg viewBox="0 0 280 180" role="img" aria-label="Paquete atascado que se repite en cada turno"><rect width="280" height="180" fill="#eef0ff"/><rect x="14" y="104" width="190" height="16" rx="8" fill="#dfe3ff"/><line x1="22" y1="112" x2="196" y2="112" stroke="#0000a0" stroke-width="4" stroke-dasharray="10 8"/><rect x="40" y="80" width="28" height="24" rx="4" fill="#c98a3c"/><g class="rshake" style="transform-origin:120px 92px"><rect x="102" y="74" width="36" height="30" rx="5" fill="#c98a3c" transform="rotate(-18 120 89)"/></g><circle cx="138" cy="62" r="11" fill="#ffc629"/><text x="138" y="67" text-anchor="middle" font-family="Inter, sans-serif" font-weight="900" font-size="14" fill="#0b1240">!</text><g class="rspin" style="transform-origin:232px 70px"><path d="M232 44 a26 26 0 1 1 -24 16" fill="none" stroke="#0000a0" stroke-width="5" stroke-linecap="round"/><path d="M200 52 l8 10 l10 -8" fill="none" stroke="#0000a0" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g><circle cx="232" cy="70" r="12" fill="#fff" stroke="#0000a0" stroke-width="2"/><path d="M232 63 v7 h5" stroke="#0000a0" stroke-width="2.5" fill="none" stroke-linecap="round"/><rect x="40" y="140" width="200" height="26" rx="13" fill="#0000a0"/><text x="140" y="157" text-anchor="middle" font-family="Inter, sans-serif" font-weight="800" font-size="11" fill="#fff">↻ Pasa seguido en cada turno</text></svg>`,
  `<svg viewBox="0 0 280 180" role="img" aria-label="Una sola persona hace el ajuste"><rect width="280" height="180" fill="#eef0ff"/><g class="rpop2"><g opacity="1"><circle cx="90" cy="52" r="13" fill="#0000a0"/><path d="M70 104 q0-34 20-34 q20 0 20 34 z" fill="#0000a0"/></g></g><circle cx="112" cy="36" r="13" fill="#0ea371"/><text x="112" y="41" text-anchor="middle" font-family="Inter, sans-serif" font-weight="900" font-size="14" fill="#fff">1</text><text x="90" y="128" text-anchor="middle" font-family="Inter, sans-serif" font-weight="800" font-size="12" fill="#0ea371">✓ Ajuste menor</text><line x1="150" y1="30" x2="150" y2="130" stroke="#cfd5ea" stroke-width="2" stroke-dasharray="4 4"/><g opacity="0.55"><circle cx="196" cy="56" r="13" fill="#8a93b8"/><path d="M176 108 q0-34 20-34 q20 0 20 34 z" fill="#8a93b8"/></g><g opacity="0.55"><circle cx="236" cy="56" r="13" fill="#8a93b8"/><path d="M216 108 q0-34 20-34 q20 0 20 34 z" fill="#8a93b8"/></g><path d="M182 50 l68 60 M250 50 l-68 60" stroke="#e11d48" stroke-width="6" stroke-linecap="round"/><text x="216" y="128" text-anchor="middle" font-family="Inter, sans-serif" font-weight="800" font-size="12" fill="#e11d48">2 o más → LOTO</text><rect x="40" y="144" width="200" height="24" rx="12" fill="#0000a0"/><text x="140" y="160" text-anchor="middle" font-family="Inter, sans-serif" font-weight="800" font-size="11" fill="#fff">Solo una persona en el ajuste</text></svg>`,
  `<svg viewBox="0 0 280 180" role="img" aria-label="Micro de seguridad y paro de emergencia"><rect width="280" height="180" fill="#eef0ff"/><rect x="22" y="24" width="104" height="92" rx="10" fill="#fff" stroke="#0000a0" stroke-width="3"/><g class="rdoor" style="transform-origin:30px 70px"><rect x="30" y="32" width="58" height="76" rx="6" fill="#dfe3ff" stroke="#0000a0" stroke-width="2.5"/><circle cx="80" cy="70" r="3.5" fill="#0000a0"/></g><rect x="96" y="58" width="18" height="24" rx="4" fill="#ffc629" stroke="#0b1240" stroke-width="2"/><rect x="101" y="64" width="8" height="12" rx="2" fill="#0b1240"/><circle cx="30" cy="24" r="13" fill="#0000a0"/><text x="30" y="29" text-anchor="middle" font-family="Inter, sans-serif" font-weight="900" font-size="14" fill="#fff">1</text><text x="74" y="134" text-anchor="middle" font-family="Inter, sans-serif" font-weight="800" font-size="11" fill="#0b1240">Micro de seguridad</text><rect x="164" y="40" width="80" height="76" rx="12" fill="#ffc629" stroke="#0b1240" stroke-width="2.5"/><rect x="194" y="84" width="20" height="16" rx="3" fill="#7a0a22"/><g class="rpress"><ellipse cx="204" cy="78" rx="26" ry="10" fill="#9b0f2e"/><ellipse cx="204" cy="72" rx="26" ry="12" fill="#e11d48"/><ellipse cx="196" cy="68" rx="9" ry="3.5" fill="#ff7a93"/></g><circle cx="164" cy="40" r="13" fill="#0000a0"/><text x="164" y="45" text-anchor="middle" font-family="Inter, sans-serif" font-weight="900" font-size="14" fill="#fff">2</text><text x="204" y="134" text-anchor="middle" font-family="Inter, sans-serif" font-weight="800" font-size="11" fill="#0b1240">Paro de emergencia</text><rect x="40" y="146" width="200" height="24" rx="12" fill="#0000a0"/><text x="140" y="162" text-anchor="middle" font-family="Inter, sans-serif" font-weight="800" font-size="11" fill="#fff">Mínimo 2 formas de detener</text></svg>`,
  `<svg viewBox="0 0 280 180" role="img" aria-label="La mano queda fuera de la línea de fuego"><defs><pattern id="rhatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#ffe1e7"/><line x1="0" y1="0" x2="0" y2="10" stroke="#e11d48" stroke-width="4"/></pattern></defs><rect width="280" height="180" fill="#eef0ff"/><rect x="120" y="18" width="140" height="112" rx="14" fill="url(#rhatch)" stroke="#e11d48" stroke-width="2.5" stroke-dasharray="8 6"/><g class="rspin" style="transform-origin:170px 74px"><circle cx="170" cy="74" r="24" fill="#fff" stroke="#0000a0" stroke-width="3"/><path d="M170 50 v48 M146 74 h48" stroke="#0000a0" stroke-width="3"/></g><g class="rspinr" style="transform-origin:218px 74px"><circle cx="218" cy="74" r="24" fill="#fff" stroke="#0000a0" stroke-width="3"/><path d="M218 50 v48 M194 74 h48" stroke="#0000a0" stroke-width="3"/></g><rect x="140" y="110" width="100" height="17" rx="8" fill="#fff"/><text x="190" y="122.5" text-anchor="middle" font-family="Inter, sans-serif" font-weight="900" font-size="10" fill="#e11d48">ZONA DE PELIGRO</text><line x1="112" y1="14" x2="112" y2="136" stroke="#e11d48" stroke-width="3"/><g class="rhand"><text x="62" y="92" text-anchor="middle" font-size="46">✋</text></g><circle cx="86" cy="40" r="13" fill="#0ea371"/><path d="M80 40 l4 4 l8 -8" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/><rect x="30" y="146" width="220" height="24" rx="12" fill="#0000a0"/><text x="140" y="162" text-anchor="middle" font-family="Inter, sans-serif" font-weight="800" font-size="11" fill="#fff">Tu mano nunca cruza la línea</text></svg>`
];
const ruleOn = RULES.map(() => false);
let ruleSel = -1;
function buildRules() {
  $("#rules").innerHTML = RULES.map((r, i) => `<button class="rule ${ruleOn[i] ? "on" : ""} ${i === ruleSel ? "sel" : ""}" type="button" data-rule="${i}" aria-pressed="${ruleOn[i]}"><span class="tg"></span><span><b>${i + 1}. ${r.b}</b><span>${r.s}</span>${r.ex ? `<small>${r.ex}</small>` : ""}</span></button>`).join("");
  const n = ruleOn.filter(Boolean).length, ok = n === RULES.length, box = $("#ruleResult"), falta = RULES.length - n;
  const pills = `<div class="rpills" aria-hidden="true">${RULES.map((_, i) => `<span class="rpill ${ruleOn[i] ? "on" : ""} ${i === ruleSel ? "sel" : ""}">${ruleOn[i] ? "✓" : i + 1}</span>`).join("")}</div>`;
  const verdict = ok
    ? `<h4>Puede ser ajuste menor</h4><p>Se cumplen las 5 reglas. Hazlo respetándolas todo el tiempo.</p>`
    : `<h4>Aplica LOTO</h4><p>${n === 0 ? "Activa las reglas que se cumplen." : `Falta${falta > 1 ? "n" : ""} ${falta} regla${falta > 1 ? "s" : ""}: todavía no es ajuste menor.`}</p>`;
  box.classList.toggle("ok", ok);
  if (ruleSel < 0) {
    box.innerHTML = `<div class="rshow"><div class="big">🔒</div><div>${verdict}${pills}</div></div>`;
  } else {
    const on = ruleOn[ruleSel];
    box.innerHTML = `<div class="rshow"><div class="rimg ${on ? "" : "off"}">${RULE_IMG[ruleSel]}${on ? "" : `<span class="rimg__x">✗ No se cumple</span>`}</div>
      <div><div class="rcap"><span>Regla ${ruleSel + 1}</span> ${RULES[ruleSel].b} <em class="${on ? "y" : "n"}">${on ? "✓ Se cumple" : "✗ No se cumple"}</em></div>${verdict}${pills}</div></div>`;
  }
  if (ok) award("rules", 20, "Conoces las 5 reglas");
}
$("#rules").addEventListener("click", (e) => { const r = e.target.closest("[data-rule]"); if (!r) return; ruleSel = +r.dataset.rule; ruleOn[ruleSel] = !ruleOn[ruleSel]; sfx.click(); buildRules(); if (ruleOn.every(Boolean)) sfx.ok(); });

/* ---------------------------------------------------------------------
   14. IMPRESIÓN DE LA CONSTANCIA
   --------------------------------------------------------------------- */
function printOnly(cls) {
  $$(".reveal").forEach((el) => el.classList.add("in"));
  document.body.classList.add(cls);
  const done = () => { document.body.classList.remove(cls); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  window.print(); setTimeout(done, 1500);
}
$("#btnPrintCert").addEventListener("click", () => { fitCert(); printOnly("print-cert"); });

/* Certificado: llenar, ajustar al ancho de la pantalla y descargar en PDF */
const CERT_W = 1123, CERT_H = 794;
function fillCert(c) {
  $("#certName").textContent = c.name;
  $("#certId").textContent = [c.empId && "N° de empleado " + c.empId, c.area, c.cargo].filter(Boolean).join("  ·  ") || "Trabajador de planta";
  $("#certScore").textContent = c.pct + "%";
  $("#certDate").textContent = c.date; $("#certFolio").textContent = c.folio; $("#certMachine").textContent = c.machine || "—";
}
function fitCert() {
  const v = $("#certView"), d = $("#certDoc"); if (!v || !d) return;
  const k = Math.min(1, v.clientWidth / CERT_W);
  d.style.transform = `scale(${k})`; v.style.height = CERT_H * k + "px";
}
function showCert() {
  if (!state.cert) return;
  fillCert(state.cert); $("#cert").classList.add("show");
  requestAnimationFrame(fitCert);
}
window.addEventListener("resize", fitCert);
function loadScript(src) {
  return new Promise((ok, bad) => { if ([...document.scripts].some((s) => s.src === src)) return ok(); const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = bad; document.head.appendChild(s); });
}
async function downloadCertPdf() {
  const btn = $("#btnCertPdf"), txt = btn.textContent;
  btn.textContent = "⏳ Generando PDF…"; btn.classList.add("cert__busy");
  const box = document.createElement("div");
  try {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    // copia sin escalar, fuera de la pantalla, para que el PDF salga igual en celular y computador
    box.style.cssText = `position:fixed;left:-20000px;top:0;width:${CERT_W}px;height:${CERT_H}px;`;
    const clone = $("#certDoc").cloneNode(true); clone.removeAttribute("id"); clone.classList.add("is-capture"); clone.style.transform = "none";
    box.appendChild(clone); document.body.appendChild(box);
    await Promise.all([...clone.querySelectorAll("img")].map((im) => im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; })));
    let canvas;
    try { canvas = await html2canvas(clone, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false, scrollX: 0, scrollY: 0, windowWidth: CERT_W, windowHeight: CERT_H }); canvas.toDataURL("image/jpeg"); }
    catch (e) { clone.querySelectorAll("img").forEach((im) => (im.style.visibility = "hidden")); canvas = await html2canvas(clone, { scale: 2, backgroundColor: "#ffffff", logging: false, scrollX: 0, scrollY: 0, windowWidth: CERT_W, windowHeight: CERT_H }); }
    const pdf = new window.jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 297, 210);
    pdf.setProperties({ title: "Certificado LOTO · " + (state.cert ? state.cert.name : ""), author: "Cartilla LOTO · Mabel Segura Borda, Auxiliar de EHS" });
    const nombre = (state.cert ? state.cert.name : "trabajador").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
    pdf.save(`Certificado_LOTO_${nombre || "trabajador"}.pdf`);
    toast("Certificado descargado", "🎓"); sfx.ok();
  } catch (e) {
    toast("No se pudo crear el PDF: usa Imprimir → Guardar como PDF", "⚠️");
    fitCert(); printOnly("print-cert");
  } finally {
    box.remove(); btn.textContent = txt; btn.classList.remove("cert__busy");
  }
}
$("#btnCertPdf").addEventListener("click", downloadCertPdf);

/* ---------------------------------------------------------------------
   15. AUTOEVALUACIÓN (una pregunta a la vez)
   --------------------------------------------------------------------- */
const QUIZ = [
  { q: "¿En cuál de estas situaciones <b>sí</b> debes aplicar LOTO?", o: ["Cambiar una correa rota en un mantenimiento correctivo", "Ajustar una guía en producción, cumpliendo las 5 reglas", "Limpiar con manguera a distancia, con análisis aprobado", "Revisar el tablero de control desde tu puesto de trabajo"], a: 0, e: "El mantenimiento preventivo o correctivo siempre exige LOTO. El ajuste menor que cumple las 5 reglas y la limpieza con manguera a distancia (con análisis de riesgo aprobado) son las excepciones del curso.", short: "Quién aplica LOTO" },
  { q: "Mantenimiento está reparando la embolsadora y tú sigues trabajando en esa misma área, sin intervenirla. ¿En qué grupo estás?", o: ["Personal autorizado", "Personal afectado", "Autorizado y afectado a la vez", "En ninguno de los dos grupos"], a: 1, e: "Eres personal afectado si tu lugar de trabajo está en un área donde se le está dando servicio o mantenimiento a una máquina. Autorizado es quien aplica LOTO en el equipo.", short: "Personal afectado" },
  { q: "Tres técnicos van a intervenir una máquina que tiene <b>2 puntos de bloqueo</b>, sin usar caja grupal. ¿Cuántos candados personales deben quedar puestos?", o: ["2: uno en cada punto de bloqueo", "3: uno por cada técnico", "6: cada técnico en cada punto", "1: el del líder del grupo"], a: 2, e: "Principio básico: cada colaborador involucrado coloca su propio candado y tarjeta en cada punto de bloqueo. 3 técnicos × 2 puntos = 6 candados.", short: "Principio básico" },
  { q: "Olvidaste tu candado y te prestan uno para hacer tu bloqueo. ¿De qué color debe ser?", o: ["Rojo, igual que el tuyo", "Azul, porque es prestado", "Amarillo, porque es temporal", "Cualquiera, si lleva tarjeta"], a: 1, e: "Rojo = propiedad de alguien. Azul = uso individual, pero no pertenece a la persona (préstamo). Amarillo o dorado = mantenimiento prolongado o fuera de servicio.", short: "Candado azul" },
  { q: "Una tolva llena de producto quedó detenida y con la electricidad cortada. ¿Qué energía puede liberarse todavía?", o: ["Cinética, por la inercia", "Neumática, del aire de la línea", "Eléctrica, guardada en el motor", "Potencial o almacenada"], a: 3, e: "En la planta, la energía potencial o almacenada está en tolvas, dampers y rodillos: el producto acumulado puede caer o moverse aunque la máquina esté apagada.", short: "Energía de tolvas" },
  { q: "Cuatro operarios deben bloquear la <b>misma válvula de bola</b>. ¿Qué necesitan?", o: ["Solo el cangrejo, con los 4 candados", "Bloqueo de válvula y el candado del líder", "Bloqueo de válvula, cangrejo y 4 candados", "Bloqueo de válvula y 4 tarjetas sin candado"], a: 2, e: "La válvula de bola necesita su accesorio de bloqueo, y el cangrejo permite poner más de un candado en una energía. El accesorio nunca reemplaza el candado de cada persona.", short: "Accesorio cangrejo" },
  { q: "Ya bloqueaste antes una máquina igual en otra línea. ¿Cómo bloqueas esta?", o: ["Repites los puntos que usaste en la otra", "Sigues el procedimiento específico de esta", "Bloqueas solo el tablero eléctrico principal", "Le preguntas al operador cómo lo hizo antes"], a: 1, e: "Cada equipo tiene su propio procedimiento específico, porque los puntos de bloqueo cambian de máquina a máquina, aunque se parezcan.", short: "Procedimiento específico" },
  { q: "Al desbloquear un equipo, ¿qué paso va <b>justo antes</b> de quitar tu candado y tarjeta?", o: ["Notificar al personal afectado", "Reinstalar guardas y dispositivos", "Revisar que el personal esté seguro", "Retirar las herramientas y los materiales"], a: 2, e: "Orden: Retira, Verifica, Reinstala, Revisa (personal autorizado en posición segura), Desbloquea, Notifica, Energiza y Prueba.", short: "Orden del desbloqueo" },
  { q: "Un atasco que se repite en el turno, en producción normal, lo resolverá <b>una sola persona</b> fuera de la línea de fuego. El equipo <b>solo tiene paro de emergencia</b>. ¿Es ajuste menor?", o: ["Sí: es rutinario y lo hace una persona", "Sí: el paro de emergencia es suficiente", "No: faltan 2 métodos para interrumpir", "No: un atasco nunca es ajuste menor"], a: 2, e: "Regla 4: deben existir al menos 2 métodos para interrumpir el circuito de control (por ejemplo, micro de seguridad y paro de emergencia). Con uno solo, se aplica LOTO.", short: "Reglas del ajuste menor" },
  { q: "Se acaba tu turno, el trabajo no ha terminado y tu candado sigue instalado. ¿Qué es lo correcto?", o: ["Dejarlo y darle la llave a tu relevo", "Dejarlo, con tu nombre en la tarjeta", "No irte de la planta dejándolo puesto", "Dejarlo para que lo quite el otro turno"], a: 2, e: "Nunca te retires de la planta dejando instalados tus candados y etiquetas, y no compartas tu llave. Para personas ausentes existe un procedimiento de excepción.", short: "Candado al final de la jornada" }
];
let qz = null;
function startQuiz() {
  qz = { order: QUIZ.map((x) => ({ ...x, map: shuffle(x.o.map((_, i) => i)) })), i: 0, answers: [] };
  $("#sync").classList.remove("show");
  renderQ();
}
function renderQ() {
  const it = qz.order[qz.i], L = "ABCD";
  $("#quizCard").innerHTML = `<div class="quiz__card">
    <div class="quiz__top"><span>Pregunta ${qz.i + 1} de ${qz.order.length}</span><span>✅ ${qz.answers.filter(Boolean).length} correctas</span></div>
    <div class="progressbar"><i style="width:${(qz.i / qz.order.length) * 100}%"></i></div>
    ${!state.name && qz.i === 0 ? `<div class="alert alert--sun" style="margin:14px 0 0"><span class="alert__ic">!</span><div><b>Aún no te has registrado.</b> Tu resultado llegará al Sheet sin nombre, número de empleado ni área. <a href="#registro" data-go="0" style="color:inherit;font-weight:800">Registrarme primero →</a></div></div>` : ""}
    <div class="quiz__q">${it.q}</div>
    <div class="opts">${it.map.map((oi, k) => `<button class="opt" type="button" data-qo="${oi}"><span class="lt">${L[k]}</span>${it.o[oi]}</button>`).join("")}</div>
    <div class="fb" id="qFb"></div>
    <div class="btn-row" style="justify-content:flex-end"><button class="btn btn--primary" type="button" id="qNext" hidden>${qz.i < qz.order.length - 1 ? "Siguiente pregunta →" : "Ver mi resultado 🏁"}</button></div></div>`;
}
$("#quizCard").addEventListener("click", (e) => {
  if (e.target.closest("#qNext")) { if (qz.i < qz.order.length - 1) { qz.i++; renderQ(); } else finishQuiz(); return; }
  if (e.target.closest("#qStart")) { startQuiz(); return; }
  const b = e.target.closest("[data-qo]"); if (!b || qz.answers.length > qz.i) return;
  const it = qz.order[qz.i], ok = +b.dataset.qo === it.a;
  qz.answers.push(ok);
  $$("[data-qo]").forEach((o) => { if (+o.dataset.qo === it.a) o.classList.add("ok"); else if (o !== b) o.classList.add("dim"); });
  if (!ok) b.classList.add("bad");
  ok ? sfx.ok() : sfx.bad();
  const fb = $("#qFb"); fb.className = "fb show " + (ok ? "ok" : "bad");
  fb.innerHTML = (ok ? "✅ <b>¡Correcto!</b> " : "❌ <b>Incorrecto.</b> ") + it.e;
  $("#qNext").hidden = false;
});
function finishQuiz() {
  const hits = qz.answers.filter(Boolean).length, pct = Math.round((hits / QUIZ.length) * 100), passed = pct >= PASS_PCT;
  const C = 2 * Math.PI * 76;
  $("#quizCard").innerHTML = `<div class="quiz__card result">
    <div class="scorering"><svg viewBox="0 0 180 180"><circle class="bgc" cx="90" cy="90" r="76"/><circle class="fgc" id="scoreArc" cx="90" cy="90" r="76" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg><span>${pct}%</span></div>
    <h3 style="font-size:1.6rem">${passed ? "¡Aprobaste! 🎉" : "Casi lo logras 💪"}</h3>
    <p style="color:var(--text-2)">${hits} de ${QUIZ.length} respuestas correctas. ${passed ? "Abajo está tu constancia." : `Necesitas ${PASS_PCT}% para aprobar. Repasa y vuelve a intentarlo.`}</p>
    <div class="review">${qz.order.map((it, k) => `<div class="${qz.answers[k] ? "k" : "x"}">${qz.answers[k] ? "✅" : "❌"} <span>${it.q}</span></div>`).join("")}</div>
    <div class="btn-row" style="justify-content:center"><button class="btn btn--ghost" type="button" id="qStart">↺ Intentar de nuevo</button></div></div>`;
  requestAnimationFrame(() => setTimeout(() => { $("#scoreArc").style.strokeDashoffset = C * (1 - pct / 100); }, 60));
  award("quiz", passed ? 100 : 20, "Autoevaluación terminada");
  const folio = "LOTO-" + Date.now().toString(36).toUpperCase();
  if (passed) {
    sfx.win(); confetti(90);
    state.cert = { name: state.name || "Trabajador sin registrar", empId: state.empId || "", area: state.area || "", cargo: state.cargo || "", machine: state.machine || "", pct, folio, date: new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" }) };
    save(); showCert();
    setTimeout(() => unlockMedal("cert"), 900);
  } else sfx.bad();
  const now = new Date();
  const medalsN = Object.values(state.medals).filter(Boolean).length + (passed && !state.medals.cert ? 1 : 0);
  const modsTotal = N - 1, modsDone = new Set([...state.done, ...(state.visited || [])].filter((k) => k > 0)).size;
  const juegos = [
    ["Tarjetas de energías", state.flipped.length === 8],
    ["Escáner de planta", state.scanned.length >= SPOTS.length],
    ["¿Qué candado uso?", !!state.medals.locks],
    ["Accesorios", !!state.medals.acc],
    ["Simulador de bloqueo", !!state.medals.sim],
    ["Excepciones", !!state.medals.fire]
  ];
  const jOk = juegos.filter((j) => j[1]).length;
  const ua = navigator.userAgent;
  const payload = {
    "Folio": folio,
    "Fecha": now.toLocaleDateString("es-CO"),
    "Hora": now.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }),
    "Nombre completo": state.name || "Sin registrar",
    "N° de empleado": state.empId || "",
    "Área": state.area || "",
    "Cargo": state.cargo || "",
    "Máquina / línea": state.machine || "",
    "Resultado": passed ? "APROBADO" : "NO APROBADO",
    "Puntaje evaluación (%)": hits / QUIZ.length,
    "Respuestas correctas": hits,
    "Total preguntas": QUIZ.length,
    "Avance de la cartilla (%)": modsDone / modsTotal,
    "Módulos completados": `${modsDone} de ${modsTotal}`,
    "Juegos completados (%)": jOk / juegos.length,
    "Juegos completados": juegos.filter((j) => j[1]).map((j) => j[0]).join(", ") || "Ninguno",
    "Insignias (%)": medalsN / MEDALS.length,
    "Insignias ganadas": `${medalsN} de ${MEDALS.length}`,
    "Energías identificadas (escáner)": `${state.scanned.length} de ${SPOTS.length}`,
    "Simulador de bloqueo": state.medals.sim ? "Completado" : "No completado",
    "Errores en el simulador": state.simErrors,
    "Tiempo en la cartilla (min)": Math.max(1, Math.round((Date.now() - state.startTime) / 60000)),
    "Puntos XP": state.xp,
    ...Object.fromEntries(QUIZ.map((q, k) => [`P${k + 1} · ${q.short}`, qz.answers[k] ? "Correcta" : "Incorrecta"])),
    "Dispositivo": /Mobi|Android|iPhone/i.test(ua) ? "Celular" : "Computador",
    "Cartilla": "Cartilla LOTO · Mabel Segura Borda, Auxiliar de EHS"
  };

  state.lastPayload = payload; save();
  const list = store.get(RECORDS_KEY, []); list.push(payload); store.set(RECORDS_KEY, list);
  sendToSheet(payload);
}

/* ---------------------------------------------------------------------
   16. GOOGLE SHEETS
   --------------------------------------------------------------------- */
function setSync(t, m) { $("#sync").classList.add("show"); $("#syncT").textContent = t; $("#syncM").textContent = m; }
async function sendToSheet(p) {
  if (typeof google !== "undefined" && google.script && google.script.run) {
    setSync("⏳ Guardando en Google Sheets…", "Conectando con Apps Script…");
    google.script.run.withSuccessHandler((r) => setSync("✅ Registro guardado en Google Sheets", `Folio ${p["Folio"] || p.folio}${r && (r.fila || r.row) ? " · fila " + (r.fila || r.row) : ""}.`))
      .withFailureHandler((err) => setSync("⚠️ No se pudo guardar", String(err))).registrarCapacitacionLOTO(p);
    return;
  }
  const url = getScriptUrl();
  if (!url) { setSync("ℹ️ Guardado solo en este equipo", "No hay URL del Google Sheet configurada."); return; }
  setSync("⏳ Enviando a Google Sheets…", `Folio ${p["Folio"] || p.folio} de ${p["Nombre completo"] || p.nombre}`);
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(p) });
    let d = null; try { d = await r.json(); } catch (_) {}
    if (d && d.ok === false) { setSync("⚠️ El Sheet respondió con un error", `${d.error || "Error desconocido"} · Copia este mensaje y revisa el Apps Script.`); return; }
    if (!d) { setSync("⚠️ Enviado, pero el Sheet no confirmó", "Revisa que el Web App esté publicado con acceso “Cualquier persona” (Anyone) y como nueva versión."); return; }
    if (d.repetido) { setSync("✅ Ya estaba guardado en Google Sheets", `Folio ${p["Folio"] || p.folio} · fila ${d.fila}. No se creó una fila repetida.`); return; }
    setSync("✅ Registro guardado en Google Sheets", `Folio ${p["Folio"] || p.folio}${d.fila || d.row ? " guardado en la fila " + (d.fila || d.row) : ""}.`);
  } catch (err) {
    // No se reenvía: si el envío llegó pero Google no dejó leer la respuesta, reenviar crearía una fila repetida.
    setSync("📨 Enviado (sin confirmación)", `Folio ${p["Folio"] || p.folio}. Revisa el Sheet; si no aparece, usa “Reenviar al Sheet”.`);
  }
}
$("#btnResend").addEventListener("click", async (e) => { if (!state.lastPayload || e.currentTarget.disabled) return; const b = e.currentTarget; b.disabled = true; try { await sendToSheet(state.lastPayload); } finally { b.disabled = false; } });
$("#btnCsv").addEventListener("click", () => {
  const list = store.get(RECORDS_KEY, []); if (!list.length) { toast("Aún no hay registros en este equipo", "ℹ️"); return; }
  const cols = Object.keys(list[list.length - 1]); const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = "﻿" + [cols.join(";"), ...list.map((r) => cols.map((c) => q(r[c])).join(";"))].join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = "registros_cartilla_loto.csv";
  document.body.appendChild(a); a.click(); a.remove();
});

/* ---------------------------------------------------------------------
   17. SONIDO Y PROYECCIÓN
   --------------------------------------------------------------------- */
function applyPrefs() {
  $("#btnSound").textContent = state.sound ? "🔊" : "🔇";
  $("#btnSound").classList.toggle("on", false);
  document.body.classList.toggle("projector", !!state.projector);
  $("#btnProjector").classList.toggle("on", !!state.projector);
}
$("#btnSound").addEventListener("click", () => { state.sound = !state.sound; save(); applyPrefs(); sfx.click(); toast(state.sound ? "Sonido activado" : "Sonido silenciado", state.sound ? "🔊" : "🔇"); });
$("#btnProjector").addEventListener("click", () => { state.projector = !state.projector; save(); applyPrefs(); toast(state.projector ? "Modo proyección: letra grande" : "Vista normal", "📽️"); });

/* ---------------------------------------------------------------------
   18. INICIO
   --------------------------------------------------------------------- */
buildNav(); buildSlides(); buildFlips(); buildScan(); buildAcc(); matchGame(); buildStepper(); simRender(); buildRules(); startQuiz();
$("#inName").value = state.name; $("#inArea").value = state.area || ""; $("#inEmp").value = state.empId || ""; $("#inCargo").value = state.cargo || ""; $("#inMachine").value = state.machine;
$$(".avatar").forEach((a) => a.classList.toggle("sel", a.dataset.av === state.avatar));
updateTag(); applyPrefs();
go(state.current || 0, { scroll: false, sound: false });
showCert();
observeReveals(document);
