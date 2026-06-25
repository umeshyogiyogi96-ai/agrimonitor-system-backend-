const MAX_SLOTS = 10;

const history = [];
let currentSlot = { minuteKey: minuteStart(), requests: 0, activeDevices: 0 };
let lastOnlineCount = 0;

function minuteStart(d = new Date()) {
  const x = new Date(d);
  x.setSeconds(0, 0);
  return x.getTime();
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function rotateIfNeeded() {
  const key = minuteStart();
  if (key === currentSlot.minuteKey) return;

  history.push({
    timestamp:     currentSlot.minuteKey,
    time:          formatTime(currentSlot.minuteKey),
    requests:      currentSlot.requests,
    activeDevices: currentSlot.activeDevices,
  });

  if (history.length > MAX_SLOTS) history.shift();

  currentSlot = {
    minuteKey:     key,
    requests:      0,
    activeDevices: lastOnlineCount,
  };
}

function setActiveDevices(count) {
  lastOnlineCount = count;
  currentSlot.activeDevices = count;
}

function trackRequest(req, res, next) {
  if (req.method === 'OPTIONS' || req.path.startsWith('/uploads')) {
    return next();
  }
  rotateIfNeeded();
  currentSlot.requests += 1;
  next();
}

function getTrafficSeries() {
  rotateIfNeeded();

  const points = [...history];
  points.push({
    timestamp:     currentSlot.minuteKey,
    time:          formatTime(currentSlot.minuteKey),
    requests:      currentSlot.requests,
    activeDevices: currentSlot.activeDevices,
  });

  const trimmed = points.slice(-MAX_SLOTS);

  while (trimmed.length < MAX_SLOTS) {
    const earliest = (trimmed[0]?.timestamp ?? minuteStart()) - 60_000;
    trimmed.unshift({
      timestamp:     earliest,
      time:          formatTime(earliest),
      requests:      0,
      activeDevices: 0,
    });
  }

  return trimmed.map(({ time, requests, activeDevices }) => ({
    time,
    requests,
    activeConnections: activeDevices,
  }));
}

// Advance minute buckets even during idle periods
setInterval(rotateIfNeeded, 1000);

module.exports = { trackRequest, setActiveDevices, getTrafficSeries };
