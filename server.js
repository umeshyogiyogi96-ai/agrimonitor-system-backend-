require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const { startMqttListener } = require('./config/mqtt');
const authRoutes         = require('./routes/authRoutes');
const sensorRoutes       = require('./routes/sensorRoutes');
const adminRoutes        = require('./routes/adminRoutes');
const userRoutes         = require('./routes/userRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const { trackRequest }   = require('./middleware/requestTracker');

const app = express();

// ── Production CORS Configuration for Render Deployment ─────────────────────
// Your backend: https://agrimonitor-system.onrender.com
// Allow specific frontend origins for production

// Parse ALLOWED_ORIGINS from environment variable or use defaults
// Format in .env: ALLOWED_ORIGINS=http://localhost:5173,https://your-frontend.onrender.com
const parseAllowedOrigins = () => {
  if (process.env.ALLOWED_ORIGINS) {
    return process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
  }
  
  // Default origins for development and common deployments
  return [
    // Local development
    'http://localhost:5173',     // Vite default
    'http://localhost:3000',     // Create React App default
    'http://localhost:5174',     // Alternative Vite port
    'http://localhost:8080',     // Alternative port
    
    // Render frontend deployments (UPDATE THESE WITH YOUR ACTUAL FRONTEND URLS)
    'https://agrimonitor-frontend.onrender.com', // Example - UPDATE THIS
    'https://your-frontend-app.onrender.com',    // Your actual frontend URL
    
    // Development with IP access
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
    
    // For testing from any origin during development (remove in production)
    ...(process.env.NODE_ENV === 'development' ? ['*'] : []),
  ];
};

const allowedOrigins = parseAllowedOrigins();

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, postman, server-to-server)
    if (!origin) return callback(null, true);
    
    // In development, allow all origins if configured
    if (process.env.NODE_ENV === 'development' && allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // Log blocked origins for debugging
      console.log(`[CORS] Blocked origin: ${origin}`);
      console.log(`[CORS] Allowed origins: ${allowedOrigins.join(', ')}`);
      
      // In production, return proper error
      if (process.env.NODE_ENV === 'production') {
        callback(new Error(`Origin ${origin} not allowed by CORS policy`));
      } else {
        // In development, you might want to allow for debugging
        callback(null, true);
      }
    }
  },
  credentials: true, // Allow cookies/auth headers if needed
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers',
    'X-Auth-Token'
  ],
  exposedHeaders: [
    'Content-Range',
    'X-Content-Range',
    'Access-Control-Allow-Origin',
    'Access-Control-Allow-Credentials',
    'X-Total-Count'
  ],
  maxAge: 86400, // 24 hours preflight cache
};

// Use CORS with production configuration - this handles both regular and preflight requests
app.use(cors(corsOptions));

// The cors() middleware automatically handles OPTIONS preflight requests
// We don't need app.options('*', ...) when using cors() middleware
// This avoids the PathError: Missing parameter name at index 1: *

connectDB();
startMqttListener();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(trackRequest);

// Serve uploaded profile pictures as static files.
// A saved path like '/uploads/1234567890.jpg' in MongoDB becomes
// accessible at https://agrimonitor-system.onrender.com/uploads/1234567890.jpg
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve React frontend from 'dist' folder (built production files)
// यह तरीका सबसे सुरक्षित है, यह फाइल को 'backend' के बाहर 'dist' में ढूंढेगा
const distPath = path.resolve(__dirname, '..', 'dist');

// Serve static files from dist folder
// express.static() will serve files like /assets/main.js, /favicon.ico, etc.
app.use(express.static(distPath));

app.use('/api/auth',          authRoutes);
app.use('/api/sensors',       sensorRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/user',          userRoutes);
app.use('/api/notifications', notificationRoutes);

// 404 handler for all unmatched routes
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    // API route not found
    return res.status(404).json({ 
      error: 'API endpoint not found', 
      path: req.path,
      message: 'The requested API endpoint does not exist'
    });
  } else if (req.method === 'GET') {
    // Non-API GET request - serve React app for SPA routing
    return res.sendFile(path.join(distPath, 'index.html'));
  } else {
    // Other HTTP methods for non-API routes
    return res.status(404).json({ 
      error: 'Route not found', 
      path: req.path,
      method: req.method
    });
  }
});

// ── API Polling Service for Real Sensor Data ───────────────────────────────
// Production-ready service that polls external sensor APIs for real data
// instead of using hardcoded mock data
const startApiPollingService = async () => {
  try {
    const SensorDevice = require('./models/SensorDevice');
    const SensorData = require('./models/SensorData');
    const axios = require('axios');
    
    console.log('[ApiPollingService] Starting API polling service...');
    
    // Configuration - adjustable for production
    const POLLING_INTERVAL_MS = process.env.POLLING_INTERVAL_MS || 60000; // 1 minute for testing, 900000 for 15 minutes
    const REQUEST_TIMEOUT_MS = 10000; // 10 second timeout for API calls
    const ENABLE_LOGGING = process.env.ENABLE_POLLING_LOGS !== 'false'; // Enabled by default
    
    console.log(`[ApiPollingService] Polling interval: ${POLLING_INTERVAL_MS/1000} seconds`);
    console.log(`[ApiPollingService] Request timeout: ${REQUEST_TIMEOUT_MS/1000} seconds`);
    
    let pollingCycleCount = 0;
    let lastSuccessfulPoll = null;
    
    const pollSensorApis = async () => {
      try {
        pollingCycleCount++;
        const cycleStartTime = Date.now();
        
        // Get all registered devices that have an API URL
        const devices = await SensorDevice.find({
          $or: [
            { jsonUrl: { $ne: '', $exists: true } },
            { api_url: { $ne: '', $exists: true } }
          ]
        });
        
        if (devices.length === 0) {
          if (ENABLE_LOGGING && pollingCycleCount % 10 === 1) {
            console.log('[ApiPollingService] No devices with API URLs found. Waiting for devices with external endpoints...');
          }
          return;
        }
        
        if (ENABLE_LOGGING) {
          console.log(`[ApiPollingService] Cycle ${pollingCycleCount}: Polling ${devices.length} device(s) with API endpoints...`);
        }
        
        const pollingPromises = devices.map(async (device) => {
          try {
            // Determine the API URL (support both jsonUrl and api_url fields)
            const apiUrl = device.jsonUrl || device.api_url;
            
            if (!apiUrl || apiUrl.trim() === '') {
              if (ENABLE_LOGGING && pollingCycleCount === 1) {
                console.log(`[ApiPollingService] Device ${device.name} (${device.deviceId}) has empty API URL, skipping`);
              }
              return { deviceId: device.deviceId, success: false, reason: 'Empty API URL' };
            }
            
            // Validate URL format
            let validatedUrl;
            try {
              validatedUrl = new URL(apiUrl);
            } catch (urlError) {
              console.error(`[ApiPollingService] Invalid URL for device ${device.name}: ${apiUrl}`);
              return { deviceId: device.deviceId, success: false, reason: 'Invalid URL format' };
            }
            
            // Make HTTP GET request to the sensor API
            const response = await axios.get(apiUrl, {
              timeout: REQUEST_TIMEOUT_MS,
              headers: {
                'User-Agent': 'AgriMonitor-Polling-Service/1.0',
                'Accept': 'application/json'
              }
            });
            
            // Check if response is successful
            if (response.status !== 200) {
              console.error(`[ApiPollingService] Device ${device.name}: API returned status ${response.status}`);
              return { deviceId: device.deviceId, success: false, reason: `HTTP ${response.status}` };
            }
            
            // Parse and extract sensor data from response
            const responseData = response.data;
            
            // Try to extract sensor values using common field names
            // Support various JSON structures that sensors might return
            const temperature = 
              responseData.temperature ||
              responseData.temp ||
              responseData.Temperature ||
              responseData.t ||
              (responseData.data && responseData.data.temperature) ||
              null;
            
            const humidity = 
              responseData.humidity ||
              responseData.hum ||
              responseData.Humidity ||
              responseData.h ||
              (responseData.data && responseData.data.humidity) ||
              null;
            
            const soilMoisture = 
              responseData.soilMoisture ||
              responseData.soil_moisture ||
              responseData.soil ||
              responseData.moisture ||
              responseData.SoilMoisture ||
              (responseData.data && responseData.data.soilMoisture) ||
              null;
            
            const gas = 
              responseData.gas ||
              responseData.air_quality ||
              responseData.airQuality ||
              responseData.aqi ||
              responseData.Gas ||
              (responseData.data && responseData.data.gas) ||
              null;
            
            // Validate that we got at least some sensor data
            if (temperature === null && humidity === null && soilMoisture === null && gas === null) {
              console.warn(`[ApiPollingService] Device ${device.name}: No recognizable sensor fields found in API response`);
              console.warn(`[ApiPollingService] Response structure:`, JSON.stringify(responseData).substring(0, 200) + '...');
              return { deviceId: device.deviceId, success: false, reason: 'No sensor data in response' };
            }
            
            // Parse numeric values, handle strings that might contain numbers
            const parseSensorValue = (value) => {
              if (value === null || value === undefined) return null;
              if (typeof value === 'number') return value;
              if (typeof value === 'string') {
                const parsed = parseFloat(value);
                return isNaN(parsed) ? null : parsed;
              }
              return null;
            };
            
            // Create sensor data entry with parsed values
            const sensorData = new SensorData({
              userId: device.userId,
              temperature: parseSensorValue(temperature),
              humidity: parseSensorValue(humidity),
              soilMoisture: parseSensorValue(soilMoisture),
              gas: parseSensorValue(gas),
              timestamp: new Date()
            });
            
            // Save to database
            await sensorData.save();
            
            // Update device lastSeen timestamp and status
            await SensorDevice.findByIdAndUpdate(device._id, {
              lastSeen: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              status: 'Connected',
              lastPollSuccess: new Date()
            });
            
            if (ENABLE_LOGGING && pollingCycleCount % 5 === 0) {
              const values = [];
              if (sensorData.temperature !== null) values.push(`Temp: ${sensorData.temperature}°C`);
              if (sensorData.humidity !== null) values.push(`Humidity: ${sensorData.humidity}%`);
              if (sensorData.soilMoisture !== null) values.push(`Soil: ${sensorData.soilMoisture}%`);
              if (sensorData.gas !== null) values.push(`Air: ${sensorData.gas}ppm`);
              
              console.log(`[ApiPollingService] ${device.name}: Success - ${values.join(', ')}`);
            }
            
            return {
              deviceId: device.deviceId,
              deviceName: device.name,
              success: true,
              temperature: sensorData.temperature,
              humidity: sensorData.humidity,
              soilMoisture: sensorData.soilMoisture,
              gas: sensorData.gas
            };
            
          } catch (deviceError) {
            // Handle individual device errors without breaking the whole cycle
            console.error(`[ApiPollingService] Error polling device ${device.name} (${device.deviceId}):`, deviceError.message);
            
            // Update device status to indicate connection issues
            await SensorDevice.findByIdAndUpdate(device._id, {
              status: 'Connection Error',
              lastPollError: new Date(),
              lastError: deviceError.message.substring(0, 100)
            });
            
            return {
              deviceId: device.deviceId,
              deviceName: device.name,
              success: false,
              reason: deviceError.message
            };
          }
        });
        
        // Wait for all polling operations to complete
        const results = await Promise.allSettled(pollingPromises);
        
        // Process results
        const successfulPolls = [];
        const failedPolls = [];
        
        results.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value.success) {
            successfulPolls.push(result.value);
          } else {
            const deviceName = devices[index]?.name || `Device ${index}`;
            failedPolls.push({
              deviceName,
              reason: result.status === 'fulfilled' ? result.value.reason : 'Promise rejected'
            });
          }
        });
        
        // Update last successful poll timestamp
        if (successfulPolls.length > 0) {
          lastSuccessfulPoll = new Date();
        }
        
        const cycleEndTime = Date.now();
        const cycleDuration = cycleEndTime - cycleStartTime;
        
        // Log summary
        if (ENABLE_LOGGING && pollingCycleCount % 3 === 0) {
          console.log(`[ApiPollingService] Cycle ${pollingCycleCount} complete:`);
          console.log(`  Duration: ${cycleDuration}ms`);
          console.log(`  Successful: ${successfulPolls.length}/${devices.length}`);
          console.log(`  Failed: ${failedPolls.length}/${devices.length}`);
          
          if (successfulPolls.length > 0 && pollingCycleCount % 10 === 0) {
            const sample = successfulPolls[0];
            const values = [];
            if (sample.temperature !== null) values.push(`Temp: ${sample.temperature}°C`);
            if (sample.humidity !== null) values.push(`Humidity: ${sample.humidity}%`);
            console.log(`  Sample: ${sample.deviceName} - ${values.join(', ')}`);
          }
        }
        
      } catch (cycleError) {
        // Catch any unexpected errors in the polling cycle
        console.error('[ApiPollingService] Unexpected error in polling cycle:', cycleError.message);
        console.error(cycleError.stack);
      }
    };
    
    // Run first poll immediately after startup
    await pollSensorApis();
    
    // Set up interval for continuous polling
    const pollingInterval = setInterval(pollSensorApis, POLLING_INTERVAL_MS);
    
    // Handle graceful shutdown
    const gracefulShutdown = () => {
      console.log('[ApiPollingService] Shutting down polling service...');
      clearInterval(pollingInterval);
    };
    
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    
    console.log(`[ApiPollingService] Polling service started.`);
    console.log(`[ApiPollingService] Will poll APIs every ${POLLING_INTERVAL_MS/1000} seconds.`);
    console.log(`[ApiPollingService] Configure interval via POLLING_INTERVAL_MS environment variable.`);
    
  } catch (initError) {
    console.error('[ApiPollingService] Failed to start:', initError.message);
    console.error('[ApiPollingService] API polling service disabled. Admin graphs will not update with real sensor data.');
  }
};

// Start the API polling service after a short delay to ensure DB is connected
setTimeout(() => {
  startApiPollingService();
}, 5000); // Give extra time for DB and MQTT to initialize

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`AgriMonitor backend running on port ${PORT}`);
  console.log(`API polling service will start in 5 seconds...`);
});