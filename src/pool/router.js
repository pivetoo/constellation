/**
 * Constellation - Roteador Inteligente de Contas
 */
import chalk from 'chalk';
import { accountPool } from './account-pool.js';
import { configManager } from '../config.js';

export class SmartRouter {
  /**
   * Resolve o modelo real a partir do alias ou modelo padrão
   */
  resolveModel(requestedModel) {
    const config = configManager.get();
    if (!requestedModel) {
      return config.defaultModel;
    }

    const cleanModel = requestedModel.toLowerCase().trim();

    // Se o cliente enviar qualquer modelo Claude (ex: claude-sonnet-5, claude-3-7-sonnet, sonnet, etc.),
    // honramos o modelo ativo selecionado pelo usuário no Dashboard!
    if (config.defaultModel && (cleanModel.includes('claude') || cleanModel.includes('sonnet') || cleanModel.includes('opus') || cleanModel.includes('haiku'))) {
      return config.defaultModel;
    }

    if (config.modelAliases[cleanModel]) {
      return config.modelAliases[cleanModel];
    }

    // Se começar com antigravity-, remove o prefixo
    return cleanModel.replace(/^antigravity-/i, '');
  }

  /**
   * Encontra a melhor conta disponível para um modelo específico
   */
  async selectBestAccount(targetModel) {
    await accountPool.refreshAccounts();
    const accounts = accountPool.accounts;

    if (accounts.length === 0) {
      throw new Error("Nenhuma conta Google conectada. Execute 'constellation login' para adicionar suas contas.");
    }

    const config = configManager.get();
    const candidateAccounts = [];
    const resetTimes = [];

    for (const acc of accounts) {
      // Verifica se está em cooldown
      if (accountPool.isAccountInCooldown(acc.id, targetModel)) {
        continue;
      }

      // Ignora conta se requer verificação no Google
      const accData = accountPool.getAccountData(acc.id);
      if (accData.needsVerification) {
        continue;
      }

      // Obtém as cotas da conta
      const quotas = await accountPool.getAccountQuota(acc);
      const modelQuota = quotas[targetModel];

      if (modelQuota) {
        // Se bateu o limite configurado (ex: 95% de uso / <= 5% restante)
        if (modelQuota.usagePercent >= (config.softQuotaLimit * 100)) {
          let cooldownDuration = 15 * 60 * 1000;
          if (modelQuota.resetTime) {
            const diff = new Date(modelQuota.resetTime).getTime() - Date.now();
            if (diff > 0) cooldownDuration = diff;
          }

          accountPool.setCooldown(
            acc.id,
            targetModel,
            cooldownDuration,
            `Soft Quota de 95% atingida (Restante: ${modelQuota.remainingPercent}%)`
          );
          resetTimes.push({ email: acc.email, resetTimeFormatted: modelQuota.resetTimeFormatted });
          continue;
        }

        candidateAccounts.push({
          account: acc,
          remainingPercent: modelQuota.remainingPercent
        });
      } else {
        // Se a cota do modelo ainda não está mapeada, assume disponível com prioridade neutra
        candidateAccounts.push({
          account: acc,
          remainingPercent: 100
        });
      }
    }

    if (candidateAccounts.length === 0) {
      const resetMsg = resetTimes.length > 0
        ? `\nHorários previstos para reset do ${targetModel}:\n${resetTimes.map(r => `  • ${r.email}: ${r.resetTimeFormatted}`).join('\n')}`
        : '';
      const isClaude = targetModel.includes('opus') || targetModel.includes('sonnet') || targetModel.includes('claude');
      const hint = isClaude
        ? `\n\n💡 Dica: O Google One possui limites de cota mais restritos para modelos Claude (3P). Seus modelos Gemini 3.1 Pro e Gemini 3.8 Flash continuam com cota livre! Você pode alternar o modelo ativo pelo Dashboard em http://localhost:6012`
        : '';
      throw new Error(`Todas as contas disponíveis atingiram o limite ou estão em cooldown para o modelo "${targetModel}".${resetMsg}${hint}`);
    }

    // Ordena da conta com MAIOR cota restante para a de menor cota
    candidateAccounts.sort((a, b) => b.remainingPercent - a.remainingPercent);

    const chosen = candidateAccounts[0];
    console.log(
      chalk.cyan(`[Router] Roteando para: `) +
      chalk.bold.white(chosen.account.email) +
      chalk.gray(` (Cota livre: ${chosen.remainingPercent}% para ${targetModel})`)
    );

    return chosen.account;
  }

  /**
   * Executa uma requisição com tentativa de failover automático entre contas
   */
  async executeWithFailover(targetModel, requestFn) {
    await accountPool.refreshAccounts();
    const totalAccounts = accountPool.accounts.length;
    let attempts = 0;
    let lastError = null;

    while (attempts < totalAccounts) {
      let selectedAccount;
      try {
        selectedAccount = await this.selectBestAccount(targetModel);
      } catch (err) {
        throw err;
      }

      try {
        const result = await requestFn(selectedAccount, targetModel);
        return result;
      } catch (err) {
        lastError = err;
        attempts++;

        const isRateLimit = err.message.includes('RESOURCE_EXHAUSTED') ||
                            err.message.includes('429') ||
                            err.message.includes('Quota') ||
                            err.message.includes('Soft Quota');

        const isAuthOrVerify = err.message.includes('401') ||
                               err.message.includes('403') ||
                               err.message.includes('VALIDATION_REQUIRED') ||
                               err.message.includes('Verify your account') ||
                               err.message.includes('PERMISSION_DENIED');

        if (isRateLimit || isAuthOrVerify) {
          const reasonType = isAuthOrVerify ? 'Auth/Verificação necessária' : 'Limite de cota';
          console.log(
            chalk.yellow(`[Router Failover] Problema na conta ${selectedAccount.email} (${reasonType}). Chaveando automaticamente...`)
          );
          accountPool.setCooldown(selectedAccount.id, targetModel, 15 * 60 * 1000, err.message);
        } else {
          // Erro de outro tipo (ex: rede, erro de sintaxe)
          console.error(chalk.red(`[Router Error] Erro na requisição: ${err.message}`));
          throw err;
        }
      }
    }

    throw new Error(`Todas as contas do pool falharam para o modelo "${targetModel}". Último erro: ${lastError?.message}`);
  }
}

export const smartRouter = new SmartRouter();
