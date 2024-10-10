require('dotenv').config({ path: '.env.local' }); // Cargar variables de entorno

const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const { useMultiFileAuthState, downloadMediaMessage } = require('@whiskeysockets/baileys');
const axios = require('axios');
const FormData = require('form-data');

// Clave de API desde .env.local
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const respondedMessages = new Set();

// Función para transcribir el audio utilizando OpenAI Whisper con idioma especificado
async function transcribeAudio(buffer, language = 'es') {
  const formData = new FormData();
  formData.append('file', buffer, {
    filename: 'audio.ogg',
    contentType: 'audio/ogg',
  });
  formData.append('model', 'whisper-1'); // Modelo de Whisper
  formData.append('language', language); // Especificar el idioma de la transcripción

  try {
    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        ...formData.getHeaders(),
      },
    });
    return response.data.text; // Esto contiene la transcripción
  } catch (error) {
    console.error('Error al transcribir el audio:', error.response ? error.response.data : error.message);
    throw new Error('Error al transcribir el audio');
  }
}

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

      // Enviar el mensaje de texto "transcribiendo audio"
      await sock.sendMessage(jid, { text: "Transcribiendo audio..." });

      try {
        // Descargar el audio sin guardar archivo, solo en buffer
        const buffer = await downloadMediaMessage(msg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });

        // Transcribir el audio usando la API de OpenAI, especificando el idioma en español ('es')
        const transcription = await transcribeAudio(buffer, 'es');
        console.log('Transcription:', transcription);

        // Enviar la transcripción de vuelta al usuario
        await sock.sendMessage(jid, { text: `Transcripción: ${transcription}` });
      } catch (error) {
        await sock.sendMessage(jid, { text: 'Error al transcribir el audio.' });
      }

      // Marcar el mensaje como procesado
      respondedMessages.add(msg.key.id);
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

connectToWhatsApp();

