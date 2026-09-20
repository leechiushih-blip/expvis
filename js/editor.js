
// ============ AI Provider Configuration ============
var _aiProviders = {
  openai: {
    name: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o3-mini'],
    defaultModel: 'gpt-4o',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    authHeader: function(key) { return 'Bearer ' + key; },
    buildBody: function(model, messages, maxTokens) {
      return JSON.stringify({ model: model, max_tokens: maxTokens, messages: messages });
    },
    parseResponse: function(data) { return data.choices[0].message.content; },
    apiKeyHint: 'sk-...',
    apiKeyUrl: 'https://platform.openai.com/api-keys'
  },
  deepseek: {
    name: 'DeepSeek',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    defaultModel: 'deepseek-chat',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    authHeader: function(key) { return 'Bearer ' + key; },
    buildBody: function(model, messages, maxTokens) {
      return JSON.stringify({ model: model, max_tokens: maxTokens, messages: messages });
    },
    parseResponse: function(data) { return data.choices[0].message.content; },
    apiKeyHint: 'sk-...',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys'
  },
  anthropic: {
    name: 'Anthropic Claude',
    models: ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5'],
    defaultModel: 'claude-sonnet-4-6',
    endpoint: 'https://api.anthropic.com/v1/messages',
    authHeader: function(key) { return key; },
    extraHeaders: function() { return {'anthropic-version': '2023-06-01', 'anthropic-beta': 'messages-2023-12-15'}; },
    buildBody: function(model, messages, maxTokens) {
      var systemMsg = '';
      var userMsgs = [];
      for (var i = 0; i < messages.length; i++) {
        if (messages[i].role === 'system') { systemMsg = messages[i].content; }
        else { userMsgs.push({ role: messages[i].role, content: messages[i].content }); }
      }
      var body = { model: model, max_tokens: maxTokens, messages: userMsgs };
      if (systemMsg) body.system = systemMsg;
      return JSON.stringify(body);
    },
    parseResponse: function(data) { return data.content[0].text; },
    apiKeyHint: 'sk-ant-...',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys'
  },
  gemini: {
    name: 'Google Gemini',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
    defaultModel: 'gemini-2.5-flash',
    endpoint: '', // set dynamically
    authHeader: function(key) { return ''; }, // key in URL param
    buildBody: function(model, messages, maxTokens) {
      var contents = [];
      var sysInstr = '';
      for (var i = 0; i < messages.length; i++) {
        if (messages[i].role === 'system') {
          sysInstr = messages[i].content;
        } else {
          contents.push({ role: messages[i].role === 'assistant' ? 'model' : 'user', parts: [{text: messages[i].content}] });
        }
      }
      var body = { contents: contents, generationConfig: { maxOutputTokens: maxTokens } };
      if (sysInstr) body.systemInstruction = { parts: [{text: sysInstr}] };
      return JSON.stringify(body);
    },
    buildUrl: function(model, key) {
      return 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + key;
    },
    parseResponse: function(data) { return data.candidates[0].content.parts[0].text; },
    apiKeyHint: 'AIza...',
    apiKeyUrl: 'https://aistudio.google.com/apikey'
  },
  qwen: {
    name: '通义千问 (Qwen)',
    models: ['qwen-plus', 'qwen-max', 'qwen-turbo'],
    defaultModel: 'qwen-plus',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    authHeader: function(key) { return 'Bearer ' + key; },
    buildBody: function(model, messages, maxTokens) {
      return JSON.stringify({ model: model, max_tokens: maxTokens, messages: messages });
    },
    parseResponse: function(data) { return data.choices[0].message.content; },
    apiKeyHint: 'sk-...',
    apiKeyUrl: 'https://bailian.console.aliyun.com/'
  },
  custom: {
    name: 'OpenAI-Compatible',
    models: [''],
    defaultModel: '',
    endpoint: '',
    authHeader: function(key) { return 'Bearer ' + key; },
    buildBody: function(model, messages, maxTokens) {
      return JSON.stringify({ model: model, max_tokens: maxTokens, messages: messages });
    },
    parseResponse: function(data) { return data.choices[0].message.content; },
    apiKeyHint: '',
    apiKeyUrl: '',
    isCustom: true
  }
};

var _aiProvider = localStorage.getItem('ve_ai_provider') || 'deepseek';
var _aiModel = localStorage.getItem('ve_ai_model') || '';

function _getAIProvider(id) {
  return _aiProviders[id] || _aiProviders['deepseek'];
}

function _callAI(providerId, model, messages, maxTokens) {
  var provider = _getAIProvider(providerId);
  var key = localStorage.getItem('ve_ai_key_' + providerId) || '';

  if (provider.isCustom) {
    var ep = localStorage.getItem('ve_ai_endpoint_custom') || '';
    if (!ep) return Promise.reject(new Error('Custom endpoint not configured'));
    provider = JSON.parse(JSON.stringify(provider));
    provider.endpoint = ep;
  }

  if (providerId === 'gemini') {
    var url = provider.buildUrl(model, key);
    return fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: provider.buildBody(model, messages, maxTokens)
    }).then(function(r) {
      if (!r.ok) return r.text().then(function(t) { throw new Error('API Error ' + r.status + ': ' + t.slice(0, 200)); });
      return r.json();
    }).then(function(data) {
      return provider.parseResponse(data);
    });
  }

  var headers = {'Content-Type': 'application/json', 'Authorization': provider.authHeader(key)};
  var extraH = provider.extraHeaders ? provider.extraHeaders() : {};
  for (var k in extraH) headers[k] = extraH[k];

  return fetch(provider.endpoint, {
    method: 'POST',
    headers: headers,
    body: provider.buildBody(model, messages, maxTokens)
  }).then(function(r) {
    if (!r.ok) return r.text().then(function(t) { throw new Error('API Error ' + r.status + ': ' + t.slice(0, 200)); });
    return r.json();
  }).then(function(data) {
    return provider.parseResponse(data);
  });
}

function _getAIProviderKeys() {
  return Object.keys(_aiProviders);
}


// ============ i18n (Internationalization) ============
var _lang = 'en'; // English only
var _i18n = {
  // --- App header ---
  'app.title':        {en:'ExpVis', zh:'ExpVis'},
  'app.subtitle':     {en:'Component-based · Visual · WYSIWYG', zh:'组件式 · 可视化 · 所见即所得'},
  'btn.undo':         {en:'↩ Undo', zh:'↩ 撤销'},
  'btn.new':          {en:'New', zh:'新建'},
  'btn.preview':      {en:'▶ Preview', zh:'▶ 预览实验'},
  'btn.code':         {en:'</> Code', zh:'</> 代码'},
  'btn.save':         {en:'💾 Save', zh:'💾 保存'},
  'btn.versions':     {en:'🕐 Versions', zh:'🕐 版本'},
  'btn.publish':      {en:'🚀 Publish', zh:'🚀 发布'},
  // --- Panels ---
  'panel.components': {en:'Component Toolbox', zh:'组件工具箱'},
  'panel.properties': {en:'Properties', zh:'属性'},
  'panel.preview':    {en:'Live Preview', zh:'实时预览'},
  'panel.expand':     {en:'⛶ Expand', zh:'⛶ 展开'},
  // --- Component categories ---
  'cat.stimulus':     {en:'📺 Display', zh:'📺 呈现'},
  'cat.response':     {en:'🎮 Response', zh:'🎮 响应'},
  'cat.logic':        {en:'🧠 Logic', zh:'🧠 逻辑'},
  // --- Component names & descs ---
  'comp.text':        {en:'Text', zh:'文本'},
  'comp.text.desc':   {en:'Size / Color / Weight / Position', zh:'字号 / 颜色 / 字重 / 位置'},
  'comp.shape':       {en:'Shape', zh:'形状'},
  'comp.shape.desc':  {en:'Circle / Square / Triangle / Diamond / Star', zh:'圆 / 方 / 三角 / 菱形 / 星形'},
  'comp.image':       {en:'Image', zh:'图片'},
  'comp.image.desc':  {en:'Upload · ≤ 4MB', zh:'本地上传 · ≤ 4MB'},
  'comp.audio':       {en:'Audio', zh:'音频'},
  'comp.audio.desc':  {en:'Upload · MP3 / WAV', zh:'上传播放 · MP3 / WAV'},
  'comp.video':       {en:'Video', zh:'视频'},
  'comp.video.desc':  {en:'Upload · MP4 / WebM', zh:'上传播放 · MP4 / WebM'},
  'comp.fixation':    {en:'Fixation', zh:'注视点'},
  'comp.fixation.desc':{en:'Cross · Adjustable Duration', zh:'十字 · 可设时长'},
  'comp.keyboard':    {en:'Keyboard', zh:'键盘'},
  'comp.keyboard.desc':{en:'Key Mapping · Correct Key / Timeout', zh:'按键绑定 · 正确键 / 超时'},
  'comp.button':      {en:'Button', zh:'按钮'},
  'comp.button.desc': {en:'Multi-Button · Click Response', zh:'多按钮 · 点击响应'},
  'comp.slider':      {en:'Slider', zh:'滑块'},
  'comp.slider.desc': {en:'Continuous Value · Range / Step', zh:'连续数值 · 范围 / 步长'},
  'comp.textInput':   {en:'Survey Text', zh:'问卷文本'},
  'comp.textInput.desc':{en:'Free Input · Placeholder', zh:'自由输入 · 占位提示'},
  'comp.delay':       {en:'Delay', zh:'延迟'},
  'comp.delay.desc':  {en:'Insert Wait (ms)', zh:'插入等待 ms'},
  // --- Toolbar ---
  'toolbar.ai_generate':      {en:'🤖 AI Generate', zh:'🤖 AI 生成'},
  'toolbar.hint':             {en:'Drop components onto nodes above', zh:'拖入组件到节点上方释放'},
  // --- Empty state ---
  'empty.title':      {en:'Start Building Your Experiment', zh:'开始构建你的实验'},
  'empty.desc':       {en:'Drag components from the left, or choose a template to get started', zh:'从左侧拖入组件，或选择一个模板快速开始'},
  'empty.click_node': {en:'← Click a node in the flow\nto view and edit properties', zh:'← 点击流程中的节点\n查看和编辑属性'},
  'empty.click_preview':{en:'Click a node to preview', zh:'Click a node to preview'},
  // --- Phase names ---
  // Phase names are stored plain; the icon is added by _phaseLabel() at render
  // time so that generated experiment code stays free of decorative emoji.
  'phase.instructions': {en:'Instructions', zh:'指导语'},
  'phase.trials':       {en:'Trials', zh:'正式实验'},
  'phase.feedback':     {en:'Feedback', zh:'反馈'},
  'phase.trials_count': {en:' trials', zh:' 个试次'},
  'phase.empty_trial':  {en:'Empty Trial', zh:'Empty Trial'},
  'phase.drop_comp':    {en:'Drop component', zh:'拖入组件'},
  'phase.add_trial':    {en:'+ Add Trial', zh:'+ 添加试次'},
  // --- AI dialog ---
  'ai.title':         {en:'AI Generate Experiment', zh:'AI 生成实验'},
  'ai.subtitle':      {en:'Describe your experiment in natural language', zh:'用自然语言描述，AI 自动构建实验结构'},
  'ai.apikey_label':  {en:'🔑 API Key', zh:'🔑 API Key'},
  'ai.apikey_hint':   {en:'Stored locally in your browser', zh:'保存在本地浏览器'},
  'ai.provider_label':{en:'🤖 Provider', zh:'🤖 模型提供商'},
  'ai.prompt_label':  {en:'📝 Experiment Description', zh:'📝 实验描述'},
  'ai.prompt_placeholder': {en:'e.g.:\\nDesign a Stroop color-word interference experiment with instructions, 48 trials (red/blue/green text, congruent and incongruent conditions), and a feedback phase.\\n\\nOr:\\nDesign a Simon effect experiment with instructions, 60 trials (red/green shapes randomly appearing left/right, keyboard response), and feedback.', zh:'例如：\n设计一个Stroop色词干扰实验，包含指导语、48个试次（红/蓝/绿文字，颜色和字义一致或不一致）、反馈阶段\n\n或：\n设计一个Simon效应实验，包含指导语、60个试次（红绿方块随机左右出现，按键反应）、反馈阶段'},
  'ai.btn.optimize':  {en:'🔧 Optimize Prompt', zh:'🔧 优化提示词'},
  'ai.btn.generate':  {en:'✨ Generate Experiment', zh:'✨ 生成实验'},
  'ai.btn.cancel':    {en:'Cancel', zh:'取消'},
  'ai.status.generating': {en:'⏳ Calling API...', zh:'⏳ 正在调用 API...'},
  'ai.status.success': {en:'✅ Experiment generated!', zh:'✅ 实验生成成功！'},
  // --- Publish ---
  'publish.config_title': {en:'📋 Publish Settings', zh:'📋 Publish Settings'},
  'publish.target_n':     {en:'👥 Target Participants', zh:'👥 Target Participants'},
  'publish.reward':       {en:'💰 Reward (¥/person)', zh:'💰 Reward (¥/person)'},
  'publish.public':       {en:'🌐 Show in Experiment Hall', zh:'🌐 Show in Experiment Hall'},
  'publish.public_desc':  {en:'When enabled, participants can find this experiment in the hall', zh:'When enabled, participants can find this experiment in the hall'},
  // --- Misc ---
  'misc.empty_trial':    {en:'Empty Trial', zh:'Empty Trial'},
  'misc.delete':         {en:'✕ Delete', zh:'✕ 删除'},
  'misc.version_latest': {en:'Latest', zh:'Latest'},
  'misc.version_restore':{en:'Restore', zh:'Restore'},
  'misc.phase_delete':   {en:'✕ Delete', zh:'✕ 删除'},
  'misc.drag_hint':      {en:'Drag to reposition · Double-click to reset', zh:'Drag to reposition · Double-click to reset'},
  'misc.close':          {en:'Close', zh:'Close'},
  'misc.component_list': {en:'📋 Component List', zh:'📋 Component List'},
  // --- Language toggle ---
  'lang.switch':         {en:'中文', zh:'English'},
};

function i18n(key) {
  var entry = _i18n[key];
  if (!entry) return key;
  return entry[_lang] || entry['en'] || key;
}

function switchLanguage() {
  _lang = (_lang === 'zh') ? 'en' : 'zh';
  localStorage.setItem('ve_lang', _lang);
  location.reload();
}
// Patch: helper to update static HTML elements with data-i18n
function _applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    var key = el.getAttribute('data-i18n');
    var text = t(key);
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.placeholder = text;
    } else {
      el.textContent = text;
    }
  });
  document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
    el.title = t(el.getAttribute('data-i18n-title'));
  });
  document.documentElement.lang = _lang;
}

/**
 * ExpVis Editor — editor.js
 * Visual, component-based behavioral experiment builder.
 * Generates standard jsPsych code with AI-assisted design.
 *
 * Architecture:
 *   Section 1:  State & Core CRUD
 *   Section 2:  Drag & Drop System
 *   Section 3:  Flow Canvas Rendering
 *   Section 5:  Inspector Panel
 *   Section 6:  Preview System (inline + visual editor + fullscreen)
 *   Section 7:  Undo
 *   Section 8:  jsPsych Code Generation
 *   Section 9:  AI Experiment Generation
 *   Section 10: Version Management & Publishing
 *   Section 11: Classic Experiment Templates
 *   Section 13: Device Simulation
 *   Section 14: Keyboard Shortcuts & Context Menu
 *   Section 15: Onboarding Tutorial
 *
 * License: MIT
 */

// ============ State ============
      // Platform session integration: read logged-in user for data isolation
      var _veUserId = '';
      function _loadSession() {
        try {
          var s = JSON.parse(localStorage.getItem('ve_session'));
          _veUserId = s && s.id && Date.now() - s.loginAt < 2 * 60 * 60 * 1000 ? s.id : '';
        } catch (e) {
          _veUserId = '';
        }
      }
      function _vek(key) {
        return _veUserId ? 've_' + _veUserId + '_' + key : 'vibexp_' + key;
      }
      _loadSession();
      // Refresh session on activity (prevent idle expiry while editing)
      var _actTimer = null;
      ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(function (evt) {
        document.addEventListener(
          evt,
          function () {
            if (!_veUserId || _actTimer) return;
            _actTimer = setTimeout(function () {
              _actTimer = null;
              try {
                var s = JSON.parse(localStorage.getItem('ve_session'));
                if (s) {
                  s.loginAt = Date.now();
                  localStorage.setItem('ve_session', JSON.stringify(s));
                }
              } catch (e) {}
            }, 30000);
          },
          {passive: true},
        );
      });
      // Re-check session when tab becomes visible
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden && !_veUserId) _loadSession();
      });

      var editor = {
        phases: [],
        selectedTrial: null,
        tc: 0,
        pc: 0,
        selComp: null,
        cc: 0,
        history: [],
        hi: -1,
        device: null,
        versions: [],
        projectName: '',
        projectId: '',
        // The JATOS identity of this project — {study, component}, both uuids.
        // Minted on the first .jzip export and then kept, so exporting again and
        // importing again overwrites the same study on the JATOS server rather
        // than piling up a new one per revision. Null until then; nothing reads
        // it except the export, which is what makes it safe to leave out of the
        // undo and version snapshots (they hold experiment content; this is
        // project identity, like projectId).
        jatos: null,
      };

      // Phase/device labels: storage keeps plain text so that generated jsPsych
      // code carries no decorative emoji. The UI re-adds an icon at render time.
      // _stripEmoji also cleans legacy data saved before this convention.
      function _stripEmoji(s) {
        return (s || '').replace(
          /^(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]+\s*)+/u,
          '',
        );
      }
      // Turn a phase name into the prefix of its generated variable names, so
      // "Trials" becomes `trials_trial_1` and `trials_timeline`. The name is the
      // user's, so the slug has to survive two things the old type-based one
      // could not: a name that is not ASCII (an identifier cannot be, even
      // though the header comment above it keeps the name as typed) and a name
      // that repeats (two phases both called "Trials" would otherwise declare
      // `var trials_trial_1` twice, and the second would silently win).
      function _slugify(name) {
        var s = _stripEmoji(String(name == null ? '' : name))
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '');
        if (!s) return 'phase';
        // A leading digit is legal in neither a slug nor a JS identifier.
        return /^[0-9]/.test(s) ? 'phase_' + s : s;
      }
      // "Trials", "Trials" → "trials", "trials_2". `seen` is the caller's set,
      // so uniqueness holds across the whole experiment, not within one phase.
      function _uniqueSlug(base, seen) {
        var s = base, n = 2;
        while (seen[s]) s = base + '_' + n++;
        seen[s] = true;
        return s;
      }
      function _phaseLabel(ph) {
        return _stripEmoji(ph.name);
      }
      // What the phase is called where it matters — in the code. Asked of the
      // compiler, which knows the de-duplicated name a repeated one gets.
      function _phaseRenameTitle(ph, mode) {
        var base = 'Double-click to rename.';
        if (!mode || !mode.slug) return base;
        return base + ' In the generated code this phase is \u2018' + mode.slug +
          '\u2019: its trials are ' + mode.slug + '_trial_1, ' + mode.slug +
          '_trial_2 \u2026 and the node it pushes is ' + mode.slug + '_timeline.';
      }

      // Renaming happens on the card, where the phase is. The code follows on
      // its own: every generated name is derived from this one string.
      function _startPhaseRename(el) {
        var pid = el.getAttribute('data-phase');
        var ph = editor.phases.filter(function (p) { return p.id === pid; })[0];
        if (!ph) return;
        var was = _stripEmoji(ph.name);
        var input = document.createElement('input');
        input.type = 'text';
        input.value = was;
        input.className = 'phase-name-input';
        el.replaceWith(input);
        input.focus();
        input.select();
        var settled = false;
        function finish(save) {
          if (settled) return;
          settled = true;
          var v = input.value.replace(/\s+/g, ' ').trim();
          // An empty name would leave the card with no label and the code with
          // the fallback slug, so it is treated as a cancelled edit.
          if (save && v && v !== was) {
            saveState();
            ph.name = v;
            autoSave();
          }
          renderAll();
        }
        input.onblur = function () { finish(true); };
        input.onkeydown = function (e) {
          if (e.key === 'Enter') { e.preventDefault(); finish(true); }
          else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        };
        // The card itself selects a trial and drags; neither should happen
        // while the name is being typed.
        ['click', 'dblclick', 'mousedown', 'dragstart'].forEach(function (ev) {
          input.addEventListener(ev, function (e) { e.stopPropagation(); });
        });
      }
      function _deviceLabel(d) {
        if (!d) return '';
        var icon = d.icon || '';
        var name = _stripEmoji(d.name);
        var size = d.w && d.h ? ' · ' + d.w + '×' + d.h : '';
        return (icon ? icon + ' ' + name : name) + size;
      }

      // ---- Device / stage size --------------------------------------------
      // `editor.device` is the stage the experiment is designed for. The presets
      // fill it in; the width/height fields can override either of them, which
      // switches the label to Custom. One value drives everything: the generated
      // experiment's stage, the sidebar live preview and the layout preview.
      var devicePresets = [
        {name: 'Desktop', icon: '💻', w: 1280, h: 720},
        {name: 'Mobile', icon: '📱', w: 375, h: 667},
      ];
      var DEVICE_MIN = 240;
      var DEVICE_MAX = 4096;

      function _devicePresetIndex(w, h) {
        for (var i = 0; i < devicePresets.length; i++) {
          if (devicePresets[i].w === w && devicePresets[i].h === h) return i;
        }
        return -1;
      }

      function _saveDevice() {
        try {
          localStorage.setItem(_vek('device'), JSON.stringify({w: editor.device.w, h: editor.device.h}));
        } catch (e) {}
      }

      // Every entry point into the size goes through here, so the label, the
      // dropdown, the number fields and both previews can never disagree.
      function setDeviceSize(w, h) {
        w = Math.round(Number(w));
        h = Math.round(Number(h));
        if (!isFinite(w) || !isFinite(h)) return;
        w = Math.max(DEVICE_MIN, Math.min(DEVICE_MAX, w));
        h = Math.max(DEVICE_MIN, Math.min(DEVICE_MAX, h));
        var i = _devicePresetIndex(w, h);
        editor.device = i >= 0
          ? {name: devicePresets[i].name, icon: devicePresets[i].icon, w: w, h: h}
          : {name: 'Custom', icon: '⚙️', w: w, h: h};
        _saveDevice();
        syncDeviceControls();
        renderAll();
      }

      // Repaint the header controls from editor.device.
      function syncDeviceControls() {
        var d = editor.device || devicePresets[0];
        var idx = _devicePresetIndex(d.w, d.h);
        var sel = document.getElementById('device-select');
        if (sel) {
          var html = '';
          devicePresets.forEach(function (p, i) {
            html += '<option value="' + i + '"' + (idx === i ? ' selected' : '') + '>' +
              p.icon + ' ' + p.name + ' · ' + p.w + '×' + p.h + '</option>';
          });
          html += '<option value="custom"' + (idx < 0 ? ' selected' : '') + '>⚙️ Custom · ' +
            d.w + '×' + d.h + '</option>';
          sel.innerHTML = html;
        }
        // Don't fight the user while they are typing in the fields.
        var wi = document.getElementById('device-w');
        var hi = document.getElementById('device-h');
        if (wi && document.activeElement !== wi) wi.value = d.w;
        if (hi && document.activeElement !== hi) hi.value = d.h;
      }

      // A phase is a name and a list of trials. It used to carry a `type` as
      // well — instructions / trials / feedback — which chose the card's icon
      // and colour; with the toolbar down to one button that distinction had
      // nowhere to be made and nothing to mean, so it is gone. The name is what
      // the generated code uses; nothing else about a phase is in the file.
      function addPhase(name) {
        saveState();
        editor.phases.push({
          id: 'ph' + ++editor.pc,
          name: name || 'Trials',
          timeline: [],
        });
        document.getElementById('empty-state').style.display = 'none';
        renderFlow();
      }

      function addTrial(pid) {
        var t = {id: 't' + ++editor.tc, components: []};
        var ph = editor.phases.find((p) => p.id === pid);
        if (ph) {
          saveState();
          ph.timeline.push(t);
          editor.selectedTrial = t.id;
        }
        document.getElementById('empty-state').style.display = 'none';
        if (editor.selectedTrial) {
          var ft = findTrial(editor.selectedTrial);
          if (ft && ft.components.length > 0) editor.selComp = ft.components[0].id;
        }
        renderAll();
      }

      function selectTrial(id) {
        editor.selectedTrial = id;
        editor.selComp = null; // trial selected → inspector shows trial settings
        renderAll();
      }
      function removeTrial(id) {
        saveState();
        editor.phases.forEach((p) => {
          p.timeline = p.timeline.filter((t) => t.id !== id);
        });
        if (editor.selectedTrial === id) editor.selectedTrial = null;
        renderAll();
      }
      function deletePhase(pid) {
        if (!confirm('Delete this phase and all its trials?')) return;
        saveState();
        editor.phases = editor.phases.filter((p) => p.id !== pid);
        if (editor.phases.length === 0) document.getElementById('empty-state').style.display = 'block';
        renderAll();
      }
      function findTrial(id) {
        for (var p of editor.phases) for (var t of p.timeline) if (t.id === id) return t;
        return null;
      }

      function addComponent(tid, type, cat) {
        var t = findTrial(tid);
        if (!t) return;
        var defs = {
          text: {
            type: 'text',
            content: 'New Text',
            fontSize: 32,
            color: '#333333',
            position: 'center',
            fontWeight: 'bold',
          },
          shape: {type: 'shape', shape: 'circle', size: 80, color: '#6366f1', position: 'center'},
          // stimulus_width/height/maintain_aspect_ratio are the image plugins'
          // own parameters; they apply when the trial runs on one of them (see
          // the image-plugin rule in _compileExperiment) and as max-width in the
          // HTML path otherwise.
          image: {
            type: 'image',
            fileData: '',
            fileName: '',
            stimulus_width: 200,
            stimulus_height: 0,
            maintain_aspect_ratio: true,
            render_on_canvas: true,
          },
          // Frame-by-frame animation (jsPsychAnimation). It OWNS the display —
          // the plugin clears the display element each frame — so it carries no
          // position and cannot share a trial with other components.
          animation: {
            type: 'animation',
            frames: [],
            frame_time: 250,
            frame_isi: 0,
            sequence_reps: 1,
            choices: [],
            prompt: '',
            render_on_canvas: true,
          },
          audio: {type: 'audio', fileData: '', fileName: ''},
          video: {type: 'video', fileData: '', fileName: '', width: 320},
          // Emitted as a jsPsychHtmlKeyboardResponse trial with choices NO_KEYS,
          // so `trial_duration` is the parameter it actually sets. The jitter trio
          // is an ExpVis extension that turns that value into a dynamic parameter
          // (a function sampling from a list) — the same idiom the official
          // rt-task demo uses for its fixation.
          fixation: {
            type: 'fixation',
            trial_duration: 500,
            durationMin: 0,
            durationMax: 0,
            durationStep: 250,
          },
          // Field names mirror jsPsychHtmlKeyboardResponse's parameters. `choices`
          // is an array of key strings; an EMPTY array means "ALL_KEYS" (jsPsych's
          // own sentinel for any key) — see keyboardChoices() below.
          keyboard: {
            type: 'keyboard',
            choices: ['a', 'l'],
            correctKey: '',
            prompt: 'Press a key',
            trial_duration: 0,
            stimulus_duration: 0,
            response_ends_trial: true,
            wait_for_key_release: false,
          },
          // Field names mirror jsPsychHtmlButtonResponse's parameters exactly, so
          // the inspector reads like the plugin's docs. `choices` is a real array
          // (the inspector edits it as comma-separated text and converts back).
          // 0 means "not set" for the numeric params — jsPsych's own default is null.
          button: {
            type: 'button',
            choices: ['Yes', 'No'],
            prompt: '',
            button_layout: 'grid',
            grid_rows: 1,
            grid_columns: 0,
            trial_duration: 0,
            stimulus_duration: 0,
            response_ends_trial: true,
            enable_button_after: 0,
          },
          // Field names mirror jsPsychHtmlSliderResponse's parameters. `labels`
          // is an array placed at equal spacing (0, or 2+ — one label would divide
          // by zero in the plugin's layout maths). 0 means "not set" for numbers.
          slider: {
            type: 'slider',
            min: 0,
            max: 100,
            step: 1,
            slider_start: 50,
            labels: [],
            button_label: 'Continue',
            slider_width: 0,
            require_movement: false,
            prompt: '',
            trial_duration: 0,
            stimulus_duration: 0,
            response_ends_trial: true,
          },
          // Runs on jsPsychSurveyText. `prompt` is the question text and MUST be
          // emitted as a string — the plugin renders <p>prompt</p> unconditionally,
          // so an empty one would print the literal word "undefined".
          // survey-text has no correctAnswer and no trial_duration: a free-text
          // question has no right answer and cannot auto-advance.
          textInput: {
            type: 'textInput',
            prompt: '',
            placeholder: 'Enter text',
            name: 'Q0',
            required: false,
            rows: 1,
            columns: 40,
            button_label: 'Continue',
            autocomplete: false,
          },
        };
        if (!defs[type]) {
          // A retired or unknown type: refuse rather than create an inert shell
          // that renders as an empty node and generates nothing.
          console.warn('[ExpVis] Unknown component type "' + type + '" — nothing was added.');
          return;
        }
        // One response per trial, because a jsPsych trial runs one response
        // plugin. A second would produce a trial whose plugin and parameters
        // come from different components — measured once: a keyboard plugin
        // carrying the button's `choices`, which no participant can answer, and
        // the canvas showed nothing wrong. Put it in a trial of its own, which
        // is what the researcher needs anyway. Every path that adds a component
        // comes through here — both drops and the inspector's buttons.
        if (cat === 'r' && t.components.some(function (x) { return x.cat === 'r'; })) {
          var ph = null;
          editor.phases.forEach(function (p) {
            if (p.timeline.indexOf(t) >= 0) ph = p;
          });
          if (ph) {
            var nt = {id: 't' + ++editor.tc, components: []};
            ph.timeline.splice(ph.timeline.indexOf(t) + 1, 0, nt);
            t = nt;
            editor.selectedTrial = nt.id;
          }
        }
        var c = JSON.parse(JSON.stringify(defs[type]));
        c.id = 'c' + ++editor.cc;
        c.cat = cat;
        saveState();
        t.components.push(c);
        if (editor.selectedTrial) {
          var ft = findTrial(editor.selectedTrial);
          if (ft && ft.components.length > 0) editor.selComp = ft.components[0].id;
        }
        renderAll();
      }

      function removeComponent(tid, cid) {
        var t = findTrial(tid);
        if (!t) return;
        saveState();
        t.components = t.components.filter((c) => c.id !== cid);
        if (editor.selComp === cid) {
          editor.selComp = t.components.length > 0 ? t.components[0].id : null;
        }
        renderAll();
      }
      function moveComponent(fromTid, cid, toTid) {
        saveState();
        var ft = findTrial(fromTid),
          tt = findTrial(toTid);
        if (!ft || !tt || fromTid === toTid) return;
        var comp = ft.components.find(function (c) {
          return c.id === cid;
        });
        if (!comp) return;
        ft.components = ft.components.filter(function (c) {
          return c.id !== cid;
        });
        tt.components.push(comp);
        if (editor.selComp === cid) {
          editor.selComp = cid;
          editor.selectedTrial = toTid;
        }
        renderAll();
      }
      function reorderComponent(tid, dragCid, targetCid) {
        saveState();
        var t = findTrial(tid);
        if (!t || dragCid === targetCid) return;
        var comps = t.components;
        var dragIdx = comps.findIndex(function (c) {
          return c.id === dragCid;
        });
        var targetIdx = comps.findIndex(function (c) {
          return c.id === targetCid;
        });
        if (dragIdx < 0 || targetIdx < 0) return;
        var item = comps.splice(dragIdx, 1)[0];
        var newTargetIdx = comps.findIndex(function (c) {
          return c.id === targetCid;
        });
        comps.splice(newTargetIdx, 0, item);
        renderAll();
      }

      function updateComponent(tid, cid, field, value) {
        if (!editor._ucSaved) {
          saveState();
          editor._ucSaved = true;
          setTimeout(function () {
            editor._ucSaved = false;
          }, 2000);
        }
        var t = findTrial(tid);
        if (!t) return;
        var c = t.components.find((c) => c.id === cid);
        if (!c) return;
        if (
          [
            'fontSize',
            'size',
            'duration',
            'trial_duration',
            'maxSize',
            'count',
            'min',
            'max',
            'step',
            'width',
            'initial',
            'grid_rows',
            'grid_columns',
            'stimulus_duration',
            'enable_button_after',
          ].includes(field)
        )
          value = parseFloat(value) || 0;
        c[field] = value;
        renderAll();
      }

      // ============ Drag & Drop ============
      function dragStart(e) {
        window._dt = e.target.closest('.comp-card').dataset.type;
        window._dc = e.target.closest('.comp-card').dataset.cat;
        document.getElementById('drag-preview').textContent = e.target
          .closest('.comp-card')
          .querySelector('.comp-card-name').textContent;
        document.getElementById('drag-preview').style.display = 'block';
        e.target.closest('.comp-card').style.opacity = '0.4';
      }
      function dragEnd(e) {
        document.getElementById('drag-preview').style.display = 'none';
        if (e.target.closest) {
          var c = e.target.closest('.comp-card');
          if (c) c.style.opacity = '1';
        }
      }
      document.addEventListener('dragover', function (e) {
        var p = document.getElementById('drag-preview');
        if (p.style.display === 'block') {
          p.style.left = e.clientX + 'px';
          p.style.top = e.clientY - 30 + 'px';
        }
      });
      function dragOver(e) {
        e.preventDefault();
      }
      function dropOnCanvas(e) {
        e.preventDefault();
        if (!window._dt || !editor.selectedTrial) return;
        addComponent(editor.selectedTrial, window._dt, window._dc);
      }
      function dropOnNode(e, tid) {
        e.preventDefault();
        e.stopPropagation();
        if (window._dt) addComponent(tid, window._dt, window._dc);
      }

      // ============ Flow Render ============
      var icons = {
        text: '📝',
        shape: '⏺️',
        image: '🖼️',
        animation: '🎞️',
        audio: '🎵',
        video: '🎬',
        fixation: '➕',
        keyboard: '⌨️',
        button: '🔘',
        slider: '🎚️',
        textInput: '📝',
      };
      var labels = {
        text: 'Text',
        shape: 'Shape',
        image: 'Image',
        animation: 'Animation',
        audio: 'Audio',
        video: 'Video',
        fixation: 'Fixation',
        keyboard: 'Keyboard',
        button: 'Button',
        slider: 'Slider',
        textInput: 'Survey Text',
      };
      var propLabel = {
        content: 'Content',
        fontSize: 'Font Size',
        color: 'Color',
        position: 'Position',
        fontWeight: 'Weight',
        shape: 'Shape',
        size: 'Size',
        correctKeyHint: 'Key Hint',
        width: 'Width',
        stimulus_width: 'Stimulus Width',
        stimulus_height: 'Stimulus Height',
        maintain_aspect_ratio: 'Maintain Aspect Ratio',
        height: 'Height',
        duration: 'Duration',
        behavior: 'Behavior',
        maxSize: 'Max Size',
        映射按键: '🎯 Key Mapping',
        trial_duration: 'Trial Duration',
        durationMin: 'Jitter Min',
        durationMax: 'Jitter Max',
        durationStep: 'Jitter Step',
        // button — labels mirror jsPsychHtmlButtonResponse's parameter names
        choices: 'Choices',
        prompt: 'Prompt',
        button_layout: 'Button Layout',
        grid_rows: 'Grid Rows',
        grid_columns: 'Grid Columns',
        stimulus_duration: 'Stimulus Duration',
        response_ends_trial: 'Response Ends Trial',
        enable_button_after: 'Enable Button After',
        wait_for_key_release: 'Wait For Key Release',
        min: 'Min',
        max: 'Max',
        step: 'Step',
        frames: 'Frames',
        frame_time: 'Frame Time',
        frame_isi: 'Frame ISI',
        sequence_reps: 'Sequence Reps',
        render_on_canvas: 'Render On Canvas',
        slider_start: 'Slider Start',
        labels: 'Labels',
        button_label: 'Button Label',
        slider_width: 'Slider Width',
        require_movement: 'Require Movement',
        prompt: 'Prompt',
        placeholder: 'Placeholder',
        required: 'Required',
        rows: 'Rows',
        columns: 'Columns',
        button_label: 'Button Label',
        autocomplete: 'Autocomplete',
        name: 'Var Name',
      };

      function renderAll() {
        renderFlow();
        renderInspector();
        renderPreview();
        autoSave();
      }
      function autoSave() {
        clearTimeout(editor._asTimer);
        editor._asTimer = setTimeout(function () {
          try {
            var data = {
              phases: editor.phases,
              sel: editor.selectedTrial,
              sc: editor.selComp,
              tc: editor.tc,
              pc: editor.pc,
              cc: editor.cc,
              pn: editor.projectName,
              pid: editor.projectId,
              jatos: editor.jatos,
            };
            localStorage.setItem(_vek('task_editor'), JSON.stringify(data));
            localStorage.setItem(_vek('task_versions'), JSON.stringify(editor.versions));
          } catch (e) {
            /* quota exceeded, ignore */
          }
        }, 500);
      }

      function renderFlow() {
        var fc = document.getElementById('flow-container');
        var es = document.getElementById('empty-state');
        // A real click focuses the button before it fires, and the browser
        // scrolls a newly focused element into view — so clicking "+ Add Trial"
        // or a row's ✕ scrolled the canvas to wherever that button sat, which
        // reads as the canvas jumping to the top. The rebuild then replaces the
        // button, and the canvas stays where the focus put it. That is why this
        // happened on mouse clicks and never on a synthetic `.click()`: the
        // latter does not move focus at all.
        //
        // Taking the default away from mousedown on buttons stops the focus and
        // the click still fires. Only buttons: the drag handles are spans, so
        // dragging a phase or a component is untouched. Assigned rather than
        // added, so repeated renders do not stack handlers.
        fc.onmousedown = function (e) {
          if (e.target && e.target.closest && e.target.closest('button')) {
            e.preventDefault();
          }
        };
        // The rebuild below removes every card before adding the new ones, and
        // during that gap the container is only as tall as its min-height. When
        // that is shorter than the visible canvas the browser clamps scrollTop
        // to 0. Carry the position across the rebuild as well.
        var scroller = document.getElementById('canvas-scroll');
        var keepTop = scroller ? scroller.scrollTop : 0;
        if (editor.phases.length === 0) {
          es.style.display = 'block';
          fc.querySelectorAll('.phase-card,.phase-arrow,.flow-row,.add-node-btn').forEach((el) => {
            if (!el.classList.contains('empty-state')) el.remove();
          });
          return;
        }
        es.style.display = 'none';
        // Remove old rendered nodes (keep the empty-state placeholder)
        fc.querySelectorAll('.phase-card,.phase-arrow').forEach((el) => el.remove());
        fc.querySelectorAll('.flow-row').forEach((el) => el.remove());

        var _modes = phaseModes();
        editor.phases.forEach(function (ph, i) {
          // Presentation steps are numbered across the whole phase, not per trial:
          // a phase is one block of the experiment, so its screens read as a single
          // sequence instead of every trial restarting at 1.
          //
          // Except when the phase's trials are one procedure repeated — then they
          // are conditions, not a sequence, so each runs the same steps and the
          // numbering restarts. Counted straight across, a 4-condition phase would
          // claim 12 consecutive screens.
          var _mode = _modes[ph.id];
          var _perTrial = !!(_mode && _mode.factored);
          var _stepNo = 0;
          // Phase card wrapper
          var card = document.createElement('div');
          card.className = 'phase-card';
          card.setAttribute('data-phase-idx', i);
          card.ondragover = function (e) {
            e.preventDefault();
            card.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.2)';
          };
          card.ondragleave = function (e) {
            card.style.boxShadow = '';
          };
          card.ondrop = function (e) {
            e.preventDefault();
            card.style.boxShadow = '';
            var raw = e.dataTransfer.getData('phaseIdx');
            if (raw) {
              var from = parseInt(raw);
              if (!isNaN(from)) {
                var item = editor.phases.splice(from, 1)[0];
                editor.phases.splice(i, 0, item);
                renderAll();
                return;
              }
            }
            var mc = e.dataTransfer.getData('moveComp') || window._mc;
            var mt = e.dataTransfer.getData('moveTrial') || window._mt;
            window._mc = null;
            window._mt = null;
            if (mc && mt && ph.timeline.length > 0) {
              moveComponent(mt, mc, ph.timeline[0].id);
            }
          };
          card.onclick = function (e) {
            if (ph.timeline.length > 0) {
              editor.selectedTrial = ph.timeline[0].id;
              editor.selComp = ph.timeline[0].components.length > 0 ? ph.timeline[0].components[0].id : null;
              renderPreview();
            }
          };

          // Card header
          var hdr = document.createElement('div');
          hdr.className = 'phase-card-header';
          // The dot has to cover every setting the dialog holds. A phase whose
          // only setting is a loop or a condition would otherwise look untouched
          // — and a feature that is reachable but not visible may as well not be
          // there.
          var configured = !!(ph.sample || Number(ph.repetitions) > 1 || ph.loop || ph.cond);
          hdr.innerHTML =
            '<span class="drag-handle" draggable="true" title="Drag to reorder phase">⋮⋮</span><span class="phase-index">' +
            (i + 1) +
            '</span><span class="phase-name" data-phase="' + ph.id + '" title="' +
            _phaseRenameTitle(ph, _mode) + '">' +
            _phaseLabel(ph) +
            '</span><span class="phase-mode' + (_mode && _mode.factored ? ' factored' : '') +
            '" title="' + _phaseModeTitle(_mode) + '">' +
            _phaseModeLabel(_mode) +
            '</span><button data-phase="' +
            ph.id +
            '" class="phase-settings-btn' +
            (configured ? ' configured' : '') +
            '" style="margin-left:auto" title="Repetitions, sampling, randomisation and ' +
            'conditions for this phase' +
            (configured ? ' — configured' : '') + '">Settings' +
            (configured ? '<span class="phase-settings-dot"></span>' : '') +
            '</button><button data-phase="' +
            ph.id +
            '" class="phase-delete-btn" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:0.7rem;opacity:0.4;padding:2px 8px;border-radius:4px" title="Delete this phase">✕ Delete</button>';
          card.appendChild(hdr);

          // Card body
          var cardBody = document.createElement('div');
          cardBody.className = 'phase-card-body';

          if (ph.timeline.length === 0) {
            var emptyRow = document.createElement('div');
            emptyRow.className = 'flow-row';
            emptyRow.ondragover = function (e) {
              e.preventDefault();
              emptyRow.style.background = 'var(--th-drag-over,#eef0ff)';
              emptyRow.style.borderRadius = '8px';
            };
            emptyRow.ondragleave = function (e) {
              emptyRow.style.background = '';
            };
            emptyRow.ondrop = function (e) {
              e.preventDefault();
              e.stopPropagation();
              emptyRow.style.background = '';
              var mc = e.dataTransfer.getData('moveComp') || window._mc;
              var mt = e.dataTransfer.getData('moveTrial') || window._mt;
              window._mc = null;
              window._mt = null;
              if (mc && mt) {
                addTrial(ph.id);
                var nt = ph.timeline[ph.timeline.length - 1];
                if (nt) moveComponent(mt, mc, nt.id);
              } else if (window._dt) {
                addTrial(ph.id);
                var nt = ph.timeline[ph.timeline.length - 1];
                if (nt) addComponent(nt.id, window._dt, window._dc);
              }
            };
            var emptyCard = document.createElement('div');
            emptyCard.className = 'flow-node';
            emptyCard.style.borderStyle = 'dashed';
            emptyCard.style.opacity = '0.5';
            emptyCard.innerHTML =
              '<div class="flow-node-icon" style="background:#f5f5fa">+</div><div class="flow-node-body"><div class="flow-node-label">Empty Trial</div><div class="flow-node-detail">Drop component</div></div>';
            emptyRow.appendChild(emptyCard);
            cardBody.appendChild(emptyRow);
          }
          ph.timeline.forEach(function (t) {
            // Each condition of a factored phase runs the same procedure, so its
            // steps are numbered from 1 again rather than continuing the count.
            if (_perTrial) _stepNo = 0;
            var row = document.createElement('div');
            row.className = 'flow-row';
            row.setAttribute('data-trial', t.id);
            row.ondragover = function (e) {
              e.preventDefault();
              if (window._mc) {
                row.classList.add('drag-reorder-active');
              }
            };
            row.ondragleave = function (e) {
              row.classList.remove('drag-reorder-active');
            };
            row.ondrop = function (e) {
              e.preventDefault();
              e.stopPropagation();
              row.classList.remove('drag-reorder-active');
              var mc = e.dataTransfer.getData('moveComp') || window._mc;
              var mt = e.dataTransfer.getData('moveTrial') || window._mt;
              window._mc = null;
              window._mt = null;
              if (mc && mt) {
                if (mt !== t.id) {
                  moveComponent(mt, mc, t.id);
                } else {
                  var comps = t.components;
                  if (comps.length > 0 && mc !== comps[comps.length - 1].id) {
                    reorderComponent(t.id, mc, comps[comps.length - 1].id);
                  }
                }
              } else if (window._dt) {
                dropOnNode(e, t.id);
              }
            };

            // Add node for each component
            var isEmpty = t.components.length === 0;
            if (isEmpty) {
              var emptyNode = document.createElement('div');
              emptyNode.className = 'flow-node';
              emptyNode.style.borderStyle = 'dashed';
              emptyNode.style.opacity = '0.5';
              emptyNode.innerHTML =
                '<div class="flow-node-icon" style="background:#f5f5fa">+</div><div class="flow-node-body"><div class="flow-node-label">Empty Trial</div><div class="flow-node-detail">Drop component</div></div>';
              emptyNode.onclick = function () {
                selectTrial(t.id);
              };
              row.appendChild(emptyNode);
            } else {
              // Only stimuli and responses are drawn as nodes — they are what
              // becomes a jsPsych trial. Loop / randomize / branch / delay /
              // variable are *parameters* of the trial, shown as badges instead.
              var visualComps = t.components.filter(function (c) {
                return c.cat === 's' || c.cat === 'r';
              });
              // Build one node for a component (extracted so it can be nested
              // inside a "simultaneous" group box).
              function makeNode(c, compact) {
                var node = document.createElement('div');
                var sel = t.id === editor.selectedTrial && editor.selComp === c.id;
                node.className = (compact ? 'flow-chip' : 'flow-node') + (sel ? ' selected' : '');
                if (compact) {
                  // Inside a simultaneous group the components share one screen;
                  // a compact chip keeps the row from overflowing the card.
                  node.innerHTML = '<span class="flow-chip-icon">' + (icons[c.type] || '?') +
                    '</span><span class="flow-chip-label">' + labels[c.type] +
                    '</span><span class="flow-chip-detail">' +
                    String(getDetail(c)).split('\n')[0].slice(0, 14) + '</span>';
                } else {
                  var iconBg = c.cat === 's' ? '#eef0ff' : c.cat === 'r' ? '#fff7ed' : '#f0fdf4';
                  node.innerHTML =
                    '<div class="flow-node-icon" style="background:' +
                    iconBg +
                    '">' +
                    (icons[c.type] || '?') +
                    '</div><div class="flow-node-body"><div class="flow-node-label">' +
                    labels[c.type] +
                    '</div><div class="flow-node-detail">' +
                    getDetail(c) +
                    '</div></div>';
                }
                node.setAttribute('draggable', 'true');
                node.onclick = function (e) {
                  e.stopPropagation();
                  editor.selectedTrial = t.id;
                  editor.selComp = c.id;
                  renderAll();
                };
                node.ondragstart = function (e) {
                  e.stopPropagation();
                  e.dataTransfer.setData('moveComp', c.id);
                  e.dataTransfer.setData('moveTrial', t.id);
                  window._mc = c.id;
                  window._mt = t.id;
                  node.style.opacity = '0.4';
                  window._dt = null;
                };
                node.ondragend = function (e) {
                  node.style.opacity = '1';
                  window._mc = null;
                  window._mt = null;
                };
                node.oncontextmenu = function (e) {
                  e.preventDefault();
                  e.stopPropagation();
                  editor.selectedTrial = t.id;
                  editor.selComp = c.id;
                  renderAll();
                  showContextMenu(e.clientX, e.clientY, c.id, t.id);
                };
                node.ondragover = function (e) {
                  e.stopPropagation();
                  e.preventDefault();
                  if (window._mc && window._mc !== c.id) {
                    node.classList.add('drag-before');
                  }
                };
                node.ondragleave = function (e) {
                  node.classList.remove('drag-before');
                };
                node.ondrop = function (e) {
                  e.stopPropagation();
                  node.classList.remove('drag-before');
                  var mc = e.dataTransfer.getData('moveComp') || window._mc;
                  var mt = e.dataTransfer.getData('moveTrial') || window._mt;
                  window._mc = null;
                  window._mt = null;
                  if (mc && mt) {
                    if (mt !== t.id) {
                      moveComponent(mt, mc, t.id);
                    } else if (mc !== c.id) {
                      reorderComponent(t.id, mc, c.id);
                    }
                  } else if (window._dt) {
                    dropOnNode(e, t.id);
                  }
                };
                // Individual component delete button. The ids live on the node
                // event target's ancestor, so read them off `node` directly — a
                // closest('.flow-node') lookup misses the compact `.flow-chip`
                // nodes used inside a simultaneous group.
                node.setAttribute('data-trial-id', t.id);
                node.setAttribute('data-comp-id', c.id);
                var compDel = document.createElement('button');
                compDel.style.cssText =
                  'background:none;border:none;color:var(--red);cursor:pointer;font-size:0.6rem;opacity:0.3;padding:0 2px;margin-left:2px';
                compDel.textContent = '✕';
                compDel.title = 'Remove this component';
                compDel.onclick = function (e) {
                  e.stopPropagation();
                  removeComponent(node.getAttribute('data-trial-id'), node.getAttribute('data-comp-id'));
                };
                node.appendChild(compDel);
                return node;
              }

              // ---- Group components into presentation steps -------------------
              // Stimuli (except fixation) share one screen — they must NOT be drawn
              // as a sequence, which is exactly what confused the BRM reviewer
              // ("if I add two shapes, they show as a sequence"). Only fixation,
              // delay and responses are genuinely sequential.
              // The steps are the trials jsPsych will actually run inside this
              // node: a fixation is its own timed trial, every stimulus shares one
              // screen, and the response is the trial's plugin. A stimulus joining
              // the group already open is what "shown together" means — and only a
              // simultaneous group can be joined, because a fixation is its own
              // trial rather than part of the screen that follows it.
              var steps = [];
              var curSimul = null;
              var seenVisual = false;
              var trailing = null;
              visualComps.forEach(function (c) {
                // Where a fixation lands is decided by the compiler, on whether a
                // visual stimulus has already gone by: before one it is emitted
                // as its own trial ahead of the screen, after one it goes to the
                // END of the trial. Grouping by position instead drew
                // [shape, fixation, shape] as three steps, while the code ran
                // both shapes on one screen and the fixation after them — the
                // canvas promising a sequence the experiment does not run.
                if (c.type === 'fixation' && seenVisual) {
                  if (!trailing) trailing = {simul: false, comps: [], trailing: true};
                  trailing.comps.push(c);
                  return;
                }
                var isStim = c.cat === 's' && c.type !== 'fixation';
                if (isStim) seenVisual = true;
                if (isStim && curSimul && curSimul.simul) {
                  curSimul.comps.push(c);
                } else {
                  curSimul = {simul: isStim, comps: [c]};
                  steps.push(curSimul);
                }
              });
              if (trailing) steps.push(trailing);

              // One row per presentation step, numbered down a gutter, so the
              // ORDER reads top-to-bottom. Components that share a step stay side
              // by side inside it — stacking them vertically would read as
              // "one after another", the opposite of what a group means.
              steps.forEach(function (step, si) {
                var stepRow = document.createElement('div');
                stepRow.className = 'flow-step';
                var num = document.createElement('span');
                num.className = 'flow-step-num';
                _stepNo++;
                num.textContent = _stepNo;
                num.title = 'Presentation step ' + _stepNo +
                  (_perTrial ? ' of this condition' : ' of this phase') +
                  ' \u00b7 click for trial settings' +
                  (step.simul && step.comps.length > 1
                    ? ' — ' + step.comps.length + ' components shown together on one screen'
                    : '');
                stepRow.appendChild(num);

                var box;
                // A group earns a tag when it needs explaining: several things
                // sharing one screen, or a fixation the compiler moved to the
                // end. Both are cases where the picture would otherwise lie.
                if ((step.simul && step.comps.length > 1) || step.trailing) {
                  box = document.createElement('div');
                  box.className = 'flow-step-simul';
                  var tag = document.createElement('span');
                  tag.className = 'flow-step-tag';
                  tag.textContent = step.trailing ? 'After the screen' : 'Shown together';
                  tag.title = step.trailing
                    ? 'A fixation that follows a visual stimulus runs after the screen, ' +
                      'not in the middle of it — one jsPsych trial shows one screen.'
                    : step.comps.length +
                      ' components rendered together in one jsPsych stimulus';
                  box.appendChild(tag);
                  step.comps.forEach(function (c) { box.appendChild(makeNode(c, true)); });
                } else {
                  box = makeNode(step.comps[0]);
                }
                stepRow.appendChild(box);
                row.appendChild(stepRow);
              });

            }

            // A trial saved before one-response-per-trial was enforced can still
            // hold several response components. The compiler takes the first and
            // ignores the rest, so the row says which of them is being ignored
            // rather than dropping them quietly — the same rule the custom-parameter
            // badge below follows.
            var respComps = t.components.filter(function (c) {
              return ['keyboard', 'button', 'slider', 'textInput', 'animation']
                .indexOf(c.type) >= 0;
            });
            if (respComps.length > 1) {
              var extra = document.createElement('div');
              extra.textContent = '⚠ ' + (respComps.length - 1) + ' response component' +
                (respComps.length > 2 ? 's' : '') + ' not generated';
              extra.title = 'A jsPsych trial runs one response plugin, so only "' +
                respComps[0].type + '" is generated and the others are ignored. ' +
                'Delete them and add them to a trial of their own — a trial can only ' +
                'hold one response.';
              extra.style.cssText = 'align-self:flex-end;font-size:0.62rem;padding:2px 8px;' +
                'border-radius:999px;cursor:help;color:#9a3412;' +
                'background:#fff7ed;border:1px solid rgba(249,115,22,0.35)';
              row.appendChild(extra);
            }

            // A custom parameter means part of this trial is not something the
            // canvas can draw. Said on the row, because a canvas that quietly
            // stops matching the experiment is worse than one that admits it.
            if (Array.isArray(t.custom) && t.custom.length) {
              var names = t.custom.map(function (x) { return x.name; })
                .filter(function (x) { return x; });
              var overridesStimulus = names.indexOf('stimulus') >= 0;
              var cust = document.createElement('div');
              cust.textContent = overridesStimulus
                ? 'ƒ custom stimulus — the steps above are not what runs'
                : 'ƒ custom: ' + names.join(', ');
              cust.title = overridesStimulus
                ? 'A custom `stimulus` parameter replaces the screen built here, so the steps ' +
                  'above no longer match the generated code. Edit it in Trial Settings ' +
                  '(click the step number).'
                : 'Parameters written as JavaScript, emitted in place of the generated ones: ' +
                  names.join(', ');
              cust.style.cssText = 'align-self:flex-end;font-size:0.62rem;padding:2px 8px;' +
                'border-radius:999px;cursor:help;' +
                (overridesStimulus
                  ? 'color:#9a3412;background:#fff7ed;border:1px solid rgba(249,115,22,0.35)'
                  : 'color:var(--text2);background:#f5f5fa;border:1px solid var(--border)');
              row.appendChild(cust);
            }

            // Action buttons
            var del = document.createElement('button');
            // The trial container is a column now, so pin this to the right edge
            // instead of letting it stretch across the row.
            del.style.cssText =
              'background:none;border:none;color:var(--red);cursor:pointer;font-size:0.7rem;opacity:0.4;z-index:2;align-self:flex-end;padding:0 4px;margin-top:2px';
            del.textContent = '✕';
            del.onclick = function (e) {
              e.stopPropagation();
              removeTrial(t.id);
            };
            row.appendChild(del);

            // Selecting the trial itself. Clicking a component selects the
            // component (and stops propagation), so this only fires on the row
            // around them — the gutter, the step rows, the blank space. Without
            // it Trial Settings was a one-way door: the only thing wired to
            // selectTrial() was the Empty Trial placeholder, which disappears the
            // moment a trial has anything in it.
            // stopPropagation: the phase card has its own click handler that
            // selects its first trial's first component, and it is an ancestor of
            // this row. Without this the card would overwrite what the click just
            // selected — the panel would show Trial Settings while the state said
            // a component was selected.
            row.onclick = function (e) { e.stopPropagation(); selectTrial(t.id); };
            // Clicking the row opens the trial's own settings. Nothing said so:
            // the row carried no hint, the cursor stayed `auto`, and the gutter
            // tooltip only described the step number.
            row.style.cursor = 'pointer';
            row.title = 'Click for this trial\'s settings';

            cardBody.appendChild(row);
          });

          // Add trial button
          var addBtn = document.createElement('button');
          addBtn.style.cssText =
            'display:flex;align-items:center;gap:6px;padding:8px 14px;margin-left:12px;margin-top:6px;border:1px dashed var(--border);border-radius:8px;font-size:0.72rem;color:var(--text2);cursor:pointer;background:transparent;font-family:inherit';
          addBtn.innerHTML = '+ Add Trial';
          addBtn.onclick = function () {
            addTrial(ph.id);
          };
          cardBody.appendChild(addBtn);
          card.appendChild(cardBody);
          fc.appendChild(card);

          // Arrow between phases
          if (i < editor.phases.length - 1) {
            var arrow = document.createElement('div');
            arrow.className = 'phase-arrow';
            arrow.textContent = '↓';
            fc.appendChild(arrow);
          }
        });

        // Re-attach handlers after DOM rebuild
        document.querySelectorAll('.phase-delete-btn').forEach(function (btn) {
          btn.onclick = function (e) {
            e.stopPropagation();
            deletePhase(this.getAttribute('data-phase'));
          };
        });
        document.querySelectorAll('.phase-name').forEach(function (el) {
          el.ondblclick = function (e) {
            e.stopPropagation();
            _startPhaseRename(this);
          };
        });
        document.querySelectorAll('.phase-settings-btn').forEach(function (btn) {
          btn.onclick = function (e) {
            e.stopPropagation();
            showPhaseSettings(this.getAttribute('data-phase'));
          };
        });
        document.querySelectorAll('.drag-handle').forEach(function (handle) {
          handle.ondragstart = function (e) {
            var pg = this.closest('.phase-card');
            e.dataTransfer.setData('phaseIdx', pg.getAttribute('data-phase-idx'));
            pg.style.opacity = '0.4';
          };
          handle.ondragend = function (e) {
            this.closest('.phase-card').style.opacity = '1';
          };
        });
        // Restoring after the rebuild, not instead of it. A delete can leave
        // less to scroll through than before, in which case the browser clamps
        // this to the new maximum — which is what a shorter canvas should do.
        //
        // Twice, because the rebuild removes the very button that was clicked:
        // Chrome answers the focused element disappearing by scrolling its
        // container back to the top, and it does that AFTER this frame, so a
        // single restore loses to it. Measured: a canvas scrolled to 300 came
        // back at 25. The rAF runs after that reaction, and the second write
        // wins.
        if (scroller) {
          scroller.scrollTop = keepTop;
          requestAnimationFrame(function () {
            if (scroller) scroller.scrollTop = keepTop;
          });
        }
      }

      function getShapeCSS(s, clr) {
        if (s === 'circle') return 'border-radius:50%';
        if (s === 'triangle') return 'clip-path:polygon(50% 0%,0% 100%,100% 100%)';
        if (s === 'diamond') return 'clip-path:polygon(50% 0%,100% 50%,50% 100%,0% 50%)';
        if (s === 'star')
          return 'clip-path:polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)';
        return '';
      }
      function getDetail(c) {
        if (c.type === 'text') return c.content + ' · ' + (c.fontSize || 32) + 'px';
        if (c.type === 'shape')
          return (
            (c.shape === 'circle'
              ? 'Circle'
              : c.shape === 'square'
                ? 'Square'
                : c.shape === 'triangle'
                  ? 'Triangle'
                  : c.shape === 'diamond'
                    ? 'Diamond'
                    : c.shape === 'star'
                      ? 'Star'
                      : c.shape) +
            ' · ' +
            (c.size || 80) +
            'px'
          );
        if (c.type === 'fixation') {
          return (c.trial_duration || 500) + 'ms' +
            (c.durationMax > c.durationMin && c.durationMax > 0 ? ' ~ ' + c.durationMax + 'ms' : '');
        }
        if (c.type === 'animation') {
          var nfr = (c.frames || []).filter(function (f) { return f && f.fileData; }).length;
          return nfr + ' frame' + (nfr === 1 ? '' : 's') + ' @ ' + (c.frame_time || 250) + 'ms';
        }
        if (c.type === 'image') return c.fileName || 'Not uploaded';
        if (c.type === 'audio') return c.fileName || 'Not uploaded';
        if (c.type === 'video') return c.fileName || 'Not uploaded';
        if (c.type === 'keyboard') {
          var kk = Array.isArray(c.choices) ? c.choices : [];
          return kk.length ? 'Keys: ' + kk.join(',') : 'Keys: any key';
        }
        if (c.type === 'button') return (c.choices || []).join(', ');
        if (c.type === 'slider') return c.min + '-' + c.max + (c.labels && c.labels.length ? ' · ' + c.labels.join('/') : '');
        return '';
      }

      // Trial-level settings rendered as compact badges on the flow row.
      // In jsPsych these are node/trial parameters, not trials:
      //   loop → repetitions, randomize → sample/randomize_order,
      //   branch → conditional_function, delay → trial_duration, variable → user JS

      var _SET_INPUT_CSS = 'width:100%;padding:6px 9px;border-radius:6px;border:1px solid var(--border);' +
        'background:var(--surface);color:var(--text);font-family:inherit;font-size:0.75rem';

      function _settingRow(label, hint, inputHTML) {
        return '<div style="margin-bottom:12px">' +
          '<label style="display:block;font-size:0.7rem;color:var(--text2);margin-bottom:3px">' + label +
          (hint ? ' <span style="opacity:.7">· ' + hint + '</span>' : '') + '</label>' +
          inputHTML + '</div>';
      }

      // Every row jsPsych writes carries these four, whatever the plugin. Read
      // off a real run of each plugin rather than off the source: the overview
      // page lists three of them and omits plugin_version.
      var _UNIVERSAL_DATA = 'Every trial records trial_type, trial_index, time_elapsed ' +
        'and plugin_version whatever the plugin — jsPsych writes those, not ExpVis.';

      function _renderTrialSettings(insp) {
        var t = findTrial(editor.selectedTrial);
        if (!t) { insp.innerHTML = ''; return; }
        var h = '';
        h += '<div style="padding-bottom:10px;border-bottom:1px solid var(--border);margin-bottom:14px">';
        h += '<div style="font-weight:700;font-size:0.85rem">Trial Settings</div>';
        h += '<div style="font-size:0.66rem;color:var(--text2);margin-top:3px;line-height:1.5">' +
             'Parameters of this jsPsych trial. Leave a field empty to remove it.</div>';
        h += '<div style="font-size:0.66rem;color:var(--text2);line-height:1.5;margin-top:6px">' +
             _UNIVERSAL_DATA + '</div>';
        h += '</div>';
        // A real jsPsych parameter. A response component with its own
        // trial_duration takes precedence — they are the same parameter.
        h += _settingRow('Trial Duration', 'jsPsych trial_duration (ms)',
          '<input type="number" min="0" style="' + _SET_INPUT_CSS + '" value="' + (t.trial_duration || '') +
          '" placeholder="e.g. 1200" onchange="_setTrialField(\'' + t.id + '\',\'trial_duration\',this.value)">');

        // --- parameters written as JavaScript ---
        // The one place the researcher writes code. Everything else here is a
        // field; this is for the parameters no field can express — a dynamic
        // stimulus, an on_load hook, a value that reads a timeline variable.
        var rows = Array.isArray(t.custom) ? t.custom : [];
        h += '<div style="padding-bottom:8px;border-bottom:1px solid var(--border);margin:14px 0 10px;' +
          'display:flex;align-items:center;justify-content:space-between">' +
          '<span style="font-size:0.66rem;text-transform:uppercase;letter-spacing:0.05em;' +
          'color:var(--text2);font-weight:700">Custom Parameters</span>' +
          '<button onclick="_addCustom(\'' + t.id + '\')" style="background:none;border:1px solid ' +
          'var(--border);color:var(--accent);cursor:pointer;font-size:0.66rem;padding:2px 8px;' +
          'border-radius:4px;font-family:inherit">+ Add</button></div>';
        if (!rows.length) {
          h += '<p style="font-size:0.66rem;color:var(--text2);line-height:1.5;margin:0 0 4px">' +
            'For parameters a field cannot express — a <code>stimulus</code> built at run time, ' +
            'an <code>on_load</code> hook, anything reading ' +
            '<code>jsPsych.timelineVariable()</code>. A parameter written here <b>replaces</b> ' +
            'the one the editor would generate.</p>';
        }
        rows.forEach(function (row, i) {
          h += '<div style="margin-bottom:10px;border:1px solid var(--border);border-radius:8px;padding:8px">';
          h += '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">' +
            '<input value="' + _escAttr(row.name || '') + '" placeholder="parameter name" ' +
            'onchange="_setCustom(\'' + t.id + '\',' + i + ',\'name\',this.value)" ' +
            'style="' + _SET_INPUT_CSS + ';flex:1;font-family:ui-monospace,Menlo,monospace">' +
            '<button onclick="_removeCustom(\'' + t.id + '\',' + i + ')" title="Remove" ' +
            'style="background:none;border:none;color:var(--red);cursor:pointer;font-size:0.7rem;' +
            'opacity:0.5;padding:0 4px">✕</button></div>';
          h += '<textarea spellcheck="false" placeholder="function () { … }" ' +
            'onchange="_setCustom(\'' + t.id + '\',' + i + ',\'src\',this.value)" ' +
            'style="width:100%;height:76px;padding:6px 8px;border:1px solid var(--border);' +
            'border-radius:6px;font-family:ui-monospace,Menlo,monospace;font-size:0.7rem;' +
            'line-height:1.5;box-sizing:border-box;resize:vertical;background:#fbfbfe">' +
            _escAttr(row.src || '') + '</textarea></div>';
        });
        insp.innerHTML = h;
      }

      // Custom parameters are stored as an ordered list because the name is
      // editable, and renaming a key would mean rebuilding an object.
      function _addCustom(tid) {
        var t = findTrial(tid);
        if (!t) return;
        saveState();
        if (!Array.isArray(t.custom)) t.custom = [];
        t.custom.push({name: '', src: ''});
        renderAll();
      }
      function _setCustom(tid, i, field, value) {
        var t = findTrial(tid);
        if (!t || !Array.isArray(t.custom) || !t.custom[i]) return;
        var row = t.custom[i];
        if (field === 'name') {
          // A parameter name has to be a JavaScript identifier, or the emitted
          // object has a key that is not one.
          var v = String(value).trim();
          if (v && !/^[A-Za-z_$][\w$]*$/.test(v)) {
            alert('A parameter name has to be a JavaScript identifier:\n\n' + value);
            renderAll();
            return;
          }
          row.name = v;
        } else {
          var src = String(value);
          if (src.trim()) {
            // Refuse code that will not parse rather than writing it into the
            // experiment: the error would otherwise surface in the participant's
            // browser at run time, as a blank screen. Same guard as sample.fn.
            var err2 = _jsExpressionError(src, row.name || 'this parameter');
            if (err2) {
              alert(err2);
              renderAll();
              return;
            }
          }
          row.src = src;
        }
        saveState();
        autoSave();
      }
      // The phase dialog is an overlay, so renderAll() does not repaint it.
      // These handlers need the dialog's own repaint, which it registers here.
      var _repaintPhaseSettings = null;
      // Both custom-parameter controls take an EXPRESSION, because the value is
      // emitted as `key: <text>`. The mistake people make is a statement — an
      // `if (…) { … }`, a bare `return` — and "Unexpected token 'if'" does not
      // say that, or what to write instead. Returns null when it parses.
      function _jsExpressionError(src, name) {
        try {
          new Function('return (' + src + ');');
          return null;
        } catch (e) {
          return 'That is not a JavaScript expression:\n\n' + e.message +
            '\n\nThe text becomes:\n' +
            '    ' + name + ': <your text>\n\n' +
            'so it has to be an expression — usually a function literal:\n\n' +
            '    function (data) { return data.values().length < 3; }\n\n' +
            'A statement such as `if (…) { … }` or a bare `return` is not an ' +
            'expression. Put it inside a function.';
        }
      }

      // A researcher who writes `data` by hand REPLACES the generated
      // `{correct_response: …}` — but the on_finish the editor generates still
      // reads `data.correct_response`. Left alone, the trial runs, scores every
      // response incorrect, and says nothing. So the scoring key goes back in.
      // A correct_response they wrote themselves wins; if what they wrote is not
      // a literal this can rewrite, the merge happens at run time instead.
      function _withCorrectResponse(src, expr) {
        var s = String(src).trim();
        if (/correct_response\s*:/.test(s)) return s;
        var add = 'correct_response: ' + expr;
        if (s.charAt(0) === '{' && s.charAt(s.length - 1) === '}') {
          var inner = s.slice(1, -1);
          return inner.trim() ? '{' + inner.replace(/\s+$/, '') + ', ' + add + '}'
                              : '{' + add + '}';
        }
        return 'Object.assign({' + add + '}, ' + s + ')';
      }

      // --- loop_function / conditional_function ---
      // The two node parameters that take a function, built from the phase's
      // settings rather than written by hand. They differ in a way the shared
      // controls have to hide: loop_function is handed the data of the CURRENT
      // round — jsPsych resets it on every iteration — and returns true to go
      // round again, while conditional_function takes no argument at all and
      // reads the whole experiment's data. So one "field is value" wording
      // becomes two accessors, and only the loop's answer is negated.
      //
      // These live out here rather than beside _phaseNodeParams (which calls
      // them) because the settings dialog validates with them before writing
      // anything, and that dialog is not inside the compiler.
      var _COND_OPS = {
        'is': '===', 'is not': '!==',
        'more than': '>', 'at most': '<=',
        'less than': '<', 'at least': '>='
      };
      // A condition value is written into a single-quoted string only for the
      // response comparison; everywhere else it is emitted as written, so
      // `rt is more than 2 * 500` works.
      function _condQuote(s) {
        return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
      }
      // `v` is the row the condition reads. That row is `.last(1)`, never the
      // docs' `values()[0]`: one round of an ExpVis node can hold several trials
      // (a fixation, then the screen), and the FIRST row is then the fixation —
      // no response, no score. `data.last(1)` on an empty collection is
      // undefined, so the row itself is checked before its fields are read.
      function _condExpr(v, spec) {
        var field = String((spec && spec.field) || 'correct');
        var op = (spec && spec.op) || 'is';
        var value = String(spec && spec.value == null ? '' : spec.value).trim();
        var expr;
        if (field === 'response' && (op === 'is' || op === 'is not')) {
          // The docs' own comparison, and the only one that works when the
          // plugin records an array (a button index, an animation sequence).
          expr = 'jsPsych.pluginAPI.compareKeys(' + v + '.response, ' +
            _condQuote(value) + ')';
          if (op === 'is not') expr = '!' + expr;
        } else {
          expr = v + '.' + field + ' ' + (_COND_OPS[op] || '===') + ' ' + value;
        }
        return '(' + v + ' && ' + expr + ')';
      }
      // jsPsych puts no limit on loop_function: a condition that never becomes
      // true repeats the node forever and hangs the session. The cap is
      // ExpVis's guard, and it is a setting the researcher can see and turn
      // off rather than one added behind their back — with no cap the output is
      // the plain function literal the docs use.
      function _loopFunctionSrc(ph) {
        var l = (ph && ph.loop) || {};
        var cap = Math.round(Number(l.cap) || 0);
        if (cap <= 0) {
          return 'function (data) {\n' +
            '    var last = data.last(1).values()[0];\n' +
            '    return !' + _condExpr('last', l) + ';\n' +
            '  }';
        }
        // `>=`, not `>`: jsPsych's `do { … } while (t(data))` calls this once
        // per round, so the call that returns false ends a round that already
        // ran. `> cap` would let one more through and make "at most 10" mean 11.
        //
        // The comment travels into the generated file on purpose: the counter is
        // not jsPsych's, and a reader who meets it there deserves to know where
        // it came from and why it is there.
        return '(function () {\n' +
          '    // Added by ExpVis, not jsPsych: a loop_function that never\n' +
          '    // becomes false would repeat this node forever.\n' +
          '    var rounds = 0;\n' +
          '    return function (data) {\n' +
          '      if (++rounds >= ' + cap + ') return false;\n' +
          '      var last = data.last(1).values()[0];\n' +
          '      return !' + _condExpr('last', l) + ';\n' +
          '    };\n' +
          '  })()';
      }
      // No cap here: jsPsych asks this one at most once per node run.
      function _conditionalFunctionSrc(ph) {
        var c = (ph && ph.cond) || {};
        return 'function () {\n' +
          '    var last = jsPsych.data.get().last(1).values()[0];\n' +
          '    return ' + _condExpr('last', c) + ';\n' +
          '  }';
      }

      function _addNodeCustom(pid) {
        var ph = editor.phases.filter(function (p) { return p.id === pid; })[0];
        if (!ph) return;
        saveState();
        if (!Array.isArray(ph.custom)) ph.custom = [];
        ph.custom.push({name: '', src: ''});
        autoSave();
        if (_repaintPhaseSettings) _repaintPhaseSettings();
      }
      function _setNodeCustom(pid, i, field, value) {
        var ph = editor.phases.filter(function (p) { return p.id === pid; })[0];
        if (!ph || !Array.isArray(ph.custom) || !ph.custom[i]) return;
        var row = ph.custom[i];
        if (field === 'name') {
          var v = String(value).trim();
          if (v && !/^[A-Za-z_$][\w$]*$/.test(v)) {
            alert('A parameter name has to be a JavaScript identifier:\n\n' + value);
            if (_repaintPhaseSettings) _repaintPhaseSettings();
            return;
          }
          row.name = v;
        } else {
          var src = String(value);
          if (src.trim()) {
            // Refuse code that will not parse rather than writing it into the
            // experiment: the error would surface in the participant's browser,
            // at run time, as a blank screen.
            var err = _jsExpressionError(src, row.name || 'this parameter');
            if (err) {
              alert(err);
              if (_repaintPhaseSettings) _repaintPhaseSettings();
              return;
            }
          }
          row.src = src;
        }
        saveState();
        autoSave();
      }
      function _removeNodeCustom(pid, i) {
        var ph = editor.phases.filter(function (p) { return p.id === pid; })[0];
        if (!ph || !Array.isArray(ph.custom)) return;
        saveState();
        ph.custom.splice(i, 1);
        if (!ph.custom.length) delete ph.custom;
        autoSave();
        if (_repaintPhaseSettings) _repaintPhaseSettings();
      }

      function _removeCustom(tid, i) {
        var t = findTrial(tid);
        if (!t || !Array.isArray(t.custom)) return;
        saveState();
        t.custom.splice(i, 1);
        if (!t.custom.length) delete t.custom;
        autoSave();
        renderAll();
      }

      // Create / update / remove the logic component backing a trial setting.
      // `choices` is a real array in the data model (that is what jsPsych's
      // html-button-response takes); the inspector edits it as comma-separated
      // text, so convert on the way in.
      function _setChoices(trialId, compId, value) {
        var t = findTrial(trialId);
        if (!t) return;
        var c = t.components.find(function (x) { return x.id === compId; });
        if (!c) return;
        var raw = String(value);
        if (c.type === 'keyboard') {
          // For a keyboard trial an EMPTY list is jsPsych's ALL_KEYS ("any key"),
          // and a blank entry inside a list is the spacebar.
          c.choices = raw === '' ? []
            : raw.split(',').map(function (s) { return s.trim() || ' '; });
        } else {
          c.choices = raw.split(',').map(function (s) { return s.trim(); })
            .filter(function (s) { return s; });
        }
        saveState();
        renderAll();
      }

      // Trial-level parameters (as opposed to component-level ones). These live
      // on the trial object itself — they are node parameters in jsPsych, and
      // faking them with a hidden component is what the old `delay` did.
      function _setTrialField(trialId, field, value) {
        var t = findTrial(trialId);
        if (!t) return;
        if (value === '' || value == null) {
          delete t[field];
        } else {
          t[field] = Number(value);
        }
        editor.selComp = null; // stay in trial-settings mode
        saveState();
        renderAll();
      }


      function renderInspector() {
        var insp = document.getElementById('inspector');
        if (!editor.selectedTrial) {
          insp.innerHTML =
            '<p style="color:var(--text2);font-size:0.78rem;text-align:center;padding:20px">← Click a node in the flow<br>to view and edit properties</p>';
          return;
        }
        if (!editor.selComp) {
          _renderTrialSettings(insp);
          return;
        }
        var t = findTrial(editor.selectedTrial);
        if (!t) return;
        // Where each uploaded file will be referenced from, straight from the
        // compiler that will write it.
        var paths = assetPathsByData();
        var h = '';
        var sc = t.components.find(function (c) {
          return c.id === editor.selComp;
        });
        if (sc) {
          var c = sc;
          var compDesc = {
            text: 'Click a text node in the flow, then edit content, font size, color, weight, and position in this panel. Multi-line text supported — line breaks become &lt;br&gt;.',
            shape: 'Select shape type (circle/square/triangle/diamond/star), size, and color. Use with 🎲 randomize pick-one mode to show one random shape per trial.',
            image: 'Upload a local image (≤4MB). The code refers to it by path — img/blue.png — and publishing bundles the file alongside the experiment. When this is the only thing on screen the trial runs on the official jsPsych image plugin for its response type (as the jsPsych RT-task demo does); mixed with other components it becomes an <img> tag instead.',
            stimulus_width: 'Image width in px. When the trial shows this image alone it becomes the image plugin\'s stimulus_width.',
            stimulus_height: 'Image height in px. 0 = work it out from the width.',
            maintain_aspect_ratio: 'true = scale by width without distorting. Only used by the image plugins.',
            render_on_canvas: 'true = draw the image to a canvas. Only used by the image plugins.',
            animation: 'Runs on the jsPsych animation plugin — a flipbook of frames played at a fixed rate. The trial ends on its own after sequence_reps, and every key pressed during playback is recorded. It takes over the whole screen, so it cannot share a trial with other components. Data records response as an ARRAY of {stimulus, rt, key_press} — one entry per frame, so there is no single rt — plus animation_sequence and plugin_version, and NOT stimulus: the plugin records the frames it played instead.',
            audio: 'Upload MP3/WAV audio (≤16MB). Playable in fullscreen preview. Ideal for auditory stimulus experiments.',
            video: 'Upload MP4/WebM video (≤64MB). Playable in fullscreen preview.',
            fixation: 'Cross fixation point. duration(ms) controls display time. In fullscreen preview, the fixation appears first then auto-disappears after duration.',
            keyboard: 'Runs on the jsPsych html-keyboard-response plugin. choices is the list of allowed keys — leave it empty for any key. correctKey scores the trial. Data records response as the key character, plus rt, stimulus (the whole rendered screen, as HTML), rt_key_duration and plugin_version.',
            button: 'Runs on the jsPsych html-button-response plugin — every field here maps to a parameter of the same name in the official docs. choices is the list of button labels. Data records response as the button\'s 0-based INDEX (0 = first choice), not its label, plus rt, stimulus and plugin_version.',
            slider: 'Runs on the jsPsych html-slider-response plugin — every field here maps to a parameter of the same name in the official docs. Data records response as a number, plus rt, slider_start (where the handle began), stimulus and plugin_version.',
            textInput: 'Runs on the jsPsych survey-text plugin — a free-text question with its own submit button. There is no right answer and no trial_duration; the trial ends when the participant submits. Data records response as an object keyed by Data Name, e.g. {Q0: "..."}, plus rt and plugin_version — but NOT stimulus: survey-text is the one plugin that does not record what was on screen, so the preamble is not in the data.',
          };
          // The panel has two levels — a trial's settings, and a component's
          // properties — and only one of them was reachable from inside the
          // other. A back link is how the second level announces the first.
          h += '<button onclick="selectTrial(\'' + t.id + '\')" style="background:none;' +
            'border:none;color:var(--accent);cursor:pointer;font-family:inherit;font-size:0.68rem;' +
            'padding:0 0 8px;text-align:left">\u2039 Trial Settings</button>';
          h +=
            '<div class="prop-section"><div class="prop-section-title">' +
            (icons[c.type] || '?') +
            ' ' +
            labels[c.type] +
            (compDesc[c.type]
              ? ' <span onclick="var p=this.nextElementSibling;p.style.display=p.style.display===\'block\'?\'none\':\'block\'" style="cursor:pointer;font-size:0.65rem;opacity:0.35;border:1px solid var(--border);border-radius:50%;width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;line-height:1;transition:opacity 0.15s" onmouseover="this.style.opacity=\'0.7\'" onmouseout="this.style.opacity=\'0.35\'">?</span>' +
                '<span style="display:none;font-weight:400;font-size:0.65rem;color:var(--text2);line-height:1.6;padding:6px 10px;margin-top:4px;background:var(--bg);border-radius:6px;border:1px solid var(--border);max-width:360px">' +
                compDesc[c.type] +
                '</span>'
              : '') +
            '</div>';
          var hints = {
            choices: 'Comma-separated keys, e.g. a,l. Leave EMPTY for any key (jsPsych ALL_KEYS).',
            wait_for_key_release: 'Measure rt to the key RELEASE instead of the press (also records rt_key_duration).',
            correctKey: 'Participant must press this key for a correct response. Supports comma-separated values (e.g. a,l). Leave empty if using 🎲 randomize pick-one.',
            trial_duration: 'Trial Duration (ms). 0=no limit. If >0, auto-judges as timeout and records RT when exceeded.',
            choices: 'Comma-separated button labels, e.g. Yes,No. Exported as the jsPsych `choices` array.',
            frames: 'Upload the frames in playback order. They are played as a flipbook, one image at a time.',
            frame_time: 'How long each frame is shown, in ms. jsPsych default is 250.',
            frame_isi: 'Blank gap between frames, in ms. 0 = frames run back to back.',
            sequence_reps: 'How many times the whole sequence plays. The trial ends by itself after the last rep.',
            render_on_canvas: 'true = draw to a canvas (avoids a white flash between frames in some browsers). false = swap <img> elements.',
            prompt: 'HTML shown below the buttons — a reminder of the required action.',
            button_layout: 'grid=display:grid (wraps, honours rows/columns) | flex=display:flex (single row)',
            grid_rows: 'Rows in the button grid. jsPsych default is 1.',
            grid_columns: 'Columns in the button grid. 0 = let jsPsych work it out from the row count.',
            stimulus_duration: 'Hide the stimulus after this many ms; the buttons stay and the trial continues. 0 = keep it visible.',
            response_ends_trial: 'false = the trial runs for the full trial_duration even if the participant responds early (fixed viewing time).',
            enable_button_after: 'Delay before the buttons become clickable (ms). Guards against accidental early clicks.',
            name: 'Key this answer is stored under in the data, e.g. Q0. Defaults to Q0.',
            durationMin: 'Set this and Jitter Max (Max > Min) to randomise the duration trial by trial. 0 = no jitter.',
            durationMax: 'Upper end of the jitter range. Must be greater than Jitter Min for the jitter to apply.',
            durationStep: 'Spacing of the values between Min and Max, e.g. 250 gives 500/750/1000. Only used when jitter is on.',
            required: 'true = the browser refuses to submit an empty box.',
            rows: '1 = a single-line box. 2 or more = a multi-line textarea.',
            columns: 'Width of the box in characters. jsPsych default is 40.',
            button_label: 'Text on the button that submits the answer.',
            autocomplete: 'true = let the browser offer autofill for these boxes.',
            labels: 'Comma-separated labels placed at equal spacing, e.g. Strongly Disagree, Strongly Agree. Use 0 or 2+ — a single label breaks the plugin\'s layout maths.',
            slider_start: 'Value the slider starts at. jsPsych default is 50.',
            button_label: 'Text on the button that submits the response.',
            slider_width: 'Slider width in px. 0 = match the widest element on screen.',
            require_movement: 'true = the slider must be moved before the button can be clicked.',
          };
          // For branch targetFail: build dropdown from same-phase trial IDs
          var currentPhase = editor.phases.find(function (p) {
            return p.timeline.some(function (tr) {
              return tr.id === t.id;
            });
          });
          Object.keys(c).forEach(function (k) {
            if (k === 'id' || k === 'cat' || k === 'type' || k === 'fileData' ||
                k === 'fileName' || k === 'frames') return; // frames have their own uploader below
            if (k === 'correctKey' || k === '颜色按键映射' || k === '按键映射' || k === 'correctKeyHint') return;
            var v = c[k];
            var displayLabel = propLabel[k] || k;
            // textInput reuses `name` (variable name) and `prompt` (key prompt) for
            // different things, so its labels are resolved here instead.
            if (k === 'name' && c.type === 'textInput') displayLabel = '📝 Data Name';
            if (k === 'prompt' && c.type === 'textInput') displayLabel = '📝 Question';
            h += '<div class="prop-row"><label>' + displayLabel + '</label>';
            if (k === 'position') h += sel(k, ['center', 'left', 'right'], v, t.id, c.id);
            else if (k === 'fontWeight')
              h += sel(
                k,
                ['normal', 'bold', 'lighter', 'bolder', '100', '200', '300', '400', '500', '600', '700', '800', '900'],
                v,
                t.id,
                c.id,
              );
            else if (k === 'shape') h += sel(k, ['circle', 'square', 'triangle', 'diamond', 'star'], v, t.id, c.id);
            else if (k === 'mode')
              h +=
                '<select onchange="updateComponent(\'' +
                t.id +
                "','" +
                c.id +
                '\',\'mode\',this.value)"><option value="pick-one"' +
                (v === 'pick-one' || !v ? ' selected' : '') +
                '>pick-one — 1 random variant</option><option value="shuffle"' +
                (v === 'shuffle' ? ' selected' : '') +
                '>shuffle — all, random order</option></select>';
            else if (k === 'response_ends_trial' || k === 'require_movement' ||
                     k === 'wait_for_key_release' || k === 'maintain_aspect_ratio' ||
                     k === 'render_on_canvas') {
              // Every boolean plugin parameter gets the same true/false control;
              // only the wording of the options differs.
              var _boolLabels = {
                response_ends_trial: ['true — response ends the trial', 'false — hold for trial_duration'],
                require_movement: ['true — must move the slider first', 'false — may submit as-is'],
                wait_for_key_release: ['true — time to the key release', 'false — time to the key press'],
                maintain_aspect_ratio: ['true — keep the aspect ratio', 'false — stretch to fit'],
                render_on_canvas: ['true — draw to a canvas', 'false — use an <img> element'],
              }[k];
              var _isOn = !(v === false || v === 'false');
              h += '<select onchange="updateComponent(\'' + t.id + '\',\'' + c.id + '\',\'' + k + '\',this.value)">' +
                '<option value="true"' + (_isOn ? ' selected' : '') + '>' + _boolLabels[0] + '</option>' +
                '<option value="false"' + (_isOn ? '' : ' selected') + '>' + _boolLabels[1] + '</option></select>';
            }
            else if (k === 'choices')
              h += '<input value="' + (Array.isArray(v) ? v.join(', ') : (v || '')).replace(/"/g, '&quot;') +
                '" onchange="_setChoices(\'' + t.id + '\',\'' + c.id + '\',this.value)"' +
                ' placeholder="' + (c.type === 'keyboard' ? 'a, l — leave empty for any key' : 'Yes, No') + '">';
            else if (k === 'button_layout')
              h += sel(k, ['grid', 'flex'], v || 'grid', t.id, c.id);
            else if (k === 'matchValue') {
              if (c.condition === 'variable') { h += '<input value="' + (v || '') + '" onchange="updateComponent(\'' + t.id + '\',\'' + c.id + '\',\'matchValue\',this.value)" placeholder="Variable name (e.g. score)">'; }
              else { h += '<input value="' + (v || '') + '" onchange="updateComponent(\'' + t.id + '\',\'' + c.id + '\',\'matchValue\',this.value)" placeholder="Match value, comma-separated">'; }
            }
            else if (k === 'targetFail') {
              var failHint = '';
              if (c.condition === 'correct') failHint = 'Jump to target trial on error. Leave empty to retry.';
              else if (c.condition === 'response') failHint = 'Jump to target trial on response mismatch. Leave empty to retry.';
              else failHint = 'Jump to target trial when variable condition fails. Leave empty to retry.';
              if (c.condition === 'variable') {
                h += '<select onchange="updateComponent(\'' + t.id + '\',\'' + c.id + '\',\'targetFail\',this.value)">';
                h += '<option value=""' + (v ? '' : ' selected') + '>Retry current trial</option>';
                editor.phases.forEach(function (ph2, pi2) { ph2.timeline.forEach(function (tr, ti2) { if (tr.id !== t.id) h += '<option value="' + tr.id + '"' + (v === tr.id ? ' selected' : '') + '>' + _phaseLabel(ph2) + ' · Trial ' + (ti2 + 1) + '</option>'; }); });
                h += '</select>';
              }
              else {
                h += '<select onchange="updateComponent(\'' + t.id + '\',\'' + c.id + '\',\'targetFail\',this.value)">';
                h += '<option value=""' + (v ? '' : ' selected') + '>Retry current trial</option>';
                editor.phases.forEach(function (ph2, pi2) { ph2.timeline.forEach(function (tr, ti2) { if (tr.id !== t.id) h += '<option value="' + tr.id + '"' + (v === tr.id ? ' selected' : '') + '>' + _phaseLabel(ph2) + ' · Trial ' + (ti2 + 1) + '</option>'; }); });
                h += '</select>';
              }
              h += '<div style="font-size:0.6rem;color:var(--text2);flex-basis:100%;margin-top:2px">' + failHint + '</div>';
            }
            else if (k === 'behavior') h += sel(k, ['grow', 'pulse'], v, t.id, c.id);
            else if (typeof v === 'number')
              h +=
                '<input type="number" value="' +
                v +
                '" onchange="updateComponent(\'' +
                t.id +
                "','" +
                c.id +
                "','" +
                k +
                '\',this.value)">';
            else if (k === 'color')
              h +=
                '<input type="color" value="' +
                v +
                '" onchange="updateComponent(\'' +
                t.id +
                "','" +
                c.id +
                "','" +
                k +
                '\',this.value)" style="width:50px">';
            else if (k === 'content')
              h +=
                '<textarea onchange="updateComponent(\'' +
                t.id +
                "','" +
                c.id +
                "','" +
                k +
                '\',this.value)" style="min-height:60px">' +
                v +
                '</textarea>';
            else
              h +=
                '<input value="' +
                v +
                '" onchange="updateComponent(\'' +
                t.id +
                "','" +
                c.id +
                "','" +
                k +
                '\',this.value)">';
            var hintText = hints[k];
            if (k === 'prompt' && c.type === 'textInput') {
              hintText = 'The question text. It is always rendered, so leaving it empty shows a blank line.';
            }
            if (k === 'name' && c.type === 'textInput') {
              hintText = 'Key this answer is stored under in the data, e.g. Q0.';
            }
            if (k === 'trial_duration' && c.type === 'fixation') {
              hintText = 'How long the cross stays on screen, in ms. Becomes a jsPsych dynamic parameter when jitter is on.';
            }
            if (hintText)
              h +=
                '<div style="font-size:0.6rem;color:var(--text2);flex-basis:100%;margin-top:-2px">' +
                hintText +
                '</div>';
            h += '</div>';
          });
          if (c.type === 'image') {
            h +=
              '<div class="prop-row"><label>Upload Image</label><label id="img-upload-label" style="padding:6px 12px;background:var(--accent);color:#ffffff;border-radius:6px;cursor:pointer;font-size:0.75rem;display:inline-block">📁 选择文件</label><input type="file" id="img-file-input" accept="image/*" data-tid="' +
              t.id +
              '" data-cid="' +
              c.id +
              '" style="display:none"><span id="img-file-name" style="font-size:0.7rem;color:var(--text2);margin-left:8px">' +
              (c.fileName || 'No file selected') +
              '</span></div>' + _assetPathRow([c.fileData ? paths[c.fileData] : null]) +
              '<p style="font-size:0.6rem;color:var(--text2);margin:0 0 4px">JPG/PNG/GIF/WebP/SVG/BMP, max 4MB</p>';
          }
          if (c.type === 'audio') {
            h +=
              '<div class="prop-row"><label>Upload Audio</label><label id="aud-upload-label" style="padding:6px 12px;background:var(--orange);color:#ffffff;border-radius:6px;cursor:pointer;font-size:0.75rem;display:inline-block">🎵 Select File</label><input type="file" id="aud-file-input" accept="audio/*" data-tid="' +
              t.id +
              '" data-cid="' +
              c.id +
              '" style="display:none"><span id="aud-file-name" style="font-size:0.7rem;color:var(--text2);margin-left:8px">' +
              (c.fileName || 'No file selected') +
              '</span></div>' + _assetPathRow([c.fileData ? paths[c.fileData] : null]) +
              '<p style="font-size:0.6rem;color:var(--text2);margin:0 0 4px">MP3/WAV/OGG/M4A/AAC, max 16MB</p>';
          }
          if (c.type === 'video') {
            h +=
              '<div class="prop-row"><label>Upload Video</label><label id="vid-upload-label" style="padding:6px 12px;background:var(--green);color:#ffffff;border-radius:6px;cursor:pointer;font-size:0.75rem;display:inline-block">🎬 Select File</label><input type="file" id="vid-file-input" accept="video/*" data-tid="' +
              t.id +
              '" data-cid="' +
              c.id +
              '" style="display:none"><span id="vid-file-name" style="font-size:0.7rem;color:var(--text2);margin-left:8px">' +
              (c.fileName || 'No file selected') +
              '</span></div>' + _assetPathRow([c.fileData ? paths[c.fileData] : null]) +
              '<p style="font-size:0.6rem;color:var(--text2);margin:0 0 4px">MP4/WebM/OGG/MOV, max 64MB</p>';
          }
          if (c.type === 'animation') {
            var frList = (Array.isArray(c.frames) ? c.frames : []).filter(function (f) { return f && f.fileData; });
            h +=
              '<div class="prop-row"><label>Frames</label><label id="anim-upload-label" style="padding:6px 12px;background:#f97316;color:#ffffff;border-radius:6px;cursor:pointer;font-size:0.75rem;display:inline-block">🎞️ Add frames</label><input type="file" id="anim-file-input" accept="image/*" multiple data-tid="' +
              t.id + '" data-cid="' + c.id +
              '" style="display:none"><span id="anim-file-name" style="font-size:0.7rem;color:var(--text2);margin-left:8px">' +
              frList.length + ' frame' + (frList.length === 1 ? '' : 's') +
              '</span></div><p style="font-size:0.6rem;color:var(--text2);margin:0 0 6px">Played in order, one image at a time. JPG/PNG/WebP, max 4MB each. Select several at once to append.</p>';
            if (frList.length) {
              h += _assetPathRow(frList.map(function (f) { return paths[f.fileData]; }));
              h += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px">';
              frList.forEach(function (f, fi) {
                h += '<div style="position:relative;width:48px;height:48px">' +
                  '<img src="' + f.fileData + '" title="' + (f.fileName || '') +
                  '" style="width:48px;height:48px;object-fit:cover;border-radius:5px;border:1px solid var(--border)">' +
                  '<span style="position:absolute;left:2px;top:1px;font-size:0.55rem;background:rgba(0,0,0,0.6);color:#fff;border-radius:3px;padding:0 3px">' +
                  (fi + 1) + '</span>' +
                  '<span onclick="_removeFrame(\'' + t.id + '\',\'' + c.id + '\',' + fi +
                  ')" title="Remove frame" style="position:absolute;right:-5px;top:-5px;width:15px;height:15px;line-height:14px;text-align:center;border-radius:50%;background:var(--red);color:#fff;font-size:0.62rem;cursor:pointer">×</span>' +
                  '</div>';
              });
              h += '</div>';
            }
          }
          h +=
            '<button onclick="removeComponent(\'' +
            t.id +
            "','" +
            c.id +
            '\')" style="border:1px solid var(--border);background:transparent;color:var(--red);border-radius:4px;cursor:pointer;font-size:0.65rem;padding:2px 8px">Remove</button></div>';
        }
        h +=
          '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px"><button class="btn btn-outline" style="font-size:0.65rem;padding:4px 8px" onclick="addComponent(\'' +
          t.id +
          '\',\'text\',\'s\')">📝 Text</button><button class="btn btn-outline" style="font-size:0.65rem;padding:4px 8px" onclick="addComponent(\'' +
          t.id +
          "','keyboard','r')\">⌨️ Keyboard</button></div>";
        insp.innerHTML = h;
        setTimeout(function () {
          function bindUpload(fiId, lbId, accepts, maxMB) {
            var fi = document.getElementById(fiId);
            if (!fi) return;
            fi.onchange = function () {
              var file = fi.files[0];
              if (!file) return;
              var ext = '.' + file.name.split('.').pop().toLowerCase();
              if (accepts.indexOf(file.type) === -1 && accepts.indexOf(ext) === -1) {
                alert('Unsupported file format');
                return;
              }
              if (file.size > maxMB * 1024 * 1024) {
                alert('File size cannot exceed ' + maxMB + 'MB');
                return;
              }
              var reader = new FileReader();
              reader.onload = function (e) {
                var tid = fi.getAttribute('data-tid'),
                  cid = fi.getAttribute('data-cid');
                var t1 = findTrial(tid);
                if (!t1) return;
                var c1 = t1.components.find(function (x) {
                  return x.id === cid;
                });
                if (!c1) return;
                saveState();
                c1.fileData = e.target.result;
                c1.fileName = file.name;
                renderAll();
              };
              reader.readAsDataURL(file);
            };
            var lb = document.getElementById(lbId);
            if (lb)
              lb.onclick = function () {
                fi.click();
              };
          }
          bindUpload(
            'img-file-input',
            'img-upload-label',
            [
              'image/jpeg',
              'image/png',
              'image/gif',
              'image/webp',
              'image/bmp',
              'image/svg+xml',
              '.jpg',
              '.jpeg',
              '.png',
              '.gif',
              '.webp',
              '.bmp',
              '.svg',
            ],
            4,
          );
          bindUpload(
            'aud-file-input',
            'aud-upload-label',
            ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/aac', '.mp3', '.wav', '.ogg', '.m4a', '.aac'],
            16,
          );
          bindUpload(
            'vid-file-input',
            'vid-upload-label',
            ['video/mp4', 'video/webm', 'video/ogg', '.mp4', '.webm', '.ogg', '.mov'],
            64,
          );
          // Animation frames are uploaded many at a time and are appended, so
          // they get their own handler rather than the single-file bindUpload.
          var afi = document.getElementById('anim-file-input');
          if (afi) {
            afi.onchange = function () {
              var files = Array.prototype.slice.call(afi.files || []);
              if (!files.length) return;
              var t1 = findTrial(afi.getAttribute('data-tid'));
              if (!t1) return;
              var c1 = t1.components.find(function (x) { return x.id === afi.getAttribute('data-cid'); });
              if (!c1) return;
              var imgOk = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
                '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
              var pending = files.length, accepted = [];
              files.forEach(function (file) {
                var ext = '.' + file.name.split('.').pop().toLowerCase();
                if (imgOk.indexOf(file.type) === -1 && imgOk.indexOf(ext) === -1) {
                  alert('Unsupported file format: ' + file.name);
                  if (--pending === 0) finishFrames();
                  return;
                }
                if (file.size > 4 * 1024 * 1024) {
                  alert('File size cannot exceed 4MB: ' + file.name);
                  if (--pending === 0) finishFrames();
                  return;
                }
                var reader = new FileReader();
                reader.onload = function (e) {
                  accepted.push({fileData: e.target.result, fileName: file.name});
                  if (--pending === 0) finishFrames();
                };
                reader.readAsDataURL(file);
              });
              function finishFrames() {
                if (!accepted.length) return;
                saveState();
                if (!Array.isArray(c1.frames)) c1.frames = [];
                // Reading is async, so restore the order the user picked.
                accepted.sort(function (a, b) {
                  return files.map(function (f) { return f.name; }).indexOf(a.fileName) -
                         files.map(function (f) { return f.name; }).indexOf(b.fileName);
                });
                c1.frames = c1.frames.concat(accepted);
                renderAll();
              }
            };
            var alf = document.getElementById('anim-upload-label');
            if (alf) alf.onclick = function () { afi.click(); };
          }
        }, 0);
      }
      function _removeFrame(trialId, compId, idx) {
        var t = findTrial(trialId);
        if (!t) return;
        var c = t.components.find(function (x) { return x.id === compId; });
        if (!c || !Array.isArray(c.frames)) return;
        saveState();
        c.frames.splice(idx, 1);
        renderAll();
      }

      function sel(field, opts, v, tid, cid) {
        var s = '<select onchange="updateComponent(\'' + tid + "','" + cid + "','" + field + '\',this.value)">';
        opts.forEach(function (o) {
          s += '<option' + (v === o ? ' selected' : '') + '>' + o + '</option>';
        });
        s += '</select>';
        return s;
      }



      // The animation preview shows the first frame plus what the sequence will
      // do — the plugin plays one frame at a time over the whole display, so
      // there is no static "rendered" state to show.
      function _previewAnimation(c) {
        var frames = (Array.isArray(c.frames) ? c.frames : [])
          .filter(function (f) { return f && f.fileData; });
        var ft = Number(c.frame_time) || 250;
        var reps = Number(c.sequence_reps) || 1;
        var isi = Number(c.frame_isi) || 0;
        var html = '<div data-cid="' + c.id + '" style="display:flex;flex-direction:column;' +
          'align-items:center;gap:6px">';
        html += frames.length
          ? '<img src="' + frames[0].fileData + '" style="max-width:240px;max-height:180px;border-radius:8px">'
          : '<div style="width:200px;height:140px;border:2px dashed var(--border);border-radius:8px;' +
            'display:flex;align-items:center;justify-content:center;color:#aaa;font-size:0.75rem">' +
            'No frames uploaded</div>';
        html += '<span style="font-size:0.68rem;color:#f97316;font-weight:700">🎞 ' +
          frames.length + ' frame' + (frames.length === 1 ? '' : 's') + ' · ' + ft + 'ms' +
          (isi ? ' + ' + isi + 'ms ISI' : '') + ' × ' + reps + '</span>';
        if (c.prompt) html += '<span style="font-size:0.72rem;color:#888">' + c.prompt + '</span>';
        html += '</div>';
        return html;
      }

      // Mirrors the DOM jsPsychSurveyText builds for a single question: a <p> with
      // the question text, the input box, and the plugin's own submit button.
      function _previewSurveyText(c) {
        var rows = Number(c.rows) || 1;
        var cols = Number(c.columns) || 40;
        var req = (c.required === true || c.required === 'true');
        var field = rows > 1
          ? '<textarea class="jspsych-survey-text" cols="' + cols + '" rows="' + rows + '"' +
            (req ? ' required' : '') + ' placeholder="' + _escAttr(c.placeholder) + '"></textarea>'
          : '<input type="text" class="jspsych-survey-text" size="' + cols + '"' +
            (req ? ' required' : '') + ' placeholder="' + _escAttr(c.placeholder) + '">';
        return '<div data-cid="' + c.id + '" class="jspsych-survey-text-question" style="margin:2em 0">' +
          '<p class="jspsych-survey-text">' + (c.prompt || '') + '</p>' + field + '</div>' +
          '<input type="submit" class="jspsych-btn jspsych-survey-text" value="' +
          _escAttr(c.button_label || 'Continue') + '">';
      }

      // Attribute-safe escaping for values that go inside a quoted HTML attribute.
      function _escAttr(v) {
        return String(v == null ? '' : v)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      // Unified trial content renderer — used by all previews
      // ---- Rendering a trial with its real plugin -------------------------
      // The previews used to hand-build each plugin's DOM — class names copied
      // from the plugin source. That is a second implementation of the very
      // thing this project generates, and it drifted more than once: the
      // slider's labels were drawn in the preview and never emitted, the image
      // width was hardcoded at 260px. They now run the plugin itself.
      var _loadedScripts = {};

      function _loadScript(src) {
        if (_loadedScripts[src]) return Promise.resolve(_loadedScripts[src] === true);
        return new Promise(function (resolve) {
          var el = document.createElement('script');
          el.src = src;
          el.onload = function () { _loadedScripts[src] = true; resolve(true); };
          // A plugin that will not load must not hang the preview; the caller
          // says so instead.
          el.onerror = function () { _loadedScripts[src] = 'failed'; resolve(false); };
          document.head.appendChild(el);
        });
      }

      // jsPsych and only the plugins this experiment uses — the same list the
      // generated file loads, from the same table, so the preview cannot need a
      // plugin the export does not have.
      function _ensureJsPsych(usedPlugins) {
        var plugins = Object.keys(_jspsychPluginCDN)
          .filter(function (n) { return usedPlugins && usedPlugins[n]; })
          .map(function (n) {
            var p = _jspsychPluginCDN[n];
            return 'https://unpkg.com/' + p.pkg + '@' + p.ver;
          });
        // Order matters, and for the same reason the generated file pins it: a
        // plugin reads the global `jsPsychModule` while it is being parsed, so
        // the core has to have run first. Loaded together they race, the plugin
        // evaluates to undefined, and every trial object ends up with no plugin.
        return _loadScript('https://unpkg.com/jspsych@' + _JSPsychVersion).then(function (ok) {
          if (!ok) return false;
          return Promise.all(plugins.map(_loadScript)).then(function (rs) {
            return rs.every(Boolean);
          });
        });
      }

      // The trial object the export contains for this trial, taken from the
      // compiler. The plugin globals are real — the object has to be one a
      // plugin can run — while initJsPsych and jsPsych are stubs, so evaluating
      // the experiment captures its timeline instead of running it.
      function _trialObjectFor(t) {
        var code = _compileExperiment({only: t.id, inlineAssets: true}).code;
        var captured = null;
        var stub = {
          run: function (tl) { captured = tl; },
          data: {displayData: function () {}},
          randomization: {sampleWithoutReplacement: function (a, n) { return a.slice(0, n); }},
          pluginAPI: {compareKeys: function () { return false; }},
          timelineVariable: function () { return ''; }
        };
        var names = Object.keys(_jspsychPluginCDN);
        var args = ['jsPsych', 'initJsPsych'].concat(names);
        var vals = [stub, function () { return stub; }]
          .concat(names.map(function (n) { return window[n]; }));
        new Function(args.join(','), code).apply(null, vals);
        if (!captured) return null;
        // A node's last entry is the screen a response rides on; a bare trial is
        // itself.
        for (var i = captured.length - 1; i >= 0; i--) {
          var entry = captured[i];
          if (!entry || typeof entry !== 'object') continue;
          var inner = Array.isArray(entry.timeline) ? entry.timeline : [entry];
          for (var j = inner.length - 1; j >= 0; j--) {
            var cand = inner[j];
            if (!cand || typeof cand !== 'object') continue;
            if (Array.isArray(cand.timeline)) continue;
            return cand;
          }
        }
        return null;
      }

      // Render that trial with its plugin into a hidden container and hand back
      // the DOM it produced. `cb(html, err)`.
      var _liveInstance = null;
      function _renderTrialWithPlugin(t, cb) {
        var used;
        try { used = _compileExperiment({only: t.id, inlineAssets: true}).usedPlugins; }
        catch (e) { cb(null, e); return; }
        _ensureJsPsych(used).then(function (ok) {
          if (!ok) { cb(null, new Error('jsPsych or one of its plugins did not load')); return; }
          var obj;
          try { obj = _trialObjectFor(t); }
          catch (e) { cb(null, e); return; }
          if (!obj) { cb(null, new Error('this trial produced no jsPsych trial')); return; }
          var dev = editor.device || {w: 1280, h: 720};
          var host = document.createElement('div');
          host.style.cssText = 'position:fixed;left:-99999px;top:0;width:' + dev.w + 'px';
          document.body.appendChild(host);
          var done = false;
          var priorOnLoad = obj.on_load;
          obj.on_load = function () {
            if (typeof priorOnLoad === 'function') { try { priorOnLoad(); } catch (e) {} }
            if (done) return;
            done = true;
            // The plugin has written its DOM by the time on_load runs. Stopping
            // the instance afterwards means a click in the preview cannot end a
            // trial nobody is taking.
            setTimeout(function () {
              var html = host.innerHTML;
              try { if (_liveInstance) _liveInstance.abortExperiment(); } catch (e) {}
              _liveInstance = null;
              if (host.parentNode) host.remove();
              cb(html, null);
            }, 0);
          };
          try {
            _liveInstance = initJsPsych({display_element: host});
            _liveInstance.run([obj]);
          } catch (e) {
            if (host.parentNode) host.remove();
            cb(null, e);
          }
        });
      }

      // A placeholder the real plugin's DOM is written into once it arrives.
      // The previews are synchronous today; making them wait would mean either a
      // blank panel or a spinner on every repaint, so the frame is drawn first
      // and the stage is filled a tick later.
      var _stageSeq = 0;
      function _livePreviewStage(t) {
        var id = 'live-stage-' + (++_stageSeq);
        setTimeout(function () {
          var el = document.getElementById(id);
          if (el) _fillPreviewStage(el, t);
        }, 0);
        return '<div id="' + id + '" style="display:flex;flex-direction:column;' +
          'justify-content:center;align-items:center;gap:0.9em;width:100%"></div>';
      }
      function _fillPreviewStage(el, t) {
        el.innerHTML = '<span style="color:var(--text2);font-size:0.7rem">loading plugin…</span>';
        _renderTrialWithPlugin(t, function (html, err) {
          if (!el.parentNode) return;                 // the panel was repainted
          if (err) {
            el.innerHTML = '<span style="color:var(--text2);font-size:0.7rem;' +
              'text-align:center;display:block;padding:12px">Could not render this trial ' +
              'with its plugin:<br>' + _escHtml(err.message) + '</span>';
            return;
          }
          el.innerHTML = html;
        });
      }
      function _escHtml(v) {
        return String(v == null ? '' : v)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }


      function renderPreview() {
        var pc = document.getElementById('preview-content');
        if (!editor.selectedTrial) {
          pc.innerHTML =
            '<span style="color:var(--text2);font-size:0.78rem;text-align:center;display:block;padding:20px">Click a node to preview</span>';
          return;
        }
        var t = findTrial(editor.selectedTrial);
        if (!t || t.components.length === 0) {
          pc.innerHTML =
            '<span style="color:var(--text2);font-size:0.78rem;text-align:center;display:block;padding:20px">Empty Trial</span>';
          return;
        }
        var ph = null;
        editor.phases.forEach(function (p) {
          p.timeline.forEach(function (tr) {
            if (tr.id === t.id) ph = p;
          });
        });
        var dev = editor.device || {w: 1280, h: 720};
        var devName = _deviceLabel(dev) || dev.w + '×' + dev.h;
        var isPhone = dev.w < 400;
        var isTablet = dev.w >= 400 && dev.w < 1000;
        var bezelK = isPhone ? 14 : isTablet ? 8 : 5;
        // Fit device (screen + bezel) within panel: panel=260px, subtract 24px breathing room
        var availW = 236;
        var panelBody = document.getElementById('preview-panel-body');
        var availH = Math.max(140, panelBody.clientHeight - 44);
        var scale = Math.max(
          0.2,
          Math.min(1, availW / (dev.w + 2 * bezelK), availH / (dev.h + 2 * bezelK + (isPhone ? 10 : 0))),
        );
        var frameW = Math.round(dev.w * scale),
          frameH = Math.round(dev.h * scale);
        var bezel = Math.round(bezelK * scale);
        var bezelColor = isPhone ? '#2a2a2e' : isTablet ? '#3a3a40' : '#404048';
        var bezelR = isPhone ? Math.round(22 * scale) : isTablet ? Math.round(14 * scale) : 6;
        var screenR = isPhone ? Math.round(10 * scale) : isTablet ? Math.round(6 * scale) : 3;
        var innerStyle =
          'width:' +
          dev.w +
          'px;height:' +
          dev.h +
          'px;overflow:hidden;transform:scale(' +
          scale +
          ');transform-origin:0 0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:' +
          Math.round(20 * scale) +
          'px;';
        var h = '';
        h +=
          '<div style="font-size:0.6rem;color:var(--text2);text-align:center;margin-bottom:6px;font-weight:600;letter-spacing:0.03em">' +
          devName +
          '</div>';
        if (ph)
          h +=
            '<div style="font-size:0.5rem;color:var(--text2);text-align:center;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em;opacity:0.7">' +
            _phaseLabel(ph) +
            '</div>';
        h +=
          '<div style="background:' +
          bezelColor +
          ';border-radius:' +
          bezelR +
          'px;padding:' +
          bezel +
          'px;box-shadow:0 6px 24px rgba(0,0,0,0.25);display:inline-block">';
        if (isPhone)
          h +=
            '<div style="display:flex;justify-content:center;margin-bottom:' +
            Math.round(bezel * 0.7) +
            'px"><div style="width:' +
            Math.round(36 * scale) +
            'px;height:' +
            Math.round(3 * scale) +
            'px;background:#555;border-radius:3px"></div></div>';
        h +=
          '<div style="width:' +
          frameW +
          'px;height:' +
          frameH +
          'px;overflow:hidden;background:#fff;border-radius:' +
          screenR +
          'px">';
        // The stage starts empty and is filled by the real plugin. It is the
        // plugin's own DOM, so the frame has to scroll rather than the preview
        // guessing a size.
        h += '<div style="' + innerStyle + 'display:flex;flex-direction:column;justify-content:center;align-items:center;gap:0.9em;padding:1.2em;box-sizing:border-box;overflow:auto">' +
             _livePreviewStage(t) + '</div>';
        h += '</div>';
        if (isPhone)
          h +=
            '<div style="display:flex;justify-content:center;margin-top:' +
            Math.round(bezel * 0.6) +
            'px"><div style="width:' +
            Math.round(34 * scale) +
            'px;height:3px;background:rgba(255,255,255,0.25);border-radius:3px"></div></div>';
        h += '</div>';
        pc.innerHTML = h;
      }

      function togglePreviewPanel() {
        var body = document.getElementById('preview-panel-body');
        var icon = document.getElementById('preview-toggle-icon');
        if (body.style.display === 'none') {
          body.style.display = 'flex';
          icon.textContent = '▼';
        } else {
          body.style.display = 'none';
          icon.textContent = '▶';
        }
      }

      // Full-window layout preview.
      // Layout comes from the flow itself, so there is nothing to drag here — this
      // is simply a large, undistracted view of the stimulus HTML the participant
      // will actually receive.
      function expandPreview() {
        var t = findTrial(editor.selectedTrial);
        if (!t) return;
        var dev = editor.device || {w: 1280, h: 720};
        var ph = null;
        editor.phases.forEach(function (p) {
          if (p.timeline.some(function (x) { return x.id === t.id; })) ph = p;
        });

        var overlay = document.createElement('div');
        overlay.style.cssText =
          'position:fixed;inset:0;z-index:2200;background:rgba(20,20,28,.55);' +
          'display:flex;align-items:center;justify-content:center;padding:3vh 3vw;box-sizing:border-box';

        var box = document.createElement('div');
        box.style.cssText =
          'background:#fff;border-radius:16px;width:min(1100px,96vw);height:min(820px,94vh);' +
          'display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.35)';

        var h = '';
        h += '<div style="display:flex;align-items:center;gap:10px;padding:12px 20px;' +
             'border-bottom:1px solid var(--border);flex-shrink:0">';
        h += '<span style="font-weight:800;font-size:0.9rem">Layout Preview</span>';
        if (ph) h += '<span style="font-size:0.7rem;color:var(--text2)">' + _phaseLabel(ph) + '</span>';
        h += '<span style="font-size:0.62rem;color:var(--text2);margin-left:auto">' +
             _deviceLabel(dev) + ' \u00b7 flow layout \u00b7 same HTML the jsPsych stimulus uses</span>';
        h += '<button id="exp-prev-close" style="background:none;border:1px solid var(--border);' +
             'border-radius:6px;color:var(--text2);cursor:pointer;font-size:0.8rem;padding:3px 10px;' +
             'font-family:inherit">\u2715</button>';
        h += '</div>';
        h += '<div style="flex:1;overflow:auto;background:#f4f4f8;padding:24px">';
        // The design canvas: the device's box, with the content centred in it.
        // The export only half-matches this — the width is `experiment_width`,
        // but there is no height over there, so the product centres its content
        // in whatever viewport the participant actually has. What this draws is
        // the design target, not a picture of the exported experiment opened in
        // a short window.
        //
        // No jsPsych here, so the centring is done inline.
        h += '<div id="exp-prev-stage" style="margin:0 auto;background:#fff;' +
             'border-radius:10px;box-shadow:0 6px 28px rgba(0,0,0,.12);' +
             'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
             'gap:1.5em;padding:2em;box-sizing:border-box;' +
             'width:' + dev.w + 'px;min-height:' + dev.h + 'px"></div>';
        h += '</div>';

        box.innerHTML = h;
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        var stage = document.getElementById('exp-prev-stage');
        _fillPreviewStage(stage, t);
        document.getElementById('exp-prev-close').onclick = function () { overlay.remove(); };
        overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
      }

      // The preview runs the experiment itself: the same HTML the code export and
      // the publish button produce, opened in its own tab. Nothing is re-implemented
      // here, so the preview cannot drift from what a participant actually gets.
      function previewExperiment() {
        if (editor.phases.length === 0) {
          alert('Please add phases and trials first');
          return;
        }
        var html;
        try {
          html = generatePreviewFile();
        } catch (e) {
          alert('Could not generate the experiment:\n' + e.message);
          return;
        }
        // A blob URL keeps the page self-contained: the jsPsych CDN tags load from
        // it exactly as they would from a saved file. The run ends with
        // jsPsych.data.displayData(), so the tab shows the collected data too.
        var url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
        var tab = window.open(url, '_blank');
        if (!tab) {
          URL.revokeObjectURL(url);
          alert('The preview tab was blocked. Allow pop-ups for this page, then try again.');
          return;
        }
        // Keep the URL alive until the new tab has loaded it.
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      }
      function saveState() {
        editor.hi++;
        editor.history = editor.history.slice(0, editor.hi);
        editor.history.push(
          JSON.parse(
            JSON.stringify({
              phases: editor.phases,
              sel: editor.selectedTrial,
              sc: editor.selComp,
              tc: editor.tc,
              pc: editor.pc,
              cc: editor.cc,
            }),
          ),
        );
        if (editor.history.length > 50) editor.history.shift();
        var b = document.getElementById('undo-btn');
        if (b) b.disabled = false;
      }
      // Bring experiments saved before the jsPsych alignment pass forward. Old
      // data lives in localStorage, so it cannot simply be assumed away.
      function migratePos() {
        var droppedDelays = 0;
        var droppedClicks = 0;
        var droppedLogic = 0;
        // The per-phase array is `timeline` now — the same name jsPsych uses for
        // a node's children, so the later step to a nested tree is about nesting
        // rather than about renaming.
        editor.phases.forEach(function (p) {
          if (!Array.isArray(p.timeline)) p.timeline = Array.isArray(p.trials) ? p.trials : [];
          delete p.trials;
          // `type` and `color` categorised a phase for the card's icon and
          // badge. There is one category now, so they are dropped rather than
          // left behind for the next reader to wonder about.
          delete p.type;
          delete p.color;
        });
        editor.phases.forEach(function (p) {
          p.timeline.forEach(function (t) {
            // loop / randomize / branch / variable are gone: ExpVis no longer
            // carries node-level parameters at all, so a trial runs once and the
            // timeline is exactly what the canvas shows. Experiments that relied
            // on them need the loop, the sampling or the conditional jump added
            // by hand in the exported code.
            var logicComps = t.components.filter(function (c) {
              return ['loop', 'randomize', 'branch', 'variable'].indexOf(c.type) >= 0;
            });
            if (logicComps.length) {
              droppedLogic += logicComps.length;
              t.components = t.components.filter(function (c) { return logicComps.indexOf(c) < 0; });
            }
            // `click` is gone — it had no official counterpart.
            var clicks = t.components.filter(function (c) { return c.type === 'click'; });
            if (clicks.length) {
              droppedClicks += clicks.length;
              t.components = t.components.filter(function (c) { return c.type !== 'click'; });
            }
            // `delay` is gone. A timed node is now the trial-level
            // trial_duration — the jsPsych parameter it was standing in for —
            // so carry the old duration across before dropping the component.
            var delays = t.components.filter(function (c) { return c.type === 'delay'; });
            if (delays.length) {
              droppedDelays += delays.length;
              if (!t.trial_duration) {
                var d = delays.filter(function (c) { return c.duration; })[0];
                if (d) t.trial_duration = Number(d.duration) || undefined;
              }
              t.components = t.components.filter(function (c) { return c.type !== 'delay'; });
            }
            t.components.forEach(function (c, ci) {
              if (c.type === 'button') {
                // labels: 'Yes,No'  →  choices: ['Yes','No'] — the plugin's own
                // parameter, spelled the way jsPsych spells it.
                var src = Array.isArray(c.choices) ? c.choices
                        : Array.isArray(c.labels) ? c.labels
                        : String(c.labels == null ? 'Yes,No' : c.labels).split(',');
                var choices = src.map(function (x) { return String(x).trim(); })
                  .filter(function (x) { return x; });
                // Rebuild in the canonical field order so the inspector lists the
                // parameters the same way for migrated and newly-added buttons.
                var rebuilt = {
                  type: 'button',
                  choices: choices,
                  prompt: c.prompt || '',
                  button_layout: c.button_layout || 'grid',
                  grid_rows: c.grid_rows == null ? 1 : c.grid_rows,
                  grid_columns: c.grid_columns == null ? 0 : c.grid_columns,
                  trial_duration: c.trial_duration == null ? 0 : c.trial_duration,
                  stimulus_duration: c.stimulus_duration == null ? 0 : c.stimulus_duration,
                  response_ends_trial: c.response_ends_trial == null ? true : c.response_ends_trial,
                  enable_button_after: c.enable_button_after == null ? 0 : c.enable_button_after,
                };
                rebuilt.id = c.id;
                rebuilt.cat = c.cat;
                t.components[ci] = rebuilt;
                return;
              }
              if (c.type === 'textInput') {
                // correctAnswer/validation were an ExpVis-only scoring extension;
                // survey-text has no notion of a right answer, so they go.
                delete c.correctAnswer;
                delete c.validation;
                var rebuiltTi = {
                  type: 'textInput',
                  prompt: c.prompt || '',
                  placeholder: c.placeholder == null ? 'Enter text' : c.placeholder,
                  name: c.name || 'Q0',
                  required: c.required == null ? false : c.required,
                  rows: c.rows == null ? 1 : c.rows,
                  columns: c.columns == null ? 40 : c.columns,
                  button_label: c.button_label || 'Continue',
                  autocomplete: c.autocomplete == null ? false : c.autocomplete,
                };
                rebuiltTi.id = c.id;
                rebuiltTi.cat = c.cat;
                t.components[ci] = rebuiltTi;
                return;
              }
              if (['text', 'shape', 'image', 'audio', 'video'].indexOf(c.type) >= 0) {
                // A trial shows one screen, so these are gone. Dropped rather
                // than left inert: a component carrying fields nothing reads is
                // how the next reader gets misled.
                delete c.newStep;
                delete c.step_duration;
              }
              if (c.type === 'fixation') {
                // `duration` was the old name; the emitted parameter is
                // trial_duration. durationStep was read at emit time but never
                // stored, so it is seeded with the value that was being assumed.
                if (c.trial_duration == null) c.trial_duration = c.duration == null ? 500 : c.duration;
                delete c.duration;
                if (c.durationMin == null) c.durationMin = 0;
                if (c.durationMax == null) c.durationMax = 0;
                if (c.durationStep == null) c.durationStep = 250;
                return;
              }
              if (c.type === 'image') {
                // `width` was the old name; the image plugins call it
                // stimulus_width, and it doubles as max-width in the HTML path.
                if (c.stimulus_width == null) c.stimulus_width = c.width == null ? 200 : c.width;
                delete c.width;
                if (c.stimulus_height == null) c.stimulus_height = 0;
                if (c.maintain_aspect_ratio == null) c.maintain_aspect_ratio = true;
                if (c.render_on_canvas == null) c.render_on_canvas = true;
                delete c.posX; // this branch returns, so the shared cleanup below
                delete c.posY; // would not otherwise reach it
                return;
              }
              if (c.type === 'slider') {
                // labelMin/labelMax were two separate fields; the plugin takes one
                // `labels` array placed at equal spacing.
                var slabs = Array.isArray(c.labels) ? c.labels
                  : [c.labelMin, c.labelMax].filter(function (x) { return x != null && x !== ''; });
                var lo = c.min == null ? 0 : c.min, hi = c.max == null ? 100 : c.max;
                var rebuiltSl = {
                  type: 'slider',
                  min: lo,
                  max: hi,
                  step: c.step == null ? 1 : c.step,
                  // The old widget always started at the midpoint, and was drawn
                  // 320px wide; carry both across so the experiment looks the same.
                  slider_start: c.slider_start == null ? Math.round((lo + hi) / 2) : c.slider_start,
                  labels: slabs.map(function (x) { return String(x); }),
                  button_label: c.button_label || 'Continue',
                  slider_width: c.slider_width == null ? 320 : c.slider_width,
                  require_movement: c.require_movement == null ? false : c.require_movement,
                  prompt: c.prompt || '',
                  trial_duration: c.trial_duration == null ? 0 : c.trial_duration,
                  stimulus_duration: c.stimulus_duration == null ? 0 : c.stimulus_duration,
                  response_ends_trial: c.response_ends_trial == null ? true : c.response_ends_trial,
                };
                rebuiltSl.id = c.id;
                rebuiltSl.cat = c.cat;
                t.components[ci] = rebuiltSl;
                return;
              }
              if (c.type === 'keyboard') {
                // keys: 'a,l'  →  choices: ['a','l'] — the plugin's own
                // parameter. A blank entry was how the spacebar used to be
                // written; it migrates to ' ', the value jsPsych matches on.
                var ksrc;
                if (Array.isArray(c.choices)) ksrc = c.choices;
                else if (Array.isArray(c.keys)) ksrc = c.keys;
                else if (c.keys == null) ksrc = ['a', 'l'];
                else ksrc = String(c.keys).split(',').map(function (x) { return x.trim() || ' '; });
                var rebuiltKb = {
                  type: 'keyboard',
                  choices: ksrc.map(function (x) { return String(x); }),
                  correctKey: c.correctKey || '',
                  prompt: c.prompt == null ? 'Press a key' : c.prompt,
                  // `timeout` was the pre-alignment spelling of trial_duration
                  trial_duration: c.trial_duration != null ? c.trial_duration
                    : (Number(c.timeout) || 0),
                  stimulus_duration: c.stimulus_duration == null ? 0 : c.stimulus_duration,
                  response_ends_trial: c.response_ends_trial == null ? true : c.response_ends_trial,
                  wait_for_key_release: c.wait_for_key_release == null ? false : c.wait_for_key_release,
                };
                rebuiltKb.id = c.id;
                rebuiltKb.cat = c.cat;
                t.components[ci] = rebuiltKb;
                return;
              }
              // posX/posY dated from the absolute-positioning era and were never
              // read once layout became flow-based. They are not jsPsych
              // parameters, so they are dropped rather than re-seeded.
              delete c.posX;
              delete c.posY;
            });
          });
        });
        if (droppedLogic) {
          console.info('[ExpVis] Removed ' + droppedLogic + ' loop / randomize / branch / variable ' +
            'component(s). ExpVis no longer carries node-level parameters: each trial runs once, ' +
            'and the timeline is exactly what the canvas shows. Add repetitions, sampling or a ' +
            'conditional jump by hand in the exported code if the experiment needs them.');
        }
        if (droppedClicks) {
          console.info('[ExpVis] Removed ' + droppedClicks + ' "click" component(s): it had no ' +
            'official jsPsych counterpart. A button, or a keyboard trial set to any key, covers the same ground.');
        }
        if (droppedDelays) {
          console.info('[ExpVis] Removed ' + droppedDelays + ' old "delay" component(s). ' +
            'Use the trial-level "Trial Duration" (jsPsych trial_duration) instead.');
        }
      }
      function undo() {
        if (editor.hi < 0) return;
        var s = editor.history[editor.hi];
        editor.hi--;
        if (!s) return;
        // Deep copy: assigning the snapshot by reference means the next edit
        // mutates the history entry too, so redo/undo drifts.
        editor.phases = JSON.parse(JSON.stringify(s.phases));
        migratePos();
        editor.selectedTrial = s.sel;
        editor.selComp = s.sc;
        editor.tc = s.tc;
        editor.pc = s.pc;
        editor.cc = s.cc;
        renderAll();
        if (editor.hi < 0) {
          var b = document.getElementById('undo-btn');
          if (b) b.disabled = true;
        }
      }
      function resetEditor() {
        editor.phases = [];
        editor.selectedTrial = null;
        editor.selComp = null;
        editor.tc = 0;
        editor.pc = 0;
        editor.cc = 0;
        editor.history = [];
        editor.hi = -1;
        var b = document.getElementById('undo-btn');
        if (b) b.disabled = true;
        renderAll();
      }

      // ============ Templates ============
      function loadTemplate(name) {
        resetEditor();
        // Helper: set component props by index in a trial. Tolerant of a missing
        // index: these templates were written against component types that have
        // since been removed, so the indices have shifted and the surplus calls
        // land on nothing. They are being rewritten; until then this keeps them
        // loadable instead of throwing.
        function sc(trial, idx, props) {
          var c = trial.components[idx];
          if (!c) return;
          Object.keys(props).forEach(function (k) {
            c[k] = props[k];
          });
        }

        if (name === 'stroop') {
          // Phase 1: Instructions
          addPhase('Instructions');
          var p1 = editor.phases[0].id;
          addTrial(p1);
          addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'button', 'r');
          var t1 = findTrial(editor.selectedTrial);
          sc(t1, 0, {content: 'Welcome to the Stroop experiment!\n\nYou will see color words (RED, BLUE, GREEN) displayed in different font colors.\nYour task is to respond to the FONT COLOR, ignoring the word meaning.\n\nRed font → Press A\nBlue font → Press L\nGreen font → Press K\n\nRespond as quickly and accurately as possible!', fontSize: 20, position: 'center'});
          sc(t1, 1, {choices: ['Start Experiment']});
          // Phase 2: Stroop trials — 9 variants (3 colors × 3 characters)
          addPhase('Trials');
          var p2 = editor.phases[1].id;
          // Main trial: fixation → delay → randomize(9 texts) → keyboard → branch → loop
          addTrial(p2);
          addComponent(editor.selectedTrial, 'fixation', 's');
          addComponent(editor.selectedTrial, 'randomize', 'l');
          for (var si = 0; si < 9; si++) addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'keyboard', 'r');
          addComponent(editor.selectedTrial, 'branch', 'l');
          addComponent(editor.selectedTrial, 'loop', 'l');
          var t2 = findTrial(editor.selectedTrial);
          sc(t2, 0, {trial_duration: 700});
          sc(t2, 1, {mode: 'pick-one'});
          // 9 text variants: 3 colors × 3 characters
          var stroopVariants = [
            {content: 'RED', color: '#ff0000', key: 'a'},
            {content: 'RED', color: '#0000ff', key: 'l'},
            {content: 'RED', color: '#00aa00', key: 'k'},
            {content: 'BLUE', color: '#ff0000', key: 'a'},
            {content: 'BLUE', color: '#0000ff', key: 'l'},
            {content: 'BLUE', color: '#00aa00', key: 'k'},
            {content: 'GREEN', color: '#ff0000', key: 'a'},
            {content: 'GREEN', color: '#0000ff', key: 'l'},
            {content: 'GREEN', color: '#00aa00', key: 'k'},
          ];
          stroopVariants.forEach(function (v, vi) {
            sc(t2, 2 + vi, {content: v.content, color: v.color, fontSize: 36, position: 'center', fontWeight: 'bold', 映射按键: v.key});
          });
          sc(t2, 11, Object.assign({choices: ['a', 'l', 'k'], prompt: 'Red→A  Blue→L  Green→K'}));
          sc(t2, 12, {condition: 'correct'});
          sc(t2, 13, {count: 48});
          // Error feedback trial
          addTrial(p2);
          addComponent(editor.selectedTrial, 'text', 's');
          var t3 = findTrial(editor.selectedTrial);
          sc(t3, 0, {content: 'Press the key for the FONT COLOR!\nRed=A  Blue=L  Green=K', fontSize: 22, color: '#ef4444', position: 'center'});
          t3.trial_duration = 1200;
          sc(t2, 12, {condition: 'correct', targetFail: t3.id});
          // Phase 3: Feedback
          addPhase('Feedback');
          var p3 = editor.phases[2].id;
          addTrial(p3);
          addComponent(editor.selectedTrial, 'text', 's');
          var t3 = findTrial(editor.selectedTrial);
          sc(
            t3,
            0,
            Object.assign({content: 'Experiment complete!\n\nThank you for your participation.\nYour response data has been recorded.', fontSize: 22, position: 'center'}, ),
          );
        } else if (name === 'simon') {
          // Phase 1: Instructions
          addPhase('Instructions');
          var p1 = editor.phases[0].id;
          addTrial(p1);
          addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'button', 'r');
          var t1 = findTrial(editor.selectedTrial);
          sc(
            t1,
            0,
            Object.assign({
                content:
                  'Welcome to the Simon effect experiment!\n\nColored circles will appear on the left or right side of the screen.\nIgnore the position and respond based on COLOR:\n\nRed → Press A\nGreen → Press L\n\nRespond as quickly and accurately as possible!',
                fontSize: 20,
                position: 'center',
              }, ),
          );
          sc(t1, 1, {choices: ['Start Experiment']});
          // Phase 2: Simon trials — pick-one from 4 variants (red/green × left/right)
          addPhase('Trials');
          var p2 = editor.phases[1].id;
          // Main trial: fixation → delay → randomize(4 shapes) → keyboard → branch → loop
          addTrial(p2);
          addComponent(editor.selectedTrial, 'fixation', 's');
          addComponent(editor.selectedTrial, 'randomize', 'l');
          addComponent(editor.selectedTrial, 'shape', 's');
          addComponent(editor.selectedTrial, 'shape', 's');
          addComponent(editor.selectedTrial, 'shape', 's');
          addComponent(editor.selectedTrial, 'shape', 's');
          addComponent(editor.selectedTrial, 'keyboard', 'r');
          addComponent(editor.selectedTrial, 'branch', 'l');
          addComponent(editor.selectedTrial, 'loop', 'l');
          var t2 = findTrial(editor.selectedTrial);
          sc(t2, 0, {trial_duration: 700}); // fixation
          sc(t2, 1, {mode: 'pick-one'}); // randomize: pick one each loop
          sc(t2, 2, {shape: 'circle', size: 80, color: '#ef4444', position: 'center', 映射按键: 'a'}); // 左→A
          sc(t2, 3, {shape: 'circle', size: 80, color: '#ef4444', position: 'center', 映射按键: 'a'}); // 右→A
          sc(t2, 4, {shape: 'circle', size: 80, color: '#22c55e', position: 'center', 映射按键: 'l'}); // 左→L
          sc(t2, 5, {shape: 'circle', size: 80, color: '#22c55e', position: 'center', 映射按键: 'l'}); // 右→L
          sc(t2, 6, Object.assign({choices: ['a', 'l'], prompt: 'Red→A  Green→L'})); // keyboard
          sc(t2, 7, {condition: 'correct'}); // branch placeholder (targetFail set below)
          sc(t2, 8, {count: 60}); // 60 trials
          // Error feedback trial (branch target)
          addTrial(p2);
          addComponent(editor.selectedTrial, 'text', 's');
          var t3 = findTrial(editor.selectedTrial);
          sc(
            t3,
            0,
            Object.assign({content: 'Press the key for the COLOR!\nRed=A  Green=L', fontSize: 22, color: '#ef4444', position: 'center'}, ),
          );
          t3.trial_duration = 1200;
          // Set branch target to error trial
          sc(t2, 7, {condition: 'correct', targetFail: t3.id});
          // Phase 3: Feedback
          addPhase('Feedback');
          var p3 = editor.phases[2].id;
          addTrial(p3);
          addComponent(editor.selectedTrial, 'text', 's');
          var tf = findTrial(editor.selectedTrial);
          sc(
            tf,
            0,
            Object.assign({
                content: 'Experiment complete!\n\nThank you for your participation.\nYour reaction time and accuracy have been recorded.',
                fontSize: 24,
                position: 'center',
              }, ),
          );
        } else if (name === 'flanker') {
          // Phase 1: Instructions
          addPhase('Instructions');
          var p1 = editor.phases[0].id;
          addTrial(p1);
          addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'button', 'r');
          var t1 = findTrial(editor.selectedTrial);
          sc(t1, 0, {
            content: 'Welcome to the Flanker task!', fontSize: 20, color: '#1e293b', position: 'center'
          });
          sc(t1, 1, {
            content: 'A row of arrows will appear in the center. Judge the direction of the MIDDLE arrow.\nIf the middle arrow points LEFT (←), press F.\nIf the middle arrow points RIGHT (→), press J.\nIgnore the flanking arrows. Respond quickly and accurately.',
            fontSize: 16, color: '#333333', position: 'center'
          });
          sc(t1, 2, {choices: ['Start Experiment']});
          // Phase 2: Flanker trials
          addPhase('Trials');
          var p2 = editor.phases[1].id;
          // Main trial: fixation → delay → randomize(5 texts) → keyboard → branch → loop
          addTrial(p2);
          addComponent(editor.selectedTrial, 'fixation', 's');
          addComponent(editor.selectedTrial, 'randomize', 'l');
          for (var fi = 0; fi < 5; fi++) addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'keyboard', 'r');
          addComponent(editor.selectedTrial, 'branch', 'l');
          addComponent(editor.selectedTrial, 'loop', 'l');
          var t2 = findTrial(editor.selectedTrial);
          sc(t2, 0, {trial_duration: 700});
          sc(t2, 1, {mode: 'pick-one'});
          // 5 Flanker arrow variants
          var flankerVariants = [
            {content: '<<<<<', color: '#1a1a2e', 映射按键: 'f'},
            {content: '><><>', color: '#ef4444', 映射按键: 'j'},
            {content: '>>>>>', color: '#1a1a2e', 映射按键: 'j'},
            {content: '<><<>', color: '#ef4444', 映射按键: 'f'},
            {content: '>>><>', color: '#22c55e', 映射按键: 'j'},
          ];
          for (var fi2 = 0; fi2 < flankerVariants.length; fi2++) {
            var fv = flankerVariants[fi2];
            sc(t2, 2 + fi2, {content: fv.content, fontSize: 28, color: fv.color, position: 'center', 映射按键: fv.映射按键});
          }
          sc(t2, 7, Object.assign({choices: ['f', 'j'], prompt: '← Press F  → Press J', trial_duration: 1500}));
          sc(t2, 8, {condition: 'correct', targetFail: ''});
          sc(t2, 9, {count: 80});
          // Error feedback trial (branch target)
          addTrial(p2);
          addComponent(editor.selectedTrial, 'text', 's');
          var tErr = findTrial(editor.selectedTrial);
          sc(tErr, 0, {
            content: 'Press the key according to the rules!', fontSize: 20, color: '#ef4444', position: 'center'
          });
          tErr.trial_duration = 1500;
          sc(t2, 8, {condition: 'correct', targetFail: tErr.id});
          // Error message trial (shown after main experiment)
          addTrial(p2);
          addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'keyboard', 'r');
          var t3 = findTrial(editor.selectedTrial);
          sc(t3, 0, {
            content: 'Incorrect answer. Please focus.', fontSize: 22, color: '#dc2626', position: 'center'
          });
          sc(t3, 1, Object.assign({choices: ['space'], prompt: 'Press space to continue'}));
          // Phase 3: Feedback
          addPhase('Feedback');
          var p3 = editor.phases[2].id;
          addTrial(p3);
          addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'keyboard', 'r');
          var tf = findTrial(editor.selectedTrial);
          sc(tf, 0, {
            content: 'Experiment complete. Thank you for your participation!', fontSize: 22, color: '#1e293b', position: 'center'
          });
          sc(tf, 1, Object.assign({choices: ['space']}));
        } else if (name === 'branch-demo') {
          // Phase 1: explain the branch concept
          addPhase('Instructions');
          var p1 = editor.phases[0].id;
          addTrial(p1);
          addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'button', 'r');
          var t1 = findTrial(editor.selectedTrial);
          sc(
            t1,
            0,
            Object.assign({
                content:
                  'Branch Demo\n\nThis experiment demonstrates the branch component:\n• Red text → Press A\n• Blue text → Press L\n• Wrong answer → jumps to error feedback\n• Correct answer → proceeds normally\n\n2 sets of 3 trials each.',
                fontSize: 18,
                position: 'center',
              }, ),
          );
          sc(t1, 1, {choices: ['Start Demo']});
          // Phase 2: branch demo trials
          addPhase('Trials');
          var p2 = editor.phases[1].id;
          // -- Trial 2: red text, A key (correctKey: a), branch→t3 on error
          addTrial(p2);
          addComponent(editor.selectedTrial, 'fixation', 's');
          addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'keyboard', 'r');
          addComponent(editor.selectedTrial, 'branch', 'l');
          addComponent(editor.selectedTrial, 'loop', 'l');
          var t2 = findTrial(editor.selectedTrial);
          sc(t2, 0, {trial_duration: 700});
          sc(t2, 1, {content: 'RED', color: '#ef4444', fontSize: 36, position: 'center'});
          sc(t2, 2, Object.assign({choices: ['a', 'l'], correctKey: 'a'}));
          sc(t2, 3, {condition: 'correct'}); // targetFail set below after trial IDs known
          sc(t2, 4, {count: 3});
          // -- Trial 3: error feedback (target of branch from trial 2)
          addTrial(p2);
          addComponent(editor.selectedTrial, 'text', 's');
          var t3 = findTrial(editor.selectedTrial);
          sc(
            t3,
            0,
            Object.assign({content: 'Wrong key!\n\nPress A for RED text', fontSize: 22, color: '#ef4444', position: 'center'}, ),
          );
          t3.trial_duration = 1500;
          // -- Trial 4: blue text, L key (correctKey: l), branch→t5 on error
          addTrial(p2);
          addComponent(editor.selectedTrial, 'fixation', 's');
          addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'keyboard', 'r');
          addComponent(editor.selectedTrial, 'branch', 'l');
          addComponent(editor.selectedTrial, 'loop', 'l');
          var t4 = findTrial(editor.selectedTrial);
          sc(t4, 0, {trial_duration: 700});
          sc(t4, 1, {content: 'BLUE', color: '#3b82f6', fontSize: 36, position: 'center'});
          sc(t4, 2, Object.assign({choices: ['a', 'l'], correctKey: 'l'}));
          sc(t4, 3, {condition: 'correct'});
          sc(t4, 4, {count: 3});
          // -- Trial 5: error feedback (target of branch from trial 4)
          addTrial(p2);
          addComponent(editor.selectedTrial, 'text', 's');
          var t5 = findTrial(editor.selectedTrial);
          sc(
            t5,
            0,
            Object.assign({content: 'Wrong key!\n\nPress L for BLUE text', fontSize: 22, color: '#ef4444', position: 'center'}, ),
          );
          t5.trial_duration = 1500;
          // Now set targetFail references (trial IDs are known)
          sc(t2, 3, {condition: 'correct', targetFail: t3.id});
          sc(t4, 3, {condition: 'correct', targetFail: t5.id});
          // Phase 3: feedback
          addPhase('Feedback');
          var p3 = editor.phases[2].id;
          addTrial(p3);
          addComponent(editor.selectedTrial, 'text', 's');
          var tf = findTrial(editor.selectedTrial);
          sc(
            tf,
            0,
            Object.assign({
                content:
                  'Demo complete!\n\nKey branch features:\n• targetFail property specifies error jump target\n• Correct answer: continues main flow\n• Wrong answer: flashes red → jumps to error page\n• Error page ends → returns to main flow\n• Target trials auto-skipped when reached via normal flow',
                fontSize: 20,
                position: 'center',
              }, ),
          );
        } else if (name === 'randomize-demo') {
          // Phase 1: Instructions
          addPhase('Instructions');
          var p1 = editor.phases[0].id;
          addTrial(p1);
          addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'button', 'r');
          var t1 = findTrial(editor.selectedTrial);
          sc(
            t1,
            0,
            Object.assign({
                content:
                  'Randomize + Variable Demo\n\nThis experiment demonstrates two logic components:\n\nVariable: stores experiment data (e.g. score)\n  • Creates variable score=0 at trial start\n  • +1 on each correct answer\n\nRandomize: shuffles component display order\n  • 4 fruit names in random order\n  • Different order each loop\n\nMemorize the fruit names, then type them in.\n5 rounds total.',
                fontSize: 17,
                position: 'center',
              }, ),
          );
          sc(t1, 1, {choices: ['Start Demo']});
          // Phase 2: Trials
          addPhase('Trials');
          var p2 = editor.phases[1].id;
          // Trial 2: init variable
          addTrial(p2);
          addComponent(editor.selectedTrial, 'variable', 'l');
          var t2 = findTrial(editor.selectedTrial);
          sc(t2, 0, {name: 'score', initial: 0});
          // Trial 3: memory test with randomize — 4 fruits + response
          addTrial(p2);
          addComponent(editor.selectedTrial, 'fixation', 's');
          addComponent(editor.selectedTrial, 'randomize', 'l');
          addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'textInput', 'r');
          addComponent(editor.selectedTrial, 'variable', 'l');
          addComponent(editor.selectedTrial, 'loop', 'l');
          var t3 = findTrial(editor.selectedTrial);
          sc(t3, 0, {trial_duration: 700});
          sc(t3, 1, {mode: 'shuffle'});
          sc(
            t3,
            2,
            {content: 'Apple', fontSize: 30, color: '#ef4444', position: 'center'},
          );
          sc(
            t3,
            3,
            {content: 'Banana', fontSize: 30, color: '#f59e0b', position: 'center'},
          );
          sc(
            t3,
            4,
            {content: 'Orange', fontSize: 30, color: '#f97316', position: 'center'},
          );
          sc(
            t3,
            5,
            {content: 'Grape', fontSize: 30, color: '#a855f7', position: 'center'},
          );
          // No trial_duration here: survey-text has none, so the recall question
          // waits for the participant to submit.
          sc(
            t3,
            6,
            {prompt: 'Which fruits do you remember?', placeholder: 'Apple, Banana, …', name: 'Fruits'},
          );
          sc(t3, 7, {name: 'score', initial: 0});
          sc(t3, 8, {count: 5});
          // Phase 3: Feedback
          addPhase('Feedback');
          var p3 = editor.phases[2].id;
          addTrial(p3);
          addComponent(editor.selectedTrial, 'text', 's');
          var tf = findTrial(editor.selectedTrial);
          sc(
            tf,
            0,
            Object.assign({
                content:
                  'Demo complete!\n\nVariable component:\n• Stores and updates experiment data\n• e.g. scores, cumulative RT\n• Converted to data fields in jsPsych\n\nRandomize component:\n• Shuffles component order within a trial\n• Controls order effects\n• Converted to timeline_variables in jsPsych',
                fontSize: 20,
                position: 'center',
              }, ),
          );
        }
        if (editor.selectedTrial) {
          var ft = findTrial(editor.selectedTrial);
          if (ft && ft.components.length > 0) editor.selComp = ft.components[0].id;
        }
        renderAll();
      }

      function setDevice(idx) {
        if (idx === '' || idx === 'custom') {
          // "Custom" keeps whatever size is already in the fields.
          syncDeviceControls();
          return;
        }
        var p = devicePresets[parseInt(idx)];
        if (p) setDeviceSize(p.w, p.h);
      }

      // Compile the experiment into jsPsych code (no HTML shell).
      // Both the code export and the published file build on this, so the two
      // outputs run the *same* experiment rather than two parallel implementations.
      //   opts.onFinish — JS statements to run in initJsPsych's on_finish
      // Returns { code, usedPlugins }.
      function _compileExperiment(opts) {
        opts = opts || {};
        // The preview runs from a blob URL, where a relative path like
        // 'img/blue.png' has nothing to resolve against. It therefore asks for a
        // build with the bytes written in. The exported file and the published
        // bundle both use paths — the same compiler, the same experiment.
        var _inlineAssets = !!opts.inlineAssets;
        if (editor.phases.length === 0) {
          return { code: '// No experiment created yet\n', usedPlugins: {}, phases: [],
                   assets: [] };
        }
        // What was decided about each phase — whether its trials turned out to
        // be one procedure with different values. Returned so the canvas can
        // report the compiler's actual decision instead of forming its own.
        var _phaseModes = [];
        var dev = editor.device || {w: 1280, h: 720};
        // Collect jsPsych plugins actually used by this experiment, so the
        // generated HTML only loads what it needs.
        var _usedPlugins = {};
        // Assets are referenced by PATH in the generated code — 'img/blue.png',
        // the way the jsPsych docs write them — not inlined as data URIs. The
        // editor keeps the bytes (`fileData`) because the canvas, the live
        // preview and the export bundle all need them; the experiment file gets
        // a path that the bundle satisfies.
        //
        // Paths are derived from the uploaded file's name, so the folder in the
        // bundle and the string in the code cannot disagree. Two different files
        // that happen to share a name get a numeric suffix rather than one
        // silently overwriting the other in the archive.
        var _assets = [];
        var _assetByData = {};
        var _assetPaths = {};
        function _assetFor(fileName, type, data) {
          if (!data) return null;
          if (_assetByData[data] != null) return _assets[_assetByData[data]];
          var kind = type === 'audio' ? 'snd' : type === 'video' ? 'vid' : 'img';
          var base = _assetBaseName(fileName);
          var path = kind + '/' + base, n = 2;
          while (_assetPaths[path]) {
            path = kind + '/' + base.replace(/(\.[^.]*)?$/, '_' + (n++) + '$1');
          }
          _assetPaths[path] = true;
          _assetByData[data] = _assets.length;
          _assets.push({path: path, type: type || 'image', data: data, idx: _assets.length});
          return _assets[_assets.length - 1];
        }
        // Where an asset is written into HTML, the compiler leaves this token and
        // _jsStr() replaces it — with the path, or with the data URI when the
        // build is one that has to stand alone (see opts.inlineAssets).
        function _assetToken(fileName, type, data) {
          var a = _assetFor(fileName, type, data);
          return a ? '@@ASSET_' + a.idx + '@@' : '';
        }
        function _mediaRef(c) {
          return _assetFor(c.fileName, c.type, c.fileData);
        }
        function _assetHref(fileName, type, data) {
          var a = _assetFor(fileName, type, data);
          if (!a) return null;
          return _inlineAssets ? a.data : a.path;
        }
        // The stage every stimulus is laid out on. jsPsych's own
        // `.jspsych-content-wrapper { margin:auto }` centres this block, so it
        // needs no justify-content of its own. The WIDTH is deliberately not
        // here: it is `experiment_width` on initJsPsych, which sizes jsPsych's
        // content element once rather than repeating the device number in every
        // trial's markup — and a stage div with no width fills that element, so
        // the box the researcher laid out is still the box the participant gets.
        // No height is set anywhere: see the note where _deviceStyle used to be.
        function _stage(innerHTML) {
          return '<div style="display:flex;flex-direction:column;align-items:center;' +
            'gap:1.5em;padding:2em;box-sizing:border-box">' +
            innerHTML + '</div>';
        }

        // Turn stimulus HTML into a single-quoted JS string. Placeholders left by
        // compHTML() become variable concatenations AFTER quote-escaping, so the
        // escaped HTML and the live expression don't interfere.
        // The one place an asset's name is decided. Everything else asks for a
        // token and this resolves it — to the path the bundle will contain, or,
        // for a build that has to stand alone, to the bytes themselves. Both
        // outputs are the same experiment written the same way; only the spelling
        // of an asset differs.
        function _jsStr(html) {
          return html.replace(/'/g, "\\'").replace(/@@ASSET_(\d+)@@/g, function (_, i) {
            var a = _assets[Number(i)];
            return _inlineAssets ? a.data : a.path;
          });
        }
        var code = '';
        // The data has to leave the browser, or it is gone when the tab closes.
        // `displayData()` only draws a table; the run ends and everything the
        // participant did goes with it. localSave downloads a file — the only
        // durable record available to a page with no server behind it — and the
        // filename carries a timestamp so two sessions cannot overwrite each
        // other. Note the argument order: format first.
        var _saveName = (editor.projectName || 'experiment').replace(/[^a-zA-Z0-9_-]/g, '_');
        // One file that works in both places. JATOS injects `window.jatos`;
        // anywhere else the check is false and the researcher gets the file they
        // always got. The download stays the default because an experiment
        // opened from an email still has to leave a copy with the participant.
        //
        // Ending the study right after submitting is deliberate: JATOS discards
        // already-submitted result data when a component is aborted, so there is
        // nothing to gain by leaving the component running once the data is in.
        var onFinishBody = opts.onFinish || (
          'if (window.jatos) {\n' +
          '  jatos.submitResultData(jsPsych.data.get().csv())\n' +
          '    .then(function () { jatos.endStudy(); });\n' +
          '} else {\n' +
          '  jsPsych.data.displayData();\n' +
          // localSave lives on DataCollection, not on JsPsychData — it is
          // `jsPsych.data.get().localSave(...)`.
          "  jsPsych.data.get().localSave('csv', '" + _saveName + "_' + Date.now() + '.csv');\n" +
          '}');
        code += 'var jsPsych = initJsPsych({\n';
        if (opts.displayElement) {
          code += "  display_element: '" + opts.displayElement + "',\n";
        }
        // The designed width, as jsPsych's own parameter. It sets the width of
        // the content element, which every stimulus then fills — so the number
        // appears once here instead of in each trial's markup.
        code += '  experiment_width: ' + dev.w + ',\n';
        code += '  on_finish: function() {\n';
        onFinishBody.split('\n').forEach(function (l) {
          code += '    ' + l + '\n';
        });
        code += '  }\n';
        code += '});\n\n';
        code += 'var timeline = [];\n\n@@MEDIA_PRELOAD@@';

        // Map internal response type → jsPsych plugin name
        // Everything runs on jsPsychHtmlKeyboardResponse. For keyboard trials it is
        // used as intended; every response component now runs on its own plugin.
        // container with choices: "NO_KEYS" — the controls are drawn into the
        // stimulus and the trial ends via jsPsych.finishTrial().
        // Which plugin runs an image-only trial. The dedicated image plugins take
        // the picture as `stimulus` and nothing else, so this only applies when
        // the image is the whole visual content — the same shape as the official
        // jsPsych RT-task demo.
        var _imagePlugins = {
          keyboard: 'jsPsychImageKeyboardResponse',
          button: 'jsPsychImageButtonResponse',
          slider: 'jsPsychImageSliderResponse',
        };

        function pluginName(rt, forImage) {
          if (forImage && _imagePlugins[rt]) {
            _usedPlugins[_imagePlugins[rt]] = true;
            return _imagePlugins[rt];
          }
          // This is now only the fallback: instructions, feedback and timed
          // nodes that carry no response component of their own.
          var name = rt === 'button' ? 'jsPsychHtmlButtonResponse'
                   : rt === 'slider' ? 'jsPsychHtmlSliderResponse'
                   : rt === 'animation' ? 'jsPsychAnimation'
                   : rt === 'textInput' ? 'jsPsychSurveyText'
                   : 'jsPsychHtmlKeyboardResponse';
          _usedPlugins[name] = true;
          return name;
        }

        // Build styled stimulus HTML for a component. This is what the generated
        // file contains; the previews render the real plugin instead, so nothing
        // here has to imitate a plugin's DOM.
        // ---- Self-rendered response controls -------------------------------
        // jsPsych's *-button / *-slider / survey-text plugins render their controls
        // *below* the stimulus, which is why a positioned control ended up
        // outside the canvas. We draw the controls into the stimulus HTML at their
        // real coordinates and end the trial ourselves with jsPsych.finishTrial().
        // jsPsych's ParameterType.KEYS takes an ARRAY of key strings, or one of
        // the sentinel strings "ALL_KEYS" / "NO_KEYS". (A comma-separated string
        // is not one of the accepted forms — it falls through to
        // String.prototype.includes() and matches as a substring.)
        // An empty list means "any key"; `space` is the readable spelling of the
        // spacebar, since a bare space would not survive trimming.
        function _keys(c) {
          var list = (Array.isArray(c.choices) ? c.choices : [])
            .map(function (k) {
              var t = String(k).trim();
              return t.toLowerCase() === 'space' ? ' ' : t;
            })
            .filter(function (k) { return k; });
          return list.length ? list : 'ALL_KEYS';
        }

        function compHTML(c) {
          // jsPsych-style flow layout: components are blocks in a flex column,
          // not absolutely positioned pixels. `position` becomes the alignment.
          // This is what makes the stimulus responsive and matches how hand-written
          // jsPsych lays out stimuli.
          // Alignment is emitted only when it differs from the default: centred
          // components inherit it from the flex container (`align-items:center`)
          // and from `.jspsych-content { text-align:center }`.
          var pos = c.position || 'center';
          var px = pos === 'left' ? 'align-self:flex-start;text-align:left;'
                 : pos === 'right' ? 'align-self:flex-end;text-align:right;'
                 : '';
          switch (c.type) {
            case 'text':
              return (
                '<div style="' +
                px +
                'font-size:' +
                (c.fontSize || 32) +
                'px;color:' +
                (c.color || '#333') +
                ';font-weight:' +
                (c.fontWeight || 'bold') +
                '">' +
                (c.content || '')
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/\n/g, '<br>') +
                '</div>'
              );
            case 'shape':
              return (
                '<div style="' +
                px +
                'width:' +
                (c.size || 80) +
                'px;height:' +
                (c.size || 80) +
                'px;background:' +
                (c.color || '#6366f1') +
                ';' +
                getShapeCSS(c.shape, c.color) +
                '"></div>'
              );
            case 'fixation':
              return '<div style="' + px + 'font-size:60px;color:#ccc">+</div>';
            case 'image':
              return c.fileData
                ? '<img src="' + _assetToken(c.fileName, c.type, c.fileData) +
                  '" style="' + px + 'max-width:' + (c.stimulus_width || 200) + 'px">'
                : '';
            case 'audio':
              return c.fileData
                ? '<audio controls src="' + _assetToken(c.fileName, c.type, c.fileData) +
                  '" style="' + px + '"></audio>'
                : '';
            case 'video':
              return c.fileData
                ? '<video controls src="' + _assetToken(c.fileName, c.type, c.fileData) +
                  '" style="' + px + 'max-width:' + (c.width || 320) + 'px"></video>'
                : '';
            default:
              return '';
          }
        }

        // Why a trial the canvas shows has no counterpart in the file.
        function _emptyTrialNote(name) {
          return '// ' + name + ' is empty \u2014 nothing to show and nothing to ask, ' +
            'so it is not in the timeline';
        }

        // What makes two of a phase's trials the same procedure. Everything
        // except the values of the properties: the shape of the object, the
        // properties it has, in order, and at what nesting they sit.
        function _trialSignature(part) {
          // The first and last lines are `var <name> = {` and `};` — the wrapper
          // the single-trial emission adds. The name itself differs between
          // trials and says nothing about the shape, so it is not compared.
          var body = part.lines.slice(1, -1);
          var inSlot = {};
          part.slots.forEach(function (s) {
            for (var i = s.from; i < s.to; i++) inSlot[i - 1] = true;
          });
          return JSON.stringify([
            body.filter(function (_, i) { return !inSlot[i]; }),
            part.slots.map(function (s) { return s.path + '@' + s.indent; }),
          ]);
        }

        // A phase becomes one procedure plus a table of values when — and only
        // when — its trials are that. jsPsych's timeline variables repeat one
        // procedure; they cannot describe a set of trials that are structurally
        // different from each other. So a phase whose trials differ in shape, or
        // that holds a single trial, or that is empty, is emitted as plain
        // trials instead. Returns null in all of those cases.
        function _factorPhase(parts) {
          if (parts.length < 2) return null;
          if (parts.some(function (p) { return p.kind !== 'trial'; })) return null;
          var sig = _trialSignature(parts[0]);
          if (!parts.every(function (p) { return _trialSignature(p) === sig; })) return null;

          // The properties that actually differ. A phase whose trials differ in
          // nothing has no table to build, and is emitted as plain trials.
          var varies = [];
          parts[0].slots.forEach(function (s, i) {
            if (!parts.every(function (p) { return p.slots[i].val === s.val; })) varies.push(i);
          });
          if (!varies.length) return null;

          // `type` selects the plugin, and jsPsych reads it when the trial is
          // instantiated — before any timeline variable has a value. Two trials
          // with the same properties but different plugins are two different
          // procedures, not one procedure with a variable plugin. Hoisting them
          // produced `type: jsPsych.timelineVariable('type')`, which cannot
          // resolve to anything. Their property lists match, so the signature
          // check above does not catch it.
          var typeOf = function (p) {
            var found = null;
            p.slots.forEach(function (s) { if (s.key === 'type') found = s.val; });
            return found;
          };
          var firstType = typeOf(parts[0]);
          if (!parts.every(function (p) { return typeOf(p) === firstType; })) return null;

          // A value that spans lines cannot go in a table row. A row is one
          // line, so pasting a block into it produces
          //
          //     {trial_duration:       trial_duration: function () { …
          //
          // which is not JavaScript. Two conditions whose fixations jitter over
          // different ranges did exactly that. Falling back to plain trials is
          // both valid and what the researcher would have written by hand.
          if (varies.some(function (i) {
            return String(parts[0].slots[i].val).indexOf('\n') >= 0;
          })) return null;

          // Name each one after the property itself. `timing.0.stimulus` gets
          // that path only when a bare `stimulus` is already taken, so the
          // common case — the response trial's stimulus varying — reads as
          // `stimulus`.
          var used = {}, names = {};
          varies.forEach(function (i) {
            var base = parts[0].slots[i].path.split('.').pop();
            used[base] = (used[base] || 0) + 1;
            names[i] = used[base] > 1 ? base + '_' + used[base] : base;
          });

          // The procedure: the first trial, with the varying properties replaced
          // by lookups. Line ranges come from the slots, so a multi-line value
          // (`on_finish`, or the `stimulus` of a trial with a fixation) collapses
          // to one line without disturbing anything around it.
          var procedure = [], cursor = 0;
          varies.forEach(function (i) {
            var s = parts[0].slots[i];
            for (var k = cursor; k < s.from; k++) procedure.push(parts[0].lines[k]);
            procedure.push('  '.repeat(s.indent) + s.key +
              ": jsPsych.timelineVariable('" + names[i] + "'),");
            cursor = s.to;
          });
          for (var k = cursor; k < parts[0].lines.length; k++) procedure.push(parts[0].lines[k]);

          // Drop the `var x = {` and `};` the single-trial emission wrapped it in.
          procedure = procedure.slice(1, -1);
          var target;
          if (parts[0].plain) {
            // One trial: it is the node's one entry, so it goes back into braces
            // at the indent an entry sits at.
            target = ['    {']
              .concat(procedure.map(function (l) { return '    ' + l; }))
              .concat(['    }']);
          } else {
            // Several: drop the trial's own `timeline: [` … `]` too. Those
            // trials ARE the node's timeline entries, not one entry containing
            // them.
            target = procedure.slice(1, -1);
          }
          var last = target[target.length - 1];
          if (last.slice(-1) === ',') target[target.length - 1] = last.slice(0, -1);

          return {
            entries: [target],
            table: parts.map(function (p) {
              var row = {};
              varies.forEach(function (i) { row[names[i]] = p.slots[i].val; });
              return row;
            }),
          };
        }

        // The node-level parameters the phase's settings ask for, under jsPsych's
        // own names and shapes.
        //
        // `sample` and `randomize_order` only mean anything alongside
        // `timeline_variables`: jsPsych's generateTimelineVariableOrder returns
        // [null] before looking at either when there is no table to draw from,
        // so writing them onto a phase of unrelated trials would emit parameters
        // that do nothing. They are therefore gated on the phase having factored,
        // which is the same fact the phase badge shows.
        //
        // `sample.groups` is derived from the trials' own group numbers rather
        // than stored, so there is one answer to which condition is in which
        // group instead of a list that can drift from the trials it indexes.
        function _phaseNodeParams(ph, factored) {
          var out = [];
          var s = ph.sample;
          if (factored && s && s.type) {
            if (s.type === 'alternate-groups') {
              // Only the groups that actually hold conditions, renumbered from
              // zero. Carrying a gap through would leave an empty group, and
              // shuffleAlternateGroups loops over the SMALLEST group — so a
              // single empty group silently runs nothing at all.
              var byGroup = {};
              ph.timeline.forEach(function (t, i) {
                var gi = Math.max(0, Math.round(Number(t.group) || 0));
                (byGroup[gi] = byGroup[gi] || []).push(i);
              });
              var buckets = Object.keys(byGroup)
                .sort(function (a, b) { return a - b; })
                .map(function (k) { return byGroup[k]; });
              out.push('sample: {type: \'alternate-groups\', groups: ' + JSON.stringify(buckets) +
                ', randomize_group_order: ' + (s.randomizeGroupOrder ? 'true' : 'false') + '}');
            } else if (s.type === 'custom') {
              out.push("sample: {type: 'custom', fn: " +
                (s.fn || 'function (order) { return order; }') + '}');
            } else {
              var bits = ["type: '" + s.type + "'"];
              if (s.size != null && s.size !== '') bits.push('size: ' + Number(s.size));
              if (s.type === 'with-replacement' &&
                  ph.timeline.some(function (t) { return t.weight != null && t.weight !== ''; })) {
                bits.push('weights: [' + ph.timeline.map(function (t) {
                  return Number(t.weight) || 1;
                }).join(', ') + ']');
              }
              out.push('sample: {' + bits.join(', ') + '}');
            }
          }
          // Independent of sample, not an alternative to it: jsPsych runs the
          // sample first and then shuffles whatever it produced, so both can be
          // set at once and either can be set alone.
          if (factored && ph.randomize_order) out.push('randomize_order: true');
          var reps = Number(ph.repetitions);
          if (reps > 1) out.push('repetitions: ' + Math.round(reps));
          // A loop or a condition belongs to the NODE, and jsPsych reads both
          // whether or not the phase was factored into a table — unlike sample
          // and randomize_order above, which mean nothing without one.
          if (ph.loop) out.push('loop_function: ' + _loopFunctionSrc(ph));
          if (ph.cond) out.push('conditional_function: ' + _conditionalFunctionSrc(ph));
          return out;
        }

        // The node object. `props` is one array of lines per property — a
        // property can span lines (`timeline: [` … `]`), and the comma goes
        // between properties, not between the lines of one.
        function _emitNode(nodeName, props) {
          var all = props.filter(function (p) { return p && p.length; });
          code += 'var ' + nodeName + ' = {\n';
          all.forEach(function (linesOfProp, i) {
            var last = linesOfProp.length - 1;
            linesOfProp.forEach(function (l, j) {
              code += l + (j === last && i < all.length - 1 ? ',' : '') + '\n';
            });
          });
          code += '};\n';
          code += 'timeline.push(' + nodeName + ');\n\n';
        }
        // One property — `timeline: [...]` — from a list of entry blocks. A
        // block is the lines of one entry, already at the indent it will sit at
        // (two levels, inside the node). The comma goes on a block's last line
        // unless it is the last block.
        function _timelineProp(blocks) {
          // The one-line form, when every entry is a bare name: what a phase of
          // plain trials has always produced. Anything else goes multi-line.
          if (blocks.every(function (b) { return b.length === 1; })) {
            var one = '  timeline: [' + blocks.map(function (b) {
              return b[0].trim();
            }).join(', ') + ']';
            if (one.length <= 96) return [one];
          }
          var out = ['  timeline: ['];
          blocks.forEach(function (b, i) {
            b.forEach(function (l, j) {
              out.push(l + (i < blocks.length - 1 && j === b.length - 1 ? ',' : ''));
            });
          });
          out.push('  ]');
          return out;
        }

        // A custom node parameter REPLACES the generated one of the same name.
        // Two keys in one object literal is valid JavaScript that keeps the
        // last, so a written parameter has to overwrite rather than sit beside
        // it and quietly win.
        // The match is by key, and `repetitions`, `loop_function` and
        // `conditional_function` are three different keys. jsPsych nests them
        // — loop_function repeats INSIDE each repetition — so none of them can
        // displace another. This is also what keeps a written `loop_function`
        // to a single key when the phase settings generate one.
        function _applyCustomProps(props, list) {
          if (!Array.isArray(list)) return props;
          var out = props.slice();
          list.forEach(function (e) {
            var key = String((e && e.name) || '').trim();
            var src = String(e && e.src == null ? '' : e.src).trim();
            if (!key || !src || !/^[A-Za-z_$][\w$]*$/.test(key)) return;
            var hit = -1;
            out.forEach(function (prop, i) {
              if (prop.length && prop[0].replace(/^\s+/, '').indexOf(key + ':') === 0) hit = i;
            });
            if (hit >= 0) out[hit] = ['  ' + key + ': ' + src];
            else out.push(['  ' + key + ': ' + src]);
          });
          return out;
        }

        // The phase settings as emitted properties, indented.
        function _nodeParamProps(ph, factored) {
          return _phaseNodeParams(ph, factored).map(function (p) { return ['  ' + p]; });
        }

        // One jsPsych node per phase. When the phase's trials are one procedure
        // with different values, that is what is emitted: a `timeline_variables`
        // table the trials' values were lifted into. Otherwise the trials are
        // declared and collected into the node's `timeline`, which is the shape
        // the jsPsych timeline docs use for a block of trials.
        //
        // Either way it is semantically a pass-through: a node with no node-level
        // parameters runs its children exactly as pushing them one at a time
        // would (same order, same `trial_index`, and the node itself records no
        // data). What the node buys is that the generated code mirrors the
        // canvas, and that each phase has a named place to add `repetitions` /
        // `sample` / `conditional_function` by hand.
        var _phaseSlugs = {};
        editor.phases.forEach(function (ph, phi) {
          code += '// ── ' + _stripEmoji(ph.name) + ' (' + (phi + 1) + '/' + editor.phases.length + ') ──\n';
          var phaseSlug = _uniqueSlug(_slugify(ph.name), _phaseSlugs);
          // Each trial is compiled into a buffer first, because the phase cannot
          // be emitted until it is known whether its trials are one procedure
          // with different values (see _factorPhase) or just trials.
          var phaseParts = [];
          ph.timeline.forEach(function (t, ti) {
            // The previews render one trial. Compiling just that one — through
            // the same compiler, so the object is the one the export contains —
            // rather than rebuilding it by hand, which is the drift this whole
            // path was rewritten to remove.
            if (opts.only && t.id !== opts.only) return;
                  // --- Classify components ---
      var stims = [],
        respType = null,
        respInfo = {},
        logic = { loop: null, hints: [], trial_duration: 0 };
      var preStims = [], postStims = [];
      // fixation is a *timed segment*: it becomes its own jsPsych trial inside
      // the node's timeline, so its duration actually takes effect. (Previously
      // it was folded into the stimulus HTML and the duration was recorded but
      // never emitted.)
      var preTiming = [], postTiming = [], seenVisual = false;
      t.components.forEach(function (c) {
        // One response plugin per trial, so only the FIRST response component is
        // compiled. Without this guard the later ones overwrote respInfo field
        // by field while respType kept the first — a keyboard plugin carrying a
        // button's `choices`. New trials cannot reach this state any more
        // (addComponent splits them into their own trial), but a project saved
        // before that guard can, and silently generating a broken trial from it
        // is not a thing to leave lying around.
        if (respType && ['keyboard', 'button', 'slider', 'textInput', 'animation']
            .indexOf(c.type) >= 0) {
          return;
        }
        if (c.type === 'fixation') {
          // Keep the component itself: its own renderer supplies the look
          // (e.g. the fixation cross is 60px #ccc), so a trimmed {kind,duration}
          // would silently lose that styling.
          if (seenVisual) { postTiming.push(c); } else { preTiming.push(c); }
          return;
        }
        var isStim = ['text', 'shape', 'image', 'audio', 'video'].indexOf(c.type) >= 0;
        if (isStim) {
          seenVisual = true;
          preStims.push(c);
          stims.push(c);
          return;
        }
        if (c.type === 'keyboard') {
          respType = 'keyboard';
          respInfo = respInfo || {};
          respInfo.choices = _keys(c);
          respInfo.correctKey = c.correctKey || '';
          respInfo.prompt = c.prompt || '';
          respInfo.stimulusDuration = c.stimulus_duration;
          respInfo.responseEndsTrial = !(c.response_ends_trial === false ||
            c.response_ends_trial === 'false');
          respInfo.waitForKeyRelease = (c.wait_for_key_release === true ||
            c.wait_for_key_release === 'true');
          if (c.trial_duration) logic.trial_duration = Math.max(logic.trial_duration || 0, c.trial_duration);
        } else if (c.type === 'button') {
          // Runs on jsPsychHtmlButtonResponse — every field below is emitted
          // verbatim as the plugin parameter of the same name.
          if (!respType) respType = 'button';
          respInfo = respInfo || {};
          respInfo.choices = (Array.isArray(c.choices) ? c.choices : [])
            .map(function (x) { return String(x).trim(); })
            .filter(function (x) { return x; });
          respInfo.prompt = c.prompt || '';
          respInfo.buttonLayout = c.button_layout || 'grid';
          respInfo.gridRows = c.grid_rows;
          respInfo.gridColumns = c.grid_columns;
          respInfo.trialDuration = c.trial_duration;
          respInfo.stimulusDuration = c.stimulus_duration;
          // The inspector stores select values as strings, so accept both forms.
          respInfo.responseEndsTrial = !(c.response_ends_trial === false ||
            c.response_ends_trial === 'false');
          respInfo.enableButtonAfter = c.enable_button_after;
        } else if (c.type === 'animation') {
          // Runs on jsPsychAnimation. It takes over the display element, so it
          // is emitted as the whole trial rather than as a parameter of one.
          if (!respType) respType = 'animation';
          respInfo = respInfo || {};
          respInfo.frames = (Array.isArray(c.frames) ? c.frames : [])
            .filter(function (f) { return f && f.fileData; });
          respInfo.frameTime = c.frame_time;
          respInfo.frameIsi = c.frame_isi;
          respInfo.sequenceReps = c.sequence_reps;
          respInfo.animChoices = _keys(c);
          respInfo.renderOnCanvas = !(c.render_on_canvas === false ||
            c.render_on_canvas === 'false');
          respInfo.prompt = c.prompt || '';
        } else if (c.type === 'slider') {
          // Runs on jsPsychHtmlSliderResponse — every field below is emitted
          // verbatim as the plugin parameter of the same name.
          if (!respType) respType = 'slider';
          respInfo = respInfo || {};
          respInfo.min = c.min;
          respInfo.max = c.max;
          respInfo.step = c.step;
          respInfo.sliderStart = c.slider_start;
          respInfo.labels = (Array.isArray(c.labels) ? c.labels : [])
            .map(function (x) { return String(x); })
            .filter(function (x) { return x !== ''; });
          respInfo.buttonLabel = c.button_label || '';
          respInfo.sliderWidth = c.slider_width;
          respInfo.requireMovement = (c.require_movement === true ||
            c.require_movement === 'true');
          respInfo.prompt = c.prompt || '';
          respInfo.stimulusDuration = c.stimulus_duration;
          respInfo.responseEndsTrial = !(c.response_ends_trial === false ||
            c.response_ends_trial === 'false');
        } else if (c.type === 'textInput') {
          // Runs on jsPsychSurveyText. The question text lives here rather than
          // in the stimulus, and the plugin brings its own submit button.
          if (!respType) respType = 'textInput';
          respInfo = respInfo || {};
          respInfo.question = {
            // Always a string: the plugin prints <p>prompt</p> unconditionally.
            prompt: c.prompt == null ? '' : String(c.prompt),
            placeholder: c.placeholder == null ? '' : String(c.placeholder),
            name: c.name ? String(c.name) : 'Q0',
            required: (c.required === true || c.required === 'true'),
            rows: Number(c.rows) || 1,
            columns: Number(c.columns) || 40,
          };
          respInfo.buttonLabel = c.button_label || '';
          respInfo.autocomplete = (c.autocomplete === true || c.autocomplete === 'true');
        }
      });
// Default: any-key to continue (for instructions / feedback / stimulus-only).
            // This used to emit `choices: [' ']` — space only — while the prompt
            // said "press any key". ALL_KEYS is the jsPsych way to say what was
            // meant.
            var _noResponseComponent = false;
            if (!respType) {
              respType = 'keyboard';
              _noResponseComponent = true;
              // No explicit choices: the plugin's default is already "any key".
              if (stims.length > 0) respInfo = {};
            }

            // A jsPsych trial runs exactly one response plugin, so a trial carrying
            // several response components can only emit one of them. Say so loudly
            // instead of dropping the rest silently.
            var respComps = t.components.filter(function (c) {
              return ['keyboard', 'button', 'slider', 'textInput'].indexOf(c.type) >= 0;
            });
            if (respComps.length > 1) {
              logic.hints.push('// !! This trial has ' + respComps.length +
                ' response components (' + respComps.map(function (c) { return c.type; }).join(', ') +
                '), but a jsPsych trial runs a single response plugin.');
              logic.hints.push('// !! Only "' + respType + '" was generated. Split the others into ' +
                'their own trials if you need to capture all responses.');
            }

            // jsPsychAnimation clears the display element every frame, so nothing
            // else can share its trial — say so rather than dropping silently.
            if (t.components.some(function (c) { return c.type === 'animation'; })) {
              var _animOthers = t.components.filter(function (c) {
                return c.type !== 'animation';
              });
              if (_animOthers.length) {
                logic.hints.push('// !! This trial mixes an animation with ' + _animOthers.length +
                  ' other component(s) (' + _animOthers.map(function (c) { return c.type; }).join(', ') +
                  '). The animation plugin clears the display each frame, so those will not appear.');
              }
            }

            // survey-text has no trial_duration at all (no setTimeout anywhere in
            // the plugin), so a timed free-text question cannot auto-advance.
            // Checked here, before the hints are written out above the trial.
            if (respType === 'textInput') {
              var _wantedDuration = logic.trial_duration || t.trial_duration;
              if (_wantedDuration) {
                logic.hints.push('// !! This trial sets a ' + _wantedDuration + 'ms Trial Duration, but ' +
                  'survey-text has no trial_duration parameter — the question waits for the ' +
                  'participant to submit.');
              }
            }

            // An image-only trial runs on the dedicated image plugin, the way the
            // official RT-task demo does. One other visual component — a caption,
            // a shape — and the trial falls back to the HTML path, because the
            // image plugins take the picture as `stimulus` and nothing else.
            var imageOnlyComp = (stims.length === 1 && stims[0].type === 'image' &&
              _mediaRef(stims[0])) ? stims[0] : null;
            var useImagePlugin = !!imageOnlyComp && !!_imagePlugins[respType];

            // Semantic, stable names in the generated code: the phase name plus
            // the trial's index within that phase.
            var trialName = phaseSlug + '_trial_' + (ti + 1);
            var pname = pluginName(respType, useImagePlugin);

            // ---- jsPsychAnimation owns the display element, so it is emitted as
            // the whole trial rather than as one parameter among others. ----
            if (respType === 'animation') {
              var _out = '';
              var _fr = respInfo.frames || [];
              if (!_fr.length) {
                logic.hints.push('// !! This animation has no frames uploaded — nothing to play.');
              }
              logic.hints.forEach(function (h) { _out += h + '\n'; });
              // ExpVis carries no node-level parameters, so every trial is a flat
              // trial. Provenance data and the ALL_KEYS default are left out too.
              var _a = '  ';
              _out += 'var ' + trialName + ' = {\n';
              _out += _a + 'type: jsPsychAnimation,\n';
              _out += _a + 'stimuli: [' + _fr.map(function (f) {
                return "'" + _assetHref(f.fileName, 'image', f.fileData) + "'";
              }).join(', ') + '],\n';
              _out += _a + 'frame_time: ' + (respInfo.frameTime || 250) + ',\n';
              if (respInfo.frameIsi) _out += _a + 'frame_isi: ' + respInfo.frameIsi + ',\n';
              if (respInfo.sequenceReps && respInfo.sequenceReps !== 1) {
                _out += _a + 'sequence_reps: ' + respInfo.sequenceReps + ',\n';
              }
              // "ALL_KEYS" is the plugin default, so only a named key list is written.
              if (respInfo.animChoices !== 'ALL_KEYS') {
                _out += _a + 'choices: [' + respInfo.animChoices.map(function (k) {
                  return '"' + String(k).replace(/"/g, '\\"') + '"';
                }).join(', ') + '],\n';
              }
              if (respInfo.prompt) _out += _a + "prompt: '" + _jsStr(String(respInfo.prompt)) + "',\n";
              if (!respInfo.renderOnCanvas) _out += _a + 'render_on_canvas: false,\n';
              // strip the trailing comma off the last property
              _out = _out.replace(/,\n$/, '\n');
              _out += '};\n\n';
              // jsPsychAnimation owns the display element, so it is emitted as a
              // whole trial with no properties to lift into a variable table —
              // a phase of animations never factors.
              // `name` matters as much as `text`: the node collects its trials by
              // name, and without one the declaration below is emitted and never
              // referenced — the animation is declared and never runs.
              phaseParts.push({kind: 'raw', text: _out, name: trialName});
              return; // this trial is complete
            }

            // --- Build stimulus HTML ---
            // Every visual component shares the trial's one screen, which stays up
            // until the participant answers — or, with no response component, until
            // any key. That is exactly what a trial with no trial_duration does in
            // hand-written jsPsych.
            var preHTML = preStims.map(function (c) { return compHTML(c); }).join('');
            // Flow container: components stack in a flex column. jsPsych's own
            // `.jspsych-content-wrapper { margin:auto }` already centres this block,
            // so no justify-content is needed here — and `min-height` actively hurt,
            // because the plugin's buttons are appended AFTER this block and got
            // pushed away from their stimulus. gap + align-items do the real work:
            // gap spaces the components, align-items centres fixed-width ones.
            // Neither dimension is pinned here any more. The width is
            // `experiment_width` on initJsPsych, so the stage fills the content
            // element without repeating the device number in every trial's
            // markup. The height is not set here OR on the display element: the
            // plugins append their own controls *after* the stimulus, and a stage
            // as tall as the device would push buttons and sliders off-screen.
            var _bodyHTML = preHTML + postStims.map(function(c){return compHTML(c);}).join('');
            var fullStimHTML = _jsStr(_stage(_bodyHTML));

            // Where the correct answer comes from. Recorded into the trial's `data`
            // so the export is directly analysable, and used to score the trial.
            // `correctKey` is not a jsPsych parameter — it is ExpVis scoring, and
            // computing data.correct in on_finish is the idiom the official docs
            // use for exactly this.
            var correctResponseExpr = respInfo.correctKey
              ? "'" + String(respInfo.correctKey).replace(/'/g, "\\'") + "'"
              : null;

            // --- Generate trial object ---
            var lines = [];
            function L(indent, str) {
              lines.push('  '.repeat(indent) + str);
            }
            // Every property is recorded as it is written, so that a phase whose
            // trials are the same procedure with different values can be
            // re-rendered as one procedure plus a table of those values. Recorded
            // at the point of emission rather than parsed back out of the finished
            // text: this file's history is a list of bugs from two places holding
            // separate opinions about one thing.
            var slots = [];
            // A timing trial lives inside the node's own `timeline`, where it can
            // have a `stimulus` of its own, so its properties are path-qualified.
            var _slotPrefix = '';
            var _timingN = 0;
            // `block` emits a value that spans lines (on_finish, questions); `val`
            // is then whatever was emitted, which is all the diff needs — a
            // substitution always collapses the property back to one line.
            function P(indent, key, val, block) {
              var from = lines.length;
              if (block) block(); else L(indent, key + ': ' + val + ',');
              slots.push({
                path: _slotPrefix ? _slotPrefix + '.' + key : key,
                key: key,
                indent: indent,
                from: from,
                to: lines.length,
                val: block ? lines.slice(from).join('\n') : val,
              });
            }

            // Hints for remaining unsupported logic ride along with the trial they
            // are about, so they stay next to it however the phase is emitted.
            var _trialHints = logic.hints.slice();

            // A node holding exactly one trial and carrying no node-level
            // parameters IS just a trial, so it is emitted flat — the shape
            // hand-written jsPsych uses. A wrapper is needed only when the node
            // really holds more than one trial, i.e. when it has extra timed
            // segments around the stimulus.
            var _plainNode = preTiming.length === 0 && postTiming.length === 0;
            // A trial needs a screen to show or a response to collect. Without
            // either, its timed segments are the whole of it — and with no timed
            // segments either, it is an unfilled trial, which is what "+ Add
            // Trial" leaves behind and contributes nothing to run.
            var _hasScreen = stims.length > 0 || !_noResponseComponent;
            if (!_hasScreen && _plainNode) {
              phaseParts.push({kind: 'skip', name: trialName, note: _emptyTrialNote(trialName)});
              return;
            }

            L(0, 'var ' + trialName + ' = {');

            // --- node timeline: timed segments around the stimulus trial ---
            if (!_plainNode) L(1, 'timeline: [');
            var ei = _plainNode ? 1 : 2;
            // A fixed-duration trial that waits for nothing.
            function emitTimingTrial(c) {
              _usedPlugins['jsPsychHtmlKeyboardResponse'] = true;
              // fixation renders its cross through the normal component renderer
              // (so font size / colour are preserved); delay is a blank wait.
              var stim = compHTML(c);
              _slotPrefix = 'timing.' + (_timingN++);
              L(ei, '{');
              P(ei + 1, 'type', 'jsPsychHtmlKeyboardResponse');
              P(ei + 1, 'stimulus', "'" + _jsStr(_stage(stim)) + "'");
              P(ei + 1, 'choices', "'NO_KEYS'");
              // A Max > Min range turns the duration into a dynamic parameter, the
              // same idiom the jsPsych rt-task demo uses for its jittered fixation.
              var _lo = Number(c.durationMin) || 0, _hi = Number(c.durationMax) || 0;
              if (_hi > _lo) {
                var _step = Number(c.durationStep) || 250;
                var _vals = [];
                for (var _v = _lo; _v <= _hi; _v += _step) _vals.push(_v);
                if (_vals[_vals.length - 1] !== _hi) _vals.push(_hi);
                P(ei + 1, 'trial_duration', null, function () {
                  L(ei + 1, 'trial_duration: function () {');
                  L(ei + 2, 'return jsPsych.randomization.sampleWithoutReplacement(' +
                            JSON.stringify(_vals) + ', 1)[0];');
                  L(ei + 1, '},');
                });
              } else {
                P(ei + 1, 'trial_duration', String(c.trial_duration || 0));
              }
              L(ei, '},');
              _slotPrefix = '';
            }
            preTiming.forEach(emitTimingTrial);


            if (_hasScreen) {
            if (!_plainNode) L(ei, '{');
            var indent = _plainNode ? 1 : ei + 1;
            P(indent, 'type', pname);
            // survey-text has no `stimulus` — its equivalent is `preamble`, the
            // HTML shown above the questions.
            var _stimKey = respType === 'textInput' ? 'preamble' : 'stimulus';
            {
              if (useImagePlugin) {
                // The picture itself, as the image plugins expect.
                P(indent, 'stimulus', "'" + _assetHref(
                  imageOnlyComp.fileName, imageOnlyComp.type, imageOnlyComp.fileData) + "'");
              } else if (preHTML || postStims.length > 0) {
                P(indent, _stimKey, "'" + fullStimHTML + "'");
              } else {
                // Every one of these plugins writes the value straight into the
                // page — `'<div …>' + trial.stimulus + '</div>'` — so leaving it
                // out puts the literal word "undefined" on the participant's
                // screen. survey-text is the same with `preamble`, and its guard
                // is `!== null`, which an absent property does not satisfy.
                //
                // A trial can reach here with nothing to show: a keyboard wait
                // after a fixation, a survey with no preamble, or a trial with no
                // components at all. An empty string is what "nothing" looks like.
                P(indent, _stimKey, "''");
              }
              if (respInfo.choices === 'ALL_KEYS') {
                // "ALL_KEYS" is the plugin's own default, so it is left out — the
                // trial behaves identically and the code reads like hand-written
                // jsPsych. A named key list still has to be written out.
              } else if (respInfo.choices && respInfo.choices.length) {
                P(indent, 'choices', '[' + respInfo.choices.map(function (x) { return '"' + x + '"'; }).join(',') + ']');
              }
            }
            // ---- jsPsychHtmlButtonResponse parameters, emitted under their own
            // names. Anything left at 0 / default is omitted, so jsPsych applies
            // its documented default instead of an ExpVis invention.
            if (respType === 'button') {
              if (respInfo.prompt) P(indent, 'prompt', "'" + _jsStr(String(respInfo.prompt)) + "'");
              if (respInfo.buttonLayout) P(indent, 'button_layout', "'" + respInfo.buttonLayout + "'");
              if (respInfo.gridRows) P(indent, 'grid_rows', String(respInfo.gridRows));
              if (respInfo.gridColumns) P(indent, 'grid_columns', String(respInfo.gridColumns));
              if (respInfo.stimulusDuration) P(indent, 'stimulus_duration', String(respInfo.stimulusDuration));
              if (respInfo.enableButtonAfter) P(indent, 'enable_button_after', String(respInfo.enableButtonAfter));
              // `=== false`, not `!x`: a trial with no response component gets a
              // fresh respInfo, and `!undefined` would wrongly emit a false here.
              if (respInfo.responseEndsTrial === false) P(indent, 'response_ends_trial', 'false');
            }
            if (respType === 'textInput') {
              var _q = respInfo.question;
              P(indent, 'questions', null, function () {
                L(indent, 'questions: [{');
                L(indent + 1, "prompt: '" + _jsStr(_q.prompt) + "',");
                if (_q.placeholder) L(indent + 1, "placeholder: '" + _jsStr(_q.placeholder) + "',");
                L(indent + 1, "name: '" + _q.name.replace(/'/g, "\\'") + "',");
                if (_q.required) L(indent + 1, 'required: true,');
                if (_q.rows > 1) L(indent + 1, 'rows: ' + _q.rows + ',');
                if (_q.columns !== 40) L(indent + 1, 'columns: ' + _q.columns + ',');
                L(indent, '}],');
              });
              if (respInfo.buttonLabel)
                P(indent, 'button_label', "'" + _jsStr(String(respInfo.buttonLabel)) + "'");
              if (respInfo.autocomplete) P(indent, 'autocomplete', 'true');
            }
            if (useImagePlugin) {
              var _imc = imageOnlyComp;
              if (_imc.stimulus_width) P(indent, 'stimulus_width', String(_imc.stimulus_width));
              if (_imc.stimulus_height) P(indent, 'stimulus_height', String(_imc.stimulus_height));
              if (_imc.maintain_aspect_ratio === false || _imc.maintain_aspect_ratio === 'false')
                P(indent, 'maintain_aspect_ratio', 'false');
              if (_imc.render_on_canvas === false || _imc.render_on_canvas === 'false')
                P(indent, 'render_on_canvas', 'false');
            }
            if (respType === 'keyboard') {
              if (respInfo.stimulusDuration) P(indent, 'stimulus_duration', String(respInfo.stimulusDuration));
              if (respInfo.responseEndsTrial === false) P(indent, 'response_ends_trial', 'false');
              if (respInfo.waitForKeyRelease) P(indent, 'wait_for_key_release', 'true');
            }
            if (respType === 'slider') {
              if (respInfo.min != null) P(indent, 'min', String(respInfo.min));
              if (respInfo.max != null) P(indent, 'max', String(respInfo.max));
              if (respInfo.step != null) P(indent, 'step', String(respInfo.step));
              if (respInfo.sliderStart) P(indent, 'slider_start', String(respInfo.sliderStart));
              if (respInfo.labels && respInfo.labels.length)
                P(indent, 'labels', '[' + respInfo.labels.map(function (x) {
                  return '"' + String(x).replace(/"/g, '\\"') + '"';
                }).join(', ') + ']');
              if (respInfo.buttonLabel) P(indent, 'button_label', "'" + _jsStr(String(respInfo.buttonLabel)) + "'");
              if (respInfo.sliderWidth) P(indent, 'slider_width', String(respInfo.sliderWidth));
              if (respInfo.requireMovement) P(indent, 'require_movement', 'true');
              if (respInfo.prompt) P(indent, 'prompt', "'" + _jsStr(String(respInfo.prompt)) + "'");
              if (respInfo.stimulusDuration) P(indent, 'stimulus_duration', String(respInfo.stimulusDuration));
              if (respInfo.responseEndsTrial === false) P(indent, 'response_ends_trial', 'false');
            }
            // trial_duration is the same jsPsych parameter for either plugin; a
            // button trial reads it off the button component, everything else off
            // the keyboard component.
            var _trialDuration = (respType === 'button' ? respInfo.trialDuration : logic.trial_duration) ||
              t.trial_duration;
            if (_trialDuration && respType !== 'textInput') {
              P(indent, 'trial_duration', String(_trialDuration));
            }
            // Only ever the researcher's own words. The canned "press any key"
            // fallback that used to live here is gone: the only trials that
            // reached it were ones with nothing to show and nothing to ask, and
            // those no longer produce a response trial at all.
            if (respType === 'keyboard' && respInfo.prompt)
              P(indent, 'prompt', "'" + _jsStr(respInfo.prompt) + "'");

            // --- scoring ---
            // `data` is written only when it carries something the analysis needs.
            // Provenance fields are not added automatically: jsPsych records
            // trial_index and trial_type on its own.
            var hasScore = !!correctResponseExpr;
            if (correctResponseExpr) {
              P(indent, 'data', '{correct_response: ' + correctResponseExpr + '}');
              P(indent, 'on_finish', null, function () {
                L(indent, 'on_finish: function(data) {');
                L(indent + 1, 'data.correct = jsPsych.pluginAPI.compareKeys(data.response, data.correct_response);');
                L(indent, '},');
              });
            }
            // --- custom parameters ---
            // Values the researcher wrote as JavaScript, emitted under the name
            // they chose. An override REPLACES the property the compiler would
            // have written rather than being emitted beside it: two `stimulus:`
            // keys in one object literal is valid JavaScript that keeps the last
            // one, so the experiment would quietly run something other than what
            // the file appears to say.
            if (Array.isArray(t.custom)) {
              t.custom.forEach(function (entry) {
                var key = String((entry && entry.name) || '').trim();
                var src = String(entry && entry.src == null ? '' : entry.src).trim();
                if (!key || !src || !/^[A-Za-z_$][\w$]*$/.test(key)) return;
                var hit = null;
                slots.forEach(function (sl) { if (sl.key === key) hit = sl; });
                if (hit) {
                  for (var i = hit.from + 1; i < hit.to; i++) lines[i] = null;
                  // The scoring key the generated on_finish reads has to survive
                  // a `data` override, or every response scores incorrect.
                  if (key === 'data' && correctResponseExpr)
                    src = _withCorrectResponse(src, correctResponseExpr);
                  lines[hit.from] = '  '.repeat(hit.indent) + key + ': ' + src + ',';
                  hit.val = src;
                } else {
                  lines.push('  '.repeat(indent) + key + ': ' + src + ',');
                  slots.push({path: _slotPrefix ? _slotPrefix + '.' + key : key, key: key,
                              indent: indent, from: lines.length - 1, to: lines.length,
                              val: src});
                }
              });
              lines = lines.filter(function (l) { return l !== null; });
            }

            // strip the trial's trailing property comma, then close the entry
            var last = lines[lines.length - 1];
            if (last.slice(-1) === ',') lines[lines.length - 1] = last.slice(0, -1);
            if (!_plainNode) L(ei, '},');
            }  // end of the response trial

            postTiming.forEach(emitTimingTrial);

            // strip the trailing comma of the last timeline entry
            var tlLast = lines[lines.length - 1];
            if (tlLast.slice(-1) === ',') lines[lines.length - 1] = tlLast.slice(0, -1);

            if (!_plainNode) L(1, ']');
            L(0, '};');

            phaseParts.push({
              kind: 'trial', name: trialName, lines: lines, slots: slots,
              hints: _trialHints, plain: _plainNode,
              // A trial of several jsPsych trials — a fixation then the screen —
              // contributes those trials directly to the phase's timeline. It
              // used to be wrapped in a node of its own and referred to by name,
              // which put a `timeline` inside a `timeline` for no gain: the
              // wrapper carries no parameter, and jsPsych runs the same trials
              // in the same order either way.
              entries: _plainNode ? null : lines.slice(2, -2)   // `  timeline: [` … `  ]` removed
            });
          });

          // Close the phase node. An empty phase contributes nothing to run, so
          // it is noted rather than emitted as an empty `timeline: []`.
          if (phaseParts.length === 0) {
            code += '// (this phase holds no trials, so it adds nothing to the timeline)\n\n';
            _phaseModes.push({id: ph.id, trials: 0, factored: false, slug: phaseSlug});
            return;
          }
          if (!phaseParts.some(function (p) { return p.kind !== 'skip'; })) {
            phaseParts.forEach(function (p) { code += p.note + '\n'; });
            code += '// (this phase adds nothing to the timeline)\n\n';
            _phaseModes.push({id: ph.id, trials: ph.timeline.length, factored: false,
                              uniform: false, mode: ph.conditions ? 'conditions' : 'trials',
                              empty: phaseParts.length, emitted: 0, slug: phaseSlug});
            return;
          }
          var nodeName = phaseSlug + '_timeline';
          // Whether the trials COULD be one procedure, which the settings dialog
          // needs to know before the researcher asks for it — and whether they
          // are being run as one, which is the researcher's call rather than the
          // compiler's.
          //
          // It has to be a call. Two trials that happen to share a shape are
          // indistinguishable from two conditions of one procedure: the data
          // model holds the same thing either way. Inferring the second reading
          // from the first is the compiler asserting an intent nobody expressed,
          // and it rewrites `trial_1, trial_2` into a condition table that the
          // reader then has to read back out. So the default is what the canvas
          // shows — that many trials, in that order — and the table is asked for.
          var uniform = _factorPhase(phaseParts);
          var factored = ph.conditions ? uniform : null;
          var emptyCount = phaseParts.filter(function (p) {
            return p.kind === 'skip';
          }).length;
          _phaseModes.push({id: ph.id, trials: ph.timeline.length, factored: !!factored,
                            uniform: !!uniform, mode: ph.conditions ? 'conditions' : 'trials',
                            empty: emptyCount, emitted: ph.timeline.length - emptyCount,
                            slug: phaseSlug});

          if (factored) {
            var varName = phaseSlug + '_variables';
            code += '// The same procedure once per set of values below.\n';
            code += 'var ' + varName + ' = [\n';
            factored.table.forEach(function (row, i) {
              code += '  {' + Object.keys(row).map(function (k) {
                return k + ': ' + row[k];
              }).join(', ') + '}' + (i < factored.table.length - 1 ? ',' : '') + '\n';
            });
            code += '];\n\n';
            _emitNode(nodeName, _applyCustomProps(
              [_timelineProp(factored.entries), ['  timeline_variables: ' + varName]]
                .concat(_nodeParamProps(ph, true)), ph.custom));
            return;
          }

          // Plain trials: what the canvas shows, declared in order and then
          // collected into the node.
          var blocks = [];
          phaseParts.forEach(function (p) {
            // Said out loud rather than dropped in silence: the canvas shows this
            // trial, so its absence from the file needs an explanation.
            if (p.kind === 'skip') { code += p.note + '\n'; return; }
            // A raw part is a whole trial written out in one go (an animation).
            // It joins the node like any other, or the node's timeline never
            // mentions it. It carries no hints.
            if (p.kind === 'raw') { code += p.text; blocks.push(['    ' + p.name]); return; }
            p.hints.forEach(function (h) { code += h + '\n'; });
            // A trial of several jsPsych trials goes in whole, without a wrapper
            // or a name to refer to it by. Flattening costs the one-to-one
            // between a canvas trial and a line of code, so the trial gets a
            // comment where its declaration would have been — otherwise the
            // numbering appears to skip it.
            if (p.entries) {
              var n = /_(\d+)$/.exec(p.name);
              blocks.push(['    // Trial ' + (n ? n[1] : '')].concat(p.entries));
              return;
            }
            code += p.lines.join('\n') + '\n\n';
            blocks.push(['    ' + p.name]);
          });
          _emitNode(nodeName, _applyCustomProps(
            [_timelineProp(blocks)].concat(_nodeParamProps(ph, false)), ph.custom));
        });

        code += 'jsPsych.run(timeline);\n';
        // The preload trial, now that every component has been scanned. Assets
        // are named by path, so there is nothing to declare first — which is what
        // this block looks like in the jsPsych docs:
        //
        //     timeline.push({ type: jsPsychPreload, images: ['img/blue.png'] });
        //
        // It exists because jsPsych does not preload on its own: the core defines
        // getAutoPreloadList() but never calls it, so without this trial the first
        // image of the experiment is decoded mid-trial.
        var mediaBlock = '';
        if (_assets.length > 0) {
          _usedPlugins['jsPsychPreload'] = true;
          var groups = {images: [], audio: [], video: []};
          _assets.forEach(function (a) {
            var src = _inlineAssets ? a.data : a.path;
            groups[a.type === 'image' ? 'images' : a.type].push("'" + src + "'");
          });
          var entries = [];
          ['images', 'audio', 'video'].forEach(function (k) {
            if (groups[k].length) entries.push('  ' + k + ': [' + groups[k].join(', ') + ']');
          });
          mediaBlock += '// Preload so no trial has to wait for a decode\n';
          mediaBlock += 'timeline.push({\n  type: jsPsychPreload,\n' + entries.join(',\n') + '\n});\n\n';
        }
        code = code.replace('@@MEDIA_PRELOAD@@', mediaBlock);
        return {
          code: code,
          usedPlugins: _usedPlugins,
          phases: _phaseModes,
          // For the export bundle: the file names and bytes behind every path the
          // code now refers to.
          assets: _assets,
        };
      }

      // What the compiler decided about each phase, for the canvas to report.
      // Asked of the compiler rather than worked out again here: a second
      // opinion about whether some trials are "the same procedure" is exactly
      // the duplicate-opinion bug this file has been bitten by repeatedly.
      // It is affordable because building the code is cheap — measured at well
      // under a millisecond for a hundred trials, less than serialising the
      // phases to JSON.
      function phaseModes() {
        try {
          var modes = {};
          (_compileExperiment({}).phases || []).forEach(function (m) { modes[m.id] = m; });
          return modes;
        } catch (e) {
          // A phase card must never fail to draw because a badge could not.
          return {};
        }
      }

      // The path an uploaded file will be referenced by in the generated code, and
      // the folder it will occupy in the published bundle. Shown, not edited: it
      // is derived from the file, so the code and the archive cannot disagree.
      function _assetPathRow(paths) {
        var real = (paths || []).filter(function (p) { return p; });
        if (!real.length) return '';
        return '<p style="font-size:0.65rem;color:var(--text2);margin:0 0 8px;' +
          'font-family:ui-monospace,Menlo,monospace;word-break:break-all">\u2192 ' +
          real.join('<br>\u2192 ') + '</p>';
      }

      // An uploaded file's name, reduced to something safe in a path and in a
      // JS string literal. Leading directories are dropped so a name cannot
      // escape the folder it is put in.
      function _assetBaseName(fileName) {
        return String(fileName || 'asset').replace(/^.*[\\/]/, '')
          .replace(/[^A-Za-z0-9._-]/g, '_').replace(/_+/g, '_')
          .replace(/_+\./g, '.').replace(/^\.+/, '') || 'asset';
      }

      // Where each asset is referenced from, keyed by the bytes it holds. Asked
      // of the compiler so the inspector shows the path the code will actually
      // carry — deriving it a second time is how the two would drift apart, and
      // the archive has to match the code exactly.
      function assetPathsByData() {
        try {
          var map = {};
          (_compileExperiment({}).assets || []).forEach(function (a) { map[a.data] = a.path; });
          return map;
        } catch (e) {
          return {};
        }
      }

      // How a phase's trials compile, in words. The pair matters more than
      // either half: seeing "4 trials · 4 procedures" next to a phase that says
      // "one procedure × 4 conditions" is what tells the reader that making the
      // trials the same shape is what produces a timeline_variables table.
      function _phaseModeLabel(mode) {
        if (!mode || !mode.trials) return 'empty';
        if (mode.factored) return '1 procedure × ' + mode.trials + ' conditions';
        if (mode.mode === 'conditions') return mode.trials + ' trials · not one procedure';
        // Counted as what the file will contain, not what the canvas shows —
        // a phase whose second trial is still blank runs one trial, and the
        // badge is the only place that says so before you export.
        var n = mode.emitted == null ? mode.trials : mode.emitted;
        if (!n) return mode.empty + ' empty';
        return (n === 1 ? '1 trial' : n + ' trials') +
          (mode.empty ? ' · ' + mode.empty + ' empty' : '');
      }
      function _phaseModeTitle(mode) {
        if (!mode || !mode.trials) return 'This phase has no trials';
        if (mode.empty) {
          return mode.empty + ' of these ' + mode.trials + ' trials ' +
            (mode.empty === 1 ? 'is' : 'are') + ' empty — nothing to show and nothing to ' +
            'ask — so ' + (mode.empty === 1 ? 'it is' : 'they are') + ' left out of the ' +
            'timeline. Fill ' + (mode.empty === 1 ? 'it' : 'them') + ' in, or delete ' +
            (mode.empty === 1 ? 'it' : 'them') + '.';
        }
        if (mode.factored) {
          return 'Run as one procedure: these ' + mode.trials + ' trials are the same ' +
            'procedure with different values, so they compile to one timeline_variables ' +
            'table. Turn it off in ⚙ to get them as ' + mode.trials + ' separate trials.';
        }
        if (mode.mode === 'conditions') {
          return 'Asked to run as one procedure, but these trials are not the same shape, ' +
            'so there is no single procedure to hoist. Give them the same response ' +
            'component and the same layout, or run them as separate trials.';
        }
        if (mode.trials === 1) return 'One trial, run once.';
        return mode.trials + ' separate trials, run in this order. ⚙ can run them ' +
          'instead as one procedure × ' + mode.trials + ' conditions' +
          (mode.uniform ? '.' : ' — which needs them to share a shape.');
      }

      // How many trials the phase will actually run, per jsPsych's own rules for
      // each sample type. Null when the answer depends on a function only the
      // researcher can read.
      function _drawnPerRepetition(draft, n) {
        var size = Number(draft.size) || 0;
        if (!draft.sampleType) return n;
        if (draft.sampleType === 'custom') return null;
        if (draft.sampleType === 'fixed-repetitions') return n * (size || 1);
        // sampleWithoutReplacement shuffles and slices, so a size past the
        // number of conditions cannot produce more than there are.
        if (draft.sampleType === 'without-replacement') return Math.min(size, n);
        if (draft.sampleType === 'alternate-groups') {
          var counts = _groupCounts(draft.groups);
          var keys = Object.keys(counts);
          // shuffleAlternateGroups loops over the SMALLEST group, so everything
          // beyond it is dropped rather than run.
          if (keys.length < 2) return n;
          return Math.min.apply(null, keys.map(function (k) { return counts[k]; })) * keys.length;
        }
        return size;
      }
      function _groupCounts(groups) {
        var counts = {};
        (groups || []).forEach(function (g) {
          var k = Math.max(0, Math.round(Number(g) || 0));
          counts[k] = (counts[k] || 0) + 1;
        });
        return counts;
      }
      // The places where a setting produces something other than what it looks
      // like it will. Each of these is jsPsych behaving as documented; none of
      // them surfaces anywhere the researcher would see it, so the dialog says
      // so up front.
      function _sampleWarnings(draft, n) {
        var out = [];
        var size = Number(draft.size) || 0;
        if (draft.sampleType === 'without-replacement' && size > n) {
          out.push('Size is larger than the ' + n + ' conditions. jsPsych logs ' +
            '"Cannot take a sample larger than the size of the set of items to sample" ' +
            'and then runs whatever slice it got.');
        }
        if (draft.sampleType === 'alternate-groups') {
          var counts = _groupCounts(draft.groups);
          var keys = Object.keys(counts);
          if (keys.length < 2) {
            out.push('Everything is in one group. jsPsych warns and falls back to a ' +
              'plain shuffle — give the conditions at least two different group numbers.');
          } else if (keys.some(function (k) { return counts[k] !== counts[keys[0]]; })) {
            var min = Math.min.apply(null, keys.map(function (k) { return counts[k]; }));
            out.push('The groups are uneven, and jsPsych alternates only up to the ' +
              'smallest one (' + min + ' × ' + keys.length + ' = ' + (min * keys.length) +
              ' trials). The rest of the longer groups is dropped.');
          }
        }
        return out;
      }

      // A loop or a condition fails QUIETLY by construction, so the dialog has
      // to say out loud what would otherwise show up only as a participant stuck
      // on one screen, or a block that never ran and left no sign it was meant
      // to. These describe the condition the researcher just built — they do not
      // rewrite it, because "the last trial" is the researcher's choice.
      function _condWarnings(draft, ph) {
        var out = [];
        if (!draft.loop.on && !draft.cond.on) return out;
        var scores = ph.timeline.some(function (t) {
          return (t.components || []).some(function (c) { return !!c.correctKey; });
        });
        if (!scores) {
          var usesCorrect = (draft.loop.on && draft.loop.field === 'correct') ||
            (draft.cond.on && draft.cond.field === 'correct');
          if (usesCorrect) {
            out.push('No trial in this phase has a Correct Key, so `correct` is ' +
              'never recorded. The condition can never come true' +
              (draft.loop.on ? ' — the block will run to its cap every time.' : '.'));
          }
        }
        // A fixation placed AFTER the first visual stimulus is emitted as its
        // own trial at the end of the node's timeline, so it becomes the last
        // row the condition reads — and it carries no response and no score.
        var trailingFixation = ph.timeline.some(function (t) {
          var seenVisual = false;
          return (t.components || []).some(function (c) {
            if (c.type === 'fixation') return seenVisual;
            if (['text', 'shape', 'image', 'audio', 'video'].indexOf(c.type) >= 0) {
              seenVisual = true;
            }
            return false;
          });
        });
        if (trailingFixation) {
          out.push('A trial here ends with a fixation, and that is the last row ' +
            'the condition reads. It records no response and no score — move the ' +
            'fixation before the stimulus, or the condition will read the wrong row.');
        }
        if (draft.loop.on && !(Number(draft.loop.cap) > 0)) {
          out.push('No cap on the loop. jsPsych has none of its own, so a ' +
            'condition that never comes true hangs the session with no way out.');
        }
        if (draft.cond.on && editor.phases.indexOf(ph) === 0) {
          out.push('This is the first phase, so there is no earlier trial for the ' +
            'condition to read. It is false and the whole block is skipped.');
        }
        if (draft.loop.on && Number(draft.repetitions) > 1) {
          out.push('Repetitions and the loop nest: the block runs ' +
            draft.repetitions + ' times, and the loop repeats inside each one. ' +
            'The cap counts across the whole node, not once per repetition.');
        }
        return out;
      }

      // The jsPsych node-level parameters for a phase. They belong to the node,
      // not to a trial or a component, which is why they are not in the trial
      // inspector — and why a phase with no variable table is told to its face
      // that there is nothing here to sample.
      function showPhaseSettings(pid) {
        var ph = editor.phases.filter(function (p) { return p.id === pid; })[0];
        if (!ph) return;
        var mode = phaseModes()[pid];
        var factored = !!(mode && mode.factored);
        var n = ph.timeline.length;
        var sample = ph.sample || {};
        var draft = {
          mode: ph.conditions ? 'conditions' : 'trials',
          repetitions: Number(ph.repetitions) > 1 ? Number(ph.repetitions) : 1,
          sampleType: factored ? (sample.type || '') : '',
          size: sample.size != null ? sample.size : '',
          randomizeOrder: !!ph.randomize_order,
          randomizeGroupOrder: !!sample.randomizeGroupOrder,
          fn: sample.fn || 'function (order) { return order; }',
          groups: ph.timeline.map(function (t) { return t.group == null ? 0 : t.group; }),
          weights: ph.timeline.map(function (t) { return t.weight == null ? 1 : t.weight; }),
          // The two node conditions, as the constructor's own state. `on` lives
          // only here — on the phase, an absent `loop` IS off.
          loop: {
            on: !!ph.loop,
            field: (ph.loop && ph.loop.field) || 'correct',
            op: (ph.loop && ph.loop.op) || 'is',
            value: ph.loop && ph.loop.value != null ? String(ph.loop.value) : 'true',
            cap: ph.loop && ph.loop.cap != null ? ph.loop.cap : 10,
          },
          cond: {
            on: !!ph.cond,
            field: (ph.cond && ph.cond.field) || 'correct',
            op: (ph.cond && ph.cond.op) || 'is',
            value: ph.cond && ph.cond.value != null ? String(ph.cond.value) : 'true',
          },
        };

        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2200;background:rgba(0,0,0,0.4);' +
          'display:flex;align-items:center;justify-content:center';
        var box = document.createElement('div');
        box.style.cssText = 'background:#fff;border-radius:12px;width:560px;max-height:86vh;' +
          'display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.25)';
        overlay.appendChild(box);

        var NUM = 'width:78px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;' +
          'font-family:inherit;font-size:0.78rem';
        var ROW = 'display:flex;align-items:flex-start;gap:10px;padding:7px 0';
        var LBL = 'width:150px;font-size:0.78rem;color:var(--text);padding-top:5px';
        var HINT = 'font-size:0.68rem;color:var(--text2);line-height:1.45;margin-top:3px';

        function head() {
          return '<div style="display:flex;justify-content:space-between;align-items:center;' +
            'padding:14px 20px;border-bottom:1px solid var(--border)">' +
            '<span style="font-weight:700;font-size:0.9rem">⚙ Phase settings · ' +
            _stripEmoji(ph.name) + '</span>' +
            '<button id="ps-close" style="background:none;border:none;font-size:1.1rem;' +
            'cursor:pointer;color:var(--text2)">✕</button></div>';
        }

        // Everything that is not a plain value control is rebuilt on change, so
        // the condition columns and the warnings always describe the settings
        // currently in the form.
        function body() {
          var asConditions = draft.mode === 'conditions';
          var canFactor = factored || (mode && mode.uniform);
          var h = '<div style="padding:14px 20px">';

          // The compiler cannot tell two conditions of one procedure from two
          // trials that happen to look alike, so it does not guess. This is the
          // researcher's call and it is made here.
          h += '<div style="' + ROW + '"><div style="' + LBL + '">Run as</div><div style="flex:1">';
          [['trials', 'Separate trials', n + ' trials, in this order'],
           ['conditions', 'One procedure \u00d7 ' + n + ' conditions',
            'the same procedure once per set of values']].forEach(function (o) {
            var disabled = o[0] === 'conditions' && !canFactor;
            h += '<label style="display:flex;gap:8px;align-items:flex-start;font-size:0.78rem;' +
              'padding:5px 0' + (disabled ? ';opacity:0.45' : ';cursor:pointer') + '">' +
              '<input type="radio" name="ps-mode" value="' + o[0] + '"' +
              (draft.mode === o[0] ? ' checked' : '') + (disabled ? ' disabled' : '') + '>' +
              '<span>' + o[1] + '<br><span style="font-size:0.68rem;color:var(--text2)">' +
              o[2] + '</span></span></label>';
          });
          if (!canFactor && n > 1) {
            h += '<div style="font-size:0.68rem;color:var(--text2);margin-top:4px">' +
              'Not offered: these trials do not share a shape — the same response ' +
              'component and the same layout in each — so no single procedure describes ' +
              'them all.</div>';
          } else if (n === 1) {
            h += '<div style="font-size:0.68rem;color:var(--text2);margin-top:4px">' +
              'A phase with one trial has nothing to vary.</div>';
          }
          h += '</div></div>';
          h += '<div style="border-top:1px solid var(--border);margin:10px 0 4px"></div>';

          if (!asConditions) {
            h += '<div style="background:#f8f8ff;border:1px solid var(--border);' +
              'border-radius:8px;padding:10px 12px;font-size:0.72rem;line-height:1.5;' +
              'color:var(--text2);margin:2px 0 10px">Each trial runs once, in order. ' +
              'Sampling and randomisation belong to a variable table, so they are only ' +
              'available in the other mode.</div>';
          }
          h += '<div style="' + ROW + '"><div style="' + LBL + '">Repetitions</div><div>' +
            '<input id="ps-reps" type="number" min="1" style="' + NUM + '" value="' +
            draft.repetitions + '">' +
            '<div style="' + HINT + '">Runs the whole block this many times. jsPsych draws ' +
            'the sample again on each repetition, which is what makes a fixed number of ' +
            'trials out of a set of conditions.</div></div></div>';

          h += '<div style="border-top:1px solid var(--border);margin:10px 0 4px"></div>';
          h += '<div style="' + ROW + '"><div style="' + LBL + '">Sampling</div><div style="flex:1">';
          h += '<select id="ps-type" ' + (asConditions ? '' : 'disabled ') +
            'style="padding:5px 8px;border:1px solid var(--border);border-radius:6px;' +
            'font-family:inherit;font-size:0.78rem;width:100%">';
          [['', 'None — run every condition once'],
           ['without-replacement', 'Sample without replacement'],
           ['with-replacement', 'Sample with replacement'],
           ['fixed-repetitions', 'Repeat each condition'],
           ['alternate-groups', 'Alternate groups'],
           ['custom', 'Custom function']].forEach(function (o) {
            h += '<option value="' + o[0] + '"' + (draft.sampleType === o[0] ? ' selected' : '') +
              '>' + o[1] + '</option>';
          });
          h += '</select>';
          var needsSize = ['without-replacement', 'with-replacement', 'fixed-repetitions']
            .indexOf(draft.sampleType) >= 0;
          if (needsSize) {
            h += '<div style="margin-top:8px">' +
              '<span style="font-size:0.78rem">' +
              (draft.sampleType === 'fixed-repetitions' ? 'Times each condition' : 'Size') +
              '</span> <input id="ps-size" type="number" min="0" style="' + NUM + ';margin-left:6px" ' +
              'value="' + draft.size + '"></div>';
          }
          if (draft.sampleType === 'custom') {
            h += '<textarea id="ps-fn" spellcheck="false" style="margin-top:8px;width:100%;' +
              'height:62px;padding:7px 9px;border:1px solid var(--border);border-radius:6px;' +
              'font-family:ui-monospace,Menlo,monospace;font-size:0.72rem;line-height:1.5;' +
              'box-sizing:border-box;resize:vertical">' + _escAttr(draft.fn) + '</textarea>' +
              '<div style="' + HINT + '">Given the list of condition indices, return the order ' +
              'to run them in.</div>';
          }
          h += '</div></div>';

          h += '<div style="' + ROW + '"><div style="' + LBL + '"></div><div>' +
            '<label style="font-size:0.78rem;display:flex;gap:7px;align-items:center' +
            (asConditions ? '' : ';opacity:0.45') + '">' +
            '<input id="ps-shuffle" type="checkbox"' + (draft.randomizeOrder ? ' checked' : '') +
            (asConditions ? '' : ' disabled') + '> Randomize the order</label>' +
            '<div style="' + HINT + '">Shuffles what the sampling produced, or the whole ' +
            'condition list when nothing is sampled. Separate from sampling, not instead ' +
            'of it — jsPsych applies both.</div></div></div>';

          // --- the node's own conditions ---
          // Built by the dialog rather than written by hand: both take a
          // function, both fail quietly when wrong, and one of them hangs the
          // session outright. jsPsych offers no limit on a loop, so the cap
          // below is ExpVis's — deliberately visible rather than added behind
          // the researcher's back.
          function _condOpOptions(sel) {
            return ['is', 'is not', 'more than', 'at least', 'less than', 'at most']
              .map(function (o) {
                return '<option value="' + o + '"' + (sel === o ? ' selected' : '') +
                  '>' + o + '</option>';
              }).join('');
          }
          function _condRow(prefix, spec, label, extra, hint) {
            var h = '<div style="' + ROW + '"><div style="' + LBL +
              '"><label style="display:flex;gap:7px;align-items:center;cursor:pointer">' +
              '<input type="checkbox" id="' + prefix + '-on"' +
              (spec.on ? ' checked' : '') + '>' + label + '</label></div>' +
              '<div style="flex:1">';
            if (spec.on) {
              h += '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
                '<input id="' + prefix + '-field" list="ps-cond-fields" value="' +
                _escAttr(spec.field) + '" placeholder="correct" style="' + NUM +
                ';width:104px">' +
                '<select id="' + prefix + '-op" style="' + NUM + ';width:110px">' +
                _condOpOptions(spec.op) + '</select>' +
                '<input id="' + prefix + '-value" value="' + _escAttr(spec.value) +
                '" style="' + NUM + ';width:84px">' + extra + '</div>' +
                '<div style="' + HINT + '">' + hint + '</div>';
            }
            return h + '</div></div>';
          }
          h += '<div style="border-top:1px solid var(--border);margin:12px 0 0"></div>';
          h += '<datalist id="ps-cond-fields"><option value="correct"></option>' +
            '<option value="response"></option><option value="rt"></option></datalist>';
          h += _condRow('ps-loop', draft.loop, 'Repeat this block until',
            (draft.loop.on
              ? '<span style="font-size:0.76rem">at most</span>' +
                '<input id="ps-loop-cap" type="number" min="0" value="' +
                _escAttr(String(draft.loop.cap)) + '" style="' + NUM + '">' +
                '<span style="font-size:0.76rem">times</span>'
              : ''),
            'Repeats while the condition is false, so it reads as “until”. ' +
            'The cap is what keeps a condition that never comes true from ' +
            'hanging the session — jsPsych has none of its own. 0 = no cap. ' +
            'Counted across the node, not once per repetition.');
          h += _condRow('ps-cond', draft.cond, 'Run this block only when', '',
            'Reads the whole experiment’s data — jsPsych passes this function ' +
            'nothing. A false answer skips the block entirely, including its ' +
            'on_timeline_start / on_timeline_finish hooks.');

          // --- node parameters written as JavaScript ---
          // The same control the trial has, one level up. loop_function and
          // conditional_function are NODE parameters: a trial is not a node, so
          // they have nowhere to live in Trial Settings. A name written here
          // replaces whatever the conditions above generate.
          var nodeRows = Array.isArray(ph.custom) ? ph.custom : [];
          h += '<div style="border-top:1px solid var(--border);margin:12px 0 4px"></div>';
          h += '<div style="padding-bottom:8px;display:flex;align-items:center;' +
            'justify-content:space-between">' +
            '<span style="font-size:0.66rem;text-transform:uppercase;letter-spacing:0.05em;' +
            'color:var(--text2);font-weight:700">Node Parameters</span>' +
            '<button type="button" onclick="_addNodeCustom(\'' + ph.id + '\')" ' +
            'style="background:none;border:1px solid var(--border);color:var(--accent);' +
            'cursor:pointer;font-size:0.66rem;padding:2px 8px;border-radius:4px;' +
            'font-family:inherit">+ Add</button></div>';
          if (!nodeRows.length) {
            h += '<p style="font-size:0.66rem;color:var(--text2);line-height:1.5;margin:0">' +
              'Parameters of this node rather than of a trial — <code>loop_function</code> ' +
              'to repeat the block while a condition holds, <code>conditional_function</code> ' +
              'to skip it, <code>on_timeline_start</code> / <code>on_timeline_finish</code> ' +
              'for hooks. A name written here replaces the one the editor generates.</p>';
          }
          nodeRows.forEach(function (row, i) {
            h += '<div style="margin-top:8px;border:1px solid var(--border);border-radius:8px;' +
              'padding:8px">';
            h += '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">' +
              '<input value="' + _escAttr(row.name || '') + '" placeholder="loop_function" ' +
              'onchange="_setNodeCustom(\'' + ph.id + '\',' + i + ',\'name\',this.value)" ' +
              'style="' + _SET_INPUT_CSS + ';flex:1;font-family:ui-monospace,Menlo,monospace">' +
              '<button type="button" onclick="_removeNodeCustom(\'' + ph.id + '\',' + i + ')" ' +
              'title="Remove" style="background:none;border:none;color:var(--red);' +
              'cursor:pointer;font-size:0.7rem;opacity:0.5;padding:0 4px">✕</button></div>';
            h += '<textarea spellcheck="false" placeholder="function (data) { … }" ' +
              'onchange="_setNodeCustom(\'' + ph.id + '\',' + i + ',\'src\',this.value)" ' +
              'style="width:100%;height:76px;padding:6px 8px;border:1px solid var(--border);' +
              'border-radius:6px;font-family:ui-monospace,Menlo,monospace;font-size:0.7rem;' +
              'line-height:1.5;box-sizing:border-box;resize:vertical;background:#fbfbfe">' +
              _escAttr(row.src || '') + '</textarea></div>';
          });

          if (asConditions && n) {
            var groups = _groupCounts(draft.groups);
            var showGroup = draft.sampleType === 'alternate-groups';
            var showWeight = draft.sampleType === 'with-replacement';
            h += '<div style="border-top:1px solid var(--border);margin:10px 0 4px"></div>';
            if (draft.sampleType === 'alternate-groups') {
              h += '<div style="' + ROW + '"><div style="' + LBL + '"></div><div>' +
                '<label style="font-size:0.78rem;display:flex;gap:7px;align-items:center">' +
                '<input id="ps-gorder" type="checkbox"' +
                (draft.randomizeGroupOrder ? ' checked' : '') +
                '> Randomize the order of the groups</label></div></div>';
            }
            if (showGroup || showWeight) {
              h += '<div style="font-size:0.72rem;color:var(--text2);margin:6px 0 4px">' +
                'Conditions <span style="opacity:0.7">(' + n +
                (showGroup ? ' · ' + Object.keys(groups).length + ' groups' : '') + ')</span></div>';
              h += '<div style="max-height:170px;overflow-y:auto;border:1px solid var(--border);' +
                'border-radius:8px">';
              ph.timeline.forEach(function (t, i) {
                h += '<div style="display:flex;align-items:center;gap:10px;padding:5px 10px;' +
                  'font-size:0.75rem;border-bottom:1px solid #f2f2f7">' +
                  '<span style="color:var(--text2);width:22px">' + (i + 1) + '</span>';
                if (showGroup) {
                  h += '<span>group</span><input type="number" min="0" data-group="' + i +
                    '" style="' + NUM + ';width:60px" value="' + draft.groups[i] + '">';
                }
                if (showWeight) {
                  h += '<span>weight</span><input type="number" min="0" step="0.1" data-weight="' +
                    i + '" style="' + NUM + ';width:60px" value="' + draft.weights[i] + '">';
                }
                h += '</div>';
              });
              h += '</div>';
            }
            h += '<div id="ps-notes" style="margin-top:10px">' + notes() + '</div>';
          }
          h += '</div>';
          return h;
        }

        // The live summary and the jsPsych-behaviour warnings.
        function notes() {
          var per = _drawnPerRepetition(draft, n);
          var reps = Math.max(1, Number(draft.repetitions) || 1);
          var h = '';
          var total = per == null ? null : per * reps;
          var plural = function (k, word) { return k + ' ' + word + (k === 1 ? '' : 's'); };
          h += '<div style="font-size:0.72rem;color:var(--text2)">' + plural(n, 'condition') +
            ' → <b style="color:var(--accent)">' +
            (total == null ? 'as many as the function returns' : plural(total, 'trial')) + '</b>' +
            (reps > 1 ? ' (' + per + ' × ' + plural(reps, 'repetition') + ')' : '') + '</div>';
          _sampleWarnings(draft, n).concat(_condWarnings(draft, ph)).forEach(function (w) {
            h += '<div style="margin-top:8px;background:#fef2f2;border:1px solid rgba(239,68,68,0.25);' +
              'border-radius:8px;padding:9px 11px;font-size:0.7rem;line-height:1.5;color:#991b1b">' +
              '⚠ ' + w + '</div>';
          });
          return h;
        }

        function repaint() {
          _repaintPhaseSettings = repaint;
          box.innerHTML = head() +
            '<div style="flex:1;overflow-y:auto">' + body() + '</div>' +
            '<div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 20px;' +
            'border-top:1px solid var(--border)">' +
            '<button id="ps-cancel" class="btn btn-outline" style="font-size:0.78rem">Cancel</button>' +
            '<button id="ps-apply" class="btn btn-primary" style="font-size:0.78rem">Apply</button>' +
            '</div>';
          wire();
        }

        function readFields() {
          var m = box.querySelector('input[name=ps-mode]:checked');
          if (m) draft.mode = m.value;
          var r = document.getElementById('ps-reps');
          if (r) draft.repetitions = Math.max(1, Math.round(Number(r.value) || 1));
          var z = document.getElementById('ps-size');
          if (z) draft.size = z.value;
          var f = document.getElementById('ps-fn');
          if (f) draft.fn = f.value;
          var s = document.getElementById('ps-shuffle');
          if (s) draft.randomizeOrder = s.checked;
          var go = document.getElementById('ps-gorder');
          if (go) draft.randomizeGroupOrder = go.checked;
          box.querySelectorAll('[data-group]').forEach(function (el) {
            draft.groups[Number(el.getAttribute('data-group'))] = el.value;
          });
          box.querySelectorAll('[data-weight]').forEach(function (el) {
            draft.weights[Number(el.getAttribute('data-weight'))] = el.value;
          });
          ['loop', 'cond'].forEach(function (k) {
            var on = document.getElementById('ps-' + k + '-on');
            if (on) draft[k].on = on.checked;
            var f = document.getElementById('ps-' + k + '-field');
            if (f) draft[k].field = f.value.trim();
            var o = document.getElementById('ps-' + k + '-op');
            if (o) draft[k].op = o.value;
            var v = document.getElementById('ps-' + k + '-value');
            if (v) draft[k].value = v.value;
          });
          var cap = document.getElementById('ps-loop-cap');
          if (cap) draft.loop.cap = Math.max(0, Math.round(Number(cap.value) || 0));
        }
        function refreshNotes() {
          var el = document.getElementById('ps-notes');
          if (el) el.innerHTML = notes();
        }

        function close() {
          _repaintPhaseSettings = null;   // the dialog is gone; do not call into it
          overlay.remove();
        }
        function wire() {
          document.getElementById('ps-close').onclick = close;
          document.getElementById('ps-cancel').onclick = close;
          document.getElementById('ps-apply').onclick = function () { apply(); };
          overlay.onclick = function (e) { if (e.target === overlay) close(); };

          var t = document.getElementById('ps-type');
          if (t) t.onchange = function () { readFields(); draft.sampleType = t.value; repaint(); };
          box.querySelectorAll('input[name=ps-mode]').forEach(function (el) {
            el.onchange = function () { readFields(); draft.mode = el.value; repaint(); };
          });
          ['ps-reps', 'ps-size'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.oninput = function () { readFields(); refreshNotes(); };
          });
          ['ps-shuffle', 'ps-gorder'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.onchange = function () { readFields(); };
          });
          box.querySelectorAll('[data-group], [data-weight]').forEach(function (el) {
            el.oninput = function () { readFields(); refreshNotes(); };
          });
          // A checkbox brings its sub-controls in and out, so it repaints;
          // the rest only change what the condition reads, so they do not.
          ['ps-loop-on', 'ps-cond-on'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.onchange = function () { readFields(); repaint(); };
          });
          ['ps-loop-field', 'ps-cond-field', 'ps-loop-value', 'ps-cond-value',
           'ps-loop-cap'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.oninput = function () { readFields(); refreshNotes(); };
          });
          ['ps-loop-op', 'ps-cond-op'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.onchange = function () { readFields(); refreshNotes(); };
          });
        }

        function apply() {
          readFields();
          var asConditions = draft.mode === 'conditions';
          var s = null;
          if (asConditions && draft.sampleType) {
            s = {type: draft.sampleType};
            if (['without-replacement', 'with-replacement', 'fixed-repetitions']
                .indexOf(draft.sampleType) >= 0) {
              s.size = Number(draft.size) || 0;
            }
            if (draft.sampleType === 'alternate-groups') {
              s.randomizeGroupOrder = draft.randomizeGroupOrder;
            }
            if (draft.sampleType === 'custom') {
              // Refuse a function that will not parse rather than writing it into
              // the experiment: the error would otherwise surface in the
              // participant's browser, at run time, as a blank screen.
              try {
                new Function('return (' + draft.fn + ');')();
              } catch (e) {
                alert('That function does not parse:\n\n' + e.message);
                return;
              }
              s.fn = draft.fn;
            }
          }
          var loopSpec = draft.loop.on ? {
            field: draft.loop.field, op: draft.loop.op,
            value: draft.loop.value, cap: draft.loop.cap
          } : null;
          var condSpec = draft.cond.on ? {
            field: draft.cond.field, op: draft.cond.op, value: draft.cond.value
          } : null;
          // Refuse a condition that will not compile rather than writing it into
          // the experiment: the error would otherwise surface in the
          // participant's browser, at run time, as a blank screen.
          if (loopSpec) {
            var loopErr = _jsExpressionError(
              _loopFunctionSrc({loop: loopSpec}), 'loop_function');
            if (loopErr) { alert(loopErr); return; }
          }
          if (condSpec) {
            var condErr = _jsExpressionError(
              _conditionalFunctionSrc({cond: condSpec}), 'conditional_function');
            if (condErr) { alert(condErr); return; }
          }
          saveState();
          ph.loop = loopSpec;
          ph.cond = condSpec;
          ph.conditions = asConditions || undefined;
          if (!asConditions) {
            // The mode is the reason these existed; leaving them behind would be
            // settings that silently do nothing, and switching back would
            // resurrect a configuration nobody remembers making.
            ph.sample = null;
            ph.randomize_order = false;
            ph.repetitions = null;
          } else {
            ph.sample = s;
            ph.randomize_order = draft.randomizeOrder;
            ph.repetitions = draft.repetitions > 1 ? draft.repetitions : null;
          }
          if (draft.sampleType === 'alternate-groups') {
            ph.timeline.forEach(function (tr, i) {
              tr.group = Math.max(0, Math.round(Number(draft.groups[i]) || 0));
            });
          }
          if (draft.sampleType === 'with-replacement') {
            // Only when a weight was actually changed. Writing the default 1 onto
            // every trial would emit `weights: [1, 1, 1]` — uniform, so it means
            // exactly what omitting it means, but it says something the
            // researcher never asked for.
            var weighted = draft.weights.some(function (w) { return Number(w) !== 1; });
            ph.timeline.forEach(function (tr, i) {
              if (weighted) tr.weight = Number(draft.weights[i]) || 1;
              else delete tr.weight;
            });
          }
          close();
          autoSave();
          renderAll();
        }

        document.body.appendChild(overlay);
        repaint();
      }

      // Code export: the compiled experiment as a standalone runnable HTML file.
      function generateCode() {
        var r = _compileExperiment({});
        return _buildJsPsychHTML(r.code, r.usedPlugins);
      }

      // The preview's build. Assets are named by path in the exported code, and
      // a blob URL has no directory for 'img/blue.png' to resolve against, so the
      // preview asks the same compiler for the same experiment with the bytes
      // written in. Nothing else differs — not the trials, not the plugins, not
      // the order. See _jsStr, which is the single place an asset is spelled.
      function generatePreviewFile() {
        var r = _compileExperiment({inlineAssets: true});
        return _buildJsPsychHTML(r.code, r.usedPlugins);
      }

      // ============ jsPsych target version & CDN dependencies ============
      // Pinned to jsPsych v8.3.0 (core). Plugins ship as separate npm packages
      // with their own version numbers. All URLs verified loadable 2026-09-13.
      var _JSPsychVersion = '8.3.0';
      var _jspsychPluginCDN = {
        jsPsychHtmlKeyboardResponse: {pkg: '@jspsych/plugin-html-keyboard-response', ver: '2.2.0'},
        jsPsychHtmlButtonResponse: {pkg: '@jspsych/plugin-html-button-response', ver: '2.1.0'},
        jsPsychHtmlSliderResponse: {pkg: '@jspsych/plugin-html-slider-response', ver: '2.1.0'},
        jsPsychSurveyText: {pkg: '@jspsych/plugin-survey-text', ver: '2.1.1'},
        jsPsychPreload: {pkg: '@jspsych/plugin-preload', ver: '2.1.0'},
        jsPsychAnimation: {pkg: '@jspsych/plugin-animation', ver: '2.1.0'},
        jsPsychImageKeyboardResponse: {pkg: '@jspsych/plugin-image-keyboard-response', ver: '2.2.0'},
        jsPsychImageButtonResponse: {pkg: '@jspsych/plugin-image-button-response', ver: '2.2.0'},
        jsPsychImageSliderResponse: {pkg: '@jspsych/plugin-image-slider-response', ver: '2.1.0'},
      };

      // There is deliberately no rule sizing the display element to the device
      // HEIGHT. It used to be `.jspsych-display-element { min-height: 720px }`,
      // which centred the content in a 720px canvas. On a viewport shorter than
      // that it pushed a 130px stimulus down to top=295 — bottom edge below the
      // fold, where a participant would never think to scroll for it — and on a
      // viewport taller than the device it changed nothing at all. jsPsych
      // centres the content either way (`.jspsych-content { margin: auto }`), so
      // the rule had no effect it could be proud of.
      //
      // The device height is still what the editor's preview frame and the AI
      // prompt's type scale are built from; it just stops being written into the
      // experiment.

      // CDN script tags for the core plus every plugin this experiment actually uses.
      function _cdnTags(usedPlugins) {
        var tags = ['<script src="https://unpkg.com/jspsych@' + _JSPsychVersion + '"><\/script>'];
        Object.keys(_jspsychPluginCDN).forEach(function (n) {
          if (usedPlugins[n]) {
            var p = _jspsychPluginCDN[n];
            tags.push('<script src="https://unpkg.com/' + p.pkg + '@' + p.ver + '"><\/script>');
          }
        });
        return tags;
      }

      // Styles for the published file (participant-facing shell + data panel).
      // Shared <head> for both outputs, so the code export and the published file
      // differ only where they must. `extraStyle` adds a <style> block, and
      // `extraHead` any other tag — the JATOS export is the one caller today,
      // passing the platform's own script tag.
      function _htmlHead(usedPlugins, extraStyle, extraHead) {
        var devName = editor.device ? _stripEmoji(editor.device.name) : 'Default 1280×720';
        var today = new Date().toISOString().slice(0, 10);
        var title = (editor.projectName || 'ExpVis Experiment').replace(/</g, '&lt;');
        var h = '';
        h += '<!doctype html>\n<html lang="en">\n<head>\n';
        h += '  <meta charset="UTF-8">\n';
        h += '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
        h += '  <title>' + title + '</title>\n';
        h += '  <!--\n';
        h += '    Generated by ExpVis on ' + today + ' | Device: ' + devName + '\n';
        h += '    Target: jsPsych v' + _JSPsychVersion + '\n';
        h += '    Save this file and open it in a browser to run the experiment.\n';
        h += '    Docs: https://www.jspsych.org\n';
        h += '    Only the jsPsych plugins used by this experiment are loaded below.\n';
        h += '  -->\n';
        _cdnTags(usedPlugins).forEach(function (t) { h += '  ' + t + '\n'; });
        if (extraHead) h += '  ' + extraHead + '\n';
        h += '  <link href="https://unpkg.com/jspsych@' + _JSPsychVersion +
             '/css/jspsych.css" rel="stylesheet" type="text/css">\n';
        // Only when the caller has something to say. With the device height no
        // longer emitted, a page that has no extra style would otherwise carry
        // an empty <style> block.
        if (extraStyle) h += '  <style>\n' + extraStyle + '  </style>\n';
        h += '</head>\n';
        return h;
      }

      // Wrap experiment logic into a standalone runnable HTML file.
      // Load order matters: plugins read the global `jsPsychModule` while being
      // parsed, so the core script must always come first.
      function _buildJsPsychHTML(code, usedPlugins, opts) {
        // A literal "</script" inside the experiment code would close the inline
        // script tag early; the escaped form is equivalent when parsed as JS.
        var safe = code.replace(/<\/script/gi, '<\\/script');
        // A JATOS component loads the platform's script from an absolute path
        // the server serves — it is not bundled into the .jzip. Nothing needs it
        // elsewhere: the generated on_finish tests for `window.jatos` first, so
        // a page without it simply downloads the data as it always did.
        var h = _htmlHead(usedPlugins, '',
          (opts && opts.jatos) ? '<script src="/assets/javascripts/jatos.js"><\/script>' : '');
        h += '<body>\n';
        h += '  <script>\n';
        h += safe
          .split('\n')
          .map(function (l) {
            return l ? '    ' + l : '';
          })
          .join('\n');
        h += '\n  <\/script>\n';
        h += '</body>\n';
        h += '</html>\n';
        return h;
      }

      function showCodeEditor() {
        var code;
        try { code = generateCode(); } catch(e) { code = '/* Generation failed: ' + e.message + ' */'; }
        var overlay = document.createElement('div');
        overlay.style.cssText =
          'position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center';
        var box = document.createElement('div');
        box.style.cssText =
          'background:#1e1e2e;border-radius:12px;width:680px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3)';
        box.innerHTML =
          '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.08)"><span style="color:#cdd6f4;font-weight:700;font-size:0.9rem">📋 jsPsych Code</span><div style="display:flex;gap:8px"><button id="code-copy-btn" style="padding:6px 14px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:#a6adc8;cursor:pointer;font-size:0.75rem;transition:all 0.15s">📋 Copy</button><button id="code-close-btn" style="padding:6px 14px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:#a6adc8;cursor:pointer;font-size:0.75rem">✕</button></div></div><textarea id="code-editor-area" style="flex:1;background:#181825;color:#cdd6f4;border:none;padding:16px 20px;font-family:\'JetBrains Mono\',\'Fira Code\',monospace;font-size:0.78rem;line-height:1.6;resize:none;min-height:420px;outline:none;tab-size:2" spellcheck="false">' +
          code +
          '</textarea>';
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        overlay.onclick = function (e) {
          if (e.target === overlay) overlay.remove();
        };
        document.getElementById('code-close-btn').onclick = function () {
          overlay.remove();
        };
        document.getElementById('code-copy-btn').onclick = function () {
          var ta = document.getElementById('code-editor-area');
          ta.select();
          navigator.clipboard.writeText(ta.value).then(function () {
            var b = document.getElementById('code-copy-btn');
            b.textContent = '✓ Copied';
            b.style.color = '#a6e3a1';
            setTimeout(function () {
              b.textContent = '📋 Copy';
              b.style.color = '#a6adc8';
            }, 2000);
          });
        };
      }


      function showAIGenerate() {
        var dev = editor.device || {w: 1280, h: 720};
        var providerId = localStorage.getItem('ve_ai_provider') || 'deepseek';
        var model = localStorage.getItem('ve_ai_model') || '';
        var customEp = localStorage.getItem('ve_ai_endpoint_custom') || '';

        var overlay = document.createElement('div');
        overlay.style.cssText =
          'position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;font-family:sans-serif';
        overlay.onclick = function (e) {
          if (e.target === overlay) overlay.remove();
        };

        // Build provider selector HTML
        var providerOpts = '';
        var providerKeys = Object.keys(_aiProviders);
        for (var i = 0; i < providerKeys.length; i++) {
          var pid = providerKeys[i];
          var pn = _aiProviders[pid].name;
          providerOpts += '<option value="' + pid + '"' + (pid === providerId ? ' selected' : '') + '>' + pn + '</option>';
        }

        var currentProvider = _getAIProvider(providerId);
        var currentModel = model || currentProvider.defaultModel || '';
        var modelOpts = '';
        if (currentProvider.isCustom) {
          modelOpts = '<input id="ai-custom-model" value="' + currentModel.replace(/"/g, '&quot;') + '" placeholder="model name" style="width:100%;padding:8px 12px;border:1px solid #e0e0e8;border-radius:8px;font-size:0.78rem;font-family:monospace;outline:none">';
        } else if (currentProvider.models && currentProvider.models.length > 0) {
          for (var j = 0; j < currentProvider.models.length; j++) {
            var mn = currentProvider.models[j];
            modelOpts += '<option value="' + mn + '"' + (mn === currentModel ? ' selected' : '') + '>' + mn + '</option>';
          }
          modelOpts = '<select id="ai-model" style="width:100%;padding:8px 12px;border:1px solid #e0e0e8;border-radius:8px;font-size:0.78rem;font-family:inherit;outline:none;background:#fff">' + modelOpts + '</select>';
        } else {
          modelOpts = '<input id="ai-model" value="' + currentModel.replace(/"/g, '&quot;') + '" placeholder="model name" style="width:100%;padding:8px 12px;border:1px solid #e0e0e8;border-radius:8px;font-size:0.78rem;font-family:monospace;outline:none">';
        }

        var customEpHTML = '';
        if (currentProvider.isCustom) {
          customEpHTML = '<div style="margin-top:8px"><label style="font-size:0.65rem;font-weight:600;color:var(--text2);display:block;margin-bottom:2px">🔗 Endpoint URL</label><input id="ai-custom-endpoint" value="' + customEp.replace(/"/g, '&quot;') + '" placeholder="https://your-llm-server/v1/chat/completions" style="width:100%;padding:8px 12px;border:1px solid #e0e0e8;border-radius:8px;font-size:0.75rem;font-family:monospace;outline:none"></div>';
        }

        var apiKey = localStorage.getItem('ve_ai_key_' + providerId) || '';
        var apiKeyUrl = currentProvider.apiKeyUrl || '';

        var box = document.createElement('div');
        box.style.cssText =
          'background:#fff;border-radius:16px;width:620px;max-width:95vw;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow:hidden';
        box.innerHTML =
          '<div style="padding:20px 24px;border-bottom:1px solid #e0e0e8;display:flex;align-items:center;gap:10px"><span style="font-size:1.2rem">🤖</span><span style="font-weight:800;font-size:0.95rem">' + i18n('ai.title') + '</span><span style="font-size:0.7rem;color:var(--text2)">' + i18n('ai.subtitle') + '</span><button id="ai-close" style="margin-left:auto;background:none;border:none;font-size:1.2rem;cursor:pointer;color:#888">✕</button></div>' +
          '<div style="flex:1;overflow-y:auto;padding:20px 24px;display:flex;flex-direction:column;gap:14px">' +
          // Provider selector
          '<div style="display:flex;gap:12px">' +
          '<div style="flex:1"><label style="font-size:0.72rem;font-weight:700;color:var(--text);margin-bottom:4px;display:block">' + i18n('ai.provider_label') + '</label><select id="ai-provider" style="width:100%;padding:8px 12px;border:1px solid #e0e0e8;border-radius:8px;font-size:0.78rem;font-family:inherit;outline:none;background:#fff">' + providerOpts + '</select></div>' +
          '<div style="flex:1"><label style="font-size:0.72rem;font-weight:700;color:var(--text);margin-bottom:4px;display:block">🧠 Model</label><div id="ai-model-container">' + modelOpts + '</div></div>' +
          '</div>' +
          customEpHTML +
          // API Key
          '<div><label style="font-size:0.72rem;font-weight:700;color:var(--text);margin-bottom:4px;display:block">' + i18n('ai.apikey_label') + ' <span style="font-weight:400;color:var(--text2);font-size:0.65rem">(' + currentProvider.name + ' — ' + i18n('ai.apikey_hint') + ')</span>' + (apiKeyUrl ? ' <a href="' + apiKeyUrl + '" target="_blank" style="font-size:0.6rem;color:var(--accent)">Get key →</a>' : '') + '</label><input id="ai-apikey" type="password" value="' +
          apiKey.replace(/"/g, '&quot;') +
          '" placeholder="' + (currentProvider.apiKeyHint || '') + '" style="width:100%;padding:8px 12px;border:1px solid #e0e0e8;border-radius:8px;font-size:0.78rem;font-family:monospace;outline:none"></div>' +
          // Prompt
          '<div><label style="font-size:0.72rem;font-weight:700;color:var(--text);margin-bottom:4px;display:block">' + i18n('ai.prompt_label') + '</label><textarea id="ai-prompt" rows="6" placeholder="' + i18n('ai.prompt_placeholder').replace(/"/g, '&quot;') + '" style="width:100%;padding:10px 14px;border:1px solid #e0e0e8;border-radius:10px;font-size:0.8rem;font-family:inherit;resize:vertical;outline:none;line-height:1.6"></textarea></div>' +
          // Template chips
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button id="ai-template-stroop" style="padding:6px 12px;border-radius:6px;border:1px solid #e0e0e8;background:#fafafe;cursor:pointer;font-size:0.7rem;font-family:inherit">🧠 Stroop</button>' +
          '<button id="ai-template-simon" style="padding:6px 12px;border-radius:6px;border:1px solid #e0e0e8;background:#fafafe;cursor:pointer;font-size:0.7rem;font-family:inherit">🎯 Simon</button>' +
          '<button id="ai-template-flanker" style="padding:6px 12px;border-radius:6px;border:1px solid #e0e0e8;background:#fafafe;cursor:pointer;font-size:0.7rem;font-family:inherit">⬅️➡️ Flanker</button>' +
          '<button id="ai-template-custom" style="padding:6px 12px;border-radius:6px;border:1px solid #e0e0e8;background:#fafafe;cursor:pointer;font-size:0.7rem;font-family:inherit">📋 Example</button>' +
          '</div>' +
          '<div id="ai-status" style="font-size:0.72rem;color:var(--text2);min-height:20px"></div>' +
          '</div>' +
          '<div style="padding:14px 24px;border-top:1px solid #e0e0e8;display:flex;gap:8px;justify-content:flex-end;background:#fafafe">' +
          '<button id="ai-cancel" style="padding:8px 20px;border-radius:8px;border:1px solid #e0e0e8;background:#fff;cursor:pointer;font-size:0.82rem;font-family:inherit">' + i18n('ai.btn.cancel') + '</button>' +
          '<button id="ai-optimize" style="padding:8px 16px;border-radius:8px;border:1px solid #f59e0b;background:#fffbeb;color:#b45309;cursor:pointer;font-size:0.78rem;font-family:inherit;font-weight:600;margin-right:auto" title="AI helps refine your prompt for better experiment generation">' + i18n('ai.btn.optimize') + '</button>' +
          '<button id="ai-generate" style="padding:8px 24px;border-radius:8px;border:none;background:linear-gradient(135deg,#6366f1,#a855f7);color:#ffffff;cursor:pointer;font-size:0.82rem;font-family:inherit;font-weight:600">' + i18n('ai.btn.generate') + '</button>' +
          '</div>';
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        // Helper: get current provider model
        function _getModel() {
          if (currentProvider.isCustom) {
            var cel = document.getElementById('ai-custom-model');
            return cel ? cel.value.trim() : '';
          }
          var sel = document.getElementById('ai-model');
          return sel ? (sel.value || (currentProvider.models && currentProvider.models[0]) || '') : '';
        }

        // Helper: get custom endpoint
        function _getCustomEndpoint() {
          var el = document.getElementById('ai-custom-endpoint');
          return el ? el.value.trim() : '';
        }

        // Event handlers
        document.getElementById('ai-close').onclick = function () { overlay.remove(); };
        document.getElementById('ai-cancel').onclick = function () { overlay.remove(); };

        // Provider change → reload dialog
        document.getElementById('ai-provider').onchange = function () {
          var newProvider = this.value;
          localStorage.setItem('ve_ai_provider', newProvider);
          var mod = _getModel();
          if (mod) localStorage.setItem('ve_ai_model', mod);
          if (newProvider === 'custom') {
            var ep = _getCustomEndpoint();
            if (ep) localStorage.setItem('ve_ai_endpoint_custom', ep);
          }
          overlay.remove();
          showAIGenerate();
        };

        var promptEl = document.getElementById('ai-prompt');

        // Template quick-fill
        var templates = {
          stroop:'Design a classic Stroop color-word interference experiment. Use randomize to shuffle text variants (different colors and word meanings). Red mapped to key:a, Blue to key:l. Include:\n1. Instructions phase: explain task rules (red→A, blue→L, green→K), click to start\n2. Trials phase: 48 trials, each: fixation→delay→randomize→texts(different colors/meanings, each with color-key mapping)→keyboard(choices:["a","l","k"])→loop. Add branch for error feedback if needed\n3. Feedback phase: thank participant',
          simon:'Design a Simon effect experiment. Each trial uses randomize(pick-one) to select 1 shape variant. Red circle→key:a, Green circle→key:l. Include:\n1. Instructions: task rules (red→A, green→L, ignore position), click to start\n2. Trials: 60 trials, fixation→delay→randomize→shapes(red/green × left/right = 4 variants, each with key mapping)→keyboard(choices:["a","l"])→loop. Add branch for error feedback\n3. Feedback: thank participant',
          flanker:'Design a Flanker task. Each trial uses randomize(pick-one) to select 1 arrow variant. Left arrow→key:f, Right arrow→key:j. Include:\n1. Instructions: title + rules (press F for left middle arrow, J for right, ignore flankers), click to start\n2. Trials: 80 trials, fixation→delay→randomize→texts(5 arrow types: congruent <<<<<, incongruent >><>> red, congruent >>>>>, incongruent <><<< red, incongruent >>><> green, each with key mapping)→keyboard(choices:["f","j"],trial_duration:1500)→branch(correct)→error feedback→loop\n3. Feedback: thank participant',
          custom:'Design a [experiment name]. [Purpose and background]. Include:\n1. Instructions phase: [content]\n2. Trials phase: [N] trials, [stimuli and response details]\n3. Feedback phase: [content]'
        };
        Object.keys(templates).forEach(function (key) {
          var btn = document.getElementById('ai-template-' + key);
          if (btn) btn.onclick = function () { promptEl.value = templates[key]; };
        });

        // Optimize prompt → uses selected provider
        document.getElementById('ai-optimize').onclick = function () {
          var prompt = promptEl.value.trim();
          if (!prompt) { alert('Please enter an experiment description first'); return; }
          var key = document.getElementById('ai-apikey').value.trim();
          if (!key) { alert('Please enter your API key first'); return; }
          var pid = document.getElementById('ai-provider').value;
          var mod = _getModel();
          localStorage.setItem('ve_ai_key_' + pid, key);
          localStorage.setItem('ve_ai_provider', pid);
          if (mod) localStorage.setItem('ve_ai_model', mod);
          if (pid === 'custom') {
            var ep = _getCustomEndpoint();
            if (ep) localStorage.setItem('ve_ai_endpoint_custom', ep);
          }

          var statusEl = document.getElementById('ai-status');
          var optBtn = document.getElementById('ai-optimize');
          optBtn.disabled = true; optBtn.textContent = '⏳ ...';
          statusEl.innerHTML = '<span style="color:var(--amber)">🔧 Optimizing prompt via ' + _getAIProvider(pid).name + '...</span>';

          var metaPrompt = 'You are an experiment design assistant. The user wants to create an online behavioral experiment but their description may be unclear.\n' +
            'Rewrite their description into a clear, complete experiment specification including:\n' +
            '1. Experiment type (Stroop/Simon/Flanker/game/memory/dialogue etc.)\n' +
            '2. Phase structure: Instructions→Trials→Feedback\n' +
            '3. Specific content for each phase\n' +
            '4. Trial count and loop iterations\n' +
            '5. Required component types (text, shape, keyboard, button, slider, textInput, fixation, delay, randomize, branch, variable, loop)\n' +
            '6. Whether randomization, conditional branching, or scoring variables are needed\n' +
            '7. Color scheme and key mappings\n' +
            '8. Device resolution ' + (editor.device || { w: 1280, h: 720 }).w + '×' + (editor.device || { w: 1280, h: 720 }).h + '\n\n' +
            'Return the optimized description in plain text (no JSON). Keep it concise but complete, under 300 words.\n\n' +
            'User description: ' + prompt;

          _callAI(pid, mod, [{role:'user',content:metaPrompt}], 800).then(function(result) {
            promptEl.value = result.trim();
            statusEl.innerHTML = '<span style="color:var(--green)">✅ Prompt optimized! Edit further or click Generate</span>';
            optBtn.disabled = false; optBtn.textContent = '🔧 Optimize Prompt';
          }).catch(function(err) {
            statusEl.innerHTML = '<span style="color:var(--red)">❌ Optimization failed: ' + err.message + '</span>';
            optBtn.disabled = false; optBtn.textContent = '🔧 Optimize Prompt';
          });
        };

        // Generate → uses selected provider
        document.getElementById('ai-generate').onclick = function () {
          var prompt = promptEl.value.trim();
          if (!prompt) { alert('Please enter an experiment description'); return; }
          var key = document.getElementById('ai-apikey').value.trim();
          if (!key) { alert('Please enter your API key (' + currentProvider.name + ')'); return; }
          var pid = document.getElementById('ai-provider').value;
          var mod = _getModel();
          localStorage.setItem('ve_ai_key_' + pid, key);
          localStorage.setItem('ve_ai_provider', pid);
          if (mod) localStorage.setItem('ve_ai_model', mod);
          if (pid === 'custom') {
            var ep = _getCustomEndpoint();
            if (ep) localStorage.setItem('ve_ai_endpoint_custom', ep);
          }

          var statusEl = document.getElementById('ai-status');
          var genBtn = document.getElementById('ai-generate');
          genBtn.disabled = true; genBtn.textContent = '⏳ ...';
          statusEl.innerHTML = '<span style="color:var(--accent)">' + i18n('ai.status.generating') + ' (' + _getAIProvider(pid).name + ')</span>';

          var sysPrompt =
            'You are an online behavioral experiment builder. Generate a complete experiment structure JSON based on the user\'s description.\n\n' +
            '⚠ IMPORTANT: Output all text content, labels, and instructions in ENGLISH. Use English for all user-facing text.\n\n' +
            '【Output Format】Strict JSON only - no markdown code blocks, no comments. Must contain 3 phases:\n' +
            '{"phases":[\n' +
            '  {"type":"instructions","color":"i","trials":[{"id":"t1","components":[text(instructions)+button(start)]}]},\n' +
            '  {"type":"trials","color":"t","trials":[{"id":"t2","components":[fixation+randomize(if needed)+stimulus×N+response+branch(if needed)+loop]}]},\n' +
            '  {"type":"feedback","color":"f","trials":[{"id":"tN","components":[text(thanks)]}]}\n' +
            ']}\n\n' +
            '【Full Component Schema】(cat: s=stimulus r=response l=logic)\n\n' +
            'text:       {type:"text",content:"text",fontSize:32,color:"#333333",position:"center",fontWeight:"bold",newStep:false,step_duration:500,"映射按键":"a",cat:"s"}\n' +
            'shape:      {type:"shape",shape:"circle|square|triangle|diamond|star",size:80,color:"#6366f1",position:"center","映射按键":"a",cat:"s"}\n' +
            'fixation:   {type:"fixation",trial_duration:500,durationMin:0,durationMax:0,durationStep:250,cat:"s"}\n' +
            'image:      {type:"image",fileData:"",fileName:"",stimulus_width:200,stimulus_height:0,maintain_aspect_ratio:true,render_on_canvas:true,"映射按键":"",cat:"s"}\n' +
            'animation:  {type:"animation",frames:[],frame_time:250,frame_isi:0,sequence_reps:1,choices:[],prompt:"",render_on_canvas:true,cat:"s"}  // OWNS the display; never combine with other components\n' +
            'audio:      {type:"audio",fileData:"",fileName:"",cat:"s"}\n' +
            'video:      {type:"video",fileData:"",fileName:"",width:320,cat:"s"}\n' +
            'keyboard:   {type:"keyboard",choices:["a","l"],correctKey:"",prompt:"Press a key",trial_duration:0,stimulus_duration:0,response_ends_trial:true,wait_for_key_release:false,cat:"r"}\n' +
            'button:     {type:"button",choices:["Yes","No"],prompt:"",button_layout:"grid",grid_rows:1,grid_columns:0,trial_duration:0,stimulus_duration:0,response_ends_trial:true,enable_button_after:0,cat:"r"}\n' +
            'slider:     {type:"slider",min:0,max:100,step:1,slider_start:50,labels:[],button_label:"Continue",slider_width:0,require_movement:false,prompt:"",trial_duration:0,stimulus_duration:0,response_ends_trial:true,cat:"r"}\n' +
            'textInput:  {type:"textInput",prompt:"",placeholder:"Type here",name:"Q0",required:false,rows:1,columns:40,button_label:"Continue",autocomplete:false,cat:"r"}  // no right answer, no timeout\n' +
            'loop:       {type:"loop",count:48,cat:"l"}\n' +
            'branch:     {type:"branch",condition:"correct",matchValue:"",targetFail:"",operator:">=",compareValue:"",cat:"l"}\n' +
            'randomize:  {type:"randomize",mode:"pick-one",cat:"l"}\n' +
            'variable:   {type:"variable",name:"score",initial:0,mode:"correct",cat:"l"}\n\n' +
            '【Color Rules — CRITICAL! Preview background is WHITE #fff】\n' +
            '  Text color must use DARK colors (#333, #1a1a2e, #1e293b). NEVER use #fff/#ffffff/white/light gray!\n' +
            '  Button color: medium-dark (#6366f1, #ef4444, #3b82f6). Do NOT use white!\n' +
            '  Shape color: vivid dark (#ef4444, #22c55e, #3b82f6, #6366f1). Do NOT use white!\n' +
            '  Keyboard: `choices` is an ARRAY of key strings, e.g. ["a","l"]. Write "space" for the spacebar.\n' +
            '    An EMPTY array means any key (jsPsych ALL_KEYS). `correctKey` scores the trial.\n\n' +
            '【Standard Trial Structure — follow STRICTLY】\n' +
            '[fixation] → [randomize(if multiple stimuli)] → [stimulus(text/shape)×N] → [response(keyboard/button/slider/textInput)] → [branch(if error feedback needed)] → [loop]\n' +
            '  ⚠ Every trial MUST end with loop, or it runs only once!\n' +
            '  ⚠ Set the fixation duration (e.g. 500-700) to control the inter-stimulus interval\n' +
            '  ⚠ For a button trial, `choices` is an ARRAY of button labels, not a comma-separated string\n' +
            '  ⚠ Multiple stimulus variants MUST be wrapped in randomize, or all display at once!\n' +
            '  ⚠ Logic components (loop/branch/randomize/variable) have cat="l"\n\n' +
            '【Layout】Components stack in document flow — there are NO x/y coordinates.\n' +
            '  `position` is alignment only: "center" (default), "left", or "right".\n' +
            '  Order in the components array IS the vertical order on screen.\n' +
            '  There is no way to overlap two components; put them in sequence instead.\n' +
            '  Target screen: ' + dev.w + '×' + dev.h + '\n' +
            '  Font sizes — MUST scale to device size (' + dev.w + '×' + dev.h + '):\n' +
            '    Instructions: ' + Math.round(dev.h * 0.025) + '-' + Math.round(dev.h * 0.035) + 'px (≈2.5-3.5% of device height)\n' +
            '    Stimuli (key text): ' + Math.round(dev.h * 0.05) + '-' + Math.round(dev.h * 0.08) + 'px (≈5-8% of height, bold, centered)\n' +
            '    Feedback/thank-you: ' + Math.round(dev.h * 0.03) + '-' + Math.round(dev.h * 0.045) + 'px (≈3-4.5% of height)\n' +
            '    Error messages: slightly smaller than stimuli (~' + Math.round(dev.h * 0.04) + 'px)\n' +
            '    Small devices (w<500): reduce all sizes by ~30%\n' +
            '    Large screens (w>1500): increase stimuli up to ' + Math.round(dev.h * 0.1) + 'px\n\n' +
            '【ID System】Trials "t1","t2"... Components "c1","c2"... globally sequential across all phases\n\n' +
            '【randomize + key mapping mechanism】\n' +
            '  Two modes: pick-one (select 1 variant per loop) and shuffle (show all, random order)\n' +
            '  Set "映射按键" (key mapping) property on text/shape inside randomize (e.g., "a", "l", "f", "j", " ")\n' +
            '  When pick-one selects a variant, its mapped key becomes the correct key for keyboard response\n\n' +
            '【branch — three condition modes】\n' +
            '  condition:"correct"  → match key correctness: targetFail=target trial on error\n' +
            '  condition:"response" → match response value: matchValue="v1,v2" comma-separated\n' +
            '  condition:"variable" → compare variable: matchValue="varName", operator:">=|<=|>|<|==|!=", compareValue:number\n' +
            '  targetFail = target trial ID. Empty = retry current trial. Branch goes after response\n' +
            '  ⚠ Error feedback trials must be AFTER the main trial!\n\n' +
            '【variable — three counting modes】\n' +
            '  mode:"correct"→+1 on correct  mode:"always"→+1 each time  mode:"manual"→manual control\n' +
            '  Place at trial start (before fixation). Use name in branch(variable)\n\n' +
            '【Experiment Patterns】\n' +
            '  Stroop: texts(different colors/words, each with key mapping a/l/k) → randomize(pick-one) → keyboard(choices:["a","l","k"]) → branch(correct→error page) → loop(48)\n' +
            '  Simon: shapes(red/green × left/right = 4 variants, each with key mapping a/l) → randomize(pick-one) → keyboard(choices:["a","l"]) → branch(correct→error page) → loop(60)\n' +
            '  Flanker: 5 arrow text variants with explicit 映射按键 f/j based on MIDDLE arrow direction:\n' +
            '    "<<<<<" (5 left)   → 映射按键:"f" (middle ←)\n' +
            '    ">>>>>" (5 right)  → 映射按键:"j" (middle →)\n' +
            '    "><><>" (conflict, middle >) → 映射按键:"j"\n' +
            '    "<><<>" (conflict, middle <) → 映射按键:"f"\n' +
            '    ">>><>" (conflict, middle >) → 映射按键:"j"\n' +
            '    keyboard(choices:["f","j"],trial_duration:1500) → branch(correct→error page) → loop(80)\n' +
            '  Memory: variable(name,initial) → randomize(shuffle) → texts → textInput(prompt,placeholder,name) → loop\n' +
            '  Survey: text(question, top) + textInput(answer key, bottom) + loop\n' +
            '  Game: text(instructions) + slider(amount,min:0,max:100) + loop\n\n' +
            '【FORBIDDEN — common causes of invalid JSON】\n' +
            '  ❌ text color = #fff/white → invisible on white background\n' +
            '  ❌ Two components expected to overlap → impossible, they stack in flow\n' +
            '  ❌ randomize present but text/shape missing key mapping → keyboard has no correct key\n' +
            '  ❌ Error feedback trial placed BEFORE main trial → preview shows error first\n' +
            '  ❌ Trial missing loop → only runs once\n' +
            '  ❌ No blank-pause component exists → use the fixation duration instead\n' +
            '  ❌ Multiple stimuli without randomize → all display simultaneously\n' +
            '  ❌ JSON trailing commas or comments\n' +
            '  ❌ Single quotes instead of double quotes';

          _callAI(pid, mod, [
            {role:'system',content:sysPrompt},
            {role:'user',content:prompt}
          ], 4096).then(function(text) {
            var m = text.match(/\{[\s\S]*\}/);
            if (!m) throw new Error('AI did not return valid JSON');
            var exp = JSON.parse(m[0]);
            if (!exp.phases || !Array.isArray(exp.phases)) throw new Error('Response missing phases array');

            resetEditor();
            editor.phases = exp.phases;
            // Migrate first: the loop below reads `ph.timeline`, and an import in
            // the older shape has `trials` until migratePos() renames it.
            migratePos();
            editor.pc = 0; editor.tc = 0; editor.cc = 0;
            editor.phases.forEach(function (ph) {
              ph.id = 'ph' + ++editor.pc;
              if (!ph.name) ph.name = i18n('phase.timeline');
              ph.timeline.forEach(function (tr) {
                tr.id = 't' + ++editor.tc;
                tr.components.forEach(function (c) {
                  c.id = 'c' + ++editor.cc;
                });
              });
            });
            // Ensure 3-phase structure
            if (editor.phases.length === 0 || editor.phases[0].name !== i18n('phase.instructions')) {
              var instrPh = { id:'ph_ai_inst', name: i18n('phase.instructions'), timeline:[{ id:'t_ai_inst', components:[ { id:'c_ai_txt', type:'text', content:'Welcome to this experiment!\n\nPlease read the instructions carefully before starting.', fontSize:20, color:'#333333', position:'center', fontWeight:'bold', cat:'s' }, { id:'c_ai_btn', type:'button', choices:['Start Experiment'], prompt:'', button_layout:'grid', grid_rows:1, grid_columns:0, trial_duration:0, stimulus_duration:0, response_ends_trial:true, enable_button_after:0, cat:'r' } ] }] };
              editor.phases.unshift(instrPh);
              editor.tc++; editor.cc += 2;
            }
            var lastPh = editor.phases[editor.phases.length - 1];
            if (!lastPh || lastPh.name !== i18n('phase.feedback')) {
              var fbPh = { id:'ph_ai_fb', name: i18n('phase.feedback'), timeline:[{ id:'t_ai_fb', components:[ { id:'c_ai_fbt', type:'text', content:'Experiment complete!\n\nThank you for your participation.', fontSize:24, color:'#333333', position:'center', fontWeight:'bold', cat:'s' } ] }] };
              editor.phases.push(fbPh);
              editor.tc++; editor.cc++;
            }
            if (editor.phases.length > 0 && editor.phases[0].timeline.length > 0) {
              editor.selectedTrial = editor.phases[0].timeline[0].id;
              if (editor.phases[0].timeline[0].components.length > 0) editor.selComp = editor.phases[0].timeline[0].components[0].id;
            }
            renderAll();
            overlay.remove();
            statusEl.innerHTML = '<span style="color:var(--green)">✅ ' + editor.phases.length + ' phases, ' + editor.tc + ' trials generated!</span>';
            setTimeout(function() { alert('✅ Success!\n\nPhases: ' + editor.phases.length + '\nTrials: ' + editor.tc + '\nComponents: ' + editor.cc); }, 300);
          }).catch(function (err) {
            statusEl.innerHTML = '<span style="color:var(--red)">❌ ' + err.message + '</span>';
            genBtn.disabled = false; genBtn.textContent = '✨ Generate Experiment';
          });
        };
      }

      // Init device dropdown
      (function () {
        var sel = document.getElementById('device-select');
        devicePresets.forEach(function (d, i) {
          var o = document.createElement('option');
          o.value = i;
          o.textContent = d.icon + ' ' + d.name;
          sel.appendChild(o);
        });
        sel.value = '0';
        setDevice('0');
      })();

      function saveVersion() {
        // Prompt for project name on first save
        if (!editor.projectName) {
          var name = prompt('Please name your project:', 'My Experiment');
          if (!name || !name.trim()) return;
          editor.projectName = name.trim();
          editor.projectId = 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        }
        var now = new Date();
        var ts =
          now.getFullYear() +
          '-' +
          String(now.getMonth() + 1).padStart(2, '0') +
          '-' +
          String(now.getDate()).padStart(2, '0') +
          ' ' +
          String(now.getHours()).padStart(2, '0') +
          ':' +
          String(now.getMinutes()).padStart(2, '0') +
          ':' +
          String(now.getSeconds()).padStart(2, '0');
        var snap = JSON.parse(
          JSON.stringify({
            phases: editor.phases,
            selectedTrial: editor.selectedTrial,
            selComp: editor.selComp,
            tc: editor.tc,
            pc: editor.pc,
            cc: editor.cc,
            time: ts,
          }),
        );
        editor.versions.unshift(snap);
        if (editor.versions.length > 20) editor.versions.pop();
        try {
          localStorage.setItem(_vek('task_versions'), JSON.stringify(editor.versions));
        } catch (e) {}
        // Sync draft to platform dashboard (ExpStore + drafts)
        try {
          var pid = editor.projectId || 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
          if (!editor.projectId) editor.projectId = pid;
          var phaseCount = editor.phases.length,
            trialCount = editor.phases.reduce(function (s, p) {
              return s + p.timeline.length;
            }, 0);
          var exp = {
            id: pid,
            title: editor.projectName || '🧩 Task Editor',
            method: '🧩 Task Editor',
            status: 'draft',
            builderType: 'task',
            config: {targetN: 200, reward: 3, isPublic: true, duration: '~' + trialCount * 2 + ' min'},
            showInHall: true,
            stats: {participants: 0, completed: 0, phases: phaseCount, trials: trialCount},
            createdAt: new Date().toISOString(),
          };
          // Save to ExpStore (where renderDashboard reads from)
          var all = JSON.parse(localStorage.getItem(_vek('ve_experiments')) || '[]');
          all = all.filter(function (e) {
            return e.id !== pid;
          });
          all.unshift(exp);
          if (all.length > 50) all.pop();
          localStorage.setItem(_vek('ve_experiments'), JSON.stringify(all));
          // Also update drafts for createBuilderDraft compatibility
          var drafts = JSON.parse(localStorage.getItem(_vek('ve_drafts')) || '[]');
          drafts = drafts.filter(function (d) {
            return d.id !== pid;
          });
          drafts.unshift({
            id: pid,
            title: editor.projectName || '🧩 Task Editor',
            builderType: 'task',
            target: 200,
            reward: 3,
            created: ts,
            status: 'Draft',
          });
          localStorage.setItem(_vek('ve_drafts'), JSON.stringify(drafts));
        } catch (e) {}
        var b = document.getElementById('save-btn');
        if (b) showSaveIndicator();
        return true;
      }

      function publishExperiment() {
        if (
          editor.phases.length === 0 ||
          editor.phases.every(function (p) {
            return p.timeline.length === 0;
          })
        ) {
          alert('Experiment is empty. Please add phases and trials before publishing.');
          return;
        }
        if (!editor.projectName) {
          var saved = saveVersion();
          if (!saved && !editor.projectName) return;
        }
        // Compiled once and handed to whichever route runs. It builds the whole
        // experiment, so asking it again for the asset count was waste.
        var r = _compileExperiment({});
        var n = r.assets.length;
        showExportConfig(function (format) {
          downloadPublishedExperiment(format, r);
          if (format === 'jzip') {
            alert('JATOS package downloaded.\n\nImport the .jzip into your JATOS server ' +
              '(Studies → Import Study). The experiment submits its data back to JATOS ' +
              'when it finishes, so the participant does not have to send anything.');
            return;
          }
          alert(n
            ? 'Experiment downloaded as a ZIP.\n\nUnzip it and open index.html — the ' + n +
              ' asset' + (n === 1 ? '' : 's') + ' it needs are in the folders beside it. ' +
              'Keep the layout: the code refers to them by path.\n\n' +
              'When the experiment finishes it saves the data as a CSV file.'
            : 'Experiment file downloaded.\n\nOpen it in a browser to run the experiment.\n' +
              'When the experiment finishes it saves the data as a CSV file.');
        });
      }

      // One clickable row of the deployment choice.
      function _exportOption(value, icon, title, desc) {
        return '<button type="button" data-format="' + value + '" style="display:flex;gap:12px;' +
          'width:100%;text-align:left;align-items:flex-start;padding:13px 14px;margin-bottom:10px;' +
          'border:1px solid var(--border);border-radius:10px;background:#fff;cursor:pointer;' +
          'font-family:inherit">' +
          '<span style="font-size:1.3rem;line-height:1.2">' + icon + '</span>' +
          '<span style="flex:1"><span style="display:block;font-weight:600;font-size:0.83rem;' +
          'margin-bottom:3px">' + title + '</span>' +
          '<span style="display:block;font-size:0.72rem;color:var(--text2);line-height:1.5">' +
          desc + '</span></span></button>';
      }

      // Where will this run? Asked at publish time because it is the one choice
      // that changes the ARTEFACT rather than the experiment — the jsPsych code
      // is identical either way, and only the packaging and the way the data
      // travels back differ.
      function showExportConfig(callback) {
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2800;background:rgba(0,0,0,0.45);' +
          'display:flex;align-items:center;justify-content:center;font-family:inherit';
        var box = document.createElement('div');
        box.style.cssText = 'background:#fff;border-radius:14px;width:540px;max-width:92vw;' +
          'padding:22px 24px;box-shadow:0 20px 60px rgba(0,0,0,0.28)';
        box.innerHTML =
          '<div style="font-weight:700;font-size:1rem;margin-bottom:4px">Where will this run?</div>' +
          '<p style="font-size:0.78rem;color:var(--text2);margin:0 0 16px;line-height:1.55">' +
          'The experiment itself is the same either way — what differs is how it is packaged ' +
          'and how the data gets back to you.</p>' +
          _exportOption('html', '💾', 'Download the files',
            'A single HTML file, or a ZIP with its assets beside it. Runs anywhere. When it ' +
            'finishes it shows the data and saves a CSV the participant sends back.') +
          _exportOption('jzip', '📦', 'JATOS package (.jzip)',
            'Import into your JATOS server. The experiment submits its data to JATOS when it ' +
            'finishes, so nothing depends on the participant sending a file back.') +
          '<div style="display:flex;justify-content:flex-end;margin-top:6px">' +
          '<button id="ec-cancel" class="btn btn-outline" style="font-size:0.78rem">Cancel</button>' +
          '</div>';
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        function close() { overlay.remove(); }
        overlay.onclick = function (e) { if (e.target === overlay) close(); };
        document.getElementById('ec-cancel').onclick = close;
        box.querySelectorAll('[data-format]').forEach(function (el) {
          el.onclick = function () { close(); callback(el.getAttribute('data-format')); };
        });
      }

      function showPublishConfig(callback) {
        var overlay = document.createElement('div');
        overlay.style.cssText =
          'position:fixed;inset:0;z-index:2800;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-family:sans-serif';
        var box = document.createElement('div');
        box.style.cssText =
          'background:#fff;border-radius:16px;width:420px;padding:24px 28px;box-shadow:0 20px 60px rgba(0,0,0,0.2)';
        box.innerHTML =
          '<h3 style="font-size:1rem;margin-bottom:4px">📋 Publish Settings</h3><p style="font-size:0.75rem;color:#888;margin-bottom:16px">Confirm settings, then proceed to review</p>' +
          '<div style="margin-bottom:12px"><label style="font-size:0.78rem;color:#666;display:block;margin-bottom:4px">👥 Target Participants</label><input id="pub-target" type="number" value="200" min="10" max="5000" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:0.85rem;font-family:inherit"></div>' +
          '<div style="margin-bottom:12px"><label style="font-size:0.78rem;color:#666;display:block;margin-bottom:4px">💰 Reward (¥/person)</label><input id="pub-reward" type="number" value="3" min="0.5" max="100" step="0.5" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:0.85rem;font-family:inherit"></div>' +
          '<div style="margin-bottom:20px;display:flex;align-items:center;justify-content:space-between"><div><strong style="font-size:0.85rem">🌐 Show in Experiment Hall</strong><p style="font-size:0.7rem;color:#888">When enabled, participants can find this experiment in the hall</p></div><label class="pub-toggle" style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer"><input type="checkbox" id="pub-public" checked style="opacity:0;width:0;height:0"><span style="position:absolute;inset:0;background:#6366f1;border-radius:12px;transition:0.3s"></span><span style="position:absolute;left:2px;top:2px;width:20px;height:20px;background:#fff;border-radius:50%;transition:0.3s"></span></label></div>' +
          '<div style="display:flex;gap:8px"><button id="pub-cancel" style="flex:1;padding:10px;border-radius:8px;border:1px solid #ddd;background:#fff;cursor:pointer;font-size:0.85rem;font-family:inherit">Cancel</button><button id="pub-confirm" style="flex:1;padding:10px;border-radius:8px;border:none;background:#6366f1;color:#ffffff;cursor:pointer;font-size:0.85rem;font-family:inherit;font-weight:600">Confirm & Publish →</button></div>';
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        // Toggle switch behavior
        var toggleCb = document.getElementById('pub-public');
        var toggleTrack = toggleCb.nextElementSibling;
        toggleCb.onchange = function () {
          toggleTrack.style.background = this.checked ? '#6366f1' : '#ccc';
        };

        overlay.onclick = function (e) {
          if (e.target === overlay) overlay.remove();
        };
        document.getElementById('pub-cancel').onclick = function () {
          overlay.remove();
        };
        document.getElementById('pub-confirm').onclick = function () {
          var targetN = parseInt(document.getElementById('pub-target').value) || 200;
          var reward = parseFloat(document.getElementById('pub-reward').value) || 3;
          var isPublic = document.getElementById('pub-public').checked;
          overlay.remove();
          callback({targetN: targetN, reward: reward, isPublic: isPublic});
        };
      }

      // ============ MULTI-AGENT EXPERIMENT REVIEW ============

function showVersionHistory() {
        var overlay = document.createElement('div');
        overlay.style.cssText =
          'position:fixed;inset:0;z-index:2100;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center';
        var box = document.createElement('div');
        box.style.cssText =
          'background:#fff;border-radius:12px;width:420px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.2)';
        var h =
          '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid var(--border)"><span style="font-weight:700;font-size:0.9rem">🕐 Version History</span><button id="vh-close" style="background:none;border:none;font-size:1.1rem;cursor:pointer;color:var(--text2)">✕</button></div>';
        h += '<div style="flex:1;overflow-y:auto;padding:8px 16px">';
        if (editor.versions.length === 0) {
          h +=
            '<p style="color:var(--text2);font-size:0.8rem;text-align:center;padding:30px">No versions yet<br><span style="font-size:0.7rem">Click "💾 Save" to create your first version</span></p>';
        } else {
          var nowSnap = JSON.stringify({
            phases: editor.phases,
            selectedTrial: editor.selectedTrial,
            selComp: editor.selComp,
            tc: editor.tc,
            pc: editor.pc,
            cc: editor.cc,
          });
          editor.versions.forEach(function (v, i) {
            var isCurrent =
              i === 0 &&
              JSON.stringify({
                phases: v.phases,
                selectedTrial: v.selectedTrial,
                selComp: v.selComp,
                tc: v.tc,
                pc: v.pc,
                cc: v.cc,
              }) === nowSnap;
            h +=
              '<div style="display:flex;align-items:center;gap:10px;padding:10px 8px;border-bottom:1px solid #f0f0f5' +
              (isCurrent ? ';background:#f8f8ff;border-radius:8px' : '') +
              '">';
            h +=
              '<span style="font-size:0.8rem;font-weight:600;color:#333333;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
              (i === 0
                ? '<span style="font-size:0.6rem;background:var(--accent);color:#ffffff;padding:1px 6px;border-radius:4px;margin-right:4px">Latest</span>'
                : '') +
              v.time +
              '</span>';
            h +=
              '<button data-vi="' +
              i +
              '" class="vh-restore" style="padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:#fff;cursor:pointer;font-size:0.7rem;color:var(--accent);white-space:nowrap">Restore</button>';
            h +=
              '<button data-vi="' +
              i +
              '" class="vh-delete" style="padding:4px 6px;border-radius:6px;border:1px solid var(--border);background:#fff;cursor:pointer;font-size:0.7rem;color:var(--text2);white-space:nowrap">✕</button>';
            h += '</div>';
          });
        }
        h += '</div>';
        box.innerHTML = h;
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        overlay.onclick = function (e) {
          if (e.target === overlay) overlay.remove();
        };
        document.getElementById('vh-close').onclick = function () {
          overlay.remove();
        };
        // Restore handler
        box.querySelectorAll('.vh-restore').forEach(function (btn) {
          btn.onclick = function () {
            if (!confirm('Restore this version? Unsaved changes will be lost.')) return;
            var v = editor.versions[parseInt(btn.getAttribute('data-vi'))];
            saveState();
            editor.phases = JSON.parse(JSON.stringify(v.phases));
            migratePos();
            editor.selectedTrial = v.selectedTrial;
            editor.selComp = v.selComp;
            editor.tc = v.tc;
            editor.pc = v.pc;
            editor.cc = v.cc;
            renderAll();
            overlay.remove();
          };
        });
        // Delete handler
        box.querySelectorAll('.vh-delete').forEach(function (btn) {
          btn.onclick = function (e) {
            e.stopPropagation();
            editor.versions.splice(parseInt(btn.getAttribute('data-vi')), 1);
            overlay.remove();
            showVersionHistory();
          };
        });
      }

      // Device selection wizard (shown before editor if no device chosen)
      function showDeviceWizard(callback) {
        var overlay = document.createElement('div');
        overlay.style.cssText =
          "position:fixed;inset:0;z-index:6000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;font-family:'Inter','Noto Sans SC',sans-serif";
        var card = document.createElement('div');
        card.style.cssText =
          'background:#fff;border-radius:20px;padding:40px 48px;max-width:700px;width:90vw;box-shadow:0 20px 60px rgba(0,0,0,0.3);text-align:center';
        var h = '<div style="font-size:2.5rem;margin-bottom:8px">📱</div>';
        h += '<h2 style="font-size:1.3rem;margin-bottom:4px;color:#1a1a2e">Select Device</h2>';
        h +=
          '<p style="font-size:0.82rem;color:#888;margin-bottom:28px">Select the screen device participants will use. The width sets the layout in the exported experiment; the height is the target screen the preview and the AI type scale are built from.</p>';
        h += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:16px">';
        devicePresets.forEach(function (d, i) {
          h +=
            '<div class="device-option" data-idx="' +
            i +
            "\" style=\"padding:16px 12px;border:2px solid #e0e0e8;border-radius:12px;cursor:pointer;transition:all 0.15s;text-align:center\" onmouseover=\"this.style.borderColor='#818cf8';this.style.background='#f8f8ff'\" onmouseout=\"this.style.borderColor='#e0e0e8';this.style.background='#ffffff'\">";
          h += '<div style="font-size:1.6rem;margin-bottom:6px">' + d.icon + '</div>';
          h +=
            '<div style="font-weight:700;font-size:0.82rem;margin-bottom:2px">' +
            d.name +
            '</div>';
          h += '<div style="font-size:0.68rem;color:var(--text2)">' + d.w + ' × ' + d.h + ' px</div></div>';
        });
        h += '</div>';
        // Manual size, the same escape hatch the header offers.
        h += '<div style="display:flex;align-items:center;justify-content:center;gap:8px;' +
             'padding-top:16px;border-top:1px solid #ececf2">';
        h += '<span style="font-size:0.75rem;color:#888">Or set a size:</span>';
        h += '<input id="dw-w" type="number" value="1280" style="width:76px;padding:7px 8px;' +
             'border:1px solid #e0e0e8;border-radius:8px;font-family:inherit;font-size:0.8rem;text-align:center">';
        h += '<span style="color:#bbb">×</span>';
        h += '<input id="dw-h" type="number" value="720" style="width:76px;padding:7px 8px;' +
             'border:1px solid #e0e0e8;border-radius:8px;font-family:inherit;font-size:0.8rem;text-align:center">';
        h += '<span style="font-size:0.72rem;color:#888">px</span>';
        h += '<button id="dw-go" style="padding:7px 16px;border-radius:8px;border:none;background:#6366f1;' +
             'color:#fff;font-family:inherit;font-size:0.78rem;font-weight:600;cursor:pointer">Use this size</button>';
        h += '</div>';
        card.innerHTML = h;
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        card.querySelectorAll('.device-option').forEach(function (opt) {
          opt.onclick = function () {
            var idx = parseInt(opt.getAttribute('data-idx'));
            overlay.remove();
            setDeviceSize(devicePresets[idx].w, devicePresets[idx].h);
            if (callback) callback();
          };
        });
        document.getElementById('dw-go').onclick = function () {
          // Read the fields before the overlay goes away — they live inside it.
          var w = document.getElementById('dw-w').value;
          var h = document.getElementById('dw-h').value;
          overlay.remove();
          setDeviceSize(w, h);
          if (callback) callback();
        };
      }

      // Restore last session
      (function () {
        try {
          var savedDevice = localStorage.getItem(_vek('device'));
          if (savedDevice !== null) {
            // Older sessions stored a preset index; newer ones store {w,h}.
            if (/^\d+$/.test(savedDevice)) {
              var p = devicePresets[parseInt(savedDevice)];
              if (p) editor.device = {name: p.name, icon: p.icon, w: p.w, h: p.h};
            } else {
              var dd = JSON.parse(savedDevice);
              if (dd && dd.w && dd.h) setDeviceSize(dd.w, dd.h);
            }
          }
          var saved = localStorage.getItem(_vek('task_editor'));
          if (saved) {
            var d = JSON.parse(saved);
            editor.phases = d.phases || [];
            migratePos();
            editor.selectedTrial = d.sel || null;
            editor.selComp = d.sc || null;
            editor.tc = d.tc || 0;
            editor.pc = d.pc || 0;
            editor.cc = d.cc || 0;
            editor.projectName = d.pn || '';
            editor.projectId = d.pid || '';
            editor.jatos = d.jatos || null;
          }
          var ver = localStorage.getItem(_vek('task_versions'));
          if (ver) editor.versions = JSON.parse(ver);
        } catch (e) {}
      })();
      // Auto-load template from URL parameter
      (function () {
        var m = location.search.match(/[?&]template=(\w+)/);
        if (m) {
          setTimeout(function () {
            loadTemplate(m[1]);
          }, 300);
        }
      })();
      // The header fields and both previews read editor.device, so it must never
      // be left unset — fall back to the desktop preset.
      if (!editor.device) {
        editor.device = {name: devicePresets[0].name, icon: devicePresets[0].icon,
                         w: devicePresets[0].w, h: devicePresets[0].h};
      }
      syncDeviceControls();
      // Show device wizard if first visit (no saved device + no existing experiment)
      if (localStorage.getItem(_vek('device')) === null && localStorage.getItem(_vek('task_editor')) === null) {
        setTimeout(function () {
          showDeviceWizard(function () {
            renderAll();
          });
        }, 500);
      } else {
        try {
          renderAll();
        } catch (e) {
          console.error(e);
        }
      }

      // ============ Template Preview ============
      var _templateInfo = {
        stroop: {
          name: 'Stroop Effect',
          icon: '🧠',
          phases: ['📖 Instructions: task intro + start button', '🧪 Trials: fixation→color-word stimuli→key response(×48)', '📊 Feedback: thank you text'],
        },
        simon: {
          name: 'Simon Effect',
          icon: '🎯',
          phases: [
            '📖 Instructions: Red=A Green=L rules + start',
            '🧪 Trials: fixation→delay→🎲random 4 shapes(pick-one+keyHint)→keyboard→🔀branch→error page(×60)',
            '📊 Feedback: thank you',
          ],
        },
        flanker: {
          name: 'Flanker Task',
          icon: '⬅️➡️',
          phases: [
            '📖 Instructions: arrow direction F/J rules + start',
            '🧪 Trials: fixation→delay→🎲random 5 arrows(pick-one+keyMap)→keyboard→🔀error feedback(×80)',
            '📊 Feedback: thank you',
          ],
        },
        'branch-demo': {
          name: 'Branch Demo',
          icon: '🔀',
          phases: [
            '📖 Instructions: branch concept + start',
            '🧪 Trials: Red text(A)→error→T3 | Error page | Blue text(L)→error→T5 | Error page',
            '📊 Feedback: branch feature summary',
          ],
        },
        'randomize-demo': {
          name: 'Randomize + Variable Demo',
          icon: '🎲',
          phases: [
            '📖 Instructions: variable/randomize concepts + start',
            '🧪 Trials: init variable score | fixation→random 4 fruits→memorize→input(×5)',
            '📊 Feedback: variable+randomize summary',
          ],
        },
      };
      // Template preview — event delegation on flow-container (deferred to ensure DOM ready)
      setTimeout(function () {
        var fc = document.getElementById('flow-container');
        if (!fc) return;
        fc.addEventListener('mouseover', function (e) {
          var chip = e.target.closest('.template-chip[data-tpl]');
          if (!chip) return;
          var previewEl = document.querySelector('.template-preview-chip');
          if (!previewEl) return;
          var name = chip.getAttribute('data-tpl');
          var info = _templateInfo[name];
          if (!info) return;
          previewEl.innerHTML =
            '<div style="font-weight:700;font-size:0.85rem;margin-bottom:8px">' +
            info.icon +
            ' ' +
            info.name +
            '</div>' +
            info.phases
              .map(function (p) {
                return (
                  '<div style="font-size:0.7rem;color:var(--text2);padding:2px 0;white-space:nowrap">' + p + '</div>'
                );
              })
              .join('');
          previewEl.style.display = 'block';
        });
        fc.addEventListener('mouseout', function (e) {
          var chip = e.target.closest('.template-chip[data-tpl]');
          if (!chip) {
            return;
          }
          if (!e.relatedTarget || !chip.contains(e.relatedTarget)) {
            var previewEl = document.querySelector('.template-preview-chip');
            if (previewEl) previewEl.style.display = 'none';
          }
        });
      }, 200);

      // ============ Keyboard Shortcuts ============
      document.addEventListener('keydown', function (e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
          e.preventDefault();
          undo();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault();
          saveVersion();
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (editor.selectedTrial && editor.selComp) {
            removeComponent(editor.selectedTrial, editor.selComp);
          }
        }
      });

      // ============ Right-click Context Menu ============
      var _ctxMenu = null;
      function showContextMenu(x, y, cid, tid) {
        if (_ctxMenu) _ctxMenu.remove();
        var menu = document.createElement('div');
        menu.style.cssText =
          'position:fixed;left:' +
          x +
          'px;top:' +
          y +
          "px;z-index:6000;background:#fff;border:1px solid #e0e0e8;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,0.15);padding:4px;min-width:140px;font-family:'Inter','Noto Sans SC',sans-serif;font-size:0.78rem";
        var items = [
          {
            label: '📋 Copy Component',
            action: function () {
              var t = findTrial(tid);
              if (!t) return;
              var c = t.components.find(function (c) {
                return c.id === cid;
              });
              if (!c) return;
              var d = JSON.parse(JSON.stringify(c));
              d.id = 'c' + ++editor.cc;
              saveState();
              t.components.push(d);
              renderAll();
            },
          },
          {
            label: '✕ Delete Component',
            action: function () {
              removeComponent(tid, cid);
            },
          },
        ];
        items.forEach(function (item) {
          var row = document.createElement('div');
          row.style.cssText = 'padding:7px 14px;cursor:pointer;border-radius:6px;transition:background 0.1s';
          row.textContent = item.label;
          row.onmouseover = function () {
            row.style.background = '#f5f5fa';
          };
          row.onmouseout = function () {
            row.style.background = '';
          };
          row.onclick = function () {
            item.action();
            menu.remove();
            _ctxMenu = null;
          };
          menu.appendChild(row);
        });
        document.body.appendChild(menu);
        _ctxMenu = menu;
      }
      document.addEventListener('click', function () {
        if (_ctxMenu) {
          _ctxMenu.remove();
          _ctxMenu = null;
        }
      });

      // ============ Save Indicator ============
      var _saveIndicator = null;
      function showSaveIndicator() {
        if (_saveIndicator) clearTimeout(_saveIndicator);
        var el = document.getElementById('save-btn');
        if (!el) return;
        var orig = el.textContent;
        el.textContent = '✓ Saved';
        el.style.color = 'var(--green)';
        _saveIndicator = setTimeout(function () {
          el.textContent = orig;
          el.style.color = '';
        }, 2000);
      }

      // ============ Onboarding ============
      function replayOnboarding() {
        localStorage.removeItem('v3_onboarded');
        startOnboarding();
      }
      function startOnboarding() {
        if (!localStorage.getItem('v3_onboarded')) {
          var steps = [
            {
              title: '👋 Welcome to ExpVis',
              desc: 'A <strong>no-code, visual, interactive</strong> online behavioral experiment editor.<br>Drag components → Free layout → Preview → Participants interact directly.<br>From classic paradigms to custom designs.',
              btn: 'See how it works →',
            },
            {
              title: '🧩 Component-Based Building',
              desc: 'The toolbox on the left provides <strong>components</strong> in two categories:<br><br>📺 <strong>Display</strong> — Text, Shape, Image, Animation, Audio, Video, Fixation<br>🎮 <strong>Response</strong> — Keyboard, Button, Slider, Survey Text<br><br>Drag into a trial node to add. Click a node to edit its properties.<br>Preset templates at the bottom for a quick start.',
              el: 'panel-left',
              btn: 'Next →',
            },
            {
              title: '🧩 Trial Settings',
              desc: 'Click a <strong>trial</strong> (not a component) to open its settings:<br>loop count · randomization · branch condition · trial duration · counter.<br>These become jsPsych <strong>node / trial parameters</strong>, not trials.<br><br>Components stack in a responsive flow — click <strong>⛶ Expand</strong> for a full-window layout preview.',
              el: 'inspector',
              btn: 'Next →',
            },
            {
              title: '🎮 Interactive Fullscreen Preview',
              desc: 'Fullscreen preview is NOT a static screenshot —<br>participants can <strong>press keys, click buttons, drag sliders, type answers</strong>.<br>Auto-records <strong>reaction times</strong> and accuracy.<br><br>Supports 🔀 branching, 🔄 loop countdown,<br>🎲 randomization, 📊 variable tracking.',
              el: 'header',
              btn: 'Next →',
            },
            {
              title: '🤖 AI One-Click Generation',
              desc: 'Not sure where to start?<br>Click <strong>🤖 AI Generate</strong> and describe your experiment in natural language:<br><br><em>"Design a Stroop experiment with red, blue, and green colors, 48 trials"</em><br><br>AI auto-builds the complete experiment structure.<br>Fine-tune it in the visual editor.',
              el: 'canvas-toolbar',
              btn: 'Get Started 🚀',
            },
          ];
          var idx = 0;
          var overlay = document.createElement('div');
          overlay.style.cssText =
            "position:fixed;inset:0;z-index:5000;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;font-family:'Inter','Noto Sans SC',sans-serif";
          var card = document.createElement('div');
          card.style.cssText =
            'background:#fff;border-radius:18px;width:480px;max-width:90vw;padding:36px 40px;box-shadow:0 20px 60px rgba(0,0,0,0.3);text-align:center;transition:all 0.3s';
          function show() {
            var s = steps[idx];

            card.innerHTML =
              '<h2 style="font-size:1.2rem;margin-bottom:8px;color:#1a1a2e">' +
              s.title +
              '</h2><p style="font-size:0.88rem;color:#555;line-height:1.7;margin-bottom:24px">' +
              s.desc +
              '</p><div style="display:flex;gap:8px;justify-content:center;margin-bottom:16px">' +
              steps
                .map(function (_, i) {
                  return (
                    '<div style="width:' +
                    (i === idx ? '20' : '6') +
                    'px;height:6px;border-radius:3px;background:' +
                    (i === idx ? '#6366f1' : i < idx ? '#a5b4fc' : '#e0e0e8') +
                    ';transition:all 0.3s"></div>'
                  );
                })
                .join('') +
              '</div><button id="onboard-btn" style="padding:12px 32px;border-radius:10px;border:none;background:#6366f1;color:#ffffff;cursor:pointer;font-size:0.9rem;font-weight:600;box-shadow:0 4px 16px rgba(99,102,241,0.3);font-family:inherit;transition:all 0.15s">' +
              s.btn +
              '</button>' +
              (idx > 0
                ? '<button id="onboard-skip" style="display:block;margin:8px auto 0;background:none;border:none;color:#888;cursor:pointer;font-size:0.72rem;font-family:inherit">Skip All</button>'
                : '');
            // Dim previous highlights, spotlight current
            document.querySelectorAll('.onboard-spotlight').forEach(function (e) {
              e.classList.remove('onboard-spotlight');
              e.classList.add('onboard-visited');
            });
            if (s.el) {
              var el = document.getElementById(s.el);
              if (el) {
                el.classList.remove('onboard-visited');
                el.classList.add('onboard-spotlight');
                var p = el.parentElement;
                while (p) {
                  p.classList.remove('onboard-visited');
                  p = p.parentElement;
                }
              }
            }
            document.getElementById('onboard-btn').onclick = function () {
              idx++;
              if (idx >= steps.length) {
                document.querySelectorAll('.onboard-spotlight,.onboard-visited').forEach(function (e) {
                  e.classList.remove('onboard-spotlight', 'onboard-visited');
                });
                overlay.remove();
                localStorage.setItem('v3_onboarded', '1');
              } else {
                show();
              }
            };
            var skipBtn = document.getElementById('onboard-skip');
            if (skipBtn)
              skipBtn.onclick = function () {
                document.querySelectorAll('.onboard-spotlight,.onboard-visited').forEach(function (e) {
                  e.classList.remove('onboard-spotlight', 'onboard-visited');
                });
                overlay.remove();
                localStorage.setItem('v3_onboarded', '1');
              };
          }
          overlay.appendChild(card);
          document.body.appendChild(overlay);
          show();
        }
      }
      startOnboarding();
    
// ============ Published Experiment File Generator ============
function generatePublishedFile() {
  // The published file *is* the jsPsych experiment — byte-for-byte the same HTML
  // the code export produces. No data layer, no private runtime: participants run
  // plain jsPsych, and data is handled with jsPsych's own API (displayData /
  // localSave / DataPipe …) exactly as it would be for hand-written code.
  return generateCode();
}

// ============ Export bundle ============
// The experiment file names its assets by path, so the published artifact is a
// bundle rather than a single file. The archive is written here rather than
// pulled from a library: this project has no dependencies, and a stored (not
// deflated) ZIP is a fixed sequence of headers — while deflate would barely help
// on PNG, MP3 and MP4, which are already compressed.

function _utf8Bytes(str) {
  var out = [];
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
    else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
}

// Uploads arrive as data URIs; the archive wants the bytes back.
function _dataUriBytes(uri) {
  var comma = uri.indexOf(',');
  var meta = uri.slice(0, comma);
  var body = uri.slice(comma + 1);
  if (meta.indexOf('base64') < 0) return _utf8Bytes(decodeURIComponent(body));
  var bin = atob(body);
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

var _crcTable = null;
function _crc32(bytes) {
  if (!_crcTable) {
    _crcTable = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      _crcTable[n] = c >>> 0;
    }
  }
  var crc = 0xFFFFFFFF;
  for (var i = 0; i < bytes.length; i++) {
    crc = _crcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// A stored ZIP: local header + data per file, then the central directory, then
// the end record. `files` is [{name, data: Uint8Array}].
function _zipBytes(files) {
  var chunks = [], central = [], offset = 0;
  var now = new Date();
  var dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  var dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  function u16(v) { return [v & 0xFF, (v >> 8) & 0xFF]; }
  function u32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }
  function push(target, arr) { for (var i = 0; i < arr.length; i++) target.push(arr[i]); }

  files.forEach(function (f) {
    var name = _utf8Bytes(f.name);
    var crc = _crc32(f.data);
    var head = [].concat([0x50, 0x4b, 0x03, 0x04], u16(20), u16(0), u16(0),
      u16(dosTime), u16(dosDate), u32(crc), u32(f.data.length), u32(f.data.length),
      u16(name.length), u16(0));
    push(chunks, head);
    push(chunks, name);
    push(chunks, f.data);

    var cd = [].concat([0x50, 0x4b, 0x01, 0x02], u16(20), u16(20), u16(0), u16(0),
      u16(dosTime), u16(dosDate), u32(crc), u32(f.data.length), u32(f.data.length),
      u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset));
    push(central, cd);
    push(central, name);
    offset += head.length + name.length + f.data.length;
  });

  var centralSize = central.length;
  var end = [].concat([0x50, 0x4b, 0x05, 0x06], u16(0), u16(0),
    u16(files.length), u16(files.length), u32(centralSize), u32(offset), u16(0));
  return new Uint8Array(chunks.concat(central, end));
}

function _downloadBlob(blob, filename) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// RFC 4122 v4. `crypto.randomUUID` is the whole implementation on anything
// current; the fallback is for a browser that predates it.
function _uuid() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  var b = new Uint8Array(16);
  if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(b);
  else for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  var h = [].map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' +
    h.slice(16, 20) + '-' + h.slice(20);
}

// This project's JATOS identity, minted once and then kept. Re-exporting and
// re-importing therefore overwrites the same study on the server, which is what
// a researcher revising an experiment wants — the alternative is a new
// near-identical study per revision.
function _jatosIds() {
  if (!editor.jatos || !editor.jatos.study || !editor.jatos.component) {
    editor.jatos = {study: _uuid(), component: _uuid()};
    autoSave();
  }
  return editor.jatos;
}

// The file list a .jzip is packed from, kept separate from the packing so the
// probe can assert the layout without implementing an unzipper.
//
// Layout, from a real one: `info.jas` at the root, and one directory named
// after the study uuid holding the component's HTML and its assets. The stimuli
// address their assets by RELATIVE path (`img/blue.png`), so the HTML and the
// img/ snd/ vid/ directories have to be siblings — an extra component-level
// directory would break every one of them.
function buildJatosFiles(r) {
  var j = _jatosIds();
  var title = editor.projectName || 'ExpVis Experiment';
  var jas = {
    version: '3',
    data: {
      uuid: j.study,
      title: title,
      dirName: j.study,
      componentList: [{
        uuid: j.component,
        title: title,
        htmlFilePath: j.component + '.html',
        reloadable: false,
        active: true,
      }],
      batchList: [],
      groupStudy: false,
      linearStudy: false,
      allowPreview: false,
    },
  };
  var files = [
    {name: 'info.jas', data: _utf8Bytes(JSON.stringify(jas, null, 2))},
    {name: j.study + '/' + j.component + '.html',
     data: _utf8Bytes(_buildJsPsychHTML(r.code, r.usedPlugins, {jatos: true}))},
  ];
  r.assets.forEach(function (a) {
    // _dataUriBytes, not _utf8Bytes: _zipBytes takes bytes, and handing it the
    // data-URI text would write the wrong length and crc.
    files.push({name: j.study + '/' + a.path, data: _dataUriBytes(a.data)});
  });
  return files;
}

// What publishing hands the researcher: the experiment file plus every asset it
// refers to, laid out exactly as the code names them.
function downloadPublishedExperiment(format, compiled) {
  var r = compiled || _compileExperiment({});
  var name = (editor.projectName || 'experiment').replace(/[^a-zA-Z0-9_-]/g, '_');
  // A .jzip is the same experiment in the layout JATOS imports. Its own
  // packaging, not the local bundle plus a manifest: the entries are named
  // after the study uuid, and the HTML carries the platform's script tag.
  if (format === 'jzip') {
    _downloadBlob(new Blob([_zipBytes(buildJatosFiles(r))], {type: 'application/zip'}),
      name + '.jzip');
    return;
  }
  var files = [{name: 'index.html', data: _utf8Bytes(_buildJsPsychHTML(r.code, r.usedPlugins))}];
  r.assets.forEach(function (a) {
    files.push({name: a.path, data: _dataUriBytes(a.data)});
  });
  if (r.assets.length === 0) {
    // Nothing to carry: a bundle of one file is just the file.
    _downloadBlob(new Blob([files[0].data], {type: 'text/html'}), name + '_published.html');
    return;
  }
  _downloadBlob(new Blob([_zipBytes(files)], {type: 'application/zip'}), name + '.zip');
}

// ============ Data Dashboard ============
function showDataDashboard() {
  var expTitle = editor.projectName || 'Untitled';
  var storageKey = 'expvis_data_' + expTitle;
  var allData = [];
  try { allData = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch(e) {}

  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:3500;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;font-family:sans-serif';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  var box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:16px;width:800px;max-width:95vw;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow:hidden';

  var h = '<div style="padding:20px 24px;border-bottom:1px solid #e0e0e8;display:flex;justify-content:space-between;align-items:center">';
  h += '<div><span style="font-weight:800;font-size:1rem">📊 Data Dashboard</span><p style="font-size:0.72rem;color:#888;margin-top:2px">' + expTitle + ' — ' + allData.length + ' sessions</p></div>';
  h += '<div style="display:flex;gap:8px">';
  h += '<button id="db-export-csv" style="padding:6px 14px;border-radius:6px;border:1px solid #e0e0e8;background:#fff;cursor:pointer;font-size:0.75rem;font-family:inherit">📥 Export CSV</button>';
  h += '<button id="db-clear" style="padding:6px 14px;border-radius:6px;border:1px solid #fecaca;background:#fff;color:#ef4444;cursor:pointer;font-size:0.75rem;font-family:inherit">🗑 Clear</button>';
  h += '<button id="db-close" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:#888">✕</button></div></div>';

  h += '<div style="flex:1;overflow-y:auto;padding:16px 24px">';

  if (allData.length === 0) {
    h += '<p style="color:#888;text-align:center;padding:40px">No data collected yet.<br><span style="font-size:0.78rem">Open the published experiment file to collect participant data.</span></p>';
  } else {
    // Summary cards
    var totalTrials = allData.reduce(function(s,d){return s+d.responses.length;},0);
    var totalCorrect = allData.reduce(function(s,d){return s+d.stats.correct;},0);
    var allRTs = [];
    allData.forEach(function(d){ d.responses.forEach(function(r){ allRTs.push(r.rt); }); });
    var avgRT = allRTs.length>0 ? Math.round(allRTs.reduce(function(s,r){return s+r;},0)/allRTs.length) : 0;

    h += '<div style="display:flex;gap:12px;margin-bottom:20px">';
    h += '<div style="flex:1;padding:16px;border-radius:10px;background:#f5f5fa;text-align:center"><div style="font-size:1.8rem;font-weight:800;color:#6366f1">'+allData.length+'</div><div style="font-size:0.7rem;color:#888;margin-top:4px">Sessions</div></div>';
    h += '<div style="flex:1;padding:16px;border-radius:10px;background:#f0fdf4;text-align:center"><div style="font-size:1.8rem;font-weight:800;color:#22c55e">'+totalTrials+'</div><div style="font-size:0.7rem;color:#888;margin-top:4px">Total Trials</div></div>';
    h += '<div style="flex:1;padding:16px;border-radius:10px;background:#fffbeb;text-align:center"><div style="font-size:1.8rem;font-weight:800;color:#f59e0b">'+(totalTrials>0?Math.round(totalCorrect/totalTrials*100):0)+'%</div><div style="font-size:0.7rem;color:#888;margin-top:4px">Accuracy</div></div>';
    h += '<div style="flex:1;padding:16px;border-radius:10px;background:#fff7ed;text-align:center"><div style="font-size:1.8rem;font-weight:800;color:#f97316">'+avgRT+'ms</div><div style="font-size:0.7rem;color:#888;margin-top:4px">Avg RT</div></div>';
    h += '</div>';

    // Session list
    allData.forEach(function(d, di) {
      var sc = d.responses.filter(function(r){return r.correct;}).length;
      var sAvg = d.responses.length>0 ? Math.round(d.responses.reduce(function(s,r){return s+r.rt;},0)/d.responses.length) : 0;
      h += '<div style="margin-bottom:8px;border:1px solid #e0e0e8;border-radius:10px;overflow:hidden">';
      h += '<div style="padding:10px 16px;background:#fafafe;display:flex;align-items:center;gap:12px;cursor:pointer" onclick="var t=this.nextElementSibling;t.style.display=t.style.display===\'none\'?\'block\':\'none\'">';
      h += '<span style="font-weight:700;font-size:0.82rem">#'+(di+1)+'</span>';
      h += '<span style="font-size:0.72rem;color:#888">'+d.time+'</span>';
      h += '<span style="font-size:0.72rem">✅ '+sc+'/'+d.responses.length+'</span>';
      h += '<span style="font-size:0.72rem">⏱ '+sAvg+'ms</span>';
      h += '</div>';
      h += '<div style="display:none;padding:0"><table style="width:100%;font-size:0.7rem;border-collapse:collapse">';
      h += '<tr style="background:#f5f5fa"><th style="padding:6px 12px;text-align:left">Trial</th><th style="padding:6px 12px;text-align:left">Phase</th><th style="padding:6px 12px;text-align:left">Type</th><th style="padding:6px 12px;text-align:left">Response</th><th style="padding:6px 12px;text-align:center">Correct</th><th style="padding:6px 12px;text-align:right">RT (ms)</th></tr>';
      d.responses.forEach(function(r, ri) {
        h += '<tr style="border-bottom:1px solid #f0f0f5"><td style="padding:4px 12px">'+(ri+1)+'</td><td style="padding:4px 12px">'+r.phase+'</td><td style="padding:4px 12px">'+r.type+'</td><td style="padding:4px 12px">'+r.response+'</td><td style="padding:4px 12px;text-align:center">'+(r.correct?'✅':'❌')+'</td><td style="padding:4px 12px;text-align:right">'+r.rt+'</td></tr>';
      });
      h += '</table></div></div>';
    });
  }
  h += '</div>';

  box.innerHTML = h;
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // Event handlers
  document.getElementById('db-close').onclick = function() { overlay.remove(); };
  document.getElementById('db-clear').onclick = function() {
    if (confirm('Delete all collected data for this experiment?')) {
      localStorage.removeItem(storageKey);
      overlay.remove();
      showDataDashboard();
    }
  };
  document.getElementById('db-export-csv').onclick = function() {
    if (allData.length === 0) return;
    var csv = '﻿session,trial,phase,type,response,correct,rt_ms,time\n';
    allData.forEach(function(d) {
      d.responses.forEach(function(r) {
        csv += d.session + ',' + r.trial + ',' + r.phase + ',' + r.type + ',"' + r.response + '",' + r.correct + ',' + r.rt + ',' + r.time + '\n';
      });
    });
    var blob = new Blob([csv], {type: 'text/csv'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = expTitle.replace(/[^a-zA-Z0-9_-]/g,'_') + '_data.csv';
    a.click();
    URL.revokeObjectURL(url);
  };
}