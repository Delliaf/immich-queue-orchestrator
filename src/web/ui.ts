export const UI_HTML = String.raw`<!doctype html>
<html lang="en">
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
    .header-actions { display: flex; gap: 8px; align-items: center; }
    .language { min-width: 48px; }
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
    @media (max-width: 600px) { main { width: min(100% - 20px, 1280px); padding-top: 18px; } header { align-items: flex-start; flex-direction: column; } .header-actions, .auth { width: 100%; } input { min-width: 0; flex: 1; } .grid { grid-template-columns: 1fr; } table { font-size: 12px; } th, td { padding: 8px 4px; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div><h1>Immich Queue <span>Orchestrator</span></h1><p class="subtitle" data-i18n="subtitle">Uploads first. Processing in sequence. State survives restarts.</p></div>
      <div class="header-actions"><button id="language-toggle" class="language" type="button" aria-label="Switch language">RU</button><div id="auth-controls" class="auth"><input id="password" type="password" autocomplete="current-password" placeholder="Panel password" data-i18n-placeholder="panelPassword"><button id="save-password" data-i18n="connect">Connect</button></div></div>
    </header>
    <div id="banner" class="banner" data-i18n="connecting">Connecting to the controller…</div>
    <div class="grid">
      <div class="card"><div class="label">Immich API</div><div id="api" class="value">—</div><div id="version" class="detail">—</div></div>
      <div class="card"><div class="label" data-i18n="state">State</div><div id="phase" class="value">—</div><div id="mode" class="detail">—</div></div>
      <div class="card"><div class="label" data-i18n="cpuAverage">CPU average</div><div id="cpu" class="value">—</div><div id="cpu-detail" class="detail">—</div></div>
      <div class="card"><div class="label" data-i18n="library">Library</div><div id="assets" class="value">—</div><div id="usage" class="detail">—</div></div>
    </div>
    <section>
      <h2 data-i18n="controls">Controls</h2>
      <div class="actions">
        <button class="primary" data-action="arm-autopilot" data-i18n="armAutopilot">Arm autopilot</button>
        <button data-action="capture-begin" data-i18n="beginCapture">Begin upload capture</button>
        <button data-action="capture-end" data-i18n="uploadsFinished">Uploads finished</button>
        <button data-action="process" data-i18n="processBacklog">Process backlog</button>
        <button class="warn" data-action="pause" data-i18n="pauseController">Pause controller</button>
        <button data-action="resume" data-i18n="resumeController">Resume controller</button>
        <button class="danger" data-action="release" data-i18n="releaseControl">Release control</button>
      </div>
      <div id="ambiguous-actions" class="actions hidden" style="margin-top:12px">
        <button data-decision="assume-sent" data-i18n="assumeStartSent">Assume start was sent</button>
        <button class="warn" data-decision="retry-start" data-i18n="retryStart">Retry start manually</button>
        <button class="danger" data-decision="abort" data-i18n="abortRestore">Abort and restore queues</button>
      </div>
    </section>
    <div class="two">
      <section><h2 data-i18n="queues">Immich queues</h2><div style="overflow:auto"><table><thead><tr><th data-i18n="queue">Queue</th><th data-i18n="status">Status</th><th>Active</th><th>Waiting</th><th>Paused</th><th>Delayed</th><th>Failed</th></tr></thead><tbody id="queues"></tbody></table></div></section>
      <section><h2 data-i18n="currentStage">Current stage</h2><div id="stage" class="detail" data-i18n="noActiveStage">No active stage</div></section>
    </div>
    <section><h2 data-i18n="effectiveConfiguration">Effective configuration</h2><pre id="config">—</pre></section>
  </main>
  <script>
    const messages = {
      en: {
        subtitle: 'Uploads first. Processing in sequence. State survives restarts.', panelPassword: 'Panel password', connect: 'Connect', connecting: 'Connecting to the controller…',
        state: 'State', cpuAverage: 'CPU average', library: 'Library', controls: 'Controls', armAutopilot: 'Arm autopilot', beginCapture: 'Begin upload capture',
        uploadsFinished: 'Uploads finished', processBacklog: 'Process backlog', pauseController: 'Pause controller', resumeController: 'Resume controller', releaseControl: 'Release control',
        assumeStartSent: 'Assume start was sent', retryStart: 'Retry start manually', abortRestore: 'Abort and restore queues', queues: 'Immich queues', queue: 'Queue', status: 'Status',
        currentStage: 'Current stage', noActiveStage: 'No active stage', effectiveConfiguration: 'Effective configuration', providePassword: ' — enter the panel password.',
        readOnly: 'Read-only: enable control.enabled and disable dryRun in the configuration.', ambiguousRequired: 'Ambiguous missing-job start: an operator decision is required.',
        trustedNetwork: 'The panel has no password. Use it only on a trusted home network.', armed: 'Autopilot is armed and persists across restarts.', ready: 'Controller ready. Automatic start without a command is disabled.',
        connected: 'Connected', unavailable: 'Unavailable', versionUnknown: 'Version unknown', noActiveRun: 'No active run', idleCpuDisabled: 'Monitoring is disabled while idle',
        waitingSample: 'Waiting for a sample', nowPeak: 'Now {current}% · peak {peak}%', assetCounts: '{photos} photos · {videos} videos · {usage}', paused: 'paused', running: 'running',
        stepOf: 'Step {current} of {total}', confirmAction: 'Run “{action}”?', confirmDecision: 'Confirm the ambiguous-start decision: {decision}?', switchLanguage: 'Switch to Russian'
      },
      ru: {
        subtitle: 'Загрузка отдельно. Обработка последовательно. Состояние восстанавливается.', panelPassword: 'Пароль панели', connect: 'Подключить', connecting: 'Подключение к контроллеру…',
        state: 'Состояние', cpuAverage: 'CPU, среднее', library: 'Медиатека', controls: 'Управление', armAutopilot: 'Включить автопилот', beginCapture: 'Начать приём файлов',
        uploadsFinished: 'Загрузка закончена', processBacklog: 'Обработать накопившееся', pauseController: 'Приостановить контроллер', resumeController: 'Продолжить контроллер', releaseControl: 'Освободить управление',
        assumeStartSent: 'Считать start выполненным', retryStart: 'Повторить start вручную', abortRestore: 'Прервать и восстановить очереди', queues: 'Очереди Immich', queue: 'Очередь', status: 'Состояние',
        currentStage: 'Текущий этап', noActiveStage: 'Нет активного этапа', effectiveConfiguration: 'Эффективная конфигурация', providePassword: ' — укажите пароль панели.',
        readOnly: 'Read-only: включите control.enabled и отключите dryRun в конфигурации.', ambiguousRequired: 'Неоднозначный start missing: требуется решение оператора.',
        trustedNetwork: 'Панель работает без пароля. Используйте только в доверенной домашней сети.', armed: 'Автопилот вооружён и сохраняется после перезапуска.', ready: 'Контроллер готов. Самостоятельный запуск без команды запрещён.',
        connected: 'Подключён', unavailable: 'Недоступен', versionUnknown: 'Версия неизвестна', noActiveRun: 'Нет активного run', idleCpuDisabled: 'В простое мониторинг отключён',
        waitingSample: 'Ожидание выборки', nowPeak: 'Сейчас {current}% · пик {peak}%', assetCounts: '{photos} фото · {videos} видео · {usage}', paused: 'пауза', running: 'работает',
        stepOf: 'Шаг {current} из {total}', confirmAction: 'Выполнить действие «{action}»?', confirmDecision: 'Подтвердить решение для неоднозначного start: {decision}?', switchLanguage: 'Переключить на английский'
      }
    };
    let language = localStorage.getItem('orchestrator-language') === 'ru' ? 'ru' : 'en';
    const t = (key, values = {}) => Object.entries(values).reduce((text, entry) => text.replaceAll('{' + entry[0] + '}', String(entry[1])), messages[language][key]);
    function applyLanguage() {
      document.documentElement.lang = language;
      document.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = t(element.dataset.i18n); });
      document.querySelectorAll('[data-i18n-placeholder]').forEach(element => { element.placeholder = t(element.dataset.i18nPlaceholder); });
      const toggle = document.querySelector('#language-toggle');
      toggle.textContent = language === 'en' ? 'RU' : 'EN';
      toggle.setAttribute('aria-label', t('switchLanguage'));
    }
    document.querySelector('#language-toggle').addEventListener('click', () => {
      language = language === 'en' ? 'ru' : 'en';
      localStorage.setItem('orchestrator-language', language);
      applyLanguage();
      refresh();
    });
    applyLanguage();

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
        banner.className = 'banner error'; banner.textContent = error.message + (error.message.includes('password') || error.message.includes('Unauthorized') ? t('providePassword') : '');
      }
    }
    function render(status, config) {
      const run = status.state?.run;
      document.querySelector('#auth-controls').classList.toggle('hidden', status.control.authentication === 'none');
      const banner = document.querySelector('#banner');
      if (status.fatalError || status.lastPollError) {
        banner.className = 'banner error'; banner.textContent = status.fatalError || status.lastPollError;
      } else if (!status.control.enabled || status.control.dryRun) {
        banner.className = 'banner warn'; banner.textContent = t('readOnly');
      } else if (run?.phase === 'AMBIGUOUS_START') {
        banner.className = 'banner error'; banner.textContent = run.lastError || t('ambiguousRequired');
      } else if (status.control.authentication === 'none') {
        banner.className = 'banner warn'; banner.textContent = t('trustedNetwork');
      } else {
        banner.className = 'banner'; banner.textContent = status.state?.autopilotArmed ? t('armed') : t('ready');
      }
      document.querySelector('#api').textContent = status.apiConnected ? t('connected') : t('unavailable');
      document.querySelector('#api').className = 'value ' + (status.apiConnected ? 'ok' : 'bad');
      document.querySelector('#version').textContent = status.version ? 'Immich ' + status.version.major + '.' + status.version.minor + '.' + status.version.patch : t('versionUnknown');
      const phase = run?.phase || 'IDLE'; document.querySelector('#phase').textContent = phase;
      document.querySelector('#phase').className = 'value ' + phaseClass(phase);
      document.querySelector('#mode').textContent = run ? run.mode + ' · run ' + run.id.slice(0, 8) : t('noActiveRun');
      document.querySelector('#cpu').textContent = status.cpu.averagePercent == null ? '—' : status.cpu.averagePercent.toFixed(1) + '%';
      document.querySelector('#cpu-detail').textContent = !status.cpu.monitoring
        ? t('idleCpuDisabled')
        : status.cpu.currentPercent == null
          ? t('waitingSample')
          : t('nowPeak', { current: status.cpu.currentPercent.toFixed(1), peak: status.cpu.peakPercent.toFixed(1) });
      const stats = status.serverStatistics; document.querySelector('#assets').textContent = stats ? (stats.photos + stats.videos).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US') : '—';
      document.querySelector('#usage').textContent = stats ? t('assetCounts', { photos: stats.photos, videos: stats.videos, usage: humanBytes(stats.usage) }) : '—';
      document.querySelector('#queues').innerHTML = status.queues.map(q => '<tr><td>' + escapeHtml(q.name) + '</td><td><span class="pill ' + (q.isPaused ? 'paused">' + t('paused') : 'open">' + t('running')) + '</span></td><td>' + q.statistics.active + '</td><td>' + q.statistics.waiting + '</td><td>' + q.statistics.paused + '</td><td>' + q.statistics.delayed + '</td><td>' + q.statistics.failed + '</td></tr>').join('');
      const stage = run?.stages?.[run.currentStageIndex];
      document.querySelector('#stage').innerHTML = stage ? '<div class="value">' + escapeHtml(stage.id) + '</div><div>' + escapeHtml(stage.queue) + '</div><div style="margin-top:8px">' + escapeHtml(stage.status) + '</div><div>' + t('stepOf', { current: run.currentStageIndex + 1, total: run.stages.length }) + '</div>' : t('noActiveStage');
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
      if (!confirm(t('confirmAction', { action: button.textContent.trim() }))) return;
      button.disabled = true;
      try { await api(actionPaths[action], { method: 'POST', body: '{}' }); await refresh(); }
      catch (error) { alert(error.message); await refresh(); }
    }));
    document.querySelectorAll('[data-decision]').forEach(button => button.addEventListener('click', async () => {
      const decision = button.dataset.decision;
      if (!confirm(t('confirmDecision', { decision }))) return;
      try { await api('/api/actions/resolve-ambiguous', { method: 'POST', body: JSON.stringify({ decision }) }); await refresh(); }
      catch (error) { alert(error.message); await refresh(); }
    }));
    refresh(); setInterval(refresh, 5000);
  </script>
</body>
</html>`;
