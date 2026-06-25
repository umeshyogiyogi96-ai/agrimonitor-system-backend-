require('dotenv').config();
const mongoose = require('mongoose');

// ── Config ─────────────────────────────────────────────────────────────────
// Uses the same MONGO_URI from .env so the simulator always targets the same
// Atlas cluster as the live backend — no hardcoded localhost connection.
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('❌  MONGO_URI is not set in .env — cannot start simulator.');
  process.exit(1);
}

// 15 minutes in milliseconds
const INSERT_INTERVAL_MS = 900_000;

// ── SensorData Schema (mirrors the real model) ─────────────────────────────
const SensorDataSchema = new mongoose.Schema({
  userId:       { type: String, required: true },
  temperature:  { type: Number },
  humidity:     { type: Number },
  soilMoisture: { type: Number },
  gas:          { type: Number },
  timestamp:    { type: Date, default: Date.now },
});
const SensorData = mongoose.model('SensorData', SensorDataSchema);

// ── Simulated user IDs — must match real userId values in your User collection
const USER_IDS = ['user_101', 'user_102', 'user_103'];

// ── Helper: random float between min and max ────────────────────────────────
const rand = (min, max) =>
  parseFloat((Math.random() * (max - min) + min).toFixed(1));

// ── Insert exactly one reading per user ─────────────────────────────────────
// Called once on startup and then once every 15 minutes.
// Each call produces one document per userId — never floods the DB.
const insertReadings = async () => {
  const now = new Date();
  const ts  = now.toLocaleTimeString();

  const docs = USER_IDS.map((userId) => ({
    userId,
    temperature:  rand(25, 35),   // °C  — realistic field range
    humidity:     rand(40, 70),   // %
    soilMoisture: rand(20, 80),   // %
    gas:          rand(100, 500), // ppm — air quality index proxy
    timestamp:    now,
  }));

  await SensorData.insertMany(docs);

  console.log(`\n[${ts}] ✅ Inserted ${docs.length} reading(s) — next insert in 15 minutes`);
  docs.forEach((d) =>
    console.log(
      `  userId: ${d.userId} | Temp: ${d.temperature}°C | ` +
      `Humidity: ${d.humidity}% | Soil: ${d.soilMoisture}% | Gas: ${d.gas} ppm`
    )
  );
};

// ── Main ────────────────────────────────────────────────────────────────────
const start = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅  Simulator connected to MongoDB');
    console.log(`🌱  Simulating readings every 15 minutes for users: ${USER_IDS.join(', ')}`);
    console.log('    Press Ctrl+C to stop.\n');

    // Insert one batch immediately so the dashboard has data right away,
    // then schedule subsequent inserts every 15 minutes.
    await insertReadings();
    setInterval(insertReadings, INSERT_INTERVAL_MS);
  } catch (err) {
    console.error('❌  Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }
};

start();
