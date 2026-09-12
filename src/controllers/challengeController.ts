import { Request, Response } from 'express';
import axios from 'axios';
import { db } from '../config/firebase';

export const gerarDesafio = async (req: Request, res: Response) => {
    try {
        //trazendo da API jogos do time ID 127 do ano de 2024
        const url = 'https://v3.football.api-sports.io/fixtures?team=127&season=2024';

        const response = await axios.get(url, {
            headers: {
                'x-apisports-key': process.env.API_FOOTBALL_KEY
            }
        });

        const partidas = response.data.response;

        if (!partidas || partidas.length === 0) {
            return res.status(400).json({ erro: "Nenhuma partida encontrada na API." });
        }

        //filtrando apenas o jogos full time
        const jogosFinalizados = partidas.filter((p: any) => p.fixture.status.short === 'FT');

        const ultimos5Jogos = jogosFinalizados.slice(-5);

        if (ultimos5Jogos.length === 0) {
            return res.status(400).json({ erro: "Nenhum jogo finalizado encontrado para calcular." });
        }

        let totalGols = 0;
        ultimos5Jogos.forEach((partida: any) => {
            console.log(partida.teams.home.name, "x", partida.teams.away.name);
            if (partida.teams.home.id === 127) totalGols += partida.goals.home;
            if (partida.teams.away.id === 127) totalGols += partida.goals.away;
        });

        const mediaGols = totalGols / 5;

        //salva no fire com os nome e tipo ja pre setado
        const docRef = await db.collection("challenges").add({
            time: "Flamengo FC",
            tipoDesafio: "media_de_gols",
            respostaCorreta: mediaGols,
            criadoEm: new Date()
        });

        res.json({
            idDesafio: docRef.id,
            pergunta: `O Flamengo marcou um total de ${totalGols} gols em seus últimos 5 jogos da temporada. Qual foi a média de gols por partida?`,
            dica: "Divida o total de gols pelo número de partidas."
        });

    } catch (error) {
        console.error("Erro na requisição:", error);
        res.status(500).json({ erro: "Erro interno no servidor ao gerar o desafio." });
    }
};

export const responderDesafio = async (
    req: Request<{ id: string }>,
    res: Response
) => {
    try {
        const { id } = req.params;
        const { resposta } = req.body;

        if (resposta === undefined || resposta === null || isNaN(Number(resposta))) {
            return res.status(400).json({ erro: "Envie um campo 'resposta' numérico no corpo da requisição." });
        }

        const docRef = db.collection('challenges').doc(id);
        const doc = await docRef.get();

        if (!doc.exists) {
            return res.status(404).json({ erro: "Desafio não encontrado." });
        }

        const desafio = doc.data();
        const respostaCorreta = desafio?.respostaCorreta;

        //margem de erro do usuario, podendo ser com o numero exato ou o dps da virgula
        const margemErro = 0.05;
        const acertou = Math.abs(Number(resposta) - respostaCorreta) <= margemErro;

        await docRef.update({
            respostaUsuario: Number(resposta),
            acertou,
            respondidoEm: new Date()
        });

        res.json({
            acertou,
            respostaCorreta,
            mensagem: acertou
                ? "Resposta correta!"
                : `Resposta incorreta. O valor certo era ${respostaCorreta}.`
        });

    } catch (error) {
        console.error("Erro ao validar resposta:", error);
        res.status(500).json({ erro: "Erro interno no servidor ao validar a resposta." });
    }
};