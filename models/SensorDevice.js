const mongoose = require('mongoose');

const SensorDeviceSchema = new mongoose.Schema({
  userId:       { type: String, required: true, index: true },
  name:         { type: String, required: true },
  model:        { type: String, default: 'IoT Sensor' },      // Default value, not required
  pin:          { type: String, default: 'GPIO-0' },          // Default value, not required
  jsonUrl:      { type: String, default: '' },
  // Also support api_url field for compatibility
  api_url:      { type: String, default: '' },
  // Farm details captured at pairing time
  farmLocation: { type: String, default: '' },
  soilType:     { type: String, default: '' },
  phLevel:      { type: String, default: '' },
  activeCrop:   { type: String, default: '' },
  // MQTT topic identifier — used as nodes/<deviceId>/control
  // Auto-generated as AGRI_UNIT_<timestamp> if not supplied
  deviceId: { type: String, default: () => `AGRI_UNIT_${Date.now()}`, index: true },
  status:   { type: String, default: 'Connected' },
  lastSeen: { type: String, default: 'Just now' },
  // Polling service tracking fields
  lastPollSuccess: { type: Date },
  lastPollError:   { type: Date },
  lastError:       { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('SensorDevice', SensorDeviceSchema);
