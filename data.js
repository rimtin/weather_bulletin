// === Forecast color palette ===
const forecastColors = {
  "Clear Sky": "#A7D8EB",           // 0–10%
  "Low Cloud Cover": "#C4E17F",     // 10–30%
  "Medium Cloud Cover": "#FFF952",  // 30–50%
  "High Cloud Cover": "#E69536",    // 50–75%
  "Overcast Cloud Cover": "#FF4D4D" // 75–100%
};
const forecastOptions = Object.keys(forecastColors);

// === Subdivision master list (single table). Bihar excluded ===
// Column order: [A serial, B forecast (dropdown), C state, D subdivision, E sites]
const subdivisions = [
  // Punjab
  { state: "Punjab",            name: "Punjab" },

  // Rajasthan (split)
  { state: "Rajasthan",         name: "West Rajasthan" },
  { state: "Rajasthan",         name: "East Rajasthan" },

  // Gujarat (split)
  { state: "Gujarat",           name: "West Gujarat" },      // Saurashtra & Kutch
  { state: "Gujarat",           name: "East Gujarat Region" }, // Gujarat Region

  // Uttar Pradesh (split)
  { state: "Uttar Pradesh",     name: "West Uttar Pradesh" },
  { state: "Uttar Pradesh",     name: "East Uttar Pradesh" },

  // Madhya Pradesh (split)
  { state: "Madhya Pradesh",    name: "West Madhya Pradesh" },
  { state: "Madhya Pradesh",    name: "East Madhya Pradesh" },

  // Chhattisgarh
  { state: "Chhattisgarh",      name: "Chhattisgarh" },

  // Maharashtra (3 parts)
  { state: "Maharashtra",       name: "Madhya_MH" },     // Madhya Maharashtra
  { state: "Maharashtra",       name: "Marathwada" },
  { state: "Maharashtra",       name: "Vidarbha" },

  // Telangana
  { state: "Telangana",         name: "Telangana" },

  // Andhra Pradesh (2 parts)
  { state: "Andhra Pradesh",    name: "Andhra Pradesh" },     // Coastal Andhra Pradesh
  { state: "Andhra Pradesh",    name: "SW-AP (Rayalaseema)" },// Rayalaseema

  // Karnataka (split)
  { state: "Karnataka",         name: "North Karnataka" },    // North Interior Karnataka
  { state: "Karnataka",         name: "South Karnataka" },    // South Interior Karnataka

  // Tamil Nadu
  { state: "Tamil Nadu",        name: "Tamil Nadu" }
];

// IST date on the header
function updateISTDate() {
  const istOffsetMin = 330;
  const nowUtc = new Date();
  const ist = new Date(nowUtc.getTime() + istOffsetMin * 60000);
  const formatted = ist.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  const el = document.getElementById("forecast-date");
  if (el) el.textContent = formatted;
}
