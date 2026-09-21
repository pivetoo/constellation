/**
 * Constellation - Interface CLI
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { startOAuthFlow } from '../auth/oauth.js';
import { tokenManager } from '../auth/token-manager.js';
import { accountPool } from '../pool/account-pool.js';
import { smartRouter } from '../pool/router.js';
import { startServer } from '../server/app.js';
import { configManager } from '../config.js';
import { API_ENDPOINTS, ANTIGRAVITY_HEADERS } from '../constants.js';

const program = new Command();

program
  .name('constellation')
  .description('🌌 Constellation - Smart Multi-Account Load Balancer & Proxy para Gemini & Claude Code')
  .version('1.0.0');

// 1. Comando LOGIN (adiciona nova conta)
program
  .command('login')
  .description('Conectar uma nova conta Google One AI Premium ao pool')
  .action(async () => {
    try {
      console.log(chalk.bold.cyan(`\n🌌 Adicionando conta ao pool do Constellation...`));
      const accountData = await startOAuthFlow();
      await tokenManager.saveAccount(accountData);

      const accounts = await tokenManager.readRawAccounts();
      console.log(chalk.green(`\n✓ Conta registrada com sucesso!`));
      console.log(chalk.white(`Total de contas no pool: `) + chalk.bold.cyan(accounts.length));
      console.log(chalk.gray(`Para adicionar mais contas, basta executar este comando novamente.\n`));
      process.exit(0);
    } catch (err) {
      console.error(chalk.red(`\n[Erro no login] ${err.message}`));
      process.exit(1);
    }
  });

// 2. Comando ACCOUNTS (lista contas e status de cota)
program
  .command('accounts')
  .description('Listar todas as contas conectadas, cotas e status de cooldown')
  .option('-r, --refresh', 'Forçar atualização das cotas com a API do Google')
  .action(async (options) => {
    try {
      await configManager.load();
      console.log(chalk.cyan(`\n🔍 Verificando contas no pool do Constellation...\n`));
      const poolStatus = await accountPool.getPoolStatus(options.refresh);

      if (poolStatus.length === 0) {
        console.log(chalk.yellow(`[!] Nenhuma conta cadastrada.`));
        console.log(chalk.gray(`Execute "constellation login" para conectar sua primeira conta Google.\n`));
        return;
      }

      console.log(chalk.bold.white(`Total de contas: ${poolStatus.length}\n`));

      poolStatus.forEach((acc, index) => {
        console.log(chalk.gray(`────────────────────────────────────────────────────────────────`));
        console.log(
          chalk.bold.white(`[${index + 1}] `) +
          chalk.bold.cyan(acc.email) +
          chalk.gray(` (ID: ${acc.id})`)
        );

        const models = acc.models || {};
        const TARGET_MODELS = [
          { match: (k) => k.includes('gemini-3.1-pro') || k.includes('gemini-3-pro') || k.includes('gemini-pro-agent'), name: 'Gemini 3.1 Pro' },
          { match: (k) => k.includes('gemini-3.8-flash') || k.includes('gemini-3.6-flash') || k.includes('gemini-3-flash'), name: 'Gemini 3.8 Flash' },
          { match: (k) => k.includes('claude-opus'), name: 'Claude Opus 4.6' },
          { match: (k) => k.includes('claude-sonnet'), name: 'Claude Sonnet 4.6' }
        ];

        for (const target of TARGET_MODELS) {
          const foundKey = Object.keys(models).find(k => target.match(k));
          const q = foundKey ? models[foundKey] : { remainingPercent: 100, usagePercent: 0 };

          let statusColor = chalk.green;
          let statusLabel = `${q.remainingPercent}% livre`;

          if (q.inCooldown) {
            statusColor = chalk.magenta;
            statusLabel = `[EM COOLDOWN]`;
          } else if (q.isSoftQuotaExceeded) {
            statusColor = chalk.red;
            statusLabel = `[95% ATINGIDO]`;
          } else if (q.remainingPercent <= 20) {
            statusColor = chalk.yellow;
          }

          const resetInfo = q.resetTimeFormatted ? chalk.gray(` (Reset às ${q.resetTimeFormatted})`) : '';
          console.log(
            `    ${chalk.gray('•')} ${chalk.white(target.name.padEnd(22))}: ` +
            statusColor(statusLabel.padEnd(16)) +
            resetInfo
          );
        }
      });
      console.log(chalk.gray(`────────────────────────────────────────────────────────────────\n`));
    } catch (err) {
      console.error(chalk.red(`[Erro] ${err.message}`));
    }
  });

// 3. Comando REMOVE (remove uma conta do pool)
program
  .command('remove <emailOrId>')
  .description('Remover uma conta do pool pelo e-mail ou ID')
  .action(async (emailOrId) => {
    try {
      const removed = await tokenManager.removeAccount(emailOrId);
      if (removed) {
        console.log(chalk.green(`\n✓ Conta "${emailOrId}" removida com sucesso!\n`));
      } else {
        console.log(chalk.yellow(`\n[!] Conta "${emailOrId}" não encontrada no pool.\n`));
      }
    } catch (err) {
      console.error(chalk.red(`[Erro] ${err.message}`));
    }
  });

// 4. Comando SERVE (inicia o proxy API e painel web)
program
  .command('serve')
  .description('Iniciar o servidor de proxy local e o painel web')
  .option('-p, --port <number>', 'Porta do servidor (padrão: 6012)', parseInt)
  .action(async (options) => {
    const config = await configManager.load();
    const port = options.port || config.port || 6012;
    await startServer(port);
  });

// 5. Comando TEST (faz uma chamada rápida de teste para verificar funcionamento)
program
  .command('test [prompt]')
  .description('Testar uma pergunta rápida para validar a comunicação com o pool')
  .option('-m, --model <name>', 'Modelo a ser testado')
  .action(async (prompt = 'Olá, responda apenas: Constellation ativo!', options) => {
    try {
      await configManager.load();
      const model = smartRouter.resolveModel(options.model);

      console.log(chalk.cyan(`\n⚡ Enviando prompt de teste para o modelo: `) + chalk.bold.green(model));
      console.log(chalk.gray(`Prompt: "${prompt}"\n`));

      const result = await smartRouter.executeWithFailover(model, async (account, resolvedModel) => {
        let actualGoogleModel = resolvedModel;
        if (resolvedModel.includes('gemini-3.1-pro') || resolvedModel.includes('gemini-pro')) {
          actualGoogleModel = 'gemini-pro-agent';
        } else if (resolvedModel.includes('gemini-3.8-flash') || resolvedModel.includes('gemini-3-flash') || resolvedModel.includes('gemini-flash')) {
          actualGoogleModel = 'gemini-3.6-flash-high';
        } else if (resolvedModel.includes('claude-opus') || resolvedModel.includes('opus')) {
          actualGoogleModel = 'claude-opus-4-6-thinking';
        } else if (resolvedModel.includes('claude-sonnet') || resolvedModel.includes('sonnet')) {
          actualGoogleModel = 'claude-sonnet-4-6';
        }

        let thinkingConfig = undefined;
        if (actualGoogleModel.includes('opus') || actualGoogleModel.includes('thinking')) {
          thinkingConfig = { includeThoughts: true, thinkingBudget: 1024 };
        } else if (actualGoogleModel.includes('gemini-pro') || actualGoogleModel.includes('gemini-3.6') || actualGoogleModel.includes('agent')) {
          thinkingConfig = { includeThoughts: true, thinkingLevel: 'high' };
        }

        const projectId = account.projectId || API_ENDPOINTS.DEFAULT_PROJECT_ID;
        const headers = {
          'Authorization': `Bearer ${account.access_token}`,
          'Content-Type': 'application/json',
          ...ANTIGRAVITY_HEADERS.getHeaders(projectId)
        };

        const res = await fetch(`${API_ENDPOINTS.CLOUD_CODE}/v1internal:streamGenerateContent?alt=sse`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            project: projectId,
            model: actualGoogleModel,
            request: {
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: {
                maxOutputTokens: 2048,
                temperature: 0.7,
                ...(thinkingConfig ? { thinkingConfig } : {})
              }
            }
          })
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Google API ${res.status}: ${text}`);
        }

        const raw = await res.text();
        const lines = raw.split('\n');
        let answer = '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (!dataStr || dataStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(dataStr);
              const parts = parsed.response?.candidates?.[0]?.content?.parts || [];
              for (const p of parts) {
                if (p.text) answer += p.text;
              }
            } catch {}
          }
        }

        return answer;
      });

      console.log(chalk.bold.green(`✓ Resposta recebida:`));
      console.log(chalk.white(result.trim()) + '\n');
    } catch (err) {
      console.error(chalk.red(`\n[Erro no teste] ${err.message}\n`));
    }
  });

// 6. Comando CLAUDE (inicia o Claude Code já configurado com as variáveis do Constellation)
program
  .command('claude [claudeArgs...]')
  .description('Executar o Claude Code diretamente conectado ao Constellation (sem precisar de $env)')
  .allowUnknownOption(true)
  .action(async (claudeArgs = []) => {
    const config = await configManager.load();
    const port = config.port || 6012;
    const { spawn } = await import('child_process');

    console.log(chalk.cyan(`\n🌌 Iniciando Claude Code conectado ao Constellation (porta ${port})...\n`));

    const env = {
      ...process.env,
      ANTHROPIC_BASE_URL: `http://localhost:${port}/v1`,
      ANTHROPIC_API_KEY: 'sk-anything'
    };

    const claudeProcess = spawn('claude', claudeArgs, {
      stdio: 'inherit',
      shell: true,
      env
    });

    claudeProcess.on('error', (err) => {
      if (err.code === 'ENOENT') {
        console.error(chalk.red('\n[Erro] Claude Code não encontrado no sistema.'));
        console.error(chalk.yellow('Instale-o com: npm install -g @anthropic-ai/claude-code\n'));
      } else {
        console.error(chalk.red(`\n[Erro ao iniciar Claude Code] ${err.message}\n`));
      }
    });

    claudeProcess.on('exit', (code) => {
      process.exit(code ?? 0);
    });
  });

program.parse(process.argv);

