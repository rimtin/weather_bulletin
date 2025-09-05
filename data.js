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
// Keep labels exactly as you want in the table (column “Sub Division”).
window.subdivisions = [
  // Punjab
  { state: "Punjab",            name: "Punjab" },

  // Rajasthan
  { state: "Rajasthan",         name: "W-Raj" },
  { state: "Rajasthan",         name: "E-Raj" },

  // Gujarat
  { state: "Gujarat",           name: "W-Gujarat (Saurashtra & Kachh)" },
  { state: "Gujarat",           name: "E-Gujarat Region" },

  // Uttar Pradesh
  { state: "Uttar Pradesh",     name: "W-UP" },
  { state: "Uttar Pradesh",     name: "E-UP" },

  // Bihar
  { state: "Bihar",             name: "Bihar" },

  // Madhya Pradesh
  { state: "Madhya Pradesh",    name: "W-MP" },
  { state: "Madhya Pradesh",    name: "E-MP" },

  // Chhattisgarh
  { state: "Chhattisgarh",      name: "Chhattisgarh" },

  // Maharashtra
  { state: "Maharashtra",       name: "Madhya -MH" },
  { state: "Maharashtra",       name: "Marathwada" },
  { state: "Maharashtra",       name: "Vidarbha" },

  // Telangana
  { state: "Telangana",         name: "Telangana" },

  // Andhra Pradesh
  { state: "Andhra Pradesh",    name: "Andhra Pradesh" },        // Coastal AP
  { state: "Andhra Pradesh",    name: "SW-AP (Rayalaseema)" },   // Rayalaseema

  // Karnataka
  { state: "Karnataka",         name: "North-Karnataka" },
  { state: "Karnataka",         name: "South- Karnataka" },

  // Tamil Nadu
  { state: "Tamil Nadu",        name: "Tamil Nadu" }
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
