# MathStats

Plataforma educacional de matemática e estatística contextualizada com dados de futebol, desenvolvida como PFC.

## Estado atual

- Frontend em HTML5, CSS, JavaScript Vanilla e Bootstrap 5.
- Backend em Node.js, Express e TypeScript.
- Contas, progresso, tentativas e solicitações LGPD no Firebase Firestore.
- Sessões persistentes e auditoria no MongoDB Atlas.
- Senhas com Argon2id; segredo TOTP com AES-256-GCM.
- 2FA por aplicativo autenticador ou código por e-mail.
- Login opcional com Google Identity.
- Desafios baseados na API-Football.
- XP, ofensiva, tentativas e dashboard persistentes por usuário.
- Consulta, exportação completa, atualização do nome de exibição, exclusão e acompanhamento de solicitações LGPD.
- Filtro local de linguagem inadequada para nome de exibição e username.

## Jornada atual

```text
Cadastro → configuração do 2FA → login → 2FA → Dashboard
                                              ├─ Trilha de desafios
                                              └─ Conta e privacidade
```

Depois do 2FA, o usuário é direcionado para `/dashboard`. Perfil, segurança e direitos LGPD ficam em `/conta`. Sem sessão, `/dashboard`, `/conta`, `/desafio` e as APIs privadas recusam o acesso.

## Desenvolvimento local

1. Execute `npm install`.
2. Copie `.env.example` para `.env` e preencha as credenciais.
3. Mantenha `firebase-key.json` apenas no ambiente local; o arquivo está ignorado pelo Git.
4. Execute `npm run dev`.
5. Acesse `https://localhost:3443`.

O servidor local usa HTTPS. Se `key.pem` e `cert.pem` não existirem, gera certificados de desenvolvimento. Esses arquivos não são usados na Vercel.

## Scripts

```text
npm run dev    inicia o servidor HTTPS local
npm run build  compila o TypeScript
npm test       compila e executa a suíte automatizada
npm start      executa a compilação local
```

## Dados e retenção

- `users/{userId}`: conta, segurança e totais de progresso.
- `users/{userId}/attempts`: histórico completo de desafios.
- `users/{userId}/privacyRequests`: histórico de solicitações de direitos, sem sobrescrever pedidos anteriores.
- `auditLogs`: eventos de segurança com TTL padrão de 180 dias.
- `sessions`: sessões persistentes com TTL de 15 minutos.

Novos cadastros registram as versões dos Termos e da Política definidas em `src/config/legalDocuments.ts`. Contas antigas permanecem identificadas como aceite legado sem versão.

## Moderação de identificadores

O nome de exibição e o username são validados no navegador e novamente no backend. O filtro local trata maiúsculas, acentos, separadores, repetições e substituições comuns por números. Nenhum identificador é enviado a uma API externa de moderação.

## Publicação na Vercel

O arquivo `src/server.ts` exporta a aplicação Express para a Vercel e inicia HTTPS somente no desenvolvimento local. Os arquivos em `public/` são entregues pela CDN; as páginas em `protected/` continuam passando pela verificação de sessão.

Configure estas variáveis em **Project → Settings → Environment Variables**:

```text
NODE_ENV=production
APP_BASE_URL=https://SEU-PROJETO.vercel.app
SESSION_SECRET
SESSION_COOKIE_NAME=mathstats.sid
ENCRYPTION_KEY
FIREBASE_SERVICE_ACCOUNT_BASE64
MONGODB_URI
MONGODB_DB=mathstats
AUDIT_LOG_RETENTION_DAYS=180
GMAIL_USER=mathstats.app@gmail.com
GMAIL_APP_PASSWORD
PRIVACY_CONTACT_EMAIL=mathstats.app@gmail.com
GOOGLE_CLIENT_ID
API_FOOTBALL_KEY
APP_TIMEZONE=America/Sao_Paulo
```

`FIREBASE_SERVICE_ACCOUNT_BASE64` deve conter o arquivo JSON da conta de serviço codificado em Base64. No desenvolvimento local, `FIREBASE_KEY_PATH` pode apontar para `firebase-key.json`. Não envie credenciais, arquivos `.env`, certificados ou chaves ao repositório.

Depois da primeira publicação, adicione a URL final da Vercel às origens autorizadas do cliente OAuth no Google Cloud. Configure `APP_BASE_URL` e `ALLOWED_ORIGIN` com o mesmo domínio da aplicação.

## Documentação LGPD

- `docs/LGPD_MATRIZ.md`: inventário, finalidades, fornecedores, retenção e direitos.
- `docs/PLANO_RESPOSTA_INCIDENTES.md`: procedimento acadêmico de resposta a incidentes.
- `public/politica-de-privacidade.html`: política apresentada aos usuários.
- `public/termos-de-uso.html`: condições de utilização.

Canal do projeto: `mathstats.app@gmail.com`.
