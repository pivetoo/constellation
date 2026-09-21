/**
 * Constellation - Servidor de API e Proxy (Claude Code + OpenAI)
 */
import express from 'express';
import chalk from 'chalk';
import path from 'path';
import { fileURLToPath } from 'url';
import { smartRouter } from '../pool/router.js';
import { accountPool } from '../pool/account-pool.js';
import { configManager } from '../config.js';
import { API_ENDPOINTS, ANTIGRAVITY_HEADERS } from '../constants.js';
import { convertAnthropicToolsToGemini } from '../translator/tool-converter.js';
import {
  convertAnthropicMessagesToGemini,
  convertOpenAIMessagesToGemini,
  extractSystemPrompt
} from '../translator/message-converter.js';
import {
  streamAnthropicResponse,
  streamOpenAIResponse
} from '../translator/sse-streamer.js';
import { getAuthorizationUrl, ensureCallbackServer } from '../auth/oauth.js';
import { tokenManager } from '../auth/token-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // CORS aberto para integração com ferramentas locais
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  // 1. Dashboard Web
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
  });

  // 2. Status em JSON das contas e cotas
  app.get('/api/status', async (req, res) => {
    try {
      const accountsStatus = await accountPool.getPoolStatus();
      res.json({ accounts: accountsStatus });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2.1 Iniciar login Google pelo navegador (Popup do Dashboard)
  app.get('/auth/start', async (req, res) => {
    try {
      await ensureCallbackServer();
      const authUrl = getAuthorizationUrl();
      res.redirect(authUrl);
    } catch (err) {
      res.status(500).send('Erro ao iniciar login: ' + err.message);
    }
  });

  // 2.2 Remover conta diretamente pelo Dashboard
  app.delete('/api/accounts/:id', async (req, res) => {
    try {
      const removed = await tokenManager.removeAccount(req.params.id);
      await accountPool.refreshAccounts();
      res.json({ success: removed });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2.1 Consulta e alteração da configuração ativa (seleção de modelo pelo dashboard)
  app.get('/api/config', (req, res) => {
    res.json(configManager.get());
  });

  app.post('/api/config', async (req, res) => {
    try {
      const { defaultModel } = req.body;
      let newAliases = {};

      if (defaultModel === 'claude-opus-4-6-thinking') {
        newAliases = {
          'claude-3-7-sonnet-latest': 'claude-opus-4-6-thinking',
          'claude-3-7-sonnet': 'claude-opus-4-6-thinking',
          'claude-3-5-sonnet': 'claude-opus-4-6-thinking'
        };
      } else if (defaultModel === 'claude-sonnet-4-6') {
        newAliases = {
          'claude-3-7-sonnet-latest': 'claude-sonnet-4-6',
          'claude-3-7-sonnet': 'claude-sonnet-4-6',
          'claude-3-5-sonnet': 'claude-sonnet-4-6'
        };
      } else if (defaultModel === 'gemini-3.1-pro-high') {
        newAliases = {
          'claude-3-7-sonnet-latest': 'gemini-3.1-pro-high',
          'claude-3-7-sonnet': 'gemini-3.1-pro-high',
          'claude-3-5-sonnet': 'gemini-3.1-pro-high'
        };
      } else if (defaultModel === 'gemini-3.8-flash' || defaultModel === 'gemini-3-flash-agent') {
        newAliases = {
          'claude-3-7-sonnet-latest': 'gemini-3.8-flash',
          'claude-3-7-sonnet': 'gemini-3.8-flash',
          'claude-3-5-sonnet': 'gemini-3.8-flash',
          'claude-3-5-haiku': 'gemini-3.8-flash'
        };
      }

      const updated = await configManager.update({
        defaultModel,
        modelAliases: {
          ...configManager.get().modelAliases,
          ...newAliases
        }
      });

      console.log(chalk.magenta(`[Config] Modelo padrão alterado pelo Dashboard para: ${defaultModel}`));
      res.json({ success: true, config: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Catálogo de Modelos (para validação do Claude Code, Cursor, Aider)
  const allKnownModels = [
    'claude-sonnet-5',
    'claude-sonnet-5-20260201',
    'claude-opus-5',
    'claude-haiku-5',
    'claude-3-7-sonnet-latest',
    'claude-3-7-sonnet',
    'claude-3-5-sonnet-latest',
    'claude-3-5-sonnet',
    'claude-3-5-haiku-latest',
    'claude-3-5-haiku',
    'claude-opus-4-6-thinking',
    'claude-sonnet-4-6',
    'gemini-3.1-pro-high',
    'gemini-3.8-flash',
    'gemini-pro',
    'gemini-flash'
  ];

  app.get(['/v1/models/:model', '/v1/v1/models/:model', '/models/:model'], (req, res) => {
    res.json({
      id: req.params.model,
      object: 'model',
      created: 1700000000,
      owned_by: 'constellation'
    });
  });

  app.get(['/v1/models', '/v1/v1/models', '/models'], (req, res) => {
    res.json({
      object: 'list',
      data: allKnownModels.map(id => ({
        id,
        object: 'model',
        created: 1700000000,
        owned_by: 'constellation'
      }))
    });
  });

  // 4. Endpoint Anthropic (/v1/messages) para CLAUDE CODE
  app.post(['/v1/messages', '/v1/v1/messages', '/messages'], async (req, res) => {
    try {
      const {
        messages = [],
        system = '',
        tools = undefined,
        stream = Boolean(req.body.stream),
        max_tokens = 8192,
        temperature = 0.7,
        model: requestedModel,
        querySource
      } = req.body;

      const targetModel = smartRouter.resolveModel(requestedModel);

      // Validação rápida de modelos do Claude Code sem gastar cota nem gerar latência
      if (querySource === 'model_validation') {
        console.log(chalk.green(`[Claude Code] Validação de modelo aprovada: ${requestedModel || targetModel}`));
        return res.json({
          id: `msg_val_${Date.now()}`,
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'OK' }],
          model: requestedModel || targetModel,
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 }
        });
      }
      const geminiTools = convertAnthropicToolsToGemini(tools);
      const contents = convertAnthropicMessagesToGemini(messages);
      const systemPrompt = extractSystemPrompt(system);

      if (contents.length === 0) {
        return res.status(400).json({
          type: 'error',
          error: { type: 'invalid_request_error', message: 'Nenhuma mensagem válida encontrada.' }
        });
      }

      console.log(
        chalk.blue(`[Claude Code] Requisição recebida: `) +
        chalk.white(`Modelo=${requestedModel || 'default'} ➔ `) +
        chalk.green(`${targetModel}`) +
        chalk.gray(`, Stream=${stream}, Ferramentas=${tools ? tools.length : 0}`)
      );

function resolveActualGoogleModel(model) {
  if (!model) return 'gemini-pro-agent';
  const clean = model.toLowerCase();
  if (clean.includes('claude-opus') || clean.includes('opus')) {
    return 'claude-opus-4-6-thinking';
  }
  if (clean.includes('claude-sonnet') || clean.includes('sonnet')) {
    return 'claude-sonnet-4-6';
  }
  if (clean.includes('gemini-3.8-flash') || clean.includes('gemini-3-flash') || clean.includes('gemini-flash') || clean.includes('haiku')) {
    return 'gemini-3.6-flash-high';
  }
  if (clean.includes('gemini-3.1-pro') || clean.includes('gemini-pro') || clean.includes('gemini')) {
    return 'gemini-pro-agent';
  }
  return model;
}

function buildThinkingConfig(actualModel) {
  if (actualModel.includes('opus') || actualModel.includes('thinking')) {
    return { includeThoughts: true, thinkingBudget: 1024 };
  }
  if (actualModel.includes('gemini-pro') || actualModel.includes('gemini-3.6') || actualModel.includes('agent')) {
    return { includeThoughts: true, thinkingLevel: 'high' };
  }
  return undefined;
}

async function callGoogleCodeAssist(account, requestBody) {
  const headers = {
    'Authorization': `Bearer ${account.access_token}`,
    'Content-Type': 'application/json',
    ...ANTIGRAVITY_HEADERS.getHeaders()
  };

  const endpoints = [
    `${API_ENDPOINTS.CLOUD_CODE}/v1internal:streamGenerateContent?alt=sse`,
    `${API_ENDPOINTS.PROD_CLOUD_CODE}/v1internal:streamGenerateContent?alt=sse`
  ];

  let lastError = null;
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });
      if (res.ok) return res;
      const errText = await res.text();
      lastError = new Error(`Google HTTP ${res.status}: ${errText}`);
      if (res.status === 404 || res.status >= 500) continue;
      throw lastError;
    } catch (err) {
      lastError = err;
      if (err.message.includes('404') || err.message.includes('fetch failed')) continue;
      throw err;
    }
  }
  throw lastError;
}

      await smartRouter.executeWithFailover(targetModel, async (account, resolvedModel) => {
        const actualGoogleModel = resolveActualGoogleModel(resolvedModel);
        const thinkingConfig = buildThinkingConfig(actualGoogleModel);
        const finalMaxTokens = thinkingConfig?.thinkingBudget
          ? Math.max(max_tokens || 8192, 4096)
          : (max_tokens || 8192);

        const projectId = account.projectId || API_ENDPOINTS.DEFAULT_PROJECT_ID;
        const requestBody = {
          project: projectId,
          model: actualGoogleModel,
          request: {
            contents,
            tools: geminiTools,
            systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
            generationConfig: {
              temperature,
              maxOutputTokens: finalMaxTokens,
              ...(thinkingConfig ? { thinkingConfig } : {})
            }
          }
        };

        const googleRes = await callGoogleCodeAssist(account, requestBody);

        if (stream) {
          await streamAnthropicResponse(googleRes.body, res, requestedModel || resolvedModel);
        } else {
          // Não-stream: acumula a resposta
          let fullText = '';
          const reader = googleRes.body.getReader();
          const decoder = new TextDecoder();
          let buf = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const blocks = buf.split('data: ');
            buf = blocks.pop() || '';

            for (const b of blocks) {
              const trimmed = b.trim();
              if (!trimmed || trimmed === '[DONE]') continue;
              try {
                const parsed = JSON.parse(trimmed.split('\n')[0]);
                const parts = parsed.response?.candidates?.[0]?.content?.parts || [];
                for (const p of parts) {
                  if (p.text) fullText += p.text;
                }
              } catch {}
            }
          }

          res.json({
            id: `msg_${Date.now()}`,
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: fullText }],
            model: requestedModel || resolvedModel,
            stop_reason: 'end_turn',
            usage: { input_tokens: 0, output_tokens: Math.ceil(fullText.length / 4) }
          });
        }
      });
    } catch (err) {
      console.error(chalk.red(`[Error /v1/messages] ${err.message}`));
      if (!res.headersSent) {
        res.status(500).json({
          type: 'error',
          error: { type: 'api_error', message: err.message }
        });
      }
    }
  });

  // 5. Endpoint OpenAI (/v1/chat/completions) para Cursor, Aider e outros
  app.post('/v1/chat/completions', async (req, res) => {
    try {
      const {
        messages = [],
        model: requestedModel,
        stream = false,
        temperature = 0.7
      } = req.body;

      const targetModel = smartRouter.resolveModel(requestedModel);
      const { systemPrompt, contents } = convertOpenAIMessagesToGemini(messages);

      if (contents.length === 0) {
        return res.status(400).json({ error: 'Nenhuma mensagem válida informada.' });
      }

      console.log(
        chalk.blue(`[OpenAI API] Requisição recebida: `) +
        chalk.white(`Modelo=${requestedModel || 'default'} ➔ `) +
        chalk.green(`${targetModel}`) +
        chalk.gray(`, Stream=${stream}`)
      );

      await smartRouter.executeWithFailover(targetModel, async (account, resolvedModel) => {
        const actualGoogleModel = resolveActualGoogleModel(resolvedModel);
        const thinkingConfig = buildThinkingConfig(actualGoogleModel);
        const projectId = account.projectId || API_ENDPOINTS.DEFAULT_PROJECT_ID;

        const requestBody = {
          project: projectId,
          model: actualGoogleModel,
          request: {
            contents,
            systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
            generationConfig: {
              temperature,
              maxOutputTokens: 8192,
              ...(thinkingConfig ? { thinkingConfig } : {})
            }
          }
        };

        const googleRes = await callGoogleCodeAssist(account, requestBody);

        if (stream) {
          await streamOpenAIResponse(googleRes.body, res, requestedModel || resolvedModel);
        } else {
          let fullText = '';
          const reader = googleRes.body.getReader();
          const decoder = new TextDecoder();
          let buf = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const blocks = buf.split('data: ');
            buf = blocks.pop() || '';

            for (const b of blocks) {
              const trimmed = b.trim();
              if (!trimmed || trimmed === '[DONE]') continue;
              try {
                const parsed = JSON.parse(trimmed.split('\n')[0]);
                const parts = parsed.response?.candidates?.[0]?.content?.parts || [];
                for (const p of parts) {
                  if (p.text) fullText += p.text;
                }
              } catch {}
            }
          }

          res.json({
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: requestedModel || resolvedModel,
            choices: [{
              index: 0,
              message: { role: 'assistant', content: fullText },
              finish_reason: 'stop'
            }]
          });
        }
      });
    } catch (err) {
      console.error(chalk.red(`[Error /v1/chat/completions] ${err.message}`));
      if (!res.headersSent) {
        res.status(500).json({ error: { message: err.message } });
      }
    }
  });

  return app;
}

export async function startServer(port = 6012) {
  await configManager.load();
  await accountPool.refreshAccounts();
  await ensureCallbackServer();

  const app = createServer();
  return new Promise((resolve) => {
    app.listen(port, () => {
      console.log(chalk.bold.magenta(`\n🌌 Constellation Server Ativo na porta ${port}!`));
      console.log(chalk.cyan(`  Dashboard Web: `) + chalk.underline.white(`http://localhost:${port}`));
      console.log(chalk.cyan(`  Claude Code:   `) + chalk.white(`http://localhost:${port}/v1/messages`));
      console.log(chalk.cyan(`  OpenAI/Cursor: `) + chalk.white(`http://localhost:${port}/v1/chat/completions`));
      console.log(chalk.gray(`\nPronto para receber chamadas do Claude Code, Cursor, Aider e outros.\n`));
      resolve(app);
    });
  });
}
