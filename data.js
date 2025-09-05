// ---- COLORS + OPTIONS (global) ----
window.forecastColors = {
  "Clear Sky": "#A7D8EB",
  "Low Cloud Cover": "#C4E17F",
  "Medium Cloud Cover": "#FFF952",
  "High Cloud Cover": "#E69536",
  "Overcast Cloud Cover": "#FF4D4D"
};
window.forecastOptions = Object.keys(window.forecastColors);

// ---- SUBDIVISION ROWS (global) ----
// IMPORTANT: Keep names exactly as in your GeoJSON ST_NM (the normalizer
// will accept small variants like Kutch/Kachchh, N.I./North Interior).
window.subdivisions = [
  // Punjab
  { state: "Punjab",            name: "Punjab" },

  // Rajasthan
  { state: "Rajasthan",         name: "West Rajasthan" },
  { state: "Rajasthan",         name: "East Rajasthan" },

  // Gujarat
  { state: "Gujarat",           name: "Saurashtra & Kachchh" }, // will also match “Kutch/Kachh”
  { state: "Gujarat",           name: "Gujarat Region" },

  // Uttar Pradesh
  { state: "Uttar Pradesh",     name: "West Uttar Pradesh" },
  { state: "Uttar Pradesh",     name: "East Uttar Pradesh" },

  // Bihar
  { state: "Bihar",             name: "Bihar" },

  // Madhya Pradesh
  { state: "Madhya Pradesh",    name: "West Madhya Pradesh" },
  { state: "Madhya Pradesh",    name: "East Madhya Pradesh" },

  // Chhattisgarh
  { state: "Chhattisgarh",      name: "Chhattisgarh" },

  // Maharashtra
  { state: "Maharashtra",       name: "Madhya Maharashtra" },
  { state: "Maharashtra",       name: "Marathwada" },
  { state: "Maharashtra",       name: "Vidarbha" },

  // Telangana
  { state: "Telangana",         name: "Telangana" },

  // Andhra Pradesh
  { state: "Andhra Pradesh",    name: "Coastal Andhra Pradesh" },
  { state: "Andhra Pradesh",    name: "Rayalaseema" },

  // Karnataka
  { state: "Karnataka",         name: "North Interior Karnataka" }, // also matches N.I. Karnataka
  { state: "Karnataka",         name: "South Interior Karnataka" }, // also matches S.I. Karnataka

  // Tamil Nadu
  { state: "Tamil Nadu",        name: "Tamil Nadu & Puducherry" }
];

// ---- Date header ----
function updateISTDate() {
  const istOffsetMin = 330;
  const nowUtc = new Date();
  const ist = new Date(nowUtc.getTime() + istOffsetMin * 60000);
  const formatted = ist.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  const el = document.getElementById("forecast-date");
  if (el) el.textContent = formatted;
}
