# Privacidade e LGPD

Este documento resume quais dados o MathStats utiliza, por que são necessários e como o usuário pode gerenciá-los.

## Dados utilizados

| Dado                                | Finalidade                           | Armazenamento                         | Retenção                             |
| ----------------------------------- | ------------------------------------ | ------------------------------------- | ------------------------------------ |
| Nome de exibição, usuário e e-mail  | Criar e identificar a conta          | Firebase Firestore                    | Enquanto a conta estiver ativa       |
| Hash da senha                       | Autenticação local                   | Firebase Firestore                    | Enquanto a senha estiver configurada |
| Identificador Google                | Permitir login com Google            | Firebase Firestore                    | Enquanto a conta estiver vinculada   |
| Segredo do autenticador             | Segundo fator de acesso              | Firebase Firestore, com AES-256-GCM   | Enquanto a conta estiver ativa       |
| Códigos temporários                 | Login e recuperação                  | Sessão e hash temporário              | Até 15 minutos ou primeiro uso       |
| XP, ofensiva, respostas e histórico | Exibir o progresso educacional       | Firebase Firestore                    | Enquanto a conta estiver ativa       |
| Sessão autenticada                  | Manter o acesso                      | Firebase Firestore e cookie essencial | Até 15 minutos sem renovação         |
| Eventos de auditoria                | Segurança e rastreabilidade          | MongoDB Atlas                         | 180 dias                             |
| Aceite dos documentos               | Registrar os documentos apresentados | Firebase Firestore                    | Enquanto a conta estiver ativa       |

O MathStats não solicita CPF, endereço residencial, localização precisa, imagem, voz, biometria, dados financeiros, informações de saúde ou data de nascimento completa.

## Serviços externos

| Serviço                 | Utilização                 | Dados envolvidos                                    |
| ----------------------- | -------------------------- | --------------------------------------------------- |
| Firebase e Google Cloud | Conta, progresso e sessões | Dados da conta e utilização da plataforma           |
| Google Identity         | Login opcional com Google  | Identificador, nome e e-mail fornecidos pelo Google |
| Gmail                   | Mensagens de segurança     | E-mail, nome de usuário e código temporário         |
| MongoDB Atlas           | Auditoria                  | Identificador, evento, data, IP e detalhe técnico   |
| API-Football            | Dados esportivos           | Nenhum dado pessoal                                 |
| Vercel                  | Hospedagem                 | Requisições necessárias ao funcionamento do site    |

Alguns fornecedores podem processar informações fora do Brasil, conforme a região de infraestrutura e os termos de cada serviço.

## Controle de acesso

- Visitantes acessam somente as páginas públicas.
- Páginas e APIs privadas exigem sessão válida.
- O perfil de acesso é definido e verificado no backend.
- Consultas, exportações, desafios e logs utilizam o identificador da sessão.
- Alterar a URL ou o corpo da requisição não permite acessar dados de outra conta.

## Direitos disponíveis

Na área **Conta e privacidade**, o usuário pode:

- consultar os próprios dados;
- exportar o histórico completo;
- atualizar o nome de exibição;
- trocar a própria senha;
- visualizar os próprios logs;
- registrar e acompanhar solicitações;
- excluir a conta.

Solicitações adicionais podem ser enviadas para `mathstats.app@gmail.com`.

## Crianças e adolescentes

O MathStats utiliza coleta reduzida, desempenho privado e não apresenta publicidade comportamental. A plataforma não coleta idade nem possui vínculo digital com responsáveis nesta versão. Crianças e adolescentes devem utilizar o serviço com orientação de responsável ou educador.

## Documentos vigentes

- Política de Privacidade: `2026-09-24-v3`.
- Termos de Uso: `2026-09-24-v2`.
- Atualização apresentada ao usuário: setembro de 2026.