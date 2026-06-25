# CORS Configuration for Render Deployment

## Your Backend URL
**Backend**: `https://agrimonitor-system.onrender.com`

## Problem
When deploying your MERN stack on Render:
- Frontend and backend are on different domains/origins
- Browser blocks cross-origin requests for security
- Need proper CORS configuration to allow frontend-backend communication

## Solution Implemented

### 1. **Dynamic CORS Configuration** (`server.js`)
Updated to support:
- Environment variable configuration (`ALLOWED_ORIGINS`)
- Development vs production modes
- Preflight request handling
- Proper headers for authentication

### 2. **Key Configuration Points**

#### For Development (Local):
```javascript
// Default allowed origins include:
'http://localhost:5173',     // Vite default
'http://localhost:3000',     // Create React App default
'http://localhost:5174',     // Alternative Vite port
'http://127.0.0.1:5173',     // IP access
```

#### For Production (Render):
You need to specify your actual frontend URL(s):

### 3. **Configuration Steps**

#### Step 1: Update `.env` File
Add your frontend URL to the backend's `.env` file:

```bash
# Backend .env file
ALLOWED_ORIGINS=https://your-frontend-app.onrender.com,http://localhost:5173

# Your actual frontend URL on Render plus local development
# Replace "your-frontend-app" with your actual Render frontend name
```

#### Step 2: Update `server.js` Hardcoded Origins
Find this section in `server.js` and update with your actual frontend URL:

```javascript
// Render frontend deployments (UPDATE THESE WITH YOUR ACTUAL FRONTEND URLS)
'https://agrimonitor-frontend.onrender.com', // ← CHANGE THIS
'https://your-frontend-app.onrender.com',    // ← CHANGE THIS
```

Change to:
```javascript
// Render frontend deployments
'https://your-actual-frontend-name.onrender.com', // Your actual frontend
```

#### Step 3: Update Frontend API Base URL
In your frontend code (usually in a config file or `.env`), update the API base URL:

**Frontend `.env` file (Vite):**
```bash
VITE_API_URL=https://agrimonitor-system.onrender.com
```

**Frontend code (API calls):**
```javascript
// Change from:
const API = 'http://localhost:5000';

// To:
const API = 'https://agrimonitor-system.onrender.com';
// OR use environment variable:
const API = import.meta.env.VITE_API_URL || 'https://agrimonitor-system.onrender.com';
```

### 4. **Testing CORS Configuration**

#### Test 1: Check Backend CORS Headers
```bash
curl -I -X OPTIONS https://agrimonitor-system.onrender.com/api/auth/login \
  -H "Origin: https://your-frontend-app.onrender.com" \
  -H "Access-Control-Request-Method: POST"
```

You should see:
```
HTTP/2 200
Access-Control-Allow-Origin: https://your-frontend-app.onrender.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Auth-Token
Access-Control-Allow-Credentials: true
Access-Control-Max-Age: 86400
```

#### Test 2: Simple API Call Test
```bash
curl https://agrimonitor-system.onrender.com/api/health \
  -H "Origin: https://your-frontend-app.onrender.com"
```

### 5. **Common Render Deployment Scenarios**

#### Scenario A: Frontend also on Render
- **Backend**: `https://agrimonitor-system.onrender.com`
- **Frontend**: `https://agrimonitor-frontend.onrender.com`
- **CORS Config**: Allow `https://agrimonitor-frontend.onrender.com`

#### Scenario B: Frontend on Netlify/Vercel
- **Backend**: `https://agrimonitor-system.onrender.com` 
- **Frontend**: `https://agrimonitor.netlify.app`
- **CORS Config**: Allow `https://agrimonitor.netlify.app`

#### Scenario C: Multiple Frontends
```bash
# .env file
ALLOWED_ORIGINS=https://agrimonitor.netlify.app,https://agrimonitor.vercel.app,http://localhost:5173
```

### 6. **Troubleshooting CORS Errors**

#### Error: "No 'Access-Control-Allow-Origin' header"
**Solution**: Check if frontend origin is in `allowedOrigins` array.

#### Error: Preflight request doesn't pass access control
**Solution**: Ensure `app.options('*', cors(corsOptions))` is configured.

#### Error: Credentials not allowed with wildcard origin
**Solution**: When using `credentials: true`, cannot use `'*'` as origin.

#### Error: Specific route not working
**Solution**: Check if route-specific middleware is overriding CORS headers.

### 7. **Debugging Steps**

1. **Check Console Logs**:
   ```bash
   # Backend logs on Render dashboard
   [CORS] Blocked origin: https://wrong-url.com
   [CORS] Allowed origins: https://correct-url.com, http://localhost:5173
   ```

2. **Browser Dev Tools**:
   - Network tab → check request/response headers
   - Console tab → exact CORS error message
   - Application tab → check cookies/storage

3. **Manual Testing**:
   ```javascript
   // Test API directly
   fetch('https://agrimonitor-system.onrender.com/api/health')
     .then(res => console.log('Status:', res.status))
     .catch(err => console.error('Error:', err));
   ```

### 8. **Production Best Practices**

1. **Never use `'*'` in production** - specify exact origins
2. **Use environment variables** for different environments
3. **Regularly audit allowed origins** - remove unused URLs
4. **Implement rate limiting** - Render has built-in protection
5. **Use HTTPS only** - Render provides SSL automatically

### 9. **Complete `.env` Example**

```bash
# Backend .env file for Render
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key

# CORS Configuration
ALLOWED_ORIGINS=https://agrimonitor-frontend.onrender.com,http://localhost:5173
NODE_ENV=production

# API Polling Service
POLLING_INTERVAL_MS=900000
ENABLE_POLLING_LOGS=false
```

### 10. **Render-Specific Notes**

1. **Automatic HTTPS**: Render provides SSL certificates
2. **Port Binding**: Use `process.env.PORT` (Render sets this automatically)
3. **Start Command**: Ensure `package.json` has `"start": "node server.js"`
4. **Environment Variables**: Set in Render dashboard → Environment tab
5. **Build Command**: For Node.js, Render runs `npm install && npm start`

## Final Checklist
- [ ] Updated `ALLOWED_ORIGINS` in `.env` with actual frontend URL
- [ ] Updated hardcoded origins in `server.js`
- [ ] Frontend API URL points to Render backend
- [ ] Tested API calls from frontend
- [ ] Verified CORS headers in browser dev tools
- [ ] Set `NODE_ENV=production` for Render deployment

With this configuration, your frontend at `https://your-frontend.onrender.com` will be able to communicate with your backend at `https://agrimonitor-system.onrender.com` without CORS errors.