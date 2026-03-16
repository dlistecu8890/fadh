const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const { Session } = require('./db');
const fs = require('fs');
const path = require('path');
const os = require('os');

const sessions = new Map();

class MongoDBAuthState {
  constructor(phoneNumber) {
    this.phoneNumber = phoneNumber;
    this.folder = path.join(os.tmpdir(), 'wa-sessions', phoneNumber);
  }

  async init() {
    if (!fs.existsSync(this.folder)) {
      fs.mkdirSync(this.folder, { recursive: true });
    }
    
    const session = await Session.findOne({ phoneNumber: this.phoneNumber });
    if (session?.credentials?.creds) {
      fs.writeFileSync(
        path.join(this.folder, 'creds.json'),
        JSON.stringify(session.credentials.creds)
      );
    }
    
    return useMultiFileAuthState(this.folder);
  }

  async save(creds) {
    const credsPath = path.join(this.folder, 'creds.json');
    let credsData = null;
    
    if (fs.existsSync(credsPath)) {
      credsData = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    }

    await Session.findOneAndUpdate(
      { phoneNumber: this.phoneNumber },
      { 
        credentials: { creds: credsData },
        isConnected: true,
        updatedAt: new Date()
      },
      { upsert: true }
    );
  }
}

async function createSession(phoneNumber, onPairingCode, onConnected) {
  if (sessions.has(phoneNumber)) {
    return sessions.get(phoneNumber);
  }

  const mongoAuth = new MongoDBAuthState(phoneNumber);
  const { state, saveCreds } = await mongoAuth.init();

  const { version } = await fetchLatestBaileysVersion();
  
  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['Sairi Bot', 'Chrome', '1.0.0'],
    generateHighQualityLinkPreview: true,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
    defaultQueryTimeoutMs: 60000
  });

  const sessionData = {
    sock,
    status: 'connecting',
    phoneNumber,
    pairingCode: null
  };
  
  sessions.set(phoneNumber, sessionData);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, requestPairingCode } = update;

    if (!sock.authState.creds.registered && requestPairingCode) {
      const code = await sock.requestPairingCode(phoneNumber);
      sessionData.pairingCode = code;
      sessionData.status = 'pairing';
      
      await Session.findOneAndUpdate(
        { phoneNumber },
        { pairingCode: code, status: 'pairing' },
        { upsert: true }
      );
      
      onPairingCode?.(code);
    }

    if (connection === 'open') {
      sessionData.status = 'connected';
      await mongoAuth.save(sock.authState.creds);
      onConnected?.();
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error instanceof Boom) && 
        lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
      
      if (!shouldReconnect) {
        sessions.delete(phoneNumber);
        await Session.findOneAndUpdate(
          { phoneNumber },
          { isConnected: false, status: 'disconnected' }
        );
      }
    }
  });

  sock.ev.on('creds.update', async () => {
    await mongoAuth.save(sock.authState.creds);
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      
      const session = await Session.findOne({ phoneNumber });
      const settings = session?.settings || {};
      
      if (settings.onlinePresence) {
        await sock.sendPresenceUpdate('available', msg.key.remoteJid);
      }

      const text = msg.message?.conversation || 
                   msg.message?.extendedTextMessage?.text || '';
      
      if (settings.autoTyping) {
        await sock.sendPresenceUpdate('composing', msg.key.remoteJid);
        await new Promise(r => setTimeout(r, 1000));
      }

      if (settings.autoRecord) {
        await sock.sendPresenceUpdate('recording', msg.key.remoteJid);
        await new Promise(r => setTimeout(r, 1000));
      }

      await processCommand(sock, msg, text, settings, phoneNumber);
    }
  });

  return sessionData;
}

async function processCommand(sock, msg, text, settings, botNumber) {
  const sender = msg.key.remoteJid;
  const args = text.trim().split(' ');
  const cmd = args[0].toLowerCase();

  switch(cmd) {
    case '!menu':
    case '!help':
      await sock.sendMessage(sender, {
        text: `🤖 *Sairi Bot*\n\n` +
              `*Perintah:*\n` +
              `• !menfess [pesan] - Kirim menfess\n` +
              `• !confess [nomor]|[pesan] - Confess\n` +
              `• !sticker - Buat sticker\n` +
              `• !owner - Info owner`
      });
      break;

    case '!menfess':
      if (!settings.menfess) return;
      const mfText = args.slice(1).join(' ');
      if (!mfText) {
        await sock.sendMessage(sender, { text: '❌ Format: !menfess [pesan]' });
        return;
      }
      await sock.sendMessage(sender, { 
        text: `✅ Menfess terkirim!\n\n_"${mfText}"_` 
      });
      break;

    case '!confess':
      if (!settings.confess) return;
      const [target, ...confessArr] = args.slice(1).join(' ').split('|');
      if (!target || !confessArr.length) {
        await sock.sendMessage(sender, { text: '❌ Format: !confess 628xx|pesan' });
        return;
      }
      const targetJid = target.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
      await sock.sendMessage(targetJid, {
        text: `💌 *Confess Anonymous*\n\n"${confessArr.join('|')}"\n\n_Dari seseorang yang menyukaimu_`
      });
      await sock.sendMessage(sender, { text: '✅ Confess terkirim!' });
      break;

    case '!owner':
      await sock.sendMessage(sender, {
        text: `👤 *Owner Bot*\n📱 ${botNumber}\n\nPowered by Sairi Bot`
      });
      break;
  }
}

async function getSessionStatus(phoneNumber) {
  const session = sessions.get(phoneNumber);
  const dbSession = await Session.findOne({ phoneNumber });
  
  return {
    connected: session?.status === 'connected' || dbSession?.isConnected || false,
    status: session?.status || dbSession?.status || 'disconnected',
    pairingCode: session?.pairingCode || dbSession?.pairingCode || null,
    settings: dbSession?.settings || {}
  };
}

async function updateSettings(phoneNumber, newSettings) {
  await Session.findOneAndUpdate(
    { phoneNumber },
    { settings: newSettings },
    { upsert: true }
  );
  return true;
}

async function disconnectSession(phoneNumber) {
  const session = sessions.get(phoneNumber);
  if (session?.sock) {
    await session.sock.logout();
  }
  sessions.delete(phoneNumber);
  await Session.findOneAndUpdate(
    { phoneNumber },
    { isConnected: false, status: 'disconnected' }
  );
  return true;
}

module.exports = {
  createSession,
  getSessionStatus,
  updateSettings,
  disconnectSession
};
  
