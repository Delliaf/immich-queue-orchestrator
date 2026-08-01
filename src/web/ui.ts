export const UI_HTML = String.raw`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Immich Queue Orchestrator</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b0f14;
      --panel: #121922;
      --panel-2: #17212d;
      --line: #263445;
      --text: #e8eef6;
      --muted: #91a1b5;
      --green: #55d89a;
      --orange: #ffb45b;
      --red: #ff6b78;
      --blue: #69a8ff;
      --shadow: 0 20px 50px #0006;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at 10% -20%, #194a5538, transparent 36rem),
        radial-gradient(circle at 100% 0, #49356c36, transparent 32rem),
        var(--bg);
      color: var(--text);
      font: 15px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    main { width: min(1280px, calc(100% - 32px)); margin: 0 auto; padding: 28px 0 56px; }
    header { display: flex; gap: 24px; align-items: center; justify-content: space-between; margin-bottom: 22px; }
    h1 { font-size: clamp(22px, 4vw, 34px); margin: 0; letter-spacing: -.035em; }
    h1 span { color: var(--green); }
    .subtitle { color: var(--muted); margin: 4px 0 0; }
    .auth { display: flex; gap: 8px; align-items: center; }
    input {
      background: #090d12aa; border: 1px solid var(--line); border-radius: 10px;
      color: var(--text); padding: 10px 12px; min-width: 210px;
    }
    button {
      appearance: none; border: 1px solid var(--line); border-radius: 10px; padding: 10px 13px;
      background: var(--panel-2); color: var(--text); cursor: pointer; font-weight: 650;
      transition: transform .12s ease, border-color .12s ease, background .12s ease;
    }
    button:hover { transform: translateY(-1px); border-color: #47617c; }
    button:disabled { cursor: not-allowed; opacity: .45; transform: none; }
    button.primary { background: #146a4d; border-color: #258d6b; }
    button.warn { background: #6c4818; border-color: #9b6d2a; }
    button.danger { background: #6b2933; border-color: #9e3b49; }
    .banner { padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; margin-bottom: 16px; background: #101722cc; }
    .banner.error { border-color: #8c3340; background: #421b22; }
    .banner.warn { border-color: #80602f; background: #352814; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 12px; }
    .card, section { background: linear-gradient(160deg, #17212dd8, #111821e8); border: 1px solid var(--line); box-shadow: var(--shadow); }
    .card { border-radius: 14px; padding: 16px; min-height: 112px; }
    .label { color: var(--muted); font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
    .value { font-size: 25px; font-weight: 750; margin-top: 9px; letter-spacing: -.03em; }
    .detail { color: var(--muted); font-size: 13px; margin-top: 3px; }
    .ok { color: var(--green); } .bad { color: var(--red); } .attention { color: var(--orange); }
    section { border-radius: 16px; padding: 18px; margin-top: 12px; min-width: 0; }
    section h2 { margin: 0 0 14px; font-size: 17px; }
    .actions { display: flex; flex-wrap: wrap; gap: 9px; }
    table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
    th, td { border-bottom: 1px solid var(--line); padding: 10px 8px; text-align: right; }
    th { color: var(--muted); font-size: 12px; text-transform: uppercase; }
    th:first-child, td:first-child { text-align: left; }
    tr:last-child td { border-bottom: 0; }
    .pill { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; padding: 3px 8px; font-size: 12px; }
    .pill.paused { color: var(--orange); border-color: #76582b; background: #392a13; }
    .pill.open { color: var(--green); border-color: #256c52; background: #12362a; }
    .two { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; }
    pre { white-space: pre-wrap; word-break: break-word; color: #b7c7db; margin: 0; font-size: 12px; max-height: 360px; overflow: auto; }
    .hidden { display: none; }
    @media (max-width: 900px) { .grid { grid-template-columns: repeat(2, 1fr); } .two { grid-template-columns: 1fr; } }
    @media (max-width: 600px) { main { width: min(100% - 20px, 1280px); padding-top: 18px; } header { align-items: flex-start; flex-direction: column; } .auth { width: 100%; } input { min-width: 0; flex: 1; } .grid { grid-template-columns: 1fr; } table { font-size: 12px; } th, td { padding: 8px 4px; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div><h1>Immich Queue <span>Orchestrator</span></h1><p class="subtitle">Загрузка отдельно. Обработка последовательно. Состояние восстанавливается.</p></div>
      <div id="auth-controls" class="auth"><input id="password" type="password" autocomplete="current-password" placeholder="Пароль панели"><button id="save-password">Подключить</button></div>
    </header>
    <div id="banner" class="banner">Подключение к контроллеру…</div>
    <div class="grid">
      <div class="card"><div class="label">Immich API</div><div id="api" class="value">—</div><div id="version" class="detail">—</div></div>
      <div class="card"><div class="label">Состояние</div><div id="phase" class="value">—</div><div id="mode" class="detail">—</div></div>
      <div class="card"><div class="label">CPU, среднее</div><div id="cpu" class="value">—</div><div id="cpu-detail" class="detail">—</div></div>
      <div class="card"><div class="label">Медиатека</div><div id="assets" class="value">—</div><div id="usage" class="detail">—</div></div>
    </div>
    <section>
      <h2>Управление</h2>
      <div class="actions">
        <button class="primary" data-action="arm-autopilot">Включить автопилот</button>
        <button data-action="capture-begin">Начать приём файлов</button>
        <button data-action="capture-end">Загрузка закончена</button>
        <button data-action="process">Обработать накопившееся</button>
        <button class="warn" data-action="pause">Приостановить контроллер</button>
        <button data-action="resume">Продолжить контроллер</button>
        <button class="danger" data-action="release">Освободить управление</button>
      </div>
      <div id="ambiguous-actions" class="actions hidden" style="margin-top:12px">
        <button data-decision="assume-sent">Считать start выполненным</button>
        <button class="warn" data-decision="retry-start">Повторить start вручную</button>
        <button class="danger" data-decision="abort">Прервать и восстановить очереди</button>
      </div>
    </section>
    <div class="two">
      <section><h2>Очереди Immich</h2><div style="overflow:auto"><table><thead><tr><th>Очередь</th><th>Состояние</th><th>Active</th><th>Waiting</th><th>Paused</th><th>Delayed</th><th>Failed</th></tr></thead><tbody id="queues"></tbody></table></div></section>
      <section><h2>Текущий этап</h2><div id="stage" class="detail">Нет активного прохода</div></section>
    </div>
    <section><h2>Эффективная конфигурация</h2><pre id="config">—</pre></section>
  </main>
  <script>
    const passwordInput = document.querySelector('#password');
    let authenticationFailed = false;
    passwordInput.value = sessionStorage.getItem('orchestrator-password') || '';
    document.querySelector('#save-password').addEventListener('click', () => {
      sessionStorage.setItem('orchestrator-password', passwordInput.value);
      authenticationFailed = false;
      refresh();
    });

    const headers = () => ({
      'content-type': 'application/json',
      ...(passwordInput.value ? { authorization: 'Bearer ' + passwordInput.value } : {}),
    });
    const humanBytes = (value) => {
      if (!Number.isFinite(value)) return '—';
      const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']; let index = 0; let size = value;
      while (size >= 1024 && index < units.length - 1) { size /= 1024; index++; }
      return size.toFixed(index < 2 ? 0 : 1) + ' ' + units[index];
    };
    const escapeHtml = (value) => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
    const phaseClass = (phase) => ['AMBIGUOUS_START', 'DEGRADED'].includes(phase) ? 'bad' : phase === 'PAUSED_BY_OPERATOR' ? 'attention' : 'ok';
    async function api(path, init = {}) {
      const response = await fetch(path, { ...init, headers: { ...headers(), ...(init.headers || {}) } });
      const text = await response.text();
      const data = text ? JSON.parse(text) : null;
      if (!response.ok) throw new Error(data?.message || 'HTTP ' + response.status);
      return data;
    }
    async function refresh() {
      if (authenticationFailed) return;
      try {
        const [status, config] = await Promise.all([api('/api/status'), api('/api/config/effective')]);
        render(status, config);
      } catch (error) {
        if (error.message.includes('password') || error.message.includes('Unauthorized')) authenticationFailed = true;
        const banner = document.querySelector('#banner');
        banner.className = 'banner error'; banner.textContent = error.message + (error.message.includes('password') || error.message.includes('Unauthorized') ? ' — укажите пароль панели.' : '');
      }
    }
    function render(status, config) {
      const run = status.state?.run;
      document.querySelector('#auth-controls').classList.toggle('hidden', status.control.authentication === 'none');
      const banner = document.querySelector('#banner');
      if (status.fatalError || status.lastPollError) {
        banner.className = 'banner error'; banner.textContent = status.fatalError || status.lastPollError;
      } else if (!status.control.enabled || status.control.dryRun) {
        banner.className = 'banner warn'; banner.textContent = 'Read-only: включите control.enabled и отключите dryRun в конфигурации.';
      } else if (run?.phase === 'AMBIGUOUS_START') {
        banner.className = 'banner error'; banner.textContent = run.lastError || 'Неоднозначный start missing: требуется решение оператора.';
      } else if (status.control.authentication === 'none') {
        banner.className = 'banner warn'; banner.textContent = 'Панель работает без пароля. Используйте только в доверенной домашней сети.';
      } else {
        banner.className = 'banner'; banner.textContent = status.state?.autopilotArmed ? 'Автопилот вооружён и сохраняется после перезапуска.' : 'Контроллер готов. Самостоятельный запуск без команды запрещён.';
      }
      document.querySelector('#api').textContent = status.apiConnected ? 'Подключён' : 'Недоступен';
      document.querySelector('#api').className = 'value ' + (status.apiConnected ? 'ok' : 'bad');
      document.querySelector('#version').textContent = status.version ? 'Immich ' + status.version.major + '.' + status.version.minor + '.' + status.version.patch : 'Версия неизвестна';
      const phase = run?.phase || 'IDLE'; document.querySelector('#phase').textContent = phase;
      document.querySelector('#phase').className = 'value ' + phaseClass(phase);
      document.querySelector('#mode').textContent = run ? run.mode + ' · run ' + run.id.slice(0, 8) : 'Нет активного run';
      document.querySelector('#cpu').textContent = status.cpu.averagePercent == null ? '—' : status.cpu.averagePercent.toFixed(1) + '%';
      document.querySelector('#cpu-detail').textContent = !status.cpu.monitoring
        ? 'В простое мониторинг отключён'
        : status.cpu.currentPercent == null
          ? 'Ожидание выборки'
          : 'Сейчас ' + status.cpu.currentPercent.toFixed(1) + '% · пик ' + status.cpu.peakPercent.toFixed(1) + '%';
      const stats = status.serverStatistics; document.querySelector('#assets').textContent = stats ? (stats.photos + stats.videos).toLocaleString('ru-RU') : '—';
      document.querySelector('#usage').textContent = stats ? stats.photos + ' фото · ' + stats.videos + ' видео · ' + humanBytes(stats.usage) : '—';
      document.querySelector('#queues').innerHTML = status.queues.map(q => '<tr><td>' + escapeHtml(q.name) + '</td><td><span class="pill ' + (q.isPaused ? 'paused">пауза' : 'open">работает') + '</span></td><td>' + q.statistics.active + '</td><td>' + q.statistics.waiting + '</td><td>' + q.statistics.paused + '</td><td>' + q.statistics.delayed + '</td><td>' + q.statistics.failed + '</td></tr>').join('');
      const stage = run?.stages?.[run.currentStageIndex];
      document.querySelector('#stage').innerHTML = stage ? '<div class="value">' + escapeHtml(stage.id) + '</div><div>' + escapeHtml(stage.queue) + '</div><div style="margin-top:8px">' + escapeHtml(stage.status) + '</div><div>Шаг ' + (run.currentStageIndex + 1) + ' из ' + run.stages.length + '</div>' : 'Нет активного этапа';
      document.querySelector('#config').textContent = JSON.stringify(config, null, 2);
      document.querySelectorAll('[data-action]').forEach(button => { button.disabled = !status.control.enabled || status.control.dryRun; });
      document.querySelector('#ambiguous-actions').classList.toggle('hidden', run?.phase !== 'AMBIGUOUS_START');
    }
    const actionPaths = {
      'arm-autopilot': '/api/actions/arm-autopilot', 'capture-begin': '/api/actions/capture-begin',
      'capture-end': '/api/actions/capture-end', process: '/api/actions/process', pause: '/api/actions/pause',
      resume: '/api/actions/resume', release: '/api/actions/release'
    };
    document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', async () => {
      const action = button.dataset.action;
      if (!confirm('Выполнить действие «' + button.textContent.trim() + '»?')) return;
      button.disabled = true;
      try { await api(actionPaths[action], { method: 'POST', body: '{}' }); await refresh(); }
      catch (error) { alert(error.message); await refresh(); }
    }));
    document.querySelectorAll('[data-decision]').forEach(button => button.addEventListener('click', async () => {
      const decision = button.dataset.decision;
      if (!confirm('Подтвердить решение для неоднозначного start: ' + decision + '?')) return;
      try { await api('/api/actions/resolve-ambiguous', { method: 'POST', body: JSON.stringify({ decision }) }); await refresh(); }
      catch (error) { alert(error.message); await refresh(); }
    }));
    refresh(); setInterval(refresh, 5000);
  </script>
</body>
</html>`;
