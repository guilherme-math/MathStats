# Plano de resposta a incidentes — MathStats

Versão acadêmica 1.0 — setembro de 2026.

## Acionamento

Tratar como incidente qualquer suspeita de acesso indevido, vazamento, perda, alteração ou indisponibilidade relevante de dados pessoais, credenciais, sessões ou logs.

Canal do projeto para comunicações relacionadas à privacidade: `mathstats.app@gmail.com`.

## Procedimento

1. Registrar data, origem do alerta e impacto conhecido; preservar os logs relevantes.
2. Conter o evento: encerrar sessões afetadas, revogar credenciais expostas e interromper a integração vulnerável quando necessário.
3. Investigar quais dados, usuários e serviços foram atingidos, sem inserir senhas, tokens ou códigos em logs de investigação.
4. Corrigir a causa, testar a correção e documentar a evidência.
5. Avaliar, com orientação do professor e do responsável pelo projeto, a necessidade de comunicação aos titulares e à ANPD conforme a gravidade e os requisitos aplicáveis.
6. Registrar as decisões, a data de encerramento e as ações de prevenção.

## Controles existentes

- Hash Argon2id para senha.
- Segredo TOTP criptografado com AES-256-GCM.
- HTTPS, cookie HttpOnly e SameSite=Strict.
- Limitação de tentativas de login, 2FA, recuperação e rotas LGPD.
- Logs de auditoria em MongoDB Atlas com retenção automática de 180 dias.
- Credenciais mantidas fora do código, no `.env` e na chave de serviço Firebase ignorada pelo Git.

## Evidências para o PFC

Guardar capturas ou registros dos testes de: bloqueio por limite de tentativas, acesso negado a rotas privadas sem sessão, consulta/exportação/exclusão do próprio usuário, criação de logs de auditoria e presença do índice TTL no MongoDB Atlas.
