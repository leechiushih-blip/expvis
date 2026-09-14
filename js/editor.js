
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
  'toolbar.add_instructions': {en:'+ Instructions Phase', zh:'+ 指导语阶段'},
  'toolbar.add_trials':       {en:'+ Trials Phase', zh:'+ 实验阶段'},
  'toolbar.add_feedback':     {en:'+ Feedback Phase', zh:'+ 反馈阶段'},
  'toolbar.quick_layout':     {en:'⚡ Quick Layout', zh:'⚡ 快速布局'},
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
 *   Section 4:  Unified Trial Renderer (renderTrialHTML)
 *   Section 5:  Inspector Panel
 *   Section 6:  Preview System (inline + visual editor + fullscreen)
 *   Section 7:  Undo & Quick Layout
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
      };

      // Phase/device labels: storage keeps plain text so that generated jsPsych
      // code carries no decorative emoji. The UI re-adds an icon at render time.
      // _stripEmoji also cleans legacy data saved before this convention.
      var _phaseIcons = {instructions: '📖', trials: '🧪', feedback: '📊'};
      function _stripEmoji(s) {
        return (s || '').replace(
          /^(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]+\s*)+/u,
          '',
        );
      }
      function _phaseLabel(ph) {
        var icon = _phaseIcons[ph.type];
        return (icon ? icon + ' ' : '') + _stripEmoji(ph.name);
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

      function addPhase(type) {
        var labels = {instructions: 'Instructions', trials: 'Trials', feedback: 'Feedback'};
        saveState();
        editor.phases.push({
          id: 'ph' + ++editor.pc,
          type: type,
          name: labels[type] || type,
          color: type === 'instructions' ? 'i' : type === 'feedback' ? 'f' : 't',
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

        editor.phases.forEach(function (ph, i) {
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
          hdr.innerHTML =
            '<span class="drag-handle" draggable="true" title="Drag to reorder phase">⋮⋮</span><span class="phase-index ' +
            ph.color +
            '">' +
            (i + 1) +
            '</span><span style="font-weight:700;font-size:0.82rem">' +
            _phaseLabel(ph) +
            '</span><span style="font-size:0.68rem;color:var(--text2)">' +
            ph.timeline.length +
            ' trials</span><button data-phase="' +
            ph.id +
            '" class="phase-delete-btn" style="margin-left:auto;background:none;border:none;color:var(--red);cursor:pointer;font-size:0.7rem;opacity:0.4;padding:2px 8px;border-radius:4px" title="Delete this phase">✕ Delete</button>';
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
              visualComps.forEach(function (c) {
                var isStim = c.cat === 's' && c.type !== 'fixation';
                if (isStim && curSimul && curSimul.simul) {
                  curSimul.comps.push(c);
                } else {
                  curSimul = {simul: isStim, comps: [c]};
                  steps.push(curSimul);
                }
              });

              // One row per presentation step, numbered down a gutter, so the
              // ORDER reads top-to-bottom. Components that share a step stay side
              // by side inside it — stacking them vertically would read as
              // "one after another", the opposite of what a group means.
              steps.forEach(function (step, si) {
                var stepRow = document.createElement('div');
                stepRow.className = 'flow-step';
                var num = document.createElement('span');
                num.className = 'flow-step-num';
                num.textContent = si + 1;
                num.title = 'Presentation step ' + (si + 1) +
                  (step.simul && step.comps.length > 1
                    ? ' — ' + step.comps.length + ' components shown together on one screen'
                    : '');
                stepRow.appendChild(num);

                var box;
                if (step.simul && step.comps.length > 1) {
                  box = document.createElement('div');
                  box.className = 'flow-step-simul';
                  var tag = document.createElement('span');
                  tag.className = 'flow-step-tag';
                  tag.textContent = '同时呈现';
                  tag.title = step.comps.length +
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

      function _renderTrialSettings(insp) {
        var t = findTrial(editor.selectedTrial);
        if (!t) { insp.innerHTML = ''; return; }
        var h = '';
        h += '<div style="padding-bottom:10px;border-bottom:1px solid var(--border);margin-bottom:14px">';
        h += '<div style="font-weight:700;font-size:0.85rem">Trial Settings</div>';
        h += '<div style="font-size:0.66rem;color:var(--text2);margin-top:3px;line-height:1.5">' +
             'Parameters of this jsPsych trial. Leave a field empty to remove it.</div>';
        h += '</div>';
        // A real jsPsych parameter. A response component with its own
        // trial_duration takes precedence — they are the same parameter.
        h += _settingRow('Trial Duration', 'jsPsych trial_duration (ms)',
          '<input type="number" min="0" style="' + _SET_INPUT_CSS + '" value="' + (t.trial_duration || '') +
          '" placeholder="e.g. 1200" onchange="_setTrialField(\'' + t.id + '\',\'trial_duration\',this.value)">');
        insp.innerHTML = h;
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
        var h = '';
        var sc = t.components.find(function (c) {
          return c.id === editor.selComp;
        });
        if (sc) {
          var c = sc;
          var compDesc = {
            text: 'Click a text node in the flow, then edit content, font size, color, weight, and position in this panel. Multi-line text supported — line breaks become &lt;br&gt;.',
            shape: 'Select shape type (circle/square/triangle/diamond/star), size, and color. Use with 🎲 randomize pick-one mode to show one random shape per trial.',
            image: 'Upload a local image (≤4MB), stored as base64. When this is the only thing on screen the trial runs on the official jsPsych image plugin for its response type (as the jsPsych RT-task demo does); mixed with other components it is inlined as <img> instead.',
            stimulus_width: 'Image width in px. When the trial shows this image alone it becomes the image plugin\'s stimulus_width.',
            stimulus_height: 'Image height in px. 0 = work it out from the width.',
            maintain_aspect_ratio: 'true = scale by width without distorting. Only used by the image plugins.',
            render_on_canvas: 'true = draw the image to a canvas. Only used by the image plugins.',
            animation: 'Runs on the jsPsych animation plugin — a flipbook of frames played at a fixed rate. The trial ends on its own after sequence_reps, and every key pressed during playback is recorded. It takes over the whole screen, so it cannot share a trial with other components.',
            audio: 'Upload MP3/WAV audio (≤16MB). Playable in fullscreen preview. Ideal for auditory stimulus experiments.',
            video: 'Upload MP4/WebM video (≤64MB). Playable in fullscreen preview.',
            fixation: 'Cross fixation point. duration(ms) controls display time. In fullscreen preview, the fixation appears first then auto-disappears after duration.',
            keyboard: 'Runs on the jsPsych html-keyboard-response plugin. choices is the list of allowed keys — leave it empty for any key. correctKey scores the trial. Data records response as the key character, plus rt.',
            button: 'Runs on the jsPsych html-button-response plugin — every field here maps to a parameter of the same name in the official docs. choices is the list of button labels. Data records response as the button\'s 0-based INDEX (0 = first choice), not its label.',
            slider: 'Runs on the jsPsych html-slider-response plugin — every field here maps to a parameter of the same name in the official docs. Data records response as a number, plus rt and slider_start.',
            textInput: 'Runs on the jsPsych survey-text plugin — a free-text question with its own submit button. There is no right answer and no trial_duration; the trial ends when the participant submits. Data records response as an object keyed by Data Name, e.g. {Q0: "..."}, plus rt.',
          };
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
              '</span></div><p style="font-size:0.6rem;color:var(--text2);margin:0 0 4px">JPG/PNG/GIF/WebP/SVG/BMP, max 4MB</p>';
          }
          if (c.type === 'audio') {
            h +=
              '<div class="prop-row"><label>Upload Audio</label><label id="aud-upload-label" style="padding:6px 12px;background:var(--orange);color:#ffffff;border-radius:6px;cursor:pointer;font-size:0.75rem;display:inline-block">🎵 Select File</label><input type="file" id="aud-file-input" accept="audio/*" data-tid="' +
              t.id +
              '" data-cid="' +
              c.id +
              '" style="display:none"><span id="aud-file-name" style="font-size:0.7rem;color:var(--text2);margin-left:8px">' +
              (c.fileName || 'No file selected') +
              '</span></div><p style="font-size:0.6rem;color:var(--text2);margin:0 0 4px">MP3/WAV/OGG/M4A/AAC, max 16MB</p>';
          }
          if (c.type === 'video') {
            h +=
              '<div class="prop-row"><label>Upload Video</label><label id="vid-upload-label" style="padding:6px 12px;background:var(--green);color:#ffffff;border-radius:6px;cursor:pointer;font-size:0.75rem;display:inline-block">🎬 Select File</label><input type="file" id="vid-file-input" accept="video/*" data-tid="' +
              t.id +
              '" data-cid="' +
              c.id +
              '" style="display:none"><span id="vid-file-name" style="font-size:0.7rem;color:var(--text2);margin-left:8px">' +
              (c.fileName || 'No file selected') +
              '</span></div><p style="font-size:0.6rem;color:var(--text2);margin:0 0 4px">MP4/WebM/OGG/MOV, max 64MB</p>';
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

      // The button group exactly as jsPsychHtmlButtonResponse builds it, so the
      // preview and the exported experiment agree by construction. The grid
      // maths is copied from the plugin's own source:
      //   n_cols = grid_columns === null ? ceil(n / grid_rows) : grid_columns
      //   n_rows = grid_rows    === null ? ceil(n / grid_columns) : grid_rows
      // `.jspsych-btn-group-grid` (jspsych.css) uses max-content columns, which
      // is also what stops many buttons from overflowing the way a plain flex
      // row did.
      function _previewButtonGroup(c) {
        var choices = Array.isArray(c.choices) ? c.choices : [];
        var n = choices.length || 1;
        var isFlex = (c.button_layout || 'grid') === 'flex';
        var cls = isFlex ? 'jspsych-btn-group-flex' : 'jspsych-btn-group-grid';
        var groupStyle = '';
        if (!isFlex) {
          var rows = Number(c.grid_rows) || 1;        // jsPsych default: 1
          var cols = Number(c.grid_columns) || null;  // jsPsych default: null
          var nCols = cols === null ? Math.ceil(n / rows) : cols;
          var nRows = cols === null ? rows : Math.ceil(n / cols);
          groupStyle = 'grid-template-columns:repeat(' + nCols + ',1fr);' +
                       'grid-template-rows:repeat(' + nRows + ',1fr);';
        }
        // The default button_html inserts the choice as markup, unescaped — match it.
        var html = '<div data-cid="' + c.id + '" class="' + cls + '" style="' + groupStyle + '">' +
          choices.map(function (label, i) {
            return '<button type="button" class="jspsych-btn" data-choice="' + i + '">' +
              label + '</button>';
          }).join('') + '</div>';
        if (c.prompt) html += '<div style="text-align:center">' + c.prompt + '</div>';
        return html;
      }

      // The slider widget exactly as jsPsychHtmlSliderResponse builds it. The
      // label positioning maths (including the half-thumb-width correction) is
      // copied from the plugin's dist/index.js so the preview matches the output.
      function _previewSlider(c) {
        var min = c.min == null ? 0 : c.min;
        var max = c.max == null ? 100 : c.max;
        var step = c.step || 1;
        var start = c.slider_start == null ? 50 : c.slider_start;
        var labels = (Array.isArray(c.labels) ? c.labels : [])
          .filter(function (x) { return x !== ''; });
        var width = Number(c.slider_width) || 0;
        var html = '<div data-cid="' + c.id + '" class="jspsych-html-slider-response-container" ' +
          'style="position:relative;margin:0 auto 3em auto;' +
          (width ? 'width:' + width + 'px;' : 'width:auto;') + '">' +
          '<input type="range" class="jspsych-slider" id="jspsych-html-slider-response-response" ' +
          'value="' + start + '" min="' + min + '" max="' + max + '" step="' + step + '">' +
          '<div>';
        for (var j = 0; j < labels.length; j++) {
          var per = 100 / (labels.length - 1);
          var at = j * per;
          var off = ((at - 50) / 50) * 100 * 7.5 / 100;
          html += '<div style="border:1px solid transparent;display:inline-block;position:absolute;' +
            'left:calc(' + at + '% - (' + per + '% / 2) - ' + off + 'px);' +
            'text-align:center;width:' + per + '%;">' +
            '<span style="text-align:center;font-size:80%;">' + labels[j] + '</span></div>';
        }
        html += '</div></div>';
        if (c.prompt) html += '<div style="text-align:center">' + c.prompt + '</div>';
        var reqMove = (c.require_movement === true || c.require_movement === 'true');
        html += '<button type="button" id="jspsych-html-slider-response-next" class="jspsych-btn"' +
          (reqMove ? ' disabled' : '') + '>' + (c.button_label || 'Continue') + '</button>';
        return html;
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
      function renderTrialHTML(t, opts) {
        opts = opts || {};
        var s = opts.scale || 1;
        var h = '';
        // With randomize(pick-one) only ONE variant is shown per trial, so the
        // preview must render a single variant too — otherwise every variant stacks
        // up in the flow layout and the preview misrepresents the experiment.
        var _rnd = null;
        for (var _ri = 0; _ri < t.components.length; _ri++) {
          if (t.components[_ri].type === 'randomize') { _rnd = t.components[_ri]; break; }
        }
        var _variantStart = -1, _variantShown = -1;
        if (_rnd && _rnd.mode !== 'shuffle') {
          var _rndIdx = t.components.indexOf(_rnd);
          for (var _k = _rndIdx + 1; _k < t.components.length; _k++) {
            var _cc = t.components[_k];
            if (_cc.cat === 's' && ['text','shape','image','audio','video','fixation'].indexOf(_cc.type) >= 0) {
              if (_variantStart < 0) { _variantStart = _k; _variantShown = _k; }
            }
          }
        }
        var _compIdx = -1;
        // jsPsychAnimation clears the display element on every frame, so when a
        // trial contains one, the animation is all the participant will see.
        var _animTrial = t.components.some(function (c) { return c.type === 'animation'; });
        t.components.forEach(function (c) {
          _compIdx++;
          if (_animTrial && c.type !== 'animation') return;
          // in pick-one, skip every variant but the first
          if (_variantStart >= 0 && _compIdx > _variantStart &&
              c.cat === 's' && ['text','shape','image','audio','video','fixation'].indexOf(c.type) >= 0) {
            return;
          }
          var al = c.position === 'left' ? 'flex-start' : c.position === 'right' ? 'flex-end' : 'center';
          var ta = c.position === 'left' ? 'left' : c.position === 'right' ? 'right' : 'center';
          var px = '';
          var wrapperW = 'width:100%;';
          if (c.type === 'text') {
            var fs = Math.round(c.fontSize * s);
            h +=
              '<div data-cid="' +
              c.id +
              '" style="' +
              px +
              'display:flex;justify-content:' +
              al +
              ';' +
              wrapperW +
              '"><span style="font-size:' +
              fs +
              'px;color:' +
              c.color +
              ';font-weight:' +
              (c.fontWeight || 'bold') +
              ';text-align:' +
              ta +
              ';line-height:1.5;max-width:800px;word-wrap:break-word;overflow-wrap:break-word;display:inline-block">' +
              (c.content || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>') +
              '</span></div>';
          } else if (c.type === 'shape') {
            h +=
              '<div data-cid="' +
              c.id +
              '" style="' +
              px +
              'display:flex;justify-content:' +
              al +
              ';' +
              wrapperW +
              '"><div style="width:' +
              Math.round(c.size * s) +
              'px;height:' +
              Math.round(c.size * s) +
              'px;background:' +
              c.color +
              ';' +
              getShapeCSS(c.shape, c.color) +
              '"></div></div>';
          } else if (c.type === 'fixation')
            h +=
              '<div data-cid="' +
              c.id +
              '" style="' +
              px +
              'font-size:' +
              Math.round(40 * s) +
              'px;color:#ccc;font-weight:300">+</div>';
          else if (c.type === 'image') {
            if (c.fileData)
              h +=
                '<div data-cid="' +
                c.id +
                '" style="' +
                px +
                'display:flex;justify-content:' +
                al +
                ';' +
                wrapperW +
                '"><img src="' +
                c.fileData +
                // show it at the width the trial will actually use
                '" style="max-width:' +
                Math.round((c.stimulus_width || 200) * s) +
                'px;max-height:' +
                Math.round(300 * s) +
                'px;border-radius:8px;object-fit:contain"></div>';
          } else if (c.type === 'audio') {
            if (c.fileData)
              h +=
                '<div data-cid="' +
                c.id +
                '" style="' +
                px +
                'display:inline-flex;align-items:center;gap:8px;padding:8px 14px;background:#f5f5fa;border-radius:10px;border:1px solid #e0e0e8"><span style="font-size:' +
                Math.round(22 * s) +
                'px;cursor:pointer" onclick="var a=this.nextElementSibling;a.paused?a.play():a.pause();this.textContent=a.paused?\'▶️\':\'⏸️\'">▶️</span><audio src="' +
                c.fileData +
                '" style="display:none"></audio><span style="font-size:' +
                Math.round(11 * s) +
                'px;color:var(--text2)">' +
                (c.fileName || 'Audio') +
                '</span></div>';
            else h += '<span style="color:#aaa">🎵 Audio</span>';
          } else if (c.type === 'video') {
            if (c.fileData)
              h +=
                '<video controls src="' +
                c.fileData +
                '" style="max-width:' +
                Math.round(360 * s) +
                'px;max-height:' +
                Math.round(280 * s) +
                'px;border-radius:8px"></video>';
            else h += '<span style="color:#aaa">🎬 Video</span>';
          } else if (c.type === 'keyboard') {
            h += '<div data-cid="' + c.id + '" style="' + px + 'display:flex;flex-direction:column;align-items:center;gap:' + Math.round(6 * s) + 'px">';
            if (c.prompt) h += '<span style="font-size:' + Math.round(13 * s) + 'px;color:#888">' + c.prompt + '</span>';
            h += '<div style="display:flex;gap:' + Math.round(8 * s) + 'px;justify-content:center">';
            var keyList = Array.isArray(c.choices) ? c.choices : [];
            // An empty list is ALL_KEYS, so say so rather than drawing nothing.
            if (!keyList.length) keyList = ['any key'];
            keyList.forEach(function (k) {
              var displayKey = String(k).trim() || 'space';
              h += '<span style="padding:' + Math.round(10 * s) + 'px ' + Math.round(22 * s) + 'px;border-radius:' + Math.round(10 * s) + 'px;background:#fff7ed;border:2px solid rgba(245,158,11,0.15);color:#f97316;font-weight:700;font-size:' + Math.round(15 * s) + 'px;box-shadow:0 2px 6px rgba(0,0,0,0.05)">' + displayKey + '</span>';
            });
            h += '</div></div>';
          } else if (c.type === 'button')
            // Mirrors the DOM jsPsychHtmlButtonResponse builds, so what the
            // preview shows is what the exported experiment renders. The grid
            // row/column maths is copied from the plugin's own source.
            h += _previewButtonGroup(c);
          else if (c.type === 'slider')
            // Mirrors the DOM jsPsychHtmlSliderResponse builds, so the preview and
            // the exported experiment agree — including the plugin's label maths.
            h += _previewSlider(c);
          else if (c.type === 'animation') h += _previewAnimation(c);
          else if (c.type === 'textInput') h += _previewSurveyText(c);
          // NB: delay has no branch here on purpose. It generates its own jsPsych
          // trial (trial_duration), so it is not part of the stimulus the
          // participant sees and must not appear in the preview either.
        });
        return h;
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
        h += '<div style="' + innerStyle + 'display:flex;flex-direction:column;justify-content:center;align-items:center;gap:0.9em;padding:1.2em;box-sizing:border-box;overflow:auto">' +
             renderTrialHTML(t, {scale: 1}) + '</div>';
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
        // Same stage the exported experiment builds: device width, device height,
        // content centred inside it. The product gets the centring from jsPsych's
        // own display area; here there is no jsPsych, so it is done inline.
        h += '<div id="exp-prev-stage" style="margin:0 auto;background:#fff;' +
             'border-radius:10px;box-shadow:0 6px 28px rgba(0,0,0,.12);' +
             'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
             'gap:1.5em;padding:2em;box-sizing:border-box;' +
             'width:' + dev.w + 'px;min-height:' + dev.h + 'px"></div>';
        h += '</div>';

        box.innerHTML = h;
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        document.getElementById('exp-prev-stage').innerHTML = renderTrialHTML(t, {scale: 1});
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
          html = generateCode();
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

      // Under flow layout the order of the components array IS the order they
      // appear on screen, so "quick layout" means moving the response components
      // below the display ones. Logic components keep their position relative to
      // the display components — `randomize` in particular has to stay above the
      // stimuli it picks from.
      function quickLayout() {
        if (!editor.selectedTrial) {
          alert('Please select a trial first');
          return;
        }
        var t = findTrial(editor.selectedTrial);
        if (!t || t.components.length === 0) {
          alert('Trial is empty');
          return;
        }
        if (!t.components.some(function (c) { return c.cat !== 'r'; })) {
          alert('No visual elements to arrange');
          return;
        }
        saveState();
        t.components = t.components
          .filter(function (c) { return c.cat !== 'r'; })
          .concat(t.components.filter(function (c) { return c.cat === 'r'; }));
        // Alignment is the only positional control left.
        t.components.forEach(function (c) {
          if (['text', 'shape', 'image'].indexOf(c.type) >= 0) c.position = 'center';
        });
        autoSave();
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
          addPhase('instructions');
          var p1 = editor.phases[0].id;
          addTrial(p1);
          addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'button', 'r');
          var t1 = findTrial(editor.selectedTrial);
          sc(t1, 0, {content: 'Welcome to the Stroop experiment!\n\nYou will see color words (RED, BLUE, GREEN) displayed in different font colors.\nYour task is to respond to the FONT COLOR, ignoring the word meaning.\n\nRed font → Press A\nBlue font → Press L\nGreen font → Press K\n\nRespond as quickly and accurately as possible!', fontSize: 20, position: 'center'});
          sc(t1, 1, {choices: ['Start Experiment']});
          // Phase 2: Stroop trials — 9 variants (3 colors × 3 characters)
          addPhase('trials');
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
          addPhase('feedback');
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
          addPhase('instructions');
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
          addPhase('trials');
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
          addPhase('feedback');
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
          addPhase('instructions');
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
          addPhase('trials');
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
          addPhase('feedback');
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
          addPhase('instructions');
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
          addPhase('trials');
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
          addPhase('feedback');
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
          addPhase('instructions');
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
          addPhase('trials');
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
          addPhase('feedback');
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
        if (editor.phases.length === 0) {
          return { code: '// No experiment created yet\n', usedPlugins: {} };
        }
        var dev = editor.device || {w: 1280, h: 720};
        // Collect jsPsych plugins actually used by this experiment, so the
        // generated HTML only loads what it needs.
        var _usedPlugins = {};
        // Media (image/audio/video) is emitted once as a named variable and then
        // shared between the preload trial and the stimulus HTML. Components
        // carry base64 data URIs, so inlining them twice would double file size.
        var _mediaVars = {};
        var _mediaDecls = [];
        function _mediaRefData(data, type) {
          if (!data) return null;
          if (_mediaVars[data]) return _mediaVars[data];
          var name = 'EXP_MEDIA_' + _mediaDecls.length;
          _mediaVars[data] = name;
          _mediaDecls.push({name: name, type: type || 'image', data: data});
          return name;
        }
        function _mediaRef(c) {
          return _mediaRefData(c.fileData, c.type);
        }
        // The stage every stimulus is laid out on. jsPsych's own
        // `.jspsych-content-wrapper { margin:auto }` centres this block, so it
        // needs no justify-content of its own. The width is the device the
        // experiment was designed for; the height lives on the display element
        // (see _deviceStyle) because the plugins append their own controls AFTER
        // the stimulus, and a stage as tall as the device would push them off it.
        function _stage(innerHTML) {
          return '<div style="display:flex;flex-direction:column;align-items:center;' +
            'gap:1.5em;padding:2em;box-sizing:border-box;width:' + dev.w + 'px">' +
            innerHTML + '</div>';
        }

        // Turn stimulus HTML into a single-quoted JS string. Placeholders left by
        // compHTML() become variable concatenations AFTER quote-escaping, so the
        // escaped HTML and the live expression don't interfere.
        function _jsStr(html) {
          return html.replace(/'/g, "\\'").replace(/@@(\w+)@@/g, "' + $1 + '");
        }
        var code = '';
        var onFinishBody = opts.onFinish || 'jsPsych.data.displayData();';
        code += 'var jsPsych = initJsPsych({\n';
        if (opts.displayElement) {
          code += "  display_element: '" + opts.displayElement + "',\n";
        }
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

        // Build styled stimulus HTML for a component (mirrors renderTrialHTML style)
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
                ? '<img src="@@' + _mediaRef(c) + '@@" style="' + px + 'max-width:' +
                  (c.stimulus_width || 200) + 'px">'
                : '';
            case 'audio':
              return c.fileData
                ? '<audio controls src="@@' + _mediaRef(c) + '@@" style="' + px + '"></audio>'
                : '';
            case 'video':
              return c.fileData
                ? '<video controls src="@@' +
                    _mediaRef(c) +
                    '@@" style="' +
                    px +
                    'max-width:' +
                    (c.width || 320) +
                    'px"></video>'
                : '';
            default:
              return '';
          }
        }

        editor.phases.forEach(function (ph, phi) {
          code += '// ── ' + _stripEmoji(ph.name) + ' (' + (phi + 1) + '/' + editor.phases.length + ') ──\n';
          ph.timeline.forEach(function (t, ti) {
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
            if (!respType) {
              respType = 'keyboard';
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

            // Semantic, stable names in the generated code: the phase type plus
            // the trial's index within that phase.
            var _slug = ph.type === 'instructions' ? 'instructions'
                      : ph.type === 'feedback' ? 'feedback' : 'trials';
            var trialName = _slug + '_trial_' + (ti + 1);
            var pname = pluginName(respType, useImagePlugin);

            // ---- jsPsychAnimation owns the display element, so it is emitted as
            // the whole trial rather than as one parameter among others. ----
            if (respType === 'animation') {
              var _fr = respInfo.frames || [];
              if (!_fr.length) {
                logic.hints.push('// !! This animation has no frames uploaded — nothing to play.');
              }
              logic.hints.forEach(function (h) { code += h + '\n'; });
              // ExpVis carries no node-level parameters, so every trial is a flat
              // trial. Provenance data and the ALL_KEYS default are left out too.
              var _a = '  ';
              code += 'var ' + trialName + ' = {\n';
              code += _a + 'type: jsPsychAnimation,\n';
              code += _a + 'stimuli: [' + _fr.map(function (f) {
                return _mediaRefData(f.fileData, 'image');
              }).join(', ') + '],\n';
              code += _a + 'frame_time: ' + (respInfo.frameTime || 250) + ',\n';
              if (respInfo.frameIsi) code += _a + 'frame_isi: ' + respInfo.frameIsi + ',\n';
              if (respInfo.sequenceReps && respInfo.sequenceReps !== 1) {
                code += _a + 'sequence_reps: ' + respInfo.sequenceReps + ',\n';
              }
              // "ALL_KEYS" is the plugin default, so only a named key list is written.
              if (respInfo.animChoices !== 'ALL_KEYS') {
                code += _a + 'choices: [' + respInfo.animChoices.map(function (k) {
                  return '"' + String(k).replace(/"/g, '\\"') + '"';
                }).join(', ') + '],\n';
              }
              if (respInfo.prompt) code += _a + "prompt: '" + _jsStr(String(respInfo.prompt)) + "',\n";
              if (!respInfo.renderOnCanvas) code += _a + 'render_on_canvas: false,\n';
              // strip the trailing comma off the last property
              code = code.replace(/,\n$/, '\n');
              code += '};\n';
              code += 'timeline.push(' + trialName + ');\n\n';
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
            // The stage is pinned to the device width, so what the researcher laid
            // out is the box the participant gets. The HEIGHT is not set here: the
            // plugins append their own controls *after* the stimulus, so a stage as
            // tall as the device would push buttons and sliders off the bottom of
            // the screen. The design height is applied to jsPsych's display area
            // instead — see _deviceStyle().
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

            // Emit hints for remaining unsupported logic
            logic.hints.forEach(function (h) {
              code += h + '\n';
            });

            // A node holding exactly one trial and carrying no node-level
            // parameters IS just a trial, so it is emitted flat — the shape
            // hand-written jsPsych uses. A wrapper is needed only when the node
            // really holds more than one trial, i.e. when it has extra timed
            // segments around the stimulus.
            var _plainNode = preTiming.length === 0 && postTiming.length === 0;

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
              L(ei, '{');
              L(ei + 1, 'type: jsPsychHtmlKeyboardResponse,');
              L(ei + 1, "stimulus: '" + _jsStr(_stage(stim)) + "',");
              L(ei + 1, "choices: 'NO_KEYS',");
              // A Max > Min range turns the duration into a dynamic parameter, the
              // same idiom the jsPsych rt-task demo uses for its jittered fixation.
              var _lo = Number(c.durationMin) || 0, _hi = Number(c.durationMax) || 0;
              if (_hi > _lo) {
                var _step = Number(c.durationStep) || 250;
                var _vals = [];
                for (var _v = _lo; _v <= _hi; _v += _step) _vals.push(_v);
                if (_vals[_vals.length - 1] !== _hi) _vals.push(_hi);
                L(ei + 1, 'trial_duration: function () {');
                L(ei + 2, 'return jsPsych.randomization.sampleWithoutReplacement(' +
                          JSON.stringify(_vals) + ', 1)[0];');
                L(ei + 1, '},');
              } else {
                L(ei + 1, 'trial_duration: ' + (c.trial_duration || 0) + ',');
              }
              L(ei, '},');
            }
            preTiming.forEach(emitTimingTrial);


            if (!_plainNode) L(ei, '{');
            var indent = _plainNode ? 1 : ei + 1;
            L(indent, 'type: ' + pname + ',');
            // survey-text has no `stimulus` — its equivalent is `preamble`, the
            // HTML shown above the questions.
            var _stimKey = respType === 'textInput' ? 'preamble' : 'stimulus';
            {
              if (useImagePlugin) {
                // The picture itself, as the image plugins expect.
                L(indent, 'stimulus: ' + _mediaRef(imageOnlyComp) + ',');
              } else if (preHTML || postStims.length > 0) {
                L(indent, _stimKey + ": '" + fullStimHTML + "',");
              } else if (respType === 'button' || respType === 'slider') {
                // The button and slider plugins both expect `stimulus`; omitting
                // it makes them render the literal string "undefined".
                L(indent, "stimulus: '',");
              }
              if (respInfo.choices === 'ALL_KEYS') {
                // "ALL_KEYS" is the plugin's own default, so it is left out — the
                // trial behaves identically and the code reads like hand-written
                // jsPsych. A named key list still has to be written out.
              } else if (respInfo.choices && respInfo.choices.length) {
                L(indent,'choices: [' + respInfo.choices.map(function (x) { return '"' + x + '"'; }).join(',') + '],');
              }
            }
            // ---- jsPsychHtmlButtonResponse parameters, emitted under their own
            // names. Anything left at 0 / default is omitted, so jsPsych applies
            // its documented default instead of an ExpVis invention.
            if (respType === 'button') {
              if (respInfo.prompt) L(indent, "prompt: '" + _jsStr(String(respInfo.prompt)) + "',");
              if (respInfo.buttonLayout) L(indent, "button_layout: '" + respInfo.buttonLayout + "',");
              if (respInfo.gridRows) L(indent, 'grid_rows: ' + respInfo.gridRows + ',');
              if (respInfo.gridColumns) L(indent, 'grid_columns: ' + respInfo.gridColumns + ',');
              if (respInfo.stimulusDuration) L(indent, 'stimulus_duration: ' + respInfo.stimulusDuration + ',');
              if (respInfo.enableButtonAfter) L(indent, 'enable_button_after: ' + respInfo.enableButtonAfter + ',');
              // `=== false`, not `!x`: a trial with no response component gets a
              // fresh respInfo, and `!undefined` would wrongly emit a false here.
              if (respInfo.responseEndsTrial === false) L(indent, 'response_ends_trial: false,');
            }
            if (respType === 'textInput') {
              var _q = respInfo.question;
              L(indent, 'questions: [{');
              L(indent + 1, "prompt: '" + _jsStr(_q.prompt) + "',");
              if (_q.placeholder) L(indent + 1, "placeholder: '" + _jsStr(_q.placeholder) + "',");
              L(indent + 1, "name: '" + _q.name.replace(/'/g, "\\'") + "',");
              if (_q.required) L(indent + 1, 'required: true,');
              if (_q.rows > 1) L(indent + 1, 'rows: ' + _q.rows + ',');
              if (_q.columns !== 40) L(indent + 1, 'columns: ' + _q.columns + ',');
              L(indent, '}],');
              if (respInfo.buttonLabel)
                L(indent, "button_label: '" + _jsStr(String(respInfo.buttonLabel)) + "',");
              if (respInfo.autocomplete) L(indent, 'autocomplete: true,');
            }
            if (useImagePlugin) {
              var _imc = imageOnlyComp;
              if (_imc.stimulus_width) L(indent, 'stimulus_width: ' + _imc.stimulus_width + ',');
              if (_imc.stimulus_height) L(indent, 'stimulus_height: ' + _imc.stimulus_height + ',');
              if (_imc.maintain_aspect_ratio === false || _imc.maintain_aspect_ratio === 'false')
                L(indent, 'maintain_aspect_ratio: false,');
              if (_imc.render_on_canvas === false || _imc.render_on_canvas === 'false')
                L(indent, 'render_on_canvas: false,');
            }
            if (respType === 'keyboard') {
              if (respInfo.stimulusDuration) L(indent, 'stimulus_duration: ' + respInfo.stimulusDuration + ',');
              if (respInfo.responseEndsTrial === false) L(indent, 'response_ends_trial: false,');
              if (respInfo.waitForKeyRelease) L(indent, 'wait_for_key_release: true,');
            }
            if (respType === 'slider') {
              if (respInfo.min != null) L(indent, 'min: ' + respInfo.min + ',');
              if (respInfo.max != null) L(indent, 'max: ' + respInfo.max + ',');
              if (respInfo.step != null) L(indent, 'step: ' + respInfo.step + ',');
              if (respInfo.sliderStart) L(indent, 'slider_start: ' + respInfo.sliderStart + ',');
              if (respInfo.labels && respInfo.labels.length)
                L(indent, 'labels: [' + respInfo.labels.map(function (x) {
                  return '"' + String(x).replace(/"/g, '\\"') + '"';
                }).join(', ') + '],');
              if (respInfo.buttonLabel) L(indent, "button_label: '" + _jsStr(String(respInfo.buttonLabel)) + "',");
              if (respInfo.sliderWidth) L(indent, 'slider_width: ' + respInfo.sliderWidth + ',');
              if (respInfo.requireMovement) L(indent, 'require_movement: true,');
              if (respInfo.prompt) L(indent, "prompt: '" + _jsStr(String(respInfo.prompt)) + "',");
              if (respInfo.stimulusDuration) L(indent, 'stimulus_duration: ' + respInfo.stimulusDuration + ',');
              if (respInfo.responseEndsTrial === false) L(indent, 'response_ends_trial: false,');
            }
            // trial_duration is the same jsPsych parameter for either plugin; a
            // button trial reads it off the button component, everything else off
            // the keyboard component.
            var _trialDuration = (respType === 'button' ? respInfo.trialDuration : logic.trial_duration) ||
              t.trial_duration;
            if (_trialDuration && respType !== 'textInput') {
              L(indent, 'trial_duration: ' + _trialDuration + ',');
            }
            if (respType === 'keyboard' && (respInfo.prompt || stims.length === 0))
              L(indent, "prompt: '" + _jsStr(respInfo.prompt || '<p>Press any key to continue</p>') + "',");

            // --- scoring ---
            // `data` is written only when it carries something the analysis needs.
            // Provenance fields are not added automatically: jsPsych records
            // trial_index and trial_type on its own.
            var hasScore = !!correctResponseExpr;
            if (correctResponseExpr) {
              L(indent, 'data: {correct_response: ' + correctResponseExpr + '},');
              L(indent, 'on_finish: function(data) {');
              L(indent + 1, 'data.correct = jsPsych.pluginAPI.compareKeys(data.response, data.correct_response);');
              L(indent, '},');
            }
            // strip the trial's trailing property comma, then close the entry
            var last = lines[lines.length - 1];
            if (last.slice(-1) === ',') lines[lines.length - 1] = last.slice(0, -1);
            if (!_plainNode) L(ei, '},');

            postTiming.forEach(emitTimingTrial);

            // strip the trailing comma of the last timeline entry
            var tlLast = lines[lines.length - 1];
            if (tlLast.slice(-1) === ',') lines[lines.length - 1] = tlLast.slice(0, -1);

            if (!_plainNode) L(1, ']');
            L(0, '};');

            code += lines.join('\n') + '\n';
            code += 'timeline.push(' + trialName + ');\n\n';
          });
        });

        code += 'jsPsych.run(timeline);\n';
        // Assemble the media block now that every component has been scanned:
        // one declaration per unique asset, plus a preload trial up front.
        var mediaBlock = '';
        if (_mediaDecls.length > 0) {
          _usedPlugins['jsPsychPreload'] = true;
          mediaBlock += '// Media assets (declared once, shared with the trials below)\n';
          _mediaDecls.forEach(function (m) {
            mediaBlock += 'var ' + m.name + " = '" + m.data + "';\n";
          });
          var groups = {images: [], audio: [], video: []};
          _mediaDecls.forEach(function (m) {
            groups[m.type === 'image' ? 'images' : m.type].push(m.name);
          });
          var entries = [];
          ['images', 'audio', 'video'].forEach(function (k) {
            if (groups[k].length) entries.push('  ' + k + ': [' + groups[k].join(', ') + ']');
          });
          mediaBlock += '\n// Preload so media is decoded before a trial needs it\n';
          mediaBlock += 'timeline.push({\n  type: jsPsychPreload,\n' + entries.join(',\n') + '\n});\n\n';
        }
        code = code.replace('@@MEDIA_PRELOAD@@', mediaBlock);
        return { code: code, usedPlugins: _usedPlugins };
      }

      // Code export: the compiled experiment as a standalone runnable HTML file.
      function generateCode() {
        var r = _compileExperiment({});
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

      // The device height is a property of the *viewport* the experiment was
      // designed for, not of the stimulus box: jsPsych appends each plugin's own
      // controls (buttons, slider submit) after the content, so pinning the
      // stimulus to the full height would push those controls off-screen. Sizing
      // the display area instead keeps the content centred inside the designed
      // height with the controls still beside it.
      function _deviceStyle() {
        var d = editor.device || {w: 1280, h: 720};
        return '.jspsych-display-element { min-height: ' + d.h + 'px; }\n';
      }

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
      // differ only where they must (an extra <style> block for the data layer's UI).
      function _htmlHead(usedPlugins, extraStyle) {
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
        h += '  <link href="https://unpkg.com/jspsych@' + _JSPsychVersion +
             '/css/jspsych.css" rel="stylesheet" type="text/css">\n';
        h += '  <style>\n' + _deviceStyle() + (extraStyle || '') + '  </style>\n';
        h += '</head>\n';
        return h;
      }

      // Wrap experiment logic into a standalone runnable HTML file.
      // Load order matters: plugins read the global `jsPsychModule` while being
      // parsed, so the core script must always come first.
      function _buildJsPsychHTML(code, usedPlugins) {
        // A literal "</script" inside the experiment code would close the inline
        // script tag early; the escaped form is equivalent when parsed as JS.
        var safe = code.replace(/<\/script/gi, '<\\/script');
        var h = _htmlHead(usedPlugins);
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
            editor.pc = 0; editor.tc = 0; editor.cc = 0;
            editor.phases.forEach(function (ph) {
              ph.id = 'ph' + ++editor.pc;
              if (!ph.color) ph.color = ph.type === 'instructions' ? 'i' : ph.type === 'feedback' ? 'f' : 't';
              if (!ph.name) ph.name = ph.type === 'instructions' ? i18n('phase.instructions') : ph.type === 'feedback' ? i18n('phase.feedback') : i18n('phase.timeline');
              ph.timeline.forEach(function (tr) {
                tr.id = 't' + ++editor.tc;
                tr.components.forEach(function (c) {
                  c.id = 'c' + ++editor.cc;
                });
              });
            });
            migratePos();
            // Ensure 3-phase structure
            if (editor.phases.length === 0 || editor.phases[0].type !== 'instructions') {
              var instrPh = { id:'ph_ai_inst', type:'instructions', name: i18n('phase.instructions'), color:'i', timeline:[{ id:'t_ai_inst', components:[ { id:'c_ai_txt', type:'text', content:'Welcome to this experiment!\n\nPlease read the instructions carefully before starting.', fontSize:20, color:'#333333', position:'center', fontWeight:'bold', cat:'s' }, { id:'c_ai_btn', type:'button', choices:['Start Experiment'], prompt:'', button_layout:'grid', grid_rows:1, grid_columns:0, trial_duration:0, stimulus_duration:0, response_ends_trial:true, enable_button_after:0, cat:'r' } ] }] };
              editor.phases.unshift(instrPh);
              editor.tc++; editor.cc += 2;
            }
            var lastPh = editor.phases[editor.phases.length - 1];
            if (!lastPh || lastPh.type !== 'feedback') {
              var fbPh = { id:'ph_ai_fb', type:'feedback', name: i18n('phase.feedback'), color:'f', timeline:[{ id:'t_ai_fb', components:[ { id:'c_ai_fbt', type:'text', content:'Experiment complete!\n\nThank you for your participation.', fontSize:24, color:'#333333', position:'center', fontWeight:'bold', cat:'s' } ] }] };
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
        downloadPublishedExperiment();
        alert('Experiment file downloaded.\n\nOpen it in a browser to run the experiment.\nData is collected in the browser and stored in localStorage.');
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
          '<p style="font-size:0.82rem;color:#888;margin-bottom:28px">Select the screen device participants will use. Experiment layout will be designed for this resolution.</p>';
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

function downloadPublishedExperiment() {
  var html = generatePublishedFile();
  var name = (editor.projectName || 'experiment').replace(/[^a-zA-Z0-9_-]/g, '_');
  var blob = new Blob([html], {type: 'text/html'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = name + '_published.html';
  a.click();
  URL.revokeObjectURL(url);
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