// === States shown in the main forecast (Bihar removed) ===
const states = [
  "Punjab", "Rajasthan", "Gujarat", "Uttar Pradesh",
  "Madhya Pradesh", "Chhattisgarh", "Maharashtra",
  "Telangana", "Andhra Pradesh", "Karnataka", "Tamil Nadu"
];

// Excel-style palette
const forecastColors = {
  "Clear Sky": "#A7D8EB",           // 0–10%
  "Low Cloud Cover": "#C4E17F",     // 10–30%
  "Medium Cloud Cover": "#FFF952",  // 30–50%
  "High Cloud Cover": "#E69536",    // 50–75%
  "Overcast Cloud Cover": "#FF4D4D" // 75–100%
};

const forecastOptions = Object.keys(forecastColors);

// Optional icons drawn at centroids (can remove if not needed)
const forecastIcons = {
  "Clear Sky": "☀️",
  "Low Cloud Cover": "🌤️",
  "Medium Cloud Cover": "⛅",
  "High Cloud Cover": "☁️",
  "Overcast Cloud Cover": "🌫️"
};

// === Subdivision master list (Bihar excluded) ===
const subdivisions = [
  { subNo: 1,  state: "Punjab",            name: "Punjab" },
  { subNo: 2,  state: "Rajasthan",         name: "W-Raj" },
  { subNo: 3,  state: "Rajasthan",         name: "E-Raj" },
  { subNo: 4,  state: "Gujarat",           name: "W-Gujarat (Saurashtra & Kachh)" },
  { subNo: 5,  state: "Gujarat",           name: "E-Gujarat Region" },
  { subNo: 6,  state: "Uttar Pradesh",     name: "W-UP" },
  { subNo: 7,  state: "Uttar Pradesh",     name: "E-UP" },
  // 8 = Bihar (excluded)
  { subNo: 9,  state: "Madhya Pradesh",    name: "W-MP" },
  { subNo: 10, state: "Madhya Pradesh",    name: "E-MP" },
  { subNo: 11, state: "Chhattisgarh",      name: "Chhattisgarh" },
  { subNo: 12, state: "Maharashtra",       name: "Madhya -MH" },
  { subNo: 13, state: "Maharashtra",       name: "Marathwada" },
  { subNo: 14, state: "Maharashtra",       name: "Vidarbha" },
  { subNo: 15, state: "Telangana",         name: "Telangana" },
  { subNo: 16, state: "Andhra Pradesh",    name: "Andhra Pradesh" },
  { subNo: 17, state: "Andhra Pradesh",    name: "SW-AP (Rayalaseema)" },
  { subNo: 18, state: "Karnataka",         name: "North-Karnataka" },
  { subNo: 19, state: "Karnataka",         name: "South- Karnataka" },
  { subNo: 20, state: "Tamil Nadu",        name: "Tamil Nadu" }
];

function updateISTDate() {
  const istOffsetMin = 330; // IST = UTC+5:30
  const nowUtc = new Date();
  const ist = new Date(nowUtc.getTime() + istOffsetMin * 60000);
  const formatted = ist.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  const el = document.getElementById("forecast-date");
  if (el) el.textContent = formatted;
}
