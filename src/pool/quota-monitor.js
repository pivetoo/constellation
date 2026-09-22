/**
 * Constellation - Monitor de Cotas da API Google
 */
import { API_ENDPOINTS, ANTIGRAVITY_HEADERS } from '../constants.js';

export class QuotaMonitor {
  /**
   * Consulta a cota de todos os modelos disponíveis e o resumo de grupos (Semanal e 5h)
   */
  async fetchAccountQuota(accessToken, projectId = API_ENDPOINTS.DEFAULT_PROJECT_ID) {
    try {
      const endpoint = API_ENDPOINTS.CLOUD_CODE || 'https://daily-cloudcode-pa.sandbox.googleapis.com';
      const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...ANTIGRAVITY_HEADERS.getHeaders()
      };

      // 1. Consulta modelos disponíveis e suas cotas individuais (janela de 5h)
      const response = await fetch(`${endpoint}/v1internal:fetchAvailableModels`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ project: projectId })
      });

      if (!response.ok) {
        const errorText = await response.text();
        const isValidationReq = response.status === 403 && (errorText.includes('VALIDATION_REQUIRED') || errorText.includes('Verify your account'));
        return {
          success: false,
          needsVerification: isValidationReq,
          error: `HTTP ${response.status}: ${errorText}`,
          models: {},
          summary: null
        };
      }

      const data = await response.json();
      const modelsObj = data.models || data.modelDetails || {};
      const result = {};

      for (const [modelName, modelData] of Object.entries(modelsObj)) {
        if (!modelData.quotaInfo) continue;

        const remainingFraction = Number(modelData.quotaInfo.remainingFraction ?? 1.0);
        const remainingPercent = Math.round(remainingFraction * 100);
        const usagePercent = 100 - remainingPercent;
        const resetTime = modelData.quotaInfo.resetTime || null;

        let resetTimeFormatted = '';
        if (resetTime) {
          try {
            resetTimeFormatted = new Date(resetTime).toLocaleTimeString('pt-BR');
          } catch {
            resetTimeFormatted = resetTime;
          }
        }

        result[modelName] = {
          remainingFraction,
          remainingPercent,
          usagePercent,
          resetTime,
          resetTimeFormatted
        };
      }

      // Mapeamento de equivalência para os 4 modelos principais
      if (result['gemini-3.1-pro-high'] || result['gemini-pro-agent']) {
        const proRef = result['gemini-3.1-pro-high'] || result['gemini-pro-agent'];
        result['gemini-3.1-pro-high'] = { ...proRef };
        result['gemini-3.1-pro'] = { ...proRef };
      }
      if (result['gemini-3.8-flash-tiered'] || result['gemini-3.6-flash-high']) {
        const flashRef = result['gemini-3.8-flash-tiered'] || result['gemini-3.6-flash-high'];
        result['gemini-3.8-flash'] = { ...flashRef };
        result['gemini-3.8-flash-tiered'] = { ...flashRef };
        result['gemini-3-flash'] = { ...flashRef };
      }

      // 2. Consulta resumo agrupado oficial (Semanal + 5 Horas)
      let quotaSummary = null;
      try {
        const summaryRes = await fetch(`${endpoint}/v1internal:retrieveUserQuotaSummary`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ project: projectId })
        });
        if (summaryRes.ok) {
          const summaryData = await summaryRes.json();
          quotaSummary = (summaryData.groups || []).map(group => ({
            displayName: group.displayName,
            description: group.description,
            buckets: (group.buckets || []).map(b => ({
              bucketId: b.bucketId,
              displayName: b.displayName,
              window: b.window,
              description: b.description,
              remainingFraction: b.remainingFraction,
              remainingPercent: Math.round(Number(b.remainingFraction ?? 1.0) * 100),
              resetTime: b.resetTime,
              resetTimeFormatted: b.resetTime ? new Date(b.resetTime).toLocaleString('pt-BR') : ''
            }))
          }));
        }
      } catch {}

      return {
        success: true,
        models: result,
        summary: quotaSummary
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        models: {},
        summary: null
      };
    }
  }
}

export const quotaMonitor = new QuotaMonitor();
