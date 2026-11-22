require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');
const { initDb } = require('./db/database');
const authRoutes = require('./routes/auth');
const dataRoutes = require('./routes/data');
const uploadRoutes = require('./routes/upload');
const { startKpiSimulator } = require('./services/kpiSimulator');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/upload', uploadRoutes);

// WebSocket clients store
const clients = new Map();

wss.on('connection', (ws, req) => {
  const clientId = Date.now().toString();
  clients.set(clientId, { ws, subscriptions: [] });
  console.log(`WebSocket client connected: ${clientId}`);

  ws.send(JSON.stringify({ type: 'connected', clientId, message: 'RetailPulse WebSocket Ready' }));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'subscribe') {
        const client = clients.get(clientId);
        if (client) client.subscriptions = msg.channels || [];
        ws.send(JSON.stringify({ type: 'subscribed', channels: msg.channels }));
      }
    } catch (e) {
      console.error('WS message parse error:', e);
    }
  });

  ws.on('close', () => {
    clients.delete(clientId);
    console.log(`WebSocket client disconnected: ${clientId}`);
  });

  ws.on('error', (err) => console.error('WS error:', err));
});

// Ensure DB is initialized for serverless and normal environments
let dbReady = false;
let dbInitPromise = null;

function ensureDb() {
  if (!dbInitPromise) {
    dbInitPromise = initDb().then(() => { dbReady = true; });
  }
  return dbInitPromise;
}

app.use(async (req, res, next) => {
  if (!dbReady) {
    await ensureDb();
  }
  next();
});

// Broadcast to all connected WebSocket clients
function broadcast(channel, data) {
  const payload = JSON.stringify({ type: 'update', channel, data, timestamp: new Date().toISOString() });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// Make broadcast globally available
global.wsBroadcast = broadcast;

// Start server when executed directly (or non-serverless)
if (require.main === module || !process.env.VERCEL) {
  ensureDb().then(() => {
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`\n🚀 RetailPulse Server running on http://localhost:${PORT}`);
      console.log(`📡 WebSocket ready on ws://localhost:${PORT}`);
      startKpiSimulator();
    });
  });
}

module.exports = app;
