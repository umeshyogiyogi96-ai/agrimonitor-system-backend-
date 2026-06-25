# API Polling Service Configuration

## Overview
The API Polling Service is a production-ready service that fetches real sensor data from external APIs instead of using mock data. It polls registered devices' API endpoints and stores the real sensor readings in the database.

## Configuration

### Environment Variables
Add these to your `.env` file:

```bash
# Polling interval in milliseconds (default: 60000 = 1 minute)
POLLING_INTERVAL_MS=900000  # 15 minutes for production

# Enable/disable polling logs (default: true)
ENABLE_POLLING_LOGS=true
```

### Default Configuration
- **Testing**: 1 minute intervals (60000 ms)
- **Production**: 15 minute intervals (900000 ms)
- **Request Timeout**: 10 seconds per API call
- **Logging**: Enabled by default, logs every 3rd cycle

## How It Works

### 1. Device Selection
The service polls devices that have either:
- `jsonUrl` field (non-empty)
- `api_url` field (non-empty)

### 2. API Request
- HTTP GET request to the device's API URL
- 10-second timeout
- User-Agent: `AgriMonitor-Polling-Service/1.0`
- Accept: `application/json`

### 3. Data Extraction
The service supports multiple JSON response structures:

**Supported field names for temperature:**
- `temperature`, `temp`, `Temperature`, `t`, `data.temperature`

**Supported field names for humidity:**
- `humidity`, `hum`, `Humidity`, `h`, `data.humidity`

**Supported field names for soil moisture:**
- `soilMoisture`, `soil_moisture`, `soil`, `moisture`, `SoilMoisture`, `data.soilMoisture`

**Supported field names for air quality/gas:**
- `gas`, `air_quality`, `airQuality`, `aqi`, `Gas`, `data.gas`

### 4. Data Storage
- Creates `SensorData` document with parsed values
- Updates device `lastSeen` timestamp
- Sets device `status` to "Connected" on success
- Sets device `status` to "Connection Error" on failure
- Tracks `lastPollSuccess` and `lastPollError` timestamps

## Error Handling

### Individual Device Failures
- Invalid URLs are skipped
- Timeouts (10+ seconds) are logged
- HTTP errors (non-200 responses) are logged
- Malformed JSON responses are logged
- **Critical**: One device failure doesn't affect other devices

### Service Resilience
- Uses `Promise.allSettled()` instead of `Promise.all()`
- Each device poll is wrapped in try-catch
- Main polling cycle has error boundary
- Graceful shutdown on SIGTERM/SIGINT

## Logging

### Normal Operation
```
[ApiPollingService] Cycle 3 complete:
  Duration: 2450ms
  Successful: 2/3
  Failed: 1/3
```

### Device-Level Logs (every 5th cycle)
```
[ApiPollingService] Tomato Field: Success - Temp: 24.5°C, Humidity: 62.3%, Soil: 58.7%
```

### Error Logs
```
[ApiPollingService] Error polling device Greenhouse Sensor: Request timeout
[ApiPollingService] Device Soil Monitor: No recognizable sensor fields found in API response
```

## Testing

### 1. Register a Device with API URL
1. Go to "Connected Sensors" page
2. Add a new sensor
3. Enter a valid API URL in "JSON API Endpoint URL" field
   - Example: `http://192.168.1.100/api/sensors`
   - Example: `http://localhost:8000/telemetry`

### 2. Create a Test API Endpoint
For testing without real hardware, create a simple HTTP server:

```javascript
// test-api-server.js
const express = require('express');
const app = express();

app.get('/api/sensors', (req, res) => {
  res.json({
    temperature: 25 + Math.random() * 5,
    humidity: 60 + Math.random() * 10,
    soilMoisture: 50 + Math.random() * 20,
    gas: 40 + Math.random() * 15
  });
});

app.listen(8000, () => {
  console.log('Test API server on http://localhost:8000');
});
```

### 3. Verify Operation
1. Start backend: `npm start`
2. Wait 5 seconds for polling service to start
3. Check console for `[ApiPollingService]` logs
4. After 1 minute, check database for new `SensorData` entries

## Production Deployment

### 1. Adjust Polling Interval
For production, set 15-minute intervals in `.env`:
```bash
POLLING_INTERVAL_MS=900000
```

### 2. Reduce Logging
For high-volume production, reduce logging:
```bash
ENABLE_POLLING_LOGS=false
```

### 3. Monitor Performance
- Check `lastPollSuccess` and `lastPollError` timestamps in `SensorDevice` collection
- Monitor MongoDB for growing `SensorData` collection
- Set up alerts for consecutive polling failures

### 4. Scaling Considerations
- Current implementation handles ~100 devices efficiently
- For 1000+ devices, consider:
  - Increasing `POLLING_INTERVAL_MS`
  - Implementing rate limiting
  - Using worker queues for parallel processing

## Troubleshooting

### No Polling Logs
**Problem**: No `[ApiPollingService]` logs appear
**Solution**: 
1. Check if devices have `jsonUrl` or `api_url` fields
2. Verify `.env` has `ENABLE_POLLING_LOGS=true`
3. Check MongoDB connection logs

### All Devices Failing
**Problem**: All devices show "Connection Error"
**Solution**:
1. Check network connectivity from server
2. Verify API URLs are accessible from server IP
3. Check firewall rules for outbound HTTP requests

### Incomplete Data
**Problem**: Some sensor fields are null
**Solution**:
1. Check API response structure matches expected format
2. Add support for alternative field names in extraction logic
3. Verify API returns numeric values (not strings with units)

### High Memory Usage
**Problem**: Server memory increases over time
**Solution**:
1. Reduce `POLLING_INTERVAL_MS`
2. Implement connection pooling for axios
3. Add memory monitoring and restart strategy

## Integration with Real Hardware

When connecting real sensor hardware:
1. Ensure sensor API returns JSON with supported field names
2. API should be accessible from your server's network
3. Response time should be under 10 seconds
4. Consider adding authentication headers if needed

## Migration from Mock Data
The previous mock telemetry seeder has been completely removed. To migrate:
1. Existing `SensorData` from mock seeder remains in database
2. New data will come from real API polling
3. Device `status` will reflect actual connectivity
4. `lastSeen` will show actual last successful poll