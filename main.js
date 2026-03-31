/**
 * main.js — BeamSolve Frontend Logic
 * ====================================
 * This file controls everything that happens in the browser:
 *   - Adding and removing point load rows in the form
 *   - Sending the beam data to the Flask server
 *   - Drawing the beam schematic, SFD, and BMD on a canvas
 *   - Populating the numerical results table
 *   - Showing errors and status messages
 *
 * It communicates with app.py via a fetch() API call to /api/solve
 */

"use strict"; // Enables strict mode — helps catch common JavaScript mistakes early

// ─────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────

// The URL of the Flask API endpoint that performs the beam analysis
// Using a relative path "/api/solve" means it automatically targets
// whatever server is serving this page (i.e. localhost:5000)
const API_URL = "/api/solve";

// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────

// Counter used to give each load row a unique ID
// Increments each time a new load is added (1, 2, 3, ...)
let loadCounter = 0;

// ─────────────────────────────────────────────
//  INITIALISE
// ─────────────────────────────────────────────

/**
 * Runs automatically when the page finishes loading.
 * Adds two default example loads so the user sees the program working immediately,
 * and sets the initial status bar message.
 */
document.addEventListener("DOMContentLoaded", () => {
  addLoad(3, 20);   // Add a default load: 20 kN at position 3 m
  addLoad(7, 15);   // Add a default load: 15 kN at position 7 m
  setStatus("ready", "Ready — configure beam and click Analyze");
});

// ─────────────────────────────────────────────
//  ADD / REMOVE POINT LOADS
// ─────────────────────────────────────────────

/**
 * addLoad — Creates a new load input row and adds it to the form.
 *
 * Each row contains two number inputs (position and magnitude)
 * and a remove button. The row is given a unique ID so it can
 * be found and removed later.
 *
 * @param {number|string} pos - The default position value to pre-fill (metres from A)
 * @param {number|string} mag - The default magnitude value to pre-fill (kN)
 */
function addLoad(pos = "", mag = "") {
  loadCounter++;                              // Increment the counter to get a unique ID
  const id = loadCounter;                     // Save current count as this row's ID
  const container = document.getElementById("loadsContainer");  // Find the container div
  const row = document.createElement("div"); // Create a new empty div element
  row.className = "load-row";                // Give it the CSS class for styling
  row.id = `loadRow-${id}`;                  // Give it a unique ID like "loadRow-1"

  // Fill the row with two inputs and a remove button
  // The input IDs include the counter (e.g. "pos-1", "load-1") so each is unique
  row.innerHTML = `
    <input type="number" id="pos-${id}" value="${pos}"
           placeholder="0.0" min="0" step="0.1" aria-label="Load position">
    <input type="number" id="load-${id}" value="${mag}"
           placeholder="kN" step="0.1" aria-label="Load magnitude">
    <button class="btn-remove" onclick="removeLoad(${id})"
            title="Remove load" aria-label="Remove load">×</button>
  `;
  container.appendChild(row); // Add the new row to the bottom of the container
}

/**
 * removeLoad — Deletes a specific load row from the form.
 *
 * Called when the user clicks the × button on a load row.
 * Finds the row by its unique ID and removes it from the page.
 *
 * @param {number} id - The unique counter ID of the row to remove
 */
function removeLoad(id) {
  const row = document.getElementById(`loadRow-${id}`); // Find the row by its ID
  if (row) row.remove(); // Remove it from the page if it exists
}

// ─────────────────────────────────────────────
//  COLLECT FORM DATA
// ─────────────────────────────────────────────

/**
 * collectLoads — Reads all load rows from the form and returns them as an array.
 *
 * Loops through every element with the CSS class "load-row",
 * reads the position and magnitude values from their inputs,
 * and builds a clean array of load objects.
 * Rows with missing or non-numeric values are skipped.
 *
 * @returns {{ position: number, magnitude: number }[]} Array of valid load objects
 */
function collectLoads() {
  const rows  = document.querySelectorAll(".load-row"); // Get all load rows on the page
  const loads = [];                                     // Start with an empty array

  rows.forEach((row) => {
    const id  = row.id.split("-")[1];   // Extract the numeric ID from "loadRow-3" → "3"
    const pos = parseFloat(document.getElementById(`pos-${id}`)?.value);   // Read position input
    const mag = parseFloat(document.getElementById(`load-${id}`)?.value);  // Read magnitude input

    // Only include this load if both values are valid numbers (not NaN)
    if (!isNaN(pos) && !isNaN(mag)) {
      loads.push({ position: pos, magnitude: mag }); // Add to the array as an object
    }
  });

  return loads; // Return the completed array
}

// ─────────────────────────────────────────────
//  MAIN SOLVE HANDLER
// ─────────────────────────────────────────────

/**
 * solve — The main function triggered when the user clicks "ANALYZE BEAM".
 *
 * Steps performed:
 *   1. Clears any previous error message
 *   2. Reads and validates the span and loads from the form
 *   3. Disables the button and shows a loading spinner
 *   4. Sends the data to the Flask API using fetch()
 *   5. On success: calls renderResults() to display everything
 *   6. On failure: shows the error message
 *   7. Re-enables the button regardless of outcome
 *
 * This is an async function because the API call takes time —
 * "await" pauses execution until the server responds.
 */
async function solve() {
  clearError(); // Remove any error message from a previous attempt

  const spanVal = parseFloat(document.getElementById("spanLength").value); // Read span input
  const loads   = collectLoads(); // Collect all load rows into an array

  // Basic validation before even contacting the server
  if (isNaN(spanVal) || spanVal <= 0) {
    return showError("Span length must be a positive number."); // Stop and show error
  }
  if (loads.length === 0) {
    return showError("Add at least one point load before analyzing."); // Stop and show error
  }

  // Disable the button and show a spinner so the user knows something is happening
  const btn = document.querySelector(".btn-solve");
  btn.disabled  = true;
  btn.innerHTML = '<span class="spinner"></span> ANALYZING…';
  setStatus("loading", "Sending request to solver…");

  try {
    // Send the beam data to Flask via HTTP POST
    // fetch() is the browser's built-in way of making API requests
    const response = await fetch(API_URL, {
      method:  "POST",                              // POST = sending data to the server
      headers: { "Content-Type": "application/json" }, // Tell the server we're sending JSON
      body:    JSON.stringify({ span: spanVal, loads }), // Convert JS object to JSON string
    });

    const data = await response.json(); // Parse the server's JSON response into a JS object

    // If the server returned an error status code (4xx or 5xx), throw it as an error
    if (!response.ok) {
      throw new Error(data.error || "Unknown server error.");
    }

    // Success — pass the results to the rendering function
    renderResults(data);
    setStatus("success",
      `Analysis complete — RA = ${data.reaction_a.toFixed(3)} kN, ` +
      `RB = ${data.reaction_b.toFixed(3)} kN`
    );

  } catch (err) {
    // Something went wrong — show the error message to the user
    showError(err.message);
    setStatus("error", err.message);

  } finally {
    // This block always runs — re-enable the button whether or not there was an error
    btn.disabled    = false;
    btn.textContent = "▶ ANALYZE BEAM";
  }
}

// ─────────────────────────────────────────────
//  RENDER ALL RESULTS
// ─────────────────────────────────────────────

/**
 * renderResults — Takes the API response and updates the entire results area.
 *
 * Hides the empty state placeholder, shows the results panel,
 * fills in all the reaction values, extreme values, and summary,
 * then calls the drawing and table functions.
 *
 * @param {object} data - The full JSON response object from /api/solve
 */
function renderResults(data) {
  document.getElementById("emptyState").style.display = "none"; // Hide the "No Analysis Yet" message
  const rc = document.getElementById("resultsContent");
  rc.style.display = "flex";  // Make the results panel visible

  // Fill in the support reaction values in the sidebar cards
  document.getElementById("valRA").textContent = data.reaction_a.toFixed(3);
  document.getElementById("valRB").textContent = data.reaction_b.toFixed(3);
  document.getElementById("reactionsGrid").style.display = "grid"; // Show the reaction cards

  // Fill in the SFD and BMD extreme value chips at the top of the diagram panel
  document.getElementById("sfdMax").textContent = data.max_shear.toFixed(3);
  document.getElementById("sfdMin").textContent = data.min_shear.toFixed(3);
  document.getElementById("bmdMax").textContent = data.max_moment.toFixed(3);
  document.getElementById("bmdMin").textContent = data.min_moment.toFixed(3);

  // Fill in the summary rows in the sidebar (max/min shear and moment)
  document.getElementById("sumMaxV").textContent  = `${data.max_shear.toFixed(3)} kN`;
  document.getElementById("sumMinV").textContent  = `${data.min_shear.toFixed(3)} kN`;
  document.getElementById("sumMaxM").textContent  = `${data.max_moment.toFixed(3)} kN·m`;
  document.getElementById("sumMinM").textContent  = `${data.min_moment.toFixed(3)} kN·m`;
  document.getElementById("extremesSummary").style.display = "block"; // Show the summary panel

  setTimeout(() => {
    drawUnified(data);
    buildTable(data.key_sections, data.loads, data.span);
  }, 0);
}

// ─────────────────────────────────────────────
//  UNIFIED STACKED CANVAS
// ─────────────────────────────────────────────

/**
 * drawUnified — Draws all three diagrams stacked vertically on a single HTML canvas.
 *
 * The canvas is divided into three horizontal bands:
 *   Row 1 (top)    : Beam schematic — shows the beam, supports, and load arrows
 *   Row 2 (middle) : SFD — shear force diagram (orange)
 *   Row 3 (bottom) : BMD — bending moment diagram (green)
 *
 * After drawing all three rows, yellow dotted vertical lines are drawn
 * from top to bottom at each load position, linking all three diagrams.
 * A shared x-axis with position labels is drawn below the last row.
 *
 * @param {object} data - Full API response containing span, loads, reactions, sections
 */
function drawUnified(data) {
  const canvas = document.getElementById("unifiedCanvas"); // Get the canvas element
  const dpr    = window.devicePixelRatio || 1;             // Get screen pixel density (for sharp rendering on retina screens)
  
  // Get parent width and account for padding
  const parent = canvas.parentElement;
  const parentStyle = window.getComputedStyle(parent);
  const paddingLeft = parseFloat(parentStyle.paddingLeft) || 0;
  const paddingRight = parseFloat(parentStyle.paddingRight) || 0;
  const W = Math.max(400, parent.clientWidth - paddingLeft - paddingRight) || 800;

  // Define the height of each row in pixels
  const ROW_BEAM = 170;  // Height of the beam schematic row
  const ROW_SFD  = 200;  // Height of the shear force diagram row
  const ROW_BMD  = 200;  // Height of the bending moment diagram row
  const GAP      = 12;   // Gap in pixels between each row
  const PAD_X    = 68;   // Horizontal padding — left side is used for y-axis labels
  const PAD_TOP  = 8;    // Small padding at the very top
  const PAD_BOT  = 30;   // Space at the bottom for x-axis tick labels

  // Total canvas height = all three rows + gaps + top and bottom padding
  const H = PAD_TOP + ROW_BEAM + GAP + ROW_SFD + GAP + ROW_BMD + PAD_BOT;

  // Set the canvas internal resolution (multiplied by dpr for sharp rendering)
  canvas.width        = W * dpr;
  canvas.height       = H * dpr;
  canvas.style.width  = W + "px";   // But display at normal CSS size
  canvas.style.height = H + "px";

  const ctx = canvas.getContext("2d");  // Get the 2D drawing context
  ctx.scale(dpr, dpr);                 // Scale drawing operations for the pixel density
  ctx.clearRect(0, 0, W, H);           // Clear the canvas before drawing

  // Destructure (unpack) the needed values from the API response
  const { span: L, loads, reaction_a: RA, reaction_b: RB, sections } = data;
  const plotW = W - 2 * PAD_X;  // The actual drawable width between the y-axis and right edge

  /**
   * px — Converts a beam position in metres to a canvas pixel x-coordinate.
   * Example: px(5) on a 10m beam in a 800px canvas → roughly 400px
   * @param {number} x - Position along the beam in metres
   * @returns {number} Canvas x-coordinate in pixels
   */
  const px = (x) => PAD_X + (x / L) * plotW;

  // Calculate the y-coordinate where each row starts
  const yBeam = PAD_TOP;                      // Beam row starts at the top
  const ySFD  = yBeam + ROW_BEAM + GAP;       // SFD row starts after beam row + gap
  const yBMD  = ySFD  + ROW_SFD  + GAP;      // BMD row starts after SFD row + gap

  // Draw the three rows
  drawBeamRow(ctx, px, L, loads, RA, RB, yBeam, ROW_BEAM, plotW);   // Beam schematic

  const shears  = sections.map((s) => s.shear);   // Extract shear values from sections array
  drawDiagramRow(ctx, px, L, sections.map((s) => s.x), shears,
    ySFD, ROW_SFD, "#ff6b35", "V (kN)", plotW, PAD_X, W);           // SFD (orange)

  const moments = sections.map((s) => s.moment);  // Extract moment values from sections array
  drawDiagramRow(ctx, px, L, sections.map((s) => s.x), moments,
    yBMD, ROW_BMD, "#a8ff3e", "M (kN·m)", plotW, PAD_X, W);         // BMD (green)

  // Draw shared dotted vertical lines at each load position
  // These lines pass through all three rows to visually link the load position
  // across the beam schematic, SFD, and BMD
  const dotTop    = yBeam;          // Start at the top of the beam row
  const dotBottom = yBMD + ROW_BMD; // End at the bottom of the BMD row

  loads.forEach(({ position: a }) => {
    const lx = px(a);  // Convert load position to canvas pixel x
    ctx.save();         // Save current drawing state so we can restore it after
    ctx.strokeStyle = "rgba(255, 220, 100, 0.55)"; // Yellow, semi-transparent
    ctx.lineWidth   = 1.2;
    ctx.setLineDash([5, 4]); // Dashed line: 5px on, 4px off
    ctx.beginPath();
    ctx.moveTo(lx, dotTop);     // Start at top
    ctx.lineTo(lx, dotBottom);  // Draw down to bottom
    ctx.stroke();
    ctx.setLineDash([]); // Reset to solid line for future drawing
    ctx.restore();       // Restore drawing state
  });

  // Draw the shared x-axis below all three rows
  drawXAxis(ctx, px, L, yBMD + ROW_BMD, W, PAD_X, plotW);
}

// ─────────────────────────────────────────────
//  BEAM SCHEMATIC ROW
// ─────────────────────────────────────────────

/**
 * drawBeamRow — Draws the beam schematic in the top row of the canvas.
 *
 * This includes:
 *   - The beam rectangle with a subtle hash pattern
 *   - A pin support (triangle) at the left end (A)
 *   - A roller support (triangle + circle) at the right end (B)
 *   - Downward arrows for each point load, scaled by magnitude
 *   - A dashed dimension line showing the total span L
 *   - Labels for supports A and B and each load
 *
 * @param {CanvasRenderingContext2D} ctx  - The canvas drawing context
 * @param {Function}  px    - Converts beam metres to canvas pixels
 * @param {number}    L     - Total beam span in metres
 * @param {Array}     loads - Array of load objects {position, magnitude}
 * @param {number}    RA    - Left support reaction in kN
 * @param {number}    RB    - Right support reaction in kN
 * @param {number}    rowY  - Y-coordinate where this row starts on the canvas
 * @param {number}    rowH  - Height of this row in pixels
 * @param {number}    plotW - Width of the drawable area in pixels
 */
function drawBeamRow(ctx, px, L, loads, RA, RB, rowY, rowH, plotW) {
  const midY = rowY + rowH * 0.52;  // Vertical centre of the beam within this row

  // Colour constants for this diagram
  const C_BEAM  = "#2a3040";  // Dark blue-grey for the beam body
  const C_BORD  = "#3d4860";  // Slightly lighter border for the beam
  const C_REACT = "#00e5ff";  // Cyan for supports and reactions
  const C_LOAD  = "#ff6b35";  // Orange for load arrows
  const C_DIM   = "#6b7694";  // Grey for dimension labels

  // Draw the beam body as a filled rectangle
  ctx.fillStyle   = C_BEAM;
  ctx.strokeStyle = C_BORD;
  ctx.lineWidth   = 1;
  ctx.fillRect(px(0), midY - 10, px(L) - px(0), 20);   // Filled rectangle
  ctx.strokeRect(px(0), midY - 10, px(L) - px(0), 20); // Border around it

  // Draw subtle vertical hash lines on the beam to give it texture
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.04)"; // Very faint white lines
  ctx.lineWidth = 1;
  for (let x = px(0); x < px(L); x += 14) {  // Every 14 pixels across the beam
    ctx.beginPath(); ctx.moveTo(x, midY - 10); ctx.lineTo(x, midY + 10); ctx.stroke();
  }
  ctx.restore();

  // Draw the pin support at A (left end) — shown as a triangle
  drawTriangle(ctx, px(0), midY + 10, 11, 18, C_REACT);
  ctx.fillStyle = C_REACT;
  ctx.font      = "9px 'Space Mono'";
  ctx.textAlign = "center";
  ctx.fillText(`RA=${RA.toFixed(2)}kN`, px(0), midY + 44); // Label showing reaction value

  // Draw the roller support at B (right end) — shown as a triangle + small circle
  drawTriangle(ctx, px(L), midY + 10, 11, 18, C_REACT);
  ctx.strokeStyle = C_REACT; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(px(L), midY + 33, 4, 0, Math.PI * 2); ctx.stroke(); // The roller circle
  ctx.fillStyle = C_REACT;
  ctx.font      = "9px 'Space Mono'";
  ctx.textAlign = "center";
  ctx.fillText(`RB=${RB.toFixed(2)}kN`, px(L), midY + 46); // Label showing reaction value

  // Draw short horizontal ground lines under each support
  [px(0), px(L)].forEach((x) => {
    ctx.strokeStyle = C_REACT + "55"; // Cyan at 33% opacity
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - 14, midY + 28); ctx.lineTo(x + 14, midY + 28); ctx.stroke();
  });

  // Draw downward arrows for each point load
  const maxMag = Math.max(...loads.map((l) => Math.abs(l.magnitude))); // Find the largest load
  loads.forEach(({ position: a, magnitude: P }, i) => {
    const lx     = px(a);   // Canvas x position for this load
    // Scale arrow height between 20 and 48 pixels based on relative magnitude
    const arrowH = 20 + 28 * (Math.abs(P) / maxMag);
    const startY = midY - 10 - arrowH; // Arrow starts above the beam
    drawDownArrow(ctx, lx, startY, arrowH, C_LOAD, `P${i+1}=${P.toFixed(0)}kN`);
  });

  // Draw a dashed dimension line across the top showing the total span
  ctx.strokeStyle = C_DIM; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(px(0), rowY + 10);   // Start above the beam at A
  ctx.lineTo(px(L), rowY + 10);   // End above the beam at B
  ctx.stroke();
  ctx.setLineDash([]); // Reset to solid line
  ctx.fillStyle = C_DIM; ctx.font = "10px 'Space Mono'"; ctx.textAlign = "center";
  ctx.fillText(`L = ${L} m`, px(L / 2), rowY + 7); // Label in the middle of the line

  // Draw the support labels A and B beside each support
  ctx.fillStyle = C_DIM; ctx.font = "10px 'Space Mono'";
  ctx.textAlign = "right";  ctx.fillText("A", px(0) - 6, midY + 4);
  ctx.textAlign = "left";   ctx.fillText("B", px(L) + 6, midY + 4);

  // Draw a faint horizontal separator line at the bottom of this row
  ctx.strokeStyle = "#252b38"; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, rowY + rowH + 6); ctx.lineTo(999, rowY + rowH + 6);
  ctx.stroke();
}

// ─────────────────────────────────────────────
//  GENERIC SFD / BMD ROW
// ─────────────────────────────────────────────

/**
 * drawDiagramRow — Draws either the SFD or BMD as a filled line chart in one row band.
 *
 * Used for both the Shear Force Diagram and Bending Moment Diagram.
 * The function automatically scales the y-axis to fit the data range,
 * draws a background, grid lines, a zero line, the filled area, the curve,
 * y-axis tick marks with values, and a rotated y-axis label.
 *
 * @param {CanvasRenderingContext2D} ctx    - The canvas drawing context
 * @param {Function}  px      - Converts beam metres to canvas x pixels
 * @param {number}    L       - Total beam span in metres
 * @param {number[]}  xs      - Array of x positions in metres (500+ points)
 * @param {number[]}  ys      - Array of y values (shear or moment) matching xs
 * @param {number}    rowY    - Y-coordinate where this row starts on the canvas
 * @param {number}    rowH    - Height of this row in pixels
 * @param {string}    color   - Hex colour string for the curve and fill
 * @param {string}    yLabel  - Label for the y-axis (e.g. "V (kN)" or "M (kN·m)")
 * @param {number}    plotW   - Width of the drawable area in pixels
 * @param {number}    PAD_X   - Left padding in pixels (y-axis label area)
 * @param {number}    W       - Total canvas width in pixels
 */
function drawDiagramRow(ctx, px, L, xs, ys, rowY, rowH, color, yLabel, plotW, PAD_X, W) {
  const PAD_TOP_ROW = 14;  // Padding inside the row at the top
  const PAD_BOT_ROW = 22;  // Padding inside the row at the bottom
  const drawH = rowH - PAD_TOP_ROW - PAD_BOT_ROW;  // Actual height available for the data

  // Calculate the data range for scaling the y-axis
  // Always include 0 so the zero line is always visible
  const minY  = Math.min(...ys, 0);  // Minimum value (or 0 if all positive)
  const maxY  = Math.max(...ys, 0);  // Maximum value (or 0 if all negative)
  const range = maxY - minY || 1;    // Total range; use 1 if range is 0 to avoid division by zero

  /**
   * cy — Converts a data value to a canvas y-coordinate within this row.
   * The data is flipped: higher values appear higher on screen.
   * @param {number} v - The data value (shear or moment)
   * @returns {number} Canvas y-coordinate in pixels
   */
  const cy = (v) => rowY + PAD_TOP_ROW + drawH - ((v - minY) / range) * drawH;

  const zeroY = cy(0); // Canvas y-coordinate of the zero line

  // Draw a very faint background tint across the plot area
  ctx.fillStyle = "rgba(255,255,255,0.012)";
  ctx.fillRect(PAD_X, rowY, plotW, rowH);

  // Draw three horizontal grid lines (top, middle, bottom of the data range)
  [-1, 0, 1].forEach((frac) => {
    const gy = rowY + PAD_TOP_ROW + drawH * (0.5 - frac * 0.45);
    ctx.strokeStyle = "#252b38"; ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(PAD_X, gy); ctx.lineTo(PAD_X + plotW, gy); ctx.stroke();
  });

  // Draw the zero line slightly brighter to make it stand out
  ctx.strokeStyle = "#3a4255"; ctx.lineWidth = 1.2; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(PAD_X, zeroY); ctx.lineTo(PAD_X + plotW, zeroY); ctx.stroke();

  // Draw the filled area under/above the curve
  // Start at zero line on the left, trace the curve, close back to zero on the right
  ctx.beginPath();
  ctx.moveTo(px(xs[0]), zeroY);                              // Start at zero on the left
  for (let i = 0; i < xs.length; i++) ctx.lineTo(px(xs[i]), cy(ys[i])); // Trace the curve
  ctx.lineTo(px(xs[xs.length - 1]), zeroY);                 // Return to zero on the right
  ctx.closePath();

  // Fill with a gradient that fades from semi-opaque at top to nearly transparent at bottom
  const grad = ctx.createLinearGradient(0, rowY, 0, rowY + rowH);
  grad.addColorStop(0,   color + "50"); // 31% opacity at top
  grad.addColorStop(0.5, color + "20"); // 13% opacity at middle
  grad.addColorStop(1,   color + "06"); // 2% opacity at bottom
  ctx.fillStyle = grad;
  ctx.fill();

  // Draw the actual curve line on top of the filled area
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash([]);
  ctx.beginPath();
  for (let i = 0; i < xs.length; i++) {
    i === 0 ? ctx.moveTo(px(xs[i]), cy(ys[i])) : ctx.lineTo(px(xs[i]), cy(ys[i]));
  }
  ctx.stroke();

  // Draw y-axis tick marks at the minimum, zero, and maximum values
  const tickVals = [minY, 0, maxY];
  tickVals.forEach((v) => {
    if (Math.abs(v) < 1e-4 && v !== 0) return; // Skip near-zero values that aren't exactly 0
    const ty = cy(v);
    ctx.strokeStyle = "#3a4255"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD_X - 4, ty); ctx.lineTo(PAD_X, ty); ctx.stroke(); // Tick mark
    ctx.fillStyle = "#6b7694"; ctx.font = "9px 'Space Mono'"; ctx.textAlign = "right";
    ctx.fillText(v.toFixed(1), PAD_X - 7, ty + 3.5); // Value label to the left of the tick
  });

  // Draw the y-axis label rotated 90 degrees (reading upward)
  ctx.save();
  ctx.translate(12, rowY + rowH / 2); // Move origin to the left edge, vertically centred
  ctx.rotate(-Math.PI / 2);           // Rotate 90 degrees counter-clockwise
  ctx.fillStyle = color; ctx.font = "bold 9px 'Space Mono'"; ctx.textAlign = "center";
  ctx.fillText(yLabel, 0, 0);         // Draw the label at the rotated origin
  ctx.restore();                      // Restore original drawing state

  // Draw a separator line at the bottom of this row
  ctx.strokeStyle = "#252b38"; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, rowY + rowH + 6); ctx.lineTo(W, rowY + rowH + 6);
  ctx.stroke();
}

// ─────────────────────────────────────────────
//  SHARED X-AXIS
// ─────────────────────────────────────────────

/**
 * drawXAxis — Draws a shared x-axis below all three diagram rows.
 *
 * Draws a horizontal axis line and evenly-spaced tick marks with
 * position labels in metres. All three rows share this single axis
 * because they all use the same x scale (beam position in metres).
 *
 * @param {CanvasRenderingContext2D} ctx    - The canvas drawing context
 * @param {Function}  px     - Converts beam metres to canvas x pixels
 * @param {number}    L      - Total beam span in metres
 * @param {number}    baseY  - Y-coordinate of the axis line
 * @param {number}    W      - Total canvas width in pixels
 * @param {number}    PAD_X  - Left padding in pixels
 * @param {number}    plotW  - Width of the drawable area in pixels
 */
function drawXAxis(ctx, px, L, baseY, W, PAD_X, plotW) {
  // Draw the horizontal axis line
  ctx.strokeStyle = "#3a4255"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD_X, baseY + 2); ctx.lineTo(PAD_X + plotW, baseY + 2); ctx.stroke();

  // Calculate how many tick marks to show (at most 10 steps)
  const steps = Math.min(10, L);  // Use 10 steps for long beams, fewer for short ones
  const step  = L / steps;        // Distance between ticks in metres

  for (let i = 0; i <= steps; i++) {
    const xVal = +(i * step).toFixed(4); // Position of this tick in metres
    const cx   = px(xVal);               // Canvas x-coordinate for this tick

    // Draw the tick mark
    ctx.strokeStyle = "#3a4255"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, baseY + 2); ctx.lineTo(cx, baseY + 7); ctx.stroke();

    // Draw the position label below the tick
    ctx.fillStyle = "#6b7694"; ctx.font = "9px 'Space Mono'"; ctx.textAlign = "center";
    // Show whole numbers without decimal (e.g. "5") and fractions with one decimal (e.g. "2.5")
    ctx.fillText(xVal % 1 === 0 ? xVal.toFixed(0) : xVal.toFixed(1), cx, baseY + 18);
  }
}

// ─────────────────────────────────────────────
//  CANVAS HELPER FUNCTIONS
// ─────────────────────────────────────────────

/**
 * drawTriangle — Draws a filled triangle pointing upward from a tip point.
 * Used to draw the support symbols (pin and roller) on the beam schematic.
 *
 * @param {CanvasRenderingContext2D} ctx   - The canvas drawing context
 * @param {number} cx    - X-coordinate of the tip (top point) of the triangle
 * @param {number} tipY  - Y-coordinate of the tip (top point) of the triangle
 * @param {number} hw    - Half-width of the triangle base in pixels
 * @param {number} h     - Height of the triangle in pixels
 * @param {string} color - Fill colour for the triangle
 */
function drawTriangle(ctx, cx, tipY, hw, h, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, tipY);              // Start at the tip (top)
  ctx.lineTo(cx - hw, tipY + h);    // Go to bottom-left corner
  ctx.lineTo(cx + hw, tipY + h);    // Go to bottom-right corner
  ctx.closePath();                   // Close back to the tip
  ctx.fill();                        // Fill with the specified colour
}

/**
 * drawDownArrow — Draws a downward-pointing arrow with an optional label.
 * Used to represent point loads acting downward on the beam.
 * The arrow length is proportional to the load magnitude.
 *
 * @param {CanvasRenderingContext2D} ctx    - The canvas drawing context
 * @param {number} x       - X-coordinate of the arrow (load position)
 * @param {number} startY  - Y-coordinate where the arrow starts (top)
 * @param {number} length  - Length of the arrow in pixels
 * @param {string} color   - Colour of the arrow and label
 * @param {string} label   - Text label to display above the arrow (e.g. "P1=20kN")
 */
function drawDownArrow(ctx, x, startY, length, color, label) {
  const endY = startY + length;  // Y-coordinate where the arrow ends (tip of arrowhead)

  // Draw the arrow shaft (vertical line)
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, endY); ctx.stroke();

  // Draw the arrowhead (filled triangle at the bottom)
  ctx.beginPath();
  ctx.moveTo(x, endY);            // Tip of the arrowhead
  ctx.lineTo(x - 6, endY - 10);  // Upper-left of arrowhead
  ctx.lineTo(x + 6, endY - 10);  // Upper-right of arrowhead
  ctx.closePath(); ctx.fill();

  // Draw the label above the arrow if one was provided
  if (label) {
    ctx.font = "9.5px 'Space Mono'"; ctx.textAlign = "center";
    ctx.fillText(label, x, startY - 5); // Position label just above the arrow top
  }
}

// ─────────────────────────────────────────────
//  RESULTS TABLE
// ─────────────────────────────────────────────

/**
 * buildTable — Populates the numerical results table with key section data.
 *
 * Loops through the key sections returned by the API (supports, load positions,
 * midspan) and adds one row per section to the HTML table.
 * Each row is colour-coded: green for positive, red for negative, grey for zero.
 * The section label is generated by sectionLabel() which gives a descriptive name.
 *
 * @param {{ x: number, shear: number, moment: number }[]} keySections - Key section data from API
 * @param {{ position: number, magnitude: number }[]}      loads       - Load data from API
 * @param {number}                                          span        - Total beam span
 */
function buildTable(keySections, loads, span) {
  const tbody = document.getElementById("resultsTable"); // Find the table body element
  tbody.innerHTML = ""; // Clear any previous results

  keySections.forEach(({ x, shear: V, moment: M }) => {
    // Determine CSS class for shear force cell colour:
    // td-zero = grey (near zero), td-pos = green, td-neg = red
    const Vc = Math.abs(V) < 1e-4 ? "td-zero" : V > 0 ? "td-pos" : "td-neg";

    // Same colour logic for bending moment
    const Mc = Math.abs(M) < 1e-4 ? "td-zero" : M > 0 ? "td-pos" : "td-neg";

    // Add a new table row with the section label, position, shear, and moment
    tbody.innerHTML += `
      <tr>
        <td>${sectionLabel(x, span, loads)}</td>
        <td>${x.toFixed(4)}</td>
        <td class="${Vc}">${V.toFixed(4)}</td>
        <td class="${Mc}">${M.toFixed(4)}</td>
      </tr>
    `;
  });
}

/**
 * sectionLabel — Returns a human-readable name for a given x position.
 *
 * Compares the position against known special positions (supports, midspan,
 * and load positions including the points just before and after each load)
 * and returns a descriptive label. Falls back to "x = X.XXX m" if no match.
 *
 * @param {number} x     - The x position to label (in metres)
 * @param {number} span  - Total beam span (to identify support B)
 * @param {{ position: number, magnitude: number }[]} loads - Load array for matching
 * @returns {string} Human-readable label for the table
 */
function sectionLabel(x, span, loads) {
  const EPS = 1e-3;  // Tolerance: positions within 0.001 m of each other count as a match

  // Check if this is support A (x = 0)
  if (x < EPS) return "Support A  (x = 0)";

  // Check if this is support B (x = span)
  if (Math.abs(x - span) < EPS) return "Support B  (x = " + span.toFixed(2) + " m)";

  // Check against each load position — three positions per load:
  // just before (a - 0.001), exactly at (a), and just after (a + 0.001)
  for (let i = 0; i < loads.length; i++) {
    const a    = loads[i].position;    // Load position in metres
    const P    = loads[i].magnitude;   // Load magnitude in kN
    const name = `P${i + 1} = ${P} kN  @  ${a} m`; // Human-readable load name

    if (Math.abs(x - a) < EPS)           return `At load ${name}`;
    if (Math.abs(x - (a - 1e-3)) < EPS)  return `Just before load ${name}`;
    if (Math.abs(x - (a + 1e-3)) < EPS)  return `Just after load ${name}`;
  }

  // Check if this is the midspan (L / 2)
  if (Math.abs(x - span / 2) < EPS) return `Midspan  (x = ${x.toFixed(3)} m)`;

  // If none of the above matched, just show the raw position
  return `x = ${x.toFixed(3)} m`;
}

// ─────────────────────────────────────────────
//  UI HELPER FUNCTIONS
// ─────────────────────────────────────────────

/**
 * showError — Displays an error message in the red error box below the loads section.
 * Called when the user enters invalid inputs or the server returns an error.
 *
 * @param {string} msg - The error message text to display
 */
function showError(msg) {
  const el = document.getElementById("errorMsg");
  el.textContent = `⚠  ${msg}`; // Prepend a warning symbol
  el.style.display = "block";   // Make the error box visible
}

/**
 * clearError — Hides the error message box and clears its text.
 * Called at the start of every solve attempt to reset from any previous error.
 */
function clearError() {
  const el = document.getElementById("errorMsg");
  el.style.display = "none";  // Hide the box
  el.textContent   = "";      // Clear the text
}

/**
 * setStatus — Updates the status bar at the bottom of the screen.
 *
 * The coloured dot on the left changes colour to indicate the current state:
 *   ready   → green dot  → "Ready — configure beam..."
 *   loading → blue pulsing dot → "Sending request..."
 *   success → green dot  → "Analysis complete — RA = ... kN"
 *   error   → red dot    → error message
 *
 * @param {"ready"|"loading"|"success"|"error"} type - The state type
 * @param {string} msg - The message to display in the status bar
 */
function setStatus(type, msg) {
  const dot  = document.getElementById("statusDot");   // The coloured circle element
  const text = document.getElementById("statusText");  // The text next to the dot

  // Set the dot's CSS class based on the state type
  // "error" adds the red class, "loading" adds the pulsing blue class, others get no extra class
  dot.className = "status-dot" + (
    type === "error"   ? " error"   :
    type === "loading" ? " loading" :
    ""
  );

  text.textContent = msg; // Update the status message text
}