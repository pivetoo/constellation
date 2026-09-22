/**
 * Constellation - Conversor de Mensagens (Anthropic/OpenAI -> Gemini)
 */

/**
 * Extrai o texto do system prompt tanto no formato string quanto em array de blocos
 */
export function extractSystemPrompt(system) {
  if (!system) return '';
  if (typeof system === 'string') return system;
  if (Array.isArray(system)) {
    return system
      .filter(b => b && b.type === 'text')
      .map(b => b.text)
      .join('\n');
  }
  return '';
}

export const thoughtSignatureStore = new Map();

/**
 * Converte o histórico de mensagens da Anthropic (Claude Code) para o formato do Gemini
 */
export function convertAnthropicMessagesToGemini(messages) {
  const conversationParts = [];
  const toolIdToName = {};

  for (const msg of messages) {
    const parts = [];

    if (typeof msg.content === 'string') {
      if (msg.content.trim().length > 0) {
        parts.push({ text: msg.content });
      }
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (!block) continue;

        if (block.type === 'text') {
          if (block.text && block.text.trim().length > 0) {
            parts.push({ text: block.text });
          }
        } else if (block.type === 'thinking') {
          if (block.thinking) parts.push({ text: block.thinking, thought: true });
        } else if (block.type === 'tool_use') {
          const rawName = block.name || 'tool';
          const sanitizedName = rawName.replace(/[^a-zA-Z0-9_-]/g, '_');
          toolIdToName[block.id] = sanitizedName;

          const sig = thoughtSignatureStore.get(block.id) ||
                      thoughtSignatureStore.get(block.name) ||
                      thoughtSignatureStore.get(sanitizedName) ||
                      'skip_thought_signature_validator';

          parts.push({
            functionCall: {
              name: sanitizedName,
              args: block.input || {}
            },
            thoughtSignature: sig
          });
        } else if (block.type === 'tool_result') {
          const funcName = toolIdToName[block.tool_use_id] || (block.name ? block.name.replace(/[^a-zA-Z0-9_-]/g, '_') : 'tool_response');
          let resultStr = '';
          if (typeof block.content === 'string') {
            resultStr = block.content;
          } else if (Array.isArray(block.content)) {
            resultStr = block.content.map(b => b.text || JSON.stringify(b)).join('\n');
          } else if (block.content) {
            resultStr = JSON.stringify(block.content);
          }

          parts.push({
            functionResponse: {
              name: funcName,
              response: {
                name: funcName,
                content: resultStr || 'OK'
              }
            }
          });
        } else if (block.type === 'image') {
          if (block.source && block.source.type === 'base64') {
            parts.push({
              inlineData: {
                mimeType: block.source.media_type || 'image/jpeg',
                data: block.source.data
              }
            });
          }
        }
      }
    }

    const mappedRole = (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user';
    if (parts.length > 0) {
      conversationParts.push({ role: mappedRole, parts });
    }
  }

  // Garantir que a conversa sempre inicie com mensagem do usuário
  if (conversationParts.length > 0 && conversationParts[0].role !== 'user') {
    conversationParts.unshift({ role: 'user', parts: [{ text: 'Hello' }] });
  }

  return mergeConsecutiveRoles(conversationParts);
}

/**
 * Converte mensagens no padrão OpenAI (para Cursor, Aider, etc.)
 */
export function convertOpenAIMessagesToGemini(messages) {
  let systemText = '';
  const conversationParts = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemText += (systemText ? '\n' : '') + (typeof msg.content === 'string' ? msg.content : '');
      continue;
    }

    const parts = [];
    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const item of msg.content) {
        if (item.type === 'text') parts.push({ text: item.text });
      }
    }

    if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        let args = {};
        try {
          args = JSON.parse(tc.function.arguments);
        } catch {
          args = {};
        }
        parts.push({
          functionCall: {
            name: tc.function.name,
            args
          },
          thoughtSignature: 'skip_thought_signature_validator'
        });
      }
    }

    if (msg.role === 'tool') {
      parts.push({
        functionResponse: {
          name: msg.name || 'tool',
          response: {
            name: msg.name || 'tool',
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
          }
        }
      });
    }

    const mappedRole = (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user';
    if (parts.length > 0) {
      conversationParts.push({ role: mappedRole, parts });
    }
  }

  // Garantir que a conversa sempre inicie com mensagem do usuário
  if (conversationParts.length > 0 && conversationParts[0].role !== 'user') {
    conversationParts.unshift({ role: 'user', parts: [{ text: 'Hello' }] });
  }

  return {
    systemPrompt: systemText,
    contents: mergeConsecutiveRoles(conversationParts)
  };
}

/**
 * Mescla mensagens consecutivas do mesmo papel (ex: dois 'user' seguidos)
 * para evitar rejeição pela API do Vertex / Cloud Code
 */
function mergeConsecutiveRoles(conversationParts) {
  const merged = [];
  for (const part of conversationParts) {
    if (merged.length > 0 && merged[merged.length - 1].role === part.role) {
      merged[merged.length - 1].parts.push(...part.parts);
    } else {
      merged.push(part);
    }
  }
  return merged;
}
