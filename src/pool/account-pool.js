/**
 * Constellation - Pool de Contas com Cooldown Inteligente
 */
import chalk from 'chalk';
import { tokenManager } from '../auth/token-manager.js';
import { quotaMonitor } from './quota-monitor.js';
import { configManager } from '../config.js';

export class AccountPool {
  constructor() {
    this.accounts = []; // Lista de contas ativas
    this.quotaCache = new Map(); // accountId -> { timestamp, models }
    this.cooldowns = new Map(); // `${accountId}:${modelName}` -> expireTimestamp
    this.cacheTtlMs = 60 * 1000; // Cache de 1 minuto para cotas
  }

  /**
   * Recarrega contas válidas a partir do tokenManager
   */
  async refreshAccounts() {
    this.accounts = await tokenManager.getValidAccounts();
    return this.accounts;
  }

  /**
   * Verifica se uma conta está em cooldown para um determinado modelo
   */
  isAccountInCooldown(accountId, modelName) {
    const key = `${accountId}:${modelName}`;
    const expiresAt = this.cooldowns.get(key);
    if (!expiresAt) return false;

    if (Date.now() > expiresAt) {
      this.cooldowns.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Define cooldown para uma conta e modelo específicos
   */
  setCooldown(accountId, modelName, durationMs = 15 * 60 * 1000, reason = '') {
    const key = `${accountId}:${modelName}`;
    const expiresAt = Date.now() + durationMs;
    this.cooldowns.set(key, expiresAt);

    const until = new Date(expiresAt).toLocaleTimeString('pt-BR');
    console.log(
      chalk.yellow(`[Pool Cooldown] Conta ${accountId} pausada para ${modelName} até ${until}. Motivo: ${reason}`)
    );
  }

  /**
   * Obtém a cota atualizada de uma conta com suporte a cache
   */
  async getAccountQuota(account, force = false) {
    const cached = this.quotaCache.get(account.id);
    if (!force && cached && (Date.now() - cached.timestamp < this.cacheTtlMs)) {
      return cached.models;
    }

    const res = await quotaMonitor.fetchAccountQuota(account.access_token);
    if (res.success) {
      this.quotaCache.set(account.id, {
        timestamp: Date.now(),
        models: res.models
      });
      return res.models;
    }

    return cached ? cached.models : {};
  }

  /**
   * Retorna o status completo de todas as contas para visualização (CLI ou Dashboard)
   */
  async getPoolStatus(forceRefreshQuota = false) {
    await this.refreshAccounts();
    const config = configManager.get();
    const statusList = [];

    for (let i = 0; i < this.accounts.length; i++) {
      const acc = this.accounts[i];
      const quotas = await this.getAccountQuota(acc, forceRefreshQuota);
      const modelsStatus = {};

      for (const [mName, qInfo] of Object.entries(quotas)) {
        const inCooldown = this.isAccountInCooldown(acc.id, mName);
        const isSoftQuotaExceeded = qInfo.usagePercent >= (config.softQuotaLimit * 100);

        modelsStatus[mName] = {
          ...qInfo,
          inCooldown,
          isSoftQuotaExceeded,
          status: inCooldown ? 'cooldown' : (isSoftQuotaExceeded ? 'exhausted' : 'ready')
        };
      }

      statusList.push({
        id: acc.id,
        email: acc.email || `Conta #${i + 1}`,
        name: acc.name || '',
        models: modelsStatus
      });
    }

    return statusList;
  }
}

export const accountPool = new AccountPool();
