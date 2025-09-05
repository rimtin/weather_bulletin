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
// IMPORTANT: Keep names EXACTLY as in your GeoJSON ST_NM (case & spelling).
window.subdivisions = [
  // Punjab
  { state: "Punjab",            name: "Punjab" },

  // Rajasthan
  { state: "Rajasthan",         name: "West Rajasthan" },
  { state: "Rajasthan",         name: "East Rajasthan" },

  // Gujarat
  { state: "Gujarat",           name: "Saurashtra & Kachh" },     // fixed from "Kachchh"
  { state: "Gujarat",           name: "Gujarat region" },         // fixed case

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
  { state: "Karnataka",         name: "N.I. Karnataka" },         // fixed from "North Interior Karnataka"
  { state: "Karnataka",         name: "S.I. Karnataka" },         // fixed from "South Interior Karnataka"

  // Tamil Nadu
  { state: "Tamil Nadu",        name: "Tamil Nadu & Puducherry" }
];

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
