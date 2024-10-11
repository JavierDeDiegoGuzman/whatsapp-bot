require('dotenv').config({ path: '.env.local' });
const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const { useMultiFileAuthState, downloadMediaMessage } = require('@whiskeysockets/baileys');
const axios = require('axios');
const FormData = require('form-data');
const express = require('express');
const qrcode = require('qrcode');

const app = express();
const PORT = 3000;

let connectionStatus = "Disconnected";
let qrCode = null;  // Variable para almacenar el código QR si es necesario

// Función para transcribir el audio utilizando OpenAI Whisper con idioma especificado
async function transcribeAudio(buffer, language = 'es') {
  const formData = new FormData();
  formData.append('file', buffer, {
    filename: 'audio.ogg',
    contentType: 'audio/ogg',
  });
  formData.append('model', 'whisper-1');
  formData.append('language', language);

  try {
    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        ...formData.getHeaders(),
      },
    });
    return response.data.text;
  } catch (error) {
    console.error('Error al transcribir el audio:', error.response ? error.response.data : error.message);
    throw new Error('Error al transcribir el audio');
  }
}

async function connectToWhatsApp() {
  let state, saveCreds;

  try {
    ({ state, saveCreds } = await useMultiFileAuthState('auth_info_baileys'));
    
    if (!state) {
      console.error('Authentication state is null or undefined.');
      return;
    }

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false, // No imprimir el QR en la terminal
    });

    // Actualizar el estado de conexión
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        // Guardar el QR para mostrarlo en la web
        qrCode = await qrcode.toDataURL(qr);
      }

      if (connection === 'close') {
        const error = (lastDisconnect && lastDisconnect.error) ? lastDisconnect.error : null;
        const shouldReconnect = error instanceof Boom ? error.output.statusCode !== DisconnectReason.loggedOut : true;

        connectionStatus = 'Disconnected';
        console.log('Connection closed due to', error, ', reconnecting', shouldReconnect);

        if (shouldReconnect) {
          connectToWhatsApp();
        }
      } else if (connection === 'open') {
        connectionStatus = 'Connected';
        qrCode = null;  // Limpiar el QR ya que está conectado
        console.log('Connection opened successfully');
      }
    });

    // Escuchar mensajes entrantes
    sock.ev.on('messages.upsert', async (m) => {
      const msg = m.messages[0];
      if (!msg.message || msg.key.fromMe) return;

      if (msg.message.audioMessage) {
        const jid = msg.key.remoteJid;
        await sock.sendMessage(jid, { text: "Transcribiendo audio..." });

        try {
          const buffer = await downloadMediaMessage(msg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
          const transcription = await transcribeAudio(buffer, 'es');
          await sock.sendMessage(jid, { text: `Transcripción: ${transcription}` });
        } catch (error) {
          await sock.sendMessage(jid, { text: 'Error al transcribir el audio.' });
        }
      }
    });

    sock.ev.on('creds.update', saveCreds);

  } catch (error) {
    console.error('Error al inicializar la conexión con WhatsApp:', error);
  }
}

// Endpoint para mostrar el estado de conexión o el QR
app.get('/', (req, res) => {
  if (qrCode) {
    // Si hay un QR disponible, mostrarlo
    res.send(`
      <h1>Escanea este QR para autenticar</h1>
      <img src="${qrCode}">
    `);
  } else {
    // Mostrar el estado de conexión si no se necesita QR
    res.send(`<h1>Estado de conexión: ${connectionStatus}</h1>`);
  }
});

// Iniciar el servidor HTTP
app.listen(PORT, () => {
  console.log(`Servidor HTTP ejecutándose en http://localhost:${PORT}`);
});

// Iniciar la conexión a WhatsApp
connectToWhatsApp();

