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

A aplicação de teste monta as rotas reais de desafios e painel. Os três endpoints de
autenticação usados na preparação são montados diretamente com seus controllers reais;
os limites de cadastro/login não fazem parte deste alvo. As rotas escolhidas conservam seus
middlewares e validadores. O cookie usa HTTP local; a configuração HTTPS de produção não é alterada.

Somente o envio de boas-vindas e o transporte Axios da API esportiva são substituídos.
Não são utilizados bancos de desenvolvimento ou produção. O processo de teste termina
explicitamente após os hooks (`--test-force-exit`) porque o módulo MongoDB mantém um pool
global; o executor encerra o MongoDB no bloco finally.

O teste 403 verifica autorização por propriedade do desafio. O sistema possui apenas o
perfil aluno e normaliza outros perfis para aluno: por isso não existe um segundo perfil
válido para testar uma negação por papel. Essa diferença deve ser informada ao professor,
sem inventar um perfil ou mudar a aplicação apenas para satisfazer o teste.

O comando `npm test` continua executando a suíte anterior. A integração é executada separadamente.
