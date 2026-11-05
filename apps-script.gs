/**
 * ============================================================================
 *  CARTILLA LOTO · Registro de capacitación en Google Sheets
 *  Cartilla creada por Mabel Segura Borda · Auxiliar de EHS
 * ============================================================================
 *  CÓMO USARLO (una sola vez):
 *   1. Pega este código en Extensiones → Apps Script de tu Google Sheet.
 *   2. Guarda y ejecuta la función  configurar  (▶ Run). Acepta los permisos.
 *      → Crea la hoja "Registro de capacitación" y la hoja "Resumen".
 *   3. Deploy → Manage deployments → ✏️ → Version: New version → Deploy.
 *      (Who has access: Anyone). La URL /exec no cambia.
 * ============================================================================
 */

// Nombre del archivo de Google Sheets (déjalo "" para no cambiarlo)
const NOMBRE_ARCHIVO = "Entrenamiento LOTO 2026 · Registro de capacitación";
const HOJA_REGISTRO = "Registro de capacitación";
const HOJA_RESUMEN = "Resumen";
const PUNTAJE_MINIMO = 0.8; // 80 % para aprobar

const PREGUNTAS = ["Quién aplica LOTO", "Personal afectado", "Principio básico", "Candado azul", "Energía de tolvas", "Accesorio cangrejo", "Procedimiento específico", "Orden del desbloqueo", "Reglas del ajuste menor", "Candado al final de la jornada"];

// Columnas en el orden en que se muestran (deben coincidir con lo que envía la cartilla)
const COLUMNAS = [
  "Folio", "Fecha", "Hora", "Nombre completo", "N° de empleado", "Área", "Cargo", "Máquina / línea",
  "Resultado", "Puntaje evaluación (%)", "Respuestas correctas", "Total preguntas",
  "Avance de la cartilla (%)", "Módulos completados", "Juegos completados (%)", "Juegos completados",
  "Insignias (%)", "Insignias ganadas", "Energías identificadas (escáner)", "Simulador de bloqueo", "Errores en el simulador",
  "Tiempo en la cartilla (min)", "Puntos XP"
].concat(PREGUNTAS.map((p, i) => "P" + (i + 1) + " · " + p)).concat(["Dispositivo", "Cartilla"]);

const COLS_PORCENTAJE = ["Puntaje evaluación (%)", "Avance de la cartilla (%)", "Juegos completados (%)", "Insignias (%)"];
const COLS_TEXTO = ["N° de empleado", "Folio"];
const AZUL = "#0000a0", AZUL_CLARO = "#eef0ff", VERDE = "#d9f5e8", VERDE_T = "#06603e", ROJO = "#fde2e7", ROJO_T = "#8f0c2b";

/* ------------------------------------------------------------------------ */

function libro_() {
  let ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
  const props = PropertiesService.getScriptProperties();
  if (!ss) {
    const id = props.getProperty("SHEET_ID");
    if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) {} }
    if (!ss) { ss = SpreadsheetApp.create(NOMBRE_ARCHIVO || "Registro Cartilla LOTO"); }
  }
  props.setProperty("SHEET_ID", ss.getId());
  return ss;
}

const letra_ = (n) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const col_ = (nombre) => letra_(COLUMNAS.indexOf(nombre) + 1);

/** Crea o repara la hoja de registro con encabezados y formatos */
function hojaRegistro_(ss) {
  let sh = ss.getSheetByName(HOJA_REGISTRO);
  if (!sh) sh = ss.insertSheet(HOJA_REGISTRO, 0);
  const actual = sh.getLastColumn() > 0 ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
  if (actual.join("|") !== COLUMNAS.join("|")) {
    sh.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS]);
  }
  const head = sh.getRange(1, 1, 1, COLUMNAS.length);
  head.setFontWeight("bold").setFontColor("#ffffff").setBackground(AZUL).setWrap(true)
      .setVerticalAlignment("middle").setHorizontalAlignment("center").setFontSize(10);
  sh.setRowHeight(1, 46);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(4);
  const filas = Math.max(sh.getMaxRows() - 1, 999);

  COLS_TEXTO.forEach((c) => sh.getRange(2, COLUMNAS.indexOf(c) + 1, filas, 1).setNumberFormat("@"));
  COLS_PORCENTAJE.forEach((c) => sh.getRange(2, COLUMNAS.indexOf(c) + 1, filas, 1).setNumberFormat("0%").setHorizontalAlignment("center"));
  sh.getRange(2, COLUMNAS.indexOf("Fecha") + 1, filas, 1).setNumberFormat("dd/mm/yyyy");
  sh.getRange(2, COLUMNAS.indexOf("Hora") + 1, filas, 1).setNumberFormat("hh:mm");

  const anchos = { "Folio": 120, "Fecha": 90, "Hora": 60, "Nombre completo": 220, "N° de empleado": 100, "Área": 160, "Cargo": 160, "Máquina / línea": 140, "Resultado": 115, "Juegos completados": 280, "Cartilla": 260 };
  COLUMNAS.forEach((c, i) => sh.setColumnWidth(i + 1, anchos[c] || (c.indexOf("P") === 0 && c.indexOf(" · ") > 0 ? 130 : 105)));

  // Formato condicional
  const reglas = [];
  const rRes = sh.getRange(col_("Resultado") + "2:" + col_("Resultado"));
  reglas.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("APROBADO").setBackground(VERDE).setFontColor(VERDE_T).setBold(true).setRanges([rRes]).build());
  reglas.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("NO APROBADO").setBackground(ROJO).setFontColor(ROJO_T).setBold(true).setRanges([rRes]).build());
  const p1 = COLUMNAS.indexOf("P1 · " + PREGUNTAS[0]) + 1;
  const rP = sh.getRange(2, p1, filas, PREGUNTAS.length);
  reglas.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Correcta").setBackground(VERDE).setFontColor(VERDE_T).setRanges([rP]).build());
  reglas.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Incorrecta").setBackground(ROJO).setFontColor(ROJO_T).setRanges([rP]).build());
  COLS_PORCENTAJE.forEach((c) => {
    const r = sh.getRange(col_(c) + "2:" + col_(c));
    reglas.push(SpreadsheetApp.newConditionalFormatRule().setGradientMinpointWithValue("#fde2e7", SpreadsheetApp.InterpolationType.NUMBER, "0")
      .setGradientMidpointWithValue("#fff6d6", SpreadsheetApp.InterpolationType.NUMBER, "0.6")
      .setGradientMaxpointWithValue("#d9f5e8", SpreadsheetApp.InterpolationType.NUMBER, "1").setRanges([r]).build());
  });
  sh.setConditionalFormatRules(reglas);

  if (sh.getFilter()) sh.getFilter().remove();
  sh.getRange(1, 1, sh.getMaxRows(), COLUMNAS.length).createFilter();
  return sh;
}

/** Crea la hoja Resumen con indicadores que se actualizan solos */
function hojaResumen_(ss) {
  let sh = ss.getSheetByName(HOJA_RESUMEN);
  if (!sh) sh = ss.insertSheet(HOJA_RESUMEN, 0);
  else { sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart(); sh.clear(); sh.clearConditionalFormatRules(); }
  sh.setHiddenGridlines(true);
  const R = "'" + HOJA_REGISTRO + "'!";
  const rango = (c) => R + col_(c) + "2:" + col_(c);
  const AREA = rango("Área"), CARGO = rango("Cargo"), RES = rango("Resultado"), PUN = rango("Puntaje evaluación (%)"), AV = rango("Avance de la cartilla (%)");

  sh.setColumnWidths(1, 1, 260); sh.setColumnWidths(2, 6, 130);
  sh.getRange("A1").setValue("📊 RESUMEN · CARTILLA LOTO").setFontSize(18).setFontWeight("bold").setFontColor(AZUL);
  sh.getRange("A2").setValue("Bloqueo y etiquetado de energías peligrosas · Cartilla creada por Mabel Segura Borda, Auxiliar de EHS").setFontColor("#6b7399");
  sh.getRange("A3").setFormula('="Actualizado: "&TEXT(NOW(),"dd/mm/yyyy hh:mm")').setFontColor("#6b7399");

  // Indicadores generales
  const kpis = [
    ["Evaluaciones recibidas", "=COUNTA(" + rango("Folio") + ")", "0"],
    ["Personas evaluadas (N° de empleado únicos)", "=IFERROR(COUNTUNIQUE(" + rango("N° de empleado") + "),0)", "0"],
    ["Aprobados", '=COUNTIF(' + RES + ',"APROBADO")', "0"],
    ["No aprobados", '=COUNTIF(' + RES + ',"NO APROBADO")', "0"],
    ["% de aprobación", "=IFERROR(B8/B6,0)", "0%"],
    ["Puntaje promedio en la evaluación", "=IFERROR(AVERAGE(" + PUN + "),0)", "0%"],
    ["Avance promedio de la cartilla", "=IFERROR(AVERAGE(" + AV + "),0)", "0%"],
    ["Juegos completados (promedio)", "=IFERROR(AVERAGE(" + rango("Juegos completados (%)") + "),0)", "0%"],
    ["Insignias ganadas (promedio)", "=IFERROR(AVERAGE(" + rango("Insignias (%)") + "),0)", "0%"],
    ["Tiempo promedio en la cartilla (min)", "=IFERROR(AVERAGE(" + rango("Tiempo en la cartilla (min)") + "),0)", "0"],
    ["Completaron el simulador de bloqueo", '=IFERROR(COUNTIF(' + rango("Simulador de bloqueo") + ',"Completado")/B6,0)', "0%"]
  ];
  titulo_(sh, 5, "INDICADORES GENERALES", 2);
  kpis.forEach((k, i) => {
    const r = 6 + i;
    sh.getRange(r, 1).setValue(k[0]).setFontWeight("bold");
    sh.getRange(r, 2).setFormula(k[1]).setNumberFormat(k[2]).setFontWeight("bold").setFontSize(12).setHorizontalAlignment("center").setFontColor(AZUL);
    sh.getRange(r, 1, 1, 2).setBackground(i % 2 ? "#ffffff" : AZUL_CLARO);
  });
  const fin = 6 + kpis.length;

  // Por área y por cargo: son respuestas abiertas, cada área o cargo nuevo aparece solo en la tabla
  let fila = fin + 2;
  fila = tablaAbierta_(sh, fila, "RESULTADOS POR ÁREA", "Área", 30, AREA, RES, PUN, AV);
  fila = tablaAbierta_(sh, fila + 1, "RESULTADOS POR CARGO", "Cargo", 40, CARGO, RES, PUN, AV);

  // Por pregunta
  fila += 1;
  titulo_(sh, fila, "ACIERTOS POR PREGUNTA (las más bajas son temas a reforzar)", 3);
  encabezado_(sh, fila + 1, ["Pregunta", "% de aciertos", "Respuestas"]);
  PREGUNTAS.forEach((p, i) => {
    const r = fila + 2 + i, c = rango("P" + (i + 1) + " · " + p);
    sh.getRange(r, 1).setValue("P" + (i + 1) + " · " + p);
    sh.getRange(r, 2).setFormula('=IFERROR(COUNTIF(' + c + ',"Correcta")/COUNTA(' + c + '),0)').setNumberFormat("0%").setHorizontalAlignment("center");
    sh.getRange(r, 3).setFormula("=COUNTA(" + c + ")").setHorizontalAlignment("center");
  });
  const rp = sh.getRange(fila + 2, 2, PREGUNTAS.length, 1);
  fila = fila + 2 + PREGUNTAS.length;

  // Personas por reforzar
  fila += 1;
  titulo_(sh, fila, "PERSONAS POR REFORZAR (no aprobaron)", 5);
  encabezado_(sh, fila + 1, ["Nombre completo", "N° de empleado", "Área", "Cargo", "Puntaje"]);
  sh.getRange(fila + 2, 1).setFormula('=IFERROR(FILTER({' + rango("Nombre completo") + ',' + rango("N° de empleado") + ',' + AREA + ',' + CARGO + ',' + PUN + '},' + RES + '="NO APROBADO"),"✅ Nadie pendiente")');
  sh.getRange(fila + 2, 5, 300, 1).setNumberFormat("0%");

  // Colores de los porcentajes
  const reglas = [];
  const pct = [sh.getRange("B10:B14"), sh.getRange("B16"), rp];
  pct.forEach((r) => reglas.push(SpreadsheetApp.newConditionalFormatRule().setGradientMinpointWithValue("#fde2e7", SpreadsheetApp.InterpolationType.NUMBER, "0")
    .setGradientMidpointWithValue("#fff6d6", SpreadsheetApp.InterpolationType.NUMBER, "0.6")
    .setGradientMaxpointWithValue("#d9f5e8", SpreadsheetApp.InterpolationType.NUMBER, "1").setRanges([r]).build()));
  sh.setConditionalFormatRules(sh.getConditionalFormatRules().concat(reglas));
  sh.setFrozenRows(3);
  return sh;
}

function titulo_(sh, fila, texto, ancho) {
  sh.getRange(fila, 1, 1, ancho).merge().setValue(texto).setBackground(AZUL).setFontColor("#ffffff").setFontWeight("bold").setFontSize(11);
  sh.setRowHeight(fila, 28);
}
function encabezado_(sh, fila, cols) {
  sh.getRange(fila, 1, 1, cols.length).setValues([cols]).setFontWeight("bold").setBackground("#dfe3ff").setFontColor(AZUL).setHorizontalAlignment("center");
}
/** Tabla para respuestas abiertas: lista los valores distintos que van llegando */
function tablaAbierta_(sh, fila, titulo, nombre, filas, COL, RES, PUN, AV) {
  titulo_(sh, fila, titulo, 6);
  encabezado_(sh, fila + 1, [nombre, "Evaluados", "Aprobados", "% aprobación", "Puntaje promedio", "Avance cartilla"]);
  const ini = fila + 2;
  // Lista sin repetir: "operario" y "Operario" cuentan como el mismo cargo
  const lista = 'SORT(UNIQUE(LOWER(TRIM(FILTER(' + COL + ',' + COL + '<>"")))))';
  sh.getRange(ini, 1).setFormula('=IFERROR(ARRAYFORMULA(UPPER(LEFT(' + lista + ',1))&MID(' + lista + ',2,200)),"Aún sin registros")');
  for (let i = 0; i < filas; i++) {
    const r = ini + i, A = "$A" + r, vacio = 'IF(OR(' + A + '="",' + A + '="Aún sin registros"),"",';
    sh.getRange(r, 2).setFormula("=" + vacio + "COUNTIF(" + COL + "," + A + "))");
    sh.getRange(r, 3).setFormula("=" + vacio + "COUNTIFS(" + COL + "," + A + "," + RES + ',"APROBADO"))');
    sh.getRange(r, 4).setFormula("=" + vacio + "IFERROR(C" + r + "/B" + r + ",0))");
    sh.getRange(r, 5).setFormula("=" + vacio + "IFERROR(AVERAGEIF(" + COL + "," + A + "," + PUN + "),0))");
    sh.getRange(r, 6).setFormula("=" + vacio + "IFERROR(AVERAGEIF(" + COL + "," + A + "," + AV + "),0))");
    sh.getRange(r, 1, 1, 6).setBackground(i % 2 ? "#ffffff" : AZUL_CLARO);
  }
  sh.getRange(ini, 4, filas, 3).setNumberFormat("0%");
  sh.getRange(ini, 2, filas, 5).setHorizontalAlignment("center");
  const r = sh.getRange(ini, 4, filas, 3);
  sh.setConditionalFormatRules(sh.getConditionalFormatRules().concat([
    SpreadsheetApp.newConditionalFormatRule().setGradientMinpointWithValue("#fde2e7", SpreadsheetApp.InterpolationType.NUMBER, "0")
      .setGradientMidpointWithValue("#fff6d6", SpreadsheetApp.InterpolationType.NUMBER, "0.6")
      .setGradientMaxpointWithValue("#d9f5e8", SpreadsheetApp.InterpolationType.NUMBER, "1").setRanges([r]).build()]));
  return ini + filas;
}

/* ------------------------------------------------------------------------ */

/** Guarda una evaluación como fila nueva */
function guardar_(datos) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = libro_();
    let sh = ss.getSheetByName(HOJA_REGISTRO);
    if (!sh) { sh = hojaRegistro_(ss); hojaResumen_(ss); }
    // Si este folio ya está guardado (reenvío o doble envío), no se repite la fila
    const folio = String(datos["Folio"] || "");
    if (folio && sh.getLastRow() > 1) {
      const cF = COLUMNAS.indexOf("Folio") + 1;
      const hit = sh.getRange(2, cF, sh.getLastRow() - 1, 1).createTextFinder(folio).matchEntireCell(true).findNext();
      if (hit) return { ok: true, fila: hit.getRow(), repetido: true };
    }
    const ahora = new Date();
    const fila = COLUMNAS.map((c) => {
      if (c === "Fecha") return ahora;
      if (c === "Hora") return ahora;
      let v = datos[c];
      // Preguntas: si cambia el texto corto de una pregunta, igual se ubica por su número (P1, P2…)
      const m = c.match(/^P(\d+) · /);
      if (v === undefined && m) { const k = Object.keys(datos).find((x) => x.indexOf("P" + m[1] + " · ") === 0); if (k) v = datos[k]; }
      if ((c === "Área" || c === "Cargo") && typeof v === "string") { v = v.trim().replace(/\s+/g, " "); v = v.charAt(0).toUpperCase() + v.slice(1); }
      return v === undefined || v === null ? "" : v;
    });
    sh.appendRow(fila);
    return { ok: true, fila: sh.getLastRow() };
  } finally {
    lock.releaseLock();
  }
}

/** La cartilla envía aquí cada evaluación */
function doPost(e) {
  let res;
  try {
    let datos = {};
    if (e && e.postData && e.postData.contents) datos = JSON.parse(e.postData.contents);
    else if (e && e.parameter) datos = e.parameter;
    res = guardar_(datos);
  } catch (err) {
    res = { ok: false, error: String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput("Cartilla LOTO: servicio activo ✅");
}

// Compatibilidad si la cartilla se abre dentro de Apps Script
function registrarCapacitacionLOTO(datos) { return guardar_(datos); }

/** ▶️ EJECUTA ESTA UNA VEZ: crea/organiza las hojas y da permisos */
function configurar() {
  const ss = libro_();
  if (NOMBRE_ARCHIVO) ss.rename(NOMBRE_ARCHIVO);
  hojaRegistro_(ss);
  hojaResumen_(ss);
  ss.setActiveSheet(ss.getSheetByName(HOJA_RESUMEN));
  Logger.log("✅ Listo: " + ss.getUrl());
}

/** Opcional: agrega una fila de ejemplo para ver cómo queda */
function agregarFilaDePrueba() {
  const d = { "Folio": "PRUEBA", "Nombre completo": "PRUEBA DE CONEXIÓN", "N° de empleado": "00000", "Área": "Producción", "Cargo": "Operario",
    "Máquina / línea": "Línea 2", "Resultado": "APROBADO", "Puntaje evaluación (%)": 0.9, "Respuestas correctas": 9, "Total preguntas": 10,
    "Avance de la cartilla (%)": 1, "Módulos completados": "7 de 7", "Juegos completados (%)": 1, "Juegos completados": "Todos", "Insignias (%)": 1,
    "Insignias ganadas": "8 de 8", "Energías identificadas (escáner)": "6 de 6", "Simulador de bloqueo": "Completado", "Errores en el simulador": 0,
    "Tiempo en la cartilla (min)": 35, "Puntos XP": 560, "Dispositivo": "Computador", "Cartilla": "Cartilla LOTO · Mabel Segura Borda, Auxiliar de EHS" };
  PREGUNTAS.forEach((p, i) => d["P" + (i + 1) + " · " + p] = i === 3 ? "Incorrecta" : "Correcta");
  Logger.log(guardar_(d));
}
