// === Subdivision map from local GeoJSON; table controls color both maps ===

// ---- CONFIG ----
const GEOJSON_PATH = "weather_bulletin/indian_met_zones.geojson";

// Common property names found in IMD-style files
const SUBDIV_KEYS = ["SUBDIV","SubDiv","Subdivision","SUBDIVISION","NAME","name","label","LABEL"];
const STATE_KEYS  = ["STATE","STATE_UT","State","STATEUT","STATE_NAME","st_nm","ST_NM","stname","STNAME"];

// ---- UTIL ----
const normalize = s =>
  String(s || "")
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// small alias map to bridge naming differences (e.g., IMD vs. your table text)
function aliasCandidates(tableKey) {
  const a = {
    "w-gujarat saurashtra & kachh": ["saurashtra & kutch","saurashtra & kachchh","saurashtra & kachh"],
    "e-gujarat region": ["east gujarat region"],
    "w-up": ["west uttar pradesh","w uttar pradesh"],
    "e-up": ["east uttar pradesh","e uttar pradesh"],
    "w-mp": ["west madhya pradesh","w madhya pradesh"],
    "e-mp": ["east madhya pradesh","e madhya pradesh"],
    "madhya mh": ["madhya maharashtra"],
    "sw ap rayalaseema": ["rayalaseema","south andhra pradesh"],
    "north karnataka": ["north interior karnataka","north karnataka"],
    "south  karnataka": ["south interior karnataka","south karnataka"]
  };
  return a[tableKey] || [];
}

// ---- STATE ----
let geoFC = null;         // FeatureCollection
let SUBDIV_PROP = null;   // chosen property for subdivision name
let STATE_PROP  = null;   // chosen property for state name
const featuresByKey = new Map();  // normalizedName -> [feature,...]

// Build the table with dropdowns (from your `subdivisions` array)
function buildSubdivisionTable() {
  const tbody = document.getElementById("subdivision-table-body");
  tbody.innerHTML = "";

  let serial = 1;
  states.forEach(st => {
    const rows = subdivisions.filter(s => s.state === st);
    rows.forEach(row => {
      const tableKey = normalize(row.name);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${serial++}</td>
        <td>${row.state}</td>
        <td>${row.subNo ?? ""}</td>
        <td>${row.name}</td>
        <td contenteditable="true"></td>
        <td>${makeSelect(0, tableKey)}</td>
        <td>${makeSelect(1, tableKey)}</td>
      `;
      tbody.appendChild(tr);
    });
  });

  tbody.querySelectorAll("select").forEach(sel => {
    sel.addEventListener("change", repaintMaps);
  });
}

function makeSelect(day, tableKey) {
  const opts = forecastOptions.map(o => `<option value="${o}">${o}</option>`).join("");
  const blank = `<option value="" selected>— Select —</option>`;
  return `<select data-day="${day}" data-tablekey="${tableKey}" style="min-width:150px">${blank}${opts}</select>`;
}

// Resolve which GeoJSON feature keys should be colored for a given table key
function resolveFeatureKeys(tableKey) {
  const direct = featuresByKey.has(tableKey) ? [tableKey] : [];
  if (direct.length) return direct;

  const cands = aliasCandidates(tableKey);
  for (const c of cands) {
    const k = normalize(c);
    if (featuresByKey.has(k)) return [k];
  }

  // fallback: loose contains search
  for (const k of featuresByKey.keys()) {
    if (k.includes(tableKey) || tableKey.includes(k)) return [k];
  }
  return []; // none found
}

// Build a lookup: featureKey -> selected category (for a given day)
function selectionsByFeatureKey(dayIdx) {
  const map = {};
  document.querySelectorAll("#subdivision-table-body select").forEach(sel => {
    const d = Number(sel.dataset.day);
    if (d !== dayIdx) return;
    const cat = sel.value || "";
    if (!cat) return;
    const tableKey = sel.dataset.tablekey;
    resolveFeatureKeys(tableKey).forEach(k => (map[k] = cat));
  });
  return map;
}

// Draw a single map (dayIdx: 0 or 1)
function drawMap(svgId, dayIdx) {
  const svg = d3.select(svgId);
  svg.selectAll("*").remove();

  const width = 720, height = 520;
  svg.attr("viewBox", `0 0 ${width} ${height}`);

  const projection = d3.geoMercator().fitSize([width, height], geoFC);
  const path = d3.geoPath(projection);

  // Hatch pattern (kept for future use)
  const defs = svg.append("defs");
  defs.append("pattern")
    .attr("id", "diagonalHatch")
    .attr("patternUnits", "userSpaceOnUse")
    .attr("width", 6).attr("height", 6)
    .append("path").attr("d", "M0,0 l6,6")
    .attr("stroke", "#999").attr("stroke-width", 1);

  svg.append("g")
    .selectAll("path")
    .data(geoFC.features)
    .enter()
    .append("path")
    .attr("class", "subdiv")
    .attr("d", path)
    .attr("data-key", d => normalize(d.properties[SUBDIV_PROP]))
    .attr("stroke", "#333")
    .attr("stroke-width", 0.9)
    .attr("fill", "#eee")
    .on("mouseover", function(){ d3.select(this).attr("stroke-width", 2.2); })
    .on("mouseout",  function(){ d3.select(this).attr("stroke-width", 0.9); });

  // initial paint
  applyDayFill(svgId, dayIdx);
}

// Color polygons according to current selections
function applyDayFill(svgId, dayIdx) {
  const byKey = selectionsByFeatureKey(dayIdx);
  d3.select(svgId).selectAll("path.subdiv").attr("fill", function() {
    const k = this.getAttribute("data-key");
    const cat = byKey[k];
    return cat ? forecastColors[cat] : "#eee";
  });
}

// Repaint both maps
function repaintMaps() {
  applyDayFill("#indiaMapDay1", 0);
  applyDayFill("#indiaMapDay2", 1);
}

// ---- Load GeoJSON and boot ----
function pickExistingKey(obj, keys) {
  for (const k of keys) if (obj && Object.prototype.hasOwnProperty.call(obj, k)) return k;
  return null;
}

async function init() {
  if (typeof updateISTDate === "function") updateISTDate();

  // Load your local IMD subdivisions file
  const fc = await d3.json(GEOJSON_PATH).catch(err => {
    console.error("GeoJSON load error:", err);
    alert("Could not load weather_bulletin/indian_met_zones.geojson. Check the path/case.");
  });
  if (!fc) return;

  geoFC = fc.type === "FeatureCollection" ? fc : { type:"FeatureCollection", features: fc };
  if (!geoFC.features || !geoFC.features.length) {
    alert("GeoJSON is empty or invalid.");
    return;
  }

  // Detect property names
  const sample = geoFC.features[0].properties || {};
  SUBDIV_PROP = pickExistingKey(sample, SUBDIV_KEYS) || Object.keys(sample)[0];
  STATE_PROP  = pickExistingKey(sample, STATE_KEYS);

  // Index features by normalized subdivision name
  featuresByKey.clear();
  geoFC.features.forEach(f => {
    const key = normalize(f.properties[SUBDIV_PROP]);
    if (!featuresByKey.has(key)) featuresByKey.set(key, []);
    featuresByKey.get(key).push(f);
  });

  // Build table + draw maps
  buildSubdivisionTable();
  drawMap("#indiaMapDay1", 0);
  drawMap("#indiaMapDay2", 1);

  // Any change should repaint
  document.getElementById("subdivision-table-body")
    .addEventListener("change", repaintMaps);
}

// GO
window.onload = init;
