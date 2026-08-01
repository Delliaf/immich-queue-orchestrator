export const UI_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Immich Queue Orchestrator</title>
  <style>
    :root { color-scheme: dark; --bg:#090d12; --panel:#111923; --panel2:#172230; --line:#29394d; --text:#edf3fa; --muted:#93a4b8; --blue:#56a8ff; --green:#55d69e; --orange:#ffbd66; --red:#ff7272; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; background:radial-gradient(circle at top right,#152338 0,#090d12 42%); color:var(--text); font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif; }
    button,input,select { font:inherit; }
    button { border:1px solid var(--line); border-radius:9px; padding:9px 13px; color:var(--text); background:#1b2939; cursor:pointer; }
    button:hover:not(:disabled) { border-color:var(--blue); }
    button:disabled { opacity:.45; cursor:not-allowed; }
    button.primary { background:#1167b7; border-color:#2787dc; }
    button.warn { background:#6d4919; border-color:#a8762f; }
    button.danger { background:#702d35; border-color:#aa4955; }
    button.small { padding:5px 9px; border-radius:7px; }
    input,select { width:100%; color:var(--text); background:#0d1520; border:1px solid var(--line); border-radius:8px; padding:8px 9px; }
    input[type=checkbox] { width:auto; accent-color:var(--blue); }
    header { display:flex; align-items:center; justify-content:space-between; gap:15px; padding:18px 24px; border-bottom:1px solid var(--line); background:rgba(9,13,18,.9); position:sticky; top:0; z-index:5; backdrop-filter:blur(12px); }
    .brand { font-size:18px; font-weight:750; letter-spacing:.2px; }
    .header-controls { display:flex; gap:8px; align-items:center; }
    .auth-fields { display:flex; gap:8px; align-items:center; }
    .header-controls input { width:220px; }
    .layout { display:grid; grid-template-columns:210px minmax(0,1fr); max-width:1500px; margin:0 auto; }
    nav { padding:20px 12px; border-right:1px solid var(--line); min-height:calc(100vh - 65px); }
    nav button { display:block; width:100%; margin-bottom:7px; text-align:left; background:transparent; border-color:transparent; }
    nav button.active { background:var(--panel2); border-color:var(--line); color:var(--blue); }
    main { min-width:0; padding:22px; }
    .tab { display:none; }
    .tab.active { display:block; }
    h1 { font-size:23px; margin:0 0 18px; }
    h2 { font-size:16px; margin:0 0 14px; }
    h3 { font-size:14px; margin:0 0 10px; color:var(--muted); }
    .grid { display:grid; grid-template-columns:repeat(4,minmax(150px,1fr)); gap:12px; }
    .two { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .card,section { border:1px solid var(--line); border-radius:13px; background:rgba(17,25,35,.94); padding:16px; margin-bottom:14px; box-shadow:0 10px 35px rgba(0,0,0,.13); }
    .label { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.06em; }
    .value { margin-top:5px; font-size:19px; font-weight:700; overflow-wrap:anywhere; }
    .detail { margin-top:5px; color:var(--muted); }
    .ok { color:var(--green); } .bad { color:var(--red); } .attention { color:var(--orange); }
    .banner { border:1px solid #27537d; background:#102b44; border-radius:10px; padding:11px 13px; margin-bottom:14px; }
    .banner.warn { border-color:#795b2c; background:#382912; color:#ffd89a; }
    .banner.error { border-color:#7c3840; background:#37181d; color:#ffc1c7; }
    .actions { display:flex; flex-wrap:wrap; gap:8px; }
    .form-grid { display:grid; grid-template-columns:repeat(3,minmax(180px,1fr)); gap:13px; }
    .field label { display:block; color:var(--muted); margin-bottom:5px; }
    .check { display:flex; align-items:center; gap:8px; padding:8px 0; }
    .help { color:var(--muted); font-size:12px; margin-top:5px; }
    .toolbar { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
    .save-state { color:var(--muted); }
    .table-wrap { overflow:auto; }
    table { width:100%; border-collapse:collapse; min-width:780px; }
    th,td { padding:9px 10px; text-align:left; border-bottom:1px solid #233143; white-space:nowrap; }
    th { color:var(--muted); font-size:12px; }
    td.queue-name { font-weight:650; }
    .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:3px 8px; font-size:12px; }
    .pill.paused { color:var(--orange); border-color:#775d31; background:#382a13; }
    .pill.open { color:var(--green); border-color:#2d7257; background:#102f25; }
    .pill.running { color:var(--blue); border-color:#37668f; }
    pre { margin:0; max-height:430px; overflow:auto; color:#cfe4f8; background:#0b1119; border-radius:9px; padding:12px; font-size:12px; }
    dialog { color:var(--text); background:var(--panel); border:1px solid var(--line); border-radius:14px; max-width:520px; padding:20px; }
    dialog::backdrop { background:rgba(0,0,0,.68); }
    .dialog-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:18px; }
    .hidden { display:none !important; }
    @media(max-width:900px) { .layout{grid-template-columns:1fr} nav{display:flex;overflow:auto;min-height:auto;border-right:0;border-bottom:1px solid var(--line);padding:9px} nav button{width:auto;white-space:nowrap;margin:0 5px 0 0}.grid{grid-template-columns:1fr 1fr}.two,.form-grid{grid-template-columns:1fr} main{padding:14px} header{padding:13px}.header-controls input{width:145px} }
    @media(max-width:520px) { .grid{grid-template-columns:1fr}.brand{font-size:15px}.header-controls button:not(#language){display:none} }
  </style>
</head>
<body>
  <header>
    <div class="brand">Immich Queue Orchestrator</div>
    <div class="header-controls">
      <div class="auth-fields" id="auth-controls">
        <input id="password" type="password" autocomplete="current-password" placeholder="Panel password">
        <button id="save-password">Apply</button>
      </div>
      <button id="language">RU</button>
    </div>
  </header>
  <div class="layout">
    <nav>
      <button class="active" data-tab-button="overview" data-i18n="overview">Overview</button>
      <button data-tab-button="queues" data-i18n="queuesTab">Queues</button>
      <button data-tab-button="automation" data-i18n="automation">Automation</button>
      <button data-tab-button="load" data-i18n="cpuLoad">CPU load</button>
      <button data-tab-button="advanced" data-i18n="advanced">Advanced</button>
    </nav>
    <main>
      <div id="banner" class="banner">Loading…</div>

      <div id="overview" class="tab active">
        <h1 data-i18n="overview">Overview</h1>
        <div class="grid">
          <div class="card"><div class="label" data-i18n="state">State</div><div id="phase" class="value">—</div><div id="mode" class="detail">—</div></div>
          <div class="card"><div class="label">Immich API</div><div id="api" class="value">—</div><div id="version" class="detail">—</div></div>
          <div class="card"><div class="label" data-i18n="library">Library</div><div id="assets" class="value">—</div><div id="usage" class="detail">—</div></div>
          <div class="card"><div class="label" data-i18n="cpuAverage">CPU average</div><div id="cpu" class="value">—</div><div id="cpu-detail" class="detail">—</div></div>
        </div>
        <section>
          <h2 data-i18n="controls">Controls</h2>
          <div class="actions">
            <button class="primary" data-action="arm-autopilot" data-i18n="armAutopilot">Arm autopilot</button>
            <button class="primary" data-action="process" data-i18n="scanProcess">Scan and process</button>
            <button data-action="capture-begin" data-i18n="beginCapture">Begin upload capture</button>
            <button data-action="capture-end" data-i18n="uploadsFinished">Uploads finished</button>
            <button class="warn" data-action="pause" data-i18n="pauseController">Pause controller</button>
            <button data-action="resume" data-i18n="resumeController">Resume controller</button>
            <button class="danger" id="release-control" data-i18n="releaseControl">Release control</button>
          </div>
        </section>
        <div class="two">
          <section><h2 data-i18n="currentStage">Current stage</h2><div id="stage">—</div></section>
          <section><h2 data-i18n="inventorySummary">Discovered inventory</h2><div id="inventory-summary">—</div></section>
        </div>
        <section>
          <h2 data-i18n="liveQueues">Live queues</h2>
          <div class="table-wrap"><table><thead><tr><th data-i18n="queue">Queue</th><th data-i18n="status">Status</th><th>Active</th><th>Waiting</th><th>Paused</th><th>Delayed</th><th>Failed</th></tr></thead><tbody id="live-queues"></tbody></table></div>
        </section>
        <section id="ambiguous-actions" class="hidden">
          <h2 data-i18n="operatorDecision">Operator decision required</h2>
          <div class="actions">
            <button data-decision="assume-sent" data-i18n="assumeStartSent">Assume start was sent</button>
            <button data-decision="retry-start" data-i18n="retryStart">Retry start manually</button>
            <button class="danger" data-decision="abort" data-i18n="abortRestore">Abort and restore queues</button>
          </div>
        </section>
      </div>

      <div id="queues" class="tab">
        <div class="toolbar"><h1 data-i18n="queueSettings">Queue settings</h1><button class="primary save-settings" data-i18n="saveSettings">Save settings</button></div>
        <section>
          <p class="detail" data-i18n="queueHelp">Choose which queues are paused during uploads, which stay open, and which are ignored. Order controls sequential processing.</p>
          <div class="table-wrap"><table><thead><tr><th>#</th><th data-i18n="queue">Queue</th><th data-i18n="policy">Policy</th><th data-i18n="checkMissing">Check missing</th><th data-i18n="stabilizeCount">Stabilize count</th><th data-i18n="found">Found</th><th data-i18n="order">Order</th></tr></thead><tbody id="queue-settings"></tbody></table></div>
        </section>
      </div>

      <div id="automation" class="tab">
        <div class="toolbar"><h1 data-i18n="automation">Automation</h1><button class="primary save-settings" data-i18n="saveSettings">Save settings</button></div>
        <section>
          <h2 data-i18n="scanBehavior">Scan behavior</h2>
          <div class="form-grid">
            <label class="check"><input id="scan-autopilot" type="checkbox"><span data-i18n="scanAutopilot">Scan missing media when autopilot starts</span></label>
            <label class="check"><input id="scan-manual" type="checkbox"><span data-i18n="scanManual">Scan missing media for manual processing</span></label>
            <div class="field"><label data-i18n="processingPriority">Processing priority</label><select id="processing-priority"><option value="configured-order" data-i18n="configuredOrder">Configured order</option><option value="smallest-first" data-i18n="smallestFirst">Smallest stabilized backlog first</option></select></div>
            <div class="field"><label data-i18n="periodicHours">Periodic scan, hours (empty = off)</label><input id="periodic-hours" type="number" min="1" step="1"></div>
            <div class="field"><label data-i18n="discoverySettle">Fast-scan settle time, seconds</label><input id="discovery-settle" type="number" min="1"></div>
            <div class="field"><label data-i18n="discoveryTimeout">Maximum scan time per queue, minutes</label><input id="discovery-timeout" type="number" min="1"></div>
            <div class="field"><label data-i18n="inventoryHold">Show completed inventory before processing, seconds</label><input id="inventory-hold" type="number" min="0"></div>
          </div>
        </section>
        <section>
          <h2 data-i18n="transientCounters">Transient counters</h2>
          <p class="detail" data-i18n="transientHelp">For selected queues, keep observing a rapidly falling generated count before freezing the real backlog.</p>
          <div class="form-grid">
            <label class="check"><input id="transient-enabled" type="checkbox"><span data-i18n="transientEnabled">Stabilize fast-decaying queue counts</span></label>
            <div class="field"><label data-i18n="transientWindow">Observation window, seconds</label><input id="transient-window" type="number" min="5"></div>
            <div class="field"><label data-i18n="transientMaximum">Maximum stabilization time, minutes</label><input id="transient-maximum" type="number" min="0.1"></div>
            <div class="field"><label data-i18n="transientDrop">Continue when count drops by at least, %</label><input id="transient-drop" type="number" min="1" max="100"></div>
          </div>
        </section>
        <section>
          <h2 data-i18n="uploadTiming">Upload timing</h2>
          <div class="form-grid">
            <div class="field"><label data-i18n="quietMinutes">Continue after last upload, minutes</label><input id="quiet-minutes" type="number" min="0" step="1"></div>
            <label class="check"><input id="adaptive-enabled" type="checkbox"><span data-i18n="adaptiveQuiet">Increase quiet time for large uploads</span></label>
            <div class="field"><label data-i18n="perAssetSeconds">Extra seconds per uploaded asset</label><input id="per-asset-seconds" type="number" min="0" step="0.1"></div>
            <div class="field"><label data-i18n="maxQuietMinutes">Maximum adaptive quiet time, minutes</label><input id="max-quiet-minutes" type="number" min="0"></div>
            <div class="field"><label data-i18n="queueQuietSeconds">Queue stable time before next stage, seconds</label><input id="queue-quiet" type="number" min="1"></div>
          </div>
        </section>
        <section>
          <h2 data-i18n="polling">Polling</h2>
          <div class="form-grid">
            <div class="field"><label data-i18n="activePoll">Active processing poll, seconds</label><input id="active-poll" type="number" min="1" step="0.1"></div>
            <div class="field"><label data-i18n="guardedPoll">Upload detector poll, seconds</label><input id="guarded-poll" type="number" min="1" max="29" step="0.1"></div>
            <div class="field"><label data-i18n="standbyPoll">Idle unarmed poll, seconds</label><input id="standby-poll" type="number" min="1" step="0.1"></div>
          </div>
        </section>
      </div>

      <div id="load" class="tab">
        <div class="toolbar"><h1 data-i18n="cpuLoad">CPU load</h1><button class="primary save-settings" data-i18n="saveSettings">Save settings</button></div>
        <section>
          <div class="form-grid">
            <div class="field"><label data-i18n="loadMode">Load guard mode</label><select id="load-mode"><option value="off">Off</option><option value="observe">Observe</option><option value="throttle">Throttle</option></select></div>
            <label class="check"><input id="monitor-idle" type="checkbox"><span data-i18n="monitorIdle">Show CPU load while idle</span></label>
            <div class="field"><label data-i18n="sampleSeconds">CPU sample interval, seconds</label><input id="sample-seconds" type="number" min="1"></div>
            <div class="field"><label data-i18n="windowSeconds">Moving average window, seconds</label><input id="window-seconds" type="number" min="5"></div>
            <div class="field"><label data-i18n="pauseAbove">Pause above, %</label><input id="pause-above" type="number" min="1" max="100"></div>
            <div class="field"><label data-i18n="pauseFor">Sustained high load, seconds</label><input id="pause-for" type="number" min="1"></div>
            <div class="field"><label data-i18n="resumeBelow">Resume below, %</label><input id="resume-below" type="number" min="0" max="99"></div>
            <div class="field"><label data-i18n="resumeFor">Sustained low load, seconds</label><input id="resume-for" type="number" min="1"></div>
          </div>
        </section>
      </div>

      <div id="advanced" class="tab">
        <div class="toolbar"><h1 data-i18n="advanced">Advanced</h1><span id="save-state" class="save-state">—</span></div>
        <section><h2 data-i18n="effectiveConfiguration">Bootstrap configuration</h2><p class="detail" data-i18n="advancedHelp">Network address, API credentials, and panel password remain in Docker Compose and .env. Runtime automation settings are stored under /data.</p><pre id="config">—</pre></section>
        <section><h2 data-i18n="runtimeJson">Runtime settings</h2><pre id="runtime-json">—</pre></section>
      </div>
    </main>
  </div>

  <dialog id="release-dialog">
    <h2 data-i18n="releaseQuestion">How should queues be left?</h2>
    <label class="check"><input type="radio" name="release-strategy" value="keep-managed-paused" checked><span data-i18n="keepPaused">Keep managed queues paused (recommended)</span></label>
    <label class="check"><input type="radio" name="release-strategy" value="restore-original"><span data-i18n="restoreOriginal">Restore states from before the controller started</span></label>
    <div class="dialog-actions"><button id="release-cancel" data-i18n="cancel">Cancel</button><button class="danger" id="release-confirm" data-i18n="confirm">Confirm</button></div>
  </dialog>

  <script>
    const queueLabels = {
      en:{thumbnailGeneration:'Thumbnail generation',metadataExtraction:'Metadata extraction',sidecar:'Sidecar metadata',smartSearch:'Smart search',duplicateDetection:'Duplicate detection',faceDetection:'Face detection',facialRecognition:'Facial recognition',ocr:'Text recognition',videoConversion:'Video transcoding'},
      ru:{thumbnailGeneration:'Создание миниатюр',metadataExtraction:'Извлечение метаданных',sidecar:'Метаданные из Sidecar-файлов',smartSearch:'Интеллектуальный поиск',duplicateDetection:'Поиск дубликатов',faceDetection:'Обнаружение лиц',facialRecognition:'Распознавание лиц',ocr:'Распознавание текста',videoConversion:'Перекодирование видео'}
    };
    const messages = {
      en: {
        overview:'Overview', queuesTab:'Queues', automation:'Automation', cpuLoad:'CPU load', advanced:'Advanced', state:'State', library:'Library', cpuAverage:'CPU average', controls:'Controls', armAutopilot:'Arm autopilot', scanProcess:'Scan and process', beginCapture:'Begin upload capture', uploadsFinished:'Uploads finished', pauseController:'Pause controller', resumeController:'Resume controller', releaseControl:'Release control', currentStage:'Current stage', inventorySummary:'Discovered inventory', liveQueues:'Live queues', queue:'Queue', status:'Status', operatorDecision:'Operator decision required', assumeStartSent:'Assume start was sent', retryStart:'Retry start manually', abortRestore:'Abort and restore queues', queueSettings:'Queue settings', saveSettings:'Save settings', queueHelp:'Choose which queues are paused during uploads, which stay open, and which are ignored. Order controls sequential processing.', policy:'Policy', checkMissing:'Check missing', stabilizeCount:'Stabilize count', found:'Found', order:'Order', scanBehavior:'Scan behavior', scanAutopilot:'Scan missing media when autopilot starts', scanManual:'Scan missing media for manual processing', processingPriority:'Processing priority', configuredOrder:'Configured order', smallestFirst:'Smallest stabilized backlog first', periodicHours:'Periodic scan, hours (empty = off)', discoverySettle:'Fast-scan settle time, seconds', discoveryTimeout:'Maximum scan time per queue, minutes', inventoryHold:'Show completed inventory before processing, seconds', transientCounters:'Transient counters', transientHelp:'For selected queues, keep observing a rapidly falling generated count before freezing the real backlog.', transientEnabled:'Stabilize fast-decaying queue counts', transientWindow:'Observation window, seconds', transientMaximum:'Maximum stabilization time, minutes', transientDrop:'Continue when count drops by at least, %', uploadTiming:'Upload timing', quietMinutes:'Continue after last upload, minutes', adaptiveQuiet:'Increase quiet time for large uploads', perAssetSeconds:'Extra seconds per uploaded asset', maxQuietMinutes:'Maximum adaptive quiet time, minutes', queueQuietSeconds:'Queue stable time before next stage, seconds', polling:'Polling', activePoll:'Active processing poll, seconds', guardedPoll:'Upload detector poll, seconds', standbyPoll:'Idle unarmed poll, seconds', loadMode:'Load guard mode', monitorIdle:'Show CPU load while idle', sampleSeconds:'CPU sample interval, seconds', windowSeconds:'Moving average window, seconds', pauseAbove:'Pause above, %', pauseFor:'Sustained high load, seconds', resumeBelow:'Resume below, %', resumeFor:'Sustained low load, seconds', effectiveConfiguration:'Bootstrap configuration', advancedHelp:'Network address, API credentials, and panel password remain in Docker Compose and .env. Runtime automation settings are stored under /data.', runtimeJson:'Runtime settings', releaseQuestion:'How should queues be left?', keepPaused:'Keep managed queues paused (recommended)', restoreOriginal:'Restore states from before the controller started', cancel:'Cancel', confirm:'Confirm', managed:'Managed', alwaysRunning:'Always running', ignored:'Ignored', paused:'paused', running:'running', connected:'Connected', unavailable:'Unavailable', noActiveRun:'No active run', ready:'Ready', armed:'Autopilot armed', trustedNetwork:'Panel password is disabled. Keep this panel inside a trusted network.', readOnly:'Read-only: enable control and disable dry-run in bootstrap configuration.', ambiguousRequired:'Ambiguous missing-media scan: an operator decision is required.', settingsSaved:'Settings saved', settingsUnchanged:'No settings changed', settingsDirty:'Unsaved changes', idleCpuDisabled:'Monitoring is disabled while idle', waitingSample:'Waiting for a sample', nowPeak:'Now {current}% · peak {peak}%', assetCounts:'{photos} photos · {videos} videos · {usage}', providePassword:' — enter the panel password.', stepOf:'Step {current} of {total}', inventoryLine:'{queue}: {count}{detail}', stabilizedFrom:' (stabilized from {initial})', confirmAction:'Run “{action}”?', confirmDecision:'Apply decision “{decision}”?', noInventory:'No inventory yet', discovery:'Discovery: {status}', saveFailed:'Could not save settings'
      },
      ru: {
        overview:'Обзор', queuesTab:'Очереди', automation:'Автоматизация', cpuLoad:'Нагрузка CPU', advanced:'Дополнительно', state:'Состояние', library:'Медиатека', cpuAverage:'CPU, среднее', controls:'Управление', armAutopilot:'Включить автопилот', scanProcess:'Проверить и обработать', beginCapture:'Начать приём файлов', uploadsFinished:'Загрузка закончена', pauseController:'Приостановить контроллер', resumeController:'Продолжить контроллер', releaseControl:'Выключить автопилот', currentStage:'Текущий этап', inventorySummary:'Найдено при проверке', liveQueues:'Очереди Immich', queue:'Очередь', status:'Состояние', operatorDecision:'Требуется решение оператора', assumeStartSent:'Считать запрос отправленным', retryStart:'Повторить проверку вручную', abortRestore:'Прервать и восстановить очереди', queueSettings:'Настройки очередей', saveSettings:'Сохранить настройки', queueHelp:'Выберите, какие очереди ставить на паузу во время загрузки, какие оставлять запущенными и какие игнорировать. Порядок задаёт последовательную обработку.', policy:'Режим', checkMissing:'Проверять отсутствующие', stabilizeCount:'Стабилизировать счётчик', found:'Найдено', order:'Порядок', scanBehavior:'Проверка отсутствующих', scanAutopilot:'Проверять отсутствующие при включении автопилота', scanManual:'Проверять отсутствующие при ручной обработке', processingPriority:'Приоритет обработки', configuredOrder:'Заданный порядок', smallestFirst:'Сначала минимальный стабильный остаток', periodicHours:'Периодическая проверка, часов (пусто = выключено)', discoverySettle:'Ожидание очень быстрой проверки, секунд', discoveryTimeout:'Максимум на проверку одной очереди, минут', inventoryHold:'Показывать итог перед обработкой, секунд', transientCounters:'Временные счётчики', transientHelp:'Для выбранных очередей наблюдать за быстро уменьшающимся счётчиком перед фиксацией реального остатка.', transientEnabled:'Стабилизировать быстро уменьшающиеся счётчики', transientWindow:'Окно наблюдения, секунд', transientMaximum:'Максимальное время стабилизации, минут', transientDrop:'Продолжать, если счётчик уменьшился минимум на, %', uploadTiming:'Ожидание загрузки', quietMinutes:'Продолжить после последней загрузки через, минут', adaptiveQuiet:'Увеличивать ожидание для больших загрузок', perAssetSeconds:'Дополнительных секунд на загруженный файл', maxQuietMinutes:'Максимальное адаптивное ожидание, минут', queueQuietSeconds:'Стабильная пустая очередь перед следующим этапом, секунд', polling:'Опрос', activePoll:'Опрос во время работы, секунд', guardedPoll:'Поиск новых загрузок, секунд', standbyPoll:'Опрос без автопилота, секунд', loadMode:'Режим контроля нагрузки', monitorIdle:'Показывать CPU в простое', sampleSeconds:'Интервал чтения CPU, секунд', windowSeconds:'Окно среднего CPU, секунд', pauseAbove:'Пауза выше, %', pauseFor:'Высокая нагрузка сохраняется, секунд', resumeBelow:'Продолжить ниже, %', resumeFor:'Низкая нагрузка сохраняется, секунд', effectiveConfiguration:'Начальная конфигурация', advancedHelp:'Сетевой адрес, API-ключ и пароль панели остаются в Docker Compose и .env. Настройки автоматизации сохраняются в /data.', runtimeJson:'Текущие настройки', releaseQuestion:'В каком состоянии оставить очереди?', keepPaused:'Оставить управляемые очереди на паузе (рекомендуется)', restoreOriginal:'Восстановить состояния до запуска контроллера', cancel:'Отмена', confirm:'Подтвердить', managed:'Управлять', alwaysRunning:'Всегда разрешена', ignored:'Игнорировать', paused:'пауза', running:'работает', connected:'Подключён', unavailable:'Недоступен', noActiveRun:'Нет активного прохода', ready:'Готов', armed:'Автопилот включён', trustedNetwork:'Пароль панели отключён. Оставьте доступ только в доверенной сети.', readOnly:'Только чтение: включите управление и отключите dry-run в начальной конфигурации.', ambiguousRequired:'Неоднозначный запуск проверки отсутствующих: требуется решение оператора.', settingsSaved:'Настройки сохранены', settingsUnchanged:'Изменений нет', settingsDirty:'Есть несохранённые изменения', idleCpuDisabled:'В простое мониторинг отключён', waitingSample:'Ожидание выборки', nowPeak:'Сейчас {current}% · пик {peak}%', assetCounts:'{photos} фото · {videos} видео · {usage}', providePassword:' — введите пароль панели.', stepOf:'Шаг {current} из {total}', inventoryLine:'{queue}: {count}{detail}', stabilizedFrom:' (стабилизировано с {initial})', confirmAction:'Выполнить «{action}»?', confirmDecision:'Применить решение «{decision}»?', noInventory:'Проверка ещё не выполнялась', discovery:'Проверка: {status}', saveFailed:'Не удалось сохранить настройки'
      }
    };
    let language = localStorage.getItem('orchestrator-language') || 'en';
    let authenticationFailed = false;
    let currentStatus = null;
    let currentConfig = null;
    let settings = null;
    let settingsDirty = false;
    const t = (key, values={}) => Object.entries(values).reduce((text, item) => text.replaceAll('{' + item[0] + '}', String(item[1])), messages[language][key] || key);
    const qLabel = name => (queueLabels[language] && queueLabels[language][name]) || name;
    const headers = () => { const password=sessionStorage.getItem('orchestrator-password'); return password ? {authorization:'Bearer ' + password} : {}; };
    const byId = id => document.getElementById(id);
    const numberValue = id => Number(byId(id).value);
    const ms = (id, multiplier) => Math.round(numberValue(id) * multiplier);
    const humanBytes = value => { const units=['B','KB','MB','GB','TB']; let size=value,index=0; while(size>=1024&&index<units.length-1){size/=1024;index++;} return size.toFixed(index<2?0:1)+' '+units[index]; };
    const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[character]);
    async function api(path, init={}) { const response=await fetch(path,{...init,headers:{'content-type':'application/json',...headers(),...(init.headers||{})}}); const text=await response.text(); const data=text?JSON.parse(text):null; if(!response.ok) throw new Error(data&&data.message?data.message:'HTTP '+response.status); return data; }
    function applyLanguage(){ document.documentElement.lang=language; document.querySelectorAll('[data-i18n]').forEach(element=>{element.textContent=t(element.dataset.i18n);}); byId('language').textContent=language==='en'?'RU':'EN'; if(settings) renderSettings(); if(currentStatus) renderStatus(); }
    function markDirty(){ settingsDirty=true; byId('save-state').textContent=t('settingsDirty'); }
    function renderStatus(){
      const status=currentStatus; if(!status)return; const run=status.state&&status.state.run; byId('auth-controls').classList.toggle('hidden',status.control.authentication==='none');
      const banner=byId('banner'); if(status.fatalError||status.lastPollError){banner.className='banner error';banner.textContent=status.fatalError||status.lastPollError;} else if(!status.control.enabled||status.control.dryRun){banner.className='banner warn';banner.textContent=t('readOnly');} else if(run&&run.phase==='AMBIGUOUS_START'){banner.className='banner error';banner.textContent=run.lastError||t('ambiguousRequired');} else if(status.control.authentication==='none'){banner.className='banner warn';banner.textContent=t('trustedNetwork');} else {banner.className='banner';banner.textContent=status.state&&status.state.autopilotArmed?t('armed'):t('ready');}
      byId('api').textContent=status.apiConnected?t('connected'):t('unavailable'); byId('api').className='value '+(status.apiConnected?'ok':'bad'); byId('version').textContent=status.version?'Immich '+status.version.major+'.'+status.version.minor+'.'+status.version.patch:'—';
      byId('phase').textContent=run?run.phase:'IDLE'; byId('phase').className='value '+(run&&['AMBIGUOUS_START','DEGRADED'].includes(run.phase)?'bad':run&&run.phase==='PAUSED_BY_OPERATOR'?'attention':'ok'); byId('mode').textContent=run?run.mode+' · '+run.id.slice(0,8):t('noActiveRun');
      byId('cpu').textContent=status.cpu.averagePercent==null?'—':status.cpu.averagePercent.toFixed(1)+'%'; byId('cpu-detail').textContent=!status.cpu.monitoring?t('idleCpuDisabled'):status.cpu.currentPercent==null?t('waitingSample'):t('nowPeak',{current:status.cpu.currentPercent.toFixed(1),peak:status.cpu.peakPercent.toFixed(1)});
      const stats=status.serverStatistics; byId('assets').textContent=stats?(stats.photos+stats.videos).toLocaleString(language==='ru'?'ru-RU':'en-US'):'—'; byId('usage').textContent=stats?t('assetCounts',{photos:stats.photos,videos:stats.videos,usage:humanBytes(stats.usage)}):'—';
      byId('live-queues').innerHTML=status.queues.map(queue=>'<tr><td class="queue-name">'+escapeHtml(qLabel(queue.name))+'</td><td><span class="pill '+(queue.isPaused?'paused">'+t('paused'):'open">'+t('running'))+'</span></td><td>'+queue.statistics.active+'</td><td>'+queue.statistics.waiting+'</td><td>'+queue.statistics.paused+'</td><td>'+queue.statistics.delayed+'</td><td>'+queue.statistics.failed+'</td></tr>').join('');
      const stageIndex=run&&run.phase==='DISCOVERING'?run.discoveryStageIndex:run?run.currentStageIndex:0; const stage=run&&run.stages&&run.stages[stageIndex]; byId('stage').innerHTML=stage?'<div class="value">'+escapeHtml(qLabel(stage.queue))+'</div><div class="detail">'+escapeHtml(stage.status)+' · '+escapeHtml(t('discovery',{status:stage.discoveryStatus}))+'</div><div class="detail">'+t('stepOf',{current:stageIndex+1,total:run.stages.length})+'</div>':t('noActiveRun');
      const inventories=run&&run.stages?run.stages.filter(stageItem=>stageItem.discoveryCompletedAt).map(stageItem=>t('inventoryLine',{queue:qLabel(stageItem.queue),count:stageItem.inventoryCount,detail:stageItem.inventoryStabilized?t('stabilizedFrom',{initial:stageItem.inventoryInitialCount}):''})):[]; byId('inventory-summary').innerHTML=inventories.length?inventories.map(line=>'<div>'+escapeHtml(line)+'</div>').join(''):t('noInventory');
      byId('ambiguous-actions').classList.toggle('hidden',!run||run.phase!=='AMBIGUOUS_START'); document.querySelectorAll('[data-action]').forEach(button=>{button.disabled=!status.control.enabled||status.control.dryRun;});
      if(settings) renderQueueSettings();
    }
    function renderQueueSettings(){
      const stages=currentStatus&&currentStatus.state&&currentStatus.state.run?currentStatus.state.run.stages:[];
      byId('queue-settings').innerHTML=settings.queues.map((item,index)=>{const stage=stages.find(candidate=>candidate.queue===item.queue);const found=stage?(stage.inventoryStabilized?stage.inventoryInitialCount+' → '+stage.inventoryCount:String(stage.inventoryCount)):'—'; return '<tr><td>'+(index+1)+'</td><td class="queue-name">'+escapeHtml(qLabel(item.queue))+(item.queue==='facialRecognition'?'<div class="help">'+escapeHtml(language==='ru'?'После обнаружения лиц':'After face detection')+'</div>':'')+'</td><td><select data-policy="'+item.queue+'"><option value="managed" '+(item.policy==='managed'?'selected':'')+'>'+t('managed')+'</option><option value="always-running" '+(item.policy==='always-running'?'selected':'')+'>'+t('alwaysRunning')+'</option><option value="ignored" '+(item.policy==='ignored'?'selected':'')+'>'+t('ignored')+'</option></select></td><td><input type="checkbox" data-missing="'+item.queue+'" '+(item.checkMissing?'checked':'')+'></td><td><input type="checkbox" data-stabilize="'+item.queue+'" '+(item.stabilizeTransientCount?'checked':'')+'></td><td>'+escapeHtml(found)+'</td><td><button class="small" data-move="up" data-index="'+index+'">↑</button> <button class="small" data-move="down" data-index="'+index+'">↓</button></td></tr>';}).join('');
      document.querySelectorAll('[data-policy]').forEach(element=>element.addEventListener('change',event=>{settings.queues.find(item=>item.queue===event.target.dataset.policy).policy=event.target.value;markDirty();}));
      document.querySelectorAll('[data-missing]').forEach(element=>element.addEventListener('change',event=>{settings.queues.find(item=>item.queue===event.target.dataset.missing).checkMissing=event.target.checked;markDirty();}));
      document.querySelectorAll('[data-stabilize]').forEach(element=>element.addEventListener('change',event=>{settings.queues.find(item=>item.queue===event.target.dataset.stabilize).stabilizeTransientCount=event.target.checked;markDirty();}));
      document.querySelectorAll('[data-move]').forEach(element=>element.addEventListener('click',event=>{const index=Number(event.currentTarget.dataset.index);const target=event.currentTarget.dataset.move==='up'?index-1:index+1;if(target<0||target>=settings.queues.length)return;const moved=settings.queues.splice(index,1)[0];settings.queues.splice(target,0,moved);markDirty();renderQueueSettings();}));
    }
    function setValue(id,value){byId(id).value=String(value);}
    function renderSettings(){ if(!settings)return; const a=settings.automation,l=settings.loadGuard; byId('scan-autopilot').checked=a.scanOnAutopilotStart;byId('scan-manual').checked=a.scanOnManualStart;setValue('processing-priority',a.processingPriority);setValue('periodic-hours',a.periodicDiscoveryIntervalMs==null?'':a.periodicDiscoveryIntervalMs/3600000);setValue('discovery-settle',a.discoverySettleMs/1000);setValue('discovery-timeout',a.discoveryTimeoutMs/60000);setValue('inventory-hold',a.inventoryHoldMs/1000);byId('transient-enabled').checked=a.transientCounterStabilizationEnabled;setValue('transient-window',a.transientCounterWindowMs/1000);setValue('transient-maximum',a.transientCounterMaxMs/60000);setValue('transient-drop',a.transientCounterMinimumDropPercent);setValue('quiet-minutes',a.uploadQuietPeriodMs/60000);byId('adaptive-enabled').checked=a.adaptiveQuietEnabled;setValue('per-asset-seconds',a.adaptiveQuietPerAssetMs/1000);setValue('max-quiet-minutes',a.adaptiveQuietMaxMs/60000);setValue('queue-quiet',a.queueQuietMs/1000);setValue('active-poll',a.activePollMs/1000);setValue('guarded-poll',a.guardedPollMs/1000);setValue('standby-poll',a.standbyPollMs/1000);setValue('load-mode',l.mode);byId('monitor-idle').checked=l.monitorInIdle;setValue('sample-seconds',l.sampleIntervalMs/1000);setValue('window-seconds',l.movingAverageWindowMs/1000);setValue('pause-above',l.pauseAbove==null?'':l.pauseAbove);setValue('pause-for',l.pauseForMs/1000);setValue('resume-below',l.resumeBelow==null?'':l.resumeBelow);setValue('resume-for',l.resumeForMs/1000);byId('runtime-json').textContent=JSON.stringify(settings,null,2);renderQueueSettings(); }
    function collectSettings(){ const periodic=byId('periodic-hours').value.trim(); const pauseAbove=byId('pause-above').value.trim(); const resumeBelow=byId('resume-below').value.trim(); return {...settings,automation:{scanOnAutopilotStart:byId('scan-autopilot').checked,scanOnManualStart:byId('scan-manual').checked,processingPriority:byId('processing-priority').value,periodicDiscoveryIntervalMs:periodic===''?null:ms('periodic-hours',3600000),discoverySettleMs:ms('discovery-settle',1000),discoveryTimeoutMs:ms('discovery-timeout',60000),inventoryHoldMs:ms('inventory-hold',1000),transientCounterStabilizationEnabled:byId('transient-enabled').checked,transientCounterWindowMs:ms('transient-window',1000),transientCounterMaxMs:ms('transient-maximum',60000),transientCounterMinimumDropPercent:numberValue('transient-drop'),uploadQuietPeriodMs:ms('quiet-minutes',60000),adaptiveQuietEnabled:byId('adaptive-enabled').checked,adaptiveQuietPerAssetMs:ms('per-asset-seconds',1000),adaptiveQuietMaxMs:ms('max-quiet-minutes',60000),queueQuietMs:ms('queue-quiet',1000),activePollMs:ms('active-poll',1000),guardedPollMs:ms('guarded-poll',1000),standbyPollMs:ms('standby-poll',1000)},loadGuard:{mode:byId('load-mode').value,monitorInIdle:byId('monitor-idle').checked,sampleIntervalMs:ms('sample-seconds',1000),movingAverageWindowMs:ms('window-seconds',1000),pauseAbove:pauseAbove===''?null:Number(pauseAbove),pauseForMs:ms('pause-for',1000),resumeBelow:resumeBelow===''?null:Number(resumeBelow),resumeForMs:ms('resume-for',1000)},queues:settings.queues}; }
    async function saveSettings(){ try{settings=collectSettings();const result=await api('/api/settings',{method:'PUT',body:JSON.stringify(settings)});settingsDirty=false;byId('save-state').textContent=result.saved?t('settingsSaved'):t('settingsUnchanged');renderSettings();}catch(error){alert(t('saveFailed')+': '+error.message);} }
    async function refresh(){ if(authenticationFailed)return; try{const responses=await Promise.all([api('/api/status'),api('/api/config/effective'),api('/api/settings')]);currentStatus=responses[0];currentConfig=responses[1];if(!settingsDirty)settings=responses[2];byId('config').textContent=JSON.stringify(currentConfig,null,2);renderStatus();if(!settingsDirty)renderSettings();}catch(error){if(error.message.includes('password')||error.message.includes('Unauthorized'))authenticationFailed=true;const banner=byId('banner');banner.className='banner error';banner.textContent=error.message+(authenticationFailed?t('providePassword'):'');} }
    const actionPaths={'arm-autopilot':'/api/actions/arm-autopilot','capture-begin':'/api/actions/capture-begin','capture-end':'/api/actions/capture-end',process:'/api/actions/process',pause:'/api/actions/pause',resume:'/api/actions/resume'};
    document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',async()=>{const action=button.dataset.action;if(!confirm(t('confirmAction',{action:button.textContent.trim()})))return;button.disabled=true;try{await api(actionPaths[action],{method:'POST',body:'{}'});await refresh();}catch(error){alert(error.message);await refresh();}}));
    document.querySelectorAll('[data-decision]').forEach(button=>button.addEventListener('click',async()=>{const decision=button.dataset.decision;if(!confirm(t('confirmDecision',{decision})))return;try{await api('/api/actions/resolve-ambiguous',{method:'POST',body:JSON.stringify({decision})});await refresh();}catch(error){alert(error.message);}}));
    document.querySelectorAll('[data-tab-button]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-tab-button]').forEach(item=>item.classList.toggle('active',item===button));document.querySelectorAll('.tab').forEach(tab=>tab.classList.toggle('active',tab.id===button.dataset.tabButton));}));
    document.querySelectorAll('.save-settings').forEach(button=>button.addEventListener('click',saveSettings)); document.querySelectorAll('#automation input,#automation select,#load input,#load select').forEach(element=>element.addEventListener('change',markDirty));
    byId('release-control').addEventListener('click',()=>byId('release-dialog').showModal());byId('release-cancel').addEventListener('click',()=>byId('release-dialog').close());byId('release-confirm').addEventListener('click',async()=>{const strategy=document.querySelector('input[name=release-strategy]:checked').value;try{await api('/api/actions/release',{method:'POST',body:JSON.stringify({strategy})});byId('release-dialog').close();await refresh();}catch(error){alert(error.message);}});
    byId('save-password').addEventListener('click',()=>{const password=byId('password').value;if(password)sessionStorage.setItem('orchestrator-password',password);else sessionStorage.removeItem('orchestrator-password');authenticationFailed=false;refresh();});byId('language').addEventListener('click',()=>{language=language==='en'?'ru':'en';localStorage.setItem('orchestrator-language',language);applyLanguage();});
    applyLanguage();refresh();setInterval(refresh,5000);
  </script>
</body>
</html>`;
