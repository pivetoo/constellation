/**
 * Constellation - Fluxo OAuth2 do Google
 */
import express from 'express';
import open from 'open';
import chalk from 'chalk';
import { OAuth2Client } from 'google-auth-library';
import { GOOGLE_OAUTH, API_ENDPOINTS } from '../constants.js';

export function createOAuthClient() {
  return new OAuth2Client(
    GOOGLE_OAUTH.CLIENT_ID,
    GOOGLE_OAUTH.CLIENT_SECRET,
    GOOGLE_OAUTH.REDIRECT_URI
  );
}

/**
 * Inicia o servidor local de callback e abre o navegador para autenticar uma conta Google.
 */
export async function startOAuthFlow() {
  const oauth2Client = createOAuthClient();
  const app = express();
  const port = GOOGLE_OAUTH.CALLBACK_PORT;

  return new Promise((resolve, reject) => {
    let server;

    server = app.listen(port, async () => {
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: GOOGLE_OAUTH.SCOPES,
        prompt: 'consent'
      });

      console.log(chalk.cyan(`\n🌌 Iniciando autenticação OAuth2 do Google...`));
      console.log(chalk.gray(`Abrindo seu navegador no link de autenticação:`));
      console.log(chalk.underline.blue(authUrl) + '\n');

      try {
        await open(authUrl);
      } catch {
        console.log(chalk.yellow(`Não foi possível abrir o navegador automaticamente. Por favor, copie e cole o link acima no navegador.`));
      }
    });

    server.on('error', (err) => {
      reject(new Error(`Erro ao iniciar servidor de callback na porta ${port}: ${err.message}`));
    });

    app.get('/oauth-callback', async (req, res) => {
      const code = req.query.code;
      if (!code) {
        res.status(400).send('<h1>Erro</h1><p>Código de autorização não recebido.</p>');
        server.close();
        return reject(new Error('Código de autorização ausente no callback.'));
      }

      try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // Busca dados do perfil do usuário para identificar a conta
        let userInfo = { email: 'desconhecido@gmail.com', name: 'Google Account' };
        try {
          const userRes = await fetch(API_ENDPOINTS.USER_INFO, {
            headers: { Authorization: `Bearer ${tokens.access_token}` }
          });
          if (userRes.ok) {
            userInfo = await userRes.json();
          }
        } catch {
          // Ignora falha na busca do perfil
        }

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

        res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Constellation - Conectado</title>
            <meta charset="utf-8">
            <style>
              body { background: #0c0d14; color: #f0f3f6; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
              .card { background: #161922; border: 1px solid #2a3142; border-radius: 12px; padding: 40px; text-align: center; max-width: 420px; box-shadow: 0 12px 30px rgba(0,0,0,0.5); }
              .icon { font-size: 48px; margin-bottom: 12px; }
              h1 { margin: 0 0 8px; font-size: 24px; color: #4ade80; }
              p { color: #8b949e; margin: 8px 0; font-size: 15px; }
              .email { background: #212636; color: #58a6ff; padding: 6px 14px; border-radius: 20px; display: inline-block; margin-top: 12px; font-weight: 500; font-family: monospace; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="icon">🌌</div>
              <h1>Conta Conectada com Sucesso!</h1>
              <p>A conta foi adicionada ao pool do Constellation.</p>
              <div class="email">${accountData.email}</div>
              <p style="margin-top: 24px; font-size: 13px;">Você já pode fechar esta aba e voltar ao terminal.</p>
            </div>
          </body>
          </html>
        `);

        server.close();
        resolve(accountData);
      } catch (err) {
        res.status(500).send(`<h1>Erro de Autenticação</h1><p>${err.message}</p>`);
        server.close();
        reject(err);
      }
    });
  });
}
