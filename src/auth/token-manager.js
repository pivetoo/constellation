/**
 * Constellation - Gerenciador de Tokens e Contas
 */
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { createOAuthClient } from './oauth.js';

const KEYS_FILE = path.resolve(process.cwd(), 'keys.json');

export class TokenManager {
  constructor() {
    this.keysPath = KEYS_FILE;
  }

  /**
   * Lê todas as contas salvas no keys.json
   */
  async readRawAccounts() {
    try {
      const content = await fs.readFile(this.keysPath, 'utf8');
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) return [];
      
      // Normaliza para formato de objeto
      return parsed.map((acc, index) => {
        if (typeof acc === 'string') {
          return {
            id: `acc-${index + 1}`,
            email: `conta-${index + 1}@google.com`,
            access_token: acc,
            refresh_token: null,
            expiry_date: null
          };
        }
        return acc;
      });
    } catch {
      return [];
    }
  }

  /**
   * Salva todas as contas no keys.json
   */
  async writeAccounts(accounts) {
    await fs.writeFile(this.keysPath, JSON.stringify(accounts, null, 2), 'utf8');
  }

  /**
   * Adiciona ou atualiza uma conta no arquivo de credenciais
   */
  async saveAccount(newAccount) {
    const accounts = await this.readRawAccounts();
    const existingIndex = accounts.findIndex(
      (a) => (a.email && a.email === newAccount.email) || (a.refresh_token && a.refresh_token === newAccount.refresh_token)
    );

    if (existingIndex >= 0) {
      // Atualiza os dados mantendo o ID
      accounts[existingIndex] = {
        ...accounts[existingIndex],
        ...newAccount,
        id: accounts[existingIndex].id
      };
      console.log(chalk.green(`\n✓ Conta atualizada: `) + chalk.bold.white(newAccount.email));
    } else {
      newAccount.id = `acc-${accounts.length + 1}`;
      accounts.push(newAccount);
      console.log(chalk.green(`\n✓ Nova conta adicionada: `) + chalk.bold.white(newAccount.email));
    }

    await this.writeAccounts(accounts);
    return newAccount;
  }

  /**
   * Remove uma conta pelo ID ou e-mail
   */
  async removeAccount(identifier) {
    const accounts = await this.readRawAccounts();
    const filtered = accounts.filter(a => a.id !== identifier && a.email !== identifier);
    if (filtered.length === accounts.length) {
      return false;
    }
    await this.writeAccounts(filtered);
    return true;
  }

  /**
   * Obtém todas as contas com tokens válidos (renova automaticamente se necessário)
   */
  async getValidAccounts() {
    const accounts = await this.readRawAccounts();
    if (accounts.length === 0) return [];

    const oauthClient = createOAuthClient();
    let updated = false;

    for (let i = 0; i < accounts.length; i++) {
      const acc = accounts[i];

      // Se tiver refresh token e estiver expirado ou a menos de 5 minutos de expirar
      if (acc.refresh_token && acc.expiry_date) {
        const fiveMinutesMs = 5 * 60 * 1000;
        const needsRefresh = Date.now() > (acc.expiry_date - fiveMinutesMs);

        if (needsRefresh) {
          try {
            oauthClient.setCredentials({ refresh_token: acc.refresh_token });
            const { credentials } = await oauthClient.refreshAccessToken();

            acc.access_token = credentials.access_token;
            acc.expiry_date = credentials.expiry_date || (Date.now() + 3600 * 1000);
            if (credentials.refresh_token) {
              acc.refresh_token = credentials.refresh_token;
            }

            updated = true;
            console.log(chalk.green(`[Auth] Token da conta ${acc.email || i + 1} renovado com sucesso.`));
          } catch (err) {
            console.log(chalk.red(`[Auth Error] Falha ao renovar conta ${acc.email || i + 1}: ${err.message}`));
          }
        }
      }
    }

    if (updated) {
      await this.writeAccounts(accounts);
    }

    return accounts.filter(a => a.access_token && a.access_token.length > 10);
  }
}

export const tokenManager = new TokenManager();
