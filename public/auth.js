(function () {
  'use strict';

  var el = function (id) {
    return document.getElementById(id);
  };
  var page = document.body.dataset.page || '';
  var EYE_OPEN =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.8"></circle></svg>';
  var EYE_CLOSED =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18"></path><path d="M10.6 6.2A10.6 10.6 0 0 1 12 6c6 0 9.5 6 9.5 6a16.2 16.2 0 0 1-2.1 2.8M6.3 6.5C3.8 8.1 2.5 12 2.5 12S6 18 12 18c1.6 0 3-.4 4.2-1"></path></svg>';

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('mathstats-theme', theme);
    } catch (error) {}
    var toggle = el('themeToggle');
    if (toggle)
      toggle.setAttribute(
        'aria-label',
        theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro',
      );
  }

  function initTheme() {
    var saved = 'dark';
    try {
      saved = localStorage.getItem('mathstats-theme') || 'dark';
    } catch (error) {}
    setTheme(saved === 'light' ? 'light' : 'dark');
    if (el('themeToggle'))
      el('themeToggle').addEventListener('click', function () {
        setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
      });
  }

  function setFeedback(id, text, success) {
    var target = el(id);
    if (!target) return;
    target.textContent = text || '';
    target.classList.toggle('success', Boolean(success));
  }

  function setLoading(button, loading) {
    if (!button) return;
    button.disabled = loading;
    button.classList.toggle('is-loading', loading);
  }

  function identityContentError(value, fieldLabel) {
    var embedded = [
      'arrombado',
      'babaca',
      'buceta',
      'caralho',
      'fdp',
      'filhodaputa',
      'imbecil',
      'nazista',
      'otario',
      'racista',
      'retardado',
      'vagabundo',
    ];
    var standalone = ['cu', 'merda', 'porra', 'puta', 'puto'];
    var normalized = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/0/g, 'o')
      .replace(/1/g, 'i')
      .replace(/3/g, 'e')
      .replace(/4/g, 'a')
      .replace(/5/g, 's')
      .replace(/7/g, 't');
    var collapse = function (text) {
      return text.replace(/([a-z])\1+/g, '$1');
    };
    var compact = collapse(normalized.replace(/[^a-z0-9]/g, ''));
    var tokens = normalized
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .map(collapse);
    var embeddedMatch = embedded.some(function (term) {
      return compact.indexOf(collapse(term)) !== -1;
    });
    var standaloneMatch = standalone.some(function (term) {
      return tokens.indexOf(collapse(term)) !== -1;
    });
    var separatedMatch = embedded.concat(standalone).some(function (term) {
      return new RegExp(term.split('').join('[^a-z0-9]+'), 'i').test(normalized);
    });
    return embeddedMatch || standaloneMatch || separatedMatch
      ? fieldLabel + ' não pode conter linguagem ofensiva.'
      : '';
  }

  function showRegistrationSuccess(qrCodeUrl) {
    var form = el('registerForm');
    var success = el('successBox');
    var image = el('qrCodeImg');
    if (image && qrCodeUrl) image.src = qrCodeUrl;
    if (form) form.hidden = true;
    if (success) success.hidden = false;
    setFeedback('signupFeedback', '');
    setFeedback('googleFeedback', '');
  }

  async function requestJson(url, options) {
    var response = await fetch(url, Object.assign({ credentials: 'include' }, options || {}));
    var data = await response.json().catch(function () {
      return {};
    });
    return { response: response, data: data };
  }

  function consumeEmailCode() {
    var params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    var code = params.get('email-code') || '';
    if (!/^\d{6}$/.test(code)) return '';
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return code;
  }

  function handleExpiredMfaSession(result) {
    var message = String(result.data.error || '').toLocaleLowerCase('pt-BR');
    var expired =
      (result.response.status === 401 || result.response.status === 403) &&
      message.indexOf('sessão expirada') !== -1;
    if (!expired) return false;
    setFeedback('mfaFeedback', 'Sua sessão expirou. Faça login novamente.');
    window.setTimeout(function () {
      window.location.href = '/login';
    }, 1800);
    return true;
  }

  function bindPasswordToggle(inputId, buttonId) {
    var input = el(inputId);
    var button = el(buttonId);
    if (!input || !button) return;
    button.innerHTML = EYE_OPEN;
    button.addEventListener('click', function () {
      var showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      button.innerHTML = showing ? EYE_OPEN : EYE_CLOSED;
      button.setAttribute('aria-label', showing ? 'Mostrar senha' : 'Ocultar senha');
    });
  }

  function passwordRequirements(password) {
    return {
      minimumLength: password.length >= 8 && password.length <= 128,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /\d/.test(password),
      specialCharacter: /[^A-Za-z0-9\s]/.test(password),
    };
  }

  function passwordPolicyError(password) {
    var requirements = passwordRequirements(password);
    var valid = Object.keys(requirements).every(function (key) {
      return requirements[key];
    });
    return valid
      ? ''
      : 'A senha deve ter pelo menos 8 caracteres, com letra maiúscula, letra minúscula, número e caractere especial.';
  }

  function renderPasswordStrength(input, container) {
    var password = input.value;
    if (!password) {
      container.hidden = true;
      container.className = 'password-strength';
      container.innerHTML = '';
      return;
    }

    container.hidden = false;
    var requirements = passwordRequirements(password);
    var score = Object.keys(requirements).filter(function (key) {
      return requirements[key];
    }).length;
    var state = score === 5 ? 'strong' : score >= 3 ? 'medium' : 'weak';
    var label =
      state === 'strong' ? 'Senha forte' : state === 'medium' ? 'Senha média' : 'Senha fraca';
    var missing = [];
    if (!requirements.minimumLength) missing.push('8 ou mais caracteres');
    if (!requirements.uppercase) missing.push('letra maiúscula');
    if (!requirements.lowercase) missing.push('letra minúscula');
    if (!requirements.number) missing.push('número');
    if (!requirements.specialCharacter) missing.push('caractere especial');

    container.className = 'password-strength is-' + state;
    container.innerHTML =
      '<span class="password-strength-track"><span class="password-strength-bar" style="width:' +
      score * 20 +
      '%"></span></span><strong>' +
      label +
      '</strong><small>' +
      (missing.length
        ? 'Falta: ' + missing.join(', ') + '.'
        : 'Todos os requisitos foram atendidos.') +
      '</small>';
  }

  function bindPasswordStrength(inputId, containerId) {
    var input = el(inputId);
    var container = el(containerId);
    if (!input || !container) return;
    var update = function () {
      renderPasswordStrength(input, container);
    };
    input.addEventListener('input', update);
    update();
  }

  async function redirectIfAuthenticated() {
    try {
      var result = await requestJson('/api/dashboard');
      if (result.response.ok) window.location.href = '/dashboard';
    } catch (error) {}
  }

  async function initGoogle() {
    var container = el('google-signin-btn');
    if (!container) return;

    try {
      var configResult = await requestJson('/api/config/public');
      var clientId = configResult.data.googleClientId;
      if (!clientId) {
        var googleSection = el('googleSection');
        if (googleSection) googleSection.hidden = true;
        return;
      }

      var attempts = 0;
      var timer = setInterval(function () {
        attempts += 1;
        if (window.google && window.google.accounts && window.google.accounts.id) {
          clearInterval(timer);
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleGoogleCredential,
            auto_select: false,
            cancel_on_tap_outside: true,
          });
          window.google.accounts.id.renderButton(container, {
            theme: document.documentElement.dataset.theme === 'dark' ? 'filled_black' : 'outline',
            size: 'large',
            width: Math.min(360, container.clientWidth || 360),
            text: page === 'register' ? 'signup_with' : 'signin_with',
            locale: 'pt-BR',
          });
        } else if (attempts >= 30) {
          clearInterval(timer);
          var section = el('googleSection');
          if (section) section.hidden = true;
        }
      }, 150);
    } catch (error) {
      var googleSection = el('googleSection');
      if (googleSection) googleSection.hidden = true;
    }
  }

  async function handleGoogleCredential(response) {
    var registerMode = page === 'register';
    var displayName =
      registerMode && el('signupDisplayName') ? el('signupDisplayName').value.trim() : '';
    var username = registerMode && el('signupUser') ? el('signupUser').value.trim() : '';
    var accepted = registerMode && el('lgpdCheck') ? el('lgpdCheck').checked : false;

    if (registerMode && !displayName) {
      setFeedback('googleFeedback', 'Informe seu nome de exibição antes de continuar com Google.');
      return;
    }
    if (registerMode && !username) {
      setFeedback('googleFeedback', 'Escolha um nome de usuário antes de continuar com Google.');
      return;
    }
    if (registerMode) {
      var googleContentError =
        identityContentError(displayName, 'O nome de exibição') ||
        identityContentError(username, 'O nome de usuário');
      if (googleContentError) {
        setFeedback('googleFeedback', googleContentError);
        return;
      }
    }
    if (registerMode && !accepted) {
      setFeedback(
        'googleFeedback',
        'Aceite os Termos de Uso e a Política de Privacidade antes de continuar com Google.',
      );
      return;
    }

    setFeedback(
      'googleFeedback',
      registerMode ? 'Criando acesso com Google...' : 'Autenticando com Google...',
    );
    try {
      var result = await requestJson('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential: response.credential,
          mode: registerMode ? 'register' : 'login',
          displayName: displayName,
          username: username,
          lgpdAccepted: accepted,
        }),
      });

      if (result.response.ok && result.data.authenticated) {
        window.location.href = '/dashboard';
        return;
      }

      if (result.data.requiresRegistration) {
        setFeedback(
          'googleFeedback',
          'Esta conta Google ainda não está cadastrada. Use CRIAR CONTA para fazer o primeiro acesso.',
        );
      } else {
        setFeedback(
          'googleFeedback',
          result.data.error || 'Não foi possível concluir a autenticação com Google.',
        );
      }
    } catch (error) {
      setFeedback('googleFeedback', 'Não foi possível conectar ao servidor.');
    }
  }

  function initLogin() {
    bindPasswordToggle('loginPass', 'loginPassToggle');
    var form = el('loginForm');
    if (!form) return;

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      var identifier = el('loginIdentifier').value.trim();
      var password = el('loginPass').value;
      var button = el('loginBtn');

      if (!identifier || !password) {
        setFeedback('loginFeedback', 'Preencha o usuário/e-mail e a senha.');
        return;
      }
      setFeedback('loginFeedback', '');
      setLoading(button, true);

      var payload = identifier.includes('@')
        ? { email: identifier.toLowerCase(), password: password }
        : { username: identifier, password: password };
      try {
        var result = await requestJson('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (result.response.ok && result.data.authenticated) window.location.href = '/dashboard';
        else if (result.response.ok && result.data.require2FA) window.location.href = '/mfa';
        else
          setFeedback(
            'loginFeedback',
            result.data.error || result.data.message || 'Não foi possível entrar.',
          );
      } catch (error) {
        setFeedback('loginFeedback', 'Não foi possível conectar ao servidor.');
      } finally {
        setLoading(button, false);
      }
    });

    initGoogle();
    redirectIfAuthenticated();
  }

  function initRegister() {
    bindPasswordToggle('signupPass', 'signupPassToggle');
    bindPasswordToggle('signupConfirm', 'signupConfirmToggle');
    bindPasswordStrength('signupPass', 'signupPasswordStrength');
    var form = el('registerForm');
    if (!form) return;

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      var displayName = el('signupDisplayName').value.trim();
      var username = el('signupUser').value.trim();
      var email = el('signupEmail').value.trim().toLowerCase();
      var password = el('signupPass').value;
      var confirm = el('signupConfirm').value;
      var accepted = el('lgpdCheck').checked;
      var button = el('signupBtn');

      if (!displayName || !username || !email || !password || !confirm) {
        setFeedback(
          'signupFeedback',
          'Preencha nome de exibição, usuário, e-mail e as duas senhas.',
        );
        return;
      }
      if (displayName.length < 2 || displayName.length > 60) {
        setFeedback('signupFeedback', 'O nome de exibição deve ter entre 2 e 60 caracteres.');
        return;
      }
      if (!/^[A-Za-z0-9._-]{3,24}$/.test(username)) {
        setFeedback(
          'signupFeedback',
          'O usuário deve ter de 3 a 24 caracteres e usar apenas letras, números, ponto, hífen ou underline.',
        );
        return;
      }
      var contentError =
        identityContentError(displayName, 'O nome de exibição') ||
        identityContentError(username, 'O nome de usuário');
      if (contentError) {
        setFeedback('signupFeedback', contentError);
        return;
      }
      var passwordError = passwordPolicyError(password);
      if (passwordError) {
        setFeedback('signupFeedback', passwordError);
        return;
      }
      if (password !== confirm) {
        setFeedback('signupFeedback', 'As senhas não coincidem.');
        return;
      }
      if (!accepted) {
        setFeedback(
          'signupFeedback',
          'Aceite os Termos de Uso e a Política de Privacidade para continuar.',
        );
        return;
      }

      setFeedback('signupFeedback', '');
      setLoading(button, true);

      try {
        var result = await requestJson('/api/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            displayName: displayName,
            username: username,
            email: email,
            password: password,
            lgpdAccepted: true,
          }),
        });

        if (result.response.ok && result.data.qrCodeUrl)
          showRegistrationSuccess(result.data.qrCodeUrl);
        else setFeedback('signupFeedback', result.data.error || 'Não foi possível criar a conta.');
      } catch (error) {
        setFeedback('signupFeedback', 'Não foi possível conectar ao servidor.');
      } finally {
        setLoading(button, false);
      }
    });

    initGoogle();
    redirectIfAuthenticated();
  }

  function setMfaMethod(method) {
    var appPanel = el('panelApp');
    var emailPanel = el('panelEmail');
    el('btnApp').classList.toggle('is-active', method === 'app');
    el('btnEmail').classList.toggle('is-active', method === 'email');
    appPanel.hidden = method !== 'app';
    emailPanel.hidden = method !== 'email';
    setFeedback('mfaFeedback', '');
  }

  function initMfa() {
    el('btnApp').addEventListener('click', function () {
      setMfaMethod('app');
    });
    el('btnEmail').addEventListener('click', function () {
      setMfaMethod('email');
    });
    setMfaMethod('app');

    var linkedCode = consumeEmailCode();
    if (linkedCode) {
      setMfaMethod('email');
      el('emailStep1').hidden = true;
      el('emailStep2').hidden = false;
      el('mfaEmailCode').value = linkedCode;
      setFeedback('mfaFeedback', 'Código preenchido. Confirme para concluir o acesso.', true);
    }

    el('mfaAppForm').addEventListener('submit', async function (event) {
      event.preventDefault();
      var code = el('mfaCode').value.trim();
      var button = el('mfaAppBtn');
      if (!/^\d{6}$/.test(code)) {
        setFeedback('mfaFeedback', 'Digite um código de 6 dígitos.');
        return;
      }
      setLoading(button, true);
      try {
        var result = await requestJson('/api/verify-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: code,
            rememberDevice: el('rememberDevice').checked,
          }),
        });
        if (result.response.ok) window.location.href = '/dashboard';
        else if (!handleExpiredMfaSession(result))
          setFeedback('mfaFeedback', result.data.error || 'Código inválido.');
      } catch (error) {
        setFeedback('mfaFeedback', 'Não foi possível conectar ao servidor.');
      } finally {
        setLoading(button, false);
      }
    });

    el('sendEmailCodeBtn').addEventListener('click', async function () {
      var button = el('sendEmailCodeBtn');
      setLoading(button, true);
      try {
        var result = await requestJson('/api/send-mfa-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (result.response.ok) {
          el('emailStep1').hidden = true;
          el('emailStep2').hidden = false;
          setFeedback('mfaFeedback', result.data.message || 'Código enviado.', true);
        } else if (!handleExpiredMfaSession(result))
          setFeedback('mfaFeedback', result.data.error || 'Não foi possível enviar o código.');
      } catch (error) {
        setFeedback('mfaFeedback', 'Não foi possível conectar ao servidor.');
      } finally {
        setLoading(button, false);
      }
    });

    el('mfaEmailForm').addEventListener('submit', async function (event) {
      event.preventDefault();
      var code = el('mfaEmailCode').value.trim();
      var button = el('mfaEmailBtn');
      if (!/^\d{6}$/.test(code)) {
        setFeedback('mfaFeedback', 'Digite um código de 6 dígitos.');
        return;
      }
      setLoading(button, true);
      try {
        var result = await requestJson('/api/verify-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: code,
            method: 'email',
            rememberDevice: el('rememberDevice').checked,
          }),
        });
        if (result.response.ok) window.location.href = '/dashboard';
        else if (!handleExpiredMfaSession(result))
          setFeedback('mfaFeedback', result.data.error || 'Código inválido.');
      } catch (error) {
        setFeedback('mfaFeedback', 'Não foi possível conectar ao servidor.');
      } finally {
        setLoading(button, false);
      }
    });
  }

  function updateRecoveryStep(step) {
    [1, 2, 3].forEach(function (value) {
      var panel = el('recoverStep' + value);
      var marker = el('stepMarker' + value);
      if (panel) panel.hidden = value !== step;
      if (marker) marker.classList.toggle('is-active', value === step);
    });
  }

  function initRecover() {
    updateRecoveryStep(1);

    var linkedCode = consumeEmailCode();
    if (linkedCode) {
      updateRecoveryStep(2);
      el('recoverCode').value = linkedCode;
      setFeedback('recoverFeedback2', 'Código preenchido. Confirme para continuar.', true);
    }

    el('recoverForm1').addEventListener('submit', async function (event) {
      event.preventDefault();
      var username = el('recoverUser').value.trim();
      var button = el('recoverBtn1');
      if (!username) {
        setFeedback('recoverFeedback1', 'Informe seu nome de usuário.');
        return;
      }
      setLoading(button, true);
      try {
        var result = await requestJson('/api/recover/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username }),
        });
        if (result.response.ok) {
          updateRecoveryStep(2);
          setFeedback('recoverFeedback2', result.data.message || 'Código enviado.', true);
        } else
          setFeedback(
            'recoverFeedback1',
            result.data.error || 'Não foi possível iniciar a recuperação.',
          );
      } catch (error) {
        setFeedback('recoverFeedback1', 'Não foi possível conectar ao servidor.');
      } finally {
        setLoading(button, false);
      }
    });

    el('recoverForm2').addEventListener('submit', async function (event) {
      event.preventDefault();
      var code = el('recoverCode').value.trim();
      var button = el('recoverBtn2');
      if (!/^\d{6}$/.test(code)) {
        setFeedback('recoverFeedback2', 'Digite um código de 6 dígitos.');
        return;
      }
      setLoading(button, true);
      try {
        var result = await requestJson('/api/recover/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: code }),
        });
        if (result.response.ok) {
          updateRecoveryStep(3);
          setFeedback('recoverFeedback3', 'Identidade confirmada. Defina sua nova senha.', true);
        } else setFeedback('recoverFeedback2', result.data.error || 'Código inválido ou expirado.');
      } catch (error) {
        setFeedback('recoverFeedback2', 'Não foi possível conectar ao servidor.');
      } finally {
        setLoading(button, false);
      }
    });

    bindPasswordToggle('newPassword', 'newPasswordToggle');
    bindPasswordToggle('confirmPassword', 'confirmPasswordToggle');
    bindPasswordStrength('newPassword', 'recoverPasswordStrength');
    el('recoverForm3').addEventListener('submit', async function (event) {
      event.preventDefault();
      var password = el('newPassword').value;
      var confirm = el('confirmPassword').value;
      var button = el('recoverBtn3');
      var passwordError = passwordPolicyError(password);
      if (passwordError) {
        setFeedback('recoverFeedback3', passwordError);
        return;
      }
      if (password !== confirm) {
        setFeedback('recoverFeedback3', 'As senhas não coincidem.');
        return;
      }
      setLoading(button, true);
      try {
        var result = await requestJson('/api/recover/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: password }),
        });
        if (result.response.ok) {
          el('recoveryForms').hidden = true;
          el('recoverSuccess').hidden = false;
        } else
          setFeedback(
            'recoverFeedback3',
            result.data.error || 'Não foi possível redefinir a senha.',
          );
      } catch (error) {
        setFeedback('recoverFeedback3', 'Não foi possível conectar ao servidor.');
      } finally {
        setLoading(button, false);
      }
    });
  }

  async function logout() {
    try {
      await requestJson('/api/logout', { method: 'POST' });
    } catch (error) {}
    window.location.href = '/login';
  }

  function renderLogs(logs) {
    var container = el('logsContent');
    container.replaceChildren();
    if (!logs.length) {
      var empty = document.createElement('div');
      empty.className = 'log-row';
      empty.textContent = 'Nenhum log encontrado.';
      container.appendChild(empty);
      return;
    }

    logs.forEach(function (log) {
      var row = document.createElement('div');
      row.className = 'log-row';
      var event = document.createElement('strong');
      event.textContent = log.event || 'EVENTO';
      var date = document.createElement('span');
      date.textContent = log.createdAt ? new Date(log.createdAt).toLocaleString('pt-BR') : '-';
      var detail = document.createElement('span');
      detail.textContent = log.detail || '-';
      row.append(event, date, detail);
      container.appendChild(row);
    });
  }

  function renderPrivacyRequests(requests) {
    var container = el('privacyRequestsContent');
    if (!container) return;
    container.replaceChildren();
    if (!requests.length) {
      var empty = document.createElement('div');
      empty.className = 'log-row';
      empty.textContent = 'Nenhuma solicitação registrada.';
      container.appendChild(empty);
      return;
    }
    var statusLabels = {
      received: 'Recebida',
      in_review: 'Em análise',
      completed: 'Concluída',
      rejected: 'Não atendida',
    };
    requests.forEach(function (request) {
      var row = document.createElement('div');
      row.className = 'log-row';
      var title = document.createElement('strong');
      title.textContent =
        (request.type === 'oposicao' ? 'Oposição' : 'Bloqueio ou anonimização') +
        ' · ' +
        (statusLabels[request.status] || request.status);
      var protocol = document.createElement('span');
      protocol.textContent = 'Protocolo: ' + request.id;
      var date = document.createElement('span');
      date.textContent = request.requestedAt
        ? new Date(request.requestedAt).toLocaleString('pt-BR')
        : '-';
      var detail = document.createElement('span');
      detail.textContent = request.detail || 'Sem descrição adicional.';
      row.append(title, protocol, date, detail);
      container.appendChild(row);
    });
  }

  function renderChallengeHistory(items) {
    var container = el('challengeHistory');
    if (!container) return;
    container.replaceChildren();

    if (!items || !items.length) {
      var empty = document.createElement('div');
      empty.className = 'dashboard-empty';
      empty.textContent =
        'Nenhum desafio respondido ainda. Comece a trilha para gerar seu histórico.';
      container.appendChild(empty);
      return;
    }

    items.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'challenge-row';

      var status = document.createElement('span');
      status.className = 'challenge-status ' + (item.acertou ? 'is-correct' : 'is-wrong');
      status.textContent = item.acertou ? '✓' : '×';
      status.setAttribute('aria-label', item.acertou ? 'Resposta correta' : 'Resposta incorreta');

      var main = document.createElement('div');
      main.className = 'challenge-main';
      var title = document.createElement('strong');
      title.textContent = item.titulo || item.tipoDesafio || 'Desafio';
      var detail = document.createElement('span');
      detail.textContent =
        (item.tipoDesafio || 'Exercício') + (item.usouDica ? ' • dica usada' : ' • sem dica');
      main.append(title, detail);

      var category = document.createElement('span');
      category.className = 'challenge-meta challenge-category';
      category.textContent = item.categoria || 'Matemática';

      var difficulty = document.createElement('span');
      difficulty.className = 'challenge-meta challenge-difficulty';
      difficulty.textContent = item.dificuldade || '-';

      var date = document.createElement('span');
      date.className = 'challenge-meta challenge-date';
      date.textContent = item.respondidoEm
        ? new Date(item.respondidoEm).toLocaleDateString('pt-BR')
        : '-';

      var xp = document.createElement('strong');
      xp.className = 'challenge-xp';
      xp.textContent = '+' + (Number(item.xpGanho) || 0) + ' XP';

      row.append(status, main, category, difficulty, date, xp);
      container.appendChild(row);
    });
  }

  function renderActivityChart(items) {
    var container = el('activityChart');
    if (!container) return;
    container.replaceChildren();
    items = Array.isArray(items) ? items : [];
    var max = Math.max.apply(
      null,
      items
        .map(function (item) {
          return Number(item.answered) || 0;
        })
        .concat([1]),
    );

    items.forEach(function (item) {
      var day = document.createElement('div');
      day.className = 'activity-day';

      var value = document.createElement('span');
      value.className = 'activity-value';
      value.textContent = String(Number(item.answered) || 0);

      var track = document.createElement('div');
      track.className = 'activity-bar-track';
      track.title =
        (Number(item.answered) || 0) +
        ' desafio(s), ' +
        (Number(item.correct) || 0) +
        ' acerto(s), ' +
        (Number(item.xp) || 0) +
        ' XP';

      var bar = document.createElement('div');
      bar.className = 'activity-bar';
      var valueNumber = Number(item.answered) || 0;
      bar.style.height =
        valueNumber === 0 ? '3px' : Math.max(12, Math.round((valueNumber / max) * 100)) + '%';
      track.appendChild(bar);

      var label = document.createElement('div');
      label.className = 'activity-label';
      var weekday = document.createElement('strong');
      weekday.textContent = item.weekday || '-';
      var date = document.createElement('span');
      date.textContent = item.day || '-';
      label.append(weekday, date);

      day.append(value, track, label);
      container.appendChild(day);
    });
  }

  function renderCategoryPerformance(items) {
    var container = el('categoryPerformance');
    if (!container) return;
    container.replaceChildren();
    items = Array.isArray(items) ? items : [];

    if (!items.length) {
      var empty = document.createElement('div');
      empty.className = 'dashboard-empty';
      empty.textContent = 'As categorias aparecerão aqui depois que você responder desafios.';
      container.appendChild(empty);
      return;
    }

    items.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'category-row';

      var name = document.createElement('div');
      name.className = 'category-name';
      var title = document.createElement('strong');
      title.textContent = item.name || 'Matemática';
      var detail = document.createElement('span');
      detail.textContent =
        (Number(item.answered) || 0) +
        ' desafio(s) • ' +
        (Number(item.correct) || 0) +
        ' acerto(s)';
      name.append(title, detail);

      var track = document.createElement('div');
      track.className = 'category-track';
      var fill = document.createElement('div');
      fill.className = 'category-fill';
      fill.style.width = Math.max(0, Math.min(100, Number(item.accuracy) || 0)) + '%';
      track.appendChild(fill);

      var accuracy = document.createElement('div');
      accuracy.className = 'category-stat';
      accuracy.innerHTML =
        '<strong>' + (Number(item.accuracy) || 0) + '%</strong><span>acertos</span>';

      var xp = document.createElement('div');
      xp.className = 'category-stat category-xp';
      xp.innerHTML = '<strong>' + (Number(item.xp) || 0) + '</strong><span>XP</span>';

      row.append(name, track, accuracy, xp);
      container.appendChild(row);
    });
  }

  function renderDashboardData(user, dashboard) {
    dashboard = dashboard || {};
    var name = user.displayName || user.username || 'estudante';
    var firstName = name.split(/\s+/)[0];
    var answered = Number(user.challengesAnswered) || 0;
    var correct = Number(user.challengesCorrect) || 0;
    var incorrect = Number(user.challengesIncorrect) || Math.max(answered - correct, 0);
    var accuracy = Number(user.accuracy) || 0;
    var streak = Number(user.streak) || 0;
    var xp = Number(user.xpTotal) || 0;
    var attemptsWeek = Number(dashboard.attemptsLast7Days) || 0;
    var weekAccuracy = Number(dashboard.accuracyLast7Days) || 0;
    var weekXp = Number(dashboard.xpLast7Days) || 0;

    if (el('dashboardName')) el('dashboardName').textContent = firstName;
    if (el('dashboardGreeting'))
      el('dashboardGreeting').textContent = answered > 0 ? 'Olá,' : 'Bem-vindo,';
    if (el('dashboardSubtitle')) {
      el('dashboardSubtitle').textContent =
        answered > 0
          ? 'Seu progresso está sendo calculado com seus dados reais de desafios. Continue a trilha para aumentar XP, ofensiva e aproveitamento.'
          : 'Faça sua primeira atividade e comece a construir seu histórico de aprendizagem.';
    }
    if (el('firstJourney')) el('firstJourney').hidden = answered > 0;
    if (el('dashboardProgress')) el('dashboardProgress').hidden = answered === 0;
    if (el('openChallengeBtn'))
      el('openChallengeBtn').textContent = answered > 0 ? 'CONTINUAR TRILHA' : 'COMEÇAR ATIVIDADE';

    if (el('metricXp')) el('metricXp').textContent = xp.toLocaleString('pt-BR');
    if (el('metricStreak')) el('metricStreak').textContent = '🔥 ' + streak;
    if (el('metricStreakText'))
      el('metricStreakText').textContent = streak === 1 ? 'dia consecutivo' : 'dias consecutivos';
    if (el('metricChallenges')) el('metricChallenges').textContent = String(answered);
    if (el('metricCorrectText'))
      el('metricCorrectText').textContent = correct + (correct === 1 ? ' acerto' : ' acertos');
    if (el('metricAccuracy')) el('metricAccuracy').textContent = accuracy + '%';

    if (el('accuracyRing'))
      el('accuracyRing').style.setProperty(
        '--accuracy',
        String(Math.max(0, Math.min(100, accuracy))),
      );
    if (el('ringAccuracy')) el('ringAccuracy').textContent = accuracy + '%';
    if (el('performanceBadge'))
      el('performanceBadge').textContent = answered + (answered === 1 ? ' desafio' : ' desafios');
    if (el('performanceCorrect')) el('performanceCorrect').textContent = String(correct);
    if (el('performanceIncorrect')) el('performanceIncorrect').textContent = String(incorrect);
    if (el('performanceWeek')) el('performanceWeek').textContent = weekAccuracy + '%';
    if (el('performanceWeekXp'))
      el('performanceWeekXp').textContent = weekXp.toLocaleString('pt-BR') + ' XP';
    if (el('activityBadge'))
      el('activityBadge').textContent =
        attemptsWeek + (attemptsWeek === 1 ? ' resposta' : ' respostas');
    if (el('activitySummary'))
      el('activitySummary').textContent = weekXp.toLocaleString('pt-BR') + ' XP no período';
    if (el('categoryBadge'))
      el('categoryBadge').textContent =
        (Number(dashboard.historyAnalyzed) || 0) + ' atividades analisadas';

    renderActivityChart(dashboard.activity7Days || []);
    renderCategoryPerformance(dashboard.categoryPerformance || []);
    renderChallengeHistory(user.recentChallenges || []);
  }

  async function initDashboard() {
    try {
      var session = await requestJson('/api/dashboard');
      if (!session.response.ok) {
        window.location.href = '/login';
        return;
      }
      renderDashboardData(session.data.user, session.data.dashboard || {});
    } catch (error) {
      window.location.href = '/login';
      return;
    }

    ['openChallengeBtn', 'startFirstTrailBtn'].forEach(function (buttonId) {
      if (el(buttonId))
        el(buttonId).addEventListener('click', function () {
          window.location.href = '/desafio';
        });
    });
  }

  async function initAccount() {
    var currentUser;
    try {
      var session = await requestJson('/api/dashboard');
      if (!session.response.ok) {
        window.location.href = '/login';
        return;
      }
      currentUser = session.data.user;

      if (el('profileName'))
        el('profileName').textContent = currentUser.displayName || currentUser.username;
      if (el('profileDisplayName'))
        el('profileDisplayName').value = currentUser.displayName || currentUser.username;
      if (el('profileUser')) el('profileUser').textContent = '@' + currentUser.username;
      if (el('profileEmail')) el('profileEmail').textContent = currentUser.email;
      if (el('profileXp'))
        el('profileXp').textContent =
          (Number(currentUser.xpTotal) || 0).toLocaleString('pt-BR') + ' XP';
      if (el('profileStreak')) {
        var streak = Number(currentUser.streak) || 0;
        el('profileStreak').textContent = '🔥 ' + streak + (streak === 1 ? ' dia' : ' dias');
      }
      if (el('profileGoogle'))
        el('profileGoogle').textContent = currentUser.googleLinked ? 'Vinculado' : 'Não vinculado';
      if (el('profilePassword'))
        el('profilePassword').textContent = currentUser.hasPassword
          ? 'Configurada'
          : 'Ainda não criada';

      bindPasswordToggle('accountCurrentPassword', 'accountCurrentPasswordToggle');
      bindPasswordToggle('accountNewPassword', 'accountNewPasswordToggle');
      bindPasswordToggle('accountConfirmPassword', 'accountConfirmPasswordToggle');
      bindPasswordStrength('accountNewPassword', 'accountPasswordStrength');

      if (currentUser.hasPassword) {
        if (el('accountCurrentPasswordField')) el('accountCurrentPasswordField').hidden = false;
        if (el('accountPasswordTitle')) el('accountPasswordTitle').textContent = 'Alterar senha';
        if (el('accountPasswordDescription'))
          el('accountPasswordDescription').textContent =
            'Confirme sua senha atual e escolha uma nova senha para proteger sua conta.';
        if (el('accountPasswordBtn')) el('accountPasswordBtn').textContent = 'ALTERAR SENHA';
      } else {
        if (el('accountPasswordTitle')) el('accountPasswordTitle').textContent = 'Criar senha';
        if (el('accountPasswordBtn')) el('accountPasswordBtn').textContent = 'CRIAR SENHA';
      }
    } catch (error) {
      window.location.href = '/login';
      return;
    }

    if (el('passwordSetupForm')) {
      el('passwordSetupForm').addEventListener('submit', async function (event) {
        event.preventDefault();
        var currentPassword = el('accountCurrentPassword').value;
        var password = el('accountNewPassword').value;
        var confirm = el('accountConfirmPassword').value;
        var button = el('accountPasswordBtn');

        if (currentUser.hasPassword && !currentPassword) {
          setFeedback('accountPasswordFeedback', 'Digite sua senha atual.');
          return;
        }
        var passwordError = passwordPolicyError(password);
        if (passwordError) {
          setFeedback('accountPasswordFeedback', passwordError);
          return;
        }
        if (password !== confirm) {
          setFeedback('accountPasswordFeedback', 'As senhas não coincidem.');
          return;
        }

        setLoading(button, true);
        try {
          var result = await requestJson('/api/account/password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword: currentPassword, password: password }),
          });
          if (result.response.ok) {
            setFeedback('accountPasswordFeedback', result.data.message || 'Senha salva.', true);
            if (el('profilePassword')) el('profilePassword').textContent = 'Configurada';
            currentUser.hasPassword = true;
            el('accountCurrentPassword').value = '';
            el('accountNewPassword').value = '';
            el('accountConfirmPassword').value = '';
            el('accountCurrentPasswordField').hidden = false;
            el('accountPasswordTitle').textContent = 'Alterar senha';
            el('accountPasswordDescription').textContent =
              'Confirme sua senha atual e escolha uma nova senha para proteger sua conta.';
            el('accountPasswordBtn').textContent = 'ALTERAR SENHA';
            renderPasswordStrength(el('accountNewPassword'), el('accountPasswordStrength'));
          } else
            setFeedback(
              'accountPasswordFeedback',
              result.data.error || 'Não foi possível criar a senha.',
            );
        } catch (error) {
          setFeedback('accountPasswordFeedback', 'Não foi possível conectar ao servidor.');
        } finally {
          setLoading(button, false);
        }
      });
    }

    if (el('logoutBtn')) el('logoutBtn').addEventListener('click', logout);

    if (el('profileCorrectionForm'))
      el('profileCorrectionForm').addEventListener('submit', async function (event) {
        event.preventDefault();
        var displayName = el('profileDisplayName').value.trim();
        if (displayName.length < 2 || displayName.length > 60) {
          setFeedback('profileCorrectionFeedback', 'Informe um nome entre 2 e 60 caracteres.');
          return;
        }
        var contentError = identityContentError(displayName, 'O nome de exibição');
        if (contentError) {
          setFeedback('profileCorrectionFeedback', contentError);
          return;
        }
        var button = el('profileCorrectionBtn');
        setLoading(button, true);
        try {
          var result = await requestJson('/api/lgpd/profile', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ displayName: displayName }),
          });
          if (!result.response.ok) {
            setFeedback(
              'profileCorrectionFeedback',
              result.data.error || 'Não foi possível atualizar o nome.',
            );
            return;
          }
          if (el('profileName')) el('profileName').textContent = result.data.displayName;
          setFeedback(
            'profileCorrectionFeedback',
            result.data.message || 'Nome de exibição atualizado.',
            true,
          );
        } catch (error) {
          setFeedback('profileCorrectionFeedback', 'Não foi possível conectar ao servidor.');
        } finally {
          setLoading(button, false);
        }
      });

    if (el('dataBtn'))
      el('dataBtn').addEventListener('click', async function () {
        setFeedback('accountFeedback', 'Carregando dados...');
        try {
          var result = await requestJson('/api/lgpd/data');
          if (!result.response.ok) {
            setFeedback(
              'accountFeedback',
              result.data.error || 'Não foi possível consultar os dados.',
            );
            return;
          }
          el('dataOutput').textContent = JSON.stringify(result.data, null, 2);
          el('dataOutputWrap').hidden = false;
          setFeedback('accountFeedback', '');
        } catch (error) {
          setFeedback('accountFeedback', 'Não foi possível conectar ao servidor.');
        }
      });

    if (el('logsBtn'))
      el('logsBtn').addEventListener('click', async function () {
        setFeedback('accountFeedback', 'Carregando auditoria...');
        try {
          var result = await requestJson('/api/lgpd/audit-logs');
          if (!result.response.ok) {
            setFeedback(
              'accountFeedback',
              result.data.error || 'Não foi possível consultar os logs.',
            );
            return;
          }
          renderLogs(result.data.logs || []);
          el('logsWrap').hidden = false;
          setFeedback('accountFeedback', '');
        } catch (error) {
          setFeedback('accountFeedback', 'Não foi possível conectar ao servidor.');
        }
      });

    if (el('privacyRequestsBtn'))
      el('privacyRequestsBtn').addEventListener('click', async function () {
        setFeedback('accountFeedback', 'Carregando solicitações...');
        try {
          var result = await requestJson('/api/lgpd/requests');
          if (!result.response.ok) {
            setFeedback(
              'accountFeedback',
              result.data.error || 'Não foi possível consultar as solicitações.',
            );
            return;
          }
          renderPrivacyRequests(result.data.requests || []);
          el('privacyRequestsWrap').hidden = false;
          setFeedback('accountFeedback', '');
        } catch (error) {
          setFeedback('accountFeedback', 'Não foi possível conectar ao servidor.');
        }
      });

    if (el('exportBtn'))
      el('exportBtn').addEventListener('click', function () {
        window.location.href = '/api/lgpd/export';
      });

    if (el('rightsRequestBtn'))
      el('rightsRequestBtn').addEventListener('click', async function () {
        var choice = window.prompt(
          'Digite 1 para bloqueio/anonimização ou 2 para oposição ao tratamento:',
          '',
        );
        if (choice !== '1' && choice !== '2') return;
        var type = choice === '1' ? 'bloqueio-ou-anonimizacao' : 'oposicao';
        var detail = window.prompt('Explique brevemente sua solicitação (opcional):', '') || '';
        var result = await requestJson('/api/lgpd/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: type, detail: detail }),
        });
        if (result.response.ok) {
          setFeedback(
            'accountFeedback',
            result.data.message + ' Protocolo: ' + result.data.requestId,
            true,
          );
          if (
            el('privacyRequestsWrap') &&
            !el('privacyRequestsWrap').hidden &&
            el('privacyRequestsBtn')
          )
            el('privacyRequestsBtn').click();
        } else
          setFeedback(
            'accountFeedback',
            result.data.error || 'Não foi possível registrar a solicitação.',
          );
      });

    if (el('deleteBtn'))
      el('deleteBtn').addEventListener('click', async function () {
        if (
          !window.confirm(
            'Esta ação é irreversível. Deseja excluir sua conta e seus dados pessoais?',
          )
        )
          return;
        var result = await requestJson('/api/lgpd/account', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
        });
        if (result.response.ok) window.location.href = '/login';
        else
          setFeedback('accountFeedback', result.data.error || 'Não foi possível excluir a conta.');
      });
  }

  initTheme();
  if (page === 'login') initLogin();
  if (page === 'register') initRegister();
  if (page === 'mfa') initMfa();
  if (page === 'recover') initRecover();
  if (page === 'dashboard') initDashboard();
  if (page === 'account') initAccount();
})();