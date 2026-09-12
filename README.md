# MathStats - Motor de Desafios (Back-end)

API desenvolvida em Node.js e TypeScript para a plataforma educacional MathStats. Este serviço consome dados reais de partidas de futebol via API-Football, calcula estatísticas (como média de gols) e gera desafios matemáticos dinâmicos, validando as respostas e persistindo tudo em um banco de dados Firebase Firestore.

**Autor:** Guilherme Marins Rodrigues

---

## Tecnologias utilizadas

- Node.js + Express
- TypeScript
- Firebase Admin SDK (Firestore)
- Axios (consumo da API externa)
- TSX (execução do TypeScript em desenvolvimento, com watch)

---

## Pré-requisitos

- Node.js versão 20 ou superior (versão usada no desenvolvimento)
- Git
- Uma chave de acesso à API-Football
- Um projeto no Firebase com Firestore habilitado

---

## Como rodar o projeto localmente

### 1. Clonar o repositório e instalar as dependências

```bash
git clone https://github.com/guilherme-math/MathStats.git
cd mathstats-entrega1409
npm install
```

### 2. Configurar variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto:

```
API_FOOTBALL_KEY=sua_chave_aqui
```

### 3. Configurar a credencial do Firebase

O projeto usa o Firebase Admin SDK, que precisa de um arquivo JSON de credenciais de serviço.

1. No Firebase Console, vá em **Configurações do Projeto → Contas de Serviço → Gerar nova chave privada**.
2. Renomeie o arquivo baixado para `mathstats-firebase-adminsdk-fbsvc-0d93ccc6d5.json` (é esse nome que `src/config/firebase.ts` espera encontrar).
3. Coloque o arquivo na raiz do projeto, no mesmo nível do `.env`.

> **Nunca envie esse arquivo nem o `.env` para o Git.** Os dois já estão listados no `.gitignore` do projeto. Se algum dia esse JSON for commitado por engano, a chave deve ser revogada e uma nova deve ser gerada no Firebase Console.

### 4. Iniciar o servidor

```bash
npx tsx watch src/server.ts
```

O terminal deve exibir:
```
Servidor rodando na porta 3000!
Abra http://localhost:3000 no navegador para testar.
```

O Express já serve a interface web junto com a API, então basta acessar **http://localhost:3000** no navegador. Não é necessário abrir o `index.html` diretamente pelo arquivo, o front-end espera ser servido por essa mesma porta.