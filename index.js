const { default: makeWAConnection, DisconnectReason } = require('@whiskeysockets/baileys');
const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const fs = require('fs');

// Clear auth info to start fresh
if (fs.existsSync('./auth_info_baileys')) {
  fs.rmSync('./auth_info_baileys', { recursive: true, force: true });
}

async function connectWA() {
  console.log('Starting WhatsApp connection...');
  
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
  
  const sock = makeWAConnection({
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: 'info' }),
    qrTimeout: 60000, // Increase QR timeout to 60 seconds
    connectTimeoutMs: 60000, // Increase general connection timeout
    keepAliveIntervalMs: 10000, // Keep connection alive
    browser: ['Chrome', 'Desktop', '103.0.5060.114'] // Use stable browser fingerprint
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('QR Code received, please scan it with your WhatsApp app');
    }
    
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      
      console.log(`Connection closed with status: ${statusCode}`);
      
      if (statusCode === DisconnectReason.loggedOut || statusCode === 408) {
        console.log('Session ended or timed out, reconnecting...');
        setTimeout(connectWA, 3000); // Wait 3 seconds before reconnecting
      } else if (lastDisconnect.error instanceof Boom) {
        console.log('Reconnecting due to connection error...');
        setTimeout(connectWA, 3000);
      }
    } else if (connection === 'open') {
      console.log('Connection opened successfully');
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    try {
      const msg = m.messages[0];
      // Hanya proses jika ini pesan masuk baru (bukan pemberitahuan status dll)
      if (!msg.message || msg.key.fromMe) return;
      
      // Extract the message content
      const msgType = Object.keys(msg.message)[0];
      let text = '';
      
      if (msgType === 'conversation') {
        text = msg.message.conversation;
      } else if (msgType === 'extendedTextMessage') {
        text = msg.message.extendedTextMessage.text;
      }
      
      const sender = msg.key.remoteJid;
      console.log(`Received message: "${text}" from ${sender}`);

      // Respons untuk semua pesan masuk
      if (text && text.trim() !== '') {
        console.log('Sending reply...');
        await sock.sendMessage(sender, { text: 'Halo juga!' });
        console.log('Reply sent');
      }
    } catch (err) {
      console.error('Error handling message:', err);
    }
  });
}

console.log('WhatsApp Bot starting...');
connectWA();