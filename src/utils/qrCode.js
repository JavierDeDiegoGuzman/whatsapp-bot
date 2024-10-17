const qrcode = require('qrcode');

async function generateQR(data) {
  try {
    return await qrcode.toDataURL(data);
  } catch (error) {
    console.error('Error al generar el código QR:', error);
    throw error;
  }
}

module.exports = { generateQR };
