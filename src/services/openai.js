const axios = require('axios');
const FormData = require('form-data');
const { OPENAI_API_KEY } = require('../config/env');

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
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        ...formData.getHeaders(),
      },
    });
    return response.data.text;
  } catch (error) {
    console.error('Error al transcribir el audio:', error.response ? error.response.data : error.message);
    throw new Error('Error al transcribir el audio');
  }
}

async function improveTextWithChatGPT(transcription) {
  const prompt = `Eres un asistente encargado de mejorar la calidad de una transcripción de audio. Tu tarea es tomar la transcripción original que se te proporciona y hacer lo siguiente:
  
  1. Corrige cualquier error gramatical.
  2. Reorganiza frases si es necesario para que el texto sea fluido y claro.
  3. Elimina cualquier redundancia o repetición innecesaria.
  4. Mantén el tono conversacional y natural.
  
  Aquí está la transcripción original:

  "${transcription}"`;

  return await chatGPTRequest(prompt, 'Eres un asistente que mejora transcripciones de texto.');
}

async function summarizeWithChatGPT(text) {
  const prompt = `Por favor, resume el siguiente texto en bullet points claros y concisos. Asegúrate de incluir los puntos más importantes sin perder el contexto principal:

  "${text}"`;

  return await chatGPTRequest(prompt, 'Eres un asistente que resume textos largos en puntos clave.');
}

async function chatGPTRequest(prompt, systemMessage) {
  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1024,
      temperature: 0.7,
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
    });

    if (response.data && response.data.choices && response.data.choices.length > 0) {
      return response.data.choices[0].message.content.trim();
    } else {
      console.error('La respuesta de la API no contiene datos válidos:', response.data);
      throw new Error('Respuesta inválida de la API de OpenAI');
    }
  } catch (error) {
    console.error('Error en la solicitud a ChatGPT:', error.response ? error.response.data : error.message);
    throw new Error('Error en la solicitud a ChatGPT');
  }
}

async function generateFileName(content) {
  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'Eres un asistente experto en crear nombres de archivo concisos y descriptivos.' },
        { role: 'user', content: `Genera un nombre de archivo corto y descriptivo basado en el siguiente contenido. 
          Requisitos:
          1. Usa máximo 5 palabras.
          2. Usa espacios para separar palabras.
          3. No incluyas la extensión del archivo.
          4. El nombre debe ser descriptivo pero conciso.
          5. No incluyas la palabra "archivo" o similares en el nombre.

          Contenido: "${content.substring(0, 200)}${content.length > 200 ? '...' : ''}"` }
      ],
      max_tokens: 60,
      temperature: 0.7,
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
    });

    if (response.data && response.data.choices && response.data.choices.length > 0) {
      let fileName = response.data.choices[0].message.content.trim();
      // Asegurar que el nombre del archivo cumpla con los requisitos
      fileName = fileName.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50);
      return fileName;
    } else {
      console.error('La respuesta de la API no contiene datos válidos:', response.data);
      throw new Error('Respuesta inválida de la API de OpenAI');
    }
  } catch (error) {
    console.error('Error al generar el nombre del archivo:', error.response ? error.response.data : error.message);
    throw new Error('Error al generar el nombre del archivo');
  }
}

module.exports = {
  transcribeAudio,
  improveTextWithChatGPT,
  summarizeWithChatGPT,
  generateFileName
};

