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
  let state, saveCreds;

  try {
    // Load authentication state
    ({ state, saveCreds } = await useMultiFileAuthState('auth_info_baileys'));
    
    if (!state) {
      console.error('Authentication state is null or undefined.');
      return;
    }

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: true, // This ensures the QR code is printed for manual login if necessary
    });

    // Handle connection updates
    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;

      // Check if connection is closed
      if (connection === 'close') {
        const error = (lastDisconnect && lastDisconnect.error) ? lastDisconnect.error : null;
        const shouldReconnect = error instanceof Boom ? error.output.statusCode !== DisconnectReason.loggedOut : true;

        console.log('Connection closed due to', error, ', reconnecting', shouldReconnect);

        // Check if the error was caused by unauthorized (401)
        if (error && error.output && error.output.statusCode === 401) {
          console.error('Connection failure due to unauthorized (401). Check your credentials.');
          return; // Don't attempt to reconnect on authorization failure
        }

        // Reconnect only if logged out or not an unauthorized issue
        if (shouldReconnect) {
          connectToWhatsApp();
        }
      } else if (connection === 'open') {
        console.log('Connection opened successfully');
      }
    });

    // Listen for incoming messages
    sock.ev.on('messages.upsert', async (m) => {
      const msg = m.messages[0];

      // Skip messages that are from self or already processed
      if (!msg.message || msg.key.fromMe || respondedMessages.has(msg.key.id)) return;

      // Check if the message is an audio
      if (msg.message.audioMessage) {
        console.log('Received an audio message');

        const jid = msg.key.remoteJid;

        // Send transcription status
        await sock.sendMessage(jid, { text: "Transcribiendo audio..." });

        try {
          // Download audio without saving file, just as buffer
          const buffer = await downloadMediaMessage(msg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });

          // Transcribe the audio using OpenAI's Whisper model
          const transcription = await transcribeAudio(buffer, 'es');
          console.log('Transcription:', transcription);

          // Send the transcription back to the user
          await sock.sendMessage(jid, { text: `Transcripción: ${transcription}` });
        } catch (error) {
          await sock.sendMessage(jid, { text: 'Error al transcribir el audio.' });
        }

        // Mark message as processed
        respondedMessages.add(msg.key.id);
      }
    });

    sock.ev.on('creds.update', saveCreds);

  } catch (error) {
    console.error('Error initializing WhatsApp connection:', error);
  }
}

// Start the connection
connectToWhatsApp();


