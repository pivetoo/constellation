/**
 * Constellation - Streamer e Formatador de Respostas (SSE)
 */

import { thoughtSignatureStore } from './message-converter.js';

/**
 * Transmite o stream do Google no formato Anthropic SSE (usado pelo Claude Code)
 */
export async function streamAnthropicResponse(googleReadableStream, res, modelName) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const messageId = `msg_${Date.now()}`;
  let blockIndex = 0;
  let hasStartedText = false;
  let inThoughtBlock = false;
  let stopReason = 'end_turn';
  const collectedTools = [];
  let fullText = '';

  // 1. Início da mensagem
  res.write(`event: message_start\ndata: ${JSON.stringify({
    type: 'message_start',
    message: {
      id: messageId,
      type: 'message',
      role: 'assistant',
      content: [],
      model: modelName,
      stop_reason: null,
      usage: { input_tokens: 0, output_tokens: 0 }
    }
  })}\n\n`);

  const reader = googleReadableStream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('data: ');
    buffer = blocks.pop() || '';

    for (let block of blocks) {
      block = block.trim();
      if (!block || block === '[DONE]') continue;

      try {
        const jsonStr = block.split('\n')[0];
        const parsed = JSON.parse(jsonStr);

        if (parsed.error) {
          throw new Error(`Google API Error: ${parsed.error.message || JSON.stringify(parsed.error)}`);
        }

        const candidate = parsed.response?.candidates?.[0] || parsed.candidates?.[0];
        if (!candidate?.content?.parts) continue;

        for (const part of candidate.content.parts) {
          // Processa pensamento (thought) ou texto normal
          let textChunk = '';
          let isThought = false;

          if (typeof part.thought === 'string') {
            isThought = true;
            textChunk = part.thought;
          } else if (part.text) {
            textChunk = part.text;
            if (part.thought === true || part.isThought === true) {
              isThought = true;
            }
          }

          if (textChunk) {
            let formattedChunk = '';
            if (isThought && !inThoughtBlock) {
              inThoughtBlock = true;
              formattedChunk = '<think>\n' + textChunk;
            } else if (!isThought && inThoughtBlock) {
              inThoughtBlock = false;
              formattedChunk = '\n</think>\n\n' + textChunk;
            } else {
              formattedChunk = textChunk;
            }

            fullText += formattedChunk;

            if (!hasStartedText) {
              res.write(`event: content_block_start\ndata: ${JSON.stringify({
                type: 'content_block_start',
                index: blockIndex,
                content_block: { type: 'text', text: '' }
              })}\n\n`);
              hasStartedText = true;
            }

            res.write(`event: content_block_delta\ndata: ${JSON.stringify({
              type: 'content_block_delta',
              index: blockIndex,
              delta: { type: 'text_delta', text: formattedChunk }
            })}\n\n`);
          } else if (part.functionCall) {
            // Processa chamada de ferramenta (tool use)
            const funcName = part.functionCall.name;
            const argsObj = part.functionCall.args || {};
            const argsStr = JSON.stringify(argsObj);
            const toolId = part.functionCall.id || `toolu_${Date.now()}_${Math.random().toString(36).substring(7)}`;

            const sig = part.thoughtSignature || part.thought_signature;
            if (sig) {
              thoughtSignatureStore.set(toolId, sig);
              thoughtSignatureStore.set(funcName, sig);
            }

            collectedTools.push({ type: 'tool_use', id: toolId, name: funcName, input: argsObj });

            if (hasStartedText) {
              if (inThoughtBlock) {
                fullText += '\n</think>\n\n';
                res.write(`event: content_block_delta\ndata: ${JSON.stringify({
                  type: 'content_block_delta',
                  index: blockIndex,
                  delta: { type: 'text_delta', text: '\n</think>\n\n' }
                })}\n\n`);
                inThoughtBlock = false;
              }
              res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: blockIndex })}\n\n`);
              blockIndex++;
              hasStartedText = false;
            }

            res.write(`event: content_block_start\ndata: ${JSON.stringify({
              type: 'content_block_start',
              index: blockIndex,
              content_block: { type: 'tool_use', id: toolId, name: funcName, input: {} }
            })}\n\n`);

            res.write(`event: content_block_delta\ndata: ${JSON.stringify({
              type: 'content_block_delta',
              index: blockIndex,
              delta: { type: 'input_json_delta', partial_json: argsStr }
            })}\n\n`);

            res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: blockIndex })}\n\n`);
            blockIndex++;
            stopReason = 'tool_use';
          }
        }
      } catch (err) {
        if (err.message.includes('Google API Error')) throw err;
      }
    }
  }

  // Fecha bloco de texto se ainda estiver aberto
  if (hasStartedText) {
    if (inThoughtBlock) {
      fullText += '\n</think>\n\n';
      res.write(`event: content_block_delta\ndata: ${JSON.stringify({
        type: 'content_block_delta',
        index: blockIndex,
        delta: { type: 'text_delta', text: '\n</think>\n\n' }
      })}\n\n`);
    }
    res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: blockIndex })}\n\n`);
  }

  // Finalização da mensagem Anthropic
  res.write(`event: message_delta\ndata: ${JSON.stringify({
    type: 'message_delta',
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: Math.ceil(fullText.length / 4) }
  })}\n\n`);

  res.write(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
  res.end();
}

/**
 * Transmite o stream do Google no formato OpenAI SSE (usado por Cursor, Aider, etc.)
 */
export async function streamOpenAIResponse(googleReadableStream, res, modelName) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const id = `chatcmpl-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);

  const reader = googleReadableStream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('data: ');
    buffer = blocks.pop() || '';

    for (let block of blocks) {
      block = block.trim();
      if (!block || block === '[DONE]') continue;

      try {
        const jsonStr = block.split('\n')[0];
        const parsed = JSON.parse(jsonStr);

        if (parsed.error) {
          throw new Error(`Google API Error: ${parsed.error.message || JSON.stringify(parsed.error)}`);
        }

        const candidate = parsed.response?.candidates?.[0] || parsed.candidates?.[0];
        if (!candidate?.content?.parts) continue;

        for (const part of candidate.content.parts) {
          const chunkText = part.text || part.thought || '';
          if (chunkText) {
            res.write(`data: ${JSON.stringify({
              id,
              object: 'chat.completion.chunk',
              created,
              model: modelName,
              choices: [{
                index: 0,
                delta: { content: chunkText },
                finish_reason: null
              }]
            })}\n\n`);
          }
        }
      } catch (err) {
        if (err.message.includes('Google API Error')) throw err;
      }
    }
  }

  res.write(`data: ${JSON.stringify({
    id,
    object: 'chat.completion.chunk',
    created,
    model: modelName,
    choices: [{
      index: 0,
      delta: {},
      finish_reason: 'stop'
    }]
  })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}
