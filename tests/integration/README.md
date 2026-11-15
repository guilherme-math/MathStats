# Testes de integração

Requisitos: Node 24, Java 21 ou superior no PATH e acesso à internet na primeira execução
para baixar os binários locais. Não é necessário Docker, login Firebase ou credencial de produção.

```text
npm ci
npm run test:integration
```

O executor inicia MongoDB 7.0.14 descartável e Firestore Emulator no projeto
`demo-mathstats-integration`, executa HTTP em porta aleatória e encerra os bancos ao terminar.
O executor escolhe portas locais livres para os emuladores. Cada cenário cadastra uma conta única pela API, faz login
com senha e confirma TOTP. Senhas, criptografia, controllers, serviços, UserModel,
transações Firestore, sessão persistida, autorização e auditoria MongoDB são reais.

A aplicação de teste monta as rotas reais de desafios, painel e turmas. Os endpoints de
cadastro, login, verificação TOTP e logout são montados diretamente com seus controllers reais;
os limites de cadastro/login não fazem parte deste alvo. As rotas escolhidas conservam seus
middlewares e validadores. O cookie usa HTTP local; a configuração HTTPS de produção não é alterada.

Somente o envio de boas-vindas e o transporte Axios da API esportiva são substituídos.
Não são utilizados bancos de desenvolvimento ou produção. O processo de teste termina
explicitamente após os hooks (`--test-force-exit`) porque o módulo MongoDB mantém um pool
global; o executor encerra o MongoDB no bloco finally.

A suíte verifica o acesso de alunos e professores, o isolamento por turma e por conta,
a publicação de atividades e os fluxos de sessão. O comando `npm test` continua executando
a suíte principal separadamente.

## Teste de carga local (RPM)

```text
npm run test:rpm
```

O cenário inicializa contas e sessões de alunos nos mesmos bancos descartáveis da integração.
Por padrão, são três etapas de 180 segundos com 30, 60 e 120 alunos simultâneos. Cada aluno
consulta o painel e a lista de turmas cerca de uma vez a cada cinco segundos. Na última fase,
todos os alunos da maior etapa enviam a mesma atividade simultaneamente. O teste confere
quantas respostas foram gravadas, quais alunos entregaram e se a correção foi consistente.

Cada linha `LOAD_RESULT` registra latência p95, erros e códigos HTTP. Nas consultas,
o resultado inclui RPM total, RPM de sucesso e métricas por rota. Para a entrega em rajada,
a saída mostra o tempo até a última resposta e o número de entregas persistidas.

Para configurar outra escala no PowerShell:

```powershell
$env:MATHSTATS_RPM_LEVELS = '30,60,120'
$env:MATHSTATS_RPM_SECONDS = '180'
npm run test:rpm
```

Os níveis devem ser crescentes, entre 1 e 300 alunos. Cada etapa pode durar de 5 a 300 segundos.
Como as mesmas contas participam de etapas sucessivas, etapas mais longas podem atingir
o limite de requisições por aluno. O cenário mede o servidor e os bancos locais, com uma
turma de teste e históricos de aluno vazios ou pequenos. A capacidade em produção precisa
de medições próprias.

### Resultado da execução local

| Alunos simultâneos | Consultas em 180 s | RPM com sucesso | Latência p95 | Erros |
| -----------------: | -----------------: | --------------: | -----------: | ----: |
|                 30 |              2.160 |             720 |        67 ms |    0% |
|                 60 |              4.320 |           1.440 |        69 ms |    0% |
|                120 |              8.640 |           2.880 |        55 ms |    0% |

Na atividade compartilhada, as 120 entregas foram aceitas e persistidas em uma janela
de 728 ms, com latência p95 de 714 ms e nenhum erro. O teste conferiu uma entrega
corrigida por aluno.
