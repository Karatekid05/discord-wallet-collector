# Discord Wallet Collector Bot

Bot de Discord com comando `/setup` que publica uma mensagem "submit your EVM wallet" com dois botões: "Submit Wallet" (abre um modal para submeter a wallet) e "check status" (mostra a wallet submetida e o username/ID do Discord). As wallets são guardadas no Google Sheets.

## Requisitos
- Node.js 18+
- Um Bot de Discord (token e client ID)
- Uma Google Spreadsheet (e uma Service Account com acesso a essa sheet)

## Configuração do Google Sheets
1. Crie um projeto no Google Cloud e ative a API "Google Sheets API".
2. Crie uma Service Account e gere uma chave (JSON). Copie:
   - `client_email` -> GOOGLE_SERVICE_ACCOUNT_EMAIL
   - `private_key` -> GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY (escape de \n já suportado)
3. No Google Sheets, crie uma folha (pode ser vazia). Copie o ID da spreadsheet (URL entre `/d/` e `/edit`).
4. Partilhe a spreadsheet com o email da Service Account com permissão de Editor.

O código cria automaticamente uma folha chamada `Wallets` e o cabeçalho, se não existir.

## Variáveis de Ambiente
Copie o ficheiro `.env.example` para `.env` e preencha:

```
DISCORD_TOKEN=seu_token_do_bot
DISCORD_CLIENT_ID=seu_client_id_do_app
# Opcional: para registar comandos instantaneamente num servidor específico
# GUILD_ID=123456789012345678

GOOGLE_SHEETS_SPREADSHEET_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_SERVICE_ACCOUNT_EMAIL=svc-account@project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

## Instalação
```
npm install
```

## Registar comandos (uma vez por alteração)
Se tiver `GUILD_ID` definido, os comandos aparecem instantaneamente; sem `GUILD_ID`, comandos globais podem demorar até 1 hora.
```
npm run register
```

## Executar o bot
```
npm run dev
```

## Como usar
No Discord, num canal do servidor, execute `/setup`. O bot vai enviar a mensagem:
```
submit your EVM wallet
```
com os botões "Submit Wallet" e "check status".

- "Submit Wallet": abre um modal para inserir a wallet EVM (formato 0x...). Ao submeter novamente, substitui a wallet anterior.
- "check status": mostra (em mensagem ephemeral) a wallet submetida, o seu Discord username e o Discord ID. Se não existir, informa que ainda não submeteu.

## Notas
- O username gravado é o `username` do Discord (pode não incluir discriminator em contas novas).
- A validação de wallet é simples (regex 0x + 40 hex). Pode reforçar se necessário.

