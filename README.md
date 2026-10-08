# MathStats

Plataforma educacional de matemática e estatística contextualizada com dados de futebol.

## Estado atual

- Frontend em HTML5, CSS, JavaScript Vanilla e Bootstrap 5.
- Backend em Node.js, Express e TypeScript.
- Contas, progresso, tentativas e solicitações LGPD no Firebase Firestore.
- Sessões persistentes no Firebase Firestore e auditoria no MongoDB Atlas.
- Validação estruturada no cadastro, login, recuperação, troca de senha e desafios.
- Limites de requisições compartilhados no Firestore.
- Cache com tolerância a falhas na integração com a API-Football.
- Senhas com Argon2id; segredo TOTP com AES-256-GCM.
- 2FA por aplicativo autenticador ou código por e-mail.
- Reconhecimento opcional do dispositivo por 30 dias após um 2FA válido.
- Login opcional com Google Identity.
- Perfil funcional `aluno` aplicado a todas as contas desta versão.
- Desafios baseados na API-Football.
- XP, ofensiva, tentativas e dashboard persistentes por usuário.
- Consulta, exportação completa, atualização do nome de exibição, exclusão e acompanhamento de solicitações LGPD.
- Filtro local de linguagem inadequada para nome de exibição e username.

## Jornada atual

```text
Home ─┬─ Cadastro → configuração do 2FA → login → 2FA → Dashboard
      └─ Login → 2FA ──────────────────────────────────────┤
                                                          ├─ Trilha de desafios
                                                          └─ Conta e privacidade
```

A página inicial fica em `/` e o acesso em `/login`. Depois do 2FA, o usuário é direcionado para `/dashboard`. Perfil, segurança e direitos LGPD ficam em `/conta`. Sem sessão, `/dashboard`, `/conta`, `/desafio` e as APIs privadas recusam o acesso.

Contas cadastradas com Google entram diretamente após a validação do token do Google. Um cadastro local com o mesmo e-mail não é vinculado automaticamente: nesse caso, o acesso continua por senha ou recuperação. Isso evita herdar credenciais criadas por alguém que informou um e-mail alheio.

A sessão é renovada no login e na conclusão do MFA. A troca de senha invalida as demais sessões e verificações pendentes; a sessão usada para trocar a senha é renovada. Na recuperação, o código é consumido uma única vez e o usuário precisa entrar novamente.

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
- `sessions`: sessões persistentes no Firestore com expiração de 15 minutos.
- `rateLimits`: contadores por rota e resumo criptográfico do IP, com janelas de 15 minutos.

Ative políticas TTL no Firestore para o campo `expiresAt` dos grupos de coleções `sessions` e `rateLimits`. O backend verifica o vencimento antes de usar esses registros, independentemente do tempo da limpeza física do provedor. Sem a política, documentos vencidos podem permanecer armazenados.

Novos cadastros registram as versões dos Termos e da Política definidas em `src/config/legalDocuments.ts`. Contas antigas permanecem identificadas como aceite legado sem versão.

## Moderação de identificadores

O nome de exibição e o username são validados no navegador e novamente no backend. O filtro local trata maiúsculas, acentos, separadores, repetições e substituições comuns por números. Nenhum identificador é enviado a uma API externa de moderação.

## Publicação na Vercel

O arquivo `src/server.ts` exporta a aplicação Express para a Vercel. Quando executado diretamente fora da Vercel, inicia o servidor HTTPS local. Os arquivos em `public/` são entregues pela CDN; as páginas em `protected/` continuam passando pela verificação de sessão.

Configure estas variáveis em **Project → Settings → Environment Variables**:

```text
NODE_ENV=production
APP_BASE_URL=https://mathstats.vercel.app
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

A conta de serviço deve poder ler e gravar `users`, `challenges`, `sessions` e `rateLimits`. Os limites usam transações no Firestore e recusam a operação quando esse armazenamento está indisponível. Cada requisição privada verifica se a conta existe e se as credenciais ainda correspondem à sessão.

Depois desta atualização, sessões antigas precisam de um novo login. Cadastros antigos sem os campos normalizados ainda podem ser encontrados pelo valor exato de usuário ou e-mail; o servidor não percorre toda a coleção para procurar uma conta.

## Organização do backend

- `controllers`: requisições e respostas HTTP; autenticação, dashboard, desafios e privacidade em módulos separados.
- `services/challengeBuilder.ts`: cálculos e conteúdo das cinco atividades, sem acesso à rede ou ao banco.
- `services/footballService.ts`: consulta, validação e cache dos dados esportivos.
- `validation`: contratos de entrada das APIs.
- `models`: consultas e alterações dos dados.
- `stores`: persistência de sessões e limites compartilhados.

Os testes usam substitutos locais para os serviços externos. Eles verificam os fluxos de autenticação e recuperação, isolamento, cálculos e tratamento de falhas, mas não comprovam a configuração dos provedores em produção.

As substituições de `uuid` em `package.json` mantêm a versão corrigida `11.1.1` nos clientes Google que usam `v4()`, preservando a compatibilidade CommonJS do projeto. Reavalie essas substituições ao atualizar o Firebase e os clientes Google.

## Documentação LGPD

- `docs/LGPD_MATRIZ.md`: inventário, finalidades, fornecedores, retenção e direitos.
- `docs/PLANO_RESPOSTA_INCIDENTES.md`: procedimento de resposta a incidentes.
- `docs/API_FOOTBALL.md`: funcionamento da integração esportiva.
- `public/politica-de-privacidade.html`: política apresentada aos usuários.
- `public/termos-de-uso.html`: condições de utilização.

Canal do projeto: `mathstats.app@gmail.com`.
