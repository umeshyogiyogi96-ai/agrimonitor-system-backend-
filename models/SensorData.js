const mongoose = require('mongoose');

const SensorDataSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  temperature: { type: Number },
  humidity: { type: Number },
  soilMoisture: { type: Number },
  gas: { type: Number },
  timestamp: { type: Date, default: Date.now },
});

// Compound index for fast queries by user and recent timestamps
SensorDataSchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model('SensorData', SensorDataSchema);
