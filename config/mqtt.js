const mqtt = require('mqtt');
const { createSensorData } = require('../controllers/sensorController');

const MQTT_BROKER_URL = 'mqtt://broker.hivemq.com';
const MQTT_TOPIC      = 'agrimonitor/telemetry';

// Shared client instance — exported so adminController can publish commands
let mqttClient = null;

const startMqttListener = () => {
  mqttClient = mqtt.connect(MQTT_BROKER_URL);

  mqttClient.on('connect', () => {
    console.log(`Connected to MQTT broker at ${MQTT_BROKER_URL}`);
    mqttClient.subscribe(MQTT_TOPIC, { qos: 0 }, (err) => {
      if (err) console.error(`Failed to subscribe to ${MQTT_TOPIC}:`, err.message);
      else     console.log(`Subscribed to MQTT topic: ${MQTT_TOPIC}`);
    });
  });

  mqttClient.on('message', async (topic, message) => {
    if (topic !== MQTT_TOPIC) return;
    let payload;
    try {
      payload = JSON.parse(message.toString());
    } catch (err) {
      console.error('Received malformed MQTT message:', err.message);
      return;
    }
    try {
      const { userId, temperature, humidity, soilMoisture, gas } = payload;
      const saved = await createSensorData({ userId, temperature, humidity, soilMoisture, gas });
      console.log(`Saved MQTT telemetry for ${userId} at ${saved.timestamp.toISOString()}`);
    } catch (err) {
      console.error('Failed to save MQTT telemetry payload:', err.message);
    }
  });

  mqttClient.on('error', (err) => { console.error('MQTT client error:', err.message); });
  mqttClient.on('close', ()      => { console.warn('MQTT connection closed'); });

  return mqttClient;
};

// Publish a JSON command to a device-specific control topic.
// Topic pattern: nodes/<deviceId>/control
// Returns a Promise so callers can await and handle errors.
const publishCommand = (deviceId, payload) => {
  return new Promise((resolve, reject) => {
    if (!mqttClient || !mqttClient.connected) {
      return reject(new Error('MQTT client is not connected'));
    }
    const topic   = `nodes/${deviceId}/control`;
    const message = JSON.stringify(payload);
    mqttClient.publish(topic, message, { qos: 1 }, (err) => {
      if (err) {
        console.error(`MQTT publish failed [${topic}]:`, err.message);
        return reject(err);
      }
      console.log(`MQTT published to [${topic}]:`, message);
      resolve();
    });
  });
};

module.exports = { startMqttListener, publishCommand };
