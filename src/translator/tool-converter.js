/**
 * Constellation - Conversor de Ferramentas (Anthropic Tools -> Gemini FunctionDeclarations)
 */

/**
 * Normaliza e limpa o JSON Schema para compatibilidade estrita com a API do Gemini
 */
function cleanSchema(obj, isPropertiesMap = false) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(x => cleanSchema(x));

  const cleaned = {};
  const allowedKeys = ['type', 'description', 'properties', 'required', 'items', 'enum'];

  for (const [key, value] of Object.entries(obj)) {
    if (isPropertiesMap) {
      // Dentro de properties, a chave é o nome da propriedade e o valor é o schema
      cleaned[key] = cleanSchema(value, false);
    } else {
      if (allowedKeys.includes(key)) {
        if (key === 'type') {
          if (Array.isArray(value)) {
            cleaned[key] = (value.find(t => t !== 'null') || 'STRING').toUpperCase();
          } else if (typeof value === 'string') {
            cleaned[key] = value.toUpperCase();
          }
        } else if (key === 'properties') {
          cleaned[key] = cleanSchema(value, true);
        } else {
          cleaned[key] = cleanSchema(value, false);
        }
      }
    }
  }

  if (!isPropertiesMap) {
    if (cleaned.properties && !cleaned.type) cleaned.type = 'OBJECT';
    if (!cleaned.type && !cleaned.properties && !cleaned.items) cleaned.type = 'STRING';
  }

  return cleaned;
}

/**
 * Converte a lista de ferramentas do Claude Code em declarações de função do Gemini
 */
export function convertAnthropicToolsToGemini(tools) {
  if (!tools || !Array.isArray(tools) || tools.length === 0) {
    return undefined;
  }

  return [
    {
      functionDeclarations: tools.map(tool => {
        let schema = tool.input_schema
          ? cleanSchema(tool.input_schema)
          : { type: 'OBJECT', properties: {} };

        if (!schema.type) schema.type = 'OBJECT';

        return {
          name: tool.name,
          description: tool.description || '',
          parameters: schema
        };
      })
    }
  ];
}
