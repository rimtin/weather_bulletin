/***********************
 * CONFIG
 ***********************/
const SUBDIV_GEO_URLS = [
  "indian_met_zones.geojson",
  "assets/indian_met_zones.geojson",
  "https://rimtin.github.io/weather_bulletin/indian_met_zones.geojson",
  "https://raw.githubusercontent.com/rimtin/weather_bulletin/main/indian_met_zones.geojson",
  "https://cdn.jsdelivr.net/gh/rimtin/weather_bulletin@main/indian_met_zones.geojson"
];
const TableToGeoName = {};

/***********************
 * HELPERS
 ***********************/
const cssEscape = s => (window.CSS && CSS.escape ? CSS.escape(String(s ?? "")) : String(s ?? "").replace(/'/g,"\\'").replace(/"/g,'\\"'));

function canonical(input){
  let s = String(input||"")
    .replace(/[\u2010-\u2015]/g,"-").toLowerCase()
    .replace(/\./g,"").replace(/&/g,"and").replace(/\s+/g," ").trim();
  s = s.replace(/north *interior *karnataka|n *i *karnataka/,"ni karnataka");
  s = s.replace(/south *interior *karnataka|s *i *karnataka/,"si karnataka");
  s = s.replace(/saurashtra *and *(kutch|kachchh|kachh)/,"saurashtra and kachh");
  s = s.replace(/gujarat *region/,"gujarat region");
  s = s.replace(/tamil *nadu *and *puducherry/,"tamil nadu and puducherry");
  return s.replace(/[^\w]+/g,"-");
}

function showInlineError(svg, msg){
  const W=860,H=580;
  svg.attr("viewBox",`0 0 ${W} ${H}`).attr("preserveAspectRatio","xMidYMid meet");
  svg.append("text").attr("x",W/2).attr("y",H/2).attr("text-anchor","middle").attr("font-size",16).attr("fill","#a00").text(msg);
}

function pickNameKey(features){
  const priority=["ST_NM","st_nm","ST_NAME","st_name","STNAME","NAME","name","SUBDIV","subdiv","SUBDIVISION","subdivision","SUB_DIV","sub_div"];
  const seen=new Set(); features.forEach(f=>Object.keys(f?.properties||{}).forEach(k=>seen.add(k)));
  for(const k of priority) if(seen.has(k)) return k;
  for(const f of features){ for(const k of Object.keys(f?.properties||{})) if(typeof f.properties[k]==="string"&&f.properties[k]) return k; }
  return "ST_NM";
}

function toFeatureCollection(j){
  if(j?.type==="Topology"||j?.objects){
    const k = Object.keys(j.objects).find(x=>j.objects[x]?.geometries?.length)||Object.keys(j.objects)[0];
    const fc = (window.topojson||topojson).feature(j,j.objects[k]);
    return {type:"FeatureCollection", features:(fc.features||[]).filter(f=>f&&f.geometry)};
  }
  return {type:"FeatureCollection", features:(j.features||[]).filter(f=>f&&f.geometry)};
}

async function loadGeoJSON(urls){
  let last;
  for(const u of urls){
    try{
      const r = await fetch(u+(u.includes("?")?"&":"?")+"v="+Date.now(), {cache:"no-store"});
      if(!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const fc = toFeatureCollection(await r.json());
      if(!fc.features.length) throw new Error("Empty features");
      console.info("[GeoJSON] OK:", u, "features:", fc.features.length);
      return fc;
    }catch(e){ console.warn("[GeoJSON] failed:", u, e); last=e; }
  }
  throw last||new Error("All URLs failed");
}

function ensureNoForecastPattern(svg){
  const id=(svg.attr("id")||"map")+"_noForecast";
  let defs=svg.select("defs"); if(defs.empty()) defs=svg.append("defs");
  if(svg.select("#"+cssEscape(id)).empty()){
    const p=defs.append("pattern").attr("id",id).attr("patternUnits","userSpaceOnUse").attr("width",8).attr("height",8).attr("patternTransform","rotate(45)");
    p.append("rect").attr("width",8).attr("height",8).attr("fill","#f2f2f2");
    p.append("path").attr("d","M 0 0 L 0 8").attr("stroke","#999").attr("stroke-width",1);
  }
  svg.attr("data-nf-pattern",id);
  return id;
}

// fit using only "near India" features; then draw all features
function featuresNearIndia(features){
  const LON_MIN=60, LON_MAX=100, LAT_MIN=-5, LAT_MAX=40;
  return features.filter(f=>{
    try{ const [x,y]=d3.geoCentroid(f); return isFinite(x)&&isFinite(y)&&x>=LON_MIN&&x<=LON_MAX&&y>=LAT_MIN&&y<=LAT_MAX; }
    catch{ return false; }
  });
}

function setRowActive(norm,on){
  const row=document.querySelector(`#subdivision-table-body tr[data-norm='${cssEscape(norm)}']`);
  if(row) row.classList.toggle("active-row", !!on);
}

/***********************
 * TABLE
 ***********************/
function buildSubdivisionTable(){
  const tbody=document.getElementById("subdivision-table-body");
  if(!tbody){ console.error("[Table] Missing #subdivision-table-body"); return; }
  tbody.innerHTML="";

  const groups={};
  (window.subdivisions||[]).forEach(r => (groups[r.state]??=[]).push(r));

  // add a placeholder so blank = hatch
  const opts = ["— Select —", ...(window.forecastOptions||[])];

  let serial=1;
  Object.keys(groups).forEach(state=>{
    const rows=groups[state];
    rows.forEach((row,i)=>{
      const tr=document.createElement("tr");
      tr.dataset.state=state;
      tr.dataset.subdiv=row.name;
      tr.dataset.norm=canonical(TableToGeoName[row.name]||row.name);
      tr.innerHTML=`
        <td>${serial++}</td>
        ${i===0?`<td rowspan="${rows.length}">${state}</td>`:""}
        <td>${row.name}</td>
        <td contenteditable="true"></td>
        <td><select class="day1">${opts.map(o=>`<option>${o}</option>`).join("")}</select></td>
        <td><select class="day2">${opts.map(o=>`<option>${o}</option>`).join("")}</select></td>
      `;
      tbody.appendChild(tr);
    });
  });

  // paint when a select changes
  tbody.querySelectorAll("select").forEach(sel=>sel.addEventListener("change", paintMapsFromTable));

  // table → map hover
  tbody.querySelectorAll("tr").forEach(tr=>{
    const id=tr.dataset.norm;
    tr.addEventListener("mouseenter",()=>{
      d3.selectAll(
        `#indiaSubMapDay1 .borders .border[data-norm='${cssEscape(id)}'],`+
        `#indiaSubMapDay2 .borders .border[data-norm='${cssEscape(id)}']`
      ).attr("stroke-width",1.6).attr("stroke","#000");
    });
    tr.addEventListener("mouseleave",()=>{
      d3.selectAll(
        `#indiaSubMapDay1 .borders .border[data-norm='${cssEscape(id)}'],`+
        `#indiaSubMapDay2 .borders .border[data-norm='${cssEscape(id)}']`
      ).attr("stroke-width",0.6).attr("stroke","#666");
    });
  });
}

/***********************
 * MAPS
 ***********************/
async function drawSubdivisionMap(svgSelector, onReady){
  if(!window.d3){ console.error("[Map] D3 not loaded."); return onReady?.(); }
  const svg=d3.select(svgSelector);
  if(svg.empty()){ console.error("[Map] SVG not found:", svgSelector); return onReady?.(); }
  svg.selectAll("*").remove();

  const W=860,H=580,M=14;
  svg.attr("viewBox",`0 0 ${W} ${H}`).attr("preserveAspectRatio","xMidYMid meet").attr("width",W).attr("height",H);

  const nfPatternId=ensureNoForecastPattern(svg);

  try{
    const fc=await loadGeoJSON(SUBDIV_GEO_URLS);
    const features=fc.features||[];
    if(!features.length){ showInlineError(svg,"No features found in GeoJSON."); return onReady?.(); }

    const NAME=pickNameKey(features);

    // Proportion-correct projection + padded fit
    const projection=d3.geoConicEqualArea().parallels([12,33]).center([82.5,22]);
    const path=d3.geoPath().projection(projection);
    const fit=featuresNearIndia(features);
    projection.fitExtent([[M,M],[W-M,H-M]], {type:"FeatureCollection", features: fit.length?fit:features});

    // Fills
    const fillsG=svg.append("g").attr("class","fills");
    fillsG.selectAll("path.state")
      .data(features).enter().append("path")
      .attr("class","state").attr("d",path)
      .attr("data-name",d=>d.properties?.[NAME]??"")
      .attr("data-norm",d=>canonical(d.properties?.[NAME]))
      .attr("fill","#e6e6e6").attr("stroke","none").attr("vector-effect","non-scaling-stroke")
      .on("mouseenter",(ev,d)=>{
        const id=canonical(d.properties?.[NAME]);
        d3.selectAll(
          `#indiaSubMapDay1 .borders .border[data-norm='${cssEscape(id)}'],`+
          `#indiaSubMapDay2 .borders .border[data-norm='${cssEscape(id)}']`
        ).attr("stroke-width",1.6).attr("stroke","#000");
        setRowActive(id,true);
      })
      .on("mouseleave",(ev,d)=>{
        const id=canonical(d.properties?.[NAME]);
        d3.selectAll(
          `#indiaSubMapDay1 .borders .border[data-norm='${cssEscape(id)}'],`+
          `#indiaSubMapDay2 .borders .border[data-norm='${cssEscape(id)}']`
        ).attr("stroke-width",0.6).attr("stroke","#666");
        setRowActive(id,false);
      })
      .append("title").text(d=>d.properties?.[NAME]??"");

    // Borders overlay
    svg.append("g").attr("class","borders")
      .selectAll("path.border").data(features).enter().append("path")
      .attr("class","border").attr("d",path)
      .attr("fill","none").attr("stroke","#666").attr("stroke-width",0.6)
      .attr("vector-effect","non-scaling-stroke").attr("pointer-events","none")
      .attr("data-name",d=>d.properties?.[NAME]??"")
      .attr("data-norm",d=>canonical(d.properties?.[NAME]));

    svg.attr("data-nf-pattern", nfPatternId);
    onReady?.();
  }catch(e){
    console.error("[Map] Geo load error:", e);
    showInlineError(svg,"Failed to load subdivision map data.");
    onReady?.();
  }
}

/***********************
 * COLOR FROM TABLE
 ***********************/
function paintMapsFromTable(){
  const rows=document.querySelectorAll("#subdivision-table-body tr");
  const patt1=document.getElementById("indiaSubMapDay1")?.getAttribute("data-nf-pattern");
  const patt2=document.getElementById("indiaSubMapDay2")?.getAttribute("data-nf-pattern");

  rows.forEach(row=>{
    const id=row.dataset.norm;
    const v1=row.querySelector("select.day1")?.value?.trim();
    const v2=row.querySelector("select.day2")?.value?.trim();

    const no1=!v1 || /select/i.test(v1) || /no\s*forecast/i.test(v1);
    const no2=!v2 || /select/i.test(v2) || /no\s*forecast/i.test(v2);

    const c1=no1 ? (patt1?`url(#${patt1})`:"#f2f2f2") : ((window.forecastColors||{})[v1]||"#e6e6e6");
    const c2=no2 ? (patt2?`url(#${patt2})`:"#f2f2f2") : ((window.forecastColors||{})[v2]||"#e6e6e6");

    d3.selectAll(`#indiaSubMapDay1 .fills path.state[data-norm='${cssEscape(id)}']`).attr("fill", c1);
    d3.selectAll(`#indiaSubMapDay2 .fills path.state[data-norm='${cssEscape(id)}']`).attr("fill", c2);
  });
}

/***********************
 * INIT
 ***********************/
window.addEventListener("load", ()=>{
  if(typeof updateISTDate==="function") updateISTDate();
  buildSubdivisionTable();

  // draw maps then paint initial (so selects immediately color the map)
  drawSubdivisionMap("#indiaSubMapDay1", ()=>{
    drawSubdivisionMap("#indiaSubMapDay2", ()=>{
      paintMapsFromTable();
    });
  });
});
