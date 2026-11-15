# Testes de integração

Requisitos: Node 24, Java 21 ou superior no PATH e acesso à internet na primeira execução
para baixar os binários locais. Não é necessário Docker, login Firebase ou credencial de produção.

```text
npm ci
npm run test:integration
```

O executor inicia MongoDB 7.0.14 descartável e Firestore Emulator no projeto
`demo-mathstats-integration`, executa HTTP em porta aleatória e encerra os bancos ao terminar.
A porta 8187 deve estar livre. Cada cenário cadastra uma conta única pela API, faz login
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
Cada aluno consulta o painel e a lista de turmas cerca de uma vez por segundo. Há etapas de
12 segundos com 1, 10, 30 e 60 alunos simultâneos. Cada linha `LOAD_RESULT` registra a taxa
de requisições por minuto, a latência p95 e os erros. O RPM é calculado a partir da duração
observada da etapa.

Em uma execução local, 60 alunos geraram 1.440 respostas com sucesso, a uma taxa estimada
de 7.195 RPM, p95 de 40 ms e 0% de erros. Esse resultado cobre as duas consultas no servidor
e nos bancos locais. A capacidade em produção e o impacto de entregas simultâneas de
atividades precisam de medições próprias.
