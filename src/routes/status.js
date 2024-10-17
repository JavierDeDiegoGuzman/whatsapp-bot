const express = require('express');
const router = express.Router();
const { getConnectionStatus, getQRCode } = require('../services/whatsapp');

router.get('/', (req, res) => {
  const qrCode = getQRCode();
  const connectionStatus = getConnectionStatus();

  if (qrCode) {
    res.send(`
      <h1>Escanea este QR para autenticar</h1>
      <img src="${qrCode}">
    `);
  } else {
    res.send(`<h1>Estado de conexión: ${connectionStatus}</h1>`);
  }
});

module.exports = router;
