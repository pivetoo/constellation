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
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (!block) continue;

        if (block.type === 'text') {
          parts.push({ text: block.text });
        } else if (block.type === 'thinking') {
          if (block.thinking) parts.push({ text: block.thinking, thought: true });
        } else if (block.type === 'tool_use') {
          toolIdToName[block.id] = block.name;
          const sig = thoughtSignatureStore.get(block.id) ||
                      thoughtSignatureStore.get(block.name) ||
                      'skip_thought_signature_validator';

          parts.push({
            functionCall: {
              id: block.id,
              name: block.name,
              args: block.input || {}
            },
            thoughtSignature: sig,
            thought_signature: sig
          });
        } else if (block.type === 'tool_result') {
          const funcName = toolIdToName[block.tool_use_id] || block.name || 'tool_response';
          const resultStr = typeof block.content === 'string'
            ? block.content
            : JSON.stringify(block.content);

          parts.push({
            functionResponse: {
              id: block.tool_use_id,
              name: funcName,
              response: {
                name: funcName,
                content: resultStr
              }
            }
          });
        }
      }
    }

    const mappedRole = (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user';
    if (parts.length > 0) {
      conversationParts.push({ role: mappedRole, parts });
    }
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
            id: tc.id,
            name: tc.function.name,
            args
          },
          thoughtSignature: 'skip_thought_signature_validator',
          thought_signature: 'skip_thought_signature_validator'
        });
      }
    }

    if (msg.role === 'tool') {
      parts.push({
        functionResponse: {
          id: msg.tool_call_id,
          name: msg.name || 'tool',
          response: { content: msg.content }
        }
      });
    }

    const mappedRole = (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user';
    if (parts.length > 0) {
      conversationParts.push({ role: mappedRole, parts });
    }
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
