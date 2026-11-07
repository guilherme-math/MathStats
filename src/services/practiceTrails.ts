import { getRecentTeamMatches, getTeamPlayers } from './footballService';
import type { ChallengeDefinition } from './challengeBuilder';

type Exercise = [
  title: string,
  question: string,
  answer: number,
  explanation: string,
  hint: string,
];

const easy: Exercise[] = [
  [
    'Gols em casa e fora',
    'O time marcou 3 gols em casa e 2 fora. Quantos gols marcou ao todo?',
    5,
    '3 + 2 = 5 gols.',
    'Some os dois placares.',
  ],
  [
    'Diferença no placar',
    'Um jogo terminou em 4 a 1. Qual foi a diferença de gols?',
    3,
    '4 − 1 = 3 gols.',
    'Subtraia o menor placar do maior.',
  ],
  [
    'Ingressos restantes',
    'Havia 80 ingressos disponíveis e 35 foram vendidos. Quantos restaram?',
    45,
    '80 − 35 = 45 ingressos.',
    'Retire os vendidos do total.',
  ],
  [
    'Chutes dos dois times',
    'Um time deu 12 chutes e o outro deu 9. Quantos chutes houve no total?',
    21,
    '12 + 9 = 21 chutes.',
    'Some os chutes dos dois times.',
  ],
  [
    'Rodadas restantes',
    'Um campeonato tem 38 rodadas. Já aconteceram 24. Quantas faltam?',
    14,
    '38 − 24 = 14 rodadas.',
    'Subtraia as rodadas realizadas.',
  ],
  [
    'Público no estádio',
    'O setor A recebeu 120 pessoas e o setor B recebeu 85. Qual foi o público nos dois setores?',
    205,
    '120 + 85 = 205 pessoas.',
    'Some o público de cada setor.',
  ],
  [
    'Saldo negativo',
    'O time marcou 7 gols e sofreu 10. Qual é seu saldo de gols?',
    -3,
    '7 − 10 = −3 gols.',
    'Saldo é gols marcados menos gols sofridos.',
  ],
  [
    'Jogadores disponíveis',
    'Havia 23 jogadores inscritos. Dois ficaram indisponíveis. Quantos restaram?',
    21,
    '23 − 2 = 21 jogadores.',
    'Desconte os indisponíveis.',
  ],
  [
    'Placar acumulado',
    'O time marcou 2, 0 e 3 gols em três jogos. Qual foi o total?',
    5,
    '2 + 0 + 3 = 5 gols.',
    'Some os gols dos três jogos.',
  ],
  [
    'Disputa pela liderança',
    'O líder tem 42 pontos e o segundo colocado tem 36. Qual é a diferença?',
    6,
    '42 − 36 = 6 pontos.',
    'Compare as duas pontuações.',
  ],
];

const medium: Exercise[] = [
  [
    'Pontos por vitória',
    'Cada vitória vale 3 pontos. Quantos pontos rendem 8 vitórias?',
    24,
    '8 × 3 = 24 pontos.',
    'Multiplique vitórias por pontos.',
  ],
  [
    'Divisão em equipes',
    'Em um treino, 24 jogadores foram divididos igualmente em 4 equipes. Quantos ficaram em cada equipe?',
    6,
    '24 ÷ 4 = 6 jogadores.',
    'Divida pelo número de equipes.',
  ],
  [
    'Vitórias e empates',
    'Um time obteve 6 vitórias de 3 pontos e 4 empates de 1 ponto. Quantos pontos somou?',
    22,
    '6 × 3 + 4 × 1 = 22 pontos.',
    'Calcule os pontos de cada resultado antes de somar.',
  ],
  [
    'Caixas de bolas',
    'Há 5 caixas com 8 bolas cada. Depois de retirar 7 bolas, quantas sobram?',
    33,
    '5 × 8 − 7 = 33 bolas.',
    'Calcule o total das caixas antes de subtrair.',
  ],
  [
    'Rodízio no treino',
    'Há 3 grupos com 12 jogadores cada. Eles se dividem igualmente em 6 estações. Quantos ficam por estação?',
    6,
    '(3 × 12) ÷ 6 = 6 jogadores.',
    'Ache o total de jogadores primeiro.',
  ],
  [
    'Arrecadação',
    'Foram vendidos 45 ingressos de R$ 20 e houve um custo de R$ 150. Quanto sobrou em reais?',
    750,
    '45 × 20 − 150 = 750 reais.',
    'Subtraia o custo da receita total.',
  ],
  [
    'Minutos de treino',
    'O treino teve 4 blocos de 15 minutos e 3 intervalos de 5 minutos. Quantos minutos durou?',
    75,
    '4 × 15 + 3 × 5 = 75 minutos.',
    'Some a duração dos blocos e dos intervalos.',
  ],
  [
    'Viagem de ida e volta',
    'Cada trecho tem 120 km. O time fez 3 viagens de ida e volta. Quantos quilômetros percorreu?',
    720,
    '120 × 2 × 3 = 720 km.',
    'Cada viagem tem dois trechos.',
  ],
  [
    'Orçamento por rodada',
    'O clube reservou R$ 360 para 6 rodadas. Usou R$ 45 da parte de uma rodada. Quanto sobrou dessa parte?',
    15,
    '360 ÷ 6 − 45 = 15 reais.',
    'Primeiro calcule a parte de uma rodada.',
  ],
  [
    'Pontos necessários',
    'O time tem 23 pontos e quer chegar a 35. Se cada vitória vale 3 pontos, quantas vitórias precisa sem contar empates?',
    4,
    '(35 − 23) ÷ 3 = 4 vitórias.',
    'Encontre os pontos que faltam.',
  ],
];

const advanced: Exercise[] = [
  [
    'Aproveitamento nos chutes',
    'Um atacante acertou o alvo em 9 de 15 chutes. Qual foi o percentual de acertos? Digite só o número.',
    60,
    '(9 ÷ 15) × 100 = 60%.',
    'Divida os acertos pelo total e multiplique por 100.',
  ],
  [
    'Média de gols por partida',
    'Um jogador fez 20 gols em 30 jogos. Qual foi a média de gols por jogo? Arredonde para duas casas decimais.',
    0.67,
    '20 ÷ 30 = 0,666…; arredondando, dá 0,67.',
    'Divida os gols pelo total de jogos.',
  ],
  [
    'Desconto no ingresso',
    'Um ingresso de R$ 80 recebeu 25% de desconto. Qual é o novo preço em reais?',
    60,
    '25% de 80 são 20 reais; 80 − 20 = 60.',
    'Calcule o desconto antes de subtrair.',
  ],
  [
    'Aumento do público',
    'O público subiu de 800 para 1.000 pessoas. Qual foi o aumento percentual? Digite só o número.',
    25,
    'O aumento foi 200; (200 ÷ 800) × 100 = 25%.',
    'Use o público inicial como base.',
  ],
  [
    'Mediana de gols',
    'Um time marcou 4, 0, 2, 1 e 3 gols em cinco jogos. Qual é a mediana?',
    2,
    'Em ordem: 0, 1, 2, 3, 4. O valor do meio é 2.',
    'Ordene os cinco valores.',
  ],
  [
    'Média ponderada',
    'O time fez em média 2 gols em 4 jogos em casa e 1 gol em 6 jogos fora. Qual foi a média nos dez jogos?',
    1.4,
    '(2 × 4 + 1 × 6) ÷ 10 = 1,4 gol por jogo.',
    'Calcule o total de gols antes de dividir.',
  ],
  [
    'Probabilidade de sortear vitória',
    'Em um conjunto de 20 partidas, 7 foram vitórias. Ao sortear uma partida ao acaso, qual é a chance percentual de sair uma vitória?',
    35,
    '(7 ÷ 20) × 100 = 35%.',
    'Divida os casos favoráveis pelos possíveis.',
  ],
  [
    'Diferença de aproveitamento',
    'Um time acertou 40% dos chutes e outro acertou 55%. Qual a diferença em pontos percentuais?',
    15,
    '55 − 40 = 15 pontos percentuais.',
    'Subtraia os percentuais.',
  ],
  [
    'Meta de média',
    'O time marcou 14 gols em 7 jogos. Quantos gols precisa marcar no oitavo jogo para terminar com média de 2,5 gols?',
    6,
    '8 × 2,5 = 20; faltam 20 − 14 = 6 gols.',
    'Ache o total de gols exigido pela nova média.',
  ],
  [
    'Trajetória da bola',
    'Em um modelo simplificado, a altura da bola é h(t) = −t² + 3t + 4, com t em segundos. Quantos segundos após o chute ela toca o chão?',
    4,
    'h(t) = 0 dá raízes −1 e 4. Como t é o tempo após o chute, a raiz válida é 4.',
    'Iguale a altura a zero e escolha a raiz positiva.',
  ],
];

const catalogs = { facil: easy, media: medium, avancada: advanced } as const;
const labels = { facil: 'Fácil', media: 'Médio', avancada: 'Avançado' } as const;
export type PracticeTrail = keyof typeof catalogs;

export function isPracticeTrail(value: unknown): value is PracticeTrail {
  return typeof value === 'string' && Object.hasOwn(catalogs, value);
}

export function buildPracticeChallenge(
  trail: PracticeTrail,
  index: number,
): ChallengeDefinition | null {
  const exercise = catalogs[trail][index - 1];
  if (!exercise) return null;
  const [titulo, pergunta, respostaCorreta, explicacao, hint] = exercise;
  return {
    tipo: 'numeric',
    tipoDesafio: `pratica_${trail}_${index}`,
    categoria: trail === 'avancada' ? 'Matemática aplicada' : 'Aritmética',
    dificuldade: labels[trail],
    titulo,
    contexto: 'Cenário simulado de futebol',
    historia: 'Pratique matemática usando uma situação inspirada no futebol.',
    pergunta,
    respostaCorreta,
    explicacao,
    dicas: [hint],
    xp: trail === 'facil' ? 10 : trail === 'media' ? 20 : 30,
    placeholder: 'Digite sua resposta numérica',
  };
}

const clubs = [
  { id: 127, name: 'Flamengo' },
  { id: 121, name: 'Palmeiras' },
  { id: 131, name: 'Corinthians' },
  { id: 126, name: 'São Paulo' },
  { id: 124, name: 'Fluminense' },
] as const;

function choices(answer: number, step = 1) {
  const values = [answer, answer + step, answer + 2 * step, answer + 3 * step].map((value) =>
    Number(value.toFixed(2)).toLocaleString('pt-BR'),
  );
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

function formatQuestion(
  question: ChallengeDefinition,
  index: number,
  answer: number,
): ChallengeDefinition {
  if (index % 4 === 2)
    return { ...question, tipo: 'numeric', respostaCorreta: answer, options: undefined };
  if (index === 5) {
    const correctStatement = Math.random() < 0.5;
    const statement = correctStatement ? answer : answer + 1;
    return {
      ...question,
      tipo: 'true-false',
      pergunta: `${question.pergunta} Um comentarista respondeu ${statement.toLocaleString('pt-BR')}. A resposta dele está correta?`,
      respostaCorreta: correctStatement ? 'Verdadeiro' : 'Falso',
      options: ['Verdadeiro', 'Falso'],
    };
  }
  const step =
    question.pergunta.includes('percent') && answer >= 85 ? -5 : Number.isInteger(answer) ? 1 : 0.1;
  return {
    ...question,
    tipo: question.tabela && index % 3 === 0 ? 'data-interpretation' : 'multiple-choice',
    respostaCorreta: answer.toLocaleString('pt-BR'),
    options: choices(answer, step),
  };
}

export async function buildSportsPractice(
  trail: PracticeTrail,
  index: number,
): Promise<ChallengeDefinition | null> {
  const base = buildPracticeChallenge(trail, index);
  if (!base) return null;
  const club =
    clubs[(index - 1 + (trail === 'facil' ? 0 : trail === 'media' ? 1 : 2)) % clubs.length];
  const season = 2024;
  const fallback = () => {
    const firstSentence = base.pergunta.indexOf('. ');
    const separator =
      firstSentence >= 0 && base.pergunta.slice(firstSentence + 2).includes('?')
        ? firstSentence
        : -1;
    return formatQuestion(
      {
        ...base,
        historia:
          separator === -1
            ? `Exercício simulado de futebol: ${base.titulo.toLocaleLowerCase('pt-BR')}.`
            : base.pergunta.slice(0, separator + 1),
        pergunta: separator === -1 ? base.pergunta : base.pergunta.slice(separator + 2),
      },
      index,
      Number(base.respostaCorreta),
    );
  };

  if ([4, 6, 8, 10].includes(index)) return fallback();

  if (index === 7 || index === 9) {
    const players = await getTeamPlayers(club.id, season);
    const first = players.find((player) => player.goals > 0);
    const second = players.find((player) => player.name !== first?.name);
    if (first) {
      const compare = index === 9 && second;
      const answer = compare
        ? Math.abs(first.goals - second.goals)
        : trail === 'facil'
          ? first.goals
          : trail === 'media'
            ? first.games - first.goals
            : Number((first.goals / first.games).toFixed(2));
      const question = compare
        ? 'Qual é a diferença de gols entre os dois jogadores?'
        : trail === 'facil'
          ? `Quantos gols ${first.name} marcou?`
          : trail === 'media'
            ? 'Qual é a diferença entre o número de partidas e o número de gols?'
            : 'Qual foi a média de gols por jogo? Arredonde para duas casas decimais.';
      const rows = [first, ...(compare ? [second] : [])].map((player) => [
        player.name,
        String(player.games),
        String(player.goals),
      ]);
      const explanation = compare
        ? `A diferença entre ${first.goals} e ${second.goals} é ${answer}.`
        : trail === 'facil'
          ? `A coluna de gols mostra ${answer}.`
          : trail === 'media'
            ? `${first.games} − ${first.goals} = ${answer}.`
            : `${first.goals} ÷ ${first.games} ≈ ${answer.toLocaleString('pt-BR')}.`;
      return formatQuestion(
        {
          ...base,
          titulo: compare ? 'Comparação entre jogadores' : 'Desempenho de um jogador',
          contexto: 'Dados reais da API-Football',
          historia: `Confira os números de ${first.team} no Brasileirão de ${season}.`,
          pergunta: question,
          explicacao: explanation,
          dicas: ['Use as colunas de partidas e gols para encontrar os valores do enunciado.'],
          tabela: { headers: ['Jogador', 'Partidas', 'Gols'], rows },
        },
        index,
        answer,
      );
    }
  }

  try {
    const games = await getRecentTeamMatches(club.id, season);
    if (games.length !== 5) return fallback();
    const [a, b, c] = games.map((game) => game.gols);
    const total = games.reduce((sum, game) => sum + game.gols, 0);
    const conceded = games.reduce((sum, game) => sum + game.golsAdversario, 0);
    const wins = games.filter((game) => game.gols > game.golsAdversario).length;
    const draws = games.filter((game) => game.gols === game.golsAdversario).length;
    const withGoals = games.filter((game) => game.gols > 0).length;
    const median = [...games].sort((x, y) => x.gols - y.gols)[2].gols;
    const exercises: Record<PracticeTrail, Exercise[]> = {
      facil: [
        [
          'Total nos dois primeiros jogos',
          'Quantos gols o clube marcou somando as partidas 1 e 2 da tabela?',
          a + b,
          `${a} + ${b} = ${a + b}.`,
          'Some os gols marcados nas duas primeiras linhas.',
        ],
        [
          'Saldo nos cinco jogos',
          'Qual foi o saldo de gols do clube nas cinco partidas?',
          total - conceded,
          `${total} gols marcados − ${conceded} sofridos = ${total - conceded}.`,
          'Some cada coluna e subtraia os sofridos.',
        ],
        [
          'Leitura do placar',
          'Quantos gols o clube marcou na partida 3 da tabela?',
          c,
          `A terceira linha mostra ${c} gol(s) marcado(s).`,
          'Localize a partida 3 na tabela.',
        ],
      ],
      media: [
        [
          'Pontuação em cinco jogos',
          'Com 3 pontos por vitória e 1 por empate, quantos pontos o clube fez?',
          wins * 3 + draws,
          `Foram ${wins} vitória(s) e ${draws} empate(s): 3 × ${wins} + ${draws} = ${wins * 3 + draws}.`,
          'Compare os placares para contar vitórias e empates.',
        ],
        [
          'Gols de cada lado',
          'Qual foi a média de gols dos dois lados somados por partida?',
          (total + conceded) / 5,
          `(${total} + ${conceded}) ÷ 5 = ${((total + conceded) / 5).toLocaleString('pt-BR')}.`,
          'Some os gols marcados e sofridos antes de dividir por cinco.',
        ],
        [
          'Pontos deixados pelo caminho',
          'Quantos pontos faltaram para o clube atingir os 15 possíveis, considerando 3 por vitória e 1 por empate?',
          15 - (wins * 3 + draws),
          `15 − (3 × ${wins} + ${draws}) = ${15 - (wins * 3 + draws)}.`,
          'Calcule a pontuação real e compare com o máximo.',
        ],
      ],
      avancada: [
        [
          'Frequência de jogos com gol',
          'Em qual percentual das partidas o clube marcou pelo menos um gol? Responda em porcentagem.',
          withGoals * 20,
          `(${withGoals} ÷ 5) × 100 = ${withGoals * 20}%.`,
          'Conte os jogos em que a coluna de gols marcados é maior que zero.',
        ],
        [
          'Mediana de gols',
          'Qual é a mediana de gols marcados nas cinco partidas?',
          median,
          `Ao ordenar os cinco números, o terceiro é ${median}.`,
          'Ordene os gols marcados do menor para o maior.',
        ],
        [
          'Aproveitamento dos pontos',
          'Considerando 3 pontos por vitória e 1 por empate, qual foi o percentual de aproveitamento? Arredonde ao inteiro mais próximo.',
          Math.round(((wins * 3 + draws) / 15) * 100),
          `O clube fez ${wins * 3 + draws} de 15 pontos possíveis. Dividindo por 15, multiplicando por 100 e arredondando, obtemos ${Math.round(((wins * 3 + draws) / 15) * 100)}%.`,
          'Calcule os pontos conquistados e divida pelos possíveis.',
        ],
      ],
    };
    const [titulo, pergunta, answer, explicacao, hint] = exercises[trail][(index - 1) % 3];
    return formatQuestion(
      {
        ...base,
        titulo,
        pergunta,
        explicacao,
        dicas: [hint],
        contexto: 'Dados reais da API-Football',
        historia: `O quadro mostra cinco partidas finalizadas de ${club.name} na temporada ${season}.`,
        tabela: {
          headers: ['Jogo', 'Adversário', 'Gols marcados', 'Gols sofridos'],
          rows: games.map((game, i) => [
            String(i + 1),
            game.adversario,
            String(game.gols),
            String(game.golsAdversario),
          ]),
        },
      },
      index,
      answer,
    );
  } catch {
    return fallback();
  }
}
