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
// IMPORTANT: names MUST match your GeoJSON "ST_NM" field exactly.
window.subdivisions = [
  // Punjab (1)
  { state: "Punjab",            name: "Punjab" },

  // Rajasthan (2)
  { state: "Rajasthan",         name: "West Rajasthan" },
  { state: "Rajasthan",         name: "East Rajasthan" },

  // Gujarat (2)
  { state: "Gujarat",           name: "Saurashtra & Kachh" },
  { state: "Gujarat",           name: "Gujarat Region" },

  // Uttar Pradesh (2)
  { state: "Uttar Pradesh",     name: "West Uttar Pradesh" },
  { state: "Uttar Pradesh",     name: "East Uttar Pradesh" },

  // Madhya Pradesh (2)
  { state: "Madhya Pradesh",    name: "West Madhya Pradesh" },
  { state: "Madhya Pradesh",    name: "East Madhya Pradesh" },

  // Chhattisgarh (1)
  { state: "Chhattisgarh",      name: "Chhattisgarh" },

  // Maharashtra (4)
  { state: "Maharashtra",       name: "Madhya Maharashtra" },
  { state: "Maharashtra",       name: "Marathwada" },
  { state: "Maharashtra",       name: "Vidarbha" },
  { state: "Maharashtra",       name: "Konkan & Goa" },

  // Telangana (1)
  { state: "Telangana",         name: "Telangana" },

  // Andhra Pradesh (2)
  { state: "Andhra Pradesh",    name: "Coastal Andhra Pradesh" },
  { state: "Andhra Pradesh",    name: "Rayalaseema" },

  // Karnataka (2)
  { state: "Karnataka",         name: "N.I. Karnataka" },
  { state: "Karnataka",         name: "S.I. Karnataka" },

  // Tamil Nadu (1)
  { state: "Tamil Nadu",        name: "Tamil Nadu & Puducherry" }
]; // → total = 20

// ---- Date header (IST) ----
function updateISTDate() {
  const formatted = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata"
  });
  const el = document.getElementById("forecast-date");
  if (el) el.textContent = formatted;
}
