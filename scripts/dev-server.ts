import {
  MinecraftServer,
  getProtocolVersionName,
} from '../packages/minecraft/src/protocol/index.js';

// Parse port from CLI flags or environment
const args = process.argv.slice(2);
let port = 25565;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    port = parseInt(args[i + 1], 10);
  }
}
if (process.env.MC_PORT) {
  port = parseInt(process.env.MC_PORT, 10);
}

const server = new MinecraftServer({
  port,
  host: '0.0.0.0',
  motd: '§a§lExoProc Analysis Lab §7| §eMulti-Version Dev Server',
});

server.on('connection', (client) => {
  const remote = `${client.socket.remoteAddress}:${client.socket.remotePort}`;
  console.log(`\n\x1b[36m[CONNECT]\x1b[0m Incoming connection from ${remote}`);

  client.on('handshake', (pkt) => {
    const stateName =
      pkt.nextState === 1
        ? 'STATUS (Ping)'
        : pkt.nextState === 2
          ? 'LOGIN (Play)'
          : String(pkt.nextState);
    const verName = getProtocolVersionName(pkt.protocolVersion);
    console.log(
      `\x1b[35m[HANDSHAKE]\x1b[0m Protocol: \x1b[1m${pkt.protocolVersion}\x1b[0m (${verName}) | State: \x1b[33m${stateName}\x1b[0m`,
    );
  });

  client.on('loginStart', (pkt) => {
    console.log(
      `\x1b[32m[LOGIN START]\x1b[0m Player: \x1b[1m${pkt.username}\x1b[0m | Offline UUID: \x1b[90m${pkt.uuid}\x1b[0m`,
    );
  });

  client.on('brand', (brand) => {
    console.log(
      `\x1b[36m[CLIENT BRAND]\x1b[0m ${client.username ?? 'Player'} client brand: \x1b[1m${brand}\x1b[0m`,
    );
  });

  client.on('join', () => {
    console.log(
      `\x1b[32;1m[WORLD LOADED]\x1b[0m Player ${client.username} successfully loaded into the world!`,
    );
    console.log(
      `\x1b[90m             Calibration Spawn: X=1337.5, Y=5.0, Z=777.5\x1b[0m`,
    );
    console.log(
      `\x1b[36m             Spawned 5 Floating Probe Mobs (Zombie, Creeper, Skeleton, Cow, Pig) with custom Health & Angles!\x1b[0m`,
    );
  });

  let lastPosLog = 0;
  client.on('position', (pos) => {
    const now = Date.now();
    // Throttle position logs to once per second per client to avoid terminal flooding
    if (now - lastPosLog > 1000) {
      lastPosLog = now;
      console.log(
        `\x1b[90m[POS]\x1b[0m ${client.username ?? 'Player'}: X=${pos.x.toFixed(2)} Y=${pos.y.toFixed(2)} Z=${pos.z.toFixed(2)}`,
      );
    }
  });

  client.on('chat', (data) => {
    console.log(`\x1b[33;1m[CHAT]\x1b[0m <${data.username}> ${data.message}`);
  });

  client.on('keepAliveResponse', (id) => {
    // Heartbeat received
  });

  client.on('close', () => {
    console.log(
      `\x1b[31m[DISCONNECT]\x1b[0m ${client.username ?? remote} disconnected.\n`,
    );
  });

  client.on('error', (err) => {
    console.error(`\x1b[31m[CLIENT ERROR]\x1b[0m ${err.message}`);
  });
});

server.on('listening', (p, host) => {
  console.log(`
\x1b[32;1m╔═════════════════════════════════════════════════════════════════════════╗
║                   🌌 ExoProc Analysis Lab Dev Server                    ║
╠═════════════════════════════════════════════════════════════════════════╣\x1b[0m
  \x1b[1mStatus:\x1b[0m            \x1b[32mONLINE\x1b[0m
  \x1b[1mPort:\x1b[0m              \x1b[33m${p}\x1b[0m (0.0.0.0 / localhost)
  \x1b[1mSupported:\x1b[0m         \x1b[36m1.5.x - 1.21+ (Multi-Version Auto-Negotiation)\x1b[0m
  \x1b[1mPhysics/Ticks:\x1b[0m     \x1b[35m0 (Zero CPU overhead, purely in-memory)\x1b[0m
  \x1b[1mDirect Connect:\x1b[0m    \x1b[32m127.0.0.1:${p}\x1b[0m or \x1b[32mlocalhost\x1b[0m
\x1b[32;1m╚═════════════════════════════════════════════════════════════════════════╝\x1b[0m
\x1b[90mWaiting for Minecraft client to connect... (Press Ctrl+C to stop)\x1b[0m
`);
});

await server.listen();

// Handle graceful shutdown
const shutdown = async () => {
  console.log('\n\x1b[33mStopping ExoProc Dev Server...\x1b[0m');
  await server.close();
  console.log('\x1b[32mServer stopped cleanly.\x1b[0m');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
