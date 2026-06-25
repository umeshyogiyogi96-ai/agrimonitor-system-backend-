const mongoose = require('mongoose');

const DeviceControlSchema = new mongoose.Schema({
  device: { type: String, required: true, unique: true },
  state:  { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('DeviceControl', DeviceControlSchema);
