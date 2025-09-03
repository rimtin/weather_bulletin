// Put this FIRST so it's the default in the selects
window.forecastColors = {
  "No Forecast Available": "pattern",   // special token handled in app.js
  "Clear Sky": "#A7D8EB",
  "Low Cloud Cover": "#C4E17F",
  "Medium Cloud Cover": "#FFF952",
  "High Cloud Cover": "#E69536",
  "Overcast Cloud Cover": "#FF4D4D"
};
window.forecastOptions = Object.keys(window.forecastColors);


// ---- SUBDIVISION ROWS (global) ----
// Keep labels exactly as your table wants (State & Sub Division columns)
window.subdivisions = [
  // Punjab
  { state: "Punjab",            name: "Punjab" },

  // Rajasthan
  { state: "Rajasthan",         name: "West-Rajasthan" },
  { state: "Rajasthan",         name: "East-Rajasthan" },

  // Gujarat
  { state: "Gujarat",           name: "West-Gujarat (Saurashtra & Kachh)" },
  { state: "Gujarat",           name: "East-Gujarat Region" },

  // Uttar Pradesh
  { state: "Uttar Pradesh",     name: "West-UP" },
  { state: "Uttar Pradesh",     name: "East-UP" },


  // Madhya Pradesh
  { state: "Madhya Pradesh",    name: "West-MP" },
  { state: "Madhya Pradesh",    name: "East-MP" },

  // Chhattisgarh
  { state: "Chhattisgarh",      name: "Chhattisgarh" },

  // Maharashtra
  { state: "Maharashtra",       name: "Madhya -MH" },
  { state: "Maharashtra",       name: "Marathwada" },
  { state: "Maharashtra",       name: "Vidarbha" },

  // Telangana
  { state: "Telangana",         name: "Telangana" },

  // Andhra Pradesh
  { state: "Andhra Pradesh",    name: "Andhra Pradesh" },
  { state: "Andhra Pradesh",    name: "SW-AP (Rayalaseema)" },

  // Karnataka
  { state: "Karnataka",         name: "North-Karnataka" },
  { state: "Karnataka",         name: "South- Karnataka" },

  // Tamil Nadu
  { state: "Tamil Nadu",        name: "Tamil Nadu" }
];

// ---- Date in header ----
function updateISTDate() {
  const istOffsetMin = 330;
  const nowUtc = new Date();
  const ist = new Date(nowUtc.getTime() + istOffsetMin * 60000);
  const formatted = ist.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  const el = document.getElementById("forecast-date");
  if (el) el.textContent = formatted;
}
