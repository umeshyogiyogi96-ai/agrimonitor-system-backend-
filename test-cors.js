// Test script to verify CORS configuration
const axios = require('axios');

const BACKEND_URL = 'https://agrimonitor-system.onrender.com';
const TEST_ORIGINS = [
  'http://localhost:5173',
  'https://agrimonitor-frontend.onrender.com',
  'https://wrong-origin.com'
];

console.log('Testing CORS configuration for Render deployment...\n');
console.log(`Backend URL: ${BACKEND_URL}\n`);

async function testCors(origin) {
  try {
    console.log(`Testing origin: ${origin}`);
    
    const response = await axios.get(`${BACKEND_URL}/api/health`, {
      headers: { Origin: origin },
      validateStatus: () => true // Don't throw on non-2xx
    });
    
    console.log(`  Status: ${response.status}`);
    console.log(`  Access-Control-Allow-Origin: ${response.headers['access-control-allow-origin']}`);
    console.log(`  Access-Control-Allow-Credentials: ${response.headers['access-control-allow-credentials']}`);
    
    if (response.status === 200) {
      console.log(`  ✓ CORS allowed for ${origin}\n`);
      return true;
    } else {
      console.log(`  ✗ CORS blocked for ${origin}\n`);
      return false;
    }
    
  } catch (error) {
    console.log(`  ✗ Error: ${error.message}\n`);
    return false;
  }
}

async function testPreflight(origin) {
  try {
    console.log(`Testing preflight for origin: ${origin}`);
    
    const response = await axios.options(`${BACKEND_URL}/api/auth/login`, {
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Authorization'
      },
      validateStatus: () => true
    });
    
    console.log(`  Preflight Status: ${response.status}`);
    console.log(`  Access-Control-Allow-Methods: ${response.headers['access-control-allow-methods']}`);
    console.log(`  Access-Control-Allow-Headers: ${response.headers['access-control-allow-headers']}`);
    
    if (response.status === 200) {
      console.log(`  ✓ Preflight successful for ${origin}\n`);
      return true;
    } else {
      console.log(`  ✗ Preflight failed for ${origin}\n`);
      return false;
    }
    
  } catch (error) {
    console.log(`  ✗ Preflight error: ${error.message}\n`);
    return false;
  }
}

async function runTests() {
  console.log('=== Testing Regular CORS Requests ===\n');
  
  const results = [];
  for (const origin of TEST_ORIGINS) {
    const allowed = await testCors(origin);
    results.push({ origin, allowed });
  }
  
  console.log('=== Testing Preflight Requests ===\n');
  
  const preflightResults = [];
  for (const origin of TEST_ORIGINS.slice(0, 2)) { // Test first two origins
    const allowed = await testPreflight(origin);
    preflightResults.push({ origin, allowed });
  }
  
  console.log('=== Summary ===\n');
  console.log('Regular CORS Results:');
  results.forEach(r => {
    console.log(`  ${r.allowed ? '✓' : '✗'} ${r.origin}`);
  });
  
  console.log('\nPreflight Results:');
  preflightResults.forEach(r => {
    console.log(`  ${r.allowed ? '✓' : '✗'} ${r.origin}`);
  });
  
  console.log('\n=== Recommendations ===\n');
  console.log('1. Ensure your frontend URL is in allowedOrigins array in server.js');
  console.log('2. Check that ALLOWED_ORIGINS env variable includes your frontend URL');
  console.log('3. Verify frontend is making requests to: https://agrimonitor-system.onrender.com');
  console.log('4. Check browser console for exact CORS error messages');
  console.log('5. Update axios require if not installed: npm install axios');
}

// Check if axios is installed
try {
  require('axios');
  runTests().catch(console.error);
} catch (error) {
  console.log('Axios not installed. Install with: npm install axios');
  console.log('Then run: node test-cors.js');
}