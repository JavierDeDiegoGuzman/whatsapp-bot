const { Client } = require('@notionhq/client');
const { NOTION_API_KEY } = require('../config/env');

const notion = new Client({ auth: NOTION_API_KEY });

async function addPageToNotion(databaseId, title, content) {
  try {
    const response = await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        title: {
          title: [
            {
              text: {
                content: title,
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
                  content: content,
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

module.exports = { addPageToNotion };
