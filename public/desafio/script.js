(function () {
  'use strict';

  const API_BASE = '/api';
  var TOTAL_CHALLENGES = 5;
  var state = {
    index: 0,
    xp: 0,
    streak: 0,
    correct: 0,
    xpGained: 0,
    selected: null,
    locked: false,
    order: [],
    challenge: null,
    challengeId: null,
    hintUses: 0,
    hintUsedCurrentChallenge: false,
    currentHintIndex: 0,
  };
  var el = function (id) {
    return document.getElementById(id);
  };
  var answerArea = el('answerArea');
  var form = el('answerForm');
  var fieldset = el('answerFieldset');
  var feedback = el('feedback');
  var checkBtn = el('checkBtn');
  var checkBtnLabel = el('checkBtnLabel');
  var systemMessage = el('systemMessage');
  var draggedId = null;
  var ICON_OK =
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="m8 12.5 2.5 2.5L16 9.5"></path></svg>';
  var ICON_ERR =
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v5M12 16h.01"></path></svg>';

  function formatNumber(value) {
    return value.toLocaleString('pt-BR');
  }
  function pad(value) {
    return String(value).padStart(2, '0');
  }
  function slug(text) {
    return String(text)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
  function safeText(value, fallback) {
    return typeof value === 'string' && value.trim() ? value : fallback;
  }

  function translateVisibleText(value) {
    if (typeof value !== 'string') return value;
    var exact = {
      statistics: 'Estatística',
      statistic: 'Estatística',
      mathematics: 'Matemática',
      math: 'Matemática',
      probability: 'Probabilidade',
      'data analysis': 'Análise de dados',
      'performance analysis': 'Análise de desempenho',
      easy: 'Fácil',
      medium: 'Médio',
      hard: 'Difícil',
      true: 'Verdadeiro',
      false: 'Falso',
      'football data': 'Dados de futebol',
      'live dataset': 'Dados em tempo real',
      'football data / live dataset': 'Dados de futebol / Dados em tempo real',
      correct: 'Correto',
      incorrect: 'Incorreto',
      'try again': 'Tente novamente',
    };
    var trimmed = value.trim();
    var translated = exact[trimmed.toLowerCase()];
    if (translated) return translated;
    return trimmed
      .replace(/\bStatistics\b/gi, 'Estatística')
      .replace(/\bMathematics\b/gi, 'Matemática')
      .replace(/\bPerformance Analysis\b/gi, 'Análise de desempenho')
      .replace(/\bFootball Data\b/gi, 'Dados de futebol')
      .replace(/\bLive Dataset\b/gi, 'Dados em tempo real')
      .replace(/\bEasy\b/gi, 'Fácil')
      .replace(/\bMedium\b/gi, 'Médio')
      .replace(/\bHard\b/gi, 'Difícil')
      .replace(/\bCorrect\b/gi, 'Correto')
      .replace(/\bIncorrect\b/gi, 'Incorreto')
      .replace(/\bTrue\b/gi, 'Verdadeiro')
      .replace(/\bFalse\b/gi, 'Falso');
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var dark = theme === 'dark';
    el('themeToggle').setAttribute('aria-label', dark ? 'Ativar modo claro' : 'Ativar modo escuro');
    el('themeToggle').setAttribute('title', dark ? 'Ativar modo claro' : 'Ativar modo escuro');
    try {
      localStorage.setItem('mathstats-theme', theme);
    } catch (error) {}
  }

  async function loadUserXp() {
    try {
      var response = await fetch(API_BASE + '/dashboard', {
        headers: { Accept: 'application/json' },
      });
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      var data = await response.json().catch(function () {
        return {};
      });
      if (!response.ok) return;
      state.xp = Number(data.user && data.user.xpTotal) || 0;
      state.streak = Number(data.user && data.user.streak) || 0;
      el('xpValue').textContent = formatNumber(state.xp);
      if (el('streakValue')) el('streakValue').textContent = String(state.streak);
    } catch (error) {}
  }

  function normalizeChallenge(data) {
    var rawType = safeText(data.type || data.tipo, 'numeric').toLowerCase();
    var typeMap = {
      'multiple-choice': 'multiple-choice',
      multiple_choice: 'multiple-choice',
      multipla_escolha: 'multiple-choice',
      numeric: 'numeric',
      numerico: 'numeric',
      resposta_numerica: 'numeric',
      'numeric-input': 'numeric',
      true_false: 'true-false',
      verdadeiro_falso: 'true-false',
      'true-false': 'true-false',
      data_interpretation: 'data-interpretation',
      interpretacao_dados: 'data-interpretation',
      'data-interpretation': 'data-interpretation',
      order: 'order',
      ordering: 'order',
      ordenacao: 'order',
    };
    return {
      id: data.idDesafio || data.id,
      type: typeMap[rawType] || 'numeric',
      category: translateVisibleText(safeText(data.category || data.categoria, 'Estatística')),
      difficulty: translateVisibleText(safeText(data.difficulty || data.dificuldade, 'Fácil')),
      title: translateVisibleText(safeText(data.title || data.titulo, 'Análise de desempenho')),
      context: translateVisibleText(
        safeText(data.context || data.contexto, 'Dados de futebol / Dados em tempo real'),
      ),
      story: translateVisibleText(safeText(data.historia || data.story, '')),
      question: translateVisibleText(
        safeText(data.pergunta || data.question, 'Desafio indisponível.'),
      ),
      options: Array.isArray(data.options || data.opcoes || data.alternativas)
        ? data.options || data.opcoes || data.alternativas
        : [],
      table: data.table || data.tabela || null,
      data: Array.isArray(data.data || data.dados) ? data.data || data.dados : [],
      hint: translateVisibleText(
        safeText(data.dica || data.hint, 'Analise os dados e escolha a melhor estratégia.'),
      ),
      hints: Array.isArray(data.dicas || data.hints)
        ? (data.dicas || data.hints).map(function (hint) {
            return translateVisibleText(String(hint));
          })
        : [
            translateVisibleText(
              safeText(data.dica || data.hint, 'Analise os dados apresentados.'),
            ),
          ],
      explanation: translateVisibleText(
        safeText(
          data.explanation || data.explicacao,
          'Revise os dados apresentados e o cálculo utilizado para chegar ao resultado.',
        ),
      ),
      xp: Number(data.xp) || 20,
      placeholder: translateVisibleText(
        safeText(data.placeholder || data.placeholderResposta, 'Digite sua resposta'),
      ),
    };
  }

  function setLoading() {
    state.challenge = null;
    state.selected = null;
    systemMessage.hidden = true;
    feedback.hidden = true;
    form.hidden = false;
    fieldset.disabled = true;
    el('hintPanel').hidden = true;
    el('hintPanel').textContent = '';
    el('categoryTag').textContent = 'CARREGANDO DADOS';
    el('difficultyTag').textContent = 'SISTEMA / AGUARDE';
    el('contextTitle').textContent = 'Preparando desafio';
    el('contextText').textContent = 'DADOS DE FUTEBOL / DADOS EM TEMPO REAL';
    el('challengeStory').textContent = '';
    el('challengeStory').hidden = true;
    el('xpAvailable').textContent = 'AGUARDANDO DESAFIO';
    el('statement').textContent = 'Carregando um novo desafio com dados esportivos...';
    answerArea.innerHTML =
      '<div class="loading-state"><span class="loader"></span><strong>GERANDO DESAFIO...</strong><small>CONECTANDO AOS DADOS DE FUTEBOL</small></div>';
    el('dataStrip').hidden = true;
    el('dataTableWrap').hidden = true;
  }

  function showLoadError(message) {
    fieldset.disabled = true;
    answerArea.replaceChildren();
    el('statement').textContent = 'Não foi possível carregar o desafio agora.';
    systemMessage.hidden = false;
    systemMessage.replaceChildren();
    var title = document.createElement('strong');
    title.textContent = 'ERRO DE CONEXÃO';
    var messageText = document.createTextNode(' ' + translateVisibleText(message) + ' ');
    var retryButton = document.createElement('button');
    retryButton.type = 'button';
    retryButton.id = 'retryBtn';
    retryButton.textContent = 'TENTAR NOVAMENTE';
    retryButton.addEventListener('click', loadChallenge);
    systemMessage.append(title, messageText, retryButton);
  }

  async function loadChallenge() {
    setLoading();
    try {
      var response = await fetch(API_BASE + '/desafio?indice=' + (state.index + 1), {
        headers: { Accept: 'application/json' },
      });
      var data = await response.json().catch(function () {
        return {};
      });
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!response.ok || !(data.pergunta || data.question))
        throw new Error(data.erro || 'O serviço de desafios não respondeu.');
      state.challenge = normalizeChallenge(data);
      state.challengeId = state.challenge.id;
      renderChallenge();
    } catch (error) {
      showLoadError('Não foi possível conectar ao servidor.');
    }
  }

  function selectChoice(value) {
    if (state.locked) return;
    state.selected = value;
    answerArea.querySelectorAll('.option-btn').forEach(function (button) {
      var selected = button.dataset.value === String(value);
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    checkBtn.disabled = false;
    el('fieldMessage').textContent = '';
  }

  function renderChoices(challenge) {
    var grid = document.createElement('div');
    grid.className = 'options-grid';
    var options = challenge.options;
    if (challenge.type === 'true-false' && !options.length) options = ['Verdadeiro', 'Falso'];
    options.forEach(function (option, index) {
      var label = translateVisibleText(
        typeof option === 'object'
          ? option.label || option.texto || option.nome || option.value
          : option,
      );
      var value = typeof option === 'object' ? (option.value ?? option.id ?? label) : option;
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'option-btn';
      button.dataset.value = String(value);
      button.setAttribute('aria-pressed', 'false');
      var key = document.createElement('span');
      key.className = 'option-key';
      key.textContent = String.fromCharCode(65 + index);
      var labelText = document.createElement('span');
      labelText.textContent = label;
      button.append(key, labelText);
      button.addEventListener('click', function () {
        selectChoice(value);
      });
      grid.appendChild(button);
    });
    answerArea.appendChild(grid);
  }

  function renderNumeric(challenge) {
    var label = document.createElement('label');
    label.className = 'field-label';
    label.htmlFor = 'answer';
    label.textContent = 'SUA RESPOSTA NUMÉRICA';
    var input = document.createElement('input');
    input.type = 'text';
    input.id = 'answer';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.placeholder = challenge.placeholder;
    input.addEventListener('input', function () {
      state.selected = input.value;
      checkBtn.disabled = !input.value.trim();
      el('fieldMessage').textContent = '';
    });
    answerArea.append(label, input);
  }

  function moveOrder(id, amount) {
    if (state.locked) return;
    var from = state.order.indexOf(id);
    var to = from + amount;
    if (to < 0 || to >= state.order.length) return;
    state.order.splice(from, 1);
    state.order.splice(to, 0, id);
    state.selected = state.order.slice();
    renderOrder(state.challenge);
  }

  function renderOrder(challenge) {
    answerArea.replaceChildren();
    var note = document.createElement('p');
    note.className = 'order-note';
    note.textContent = 'ARRASTE OU USE AS SETAS PARA ORDENAR';
    answerArea.appendChild(note);
    var list = document.createElement('ol');
    list.className = 'order-list';
    state.order.forEach(function (id, index) {
      var item = challenge.options.find(function (option) {
        return String(option.id ?? option.value) === String(id);
      });
      if (!item) return;
      var li = document.createElement('li');
      li.className = 'order-item';
      li.draggable = !state.locked;
      li.dataset.id = String(id);
      var handle = document.createElement('span');
      handle.className = 'drag-handle';
      handle.textContent = '⋮⋮';
      var rank = document.createElement('span');
      rank.className = 'order-rank';
      rank.textContent = pad(index + 1);
      var name = document.createElement('span');
      name.className = 'order-name';
      name.textContent = translateVisibleText(
        item.label || item.name || item.nome || item.texto || '',
      );
      var stat = document.createElement('strong');
      stat.textContent = translateVisibleText(String(item.stat ?? item.value ?? item.valor ?? ''));
      var actions = document.createElement('span');
      actions.className = 'order-actions';
      var btnUp = document.createElement('button');
      btnUp.type = 'button';
      btnUp.className = 'move-btn up';
      btnUp.setAttribute('aria-label', 'Mover para cima');
      btnUp.textContent = '↑';
      btnUp.disabled = index === 0;
      var btnDown = document.createElement('button');
      btnDown.type = 'button';
      btnDown.className = 'move-btn down';
      btnDown.setAttribute('aria-label', 'Mover para baixo');
      btnDown.textContent = '↓';
      btnDown.disabled = index === state.order.length - 1;
      btnUp.addEventListener('click', function () {
        moveOrder(id, -1);
      });
      btnDown.addEventListener('click', function () {
        moveOrder(id, 1);
      });
      actions.append(btnUp, btnDown);
      li.append(handle, rank, name, stat, actions);
      li.addEventListener('dragstart', function () {
        draggedId = id;
        li.classList.add('is-dragging');
      });
      li.addEventListener('dragend', function () {
        draggedId = null;
        li.classList.remove('is-dragging');
      });
      li.addEventListener('dragover', function (event) {
        event.preventDefault();
      });
      li.addEventListener('drop', function (event) {
        event.preventDefault();
        if (!draggedId || draggedId === id) return;
        var from = state.order.indexOf(draggedId);
        var to = state.order.indexOf(id);
        state.order.splice(from, 1);
        state.order.splice(to, 0, draggedId);
        state.selected = state.order.slice();
        renderOrder(challenge);
      });
      list.appendChild(li);
    });

    answerArea.appendChild(list);
    checkBtn.disabled = false;
  }

  function renderSupportingData(challenge) {
    var strip = el('dataStrip');
    strip.innerHTML = '';
    strip.hidden = !challenge.data.length;
    challenge.data.forEach(function (item) {
      var li = document.createElement('li');
      var value = document.createElement('strong');
      value.textContent = translateVisibleText(String(item.value ?? ''));
      var label = document.createElement('small');
      label.textContent = translateVisibleText(String(item.label ?? ''));
      li.append(value, label);
      strip.appendChild(li);
    });
    var wrap = el('dataTableWrap');
    wrap.innerHTML = '';
    wrap.hidden = !challenge.table;
    if (!challenge.table) return;
    var table = document.createElement('table');
    var thead = document.createElement('thead');
    var tr = document.createElement('tr');
    challenge.table.headers.forEach(function (text) {
      var th = document.createElement('th');
      th.scope = 'col';
      th.textContent = translateVisibleText(text);
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    var tbody = document.createElement('tbody');
    challenge.table.rows.forEach(function (row) {
      var line = document.createElement('tr');
      row.forEach(function (text, index) {
        var cell = document.createElement(index ? 'td' : 'th');
        if (!index) cell.scope = 'row';
        cell.textContent = translateVisibleText(text);
        line.appendChild(cell);
      });
      tbody.appendChild(line);
    });
    table.append(thead, tbody);
    wrap.appendChild(table);
  }

  function updateProgress() {
    var completed = state.locked ? state.index + 1 : state.index;
    var percent = Math.round((completed / TOTAL_CHALLENGES) * 100);
    el('challengeIndex').textContent = pad(state.index + 1);
    el('challengeTotal').textContent = pad(TOTAL_CHALLENGES);
    el('headerChallengeIndex').textContent = pad(state.index + 1);
    el('headerChallengeTotal').textContent = pad(TOTAL_CHALLENGES);
    el('progressFill').style.width = percent + '%';
    el('progressBar').setAttribute('aria-valuenow', String(percent));
    el('solvedLabel').textContent = completed + (completed === 1 ? ' CONCLUÍDO' : ' CONCLUÍDOS');
  }

  function renderChallenge() {
    var challenge = state.challenge;
    state.selected = null;
    state.locked = false;
    state.hintUsedCurrentChallenge = false;
    state.currentHintIndex = 0;
    state.order =
      challenge.type === 'order'
        ? challenge.options.map(function (item) {
            return String(item.id ?? item.value);
          })
        : [];
    systemMessage.hidden = true;
    feedback.hidden = true;
    form.hidden = false;
    fieldset.disabled = false;
    checkBtn.disabled = true;
    el('trackCategory').textContent = challenge.category;
    el('categoryTag').textContent = challenge.category;
    el('difficultyTag').textContent =
      'NÍVEL ' + pad(state.index + 1) + ' / ' + challenge.difficulty;
    el('difficultyTag').dataset.level = slug(challenge.difficulty);
    el('contextTitle').textContent = challenge.title;
    el('contextText').textContent = challenge.context;
    el('challengeStory').textContent = challenge.story;
    el('challengeStory').hidden = !challenge.story;
    el('statement').textContent = challenge.question;
    el('xpAvailable').textContent = '+' + challenge.xp + ' XP DISPONÍVEIS';
    el('fieldMessage').textContent = '';
    el('hintPanel').hidden = true;
    el('hintPanel').textContent = '';
    if (state.hintUses >= 2) {
      el('hintBtn').disabled = true;
      el('hintBtn').textContent = 'DICAS ESGOTADAS';
    } else if (!challenge.hints.length) {
      el('hintBtn').disabled = true;
      el('hintBtn').textContent = 'SEM DICA';
    } else {
      el('hintBtn').disabled = false;
      el('hintBtn').innerHTML = 'DICA <span>' + (2 - state.hintUses) + '</span>';
    }
    answerArea.replaceChildren();
    renderSupportingData(challenge);
    if (challenge.type === 'numeric') renderNumeric(challenge);
    else if (challenge.type === 'order') renderOrder(challenge);
    else renderChoices(challenge);
    updateProgress();
  }

  function answerPayload(challenge) {
    if (challenge.type === 'numeric') return Number(String(state.selected).replace(',', '.'));
    return state.selected;
  }

  function markAnswer(correct, result) {
    var challenge = state.challenge;
    if (challenge.type === 'numeric')
      el('answer').classList.add(correct ? 'is-correct' : 'is-incorrect');
    else if (challenge.type !== 'order')
      answerArea.querySelectorAll('.option-btn').forEach(function (button) {
        if (button.dataset.value === String(state.selected))
          button.classList.add(correct ? 'is-correct' : 'is-incorrect');
        button.setAttribute('aria-disabled', 'true');
      });
    state.locked = true;
    updateProgress();
    fieldset.disabled = true;
    feedback.hidden = false;
    feedback.dataset.state = correct ? 'success' : 'error';
    el('feedbackIcon').innerHTML = correct ? ICON_OK : ICON_ERR;
    el('feedbackLabel').textContent = correct ? 'CORRETO' : 'INCORRETO';
    el('feedbackTitle').textContent = correct ? 'Excelente!' : 'Resposta incorreta.';
    var explanation =
      result.explicacao ||
      result.explanation ||
      challenge.explanation ||
      (correct
        ? 'Muito bem! Você chegou à resposta correta.'
        : 'Revise os dados apresentados e o cálculo utilizado.');
    var xpEarned = Number(result.xpGanho) || 0;
    var xpTotal = Number(result.xpTotal);
    var streak = Number(result.streak);
    el('feedbackText').textContent = translateVisibleText(explanation);
    el('xpBurst').hidden = xpEarned <= 0;
    el('xpBurst').textContent = '+' + xpEarned + ' XP';
    if (Number.isFinite(streak)) {
      state.streak = streak;
      if (el('streakValue')) el('streakValue').textContent = String(state.streak);
      if (result.streakChanged) el('streakChip').classList.add('chip-glow');
    }
    if (correct) {
      state.correct += 1;
      state.xpGained += xpEarned;
      if (Number.isFinite(xpTotal)) state.xp = xpTotal;
      el('xpValue').textContent = formatNumber(state.xp);
      el('xpChip').classList.add('chip-pop');
    } else {
      el('challengeCard').classList.add('shake');
    }
    el('nextBtn').innerHTML =
      (state.index === TOTAL_CHALLENGES - 1 ? 'CONCLUIR TRILHA' : 'CONTINUAR') + ' <span>→</span>';
    el('nextBtn').focus();
  }

  async function validateAnswer() {
    var challenge = state.challenge;
    var value = answerPayload(challenge);
    if (challenge.type === 'numeric' && !Number.isFinite(value)) {
      el('fieldMessage').textContent = 'INFORME UM VALOR NUMÉRICO VÁLIDO.';
      el('answer').focus();
      return;
    }
    if (!state.challengeId) {
      showLoadError('O desafio não possui um identificador válido.');
      return;
    }
    checkBtn.disabled = true;
    checkBtn.classList.add('is-loading');
    checkBtnLabel.textContent = 'VALIDANDO...';
    form.setAttribute('aria-busy', 'true');
    try {
      var response = await fetch(
        API_BASE + '/desafio/' + encodeURIComponent(state.challengeId) + '/responder',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ resposta: value, usouDica: state.hintUsedCurrentChallenge }),
        },
      );
      var result = await response.json().catch(function () {
        return {};
      });
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!response.ok) throw new Error(result.erro || 'Não foi possível validar a resposta.');
      markAnswer(Boolean(result.acertou), result);
    } catch (error) {
      el('fieldMessage').textContent = 'Não foi possível conectar ao servidor. Tente novamente.';
      checkBtn.disabled = false;
    } finally {
      checkBtn.classList.remove('is-loading');
      checkBtnLabel.textContent = 'VALIDAR RESPOSTA';
      form.removeAttribute('aria-busy');
    }
  }

  function showSummary() {
    el('challengeCard').hidden = true;
    el('summaryCard').hidden = false;
    el('sumXp').textContent = '+' + state.xpGained + ' XP';
    el('sumCorrect').textContent = state.correct + ' / ' + TOTAL_CHALLENGES;
    el('sumRate').textContent = Math.round((state.correct / TOTAL_CHALLENGES) * 100) + '%';
    if (el('sumStreak'))
      el('sumStreak').textContent = '🔥 ' + state.streak + (state.streak === 1 ? ' DIA' : ' DIAS');
    el('progressFill').style.width = '100%';
    el('solvedLabel').textContent = TOTAL_CHALLENGES + ' CONCLUÍDOS';
    el('xpAvailable').textContent = 'TRILHA CONCLUÍDA';
  }

  function restart() {
    state.index = 0;
    state.correct = 0;
    state.xpGained = 0;
    state.locked = false;
    state.hintUses = 0;
    state.hintUsedCurrentChallenge = false;
    state.currentHintIndex = 0;
    el('summaryCard').hidden = true;
    el('challengeCard').hidden = false;
    updateProgress();
    loadChallenge();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!state.locked && state.challenge) validateAnswer();
  });
  el('nextBtn').addEventListener('click', function () {
    el('challengeCard').classList.remove('shake');
    if (state.index === TOTAL_CHALLENGES - 1) showSummary();
    else {
      state.index += 1;
      loadChallenge();
    }
  });
  el('hintBtn').addEventListener('click', function () {
    if (!state.challenge || state.locked || state.hintUses >= 2) return;
    var hints = state.challenge.hints || [];
    if (!hints.length || state.currentHintIndex >= hints.length) return;
    var hintPanel = el('hintPanel');
    state.hintUses += 1;
    state.hintUsedCurrentChallenge = true;
    state.currentHintIndex += 1;
    var hintText = document.createElement('p');
    hintText.textContent =
      'DICA ' + state.currentHintIndex + ': ' + hints[state.currentHintIndex - 1];
    hintPanel.appendChild(hintText);
    hintPanel.hidden = false;
    var reducedXp = Math.floor(state.challenge.xp / 2);
    el('xpAvailable').textContent = '+' + reducedXp + ' XP COM DICA';
    if (state.hintUses >= 2) {
      el('hintBtn').disabled = true;
      el('hintBtn').textContent = 'DICAS ESGOTADAS';
    } else if (state.currentHintIndex >= hints.length) {
      el('hintBtn').disabled = true;
      el('hintBtn').textContent = 'DICAS USADAS';
    } else {
      el('hintBtn').disabled = false;
      el('hintBtn').innerHTML = 'DICA <span>' + (2 - state.hintUses) + '</span>';
    }
  });
  el('themeToggle').addEventListener('click', function () {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
  el('restartBtn').addEventListener('click', restart);
  el('dashboardBtn').addEventListener('click', function () {
    window.location.href = '/dashboard';
  });
  el('logoutBtn').addEventListener('click', async function () {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch (error) {}
    window.location.href = '/login';
  });
  var savedTheme = 'dark';
  try {
    savedTheme = localStorage.getItem('mathstats-theme') || 'dark';
  } catch (error) {}
  setTheme(savedTheme === 'light' ? 'light' : 'dark');
  updateProgress();
  loadUserXp();
  loadChallenge();
})();