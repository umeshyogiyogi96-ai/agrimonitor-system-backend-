const express = require('express');
const router = express.Router();
const {
  getAdminOverview, getSystemStats, getAllUsers, getUserDetails,
  rebootDevice, suspendUser,
  getAdminDevices, registerDevice, assignDeviceToUser,
  getSensorLogs,
} = require('../controllers/adminController');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');

router.get('/overview',              verifyToken, verifyAdmin, getAdminOverview);
router.get('/system-stats',          verifyToken, verifyAdmin, getSystemStats);
router.get('/users',                 verifyToken, verifyAdmin, getAllUsers);
router.get('/user/:userId',          verifyToken, verifyAdmin, getUserDetails);
router.post('/device/reboot',        verifyToken, verifyAdmin, rebootDevice);
router.post('/user/suspend',         verifyToken, verifyAdmin, suspendUser);

// Device inventory & management
router.get('/devices',               verifyToken, verifyAdmin, getAdminDevices);
router.post('/devices/register',     verifyToken, verifyAdmin, registerDevice);
router.post('/devices/assign',       verifyToken, verifyAdmin, assignDeviceToUser);

// Sensor log feed
router.get('/sensor-logs',           verifyToken, verifyAdmin, getSensorLogs);

module.exports = router;
