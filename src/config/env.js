const dotenv = require('dotenv');

// Cargar variables de entorno desde .env.local
dotenv.config({ path: '.env.local' });

// Verificar que las variables de entorno necesarias estén definidas
const requiredEnvVars = [
  'OPENAI_API_KEY',
  'NOTION_API_KEY',
  'NOTION_DATABASE_ID'
];

requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    console.error(`Error: ${varName} no está definida en el archivo .env.local`);
    process.exit(1);
  }
});

module.exports = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  NOTION_API_KEY: process.env.NOTION_API_KEY,
  NOTION_DATABASE_ID: process.env.NOTION_DATABASE_ID
};
