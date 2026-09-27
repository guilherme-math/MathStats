import type { TeamMatch } from './footballService';

export interface ChallengeDefinition {
  tipo: 'numeric' | 'multiple-choice' | 'true-false' | 'data-interpretation';
  tipoDesafio: string;
  categoria: string;
  dificuldade: string;
  titulo: string;
  contexto: string;
  historia: string;
  pergunta: string;
  dicas: string[];
  explicacao: string;
  respostaCorreta: string | number;
  xp: number;
  placeholder?: string;
  options?: string[];
  tabela?: { headers: string[]; rows: string[][] };
}

function shuffle<T>(values: T[]): T[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [values[index], values[other]] = [values[other], values[index]];
  }
  return values;
}

export function buildChallenge(jogos: TeamMatch[], indice: number): ChallengeDefinition {
  if (jogos.length !== 5 || !Number.isInteger(indice) || indice < 1 || indice > 5)
    throw new Error('A trilha exige cinco partidas e um índice entre 1 e 5.');
  const totalGols = jogos.reduce((total, jogo) => total + jogo.gols, 0);
  const mediaGols = Number((totalGols / jogos.length).toFixed(2));

  const jogosComGol = jogos.filter((jogo) => jogo.gols > 0).length;
  const porcentagemComGol = Math.round((jogosComGol / jogos.length) * 100);

  const jogosComDoisOuMais = jogos.filter((jogo) => jogo.gols >= 2).length;
  const maiorNumeroGols = Math.max(...jogos.map((jogo) => jogo.gols));

  let desafio: ChallengeDefinition;

  if (indice === 1) {
    desafio = {
      tipo: 'numeric',
      tipoDesafio: 'media_de_gols',
      categoria: 'Estatística',
      dificuldade: 'Fácil',
      titulo: 'Média de gols',
      contexto: 'Dados reais de futebol',
      historia: `Um analista está avaliando o desempenho ofensivo do Flamengo nos últimos 5 jogos. Nesse período, o time marcou ${totalGols} gols no total.`,
      pergunta: 'Qual foi a média de gols por partida?',
      dicas: [
        'Pense em como a média representa um valor distribuído igualmente entre todas as partidas.',
        `Divida o total de ${totalGols} gols pelas 5 partidas analisadas.`,
      ],
      explicacao: `A média é calculada dividindo ${totalGols} gols por 5 partidas. O resultado é ${mediaGols.toLocaleString('pt-BR')}.`,
      respostaCorreta: mediaGols,
      xp: 20,
      placeholder: 'Digite a média de gols',
    };
  } else if (indice === 2) {
    const alternativas = shuffle(
      [0, 20, 40, 60, 80, 100].filter((valor) => valor !== porcentagemComGol),
    ).slice(0, 3);

    alternativas.push(porcentagemComGol);
    shuffle(alternativas);

    desafio = {
      tipo: 'multiple-choice',
      tipoDesafio: 'porcentagem_jogos_com_gol',
      categoria: 'Porcentagem',
      dificuldade: 'Médio',
      titulo: 'Frequência de gols',
      contexto: 'Dados reais de futebol',
      historia: `Nos últimos 5 jogos analisados, o Flamengo marcou pelo menos um gol em ${jogosComGol} partidas. Um analista quer transformar essa frequência em porcentagem.`,
      pergunta: 'Em qual porcentagem dessas partidas o Flamengo marcou pelo menos um gol?',
      dicas: [
        'Pense em qual parte dos 5 jogos teve pelo menos um gol marcado pelo Flamengo.',
        `Divida ${jogosComGol} por 5 e multiplique o resultado por 100.`,
      ],
      explicacao: `${jogosComGol} de 5 partidas corresponde a ${porcentagemComGol}%.`,
      respostaCorreta: porcentagemComGol + '%',
      options: alternativas.map((valor) => valor + '%'),
      xp: 30,
    };
  } else if (indice === 3) {
    const respostaProporcao = jogosComDoisOuMais + '/5';
    const alternativas = shuffle(
      ['0/5', '1/5', '2/5', '3/5', '4/5', '5/5'].filter((valor) => valor !== respostaProporcao),
    ).slice(0, 3);

    alternativas.push(respostaProporcao);
    shuffle(alternativas);

    desafio = {
      tipo: 'multiple-choice',
      tipoDesafio: 'proporcao_jogos',
      categoria: 'Proporção',
      dificuldade: 'Médio',
      titulo: 'Proporção de partidas',
      contexto: 'Dados reais de futebol',
      historia: `O treinador observou que o Flamengo marcou dois ou mais gols em ${jogosComDoisOuMais} dos últimos 5 jogos analisados.`,
      pergunta: 'Qual proporção representa as partidas em que o time marcou dois ou mais gols?',
      dicas: [
        'Uma proporção pode representar quantas partidas atenderam à condição em relação ao total analisado.',
        `Coloque ${jogosComDoisOuMais} no numerador e 5 no denominador.`,
      ],
      explicacao: `Foram ${jogosComDoisOuMais} partidas com dois ou mais gols em um total de 5. Portanto, a proporção é ${respostaProporcao}.`,
      respostaCorreta: respostaProporcao,
      options: alternativas,
      xp: 30,
    };
  } else if (indice === 4) {
    const verdadeiro = mediaGols >= 1;

    const golsPorJogo = jogos.map((jogo) => jogo.gols).join(', ');

    desafio = {
      tipo: 'true-false',
      tipoDesafio: 'comparacao_media',
      categoria: 'Estatística',
      dificuldade: 'Fácil',
      titulo: 'Análise da média',
      contexto: 'Dados reais de futebol',
      historia: `Nos últimos 5 jogos analisados, o Flamengo marcou respectivamente ${golsPorJogo} gols, totalizando ${totalGols}. Um torcedor afirmou que a equipe teve média de pelo menos 1 gol por partida.`,
      pergunta: 'A afirmação do torcedor está correta?',
      dicas: [
        'Calcule primeiro a média de gols dos cinco jogos e depois compare o resultado com a afirmação do torcedor.',
        `Divida ${totalGols} gols pelas 5 partidas e verifique se o resultado é igual ou maior que 1.`,
      ],
      explicacao: `A média foi de ${mediaGols.toLocaleString('pt-BR')} gol por partida. Portanto, a afirmação é ${verdadeiro ? 'verdadeira' : 'falsa'}.`,
      respostaCorreta: verdadeiro ? 'Verdadeiro' : 'Falso',
      options: ['Verdadeiro', 'Falso'],
      xp: 20,
    };
  } else {
    const alternativas = Array.from(
      new Set([
        maiorNumeroGols,
        Math.max(0, maiorNumeroGols - 1),
        maiorNumeroGols + 1,
        maiorNumeroGols + 2,
      ]),
    );

    while (alternativas.length < 4) {
      alternativas.push(alternativas.length);
    }

    desafio = {
      tipo: 'data-interpretation',
      tipoDesafio: 'interpretacao_dados',
      categoria: 'Análise de dados',
      dificuldade: 'Médio',
      titulo: 'Leitura de resultados',
      contexto: 'Últimos 5 jogos',
      historia:
        'Um analista comparou o número de gols marcados pelo Flamengo em cada uma das últimas 5 partidas.',
      pergunta:
        'Observando a tabela, qual foi o maior número de gols marcados pelo Flamengo em uma única partida?',
      dicas: [
        'Observe os valores da coluna que mostra os gols marcados pelo Flamengo e compare-os.',
        'Procure o maior número presente na coluna de gols do Flamengo.',
      ],
      explicacao: `O maior número de gols marcado pelo Flamengo em uma dessas partidas foi ${maiorNumeroGols}.`,
      respostaCorreta: String(maiorNumeroGols),
      options: shuffle(alternativas.slice(0, 4)).map(String),
      tabela: {
        headers: ['Adversário', 'Gols do Flamengo', 'Gols do adversário'],
        rows: jogos.map((jogo) => [
          jogo.adversario,
          String(jogo.gols),
          String(jogo.golsAdversario),
        ]),
      },
      xp: 30,
    };
  }

  return desafio;
}
