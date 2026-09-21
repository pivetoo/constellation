# Constellation

> **Smart Multi-Account Load Balancer & Proxy para modelos Gemini com suporte nativo ao Claude Code, Cursor e IDEs.**

O **Constellation** conecta multiplas contas Google (com assinatura Google One AI Premium) e as unifica em um pool com cota balanceada e alta disponibilidade. Ele gerencia o consumo de cota de cada conta em tempo real, aplicando cooldown automatico ao atingir 95% de uso e roteando as requisicoes de forma transparente para a conta mais saudavel.

---

## Recursos Principais

- **Smart Load Balancer com Cooldown Automático**:
  - Monitora o `remainingFraction` (limite da janela de 5 horas) e o consumo semanal oficial retornado pela API do Google.
  - Ao atingir 95% de uso (ou menos de 5% livre) em uma conta, ativa cooldown automatico e transfere a chamada para a proxima conta disponivel.
- **Compatibilidade Nativa com Claude Code**:
  - Emula o endpoint `POST /v1/messages` da Anthropic.
  - Traduz chamadas de ferramentas (*tool use / function calling* como Bash, File Edit, Read, etc.) entre o Claude Code e a API do Google Cloud Code / Gemini.
  - Suporte completo a streaming SSE e blocos de pensamento nativos (*thinking*), sem poluir o terminal.
  - Isolamento de configuracao (`~/.claude-constellation`) para evitar conflitos com contas pessoais do `claude.ai`.
- **Compatibilidade com OpenAI, Cursor e Aider**:
  - Endpoint `POST /v1/chat/completions` compativel com qualquer ferramenta que suporte OpenAI.
  - Raciocinio transmitido via `reasoning_content` para nao interferir em arquivos de codigo.
- **Dashboard Web em Tempo Real com Temas White e Dark**:
  - Interface moderna em `http://localhost:6012` exibindo status das contas, barras de progresso da janela de 5h, resumo semanal oficial e previsao de reset.
  - Alternancia instantanea de tema Claro (White) e Escuro (Dark).
- **Auto-Refresh de Tokens**:
  - Autenticacao OAuth2 via navegador; renovacao automatica dos tokens em segundo plano.
- **Mapeamento Flexivel de Modelos**:
  - Aliases dinamicos para apontar qualquer modelo solicitado (ex: `claude-sonnet-5`, `claude-opus-5`) para `gemini-3.1-pro-high`, `gemini-3.8-flash`, `claude-opus-4-6-thinking` ou `claude-sonnet-4-6`.

---

## Instalacao

```bash
git clone https://github.com/seu-usuario/constellation.git
cd constellation
npm install
```

---

## Como Usar

### 1. Conectar suas contas Google

Execute o comando de login para cada conta que deseja adicionar ao pool:

```bash
node bin/constellation.js login
```

O navegador abrira a tela de login oficial do Google. Faca o login com sua conta Google One AI Premium. Repita o comando para cada uma das suas contas.

### 2. Verificar o status das contas e cotas

```bash
node bin/constellation.js accounts
```

Para forcar a consulta imediata na API do Google (ignorando cache):

```bash
node bin/constellation.js accounts --refresh
```

### 3. Iniciar o Servidor Proxy e Dashboard

```bash
node bin/constellation.js serve
```

Opcoes disponiveis:
- `--port <numero>`: Define uma porta personalizada (padrao: 6012).
- `--theme <white|dark>`: Define o tema inicial do dashboard (padrao: dark).

Acesse `http://localhost:6012` no navegador para abrir o painel de controle.

---

## Como Configurar o Comando Global `cclaude`

O `cclaude` permite executar o Claude Code de qualquer pasta ou projeto sem precisar exportar variaveis de ambiente manualmente.

### No Windows (PowerShell)

Para que o comando `cclaude` funcione em qualquer terminal PowerShell:

1. Abra seu arquivo de perfil do PowerShell:
   ```powershell
   notepad $PROFILE
   ```
   *(Caso o arquivo nao exista, crie-o com `New-Item -Type File -Path $PROFILE -Force`)*

2. Adicione a seguinte funcao no final do arquivo:
   ```powershell
   function cclaude {
       node "C:\development\studies\constellation\bin\constellation.js" claude @args
   }
   ```

3. Salve o arquivo e recarregue o perfil:
   ```powershell
   . $PROFILE
   ```

### No Windows (Prompt de Comando / CMD / Global PATH)

Crie um arquivo chamado `cclaude.cmd` dentro de uma pasta presente no seu `PATH` (por exemplo, `C:\Users\SEU_USUARIO\AppData\Roaming\npm` ou `C:\Windows\System32`):

```cmd
@node "C:\development\studies\constellation\bin\constellation.js" claude %*
```

### No Linux / macOS (Bash / Zsh)

Adicione o seguinte alias ao seu `~/.bashrc` ou `~/.zshrc`:

```bash
alias cclaude='node /caminho/para/constellation/bin/constellation.js claude'
```

Recarregue o terminal:
```bash
source ~/.bashrc  # ou source ~/.zshrc
```

### Utilizando o `cclaude`

Com o servidor Constellation rodando (`node bin/constellation.js serve`), va ate a pasta de qualquer projeto e execute:

```bash
cclaude
```

Ou execute comandos diretos com argumentos:

```bash
cclaude -p "Explique a arquitetura deste projeto"
```

---

## Integracao Manual com Claude Code

Caso prefira iniciar o Claude Code definindo variaveis de ambiente manualmente:

### Windows (PowerShell):
```powershell
$env:CLAUDE_CONFIG_DIR = "$HOME\.claude-constellation"
$env:ANTHROPIC_BASE_URL = "http://localhost:6012"
$env:ANTHROPIC_API_KEY = "sk-constellation"
claude
```

### Linux / macOS:
```bash
export CLAUDE_CONFIG_DIR="$HOME/.claude-constellation"
export ANTHROPIC_BASE_URL="http://localhost:6012"
export ANTHROPIC_API_KEY="sk-constellation"
claude
```

---

## Integracao com Cursor / VS Code / Aider

Nas configuracoes do seu editor ou cliente OpenAI-compatible:

- **Provider:** OpenAI Compatible
- **Base URL:** `http://localhost:6012/v1`
- **API Key:** `sk-constellation`
- **Model:** `gemini-3.1-pro-high`, `gemini-3.8-flash`, `claude-sonnet-4-6` ou `claude-opus-4-6-thinking`

---

## Configuracao e Mapeamento (`config.json`)

As configuracoes podem ser alteradas diretamente pelo Dashboard Web ou editando o arquivo `config.json` na raiz:

```json
{
  "port": 6012,
  "theme": "dark",
  "softQuotaLimit": 0.95,
  "defaultModel": "claude-sonnet-4-6",
  "modelAliases": {
    "claude-3-7-sonnet-latest": "claude-sonnet-4-6",
    "claude-3-5-sonnet": "claude-sonnet-4-6",
    "claude-3-5-haiku": "gemini-3.8-flash",
    "gemini-flash": "gemini-3.8-flash",
    "gemini-pro": "gemini-3.1-pro-high"
  }
}
```

---

## Lista de Comandos CLI

| Comando | Descricao |
|---|---|
| `node bin/constellation.js login` | Adiciona uma nova conta Google ao pool via OAuth2 |
| `node bin/constellation.js accounts` | Lista todas as contas com status de cota e cooldown |
| `node bin/constellation.js accounts --refresh` | Forca atualizacao imediata de cotas ignorando cache |
| `node bin/constellation.js serve` | Inicia o servidor proxy e dashboard na porta 6012 |
| `node bin/constellation.js serve --port 8080` | Inicia o servidor em porta customizada |
| `node bin/constellation.js serve --theme white` | Inicia o servidor com o tema Claro ativo |
| `node bin/constellation.js claude [args...]` | Inicia o Claude Code conectado diretamente ao Constellation |
| `node bin/constellation.js test "Prompt"` | Executa uma chamada rapida de teste para validar o pool |
| `node bin/constellation.js remove <id>` | Remove uma conta cadastrada no pool |

---

## Seguranca

- O arquivo `keys.json` armazena os tokens de acesso e refresh localmente na sua maquina.
- O arquivo `keys.json` esta configurado no `.gitignore` e nunca deve ser compartilhado ou versionado.
- O servidor roda localmente em `localhost`.

---

## Licenca

MIT