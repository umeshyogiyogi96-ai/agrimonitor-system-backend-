const express = require('express');
const router = express.Router();
const { saveSensorData, getUserSensorLogs, getLatestSensorData, getSensorHistory, getSensorThresholds, getDashboardAlerts, toggleControl, getControlStates, getSensorDevices, addSensorDevice, deleteSensorDevice } = require('../controllers/sensorController');
const { verifyToken } = require('../middleware/authMiddleware');

router.post('/', verifyToken, saveSensorData);
router.get('/current',          verifyToken, getLatestSensorData);
router.get('/history',          verifyToken, getSensorHistory);
router.get('/thresholds',       verifyToken, getSensorThresholds);       // 24h aggregate
router.get('/dashboard-alerts', verifyToken, getDashboardAlerts);        // activity log
router.get('/control-states', getControlStates);
router.post('/toggle-control', toggleControl);
router.get('/devices',        verifyToken, getSensorDevices);
router.post('/add',           verifyToken, addSensorDevice);
router.delete('/devices/:id', verifyToken, deleteSensorDevice); // must be before /:userId
router.get('/:userId',        verifyToken, getUserSensorLogs);

module.exports = router;
