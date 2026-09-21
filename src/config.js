/**
 * Constellation - Gerenciador de Configuração
 */
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { DEFAULT_CONFIG } from './constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const CONFIG_FILE = path.resolve(ROOT_DIR, 'config.json');

class ConfigManager {
  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.loaded = false;
  }

  async load() {
    try {
      const data = await fs.readFile(CONFIG_FILE, 'utf8');
      const parsed = JSON.parse(data);
      this.config = {
        ...DEFAULT_CONFIG,
        ...parsed,
        modelAliases: {
          ...DEFAULT_CONFIG.modelAliases,
          ...(parsed.modelAliases || {})
        }
      };
    } catch {
      this.config = { ...DEFAULT_CONFIG };
    }
    this.loaded = true;
    return this.config;
  }

  get() {
    return this.config;
  }

  async update(newSettings) {
    this.config = {
      ...this.config,
      ...newSettings
    };
    await fs.writeFile(CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf8');
    return this.config;
  }
}

export const configManager = new ConfigManager();
