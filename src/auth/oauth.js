/**
 * Constellation - Fluxo OAuth2 do Google
 */
import express from 'express';
import open from 'open';
import chalk from 'chalk';
import { OAuth2Client } from 'google-auth-library';
import { GOOGLE_OAUTH, API_ENDPOINTS } from '../constants.js';
import { tokenManager } from './token-manager.js';
import { accountPool } from '../pool/account-pool.js';

let activeCallbackServer = null;

export function createOAuthClient() {
  return new OAuth2Client(
    GOOGLE_OAUTH.CLIENT_ID,
    GOOGLE_OAUTH.CLIENT_SECRET,
    GOOGLE_OAUTH.REDIRECT_URI
  );
}

/**
 * Retorna a URL de autorização do Google para login
 */
export function getAuthorizationUrl() {
  const oauth2Client = createOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GOOGLE_OAUTH.SCOPES,
    prompt: 'consent'
  });
}

/**
 * Garante que o servidor de callback na porta 51121 esteja ativo
 */
export async function ensureCallbackServer() {
  if (activeCallbackServer) {
    return activeCallbackServer;
  }

  const app = express();
  const port = GOOGLE_OAUTH.CALLBACK_PORT;
  const oauth2Client = createOAuthClient();

  app.get('/oauth-callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
      res.status(400).send('<h1>Erro</h1><p>Código de autorização não recebido.</p>');
      return;
    }

    try {
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      // Busca dados do usuário
      let userInfo = { email: 'desconhecido@gmail.com', name: 'Conta Google' };
      try {
        const userRes = await fetch(API_ENDPOINTS.USER_INFO, {
          headers: { Authorization: `Bearer ${tokens.access_token}` }
        });
        if (userRes.ok) {
          userInfo = await userRes.json();
        }
      } catch {}

      const accountData = {
        id: `acc-${Date.now()}`,
        email: userInfo.email || 'desconhecido@gmail.com',
        name: userInfo.name || 'Conta Google',
        picture: userInfo.picture || '',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date || (Date.now() + 3600 * 1000),
        added_at: new Date().toISOString()
      };

      // Salva no banco de credenciais e recarrega o pool
      await tokenManager.saveAccount(accountData);
      await accountPool.refreshAccounts();

      console.log(chalk.green(`\n[Dashboard/Auth] Conta conectada com sucesso: ${accountData.email}\n`));

      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Constellation - Conectado</title>
          <meta charset="utf-8">
          <style>
            body { background: #090a0f; color: #e6edf3; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #12151f; border: 1px solid #1e2433; border-radius: 12px; padding: 40px; text-align: center; max-width: 420px; box-shadow: 0 12px 30px rgba(0,0,0,0.5); }
            .icon { font-size: 48px; margin-bottom: 12px; }
            h1 { margin: 0 0 8px; font-size: 22px; color: #3fb950; }
            p { color: #8b949e; margin: 8px 0; font-size: 14px; }
            .email { background: #1f293d; color: #58a6ff; padding: 6px 14px; border-radius: 20px; display: inline-block; margin-top: 12px; font-weight: 500; font-family: monospace; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">🌌</div>
            <h1>Conta Conectada!</h1>
            <p>A conta foi adicionada ao seu pool do Constellation.</p>
            <div class="email">${accountData.email}</div>
            <p style="margin-top: 20px; font-size: 13px;">Atualizando o Dashboard e fechando...</p>
          </div>
          <script>
            setTimeout(() => {
              if (window.opener) {
                try { window.opener.loadStatus(); } catch(e) {}
                window.close();
              } else {
                window.location.href = 'http://localhost:6012';
              }
            }, 1200);
          </script>
        </body>
        </html>
      `);
    } catch (err) {
      res.status(500).send(`<h1>Erro de Autenticação</h1><p>${err.message}</p>`);
    }
  });

  return new Promise((resolve) => {
    activeCallbackServer = app.listen(port, () => {
      resolve(activeCallbackServer);
    });
  });
}

/**
 * Inicia o fluxo OAuth interativo pelo terminal
 */
export async function startOAuthFlow() {
  await ensureCallbackServer();
  const authUrl = getAuthorizationUrl();

  console.log(chalk.cyan(`\n🌌 Abrindo navegador para login Google...`));
  console.log(chalk.underline.blue(authUrl) + '\n');

  try {
    await open(authUrl);
  } catch {
    console.log(chalk.yellow(`Copie o link acima e cole no navegador para autorizar.`));
  }
}
