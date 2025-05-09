const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const cron = require('node-cron');
const express = require('express');

// Express app setup
const app = express();
const port = process.env.PORT || 3000;

// WhatsApp Bot Configuration
const targetNumber = '6281615252042@s.whatsapp.net'; // Format: country code + number without symbols + @s.whatsapp.net
const autoMessage = 'Angga kirik';

// Create auth directory if it doesn't exist
if (!fs.existsSync('./auth_info_baileys')) {
  fs.mkdirSync('./auth_info_baileys', { recursive: true });
}

async function connectWA() {
  console.log('Starting WhatsApp connection...');
  
  // Get authentication state
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
  
  // Create WhatsApp socket connection
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: 'warn' }), // Change to 'info' for more logs or 'silent' for no logs
    browser: ['Chrome (Linux)', '', ''], // More generic browser signature
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 10000,
  });

  // Handle credential updates
  sock.ev.on('creds.update', saveCreds);

  // Handle connection updates
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('QR Code received, please scan it with your WhatsApp app');
    }
    
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error instanceof Boom && 
                             lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut;
      
      console.log(`Connection closed due to ${lastDisconnect.error?.output?.payload?.message || 'unknown reason'}`);
      console.log(`Status code: ${lastDisconnect.error?.output?.statusCode}`);
      
      if (shouldReconnect) {
        console.log('Reconnecting...');
        setTimeout(connectWA, 5000); // Longer delay before reconnecting
      } else if (lastDisconnect.error?.output?.statusCode === DisconnectReason.loggedOut) {
        console.log('You have been logged out. Clearing auth state and reconnecting...');
        // Clear auth info and try again
        if (fs.existsSync('./auth_info_baileys')) {
          fs.rmSync('./auth_info_baileys', { recursive: true, force: true });
          fs.mkdirSync('./auth_info_baileys', { recursive: true });
        }
        setTimeout(connectWA, 5000);
      } else {
        console.log('Reconnecting due to connection error...');
        setTimeout(connectWA, 5000);
      }
    } else if (connection === 'open') {
      console.log('Connection opened successfully!');
      
      // Test connection with a simple presence update
      try {
        await sock.sendPresenceUpdate('available', targetNumber);
        console.log('Presence update sent successfully');
        
        // Setup scheduler for automatic messages
        setupScheduler(sock);
      } catch (err) {
        console.error('Error in connection test:', err);
      }
    }
  });
  
  return sock;
}

function setupScheduler(sock) {
  console.log('Setting up automatic message scheduler...');
  
  // Schedule task to run at 4:30 PM (16:30) every day
  cron.schedule('0 17 * * *', async () => {
    try {
      console.log(`Sending scheduled message to ${targetNumber}...`);
      await sock.sendMessage(targetNumber, { text: autoMessage });
      console.log('Scheduled message sent successfully');
    } catch (error) {
      console.error('Failed to send scheduled message:', error);
    }
  }, {
    timezone: "Asia/Jakarta"
  });
  
  console.log('Scheduler set up successfully. Message will be sent at 4:30 PM (16:30) Jakarta time.');
}

// Express Routes
app.get('/', (req, res) => {
  res.send('Bot is running');
});

// Add a health check endpoint (useful for monitoring)
app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString()
  });
});

// Start Express Server
app.listen(port, () => {
  console.log(`Express server listening on port ${port}`);
  
  // Start the WhatsApp bot
  console.log('WhatsApp Bot starting...');
  connectWA().catch(err => {
    console.error('Fatal error starting bot:', err);
    process.exit(1);
  });
});