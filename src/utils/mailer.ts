import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const appBaseUrl = (process.env.APP_BASE_URL || 'https://localhost:3443').replace(/\/$/, '');

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function emailLayout(content: string): string {
  return `
  <!doctype html>
  <html lang="pt-BR">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#ffffff;color:#171c19;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff;">
      <tr><td align="center" style="padding:44px 18px 30px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;">
          <tr><td align="center" style="padding:10px 0 50px;">
            <div style="font-size:30px;line-height:1;font-weight:800;letter-spacing:2px;color:#07110d;">MATH<span style="color:#00b982;">/</span>STATS</div>
            <div style="margin-top:8px;font-size:10px;letter-spacing:2px;color:#7c8782;">MATEMÁTICA E DADOS DE FUTEBOL</div>
          </td></tr>
          <tr><td>${content}</td></tr>
          <tr><td align="center" style="padding:52px 0 8px;color:#8a938f;font-size:12px;">© 2026 MATH/STATS</td></tr>
          <tr><td align="center" style="padding:8px 0 24px;font-size:12px;">
            <a href="${appBaseUrl}/politica-de-privacidade.html" style="color:#1f6fd1;text-decoration:none;margin:0 10px;">Política de Privacidade</a>
            <a href="${appBaseUrl}/termos-de-uso.html" style="color:#1f6fd1;text-decoration:none;margin:0 10px;">Termos de Uso</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
  </html>`;
}

function verificationEmail(username: string, code: string, purpose: 'login' | 'recovery'): string {
  const safeName = escapeHtml(username);
  const safeCode = escapeHtml(code.split('').join('  '));
  const isLogin = purpose === 'login';

  return emailLayout(`
    <div style="text-align:center;">
      <p style="margin:0 0 10px;font-size:15px;color:#5e6964;">Olá, <strong style="color:#171c19;">${safeName}</strong>.</p>
      <h1 style="margin:0 0 34px;font-size:24px;font-weight:700;color:#171c19;">${isLogin ? 'Seu código de verificação' : 'Código para redefinir sua senha'}</h1>
      <p style="margin:0 0 18px;font-size:14px;color:#4d5752;">${isLogin ? 'Use o código abaixo para concluir seu acesso ao MathStats:' : 'Use o código abaixo para continuar a recuperação da sua conta:'}</p>
      <div style="display:inline-block;margin:0 auto 22px;padding:18px 26px;border:1px solid #dfe6e2;background:#f7faf8;font-size:30px;line-height:1;font-weight:800;letter-spacing:5px;color:#07110d;">${safeCode}</div>
      <p style="margin:0;font-size:13px;line-height:1.7;color:#4d5752;">Este código só pode ser usado no fluxo atual e expira em <strong>15 minutos</strong>.</p>
      <p style="margin:34px 0 0;font-size:12px;line-height:1.7;color:#8a938f;">${isLogin ? 'Se você não tentou entrar no MathStats, ignore este e-mail e considere alterar sua senha.' : 'Se você não solicitou a recuperação de senha, ignore este e-mail. Sua senha atual permanece a mesma.'}</p>
    </div>`);
}

export async function sendWelcomeEmail(
  to: string,
  username: string,
  qrCodeDataUrl: string,
): Promise<void> {
  const base64Data = qrCodeDataUrl.replace(/^data:image\/png;base64,/, '');
  const safeName = escapeHtml(username);

  await transporter.sendMail({
    from: `"MATH/STATS" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Bem-vindo ao MathStats — configure seu 2FA',
    html: emailLayout(`
      <div style="text-align:center;">
        <h1 style="margin:0 0 16px;font-size:25px;color:#171c19;">Bem-vindo, ${safeName}!</h1>
        <p style="margin:0 auto 24px;max-width:500px;font-size:14px;line-height:1.7;color:#4d5752;">Sua conta foi criada. Para proteger seu acesso, adicione o MathStats ao seu aplicativo autenticador escaneando o QR Code abaixo.</p>
        <img src="cid:qrcode@mathstats" alt="QR Code para configurar o 2FA" style="display:block;width:210px;height:210px;margin:0 auto 22px;padding:10px;border:1px solid #dfe6e2;background:#ffffff;" />
        <p style="margin:0;font-size:12px;line-height:1.7;color:#8a938f;">Guarde o acesso ao seu autenticador em local seguro. O MathStats também oferece verificação por e-mail durante o login.</p>
      </div>`),
    attachments: [
      {
        filename: 'qrcode-2fa.png',
        content: base64Data,
        encoding: 'base64',
        cid: 'qrcode@mathstats',
        contentType: 'image/png',
      },
    ],
  });
}

export async function sendMfaCodeEmail(to: string, username: string, code: string): Promise<void> {
  await transporter.sendMail({
    from: `"MATH/STATS" <${process.env.GMAIL_USER}>`,
    to,
    subject: `${code} é seu código de verificação | MathStats`,
    html: verificationEmail(username, code, 'login'),
  });
}

export async function sendRecoveryCodeEmail(
  to: string,
  username: string,
  code: string,
): Promise<void> {
  await transporter.sendMail({
    from: `"MATH/STATS" <${process.env.GMAIL_USER}>`,
    to,
    subject: `${code} é seu código de recuperação | MathStats`,
    html: verificationEmail(username, code, 'recovery'),
  });
}

export async function sendPrivacyRequestNotification(
  username: string,
  email: string,
  type: string,
  detail: string,
  requestId: string,
): Promise<void> {
  const destination = process.env.PRIVACY_CONTACT_EMAIL || 'mathstats.app@gmail.com';
  const safeUsername = escapeHtml(username);
  const safeEmail = escapeHtml(email);
  const safeType = escapeHtml(type);
  const safeDetail = escapeHtml(detail || 'Sem descrição adicional.');
  const safeRequestId = escapeHtml(requestId);

  await transporter.sendMail({
    from: `"MATH/STATS" <${process.env.GMAIL_USER}>`,
    to: destination,
    subject: `Solicitação de privacidade | ${username}`,
    html: emailLayout(
      `<div style="text-align:left;"><h1 style="font-size:22px;">Solicitação de privacidade</h1><p><strong>Protocolo:</strong> ${safeRequestId}<br><strong>Usuário:</strong> ${safeUsername}<br><strong>E-mail cadastrado:</strong> ${safeEmail}<br><strong>Tipo:</strong> ${safeType}</p><p><strong>Descrição:</strong><br>${safeDetail}</p><p style="color:#6b746f;font-size:12px;">A solicitação também foi registrada na subcoleção privacyRequests do usuário no Firestore.</p></div>`,
    ),
  });
}
