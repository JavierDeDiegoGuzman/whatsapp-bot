const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const { useMultiFileAuthState } = require('@whiskeysockets/baileys');

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

    // Verificar si el mensaje es un audio
    if (msg.message.audioMessage) {
      console.log('Received an audio message');

      const jid = msg.key.remoteJid;

      // Enviar el mensaje de texto "audio recibido"
      await sock.sendMessage(jid, { text: "Audio recibido" });
      console.log('Replied with message: "Audio recibido".');

      // Marcar el mensaje como procesado
      respondedMessages.add(msg.key.id);
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

connectToWhatsApp();

