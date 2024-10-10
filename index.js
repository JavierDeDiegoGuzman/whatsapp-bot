const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');

// Almacenaremos los IDs de los mensajes a los que ya hemos respondido
const respondedMessages = new Set();

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const error = (lastDisconnect && lastDisconnect.error) ? lastDisconnect.error : null;
      const shouldReconnect = error instanceof Boom ? error.output.statusCode !== DisconnectReason.loggedOut : true;
      
      console.log('Connection closed due to', error, ', reconnecting', shouldReconnect);
      
      // Reintentar conexión si no está deslogueado
      if (shouldReconnect) {
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      console.log('Connection opened');
    }
  });

  // Escuchar mensajes entrantes
  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];

    // Verificar si el mensaje es nuestro o si ya hemos respondido
    if (!msg.message || msg.key.fromMe || respondedMessages.has(msg.key.id)) return;

    const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

    if (text) {
      console.log('Received message:', text);
      const jid = msg.key.remoteJid;

      // Enviar solo una vez
      await sock.sendMessage(jid, { text: text });
      console.log(`Replied with message: "${text}"`);

      // Marcar el mensaje como procesado
      respondedMessages.add(msg.key.id);
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

connectToWhatsApp();

