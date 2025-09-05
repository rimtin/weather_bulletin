/***********************
 * CONFIG
 ***********************/
// Use correct paths where the file actually lives + robust fallbacks
const SUBDIV_GEO_URLS = [
  "indian_met_zones.geojson",                                   // GitHub Pages root
  "assets/indian_met_zones.geojson",                            // if later moved into /assets
  "https://rimtin.github.io/weather_bulletin/indian_met_zones.geojson",
  "https://raw.githubusercontent.com/rimtin/weather_bulletin/main/indian_met_zones.geojson",
  "https://cdn.jsdelivr.net/gh/rimtin/weather_bulletin@main/indian_met_zones.geojson"
];

// Optional aliases (kept empty because we canonicalize)
const TableToGeoName = {};

/***********************
 * HELPERS
 ***********************/
const cssEscape = (s) => {
  s = String(s ?? "");
  if (window.CSS && typeof CSS.escape === "function") return CSS.escape(s);
  return s.replace(/'/g, "\\'").replace(/"/g, '\\"');
};

/** Normalize to a stable key so small spelling/style changes still match */
function canonical(input) {
  let s = String(input || "")
    .replace(/[\u2010-\u2015]/g, "-") // normalize dashes
    .toLowerCase()
    .replace(/\./g, "")                // N.I. -> NI
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .trim();

  // align to exact ST_NM spellings used in your GeoJSON
  s = s.replace(/north *interior *karnataka|n *i *karnataka/, "ni karnataka");
  s = s.replace(/south *interior *karnataka|s *i *karnataka/, "si karnataka");
  s = s.replace(/saurashtra *and *(kutch|kachchh|kachh)/, "saurashtra and kachh");
  s = s.replace(/gujarat *region/, "gujarat region");
  s = s.replace(/tamil *nadu *and *puducherry/, "tamil nadu and puducherry");

  return s.replace(/[^\w]+/g, "-");
}

function showInlineError(svg, msg) {
  const W = 860, H = 580;
  svg.attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");
  svg.append("text")
    .attr("x", W / 2)
    .attr("y", H / 2)
    .attr("text-anchor", "middle")
    .attr("font-size", 16)
    .attr("fill", "#aa0000")
    .text(msg);
}

/** Detect the property key that holds the subdivision label (prefers ST_NM) */
function pickNameKey(features) {
  const priority = [
    "ST_NM","st_nm","ST_NAME","st_name","STNAME","NAME","name",
    "SUBDIV","subdiv","SUBDIVISION","subdivision","SUB_DIV","sub_div"
  ];
  const seen = new Set();
  for (const f of features) {
    const p = f?.properties || {};
    Object.keys(p).forEach(k => seen.add(k));
  }
  for (const key of priority) if (seen.has(key)) return key;
  for (const f of features) {
    const p = f?.properties || {};
    for (const k of Object.keys(p)) if (typeof p[k] === "string" && p[k]) return k;
  }
  return "ST_NM";
}

/** (Optional) TopoJSON -> FeatureCollection support if needed */
function toFeatureCollection(jsonObj) {
  if ((jsonObj && jsonObj.type === "Topology") || jsonObj?.objects) {
    const topo = jsonObj;
    const objects = topo.objects || {};
    const firstKey = Object.keys(objects).find(k => objects[k]?.geometries?.length) || Object.keys(objects)[0];
    if (!firstKey) throw new Error("TopoJSON has no objects");
    const fc = (window.topojson || topojson).feature(topo, objects[firstKey]);
    if (!Array.isArray(fc.features)) throw new Error("TopoJSON -> FeatureCollection failed");
    return { type: "FeatureCollection", features: fc.features.filter(f => f && f.geometry) };
  }
  if (Array.isArray(jsonObj?.features)) {
    return { type: "FeatureCollection", features: jsonObj.features.filter(f => f && f.geometry) };
  }
  throw new Error("Unknown Geo format (not FeatureCollection / Topology)");
}

async function loadGeoJSON(urls) {
  let lastErr;
  for (const u of urls) {
    try {
      const joiner = u.includes("?") ? "&" : "?";
      const url = `${u}${joiner}v=${Date.now()}`;       // cache-bust
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const j = await r.json();

      const fc = toFeatureCollection(j);
      const feats = Array.isArray(fc.features) ? fc.features : [];
      if (!feats.length) {
        console.warn("[GeoJSON] Loaded but empty features:", u);
        throw new Error("Empty features");
      }
      console.info("[GeoJSON] OK:", u, "features:", feats.length);
      return fc;
    } catch (e) {
      console.warn("[GeoJSON] failed:", u, e);
      lastErr = e;
    }
  }
  throw lastErr || new Error("All URL attempts failed");
}

/** Ensure a 'No Forecast' hatch pattern exists on this SVG, return its id */
function ensureNoForecastPattern(svg) {
  const svgId = svg.attr("id") || "map";
  const patId = `${svgId}_noForecast`;
  let defs = svg.select("defs");
  if (defs.empty()) defs = svg.append("defs");

  // Only create once
  if (svg.select(`#${cssEscape(patId)}`).empty()) {
    const pattern = defs.append("pattern")
      .attr("id", patId)
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", 8)
      .attr("height", 8)
      .attr("patternTransform", "rotate(45)");

    // Base (light) background under the stripes
    pattern.append("rect")
      .attr("width", 8)
      .attr("height", 8)
      .attr("fill", "#f2f2f2");

    // Vertical stroke that becomes diagonal due to rotate(45)
    pattern.append("path")
      .attr("d", "M 0 0 L 0 8")
      .attr("stroke", "#999")
      .attr("stroke-width", 1);
  }

  svg.attr("data-nf-pattern", patId);
  return patId;
}

/***********************
 * TABLE
 ***********************/
function buildSubdivisionTable() {
  const tbody = document.getElementById("subdivision-table-body");
  if (!tbody) {
    console.error("[Table] Missing #subdivision-table-body in HTML.");
    return;
  }
  tbody.innerHTML = "";

  const groups = {};
  const list = Array.isArray(window.subdivisions) ? window.subdivisions : [];
  if (!list.length) console.warn("[Table] window.subdivisions is empty.");

  list.forEach(r => { (groups[r.state] ||= []).push(r); });

  let serial = 1;
  Object.keys(groups).forEach(state => {
    const rows = groups[state];
    rows.forEach((row, i) => {
      const tr = document.createElement("tr");
      tr.dataset.state = state;
      tr.dataset.subdiv = row.name;
      tr.dataset.norm = canonical(TableToGeoName[row.name] || row.name);

      tr.innerHTML = `
        <td>${serial++}</td>
        ${i === 0 ? `<td rowspan="${rows.length}">${state}</td>` : ""}
        <td>${row.name}</td>
        <td contenteditable="true"></td>
        <td><select class="day1">${(window.forecastOptions || []).map(o => `<option>${o}</option>`).join("")}</select></td>
        <td><select class="day2">${(window.forecastOptions || []).map(o => `<option>${o}</option>`).join("")}</select></td>
      `;
      tbody.appendChild(tr);
    });
  });

  // interactions
  tbody.querySelectorAll("select").forEach(sel =>
    sel.addEventListener("change", paintMapsFromTable)
  );

  // hover highlight on the maps
  tbody.querySelectorAll("tr").forEach(tr => {
    const id = tr.dataset.norm;
    tr.addEventListener("mouseenter", () => {
      d3.selectAll(
        `#indiaSubMapDay1 [data-norm='${cssEscape(id)}'], #indiaSubMapDay2 [data-norm='${cssEscape(id)}']`
      ).attr("stroke-width", 1.6);
    });
    tr.addEventListener("mouseleave", () => {
      d3.selectAll(
        `#indiaSubMapDay1 [data-norm='${cssEscape(id)}'], #indiaSubMapDay2 [data-norm='${cssEscape(id)}']`
      ).attr("stroke-width", 0.8);
    });
  });
}

/***********************
 * MAPS
 ***********************/
async function drawSubdivisionMap(svgSelector, onReady) {
  if (!window.d3) {
    console.error("[Map] D3 not loaded.");
    return onReady?.();
  }

  const svg = d3.select(svgSelector);
  if (svg.empty()) {
    console.error("[Map] SVG not found:", svgSelector);
    return onReady?.();
  }

  svg.selectAll("*").remove();

  // Give the SVG a concrete size so it can’t collapse
  const W = 860, H = 580;
  svg.attr("viewBox", `0 0 ${W} ${H}`)
     .attr("preserveAspectRatio", "xMidYMid meet")
     .attr("width", W)
     .attr("height", H);

  // Ensure "No Forecast" pattern is available for this SVG
  const nfPatternId = ensureNoForecastPattern(svg);

  try {
    const fc = await loadGeoJSON(SUBDIV_GEO_URLS);
    const features = fc.features || [];
    if (!features.length) {
      showInlineError(svg, "No features found in GeoJSON.");
      return onReady?.();
    }

    // Auto-detect the label key (defaults to ST_NM)
    const NAME = pickNameKey(features);
    console.info("[Map] Using name field:", NAME);

    const projection = d3.geoMercator();
    const path = d3.geoPath().projection(projection);

    projection.fitSize([W - 10, H - 10], fc);

    svg.append("g")
      .attr("class", "states")
      .selectAll("path.state")
      .data(features)
      .enter()
      .append("path")
      .attr("class", "state")
      .attr("d", path)
      .attr("data-name", d => d.properties?.[NAME] ?? "")
      .attr("data-norm", d => canonical(d.properties?.[NAME]))
      .attr("fill", "#e6e6e6")
      .attr("stroke", "#222")
      .attr("stroke-width", 0.8)
      .attr("vector-effect", "non-scaling-stroke")
      .append("title")
      .text(d => d.properties?.[NAME] ?? "");

    // Tag the SVG with the pattern id for later lookup
    svg.attr("data-nf-pattern", nfPatternId);

    // Diagnostics
    const bb = svg.node().getBoundingClientRect();
    console.info("[Map] SVG size:", Math.round(bb.width), "x", Math.round(bb.height));
    console.table(features.slice(0, 5).map(f => ({ NAME: f.properties?.[NAME] ?? "(none)" })));

    onReady?.();
  } catch (e) {
    console.error("[Map] Geo load error:", e);
    showInlineError(svg, "Failed to load subdivision map data.");
    onReady?.();
  }
}

/***********************
 * COLOR FROM TABLE (uses canonical id)
 ***********************/
function paintMapsFromTable() {
  const rows = document.querySelectorAll("#subdivision-table-body tr");
  const patt1 = document.getElementById("indiaSubMapDay1")?.getAttribute("data-nf-pattern");
  const patt2 = document.getElementById("indiaSubMapDay2")?.getAttribute("data-nf-pattern");

  rows.forEach(row => {
    const id = row.dataset.norm;
    const d1 = row.querySelector("select.day1")?.value?.trim();
    const d2 = row.querySelector("select.day2")?.value?.trim();

    const isNo1 = !d1 || /no\s*forecast/i.test(d1) || /no\s*forecast\s*available/i.test(d1) || /select/i.test(d1);
    const isNo2 = !d2 || /no\s*forecast/i.test(d2) || /no\s*forecast\s*available/i.test(d2) || /select/i.test(d2);

    const c1 = isNo1 ? (patt1 ? `url(#${patt1})` : "#f2f2f2") : ((window.forecastColors || {})[d1] || "#e6e6e6");
    const c2 = isNo2 ? (patt2 ? `url(#${patt2})` : "#f2f2f2") : ((window.forecastColors || {})[d2] || "#e6e6e6");

    d3.selectAll(`#indiaSubMapDay1 path.state[data-norm='${cssEscape(id)}']`).attr("fill", c1);
    d3.selectAll(`#indiaSubMapDay2 path.state[data-norm='${cssEscape(id)}']`).attr("fill", c2);
  });
}

/***********************
 * INIT
 ***********************/
window.addEventListener("unhandledrejection", e => {
  console.error("[Global] Unhandled promise rejection:", e.reason || e);
});

window.addEventListener("load", () => {
  if (typeof updateISTDate === "function") updateISTDate(); // Asia/Kolkata

  if (!document.getElementById("indiaSubMapDay1")) console.error("[Init] Missing <svg id='indiaSubMapDay1'> in HTML.");
  if (!document.getElementById("indiaSubMapDay2")) console.error("[Init] Missing <svg id='indiaSubMapDay2'> in HTML.");

  buildSubdivisionTable();

  drawSubdivisionMap("#indiaSubMapDay1", () => {
    drawSubdivisionMap("#indiaSubMapDay2", () => {
      paintMapsFromTable();  // initial paint with hatch where blank
    });
  });
});
// Make sure legend never intercepts hover/clicks
(function ensureLegendPassThrough(){
  if (!document.querySelector('#hotfix-map-overlay')) {
    const st = document.createElement('style');
    st.id = 'hotfix-map-overlay';
    st.textContent = `.map-legend, .map-legend * { pointer-events: none !important; }`;
    document.head.appendChild(st);
  }
})();

// Ensure SVG sizing even if CSS fails to load
(function ensureSvgSizing(){
  document.querySelectorAll('.map-wrapper svg').forEach(svg => {
    svg.style.height = 'auto';
    svg.style.aspectRatio = '860 / 580';
    svg.style.minHeight = '580px';
  });
})();
