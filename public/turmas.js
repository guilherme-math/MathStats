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
    var active =
      location.pathname === '/professor/questoes'
        ? '/professor/questoes'
        : user.role === 'professor' && !inClass && location.pathname === '/professor'
          ? '/dashboard'
          : '/turmas';
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
    if (response.status === 204) return;
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
  function renderTeacherCharts(container, activities) {
    container.replaceChildren();
    container.hidden = activities.length === 0;
    if (!activities.length) return;
    var submitted = 0,
      pending = 0,
      correct = 0,
      answered = 0;
    var daily = {};
    activities.forEach(function (activity) {
      submitted += activity.submitted;
      pending += activity.pending;
      answered += activity.submitted * activity.questions.length;
      activity.questions.forEach(function (question) {
        correct += question.correct;
      });
      Object.entries(activity.daily || {}).forEach(function ([date, count]) {
        daily[date] = (daily[date] || 0) + count;
      });
    });
    var accuracy = answered ? Math.round((correct * 100) / answered) : 0;
    var performance = node('section', undefined, 'class-card');
    var ring = node('div', answered ? accuracy + '%' : 'Sem respostas', 'teacher-ring');
    ring.style.setProperty('--accuracy', accuracy + '%');
    performance.append(
      node('h3', 'Precisão das respostas'),
      ring,
      node('p', correct + ' acertos de ' + answered + ' respostas'),
      node('p', submitted + ' entregas · ' + pending + ' pendências'),
    );
    var timeline = node('section', undefined, 'class-card');
    var bars = node('ul', undefined, 'teacher-bars');
    var max = Math.max(1, ...Object.values(daily));
    Object.entries(daily)
      .sort()
      .forEach(function ([date, count]) {
        var bar = node('span', undefined, 'teacher-bar');
        bar.setAttribute('aria-hidden', 'true');
        bar.style.setProperty('--bar-height', Math.max(2, (100 * count) / max) + '%');
        var track = node('span', undefined, 'teacher-bar-track');
        track.append(bar);
        var entry = node('li');
        entry.append(
          node('strong', String(count)),
          track,
          node('small', date.slice(8) + '/' + date.slice(5, 7)),
        );
        bars.append(entry);
      });
    timeline.append(node('h3', 'Entregas nos últimos 7 dias'), bars);
    container.append(performance, timeline);
  }
  function renderStudentProgress(students, activities, scope) {
    var panel = el('dashboardStudents');
    panel.hidden = false;
    panel.replaceChildren(node('h3', 'Desempenho dos alunos'));
    var rows = students.map(function (student) {
      return {
        id: student.id,
        name: student.name,
        delivered: 0,
        started: 0,
        expired: 0,
        assigned: 0,
        correct: 0,
        total: 0,
      };
    });
    var byId = new Map(
      students.map(function (student, index) {
        return [student.id, rows[index]];
      }),
    );
    activities.forEach(function (activity) {
      activity.studentIds.forEach(function (id) {
        byId.get(id).assigned++;
      });
      var delivered = new Set();
      activity.results.forEach(function (result) {
        var row = byId.get(result.id);
        delivered.add(result.id);
        row.delivered++;
        row.correct += result.correct;
        row.total += result.total;
      });
      activity.startedIds.forEach(function (id) {
        if (delivered.has(id)) return;
        if (activity.expiredIds?.includes(id)) byId.get(id).expired++;
        else byId.get(id).started++;
      });
    });
    var graded = rows.filter(function (row) {
      return row.total > 0;
    });
    var average = graded.length
      ? Math.round(
          graded.reduce(function (sum, row) {
            return sum + (100 * row.correct) / row.total;
          }, 0) / graded.length,
        ) + '%'
      : 'Sem entregas';
    panel.append(
      node(
        'p',
        'Média · ' +
          scope +
          ': ' +
          average +
          ' · ' +
          graded.length +
          ' de ' +
          rows.length +
          ' alunos com entrega',
      ),
    );
    var filter = field(panel, 'Situação', 'select', 'dashboardStudentStatus');
    [
      ['', 'Todos os alunos'],
      ['done', 'Concluíram'],
      ['started', 'Em andamento'],
      ['pending', 'Ainda não começaram'],
      ['expired', 'Tempo esgotado'],
    ].forEach(function ([value, label]) {
      var option = node('option', label);
      option.value = value;
      filter.append(option);
    });
    var wrap = node('div', undefined, 'football-data');
    var table = node('table');
    var head = node('tr');
    ['Aluno', 'Situação', 'Entregas', 'Acertos', 'Erros', 'Média'].forEach(function (label) {
      head.append(node('th', label));
    });
    var thead = node('thead');
    thead.append(head);
    var body = node('tbody');
    table.append(thead, body);
    wrap.append(table);
    var empty = node('p', 'Nenhum aluno para este filtro.');
    var detail = node('section', undefined, 'class-panel');
    detail.hidden = true;
    panel.append(wrap, empty, detail);
    function showStudent(row) {
      detail.hidden = false;
      var title = node('h3', row.name);
      title.tabIndex = -1;
      detail.replaceChildren(title);
      button(detail, 'FECHAR DETALHES', function () {
        detail.hidden = true;
      });
      if (!row.assigned) detail.append(node('p', 'Nenhuma atividade neste recorte.'));
      activities
        .filter(function (activity) {
          return activity.studentIds.includes(row.id);
        })
        .forEach(function (activity) {
          var result = activity.results.find(function (entry) {
            return entry.id === row.id;
          });
          var card = node('article', undefined, 'class-card');
          card.append(node('h4', activity.label));
          if (result) {
            card.append(node('p', result.correct + '/' + result.total + ' acertos'));
            var questions = node('ol');
            activity.questions.forEach(function (question, index) {
              var outcome = result.outcomes?.[index];
              var label =
                outcome === true
                  ? 'Acertou'
                  : outcome === false
                    ? 'Errou'
                    : 'Sem correção registrada';
              var item = node('li');
              var tone = outcome === true ? 'correct' : outcome === false ? 'wrong' : 'pending';
              item.append(node('strong', label, 'outcome-' + tone), ' · ' + question.prompt);
              questions.append(item);
            });
            card.append(questions);
          } else {
            var status = activity.expiredIds?.includes(row.id)
              ? 'Tempo esgotado'
              : activity.startedIds.includes(row.id)
                ? 'Em andamento'
                : 'Pendente';
            card.append(node('p', status, status === 'Pendente' ? 'outcome-pending' : undefined));
          }
          detail.append(card);
        });
      title.focus();
    }
    function renderRows() {
      body.replaceChildren();
      rows.forEach(function (row) {
        var status = !row.assigned
          ? ['', 'Sem atividades']
          : row.delivered === row.assigned
            ? ['done', 'Concluiu']
            : row.expired && row.delivered + row.expired === row.assigned
              ? ['expired', 'Tempo esgotado']
              : row.delivered || row.started || row.expired
                ? ['started', 'Em andamento']
                : ['pending', 'Ainda não começou'];
        if (filter.value && filter.value !== status[0]) return;
        var tr = node('tr');
        var nameCell = node('td');
        button(nameCell, row.name, function () {
          showStudent(row);
        });
        tr.append(nameCell);
        [
          status[1],
          row.delivered + '/' + row.assigned,
          row.correct,
          row.total - row.correct,
          row.total ? Math.round((100 * row.correct) / row.total) + '%' : 'Sem entrega',
        ].forEach(function (value) {
          tr.append(node('td', String(value)));
        });
        body.append(tr);
      });
      empty.hidden = body.childElementCount > 0;
      wrap.hidden = !empty.hidden;
    }
    filter.addEventListener('change', renderRows);
    renderRows();
  }
  async function hub() {
    var result = await api('/classes');
    var showDashboard = user.role === 'professor' && location.pathname === '/professor';
    setNavigation(false);
    el('teacherWelcome').hidden = !showDashboard;
    el('classCreate').hidden = true;
    el('teacherActivityStart').hidden = true;
    el('activityClass').replaceChildren();
    result.classes.forEach(function (c) {
      var option = node('option', c.name);
      option.value = c.id;
      el('activityClass').append(option);
    });
    el('classMetrics').hidden = !showDashboard;
    el('teacherClassFilter').hidden = !showDashboard;
    el('classMetrics').replaceChildren();
    if (showDashboard) {
      var filter = el('dashboardClass');
      var activityFilter = el('dashboardActivity');
      var charts = el('dashboardCharts');
      var all = node('option', 'Todas as turmas');
      all.value = '';
      filter.replaceChildren(all);
      result.classes.forEach(function (c) {
        var option = node('option', c.name);
        option.value = c.id;
        filter.append(option);
      });
      var progressRequest = 0;
      async function renderClassCounts() {
        var request = ++progressRequest;
        var scope = filter.selectedOptions[0].textContent;
        var list = el('dashboardClassCounts');
        var activities = el('dashboardActivities');
        var status = el('dashboardActivityStatus');
        list.replaceChildren();
        activities.replaceChildren();
        el('classMetrics').replaceChildren();
        charts.hidden = true;
        el('dashboardStudents').hidden = true;
        activityFilter.disabled = true;
        var allActivities = node('option', 'Todas as atividades publicadas');
        allActivities.value = '';
        activityFilter.replaceChildren(allActivities);
        var visible = result.classes.filter(function (c) {
          return !filter.value || c.id === filter.value;
        });
        visible.forEach(function (c) {
          var row = node('li', undefined, 'question-row');
          row.append(
            node('strong', c.name),
            node('span', c.students + (c.students === 1 ? ' aluno' : ' alunos')),
          );
          list.append(row);
        });
        if (!visible.length) list.append(node('li', 'Você ainda não tem turmas.'));
        status.textContent = visible.length ? 'Carregando indicadores de ' + scope + '...' : '';
        try {
          var roster = new Map();
          var published = [];
          var drafts = 0;
          for (var offset = 0; offset < visible.length; offset += 5) {
            var group = visible.slice(offset, offset + 5);
            var reports = await Promise.all(
              group.map(function (c) {
                return api('/classes/' + encodeURIComponent(c.id) + '/progress');
              }),
            );
            if (request !== progressRequest) return;
            reports.forEach(function (report, index) {
              var c = group[index];
              var studentIds = report.students.map(function (student) {
                roster.set(student.id, student);
                return student.id;
              });
              drafts += report.drafts;
              report.activities.forEach(function (activity) {
                published.push(
                  Object.assign(activity, {
                    key: c.id + '/' + activity.id,
                    studentIds: studentIds,
                    label: filter.value ? activity.title : c.name + ' · ' + activity.title,
                  }),
                );
              });
            });
          }
          status.textContent = published.length
            ? 'Exibindo: ' + scope
            : 'Nenhuma atividade publicada neste filtro.';
          [
            ['Turmas no filtro', visible.length],
            ['Alunos únicos', roster.size],
            ['Atividades publicadas', published.length],
            ['Atividades em rascunho', drafts],
          ].forEach(function (metric) {
            var card = node('div');
            card.append(node('span', metric[0]), node('strong', String(metric[1])));
            el('classMetrics').append(card);
          });
          published.forEach(function (activity) {
            var option = node('option', activity.label);
            option.value = activity.key;
            activityFilter.append(option);
          });
          activityFilter.disabled = !published.length;
          function renderActivities() {
            var selected = published.filter(function (activity) {
              return !activityFilter.value || activity.key === activityFilter.value;
            });
            activities.replaceChildren();
            renderTeacherCharts(charts, selected);
            var assigned = new Set(
              selected.flatMap(function (activity) {
                return activity.studentIds;
              }),
            );
            var students = Array.from(roster.values()).filter(function (student) {
              return !activityFilter.value || assigned.has(student.id);
            });
            renderStudentProgress(students, selected, scope);
            selected.forEach(function (activity) {
              var card = node('details', undefined, 'class-card dashboard-activity');
              var summary = node('summary', activity.label);
              var counts = node(
                'p',
                activity.submitted + ' entregaram · ' + activity.pending + ' pendentes',
              );
              var questions = node('ol');
              activity.questions.forEach(function (question) {
                var item = node('li');
                item.append(
                  node('strong', question.prompt),
                  node(
                    'p',
                    activity.submitted +
                      ' responderam · ' +
                      activity.pending +
                      ' pendentes · ' +
                      question.correct +
                      ' acertos',
                  ),
                );
                questions.append(item);
              });
              card.append(summary, counts, questions);
              activities.append(card);
            });
          }
          activityFilter.onchange = renderActivities;
          renderActivities();
        } catch (error) {
          if (request === progressRequest) status.textContent = error.message;
        }
      }
      filter.onchange = renderClassCounts;
      if (result.classes.length) filter.value = result.classes[0].id;
      renderClassCounts();
    }
    currentClass = null;
    el('classHub').hidden = false;
    el('classDetail').hidden = true;
    el('classList').replaceChildren();
    (result.pending || []).forEach(function (request) {
      var card = node('article', undefined, 'class-card');
      card.append(node('h3', request.name), node('p', 'Aguardando aprovação do professor.'));
      el('classList').append(card);
    });
    el('classList').hidden = showDashboard;
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
    var requests = el('classRequests');
    requests.hidden = !teacher;
    requests.replaceChildren();
    if (teacher) {
      requests.append(node('h3', 'Solicitações de entrada'));
      requests.append(
        node('p', 'Confira o @usuário e o e-mail com o aluno antes de aprovar a conta.'),
      );
      if (!c.requests?.length) requests.append(node('p', 'Nenhuma solicitação pendente.'));
      (c.requests || []).forEach(function (request) {
        var row = node('div', undefined, 'question-row');
        var controls = node('div', undefined, 'question-controls');
        var identity = node('div');
        identity.append(node('strong', request.name + ' · @' + request.username));
        if (request.email) identity.append(node('div', request.email));
        row.append(identity, controls);
        function decide(approve) {
          return async function () {
            await api('/classes/' + id + '/memberships/' + request.id, 'POST', {
              approve: approve,
            });
            await openClass(id);
            feedback(approve ? 'Aluno aprovado.' : 'Solicitação recusada.');
          };
        }
        button(controls, 'APROVAR', decide(true));
        button(controls, 'RECUSAR', decide(false));
        requests.append(row);
      });
    }
    el('newActivity').hidden = !teacher;
    if (teacher) {
      el('inviteCode').value = '';
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
      var scheduled = a.opensAt && a.opensAt > Date.now();
      card.append(
        node('h3', a.title),
        node(
          'p',
          a.total +
            ' questões · ' +
            (scheduled
              ? 'Abre em ' +
                new Date(a.opensAt).toLocaleString('pt-BR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })
              : a.published
                ? 'Publicada'
                : 'Rascunho'),
        ),
      );
      if (a.durationMinutes)
        card.append(node('p', 'Limite após iniciar: ' + a.durationMinutes + ' min'));
      if (teacher || !scheduled)
        button(
          card,
          teacher ? 'REVISAR ATIVIDADE' : a.submitted ? 'VER CORREÇÃO' : 'RESPONDER',
          function () {
            return openActivity(a.id);
          },
          true,
        );
      if (teacher && !a.published) addPublishForm(card, id, a.id);
      if (teacher)
        button(card, 'VER RESULTADOS', function () {
          return results(a.id);
        });
      el('activityList').append(card);
    });
  }
  function addPublishForm(card, classId, activityId) {
    var panel = node('details', undefined, 'activity-publication');
    panel.append(node('summary', 'Publicar ou agendar'));
    var form = node('form');
    var opening = field(
      form,
      'Data e hora de abertura (hora local, opcional)',
      'input',
      'opening-' + activityId,
    );
    opening.type = 'datetime-local';
    opening.required = false;
    var duration = field(form, 'Limite em minutos (opcional)', 'input', 'duration-' + activityId);
    duration.type = 'number';
    duration.min = '1';
    duration.max = '1440';
    duration.required = false;
    var submit = node('button', 'CONFIRMAR PUBLICAÇÃO', 'primary-button');
    submit.type = 'submit';
    var errorMessage = node('p', undefined, 'publication-error');
    errorMessage.setAttribute('role', 'alert');
    form.append(submit, errorMessage);
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      submit.disabled = true;
      errorMessage.textContent = '';
      try {
        var options = {};
        if (opening.value) options.opensAt = new Date(opening.value).toISOString();
        if (duration.value) options.durationMinutes = Number(duration.value);
        await api(
          '/classes/' + classId + '/activities/' + activityId + '/publish',
          'POST',
          options,
        );
        await openClass(classId);
        feedback(opening.value ? 'Abertura agendada.' : 'Atividade publicada.');
      } catch (error) {
        errorMessage.textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    });
    panel.append(form);
    card.append(panel);
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
  function addQuestion(
    seed,
    { focus = true, replaceBlank = false, editors = el('questionEditors'), removable = true } = {},
  ) {
    var first = editors.firstElementChild;
    var replace = replaceBlank && editors.children.length === 1 && first.isBlankQuestion();
    if (!replace && editors.children.length >= 10)
      return feedback('O limite é de dez questões.', true);
    var index = replace ? questionCount : ++questionCount,
      box = node('fieldset', undefined, 'class-question');
    box.append(node('legend'));
    function numberQuestions() {
      Array.from(editors.children).forEach(function (question, position) {
        question.firstElementChild.textContent = 'Questão ' + (position + 1);
      });
    }
    if (seed && seed.sportsData) renderSportsData(box, seed.sportsData);
    var prompt = field(box, 'Enunciado', 'textarea', 'q-prompt-' + index, 800);
    var type = field(box, 'Formato', 'select', 'q-type-' + index);
    ['numeric', 'choice'].forEach(function (v) {
      var option = node('option', v === 'numeric' ? 'Resposta numérica' : 'Múltipla escolha');
      option.value = v;
      type.append(option);
    });
    var optionsWrap = node('fieldset', undefined, 'class-alternatives');
    optionsWrap.append(node('legend', 'Alternativas e resposta correta'));
    box.append(optionsWrap);
    var rows = [];
    var addOption = button(
      optionsWrap,
      'ADICIONAR ALTERNATIVA',
      function () {
        appendOption('', false);
        rows[rows.length - 1].input.focus();
      },
      true,
    );

    function updateOptions() {
      addOption.hidden = rows.length >= 5;
      rows.forEach(function (row, position) {
        var letter = String.fromCharCode(65 + position);
        row.input.setAttribute('aria-label', 'Texto da alternativa ' + letter);
        row.radio.setAttribute('aria-label', 'Marcar alternativa ' + letter + ' como correta');
        row.remove.hidden = rows.length <= 2;
      });
    }
    function appendOption(value, correct) {
      if (rows.length >= 5) return;
      var wrapper = node('div', undefined, 'class-option class-option-editor');
      var input = node('input');
      input.maxLength = 180;
      input.required = type.value === 'choice';
      input.value = value;
      var radio = node('input');
      radio.type = 'radio';
      radio.name = 'correct-option-' + index;
      radio.checked = correct;
      wrapper.append(radio, input);
      var row = {
        input: input,
        radio: radio,
        remove: button(
          wrapper,
          'REMOVER',
          function () {
            if (rows.length <= 2) return;
            rows.splice(rows.indexOf(row), 1);
            wrapper.remove();
            updateOptions();
          },
          true,
        ),
      };
      rows.push(row);
      optionsWrap.insertBefore(wrapper, addOption);
      updateOptions();
    }
    var numberWrap = node('div');
    box.append(numberWrap);
    var answer = field(numberWrap, 'Resposta correta', 'input', 'q-answer-' + index, 100);
    answer.inputMode = 'decimal';
    var explanation = field(box, 'Explicação da resposta', 'textarea', 'q-explain-' + index, 800);
    type.addEventListener('change', function () {
      var choice = type.value === 'choice';
      optionsWrap.hidden = !choice;
      numberWrap.hidden = choice;
      answer.required = !choice;
      rows.forEach(function (row) {
        row.input.required = choice;
      });
    });
    (seed?.options || ['', '']).forEach(function (value, position) {
      appendOption(value, seed?.answer === position && seed?.type === 'choice');
    });
    box.isBlankQuestion = function () {
      return (
        !seed &&
        type.value === 'numeric' &&
        ![prompt, answer, explanation].some(function (input) {
          return input.value.trim();
        })
      );
    };
    box.readQuestion = function () {
      var q = {
        type: type.value,
        prompt: prompt.value.trim(),
        explanation: explanation.value.trim(),
      };
      if (type.value === 'choice') {
        q.options = rows.map(function (row) {
          return row.input.value.trim();
        });
        q.answer = rows.findIndex(function (row) {
          return row.radio.checked;
        });
        if (
          q.answer < 0 ||
          q.options.some(function (option) {
            return !option;
          }) ||
          new Set(q.options).size !== q.options.length
        )
          throw new Error('Preencha alternativas diferentes e marque a resposta correta.');
      } else {
        if (!/^-?\d+(?:[.,]\d+)?$/.test(answer.value.trim()))
          throw new Error('Informe um gabarito numérico válido.');
        q.answer = Number(answer.value.replace(',', '.'));
      }
      if (seed && seed.footballToken) q.footballToken = seed.footballToken;
      return q;
    };
    if (seed) {
      prompt.value = seed.prompt || '';
      type.value = seed.type || 'numeric';
      if (seed.type !== 'choice' && seed.answer !== undefined) answer.value = String(seed.answer);
      explanation.value = seed.explanation || '';
    }
    type.dispatchEvent(new Event('change'));

    if (removable)
      button(box, 'REMOVER QUESTÃO', function () {
        box.remove();
        numberQuestions();
      });
    if (replace) first.replaceWith(box);
    else editors.append(box);
    numberQuestions();
    if (focus) {
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      prompt.focus({ preventScroll: true });
    }
    return box;
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
  function addCopyForm(parent, path, sourceId, questionIndex, controls = parent) {
    var picker = node('div', undefined, 'class-panel');
    picker.hidden = true;
    var message = node('p');
    message.setAttribute('role', 'status');
    var select = node('select');
    select.setAttribute('aria-label', 'Turma de destino');
    var submit = button(
      picker,
      'COPIAR PARA A TURMA',
      async function () {
        if (!select.value) {
          message.textContent = 'Selecione uma turma de destino.';
          select.focus();
          return;
        }
        var result = await api(path + '/copy', 'POST', {
          targetClassId: select.value,
          questionIndex: questionIndex,
        });
        message.textContent = result.copied
          ? 'Rascunho criado em ' + select.selectedOptions[0].textContent + '.'
          : 'Já existe uma cópia nessa turma.';
      },
      true,
    );
    picker.prepend(select);
    picker.append(message);
    button(
      controls,
      questionIndex === undefined ? 'COPIAR ATIVIDADE' : 'COPIAR QUESTÃO',
      async function () {
        if (!picker.hidden) {
          picker.hidden = true;
          return;
        }
        var classes = (await api('/classes')).classes.filter(function (c) {
          return questionIndex !== undefined || c.id !== sourceId;
        });
        var placeholder = node('option', 'Selecione uma turma');
        placeholder.value = '';
        select.replaceChildren(placeholder);
        classes.forEach(function (c) {
          var option = node('option', c.name);
          option.value = c.id;
          select.append(option);
        });
        message.textContent = classes.length ? '' : 'Crie outra turma para copiar esta atividade.';
        submit.hidden = !classes.length;
        picker.hidden = false;
        select.focus();
      },
    );
    parent.append(picker);
  }
  async function showQuestions() {
    var list = el('teacherQuestions');
    var questions = (await api('/classes/questions')).questions;
    list.hidden = false;
    list.replaceChildren();
    el('classGreeting').textContent = 'Minhas questões';
    el('classIntro').textContent = 'Edite, exclua ou copie suas questões para outra turma.';
    setNavigation(false);
    if (!questions.length)
      list.append(node('p', 'As questões das atividades que você criar aparecem aqui.'));
    questions.forEach(function (question) {
      var card = node('article', undefined, 'class-card');
      var row = node('div', undefined, 'question-row');
      var summary = node('div', undefined, 'question-summary');
      var controls = node('div', undefined, 'question-controls');
      summary.append(
        node('h2', question.prompt),
        node('p', question.activityTitle + ' · ' + question.className),
        node('p', question.type === 'choice' ? 'Múltipla escolha' : 'Resposta numérica'),
      );
      row.append(summary, controls);
      card.append(row);
      var path = '/classes/' + question.classId + '/activities/' + question.activityId;
      var editPath = path + '/library/' + question.index;
      var editor = node('form');
      editor.hidden = true;
      button(controls, 'EDITAR', async function () {
        if (!editor.hidden) return;
        var activity = await api(path);
        var original = activity.questions[question.index];
        var saved = activity.libraryQuestions?.[question.index] || original;
        editor.replaceChildren(node('p', 'As alterações valem para novas cópias da questão.'));
        var fields = node('div');
        editor.append(fields);
        var questionEditor = addQuestion(
          Object.assign({}, saved, { sportsData: original.sportsData }),
          {
            editors: fields,
            focus: false,
            removable: false,
          },
        );
        var save = node('button', 'SALVAR', 'primary-button');
        save.type = 'submit';
        editor.append(save);
        button(editor, 'CANCELAR', function () {
          editor.hidden = true;
        });
        editor.onsubmit = async function (event) {
          event.preventDefault();
          save.disabled = true;
          try {
            await api(editPath, 'PATCH', { question: questionEditor.readQuestion() });
            await showQuestions();
            feedback('Questão atualizada na biblioteca.');
          } catch (error) {
            feedback(error.message, true);
          } finally {
            save.disabled = false;
          }
        };
        editor.hidden = false;
        questionEditor.querySelector('textarea').focus();
      });
      button(controls, 'EXCLUIR', async function () {
        if (
          !window.confirm(
            'Excluir esta questão da biblioteca? As atividades que já a usam serão mantidas.',
          )
        )
          return;
        await api(editPath, 'PATCH', { question: null });
        await showQuestions();
        feedback('Questão excluída da biblioteca.');
      });
      addCopyForm(card, path, question.classId, question.index, controls);
      card.append(editor);
      list.append(card);
    });
  }

  async function openActivity(id) {
    var path = '/classes/' + currentClass.id + '/activities/' + id,
      a = await api(path),
      panel = el('activityView');
    if (user.role === 'aluno' && !a.submission) {
      if (a.deadlineAt && a.locked) throw new Error('O tempo desta atividade acabou.');
      if (
        a.durationMinutes &&
        !a.deadlineAt &&
        !window.confirm('Você terá ' + a.durationMinutes + ' min após iniciar. Começar agora?')
      )
        return;
      await api(path + '/start', 'POST');
      if (a.durationMinutes) a = await api(path);
      if (a.locked) throw new Error('O tempo desta atividade acabou.');
      if (!currentClass || path !== '/classes/' + currentClass.id + '/activities/' + id) return;
    }
    panel.hidden = false;
    panel.replaceChildren(node('h2', a.title));
    if (user.role === 'professor') {
      addCopyForm(panel, path, currentClass.id);
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
      if (a.deadlineAt) {
        var timer = node('p');
        formEl.prepend(timer);
        function updateTimer() {
          if (!timer.isConnected) return;
          var seconds = Math.max(0, Math.ceil((a.deadlineAt - Date.now()) / 1000));
          timer.textContent = seconds
            ? 'Tempo restante: ' +
              Math.floor(seconds / 60) +
              ':' +
              String(seconds % 60).padStart(2, '0')
            : 'Tempo esgotado.';
          if (seconds) setTimeout(updateTimer, 1000);
          else send.disabled = true;
        }
        updateTimer();
      }
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
          send.disabled = Boolean(a.deadlineAt && a.deadlineAt <= Date.now());
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
      el('teacherQuestionsLink').hidden = !teacher;
      if (teacher && location.pathname === '/professor/questoes') {
        document.title = 'Minhas questões | MathStats';
        await showQuestions();
        return;
      }
      var dashboard = teacher && location.pathname === '/professor';
      document.title = dashboard ? 'Painel do professor | MathStats' : 'Turmas | MathStats';
      el('classGreeting').textContent =
        (dashboard ? 'Bem-vindo, ' : 'Suas turmas, ') + user.displayName;
      el('newClassButton').hidden = !teacher || dashboard;
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
    if (c.pending) {
      el('classJoin').reset();
      await hub();
      feedback('Solicitação enviada. Aguarde a aprovação do professor.');
      return;
    }
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
  action(el('newClassButton'), showCreateClass);
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
  action(el('generateClassInvite'), async function () {
    var id = currentClass.id;
    var result = await api('/classes/' + id + '/invite-code', 'POST');
    if (currentClass?.id !== id) return;
    el('inviteCode').value = result.code;
    el('inviteCode').select();
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
  init();
})();
