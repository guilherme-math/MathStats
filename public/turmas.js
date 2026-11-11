(function () {
  'use strict';
  var user,
    currentClass,
    questionCount = 0;
  var footballDatasets = [];
  var footballCatalog;
  var el = function (id) {
    return document.getElementById(id);
  };
  function node(tag, text, className) {
    var n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (className) n.className = className;
    return n;
  }
  function feedback(text, error) {
    el('classFeedback').textContent = text;
    el('classFeedback').classList.toggle('is-error', !!error);
  }
  function setNavigation(inClass) {
    var active = user.role === 'professor' && !inClass ? '/dashboard' : '/turmas';
    document.querySelectorAll('.dashboard-nav a').forEach(function (link) {
      var isActive = link.getAttribute('href') === active;
      link.classList.toggle('is-active', isActive);
      if (isActive) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }
  async function api(path, method, data) {
    var response = await fetch('/api' + path, {
      method: method || 'GET',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    var result = await response.json();
    if (response.status === 401) window.location.href = '/login';
    if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a operação.');
    return result;
  }
  function action(button, callback) {
    button.addEventListener('click', async function () {
      button.disabled = true;
      feedback('');
      try {
        await callback();
      } catch (e) {
        feedback(e.message, true);
      } finally {
        button.disabled = false;
      }
    });
  }
  function form(id, callback) {
    el(id).addEventListener('submit', async function (e) {
      e.preventDefault();
      var b = e.submitter;
      if (b) b.disabled = true;
      feedback('');
      try {
        await callback();
      } catch (err) {
        feedback(err.message, true);
      } finally {
        if (b) b.disabled = false;
      }
    });
  }
  function button(parent, text, callback, primary) {
    var b = node('button', text, primary ? 'primary-button' : 'secondary-button');
    b.type = 'button';
    action(b, callback);
    parent.append(b);
    return b;
  }
  async function hub() {
    var result = await api('/classes');
    setNavigation(false);
    el('teacherWelcome').hidden = user.role !== 'professor';
    el('classCreate').hidden = true;
    el('teacherActivityStart').hidden = true;
    el('activityClass').replaceChildren();
    result.classes.forEach(function (c) {
      var option = node('option', c.name);
      option.value = c.id;
      el('activityClass').append(option);
    });
    el('classMetrics').hidden = user.role !== 'professor';
    el('classMetrics').replaceChildren();
    if (user.role === 'professor') {
      [
        ['Turmas', result.classes.length],
        [
          'Participações de alunos',
          result.classes.reduce(function (sum, c) {
            return sum + c.students;
          }, 0),
        ],
      ].forEach(function (metric) {
        var card = node('div');
        card.append(node('span', metric[0]), node('strong', String(metric[1])));
        el('classMetrics').append(card);
      });
    }
    currentClass = null;
    el('classHub').hidden = false;
    el('classDetail').hidden = true;
    el('classList').replaceChildren();
    if (!result.classes.length)
      el('classList').append(
        node(
          'p',
          user.role === 'professor'
            ? 'Crie sua primeira turma para preparar atividades.'
            : 'Você ainda não participa de uma turma. Use o convite recebido do professor.',
        ),
      );
    result.classes.forEach(function (c) {
      var card = node('article', undefined, 'class-card');
      card.append(node('h3', c.name), node('p', c.students + ' participantes'));
      button(
        card,
        'ABRIR TURMA',
        function () {
          return openClass(c.id);
        },
        true,
      );
      el('classList').append(card);
    });
    el('classIntro').textContent =
      user.role === 'professor'
        ? 'Organize suas turmas, prepare atividades e acompanhe as respostas dos alunos.'
        : 'Acesse as atividades dos seus professores sem perder suas trilhas de prática.';
  }
  async function openClass(id) {
    var c = await api('/classes/' + id);
    setNavigation(true);
    currentClass = c;
    el('classHub').hidden = true;
    el('classDetail').hidden = false;
    el('activityView').hidden = true;
    el('activityEditor').hidden = true;
    el('classTitle').textContent = c.name;
    el('classParticipants').textContent = c.students + ' participantes';
    var teacher = user.role === 'professor';
    el('classInvite').hidden = !teacher;
    el('newActivity').hidden = !teacher;
    if (teacher) {
      el('inviteCode').value = c.inviteCode;
      el('inviteLink').value =
        location.origin + '/turmas?convite=' + encodeURIComponent(c.inviteCode);
    }
    el('activityList').replaceChildren();
    if (!c.activities.length)
      el('activityList').append(
        node(
          'p',
          teacher
            ? 'Nenhuma atividade preparada para esta turma.'
            : 'O professor ainda não publicou atividades.',
        ),
      );
    c.activities.forEach(function (a) {
      var card = node('article', undefined, 'class-card');
      card.append(
        node('h3', a.title),
        node('p', a.total + ' questões · ' + (a.published ? 'Publicada' : 'Não publicada')),
      );
      button(
        card,
        teacher ? 'REVISAR ATIVIDADE' : a.submitted ? 'VER CORREÇÃO' : 'RESPONDER',
        function () {
          return openActivity(a.id);
        },
        true,
      );
      if (teacher && !a.published)
        button(card, 'PUBLICAR', async function () {
          await api('/classes/' + id + '/activities/' + a.id + '/publish', 'POST', {});
          await openClass(id);
          feedback('Atividade publicada para os alunos da turma.');
        });
      if (teacher)
        button(card, 'VER RESULTADOS', function () {
          return results(a.id);
        });
      el('activityList').append(card);
    });
  }
  function field(parent, label, tag, id, max) {
    var l = node('label', label);
    l.htmlFor = id;
    var input = node(tag);
    input.id = id;
    input.required = true;
    if (max) input.maxLength = max;
    parent.append(l, input);
    return input;
  }
  function addQuestion(seed, { focus = true, replaceBlank = false } = {}) {
    var editors = el('questionEditors');
    var first = editors.firstElementChild;
    var replace = replaceBlank && editors.children.length === 1 && first.isBlankQuestion();
    if (!replace && editors.children.length >= 10)
      return feedback('O limite é de dez questões.', true);
    var index = replace ? questionCount : ++questionCount,
      box = node('fieldset', undefined, 'class-question');
    box.append(node('legend', 'Questão ' + index));
    if (seed && seed.sportsData) renderSportsData(box, seed.sportsData);
    var prompt = field(box, 'Enunciado', 'textarea', 'q-prompt-' + index, 800);
    var type = field(box, 'Formato', 'select', 'q-type-' + index);
    ['numeric', 'choice'].forEach(function (v) {
      var option = node('option', v === 'numeric' ? 'Resposta numérica' : 'Múltipla escolha');
      option.value = v;
      type.append(option);
    });
    var optionsWrap = node('div');
    box.append(optionsWrap);
    var options = field(
      optionsWrap,
      'Alternativas, uma por linha (de duas a cinco)',
      'textarea',
      'q-options-' + index,
      904,
    );
    options.required = false;
    optionsWrap.hidden = true;
    var answer = field(box, 'Resposta correta (apenas número)', 'input', 'q-answer-' + index, 100);
    answer.inputMode = 'decimal';
    var hint = node('small', 'Para alternativas, informe a posição correta: 1, 2, 3, 4 ou 5.');
    hint.hidden = true;
    box.append(hint);
    type.addEventListener('change', function () {
      optionsWrap.hidden = type.value !== 'choice';
      options.required = type.value === 'choice';
      hint.hidden = type.value !== 'choice';
      answer.inputMode = type.value === 'choice' ? 'numeric' : 'decimal';
    });
    var explanation = field(box, 'Explicação da resposta', 'textarea', 'q-explain-' + index, 800);
    box.isBlankQuestion = function () {
      return (
        !seed &&
        type.value === 'numeric' &&
        ![prompt, options, answer, explanation].some(function (input) {
          return input.value.trim();
        })
      );
    };
    box.readQuestion = function () {
      if (!/^-?\d+(?:[.,]\d+)?$/.test(answer.value.trim()))
        throw new Error('Informe um gabarito numérico válido.');
      var value = Number(answer.value.replace(',', '.'));
      var q = {
        type: type.value,
        prompt: prompt.value.trim(),
        explanation: explanation.value.trim(),
        answer: type.value === 'choice' ? value - 1 : value,
      };
      if (type.value === 'choice')
        q.options = options.value
          .split('\n')
          .map(function (s) {
            return s.trim();
          })
          .filter(Boolean);
      if (seed && seed.footballToken) q.footballToken = seed.footballToken;
      return q;
    };
    if (seed) {
      prompt.value = seed.prompt || '';
      type.value = seed.type || 'numeric';
      options.value = (seed.options || []).join('\n');
      answer.value =
        seed.answer === undefined
          ? ''
          : String(seed.type === 'choice' ? seed.answer + 1 : seed.answer);
      explanation.value = seed.explanation || '';
      type.dispatchEvent(new Event('change'));
    }
    button(box, 'REMOVER QUESTÃO', function () {
      box.remove();
    });
    if (replace) first.replaceWith(box);
    else editors.append(box);
    if (focus) {
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      prompt.focus({ preventScroll: true });
    }
  }
  function renderSportsData(parent, data) {
    if (!data) return;
    var panel = node('div', undefined, 'football-data');
    panel.append(node('strong', data.team + ' · Temporada ' + data.season));
    if (data.player)
      panel.append(
        node(
          'p',
          data.player.name + ': ' + data.player.goals + ' gols em ' + data.player.games + ' jogos.',
        ),
      );
    if (data.matches) {
      var table = node('table'),
        head = node('tr');
      ['Jogo', 'Adversário', 'Gols marcados', 'Gols sofridos'].forEach(function (t) {
        head.append(node('th', t));
      });
      var thead = node('thead');
      thead.append(head);
      table.append(thead);
      var tbody = node('tbody');
      data.matches.forEach(function (m, i) {
        var row = node('tr');
        [i + 1, m.adversario, m.gols, m.golsAdversario].forEach(function (v) {
          row.append(node('td', String(v)));
        });
        tbody.append(row);
      });
      table.append(tbody);
      panel.append(table);
    }
    panel.append(
      node(
        'small',
        'Fonte: API-Football. Cópia dos dados consultados, sem atualização automática após salvar a atividade.',
      ),
    );
    parent.append(panel);
  }
  function refreshFootballModels() {
    var context = el('footballContext').value,
      previous = el('footballModel').value;
    el('footballModel').replaceChildren();
    [
      ['mean', 'Média de gols'],
      ['sum', 'Total de gols'],
      ['balance', 'Saldo de gols'],
      ['percentage', 'Porcentagem de jogos com gols'],
    ].forEach(function (pair) {
      if (context === 'player' && !['mean', 'sum'].includes(pair[0])) return;
      var option = node('option', pair[1]);
      option.value = pair[0];
      el('footballModel').append(option);
    });
    if (
      Array.from(el('footballModel').options).some(function (o) {
        return o.value === previous;
      })
    )
      el('footballModel').value = previous;
    el('footballCount').disabled = context === 'player';
    resetFootballData();
  }
  function resetFootballData() {
    footballDatasets = [];
    el('footballDatasetPanel').hidden = true;
    el('footballFeedback').textContent =
      el('footballContext').value === 'player'
        ? 'Serão apresentados somente jogadores com estatísticas utilizáveis retornadas pela API.'
        : 'Consulte as partidas disponíveis para o time selecionado.';
  }
  function selectedFootballData() {
    return footballDatasets[Number(el('footballDataset').value)];
  }
  function previewFootballData() {
    el('footballDataPreview').replaceChildren();
    var selected = selectedFootballData();
    if (selected) renderSportsData(el('footballDataPreview'), selected.data);
  }
  function renderCorrection(parent, submission, questions) {
    parent.append(node('h3', submission.correct + ' de ' + submission.total + ' acertos'));
    submission.answers.forEach(function (a, i) {
      var q = questions[i],
        correct = q.type === 'choice' ? q.options[a.answer] : String(a.answer);
      var value = q.type === 'choice' ? q.options[a.value] : String(a.value);
      var card = node('div', undefined, 'class-result' + (a.correct ? '' : ' is-wrong'));
      card.append(
        node('strong', i + 1 + '. ' + (a.correct ? 'Correta' : 'Incorreta')),
        node('p', q.prompt),
        node('p', 'Sua resposta: ' + value + '. Resposta correta: ' + correct + '.'),
        node('p', a.explanation),
      );
      renderSportsData(card, q.sportsData);
      parent.append(card);
    });
  }
  async function openActivity(id) {
    var path = '/classes/' + currentClass.id + '/activities/' + id,
      a = await api(path),
      panel = el('activityView');
    panel.hidden = false;
    panel.replaceChildren(node('h2', a.title));
    if (user.role === 'professor') {
      a.questions.forEach(function (q, i) {
        var b = node('div', undefined, 'class-question');
        b.append(node('h3', 'Questão ' + (i + 1)), node('p', q.prompt));
        renderSportsData(b, q.sportsData);
        if (q.options)
          q.options.forEach(function (o, n) {
            b.append(node('p', n + 1 + '. ' + o));
          });
        b.append(
          node('strong', 'Gabarito: ' + (q.type === 'choice' ? q.options[q.answer] : q.answer)),
          node('p', q.explanation),
        );
        panel.append(b);
      });
    } else if (a.submission) renderCorrection(panel, a.submission, a.questions);
    else {
      var formEl = node('form'),
        inputs = [];
      a.questions.forEach(function (q, i) {
        var b = node('fieldset', undefined, 'class-question');
        b.append(node('legend', 'Questão ' + (i + 1)), node('p', q.prompt));
        renderSportsData(b, q.sportsData);
        if (q.type === 'numeric') {
          var input = field(b, 'Sua resposta numérica', 'input', 'answer-' + i, 100);
          input.inputMode = 'decimal';
          input.pattern = '-?[0-9]+([.,][0-9]+)?';
          input.addEventListener('input', function () {
            input.value = input.value.replace(/[^0-9.,-]/g, '');
          });
          inputs.push(function () {
            return input.value;
          });
        } else {
          var radios = [];
          q.options.forEach(function (o, j) {
            var label = node('label', undefined, 'class-option'),
              radio = node('input');
            radio.type = 'radio';
            radio.name = 'answer-' + i;
            radio.value = j;
            radio.required = true;
            label.append(radio, node('span', o));
            b.append(label);
            radios.push(radio);
          });
          inputs.push(function () {
            var chosen = radios.find(function (r) {
              return r.checked;
            });
            return chosen ? Number(chosen.value) : null;
          });
        }
        formEl.append(b);
      });
      var send = node('button', 'ENVIAR ATIVIDADE', 'primary-button');
      send.type = 'submit';
      formEl.append(send);
      panel.append(formEl);
      formEl.addEventListener('submit', async function (e) {
        e.preventDefault();
        send.disabled = true;
        try {
          await api(path + '/submit', 'POST', {
            answers: inputs.map(function (read) {
              return read();
            }),
          });
          await openActivity(id);
          feedback('Atividade enviada.');
        } catch (err) {
          feedback(err.message, true);
        } finally {
          send.disabled = false;
        }
      });
    }
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function results(id) {
    var result = await api('/classes/' + currentClass.id + '/activities/' + id + '/results'),
      panel = el('activityView');
    panel.hidden = false;
    panel.replaceChildren(node('h2', result.title));
    var submitted = result.students.filter(function (s) {
        return s.submission;
      }),
      mean = submitted.length
        ? Math.round(
            submitted.reduce(function (sum, s) {
              return sum + (s.submission.correct / s.submission.total) * 100;
            }, 0) / submitted.length,
          )
        : null;
    panel.append(
      node(
        'p',
        submitted.length +
          ' de ' +
          result.students.length +
          ' alunos responderam. ' +
          (mean === null
            ? 'Ainda sem média.'
            : 'Média de acertos entre quem respondeu: ' + mean + '%.'),
      ),
    );
    result.students.forEach(function (s) {
      var card = node('div', undefined, 'class-result');
      card.append(node('strong', s.name));
      if (!s.submission) card.append(node('p', 'Pendente'));
      else {
        card.append(node('p', s.submission.correct + ' de ' + s.submission.total + ' acertos'));
        s.submission.answers.forEach(function (a, i) {
          var question = result.questions[i];
          var value = question.type === 'choice' ? question.options[a.value] : a.value;
          card.append(
            node(
              'p',
              'Questão ' +
                (i + 1) +
                ': ' +
                (a.correct ? 'correta' : 'incorreta') +
                ' · Resposta: ' +
                value,
            ),
          );
        });
      }
      panel.append(card);
    });
    panel.scrollIntoView({ behavior: 'smooth' });
  }
  async function init() {
    try {
      user = (await api('/dashboard')).user;
      var teacher = user.role === 'professor';
      el('classTrailLink').hidden = teacher;
      document.title = teacher ? 'Painel do professor | MathStats' : 'Turmas | MathStats';
      el('classGreeting').textContent =
        (teacher ? 'Bem-vindo, ' : 'Suas turmas, ') + user.displayName;
      el('classEyebrow').textContent = teacher ? 'ÁREA DO PROFESSOR' : 'APRENDIZAGEM EM TURMA';
      el('classCreate').hidden = true;
      el('classJoin').hidden = teacher;
      var code = new URLSearchParams(location.search).get('convite');
      if (code) {
        sessionStorage.removeItem('classInvite');
        if (teacher) feedback('Entre com uma conta de aluno para participar de uma turma.', true);
        else el('classCode').value = code;
      }
      await hub();
    } catch (err) {
      feedback(err.message, true);
    }
  }
  form('classCreate', async function () {
    var c = await api('/classes', 'POST', { name: el('className').value });
    el('classCreate').reset();
    await openClass(c.id);
    feedback('Turma criada. Compartilhe o convite com seus alunos.');
  });
  form('classJoin', async function () {
    var c = await api('/classes/join', 'POST', { code: el('classCode').value.trim() });
    history.replaceState(null, '', '/turmas');
    await openClass(c.id);
    feedback('Você entrou na turma.');
  });
  action(el('backClasses'), hub);
  function startActivity() {
    el('activityEditor').hidden = false;
    el('activityTitle').value = '';
    el('questionEditors').replaceChildren();
    questionCount = 0;
    el('footballTemplates').open = false;
    resetFootballData();
    addQuestion(undefined, { focus: false });
    el('activityEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    el('activityTitle').focus({ preventScroll: true });
  }
  async function loadFootballCatalog() {
    if (footballCatalog) return;
    el('loadFootballData').disabled = true;
    el('footballFeedback').textContent = 'Carregando times...';
    try {
      footballCatalog = await api('/teacher/football/catalog');
    } catch (e) {
      el('footballFeedback').textContent =
        e.message + ' Feche e abra os modelos para tentar de novo.';
      return;
    }
    el('footballTeam').replaceChildren();
    footballCatalog.teams.forEach(function (t) {
      var o = node('option', t.name);
      o.value = String(t.id);
      el('footballTeam').append(o);
    });
    refreshFootballModels();
    el('loadFootballData').disabled = false;
  }
  function showCreateClass() {
    el('teacherActivityStart').hidden = true;
    el('classCreate').hidden = false;
    el('classCreate').scrollIntoView({ behavior: 'smooth', block: 'start' });
    el('className').focus({ preventScroll: true });
  }
  action(el('welcomeCreateClass'), showCreateClass);
  action(el('welcomePrepareActivity'), function () {
    if (!el('activityClass').options.length) {
      showCreateClass();
      feedback('Crie uma turma primeiro para vincular sua atividade aos alunos.');
      return;
    }
    el('classCreate').hidden = true;
    el('teacherActivityStart').hidden = false;
    el('teacherActivityStart').scrollIntoView({ behavior: 'smooth', block: 'start' });
    el('activityClass').focus({ preventScroll: true });
  });
  form('teacherActivityStart', async function () {
    await openClass(el('activityClass').value);
    startActivity();
  });
  action(el('newActivity'), startActivity);
  action(el('addQuestion'), function () {
    addQuestion();
  });
  el('footballTemplates').addEventListener('toggle', function () {
    if (this.open) void loadFootballCatalog();
  });
  el('footballContext').addEventListener('change', refreshFootballModels);
  el('footballTeam').addEventListener('change', resetFootballData);
  el('footballCount').addEventListener('change', resetFootballData);
  el('footballDataset').addEventListener('change', previewFootballData);
  action(el('loadFootballData'), async function () {
    el('footballFeedback').textContent = 'Consultando dados do futebol...';
    el('footballDatasetPanel').hidden = true;
    try {
      var params = new URLSearchParams({
        teamId: el('footballTeam').value,
        context: el('footballContext').value,
        count: el('footballCount').value,
      });
      footballDatasets = (await api('/teacher/football/data?' + params)).datasets;
      el('footballDataset').replaceChildren();
      footballDatasets.forEach(function (d, i) {
        var o = node('option', d.label);
        o.value = String(i);
        el('footballDataset').append(o);
      });
      el('footballDatasetPanel').hidden = false;
      previewFootballData();
      el('footballFeedback').textContent =
        'Dados disponíveis. Use um modelo ou escreva a questão com seu próprio gabarito.';
    } catch (e) {
      footballDatasets = [];
      el('footballFeedback').textContent = e.message;
      throw e;
    }
  });
  action(el('useFootballModel'), async function () {
    var selected = selectedFootballData();
    if (!selected) throw new Error('Consulte e selecione os dados primeiro.');
    var result = await api('/teacher/football/question', 'POST', {
      token: selected.token,
      model: el('footballModel').value,
      format: el('footballFormat').value,
    });
    addQuestion(Object.assign({}, result.question, { sportsData: selected.data }), {
      replaceBlank: true,
    });
  });
  action(el('writeFootballQuestion'), function () {
    var selected = selectedFootballData();
    if (!selected) throw new Error('Consulte os dados primeiro.');
    addQuestion(
      {
        type: el('footballFormat').value,
        footballToken: selected.token,
        sportsData: selected.data,
      },
      { replaceBlank: true },
    );
  });
  action(el('cancelActivity'), function () {
    el('activityEditor').hidden = true;
  });
  action(el('copyClassInvite'), async function () {
    try {
      await navigator.clipboard.writeText(el('inviteLink').value);
      feedback('Link copiado.');
    } catch (_) {
      el('inviteLink').focus();
      el('inviteLink').select();
      feedback('Selecione e copie o link exibido.');
    }
  });
  form('activityEditor', async function () {
    var questions = Array.from(el('questionEditors').children).map(function (box) {
      return box.readQuestion();
    });
    if (!questions.length) throw new Error('Adicione pelo menos uma questão.');
    await api('/classes/' + currentClass.id + '/activities', 'POST', {
      title: el('activityTitle').value.trim(),
      questions: questions,
    });
    await openClass(currentClass.id);
    feedback('Atividade salva. Revise as questões e publique quando estiver pronta.');
  });
  action(el('classLogout'), async function () {
    await api('/logout', 'POST', {});
    location.href = '/login';
  });
  init();
})();
