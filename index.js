require('dotenv').config({ path: '.env.local' });
const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const { useMultiFileAuthState, downloadMediaMessage } = require('@whiskeysockets/baileys');
const axios = require('axios');
const FormData = require('form-data');
const express = require('express');
const qrcode = require('qrcode');
const { addPageToNotion } = require('./libs/notion'); // Import the Notion function

const app = express();
const PORT = 3000;

let connectionStatus = "Disconnected";
let qrCode = null;  // Variable para almacenar el código QR si es necesario

// Function to transcribe the audio using OpenAI Whisper
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

// Function to send a message to ChatGPT for text improvement
async function improveTextWithChatGPT(transcription) {
  const prompt = `Estás editando la transcripción de una conversación en la que se discuten estrategias de marketing y organización de contenido. Quiero que transformes esta transcripción en un texto legible, coherente y bien estructurado, eliminando repeticiones, errores gramaticales, y frases innecesarias. Mantén el tono informal y el contenido clave. A continuación, te proporciono la transcripción original:

  ${transcription}

  Objetivos para el texto legible:
  Estructura clara y fluida.
  Elimina las frases repetitivas o sin sentido.
  Organiza las ideas en párrafos según su lógica.
  Mantén la intención y tono del original.`;

  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'Eres un asistente que mejora transcripciones de texto.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1024,
      temperature: 0.7,
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
    });

    // Validar si la respuesta contiene el formato esperado
    if (response.data && response.data.choices && response.data.choices.length > 0) {
      return response.data.choices[0].message.content.trim();
    } else {
      console.error('La respuesta de la API no contiene datos válidos:', response.data);
      throw new Error('Respuesta inválida de la API de OpenAI');
    }
  } catch (error) {
    console.error('Error al mejorar el texto con ChatGPT:', error.response ? error.response.data : error.message);
    throw new Error('Error al mejorar el texto');
  }
}





// WhatsApp connection function
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

      const jid = msg.key.remoteJid;

      if (msg.message.audioMessage) {
        await sock.sendMessage(jid, { text: "Transcribiendo audio..." });

        try {
          const buffer = await downloadMediaMessage(msg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
          const transcription = await transcribeAudio(buffer, 'es');

          // Improve transcription using ChatGPT
          const improvedText = await improveTextWithChatGPT(transcription);

          // Send the improved transcription back to the user
          await sock.sendMessage(jid, { text: improvedText});

        } catch (error) {
          await sock.sendMessage(jid, { text: 'Error al procesar el audio.' });
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

