# 🌌 Constellation

> **Smart Multi-Account Load Balancer & Proxy para modelos Gemini com suporte nativo ao Claude Code, Cursor e IDEs.**

O **Constellation** permite conectar múltiplas contas Google (com assinatura Google One AI Premium) e unificá-las em um **pool com cota virtualmente infinita**. Ele gerencia o consumo de cota diária de cada conta em tempo real, aplicando **cooldown automático** ao atingir 95% de uso e roteando as requisições para a conta com maior cota livre.

---

## ✨ Recursos Principais

- 🧠 **Smart Load Balancer com Cooldown Automático**:
  - Monitora o `remainingFraction` (fração restante) e `resetTime` de cada modelo em tempo real.
  - Ao bater **95% de uso** (<= 5% restante) em uma conta, coloca-a em *cooldown* até o horário exato de reset e roteia transparentemente para a próxima conta mais saudável.
- 🤖 **Compatibilidade Nativa com Claude Code**:
  - Emula perfeitamente o endpoint `POST /v1/messages` da Anthropic.
  - Traduz chamadas de ferramentas (*tool use / function calling* como Bash, File Edit, Read, etc.) do Claude Code para a API do Google Cloud Code / Gemini.
  - Suporte completo a streaming SSE e blocos de pensamento (*thinking / reasoning*).
- 🌐 **Compatibilidade com OpenAI & Cursor / Aider**:
  - Endpoint `POST /v1/chat/completions` compatível com qualquer ferramenta que suporte OpenAI.
- 📊 **Dashboard Web em Tempo Real**:
  - Interface moderna dark-mode em `http://localhost:6012` mostrando todas as suas contas, barras de progresso de uso por modelo e previsão de reset.
- 🔄 **Auto-Refresh de Tokens**:
  - Faz login OAuth2 uma única vez por conta; tokens são renovados automaticamente em segundo plano.
- 🎯 **Mapeamento Flexível de Modelos (Model Aliasing)**:
  - Configure qualquer alias (ex: direcionar chamadas de `claude-3-7-sonnet` diretamente para `gemini-3.1-pro-high` ou `gemini-3-flash-agent`).

---

## 📦 Instalação

```bash
git clone https://github.com/seu-usuario/constellation.git
cd constellation
npm install
```

---

## 🚀 Como Usar

### 1. Conectar suas contas Google

Execute o comando de login para cada conta que você deseja adicionar ao pool (ex: 10 contas):

```bash
node bin/constellation.js login
```

O navegador abrirá a tela oficial de login do Google. Faça o login com sua conta Google One AI Premium. Repita o comando para cada uma das suas contas.

### 2. Ver o status das contas e cotas

```bash
node bin/constellation.js accounts
```

Saída de exemplo:
```
🔍 Verificando contas no pool do Constellation...

Total de contas: 3

────────────────────────────────────────────────────────────────
[1] dev.rogerio@gmail.com (ID: acc-1)
    • gemini-3.1-pro-high     : 85% livre       (Reset às 18:00:00)
    • gemini-3-flash-agent    : 98% livre       (Reset às 18:00:00)
────────────────────────────────────────────────────────────────
[2] rogerio.studies@gmail.com (ID: acc-2)
    • gemini-3.1-pro-high     : [EM COOLDOWN]   (Reset às 16:30:00)
    • gemini-3-flash-agent    : 72% livre       (Reset às 16:30:00)
────────────────────────────────────────────────────────────────
```

### 3. Iniciar o Servidor Proxy & Dashboard

```bash
node bin/constellation.js serve
```

Saída:
```
🌌 Constellation Server Ativo na porta 6012!
  Dashboard Web: http://localhost:6012
  Claude Code:   http://localhost:6012/v1/messages
  OpenAI/Cursor: http://localhost:6012/v1/chat/completions
```

Abra `http://localhost:6012` no navegador para acompanhar o dashboard ao vivo!

---

## 🤖 Integração com o Claude Code

Com o servidor rodando, abra seu terminal e configure as variáveis de ambiente:

### No Windows (PowerShell):
```powershell
$env:ANTHROPIC_BASE_URL="http://localhost:6012/v1"
$env:ANTHROPIC_API_KEY="sk-anything"
claude
```

### No Linux / macOS (Bash / Zsh):
```bash
export ANTHROPIC_BASE_URL="http://localhost:6012/v1"
export ANTHROPIC_API_KEY="sk-anything"
claude
```

Pronto! O Claude Code agora utiliza o pool inteligente de contas Gemini gerenciado pelo Constellation.

---

## ✍️ Integração com o Cursor / VS Code (Continue)

Nas configurações de IA do seu editor:
- **Provider:** OpenAI Compatible
- **Base URL:** `http://localhost:6012/v1`
- **API Key:** `sk-anything`
- **Model:** `gemini-3.1-pro-high` (ou `gemini-3-flash-agent`)

---

## ⚙️ Mapeamento de Modelos (`config.json`)

Você pode personalizar o mapeamento de modelos criando ou editando um `config.json` na raiz do projeto:

```json
{
  "port": 6012,
  "softQuotaLimit": 0.95,
  "defaultModel": "gemini-3.1-pro-high",
  "modelAliases": {
    "claude-3-7-sonnet-latest": "gemini-3.1-pro-high",
    "claude-3-5-sonnet": "gemini-3.1-pro-high",
    "claude-3-5-haiku": "gemini-3-flash-agent",
    "gemini-flash": "gemini-3-flash-agent",
    "gemini-pro": "gemini-3.1-pro-high"
  }
}
```

---

## 📋 Lista de Comandos CLI

| Comando | Descrição |
|---|---|
| `node bin/constellation.js login` | Adiciona uma nova conta Google ao pool |
| `node bin/constellation.js accounts` | Lista todas as contas cadastradas com cota e cooldown |
| `node bin/constellation.js accounts --refresh` | Força atualização imediata de cotas via Google API |
| `node bin/constellation.js serve` | Inicia o servidor proxy e dashboard na porta 6012 |
| `node bin/constellation.js serve --port 8080` | Inicia em porta customizada |
| `node bin/constellation.js test "Seu prompt"` | Testa uma requisição rápida para validar o pool |
| `node bin/constellation.js remove <email>` | Remove uma conta do pool |

---

## 🔒 Segurança

- O arquivo `keys.json` armazena os tokens de acesso e refresh das suas contas localmente na sua máquina.
- Ele está incluído no `.gitignore` e **nunca deve ser compartilhado ou versionado**.
- O servidor roda exclusivamente em `localhost`.

---

## 📄 Licença

MIT