/***********************
 * CONFIG
 ***********************/
// Use correct paths where the file actually lives + robust fallbacks
const SUBDIV_GEO_URLS = [
  // GitHub Pages root
  "indian_met_zones.geojson",
  // If you later move it into /assets
  "assets/indian_met_zones.geojson",
  // Live Pages URL
  "https://rimtin.github.io/weather_bulletin/indian_met_zones.geojson",
  // Raw + jsDelivr fallbacks
  "https://raw.githubusercontent.com/rimtin/weather_bulletin/main/indian_met_zones.geojson",
  "https://cdn.jsdelivr.net/gh/rimtin/weather_bulletin@main/indian_met_zones.geojson"
];

// Optional aliases (kept empty because we canonicalize)
const TableToGeoName = {};

/***********************
 * GLOBALS (from data.js)
 * - window.subdivisions
 * - window.forecastOptions
 * - window.forecastColors
 * - updateISTDate()
 ***********************/

/***********************
 * HELPERS
 ***********************/
const cssEscape = (s) => {
  s = String(s ?? "");
  if (window.CSS && typeof CSS.escape === "function") return CSS.escape(s);
  // basic fallback
  return s.replace(/'/g, "\\'").replace(/"/g, '\\"');
};

/** Normalize to a stable key so small spelling/style changes still match */
function canonical(input) {
  let s = String(input || "")
    .toLowerCase()
    .replace(/\./g, "")      // remove dots (N.I. -> NI)
    .replace(/&/g, "and")    // unify ampersand
    .replace(/\s+/g, " ")    // collapse whitespace
    .trim();

  // align to exact ST_NM spellings used in your GeoJSON
  s = s.replace(/north *interior *karnataka|n *i *karnataka/, "ni karnataka");
  s = s.replace(/south *interior *karnataka|s *i *karnataka/, "si karnataka");
  // IMPORTANT: canonicalize to "saurashtra and kachh" (one 'h'), matching ST_NM
  s = s.replace(/saurashtra *and *(kutch|kachchh|kachh)/, "saurashtra and kachh");
  s = s.replace(/gujarat *region/, "gujarat region");
  s = s.replace(/tamil *nadu *and *puducherry/, "tamil nadu and puducherry");

  return s.replace(/[^\w]+/g, "-"); // → "saurashtra-and-kachh", "ni-karnataka", ...
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

async function loadGeoJSON(urls) {
  let lastErr;
  for (const u of urls) {
    try {
      // Bust caches on all URLs (including relative paths)
      const joiner = u.includes("?") ? "&" : "?";
      const url = `${u}${joiner}v=${Date.now()}`;
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const j = await r.json();

      // Validate
      const feats = Array.isArray(j?.features) ? j.features : [];
      const validFeats = feats.filter(f => f && f.geometry);
      if (!feats.length || !validFeats.length) {
        console.warn("[GeoJSON] Loaded but empty or no valid geometries:", u);
        throw new Error("Empty features or invalid geometry");
      }

      console.info("[GeoJSON] OK:", u, "features:", feats.length, "valid:", validFeats.length);
      return { type: "FeatureCollection", features: validFeats };
    } catch (e) {
      console.warn("[GeoJSON] failed:", u, e);
      lastErr = e;
    }
  }
  throw lastErr || new Error("All URL attempts failed");
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

  // group by state for rowspans
  const groups = {};
  const list = Array.isArray(window.subdivisions) ? window.subdivisions : [];
  if (!list.length) console.warn("[Table] window.subdivisions is empty.");

  list.forEach(r => {
    (groups[r.state] ||= []).push(r);
  });

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
    console.error("[Map] D3 not loaded. Make sure <script src='https://d3js.org/d3.v7.min.js'></script> is present.");
    return onReady?.();
  }

  const svg = d3.select(svgSelector);
  if (svg.empty()) {
    console.error("[Map] SVG not found:", svgSelector);
    return onReady?.();
  }

  svg.selectAll("*").remove();

  const W = 860, H = 580;
  svg.attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");

  try {
    const fc = await loadGeoJSON(SUBDIV_GEO_URLS);
    const features = fc.features || [];
    if (!features.length) {
      showInlineError(svg, "No features found in GeoJSON.");
      return onReady?.();
    }

    const NAME = "ST_NM"; // IMD sub-division field

    const projection = d3.geoMercator();
    const path = d3.geoPath().projection(projection);

    // Safety: fit only on valid geometry
    projection.fitSize([W - 10, H - 10], fc);

    svg.selectAll("path.state")
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
      .on("mouseover", function () { d3.select(this).attr("stroke-width", 1.6); })
      .on("mouseout", function () { d3.select(this).attr("stroke-width", 0.8); });

    // Helpful console preview
    console.table(
      features.slice(0, 5).map(f => ({ ST_NM: f.properties?.[NAME] ?? "(none)" }))
    );

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
  rows.forEach(row => {
    const id = row.dataset.norm;
    const d1 = row.querySelector("select.day1")?.value;
    const d2 = row.querySelector("select.day2")?.value;
    const c1 = (window.forecastColors || {})[d1] || "#e6e6e6";
    const c2 = (window.forecastColors || {})[d2] || "#e6e6e6";

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
  if (typeof updateISTDate === "function") updateISTDate(); // use the Asia/Kolkata version

  // Quick checks to avoid silent failures
  if (!document.getElementById("indiaSubMapDay1")) {
    console.error("[Init] Missing <svg id='indiaSubMapDay1'> in HTML.");
  }
  if (!document.getElementById("indiaSubMapDay2")) {
    console.error("[Init] Missing <svg id='indiaSubMapDay2'> in HTML.");
  }

  buildSubdivisionTable();

  drawSubdivisionMap("#indiaSubMapDay1", () => {
    drawSubdivisionMap("#indiaSubMapDay2", () => {
      paintMapsFromTable();  // initial paint
    });
  });
});
