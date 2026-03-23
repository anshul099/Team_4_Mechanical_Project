/**
 * main.js — BeamSolve Frontend Logic
 * ====================================
 * Handles:
 *   - Load row add / remove
 *   - API call to Flask backend  (POST /api/solve)
 *   - Beam schematic canvas drawing
 *   - SFD & BMD Chart.js rendering
 *   - Results table population
 *   - Status bar & error display
 */

"use strict";

// ─────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────
const API_URL = "/api/solve";

// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────
let loadCounter = 0;

// ─────────────────────────────────────────────
//  INITIALISE
// ─────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  addLoad(3, 20);
  addLoad(7, 15);
  setStatus("ready", "Ready — configure beam and click Analyze");
});

// ─────────────────────────────────────────────
//  ADD / REMOVE POINT LOADS
// ─────────────────────────────────────────────

/**
 * Append a new load row to the loads container.
 * @param {number|string} pos  - default position value
 * @param {number|string} mag  - default magnitude value
 */
function addLoad(pos = "", mag = "") {
  loadCounter++;
  const id = loadCounter;
  const container = document.getElementById("loadsContainer");
  const row = document.createElement("div");
  row.className = "load-row";
  row.id = `loadRow-${id}`;
  row.innerHTML = `
    <input type="number" id="pos-${id}" value="${pos}"
           placeholder="0.0" min="0" step="0.1" aria-label="Load position">
    <input type="number" id="load-${id}" value="${mag}"
           placeholder="kN" step="0.1" aria-label="Load magnitude">
    <button class="btn-remove" onclick="removeLoad(${id})"
            title="Remove load" aria-label="Remove load">×</button>
  `;
  container.appendChild(row);
}

/**
 * Remove a load row by its counter id.
 * @param {number} id
 */
function removeLoad(id) {
  const row = document.getElementById(`loadRow-${id}`);
  if (row) row.remove();
}

// ─────────────────────────────────────────────
//  COLLECT FORM DATA
// ─────────────────────────────────────────────

/**
 * Read all load rows and return a clean array.
 * @returns {{ position: number, magnitude: number }[]}
 */
function collectLoads() {
  const rows = document.querySelectorAll(".load-row");
  const loads = [];
  rows.forEach((row) => {
    const id = row.id.split("-")[1];
    const pos = parseFloat(document.getElementById(`pos-${id}`)?.value);
    const mag = parseFloat(document.getElementById(`load-${id}`)?.value);
    if (!isNaN(pos) && !isNaN(mag)) {
      loads.push({ position: pos, magnitude: mag });
    }
  });
  return loads;
}

// ─────────────────────────────────────────────
//  MAIN SOLVE HANDLER
// ─────────────────────────────────────────────

/**
 * Read inputs, POST to Flask API, and render results.
 */
async function solve() {
  clearError();

  const spanVal = parseFloat(document.getElementById("spanLength").value);
  const loads   = collectLoads();

  // ── Client-side pre-validation ──────────────
  if (isNaN(spanVal) || spanVal <= 0) {
    return showError("Span length must be a positive number.");
  }
  if (loads.length === 0) {
    return showError("Add at least one point load before analyzing.");
  }

  // ── Loading state ────────────────────────────
  const btn = document.querySelector(".btn-solve");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> ANALYZING…';
  setStatus("loading", "Sending request to solver…");

  try {
    const response = await fetch(API_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ span: spanVal, loads }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unknown server error.");
    }

    renderResults(data);
    setStatus("success",
      `Analysis complete — RA = ${data.reaction_a.toFixed(3)} kN, ` +
      `RB = ${data.reaction_b.toFixed(3)} kN`
    );

  } catch (err) {
    showError(err.message);
    setStatus("error", err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "▶ ANALYZE BEAM";
  }
}

// ─────────────────────────────────────────────
//  RENDER ALL RESULTS
// ─────────────────────────────────────────────

function renderResults(data) {
  document.getElementById("emptyState").style.display = "none";
  const rc = document.getElementById("resultsContent");
  rc.style.display = "flex";

  document.getElementById("valRA").textContent = data.reaction_a.toFixed(3);
  document.getElementById("valRB").textContent = data.reaction_b.toFixed(3);
  document.getElementById("reactionsGrid").style.display = "grid";

  document.getElementById("sfdMax").textContent = data.max_shear.toFixed(3);
  document.getElementById("sfdMin").textContent = data.min_shear.toFixed(3);
  document.getElementById("bmdMax").textContent = data.max_moment.toFixed(3);
  document.getElementById("bmdMin").textContent = data.min_moment.toFixed(3);

  document.getElementById("sumMaxV").textContent  = `${data.max_shear.toFixed(3)} kN`;
  document.getElementById("sumMinV").textContent  = `${data.min_shear.toFixed(3)} kN`;
  document.getElementById("sumMaxM").textContent  = `${data.max_moment.toFixed(3)} kN·m`;
  document.getElementById("sumMinM").textContent  = `${data.min_moment.toFixed(3)} kN·m`;
  document.getElementById("extremesSummary").style.display = "block";

  drawUnified(data);
  buildTable(data.key_sections);
}

// ─────────────────────────────────────────────
//  UNIFIED STACKED CANVAS
//  Three rows: Beam schematic | SFD | BMD
//  Shared vertical dotted lines at each load
// ─────────────────────────────────────────────

/**
 * Draw all three diagrams stacked vertically on one canvas,
 * with shared dotted vertical lines at every point load position.
 */
function drawUnified(data) {
  const canvas = document.getElementById("unifiedCanvas");
  const dpr    = window.devicePixelRatio || 1;
  const W      = canvas.parentElement.clientWidth || 800;

  // Row heights
  const ROW_BEAM = 170;
  const ROW_SFD  = 200;
  const ROW_BMD  = 200;
  const GAP      = 12;   // gap between rows
  const PAD_X    = 68;   // horizontal padding (left = y-axis area, right = margin)
  const PAD_TOP  = 8;
  const PAD_BOT  = 30;   // space for x-axis ticks

  const H = PAD_TOP + ROW_BEAM + GAP + ROW_SFD + GAP + ROW_BMD + PAD_BOT;

  canvas.width        = W * dpr;
  canvas.height       = H * dpr;
  canvas.style.width  = W + "px";
  canvas.style.height = H + "px";

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const { span: L, loads, reaction_a: RA, reaction_b: RB, sections } = data;
  const plotW = W - 2 * PAD_X;  // width of the drawable span area

  /** Convert beam position x → canvas pixel x */
  const px = (x) => PAD_X + (x / L) * plotW;

  // ── Row top positions ────────────────────────
  const yBeam = PAD_TOP;
  const ySFD  = yBeam + ROW_BEAM + GAP;
  const yBMD  = ySFD  + ROW_SFD  + GAP;

  // ─── 1. BEAM SCHEMATIC ───────────────────────
  drawBeamRow(ctx, px, L, loads, RA, RB, yBeam, ROW_BEAM, plotW);

  // ─── 2. SFD ──────────────────────────────────
  const shears  = sections.map((s) => s.shear);
  drawDiagramRow(ctx, px, L, sections.map((s) => s.x), shears,
    ySFD, ROW_SFD, "#ff6b35", "V (kN)", plotW, PAD_X, W);

  // ─── 3. BMD ──────────────────────────────────
  const moments = sections.map((s) => s.moment);
  drawDiagramRow(ctx, px, L, sections.map((s) => s.x), moments,
    yBMD, ROW_BMD, "#a8ff3e", "M (kN·m)", plotW, PAD_X, W);

  // ─── 4. SHARED DOTTED VERTICAL LINES ─────────
  // Span the full height of all three rows
  const dotTop    = yBeam;
  const dotBottom = yBMD + ROW_BMD;

  loads.forEach(({ position: a }, i) => {
    const lx = px(a);
    ctx.save();
    ctx.strokeStyle = "rgba(255, 220, 100, 0.55)";
    ctx.lineWidth   = 1.2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(lx, dotTop);
    ctx.lineTo(lx, dotBottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  });

  // ─── 5. SHARED X-AXIS TICKS ──────────────────
  drawXAxis(ctx, px, L, yBMD + ROW_BMD, W, PAD_X, plotW);
}

// ─────────────────────────────────────────────
//  BEAM SCHEMATIC ROW
// ─────────────────────────────────────────────

function drawBeamRow(ctx, px, L, loads, RA, RB, rowY, rowH, plotW) {
  const midY = rowY + rowH * 0.52;

  const C_BEAM  = "#2a3040";
  const C_BORD  = "#3d4860";
  const C_REACT = "#00e5ff";
  const C_LOAD  = "#ff6b35";
  const C_DIM   = "#6b7694";

  // Beam rectangle
  ctx.fillStyle   = C_BEAM;
  ctx.strokeStyle = C_BORD;
  ctx.lineWidth   = 1;
  ctx.fillRect(px(0), midY - 10, px(L) - px(0), 20);
  ctx.strokeRect(px(0), midY - 10, px(L) - px(0), 20);

  // Hash fill
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  for (let x = px(0); x < px(L); x += 14) {
    ctx.beginPath(); ctx.moveTo(x, midY - 10); ctx.lineTo(x, midY + 10); ctx.stroke();
  }
  ctx.restore();

  // Support A (pin)
  drawTriangle(ctx, px(0), midY + 10, 11, 18, C_REACT);
  ctx.fillStyle = C_REACT;
  ctx.font      = "9px 'Space Mono'";
  ctx.textAlign = "center";
  ctx.fillText(`RA=${RA.toFixed(2)}kN`, px(0), midY + 44);

  // Support B (roller)
  drawTriangle(ctx, px(L), midY + 10, 11, 18, C_REACT);
  ctx.strokeStyle = C_REACT; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(px(L), midY + 33, 4, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = C_REACT;
  ctx.font      = "9px 'Space Mono'";
  ctx.textAlign = "center";
  ctx.fillText(`RB=${RB.toFixed(2)}kN`, px(L), midY + 46);

  // Support ground lines
  [px(0), px(L)].forEach((x) => {
    ctx.strokeStyle = C_REACT + "55"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - 14, midY + 28); ctx.lineTo(x + 14, midY + 28); ctx.stroke();
  });

  // Point load arrows
  const maxMag = Math.max(...loads.map((l) => Math.abs(l.magnitude)));
  loads.forEach(({ position: a, magnitude: P }, i) => {
    const lx     = px(a);
    const arrowH = 20 + 28 * (Math.abs(P) / maxMag);
    const startY = midY - 10 - arrowH;
    drawDownArrow(ctx, lx, startY, arrowH, C_LOAD, `P${i+1}=${P.toFixed(0)}kN`);
  });

  // Span dimension
  ctx.strokeStyle = C_DIM; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(px(0), rowY + 10); ctx.lineTo(px(L), rowY + 10);
  ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = C_DIM; ctx.font = "10px 'Space Mono'"; ctx.textAlign = "center";
  ctx.fillText(`L = ${L} m`, px(L / 2), rowY + 7);

  // A / B node labels
  ctx.fillStyle = C_DIM; ctx.font = "10px 'Space Mono'";
  ctx.textAlign = "right";  ctx.fillText("A", px(0) - 6, midY + 4);
  ctx.textAlign = "left";   ctx.fillText("B", px(L) + 6, midY + 4);

  // Row separator line
  ctx.strokeStyle = "#252b38"; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, rowY + rowH + 6); ctx.lineTo(999, rowY + rowH + 6);
  ctx.stroke();
}

// ─────────────────────────────────────────────
//  GENERIC SFD / BMD ROW
// ─────────────────────────────────────────────

/**
 * Draw a filled line chart (SFD or BMD) in a given row band.
 */
function drawDiagramRow(ctx, px, L, xs, ys, rowY, rowH, color, yLabel, plotW, PAD_X, W) {
  const PAD_TOP_ROW = 14;
  const PAD_BOT_ROW = 22;
  const drawH = rowH - PAD_TOP_ROW - PAD_BOT_ROW;

  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 0);
  const range = maxY - minY || 1;

  /** Map a data value to canvas y inside this row */
  const cy = (v) => rowY + PAD_TOP_ROW + drawH - ((v - minY) / range) * drawH;

  const zeroY = cy(0);

  // Row background tint
  ctx.fillStyle = "rgba(255,255,255,0.012)";
  ctx.fillRect(PAD_X, rowY, plotW, rowH);

  // Horizontal grid lines (3 levels)
  [-1, 0, 1].forEach((frac) => {
    const gy = rowY + PAD_TOP_ROW + drawH * (0.5 - frac * 0.45);
    ctx.strokeStyle = "#252b38"; ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(PAD_X, gy); ctx.lineTo(PAD_X + plotW, gy); ctx.stroke();
  });

  // Zero line (solid, slightly brighter)
  ctx.strokeStyle = "#3a4255"; ctx.lineWidth = 1.2; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(PAD_X, zeroY); ctx.lineTo(PAD_X + plotW, zeroY); ctx.stroke();

  // Filled area
  ctx.beginPath();
  ctx.moveTo(px(xs[0]), zeroY);
  for (let i = 0; i < xs.length; i++) ctx.lineTo(px(xs[i]), cy(ys[i]));
  ctx.lineTo(px(xs[xs.length - 1]), zeroY);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, rowY, 0, rowY + rowH);
  grad.addColorStop(0,   color + "50");
  grad.addColorStop(0.5, color + "20");
  grad.addColorStop(1,   color + "06");
  ctx.fillStyle = grad;
  ctx.fill();

  // Curve line
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash([]);
  ctx.beginPath();
  for (let i = 0; i < xs.length; i++) {
    i === 0 ? ctx.moveTo(px(xs[i]), cy(ys[i])) : ctx.lineTo(px(xs[i]), cy(ys[i]));
  }
  ctx.stroke();

  // Y-axis ticks (min, 0, max)
  const tickVals = [minY, 0, maxY];
  tickVals.forEach((v) => {
    if (Math.abs(v) < 1e-4 && v !== 0) return;
    const ty = cy(v);
    ctx.strokeStyle = "#3a4255"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD_X - 4, ty); ctx.lineTo(PAD_X, ty); ctx.stroke();
    ctx.fillStyle = "#6b7694"; ctx.font = "9px 'Space Mono'"; ctx.textAlign = "right";
    ctx.fillText(v.toFixed(1), PAD_X - 7, ty + 3.5);
  });

  // Y-axis label
  ctx.save();
  ctx.translate(12, rowY + rowH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = color; ctx.font = "bold 9px 'Space Mono'"; ctx.textAlign = "center";
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();

  // Row border bottom
  ctx.strokeStyle = "#252b38"; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, rowY + rowH + 6); ctx.lineTo(W, rowY + rowH + 6);
  ctx.stroke();
}

// ─────────────────────────────────────────────
//  SHARED X-AXIS
// ─────────────────────────────────────────────

function drawXAxis(ctx, px, L, baseY, W, PAD_X, plotW) {
  // Axis line
  ctx.strokeStyle = "#3a4255"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD_X, baseY + 2); ctx.lineTo(PAD_X + plotW, baseY + 2); ctx.stroke();

  // Ticks: ~8 evenly spaced
  const steps = Math.min(10, L);
  const step  = L / steps;
  for (let i = 0; i <= steps; i++) {
    const xVal = +(i * step).toFixed(4);
    const cx   = px(xVal);
    ctx.strokeStyle = "#3a4255"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, baseY + 2); ctx.lineTo(cx, baseY + 7); ctx.stroke();
    ctx.fillStyle = "#6b7694"; ctx.font = "9px 'Space Mono'"; ctx.textAlign = "center";
    ctx.fillText(xVal % 1 === 0 ? xVal.toFixed(0) : xVal.toFixed(1), cx, baseY + 18);
  }
}

// ─────────────────────────────────────────────
//  SHARED CANVAS HELPERS
// ─────────────────────────────────────────────

function drawTriangle(ctx, cx, tipY, hw, h, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, tipY);
  ctx.lineTo(cx - hw, tipY + h);
  ctx.lineTo(cx + hw, tipY + h);
  ctx.closePath();
  ctx.fill();
}

function drawDownArrow(ctx, x, startY, length, color, label) {
  const endY = startY + length;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, endY); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, endY);
  ctx.lineTo(x - 6, endY - 10);
  ctx.lineTo(x + 6, endY - 10);
  ctx.closePath(); ctx.fill();
  if (label) {
    ctx.font = "9.5px 'Space Mono'"; ctx.textAlign = "center";
    ctx.fillText(label, x, startY - 5);
  }
}

// ─────────────────────────────────────────────
//  RESULTS TABLE
// ─────────────────────────────────────────────

/**
 * Populate the numerical results table with key sections.
 * @param {{ x: number, shear: number, moment: number }[]} keySections
 */
function buildTable(keySections) {
  const tbody = document.getElementById("resultsTable");
  tbody.innerHTML = "";

  keySections.forEach(({ x, shear: V, moment: M }) => {
    const Vc = Math.abs(V) < 1e-4 ? "td-zero" : V > 0 ? "td-pos" : "td-neg";
    const Mc = Math.abs(M) < 1e-4 ? "td-zero" : M > 0 ? "td-pos" : "td-neg";
    tbody.innerHTML += `
      <tr>
        <td>${sectionLabel(x, keySections)}</td>
        <td>${x.toFixed(3)}</td>
        <td class="${Vc}">${V.toFixed(4)}</td>
        <td class="${Mc}">${M.toFixed(4)}</td>
      </tr>
    `;
  });
}

/**
 * Generate a human-readable label for a section position.
 */
function sectionLabel(x, sections) {
  const L = Math.max(...sections.map((s) => s.x));
  if (x === 0)              return "Support A";
  if (Math.abs(x - L) < 1e-4) return "Support B";
  if (Math.abs(x - L / 2) < 1e-3) return `Midspan (${x.toFixed(2)} m)`;
  return `x = ${x.toFixed(3)} m`;
}

// ─────────────────────────────────────────────
//  UI HELPERS
// ─────────────────────────────────────────────

function showError(msg) {
  const el = document.getElementById("errorMsg");
  el.textContent = `⚠  ${msg}`;
  el.style.display = "block";
}

function clearError() {
  const el = document.getElementById("errorMsg");
  el.style.display = "none";
  el.textContent = "";
}

/**
 * Update the bottom status bar.
 * @param {"ready"|"loading"|"success"|"error"} type
 * @param {string} msg
 */
function setStatus(type, msg) {
  const dot  = document.getElementById("statusDot");
  const text = document.getElementById("statusText");
  dot.className = "status-dot" + (
    type === "error"   ? " error"   :
    type === "loading" ? " loading" :
    ""
  );
  text.textContent = msg;
}
