const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason, useMultiFileAuthState, downloadMediaMessage } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const { addPageToNotion } = require('./services/notion');
const { NOTION_DATABASE_ID } = require('./config/env');
const { transcribeAudio, improveTextWithChatGPT, summarizeWithChatGPT, generateFileName } = require('./services/openai');

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys')
    
    const sock = makeWASocket({
        printQRInTerminal: true,
        auth: state
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if(connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom &&
                lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut);
            console.log('connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
            if(shouldReconnect) {
                connectToWhatsApp();
            }
        } else if(connection === 'open') {
            console.log('opened connection');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        console.log(JSON.stringify(m, undefined, 2));

        if (m.type === 'notify') {
            for (const msg of m.messages) {
                if (!msg.key.fromMe) {
                    const jid = msg.key.remoteJid;
                    
                    if (msg.message?.audioMessage) {
                        await handleAudioMessage(msg, sock);
                    } else if (msg.message?.conversation || msg.message?.extendedTextMessage) {
                        await handleTextMessage(msg, sock);
                    }
                }
            }
        }
    });
}

async function handleAudioMessage(msg, sock) {
    const { remoteJid } = msg.key;
    await sock.sendMessage(remoteJid, { text: "Transcribiendo audio..." });

    try {
        const buffer = await downloadMediaMessage(
            msg,
            'buffer',
            {},
            { 
                logger: console,
                reuploadRequest: sock.updateMediaMessage
            }
        );
        const transcription = await transcribeAudio(buffer);
        const improvedText = await improveTextWithChatGPT(transcription);
        await sock.sendMessage(remoteJid, { text: improvedText });
    } catch (error) {
        console.error('Error al procesar el audio:', error);
        await sock.sendMessage(remoteJid, { text: 'Error al procesar el audio.' });
    }
}

async function handleTextMessage(msg, sock) {
    const { remoteJid } = msg.key;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

    if (text.toLowerCase().startsWith('save')) {
        await handleSaveCommand(msg, sock);
    } else if (text.toLowerCase().startsWith('resume')) {
        await handleResumeCommand(msg, sock);
    }
}


async function handleSaveCommand(msg, sock) {
    const { remoteJid } = msg.key;
    const fullText = msg.message.conversation || (msg.message.extendedTextMessage && msg.message.extendedTextMessage.text) || '';
    const saveCommand = fullText.split(' ')[0].toLowerCase();
    let fileName = fullText.substring(saveCommand.length).trim();
    
    // Obtener el mensaje citado
    const quotedMessage = msg.message.extendedTextMessage && 
                          msg.message.extendedTextMessage.contextInfo && 
                          msg.message.extendedTextMessage.contextInfo.quotedMessage;

    // Extraer el contenido del mensaje citado
    let contentToSave = '';
    if (quotedMessage) {
        if (quotedMessage.conversation) {
            contentToSave = quotedMessage.conversation;
        } else if (quotedMessage.extendedTextMessage && quotedMessage.extendedTextMessage.text) {
            contentToSave = quotedMessage.extendedTextMessage.text;
        }
    }

    if (!contentToSave) {
        await sock.sendMessage(remoteJid, { text: 'Por favor, cita el mensaje que quieres guardar.' });
        return;
    }

      try {
        if (!fileName) {
            await sock.sendMessage(remoteJid, { text: 'Generando un nombre de archivo...' });
            fileName = await generateFileName(contentToSave);
        }

        console.log('Guardando en Notion:', { fileName, contentToSave });
        const notionResponse = await addPageToNotion(NOTION_DATABASE_ID, fileName, contentToSave);
        console.log('Respuesta de Notion:', notionResponse);
        const pageUrl = `https://www.notion.so/${notionResponse.id.replace(/-/g, '')}`;
        await sock.sendMessage(remoteJid, { text: `Contenido guardado en Notion como "${fileName}"\n${pageUrl}` });
    } catch (error) {
        console.error('Error al guardar en Notion:', error);
        await sock.sendMessage(remoteJid, { text: 'Error al guardar en Notion. Por favor, intenta de nuevo.' });
    }
}



connectToWhatsApp();
