# Resposta a incidentes

Este procedimento deve ser utilizado em caso de acesso indevido, vazamento, perda, alteração ou indisponibilidade relevante de dados do MathStats.

## Canal de contato

`mathstats.app@gmail.com`

## Procedimento

1. Registrar quando e como o problema foi identificado.
2. Preservar logs e outras evidências necessárias à investigação.
3. Conter o incidente, encerrando sessões ou revogando credenciais quando necessário.
4. Identificar os sistemas, dados e usuários afetados.
5. Corrigir a causa e testar a correção.
6. Avaliar o risco causado aos titulares.
7. Comunicar os usuários e a ANPD quando houver risco ou dano relevante e a comunicação for aplicável.
8. Registrar as decisões tomadas e as medidas preventivas adotadas.

Senhas, tokens, códigos temporários e segredos de autenticação não devem ser copiados para registros de investigação.

## Controles existentes

- Senhas protegidas com Argon2id.
- Segredos TOTP protegidos com AES-256-GCM.
- HTTPS em produção.
- Cookies de sessão `Secure`, `HttpOnly` e `SameSite=Strict`.
- Segundo fator de autenticação.
- Limites de tentativas para login, recuperação e envio de código.
- Isolamento de dados por usuário.
- Auditoria no MongoDB Atlas com retenção de 180 dias.
- Credenciais fora do código e do repositório.

## Evidências recomendadas

- Acesso negado a uma rota privada sem sessão.
- Bloqueio após tentativas repetidas de login.
- Geração de um evento no histórico de auditoria.
- Consulta e exportação dos dados da própria conta.
- Exclusão da conta.
- Índice TTL da coleção `auditLogs` no MongoDB Atlas.