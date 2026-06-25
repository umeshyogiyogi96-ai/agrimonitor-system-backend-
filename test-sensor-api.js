// Simple test API server for sensor data
// Use this to test the API Polling Service without real hardware
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 8000;

app.use(cors());
app.use(express.json());

// Simulate realistic sensor values with slow variations
let baseTemperature = 25;
let baseHumidity = 60;
let baseSoilMoisture = 50;
let baseGas = 45;

// Generate realistic sensor data with slow drift
function generateSensorData() {
  // Add slow random walk (drift)
  baseTemperature += (Math.random() - 0.5) * 0.2;
  baseHumidity += (Math.random() - 0.5) * 0.3;
  baseSoilMoisture += (Math.random() - 0.5) * 0.4;
  baseGas += (Math.random() - 0.5) * 0.5;
  
  // Add daily cycle (simulate day/night)
  const now = new Date();
  const hours = now.getHours();
  const dailyCycle = Math.sin((hours - 12) * Math.PI / 12) * 2; // ±2°C daily cycle
  
  // Add small random noise
  const noise = () => (Math.random() - 0.5) * 0.5;
  
  return {
    temperature: parseFloat((baseTemperature + dailyCycle + noise()).toFixed(1)),
    humidity: parseFloat((baseHumidity + noise() * 2).toFixed(1)),
    soilMoisture: parseFloat((baseSoilMoisture + noise() * 3).toFixed(1)),
    gas: parseFloat((baseGas + noise() * 2).toFixed(1)),
    timestamp: now.toISOString()
  };
}

// Main sensor endpoint
app.get('/api/sensors', (req, res) => {
  const data = generateSensorData();
  console.log(`[${new Date().toLocaleTimeString()}] Serving sensor data:`, data);
  res.json(data);
});

// Alternative endpoint with different field names (for testing extraction logic)
app.get('/api/telemetry', (req, res) => {
  const data = generateSensorData();
  const altData = {
    temp: data.temperature,
    hum: data.humidity,
    soil_moisture: data.soilMoisture,
    air_quality: data.gas,
    measured_at: data.timestamp
  };
  console.log(`[${new Date().toLocaleTimeString()}] Serving telemetry (alt format):`, altData);
  res.json(altData);
});

// Nested structure endpoint
app.get('/api/v2/sensor-data', (req, res) => {
  const data = generateSensorData();
  const nestedData = {
    success: true,
    data: {
      temperature: data.temperature,
      humidity: data.humidity,
      soilMoisture: data.soilMoisture,
      gas: data.gas
    },
    metadata: {
      device_id: "test-sensor-001",
      firmware_version: "2.1.4"
    }
  };
  console.log(`[${new Date().toLocaleTimeString()}] Serving nested sensor data`);
  res.json(nestedData);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'test-sensor-api' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🌡️  Test Sensor API Server running on http://localhost:${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  GET /api/sensors        - Standard format`);
  console.log(`  GET /api/telemetry      - Alternative field names`);
  console.log(`  GET /api/v2/sensor-data - Nested structure`);
  console.log(`  GET /health            - Health check`);
  console.log(``);
  console.log(`To use with AgriMonitor:`);
  console.log(`1. Start this server: node test-sensor-api.js`);
  console.log(`2. In AgriMonitor frontend, add sensor with URL:`);
  console.log(`   http://localhost:8000/api/sensors`);
  console.log(`3. Backend polling service will fetch data every minute`);
});