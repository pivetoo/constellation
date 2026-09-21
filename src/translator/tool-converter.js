/**
 * Constellation - Conversor de Ferramentas (Anthropic Tools -> Gemini FunctionDeclarations)
 */

/**
 * Normaliza e limpa o JSON Schema para compatibilidade estrita com a API do Gemini
 */
function cleanSchema(obj, isPropertiesMap = false) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(x => cleanSchema(x));

  // Desempacota anyOf / oneOf / allOf se presentes no schema
  let sourceObj = obj;
  if (!obj.type && (obj.anyOf || obj.oneOf || obj.allOf)) {
    const branches = obj.anyOf || obj.oneOf || obj.allOf;
    if (Array.isArray(branches) && branches.length > 0) {
      const valid = branches.find(b => b && typeof b === 'object' && (b.type || b.properties || b.items));
      if (valid) {
        sourceObj = { ...valid, description: obj.description || valid.description };
      }
    }
  }

  const cleaned = {};
  const allowedKeys = ['type', 'description', 'properties', 'required', 'items', 'enum'];

  for (const [key, value] of Object.entries(sourceObj)) {
    if (isPropertiesMap) {
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
        } else if (key === 'items') {
          cleaned[key] = cleanSchema(value, false);
        } else if (key === 'required') {
          if (Array.isArray(value)) {
            cleaned[key] = value.filter(r => typeof r === 'string');
          }
        } else {
          cleaned[key] = cleanSchema(value, false);
        }
      }
    }
  }

  if (!isPropertiesMap) {
    if (cleaned.properties && !cleaned.type) cleaned.type = 'OBJECT';
    if (cleaned.items && !cleaned.type) cleaned.type = 'ARRAY';
    if (!cleaned.type && !cleaned.properties && !cleaned.items) cleaned.type = 'STRING';

    if (cleaned.type === 'OBJECT' && !cleaned.properties) {
      cleaned.properties = {};
    }

    if (cleaned.properties && cleaned.required && Array.isArray(cleaned.required)) {
      cleaned.required = cleaned.required.filter(k => Object.prototype.hasOwnProperty.call(cleaned.properties, k));
      if (cleaned.required.length === 0) delete cleaned.required;
    }
  }

  return cleaned;
}

/**
 * Garante recursivamente que toda estrutura do tipo ARRAY possua o campo obrigatório 'items'
 */
function fixArrayItemsRecursively(schema) {
  if (!schema || typeof schema !== 'object') return;

  if (schema.type === 'ARRAY') {
    if (!schema.items || typeof schema.items !== 'object' || Object.keys(schema.items).length === 0) {
      schema.items = { type: 'STRING' };
    } else if (!schema.items.type && !schema.items.properties && !schema.items.items) {
      schema.items.type = 'STRING';
    }
    fixArrayItemsRecursively(schema.items);
  }

  if (schema.properties && typeof schema.properties === 'object') {
    for (const prop of Object.values(schema.properties)) {
      fixArrayItemsRecursively(prop);
    }
  }

  if (schema.items && typeof schema.items === 'object') {
    fixArrayItemsRecursively(schema.items);
  }
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
        if (schema.type === 'OBJECT' && !schema.properties) schema.properties = {};

        // Garante que arrays não tenham items ausentes
        fixArrayItemsRecursively(schema);

        return {
          name: tool.name,
          description: tool.description || '',
          parameters: schema
        };
      })
    }
  ];
}
