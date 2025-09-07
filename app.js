/****************************
 * SOURCES (TopoJSON + GeoJSON fallback)
 ****************************/
const TOPO_URLS = [
  "india.json",
  "assets/india.json",
  "https://rimtin.github.io/weather_bulletin/india.json",
  "https://raw.githubusercontent.com/rimtin/weather_bulletin/main/india.json",
  "https://cdn.jsdelivr.net/gh/rimtin/weather_bulletin@main/india.json"
];

const GEOJSON_URLS = [
  "indian_met_zones.geojson",
  "assets/indian_met_zones.geojson",
  "https://rimtin.github.io/weather_bulletin/indian_met_zones.geojson",
  "https://raw.githubusercontent.com/rimtin/weather_bulletin/main/indian_met_zones.geojson",
  "https://cdn.jsdelivr.net/gh/rimtin/weather_bulletin@main/indian_met_zones.geojson"
];

let __FC = null;           // cached FeatureCollection
let __NAME_KEY = "st_nm";  // detected name property

const byId = id => document.getElementById(id);
const cssEscape = s =>
  (window.CSS && CSS.escape) ? CSS.escape(String(s ?? "")) : String(s ?? "").replace(/'/g,"\\'").replace(/"/g,'\\"');

async function tryFetchJSON(u){
  const url = u + (u.includes("?") ? "&" : "?") + "v=" + Date.now();
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

function nameKeyFrom(features){
  const pref = ["st_nm","ST_NM","NAME_1","name","NAME","st_name","ST_NAME","SUBDIV","subdiv"];
  const seen = new Set();
  features.forEach(f => Object.keys(f.properties||{}).forEach(k => seen.add(k)));
  for (const k of pref) if (seen.has(k)) return k;
  for (const f of features) for (const k of Object.keys(f.properties||{}))
    if (typeof f.properties[k] === "string") return k;
  return "name";
}

function isInIndiaBBox(f){
  try{
    const [lon, lat] = d3.geoCentroid(f);
    return lon > 60 && lon < 100 && lat > 5 && lat < 37;  // rough India bbox
  }catch{ return false; }
}

async function loadIndiaFeatures(){
  if (__FC) return __FC;

  // 1) Try TopoJSON – pick the object that looks like states (not Sphere/land)
  for (const u of TOPO_URLS){
    try{
      const topo = await tryFetchJSON(u);
      const objects = topo.objects || {};
      const keys = Object.keys(objects);

      // score objects by (#geometries + bonus if they have name-like props)
      let bestKey = null, bestScore = -1;
      for (const k of keys){
        const geoms = objects[k]?.geometries || [];
        const hasName = geoms.some(g => g?.properties && (
          "st_nm" in g.properties || "ST_NM" in g.properties || "NAME_1" in g.properties || "name" in g.properties
        ));
        const score = geoms.length + (hasName ? 1000 : 0);
        if (score > bestScore){ bestScore = score; bestKey = k; }
      }
      if (!bestKey) throw new Error("No usable TopoJSON object");

      const fc = (window.topojson||topojson).feature(topo, objects[bestKey]);
      let feats = (fc.features || []).filter(Boolean);

      // drop outliers (Sphere/land rings)
      feats = feats.filter(isInIndiaBBox);
      if (feats.length < 20) throw new Error("Topo candidates did not look like Indian states");

      __NAME_KEY = nameKeyFrom(feats);
      __FC = { type: "FeatureCollection", features: feats };
      console.info("[Map] Using TopoJSON object:", bestKey, "features:", feats.length, "NAME_KEY:", __NAME_KEY);
      return __FC;
    }catch(e){
      console.warn("[Topo] failed:", u, e.message || e);
    }
  }

  // 2) Fallback to your sub-division GeoJSON
  for (const u of GEOJSON_URLS){
    try{
      const gj = await tryFetchJSON(u);
      let feats = (gj.features || []).filter(f => f && f.geometry);
      feats = feats.filter(isInIndiaBBox);
      if (!feats.length) throw new Error("Empty/invalid features");
      __NAME_KEY = nameKeyFrom(feats);
      __FC = { type: "FeatureCollection", features: feats };
      console.info("[Map] Using GeoJSON fallback. features:", feats.length, "NAME_KEY:", __NAME_KEY);
      return __FC;
    }catch(e){
      console.warn("[GeoJSON] failed:", u, e.message || e);
    }
  }

  throw new Error("Could not load India features from TopoJSON or GeoJSON");
}

function ensureHatch(svg){
  const id="diagonalHatch";
  if (!svg.select("#"+id).empty()) return id;
  let defs = svg.select("defs"); if (defs.empty()) defs = svg.append("defs");
  const p = defs.append("pattern").attr("id",id)
    .attr("patternUnits","userSpaceOnUse").attr("width",6).attr("height",6)
    .attr("patternTransform","rotate(45)");
  p.append("rect").attr("width",6).attr("height",6).attr("fill","#f2f2f2");
  p.append("path").attr("d","M0,0 L0,6").attr("stroke","#999").attr("stroke-width",1);
  return id;
}

/****************************
 * DRAW ONE MAP (always fit to data)
 ****************************/
async function drawIndiaMap(svgId, dayTag){
  const svg = d3.select("#"+svgId);
  if (svg.empty()){ console.error("Missing SVG:", svgId); return; }
  svg.selectAll("*").remove();

  const W = 860, H = 580;
  svg.attr("viewBox", `0 0 ${W} ${H}`)
     .attr("preserveAspectRatio", "xMidYMid meet")
     .attr("width", null)
     .attr("height", null);

  const hatch = ensureHatch(svg);

  try{
    const fc = await loadIndiaFeatures();
    const features = fc.features;

    // Projection: fit to exactly what we will draw (no fixed scale/center)
    const projection = d3.geoConicEqualArea()
      .parallels([12, 33])
      .rotate([-82.5, 0])   // center longitudes
      .center([0, 22]);     // keep India vertical-ish
    const path = d3.geoPath().projection(projection);
    projection.fitSize([W - 12, H - 12], fc);

    const root = svg.append("g").attr("class", "viewport");

    root.append("g").attr("class", "fills")
      .selectAll("path.state")
      .data(features)
      .enter()
      .append("path")
      .attr("class", "state")
      .attr("d", path)
      .attr("id", d => d.properties?.[__NAME_KEY] ?? "")
      .attr("data-name", d => d.properties?.[__NAME_KEY] ?? "")
      .attr("data-norm", d => (d.properties?.[__NAME_KEY] ?? "").toLowerCase().replace(/[^\w]+/g,"-"))
      .attr("fill", "#e6e6e6")
      .attr("stroke", "none");

    // border overlay
    root.append("g").attr("class", "borders")
      .selectAll("path.border")
      .data(features)
      .enter()
      .append("path")
      .attr("class", "border")
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", "#666")
      .attr("stroke-width", 0.8)
      .attr("vector-effect", "non-scaling-stroke")
      .attr("pointer-events", "none");

    // simple hover feedback on fills
    svg.selectAll(".fills .state")
      .on("mouseover", function(){ d3.select(this).attr("opacity", 0.85); })
      .on("mouseout",  function(){ d3.select(this).attr("opacity", 1);  });

    // cache centroids for icon placement
    features.forEach(f => {
      const nm = f.properties?.[__NAME_KEY]; if (!nm) return;
      window.stateCentroids[nm] = path.centroid(f);
    });

    // allow hatch coloring later
    svg.attr("data-nf-pattern", hatch);

  }catch(e){
    console.error("[Map] draw error:", e);
    // draw a clear inline error so failures are visible on the page
    const g = svg.append("g");
    g.append("rect").attr("x",0).attr("y",0).attr("width","100%").attr("height","100%")
      .attr("fill","#fff");
    g.append("text").attr("x", 20).attr("y", 40).attr("font-size", 14).attr("fill", "#b00")
      .text("Failed to load India features. See console for details.");
  }
}
