/**
 * Constellation - Monitor de Cotas da API Google
 */
import { API_ENDPOINTS, ANTIGRAVITY_HEADERS } from '../constants.js';

export class QuotaMonitor {
  /**
   * Consulta a cota de todos os modelos disponíveis para um determinado token
   */
  async fetchAccountQuota(accessToken, projectId = API_ENDPOINTS.DEFAULT_PROJECT_ID) {
    try {
      const endpoint = API_ENDPOINTS.PROD_CLOUD_CODE || API_ENDPOINTS.CLOUD_CODE;
      const response = await fetch(`${endpoint}/v1internal:fetchAvailableModels`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          ...ANTIGRAVITY_HEADERS.getHeaders()
        },
        body: JSON.stringify({ project: projectId })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText}`,
          models: {}
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
      if (result['gemini-pro-agent']) {
        result['gemini-3.1-pro-high'] = { ...result['gemini-pro-agent'] };
        result['gemini-3.1-pro'] = { ...result['gemini-pro-agent'] };
      }
      if (result['gemini-3.6-flash-high'] || result['gemini-3.8-flash-tiered']) {
        const flashRef = result['gemini-3.6-flash-high'] || result['gemini-3.8-flash-tiered'];
        result['gemini-3.8-flash'] = { ...flashRef };
        result['gemini-3-flash'] = { ...flashRef };
      }

      return {
        success: true,
        models: result
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        models: {}
      };
    }
  }
}

export const quotaMonitor = new QuotaMonitor();
