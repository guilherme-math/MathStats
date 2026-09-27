import 'dotenv/config';
import express from 'express';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import selfsigned from 'selfsigned';
import { applySecurityMiddlewares } from './middlewares/security';
import { requirePageRole } from './middlewares/auth';
import authRoutes from './routes/authRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import lgpdRoutes from './routes/lgpdRoutes';
import challengeRoutes from './routes/challengeRoutes';

const app = express();
const HTTP_PORT = Number(process.env.HTTP_PORT || 3000);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 3443);

applySecurityMiddlewares(app);

app.use('/api', authRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', lgpdRoutes);
app.use('/api', challengeRoutes);

const publicPages: Record<string, string> = {
  '/login': 'login.html',
  '/register': 'register.html',
  '/recover': 'recover.html',
  '/mfa': 'mfa.html',
  '/politica-de-privacidade': 'politica-de-privacidade.html',
  '/termos-de-uso': 'termos-de-uso.html',
};

for (const [route, file] of Object.entries(publicPages)) {
  app.get(route, (_req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', file));
  });
}

app.get('/desafio', requirePageRole('aluno'), (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'protected', 'desafio.html'));
});

app.get(['/dashboard', '/dashboard.html'], requirePageRole('aluno'), (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'protected', 'dashboard.html'));
});

app.get(['/conta', '/conta.html'], requirePageRole('aluno'), (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'protected', 'conta.html'));
});

app.use(
  (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status =
      typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 503;
    if (status === 400 || status === 413)
      return res
        .status(status)
        .json({ error: 'O conteúdo enviado é inválido ou excede o limite permitido.' });
    console.error('[request] Falha ao processar requisição.');
    return res
      .status(503)
      .json({ error: 'Serviço temporariamente indisponível. Tente novamente.' });
  },
);

const httpRedirect = express();
httpRedirect.use((req, res) => {
  res.redirect(`https://${req.hostname}:${HTTPS_PORT}${req.originalUrl}`);
});

async function startServer() {
  try {
    let sslOptions;
    const keyPath = path.resolve(process.cwd(), 'key.pem');
    const certPath = path.resolve(process.cwd(), 'cert.pem');

    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      sslOptions = { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
    } else {
      console.log('[HTTPS] Gerando certificado SSL autoassinado para desenvolvimento...');
      console.warn(
        '[HTTPS] O navegador exibirá aviso de certificado até você gerar um certificado local confiável com mkcert.',
      );
      const pems = await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
        days: 365,
      } as any);
      fs.writeFileSync(keyPath, pems.private);
      fs.writeFileSync(certPath, pems.cert);
      sslOptions = { key: pems.private, cert: pems.cert };
    }

    https.createServer(sslOptions, app).listen(HTTPS_PORT, () => {
      console.log(`[HTTPS] MathStats: https://localhost:${HTTPS_PORT}`);
    });

    http.createServer(httpRedirect).listen(HTTP_PORT, () => {
      console.log(`[HTTP] Redirecionamento ativo: http://localhost:${HTTP_PORT} -> HTTPS`);
    });
  } catch (error) {
    console.error('Erro ao iniciar o servidor HTTPS:', error);
  }
}

if (require.main === module && !process.env.VERCEL) startServer();

export default app;
