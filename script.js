"use strict";

const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };

class Fr {
  constructor(n, d = 1n) {
    if (d === 0n) throw new Error("El denominador no puede ser cero.");
    if (d < 0n) { n = -n; d = -d; }        
    const g = gcd(n, d) || 1n;         
    this.n = n / g; this.d = d / g;
  }
  add(o) { return new Fr(this.n * o.d + o.n * this.d, this.d * o.d); }
  mul(o) { return new Fr(this.n * o.n, this.d * o.d); }
  toString() { return this.d === 1n ? `${this.n}` : `${this.n}/${this.d}`; }
  html() {
    if (this.d === 1n) return `<span>${this.n}</span>`;
    const neg = this.n < 0n, a = neg ? -this.n : this.n;
    return `<span class="frac">${neg ? "−" : ""}<span class="fr"><span>${a}</span><span>${this.d}</span></span></span>`;
  }
}

function parseValue(text) {
  const t = String(text).trim().replace(",", ".");
  if (t === "") throw new Error("campo vacío");
  let m = t.match(/^([+-]?\d+)\s*\/\s*([+-]?\d+)$/);
  if (m) {
    if (BigInt(m[2]) === 0n) throw new Error("denominador cero");
    return new Fr(BigInt(m[1]), BigInt(m[2]));
  }
  m = t.match(/^([+-]?)(\d*)\.?(\d*)$/);   
  if (m && (m[2] || m[3])) {
    let n = BigInt((m[2] || "0") + m[3]);
    if (m[1] === "-") n = -n;
    return new Fr(n, 10n ** BigInt(m[3].length));
  }
  throw new Error("no es un número válido");
}

const sumAll = (list) => list.reduce((acc, x) => acc.add(x), new Fr(0n));

function transpose(M) {
  return M[0].map((_, j) => M.map(row => row[j]));
}

function diagCoords(M, kind) {
  const r = M.length, c = M[0].length, k = Math.min(r, c), out = [];
  for (let i = 0; i < k; i++) out.push([i, kind === "main" ? i : c - 1 - i]);
  return out;
}

function addMatrices(A, B) {
  if (A.length !== B.length || A[0].length !== B[0].length)
    throw new Error(`No se pueden sumar: A es ${A.length}×${A[0].length} y B es ${B.length}×${B[0].length}. Deben tener las mismas dimensiones.`);
  return A.map((row, i) => row.map((v, j) => v.add(B[i][j])));
}

function mulMatrices(A, B) {
  if (A[0].length !== B.length)
    throw new Error(`No se pueden multiplicar: A tiene ${A[0].length} columnas y B tiene ${B.length} filas. Deben coincidir.`);
  const steps = [];
  const C = A.map((row, i) => B[0].map((_, j) => {
    const terms = row.map((a, k) => a.mul(B[k][j]));
    const val = sumAll(terms);
    steps.push(`c<sub>${i + 1}${j + 1}</sub> = ` + row.map((a, k) => `(${a})·(${B[k][j]})`).join(" + ") + ` = ${val}`);
    return val;
  }));
  return { C, steps };
}

function renderMatrix(M, highlight = []) {
  const hl = new Set(highlight.map(([i, j]) => `${i},${j}`));
  const cols = M[0].length;
  const cells = M.map((row, i) => row.map((v, j) =>
    `<div class="item${hl.has(`${i},${j}`) ? " hl" : ""}">${v.html()}</div>`).join("")).join("");
  return `<div class="scroll"><div class="matrix" style="grid-template-columns:repeat(${cols},auto)">${cells}</div></div>`;
}

function initUI() {
  const $ = (id) => document.getElementById(id);
  const MAX = 10;

  function buildGrid(id) {
    const r = clampDim($("rows" + id)), c = clampDim($("cols" + id)), grid = $("grid" + id);
    const old = {};
    grid.querySelectorAll("input").forEach(inp => old[inp.dataset.p] = inp.value);
    grid.style.gridTemplateColumns = `repeat(${c}, auto)`;
    grid.innerHTML = "";
    for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) {
      const inp = document.createElement("input");
      inp.className = "cell"; inp.type = "text"; inp.inputMode = "text";
      inp.dataset.p = `${i},${j}`; inp.value = old[inp.dataset.p] || "";
      inp.setAttribute("aria-label", `${id} fila ${i + 1} columna ${j + 1}`);
      grid.appendChild(inp);
    }
  }
  function clampDim(el) {
    let v = parseInt(el.value, 10);
    if (!(v >= 1)) v = 1; if (v > MAX) v = MAX;
    el.value = v; return v;
  }

  function readMatrix(id) {
    const r = clampDim($("rows" + id)), c = clampDim($("cols" + id)), errs = [];
    const M = Array.from({ length: r }, () => Array(c));
    $("grid" + id).querySelectorAll("input").forEach(inp => {
      const [i, j] = inp.dataset.p.split(",").map(Number);
      try { M[i][j] = parseValue(inp.value); inp.classList.remove("invalid"); }
      catch (e) { inp.classList.add("invalid"); errs.push(`Matriz ${id}, fila ${i + 1}, columna ${j + 1}: ${e.message}.`); }
    });
    return { M, errs };
  }

  const showError = (msgs) => $("result").innerHTML = [].concat(msgs).map(m => `<p class="error">${m}</p>`).join("");
  const isBinary = () => ["add", "mul"].includes($("op").value);
  const isDiag = () => ["main", "sec"].includes($("op").value);

  function updateOptions() {
    $("cardB").hidden = !isBinary();
    $("optSum").hidden = !isDiag();
    $("optSteps").hidden = $("op").value !== "mul";
  }

  function calculate() {
    const op = $("op").value;
    const A = readMatrix("A"), B = isBinary() ? readMatrix("B") : { M: null, errs: [] };
    const errs = [...A.errs, ...B.errs];
    if (errs.length) return showError(["Corrige los campos marcados en rojo:", ...errs]);

    try {
      let html = `<div class="block"><h3>Matriz original A</h3>${renderMatrix(A.M)}</div>`;
      if (op === "transpose") {
        html += `<div class="block"><h3>Transpuesta Aᵀ (${A.M[0].length}×${A.M.length})</h3>${renderMatrix(transpose(A.M))}</div>`;
      } else if (isDiag()) {
        const coords = diagCoords(A.M, op), vals = coords.map(([i, j]) => A.M[i][j]);
        html = `<div class="block"><h3>Matriz A con la diagonal ${op === "main" ? "principal" : "secundaria"} resaltada</h3>${renderMatrix(A.M, coords)}</div>`;
        html += `<div class="block"><h3>Elementos de la diagonal</h3>${renderMatrix([vals])}</div>`;
        if ($("showSum").checked) html += `<div class="block"><h3>Suma de la diagonal</h3><div class="item">${sumAll(vals).html()}</div></div>`;
        if (A.M.length !== A.M[0].length) html += `<p class="muted">Matriz rectangular: se toman min(filas, columnas) = ${vals.length} elementos.</p>`;
      } else if (op === "add") {
        html += `<div class="block"><h3>Matriz B</h3>${renderMatrix(B.M)}</div>`;
        html += `<div class="block"><h3>Resultado A + B</h3>${renderMatrix(addMatrices(A.M, B.M))}</div>`;
      } else if (op === "mul") {
        const { C, steps } = mulMatrices(A.M, B.M);
        html += `<div class="block"><h3>Matriz B</h3>${renderMatrix(B.M)}</div>`;
        html += `<div class="block"><h3>Resultado A × B (${C.length}×${C[0].length})</h3>${renderMatrix(C)}</div>`;
        if ($("showSteps").checked) html += `<div class="block"><h3>Procedimiento</h3><div class="steps">${steps.map(s => `<div>${s}</div>`).join("")}</div></div>`;
      }
      $("result").innerHTML = html;
    } catch (e) { showError(e.message); }
  }

  function randomInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
  function randomValue() {
    if (Math.random() < 0.25) return `${randomInt(-9, 9) || 1}/${randomInt(2, 9)}`;
    return String(randomInt(-9, 9));
  }
  function fillRandom() {
    const ids = isBinary() ? ["A", "B"] : ["A"];
    ids.forEach(id => $("grid" + id).querySelectorAll("input").forEach(inp => {
      inp.value = randomValue(); inp.classList.remove("invalid");
    }));
    $("result").innerHTML = `<p class="muted">Campos llenados al azar. Pulsa «Calcular».</p>`;
  }

  function clearFields() {
    document.querySelectorAll(".cell").forEach(c => { c.value = ""; c.classList.remove("invalid"); });
    $("result").innerHTML = `<p class="muted">Campos limpiados.</p>`;
  }
  function resetAll() {
    ["rowsA", "colsA", "rowsB", "colsB"].forEach(id => $(id).value = 2);
    $("op").value = "transpose"; $("showSum").checked = false; $("showSteps").checked = false;
    buildGrid("A"); buildGrid("B"); clearFields(); updateOptions();
    $("result").innerHTML = `<p class="muted">Introduce tus matrices y pulsa «Calcular».</p>`;
  }

  ["rowsA", "colsA"].forEach(id => $(id).addEventListener("input", () => buildGrid("A")));
  ["rowsB", "colsB"].forEach(id => $(id).addEventListener("input", () => buildGrid("B")));
  $("op").addEventListener("change", updateOptions);

  ["showSum", "showSteps"].forEach(id => $(id).addEventListener("change", () => {
    if ($("result").querySelector(".block")) calculate();
  }));
  $("calc").addEventListener("click", calculate);
  $("random").addEventListener("click", fillRandom);
  $("clear").addEventListener("click", clearFields);
  $("reset").addEventListener("click", resetAll);
  buildGrid("A"); buildGrid("B"); updateOptions();
}

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", initUI);
if (typeof module !== "undefined") module.exports = { Fr, parseValue, transpose, diagCoords, addMatrices, mulMatrices, sumAll };