/**
 * Constellation - Constantes e Configurações Globais
 */

export const GOOGLE_OAUTH = {
  CLIENT_ID: '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com',
  CLIENT_SECRET: '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',
  REDIRECT_URI: 'http://localhost:51121/oauth-callback',
  CALLBACK_PORT: 51121,
  SCOPES: [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/cclog',
    'https://www.googleapis.com/auth/experimentsandconfigs',
  ]
};

export const API_ENDPOINTS = {
  CLOUD_CODE: 'https://cloudcode-pa.googleapis.com',
  SANDBOX: 'https://daily-cloudcode-pa.sandbox.googleapis.com',
  DEFAULT_PROJECT_ID: 'rising-fact-p41fc',
  USER_INFO: 'https://www.googleapis.com/oauth2/v2/userinfo'
};

export const ANTIGRAVITY_HEADERS = {
  version: '1.18.3',
  getUserAgent() {
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Antigravity/${this.version} Chrome/138.0.7204.235 Electron/37.3.1 Safari/537.36`;
  },
  getHeaders() {
    return {
      'User-Agent': this.getUserAgent(),
      'X-Goog-Api-Client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
      'Client-Metadata': JSON.stringify({
        ideType: 'ANTIGRAVITY',
        platform: process.platform === 'win32' ? 'WINDOWS' : 'MACOS',
        pluginType: 'GEMINI'
      })
    };
  }
};

export const DEFAULT_CONFIG = {
  port: 6012,
  softQuotaLimit: 0.95, // 95% de uso (ou <= 5% restante) ativa cooldown
  defaultModel: 'gemini-3.1-pro-high',
  // Mapeamento automático de modelos solicitados pelo cliente para modelos reais do Gemini
  modelAliases: {
    // Claude Code / Anthropic aliases
    'claude-3-7-sonnet-latest': 'gemini-3.1-pro-high',
    'claude-3-7-sonnet': 'gemini-3.1-pro-high',
    'claude-3-5-sonnet-latest': 'gemini-3.1-pro-high',
    'claude-3-5-sonnet': 'gemini-3.1-pro-high',
    'claude-3-5-haiku-latest': 'gemini-3-flash-agent',
    'claude-3-5-haiku': 'gemini-3-flash-agent',
    'claude-opus-4-6-thinking': 'claude-opus-4-6-thinking',
    // Gemini aliases
    'gemini-pro': 'gemini-3.1-pro-high',
    'gemini-flash': 'gemini-3-flash-agent',
    'gemini-3.8-flash': 'gemini-3-flash-agent',
    'gemini-3.1-pro': 'gemini-3.1-pro-high',
    // OpenAI aliases
    'gpt-4o': 'gemini-3.1-pro-high',
    'gpt-4o-mini': 'gemini-3-flash-agent'
  }
};
