const SensorData    = require('../models/SensorData');
const DeviceControl = require('../models/DeviceControl');
const SensorDevice  = require('../models/SensorDevice');
const Notification  = require('../models/Notification');

const mockSensorData = {
  temperature: 28.5,
  humidity: 62,
  soilMoisture: 45,
  airQuality: 52,
  timestamp: new Date()
};

const mockHistoryData = [
  { time: '06:00', temperature: 22.4, humidity: 58, soilMoisture: 68, airQuality: 38, timestamp: new Date(Date.now() - 360000) },
  { time: '08:00', temperature: 23.1, humidity: 60, soilMoisture: 66, airQuality: 40, timestamp: new Date(Date.now() - 300000) },
  { time: '10:00', temperature: 24.8, humidity: 55, soilMoisture: 64, airQuality: 42, timestamp: new Date(Date.now() - 240000) },
  { time: '12:00', temperature: 26.2, humidity: 52, soilMoisture: 62, airQuality: 45, timestamp: new Date(Date.now() - 180000) },
  { time: '14:00', temperature: 27.5, humidity: 54, soilMoisture: 61, airQuality: 44, timestamp: new Date(Date.now() - 120000) },
  { time: '16:00', temperature: 28.5, humidity: 57, soilMoisture: 63, airQuality: 41, timestamp: new Date(Date.now() - 60000) }
];

// ── Threshold rules ────────────────────────────────────────────────────────
// Each rule defines a condition on a sensor field.
// When matched, a Notification document is saved for that user.
const THRESHOLD_RULES = [
  {
    field:    'soilMoisture',
    check:    (v) => v !== undefined && v < 30,
    title:    'Soil Moisture Critically Low',
    message:  (reading) => `Soil moisture is low (${reading.soilMoisture}%) — below the safe threshold of 30%.`,
    type:     'critical',
  },
  {
    field:    'temperature',
    check:    (v) => v !== undefined && v > 35,
    title:    'Temperature Exceeds Limit',
    message:  (reading) => `Field temperature reached ${reading.temperature}°C — exceeds max threshold of 35°C.`,
    type:     'critical',
  },
  {
    field:    'humidity',
    check:    (v) => v !== undefined && v > 80,
    title:    'Humidity Level High',
    message:  (reading) => `Relative humidity at ${reading.humidity}% — monitor for mold risk.`,
    type:     'warning',
  },
  {
    field:    'gas',
    check:    (v) => v !== undefined && v > 400,
    title:    'Air Quality Degraded',
    message:  (reading) => `Air quality index at ${reading.gas} ppm — above safe limit of 400 ppm.`,
    type:     'warning',
  },
];

// Runs after every successful sensor insert.
// Creates one Notification per triggered rule — fire-and-forget (no await).
const runThresholdChecks = (userId, reading) => {
  const triggered = THRESHOLD_RULES.filter(rule => rule.check(reading[rule.field]));
  if (triggered.length === 0) return;

  const docs = triggered.map(rule => ({
    userId,
    title:   rule.title,
    message: rule.message(reading),
    type:    rule.type,
    isRead:  false,
  }));

  Notification.insertMany(docs).catch(err =>
    console.error('[ThresholdCheck] Failed to save alerts:', err.message)
  );
};

const createSensorData = async ({ userId, temperature, humidity, soilMoisture, gas }) => {
  if (!userId) {
    throw new Error('userId is required');
  }

  return await SensorData.create({
    userId,
    temperature,
    humidity,
    soilMoisture,
    gas,
  });
};

const saveSensorData = async (req, res) => {
  try {
    const sensorData = await createSensorData(req.body);
    // Run threshold checks after a successful insert — non-blocking
    runThresholdChecks(req.body.userId, req.body);
    return res.status(201).json({ data: sensorData });
  } catch (err) {
    if (err.message === 'userId is required' || err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    return res.status(500).json({ message: err.message });
  }
};

const getUserSensorLogs = async (req, res) => {
  try {
    const { userId } = req.params;

    const logs = await SensorData.find({ userId }).sort({ timestamp: -1 });

    return res.json({ data: logs });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const getLatestSensorData = async (req, res) => {
  try {
    const userId = req.user.userId;

    try {
      // Query ONLY this user's data — never bleed another user's records
      const latestData = await SensorData.findOne({ userId }).sort({ timestamp: -1 });

      if (!latestData) {
        // No records for this user — signal frontend to show NoSensorWidget
        return res.json({ _mock: true });
      }

      return res.json({
        temperature:  latestData.temperature,
        humidity:     latestData.humidity,
        soilMoisture: latestData.soilMoisture,
        airQuality:   latestData.gas,
        timestamp:    latestData.timestamp,
      });
    } catch (dbError) {
      console.warn('[Sensor] Database error in getLatestSensorData, returning mock data:', dbError.message);
      // Return mock data when database is unavailable
      return res.json({
        ...mockSensorData,
        _mock: true
      });
    }
  } catch (err) {
    console.error('[Sensor] Error in getLatestSensorData:', err.message);
    return res.status(500).json({ message: err.message });
  }
};

const getSensorHistory = async (req, res) => {
  try {
    const userId = req.user.userId;

    try {
      // Query ONLY this user's history — never return another user's records
      const history = await SensorData.find({ userId })
        .sort({ timestamp: -1 })
        .limit(20)
        .lean();

      if (history.length === 0) {
        // No records for this user — signal frontend to show NoSensorWidget
        return res.json({ _mock: true, data: [] });
      }

      const formattedHistory = history.map((entry) => ({
        time:         new Date(entry.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        temperature:  entry.temperature,
        humidity:     entry.humidity,
        soilMoisture: entry.soilMoisture,
        airQuality:   entry.gas,
        timestamp:    entry.timestamp,
      }));

      return res.json(formattedHistory);
    } catch (dbError) {
      console.warn('[Sensor] Database error in getSensorHistory, returning mock data:', dbError.message);
      // Return mock history data when database is unavailable
      return res.json(mockHistoryData.map(item => ({
        ...item,
        _mock: true
      })));
    }
  } catch (err) {
    console.error('[Sensor] Error in getSensorHistory:', err.message);
    return res.status(500).json({ message: err.message });
  }
};

// ── GET /api/sensors/thresholds ────────────────────────────────────────────
// Aggregates last 24 hours of this user's data to return real max/min values.
const getSensorThresholds = async (req, res) => {
  try {
    const userId  = req.user.userId;
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    try {
      const [result] = await SensorData.aggregate([
        // Only this user's records from the last 24 hours
        { $match: { userId, timestamp: { $gte: since24h } } },
        {
          $group: {
            _id:            null,
            maxTemp:        { $max: '$temperature'  },
            minTemp:        { $min: '$temperature'  },
            maxHumidity:    { $max: '$humidity'     },
            minHumidity:    { $min: '$humidity'     },
            maxSoilMoisture:{ $max: '$soilMoisture' },
            minSoilMoisture:{ $min: '$soilMoisture' },
          },
        },
      ]);

      if (!result) {
        // No data in last 24h — return nulls so frontend shows '--'
        return res.json({ maxTemp: null, minTemp: null, maxHumidity: null, minHumidity: null, maxSoilMoisture: null, minSoilMoisture: null });
      }

      return res.json({
        maxTemp:          parseFloat(result.maxTemp.toFixed(1)),
        minTemp:          parseFloat(result.minTemp.toFixed(1)),
        maxHumidity:      parseFloat(result.maxHumidity.toFixed(1)),
        minHumidity:      parseFloat(result.minHumidity.toFixed(1)),
        maxSoilMoisture:  parseFloat(result.maxSoilMoisture.toFixed(1)),
        minSoilMoisture:  parseFloat(result.minSoilMoisture.toFixed(1)),
      });
    } catch (dbError) {
      console.warn('[Sensor] Database error in getSensorThresholds, returning mock data:', dbError.message);
      // Return mock threshold data
      return res.json({
        maxTemp: 28.5,
        minTemp: 22.4,
        maxHumidity: 62,
        minHumidity: 52,
        maxSoilMoisture: 68,
        minSoilMoisture: 61,
        _mock: true
      });
    }
  } catch (err) {
    console.error('[Sensor] Error in getSensorThresholds:', err.message);
    return res.status(500).json({ message: err.message });
  }
};

// ── GET /api/sensors/dashboard-alerts ──────────────────────────────────────
// Returns the 5 most recent notifications for this user's activity log.
const getDashboardAlerts = async (req, res) => {
  try {
    const userId = req.user.userId;
    const alerts = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
    return res.json(alerts);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const VALID_DEVICES = ['pump', 'fan'];

const toggleControl = async (req, res) => {
  try {
    const { device, state } = req.body;
    if (!device || !VALID_DEVICES.includes(device)) {
      return res.status(400).json({ message: 'Invalid device. Use "pump" or "fan".' });
    }
    const newState = typeof state === 'boolean' ? state : undefined;
    const record = await DeviceControl.findOneAndUpdate(
      { device },
      { state: newState !== undefined ? newState : [{ $not: '$state' }], updatedAt: new Date() },
      { new: true, upsert: true }
    );
    console.log(`[Control] ${record.device} => ${record.state ? 'ON' : 'OFF'}`);
    return res.json({ device: record.device, state: record.state });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const getControlStates = async (req, res) => {
  try {
    const records = await DeviceControl.find({ device: { $in: VALID_DEVICES } });
    const states = { pump: false, fan: false };
    records.forEach(r => { states[r.device] = r.state; });
    return res.json(states);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const getSensorDevices = async (req, res) => {
  try {
    const userId = req.user.userId;
    const devices = await SensorDevice.find({ userId }).sort({ createdAt: -1 });
    return res.json(devices);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const addSensorDevice = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Accept both camelCase and snake_case field names from frontend
    const {
      // camelCase (from current MySensors.jsx)
      name, jsonUrl, farmLocation, soilType, phLevel, activeCrop,
      // snake_case (from your description)
      sensor_name, api_url, farm_location, ph_level, active_crop, soil_type,
      // old fields that might still be sent
      model, pin
    } = req.body;
    
    // Use snake_case if provided, otherwise use camelCase
    const sensorName = sensor_name || name;
    const apiUrl = api_url || jsonUrl;
    const farmLoc = farm_location || farmLocation;
    const soilTyp = soil_type || soilType;
    const phLvl = ph_level || phLevel;
    const activeCrp = active_crop || activeCrop;
    
    // Updated validation to match frontend form fields
    // Required fields based on frontend form: sensor name, API URL, farm location, soil type
    if (!sensorName || !apiUrl || !farmLoc || !soilTyp) {
      return res.status(400).json({ 
        message: 'Sensor name, API URL, farm location, and soil type are required.' 
      });
    }

    const device = await SensorDevice.create({
      userId,
      name:         sensorName,
      model:        model      || 'IoT Sensor',      // Default value since not in frontend form
      pin:          pin        || 'GPIO-0',          // Default value since not in frontend form
      jsonUrl:      apiUrl,
      farmLocation: farmLoc,
      soilType:     soilTyp,
      phLevel:      phLvl      || '',
      activeCrop:   activeCrp   || '',
    });

    // Sync farm details to the User profile so ProfilePage reflects them.
    // Only overwrite fields the user actually filled in (don't blank existing data).
    const profileUpdates = {};
    if (farmLoc) profileUpdates.location    = farmLoc;
    if (soilTyp) profileUpdates.soilType     = soilTyp;
    if (phLvl)   profileUpdates.phLevel      = phLvl;
    if (activeCrp) profileUpdates.activeCrops  = [activeCrp];

    if (Object.keys(profileUpdates).length > 0) {
      const User = require('../models/User');
      await User.updateOne({ userId }, { $set: profileUpdates });
    }

    return res.status(201).json(device);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const deleteSensorDevice = async (req, res) => {
  try {
    const { id }   = req.params;
    const userId   = req.user.userId;

    // Security scope: only delete if this document belongs to the logged-in user.
    // Passing both _id and userId prevents one user deleting another user's device.
    const deleted = await SensorDevice.findOneAndDelete({ _id: id, userId });

    if (!deleted) {
      // Either the ID doesn't exist or it belongs to a different user
      return res.status(404).json({ message: 'Sensor not found or access denied.' });
    }

    return res.json({ message: 'Sensor deleted successfully.', id });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

module.exports = { saveSensorData, getUserSensorLogs, createSensorData, getLatestSensorData, getSensorHistory, getSensorThresholds, getDashboardAlerts, toggleControl, getControlStates, getSensorDevices, addSensorDevice, deleteSensorDevice };
