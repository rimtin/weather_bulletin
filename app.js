/***********************
 * CONFIG
 ***********************/
const SUBDIV_GEO_URLS = [
  "assets/indian_met_zones.geojson",
  "https://raw.githubusercontent.com/rimtin/weather_bulletin/main/assets/indian_met_zones.geojson",
  "https://cdn.jsdelivr.net/gh/rimtin/weather_bulletin@main/assets/indian_met_zones.geojson"
];

// optional aliases if you ever need them; we mostly rely on canonical()
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
const cssEscape = s => String(s).replace(/'/g, "\\'");

/** Turn a name into a stable key so small spelling/style changes still match */
function canonical(input) {
  let s = String(input || "")
    .toLowerCase()
    .replace(/\./g, "")      // remove dots (N.I. -> NI)
    .replace(/&/g, "and")    // unify ampersand
    .replace(/\s+/g, " ")    // collapse whitespace
    .trim();

  // common IMD variants
  s = s.replace(/north *interior *karnataka|n *i *karnataka/, "ni karnataka");
  s = s.replace(/south *interior *karnataka|s *i *karnataka/, "si karnataka");
  s = s.replace(/saurashtra *and *(kutch|kachchh|kachh)/, "saurashtra and kachchh");
  s = s.replace(/gujarat *region/, "gujarat region");
  s = s.replace(/tamil *nadu *and *puducherry/, "tamil nadu and puducherry");

  return s.replace(/[^\w]+/g, "-"); // → "saurashtra-and-kachchh", "ni-karnataka", ...
}

async function loadGeoJSON(urls) {
  let last;
  for (const u of urls) {
    try {
      const r = await fetch(u + (u.startsWith("http") ? `?v=${Date.now()}` : ""));
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const j = await r.json();
      console.log("[GeoJSON] loaded:", u, "features:", (j.features || []).length);
      return j;
    } catch (e) {
      console.warn("[GeoJSON] failed:", u, e);
      last = e;
    }
  }
  throw last || new Error("All URLs failed");
}

/***********************
 * TABLE
 ***********************/
function buildSubdivisionTable() {
  const tbody = document.getElementById("subdivision-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  // group by state for rowspans
  const groups = {};
  (window.subdivisions || []).forEach(r => {
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
  const svg = d3.select(svgSelector);
  svg.selectAll("*").remove();

  const W = 860, H = 580;
  svg.attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");

  try {
    const geo = await loadGeoJSON(SUBDIV_GEO_URLS);
    const features = geo.features || [];
    const fc = { type: "FeatureCollection", features };
    const NAME = "ST_NM"; // IMD sub-division field

    const projection = d3.geoMercator();
    const path = d3.geoPath().projection(projection);
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
      .on("mouseover", function () { d3.select(this).attr("stroke-width", 1.6); })
      .on("mouseout", function () { d3.select(this).attr("stroke-width", 0.8); });

    if (typeof onReady === "function") onReady();
  } catch (e) {
    console.error("Geo load error:", e);
    if (typeof onReady === "function") onReady();
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
window.addEventListener("load", () => {
  if (typeof updateISTDate === "function") updateISTDate();

  buildSubdivisionTable();

  drawSubdivisionMap("#indiaSubMapDay1", () => {
    drawSubdivisionMap("#indiaSubMapDay2", () => {
      paintMapsFromTable();  // initial paint
    });
  });
});
