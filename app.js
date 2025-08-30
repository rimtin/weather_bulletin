/* ---------- Build ONE combined table ---------- */
function renderSubdivisionForecastTable() {
  const tbody = document.getElementById("subdivision-forecast-body");
  if (!tbody) return;

  tbody.innerHTML = "";
  const subs = Array.isArray(window.subdivisions) ? window.subdivisions : [];
  const list = Array.isArray(window.states) ? window.states : [];

  if (subs.length === 0 || list.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="6" style="text-align:center;color:#b00020;font-weight:600;">
      No subdivision data found. Ensure <b>data.js</b> loads and defines <b>states</b> & <b>subdivisions</b>.
    </td>`;
    tbody.appendChild(tr);
    return;
  }

  let serial = 1;
  list.forEach(stateName => {
    const rows = subs.filter(s => s.state === stateName);
    rows.forEach((row, i) => {
      const tr = document.createElement("tr");

      if (i === 0) {
        const tdSerial = document.createElement("td");
        tdSerial.textContent = serial++;
        tdSerial.rowSpan = rows.length;

        const tdState = document.createElement("td");
        tdState.textContent = stateName;
        tdState.rowSpan = rows.length;

        tr.appendChild(tdSerial);
        tr.appendChild(tdState);
      }

      const tdSub = document.createElement("td"); tdSub.textContent = row.name; tr.appendChild(tdSub);

      const tdSites = document.createElement("td"); tdSites.contentEditable = "true"; tr.appendChild(tdSites);

      const mkSel = () => `<select>${(window.forecastOptions||[]).map(o=>`<option>${o}</option>`).join("")}</select>`;
      const tdD1 = document.createElement("td"); tdD1.innerHTML = mkSel(); tr.appendChild(tdD1);
      const tdD2 = document.createElement("td"); tdD2.innerHTML = mkSel(); tr.appendChild(tdD2);

      tbody.appendChild(tr);
    });
  });
}

/* ---------- High-DPI IMD WMS maps via Leaflet ---------- */
let wms1, wms2;

function initLeafletWms() {
  const view = [22.5, 80], zoom = 5;

  // OSM base (retina aware)
  const base = () => L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 8, minZoom: 4, detectRetina: true, attribution: "© OpenStreetMap"
  });

  // IMD WMS overlay (hi-DPI tiles)
  const wms = (dayEnv) => L.tileLayer.wms("https://reactjs.imd.gov.in/geoserver/imd/wms", {
    service: "WMS",
    layers: "imd:Warnings_StateDistrict_Merged",
    format: "image/png",                // png keeps edges crisp
    transparent: true,
    version: "1.1.1",
    srs: "EPSG:4326",
    env: `day:${dayEnv}`,
    // hi-DPI tile strategy
    tiled: true,
    tileSize: 512,       // request 512px tiles
    zoomOffset: -1,      // align 512 tiles with Leaflet zooms
    detectRetina: true,
    format_options: "dpi:192;antialiasing:full"
  });

  // Day 1
  const map1 = L.map("leafletDay1", { zoomControl:true }).setView(view, zoom);
  base().addTo(map1);
  wms1 = wms("Day1_Color").addTo(map1);

  // Day 2
  const map2 = L.map("leafletDay2", { zoomControl:true }).setView(view, zoom);
  base().addTo(map2);
  wms2 = wms("Day2_Color").addTo(map2);

  // Opacity control
  const slider = document.getElementById("wmsOpacity");
  if (slider) {
    const apply = () => { const v = Number(slider.value || 1); wms1.setOpacity(v); wms2.setOpacity(v); };
    slider.addEventListener("input", apply);
    apply();
  }
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", () => {
  updateISTDate?.();
  renderSubdivisionForecastTable();
  initLeafletWms();
});
