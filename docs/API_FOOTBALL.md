# Integração com a API-Football

O MathStats utiliza dados reais de futebol para montar atividades de matemática e estatística. A integração acontece somente no backend, mantendo a chave da API fora do navegador.

## Serviço utilizado

- Provedor: API-Football, da API-Sports.
- Recurso: partidas de um time em uma temporada.
- Endpoint utilizado: `GET /fixtures?team=127&season=2024`.
- Autenticação: cabeçalho `x-apisports-key`.
- Variável de ambiente: `API_FOOTBALL_KEY`.

## Funcionamento

1. O usuário autenticado abre a trilha de desafios.
2. O backend consulta as partidas do Flamengo na temporada de 2024.
3. Apenas partidas finalizadas são consideradas.
4. Os cinco jogos mais recentes são usados nos cálculos.
5. O MathStats gera desafios de média, porcentagem, proporção e interpretação de dados.
6. A resposta e o progresso são salvos no Firestore.

Os resultados da consulta permanecem em cache por cinco minutos em cada instância do servidor. Se o provedor ficar temporariamente indisponível, o backend pode reutilizar por até 24 horas a última resposta válida. A consulta possui tempo limite de cinco segundos e uma nova tentativa para falhas de rede ou erros do provedor.

## Dados pessoais

Nenhum dado pessoal é enviado para a API-Football. A requisição contém apenas o identificador do time, a temporada e a chave do serviço.

## Tratamento de falhas

O backend valida a estrutura recebida antes de utilizar os dados. Se não houver partidas suficientes, informa que a trilha não pode ser gerada. Erros de comunicação retornam uma mensagem genérica, sem expor a chave ou detalhes internos. A criação de desafios aceita somente índices de 1 a 5, possui limite de 20 requisições a cada 15 minutos e registra sucessos e falhas na auditoria.

## Arquivos relacionados

- `src/controllers/challengeController.ts`
- `src/services/footballService.ts`
- `src/validation/challengeSchemas.ts`
- `src/routes/challengeRoutes.ts`
- `public/desafio/script.js`
- `public/desafio/style.css`

## Como demonstrar

1. Entrar em uma conta.
2. Abrir a página **Trilha**.
3. Mostrar que os desafios utilizam partidas e estatísticas de futebol.
4. Responder uma atividade e verificar a atualização do XP e do histórico.
