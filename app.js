// Build the state Day1/Day2 table (used for record-keeping/UI)
function initializeForecastTable() {
  const tbody = document.getElementById("forecast-table-body");
  if (!tbody) return;

  tbody.innerHTML = "";
  states.forEach((state, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${state}</td>
      <td><select>${forecastOptions.map(o => `<option>${o}</option>`).join("")}</select></td>
      <td><select>${forecastOptions.map(o => `<option>${o}</option>`).join("")}</select></td>
    `;
    tbody.appendChild(tr);
  });
}

// Subdivision listing table (chart-only)
function renderSubdivisionTable() {
  const tbody = document.getElementById("subdivision-table-body");
  if (!tbody) return;

  tbody.innerHTML = "";
  let serial = 1;
  states.forEach(state => {
    (subdivisions || []).filter(s => s.state === state).forEach(row => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${serial++}</td>
        <td>${state}</td>
        <td>${row.subNo}</td>
        <td>${row.name}</td>
        <td contenteditable="true"></td>
      `;
      tbody.appendChild(tr);
    });
  });
}

/** Initialize Leaflet maps with IMD WMS overlays for Day-1 and Day-2 */
function initLeafletWms() {
  const view = [22.5, 80], zoom = 5;

  // Helper to build an OSM base (separate instances)
  const base = () => L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 7, minZoom: 4, attribution: "&copy; OpenStreetMap"
  });

  // Helper to add IMD WMS overlay for a given day env (Day1_Color, Day2_Color...)
  const wms = (dayEnv) => L.tileLayer.wms("https://reactjs.imd.gov.in/geoserver/imd/wms", {
    service: "WMS",
    layers: "imd:Warnings_StateDistrict_Merged",
    format: "image/png",
    transparent: true,
    version: "1.1.1",
    srs: "EPSG:4326",
    env: `day:${dayEnv}`
  });

  // Day 1
  const map1 = L.map("leafletDay1").setView(view, zoom);
  base().addTo(map1);
  wms("Day1_Color").addTo(map1);

  // Day 2
  const map2 = L.map("leafletDay2").setView(view, zoom);
  base().addTo(map2);
  wms("Day2_Color").addTo(map2);
}

// === Init ===
window.onload = () => {
  updateISTDate?.();
  initializeForecastTable();
  renderSubdivisionTable();
  initLeafletWms();
};
