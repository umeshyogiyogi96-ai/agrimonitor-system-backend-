const User = require('../models/User');
const SensorData = require('../models/SensorData');
const SensorDevice = require('../models/SensorDevice');
const { publishCommand } = require('../config/mqtt');
const { setActiveDevices, getTrafficSeries } = require('../middleware/requestTracker');

const getAdminOverview = async (req, res) => {
  try {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    const totalUsers = await User.countDocuments({ role: 'user' });

    const latestByUser = await SensorData.aggregate([
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id:          '$userId',
          userId:       { $first: '$userId' },
          temperature:  { $first: '$temperature' },
          humidity:     { $first: '$humidity' },
          soilMoisture: { $first: '$soilMoisture' },
          gas:          { $first: '$gas' },
          timestamp:    { $first: '$timestamp' },
        },
      },
      { $sort: { timestamp: -1 } },
    ]);

    // Join email + name from User collection for each device entry
    const userMap = {};
    const userIds = latestByUser.map(e => e.userId);
    const users   = await User.find({ userId: { $in: userIds } }).select('userId name email').lean();
    users.forEach(u => { userMap[u.userId] = u; });

    const devices = latestByUser.map((entry) => ({
      userId:       entry.userId,
      name:         userMap[entry.userId]?.name  || entry.userId,
      email:        userMap[entry.userId]?.email || '',
      temperature:  entry.temperature,
      humidity:     entry.humidity,
      soilMoisture: entry.soilMoisture,
      gas:          entry.gas,
      timestamp:    entry.timestamp,
      status:       entry.timestamp >= thirtyMinutesAgo ? 'Online' : 'Offline',
    }));

    const recentEntries = await SensorData.find()
      .sort({ timestamp: -1 })
      .limit(20)
      .lean();

    return res.json({
      summary: { totalUsers, totalDevices: devices.length },
      devices,
      recentEntries,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── GET /api/admin/system-stats ────────────────────────────────────────────────
// Live system metrics: user/device counts + last 10 minutes of HTTP traffic.
const getSystemStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: 'user' });

    const onlineDevices  = await SensorDevice.countDocuments({ status: /^connected$/i });
    const totalDevices   = await SensorDevice.countDocuments({});
    const offlineDevices = totalDevices - onlineDevices;

    setActiveDevices(onlineDevices);

    return res.json({
      totalUsers,
      onlineDevices,
      offlineDevices,
      totalDevices,
      traffic: getTrafficSeries(),
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── GET /api/admin/users ───────────────────────────────────────────────────────
// Returns all farmer accounts with their primary connected deviceId.
const getAllUsers = async (req, res) => {
  try {
    const users = await User.aggregate([
      { $match: { role: 'user' } },
      {
        $lookup: {
          from:         'sensordevices',
          localField:   'userId',
          foreignField: 'userId',
          as:           'devices',
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $project: {
          _id:        1,
          userId:     1,
          username:   '$name',
          email:      1,
          profilePic: 1,
          suspended:  1,
          deviceId:   { $arrayElemAt: ['$devices.deviceId', 0] },
        },
      },
    ]);

    return res.json(users);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── GET /api/admin/user/:userId ──────────────────────────────────────────────
// Returns full profile + registered sensor devices + last 20 sensor readings
// for the user matching req.params.userId.
const getUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    // 1. Fetch user profile from DB
    const user = await User.findOne({ userId }).select('-password').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    // 2. Fetch this user's registered hardware devices
    const devices = await SensorDevice.find({ userId }).sort({ createdAt: -1 }).lean();

    // 3. Fetch last 20 sensor readings for chart + history table
    const sensorHistory = await SensorData.find({ userId })
      .sort({ timestamp: -1 })
      .limit(20)
      .lean();

    // 4. Reverse so chart renders oldest → newest left to right
    const chartData = [...sensorHistory].reverse().map(entry => ({
      time:         new Date(entry.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      temperature:  entry.temperature,
      humidity:     entry.humidity,
      soilMoisture: entry.soilMoisture,
      gas:          entry.gas,
      timestamp:    entry.timestamp,
    }));

    return res.json({ user, devices, chartData, sensorHistory });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── POST /api/admin/device/reboot ────────────────────────────────────────────
// Fetches the user's registered SensorDevice from MongoDB by userId,
// then publishes { command: 'reboot' } to nodes/<deviceId>/control via MQTT.
const rebootDevice = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    let device = await SensorDevice.findOne({ userId }).lean();

    // If no registered device exists, auto-create one so the admin
    // can still send a command to users who registered before the
    // deviceId field was added to the schema
    if (!device) {
      const autoDeviceId = `AGRI_UNIT_${userId}`;
      device = await SensorDevice.create({
        userId,
        name:     'Auto-registered Device',
        model:    'Unknown',
        pin:      'N/A',
        deviceId: autoDeviceId,
      });
      device = device.toObject();
    }

    // Fall back to _id string if deviceId was never set on older documents
    const targetId = device.deviceId || device._id.toString();

    // Patch the document if deviceId was missing (one-time migration)
    if (!device.deviceId) {
      await SensorDevice.updateOne({ _id: device._id }, { $set: { deviceId: targetId } });
    }

    await publishCommand(targetId, { command: 'reboot' });

    return res.json({
      message:  `Reboot command sent to device ${targetId}`,
      deviceId: targetId,
      topic:    `nodes/${targetId}/control`,
    });
  } catch (err) {
    const status = err.message.includes('MQTT') ? 503 : 500;
    return res.status(status).json({ message: err.message });
  }
};

// ── POST /api/admin/user/suspend ─────────────────────────────────────────────
// Toggles the suspended flag on the User document.
// When suspending, also publishes { command: 'disconnect' } to the device
// so live hardware stops transmitting immediately.
const suspendUser = async (req, res) => {
  try {
    const { userId, suspend } = req.body;
    if (!userId || typeof suspend !== 'boolean') {
      return res.status(400).json({ message: 'userId and suspend (boolean) are required' });
    }

    // Fix: variable from req.body is `suspend`, but $set field in schema is `suspended`
    // Using explicit key:value instead of shorthand to avoid the ReferenceError
    const user = await User.findOneAndUpdate(
      { userId },
      { $set: { suspended: suspend } },
      { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (suspend) {
      const device = await SensorDevice.findOne({ userId }).lean();
      if (device) {
        const targetId = device.deviceId || device._id.toString();
        publishCommand(targetId, { command: 'disconnect' })
          .catch(err => console.error('[Suspend] MQTT publish failed:', err.message));
      }
    }

    return res.json({
      message:   `User ${userId} has been ${suspend ? 'suspended' : 'reactivated'}`,
      suspended: suspend,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── GET /api/admin/devices ───────────────────────────────────────────────────
// Returns all registered SensorDevice documents, enriched with the owning
// user's email and the online/offline status derived from their most recent
// SensorData entry (a reading within the last 30 minutes = online).
const getAdminDevices = async (req, res) => {
  try {
    // 1. All registered hardware devices
    const devices = await SensorDevice.find({}).sort({ createdAt: -1 }).lean();

    if (!devices.length) return res.json([]);

    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const userIds = [...new Set(devices.map(d => d.userId))];

    // 2. Fetch owning users in one query (email for display, suspended status)
    const users = await User.find({ userId: { $in: userIds } })
      .select('userId name email suspended')
      .lean();
    const userMap = {};
    users.forEach(u => { userMap[u.userId] = u; });

    // 3. Latest SensorData timestamp per userId to determine online status
    const latestReadings = await SensorData.aggregate([
      { $match: { userId: { $in: userIds } } },
      { $sort:  { timestamp: -1 } },
      { $group: { _id: '$userId', lastTs: { $first: '$timestamp' } } },
    ]);
    const tsMap = {};
    latestReadings.forEach(r => { tsMap[r._id] = r.lastTs; });

    // 4. Compose response shape expected by DevicesManagement.jsx
    const payload = devices.map(d => {
      const owner    = userMap[d.userId] || {};
      const lastTs   = tsMap[d.userId]   || null;
      const isOnline = lastTs ? new Date(lastTs) >= thirtyMinutesAgo : false;

      return {
        _id:           d._id,
        deviceId:      d.deviceId,
        deviceName:    d.name,
        type:          d.model,
        assignedEmail: owner.email  || null,
        assignedUser:  owner.name   || null,
        status:        isOnline ? 'online' : 'offline',
        online:        isOnline,
        lastSeen:      lastTs || d.updatedAt || d.createdAt,
        pin:           d.pin,
        suspended:     owner.suspended || false,
      };
    });

    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── POST /api/admin/devices/register ────────────────────────────────────────
// Registers a new device stub. The device is not yet assigned to any user.
const registerDevice = async (req, res) => {
  try {
    const { deviceId, deviceName } = req.body;
    if (!deviceId?.trim())   return res.status(400).json({ message: 'deviceId is required' });
    if (!deviceName?.trim()) return res.status(400).json({ message: 'deviceName is required' });

    const exists = await SensorDevice.findOne({ deviceId: deviceId.trim() }).lean();
    if (exists) return res.status(409).json({ message: `Device ID "${deviceId.trim()}" is already registered.` });

    // Admin-registered devices use a placeholder userId until mapped to a user
    const device = await SensorDevice.create({
      userId:   'unassigned',
      name:     deviceName.trim(),
      model:    'Pending',
      pin:      'N/A',
      deviceId: deviceId.trim(),
      status:   'Offline',
    });

    return res.status(201).json({
      device: {
        _id:           device._id,
        deviceId:      device.deviceId,
        deviceName:    device.name,
        type:          device.model,
        assignedEmail: null,
        assignedUser:  null,
        status:        'offline',
        online:        false,
        lastSeen:      null,
        pin:           device.pin,
      },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── POST /api/admin/devices/assign ──────────────────────────────────────────
// Maps an existing device to a user account identified by email.
const assignDeviceToUser = async (req, res) => {
  try {
    const { deviceId, email } = req.body;
    if (!deviceId?.trim()) return res.status(400).json({ message: 'deviceId is required' });
    if (!email?.trim())    return res.status(400).json({ message: 'email is required' });

    const user = await User.findOne({ email: email.trim().toLowerCase() }).lean();
    if (!user) return res.status(404).json({ message: `No user found with email "${email.trim()}"` });

    const device = await SensorDevice.findOneAndUpdate(
      { deviceId: deviceId.trim() },
      { $set: { userId: user.userId } },
      { new: true }
    ).lean();
    if (!device) return res.status(404).json({ message: `Device "${deviceId.trim()}" not found` });

    return res.json({
      message:       `Device ${deviceId.trim()} assigned to ${email.trim()}`,
      deviceId:      device.deviceId,
      assignedEmail: user.email,
      assignedUser:  user.name,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── GET /api/admin/sensor-logs ───────────────────────────────────────────────
// Returns paginated sensor readings across all users, newest first.
// Accepts optional query params: ?limit=50&page=1
const getSensorLogs = async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '100', 10), 500);
    const page   = Math.max(parseInt(req.query.page   || '1',   10), 1);
    const skip   = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      SensorData.find({})
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SensorData.countDocuments({}),
    ]);

    // Enrich each log with the owning user's email for the table display
    const userIds    = [...new Set(logs.map(l => l.userId))];
    const users      = await User.find({ userId: { $in: userIds } })
      .select('userId email name')
      .lean();
    const userMap = {};
    users.forEach(u => { userMap[u.userId] = u; });

    const payload = logs.map(entry => ({
      _id:          entry._id,
      userId:       entry.userId,
      userEmail:    userMap[entry.userId]?.email || entry.userId,
      temperature:  entry.temperature  ?? null,
      humidity:     entry.humidity     ?? null,
      soilMoisture: entry.soilMoisture ?? null,
      airQuality:   entry.gas          ?? null,   // frontend key is airQuality
      timestamp:    entry.timestamp,
    }));

    return res.json({ logs: payload, total, page, limit });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getAdminOverview, getSystemStats, getAllUsers, getUserDetails,
  rebootDevice, suspendUser,
  getAdminDevices, registerDevice, assignDeviceToUser,
  getSensorLogs,
};
