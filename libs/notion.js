const { Client } = require('@notionhq/client');
require('dotenv').config({ path: '.env.local' });

// Inicializa el cliente de Notion con tu clave de API
const notion = new Client({ auth: process.env.NOTION_API_KEY });

// Función para añadir una página a una base de datos de Notion
async function addPageToNotion(databaseId, title, content) {
  try {
    const response = await notion.pages.create({
      parent: { database_id: databaseId },  // ID de la base de datos de Notion
      properties: {
        Title: {
          title: [
            {
              text: {
                content: title,  // Título de la página
              },
            },
          ],
        },
      },
      children: [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: content,  // Contenido de texto de la página
                },
              },
            ],
          },
        },
      ],
    });
    console.log('Página añadida a Notion con éxito:', response);
    return response;
  } catch (error) {
    console.error('Error al añadir página a Notion:', error);
    throw error;
  }
}

// Exportar la función para su uso en otros archivos
module.exports = { addPageToNotion };

// Si el archivo se ejecuta directamente, ejecuta la función con un caso de prueba
if (require.main === module) {
  // Caso de prueba: añade una página con título y contenido
  const databaseId = '11c395ba689d80938ecae7ceb580b88c';  // Reemplaza con tu ID de base de datos de Notion
  const title = 'Página de prueba';  // Título de la página
  const content = 'Este es el contenido de la página de prueba';  // Contenido de la página

  (async () => {
    try {
      const response = await addPageToNotion(databaseId, title, content);
      console.log('Página de prueba añadida con éxito:', response);
    } catch (error) {
      console.error('Error al ejecutar el caso de prueba:', error);
    }
  })();
}

