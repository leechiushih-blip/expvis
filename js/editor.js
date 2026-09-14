
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
  'comp.click':       {en:'Click', zh:'点击'},
  'comp.click.desc':  {en:'Click / Touch Anywhere', zh:'任意位置点击 / 触屏'},
  'comp.textInput':   {en:'Text Input', zh:'文本输入'},
  'comp.textInput.desc':{en:'Free Input · Placeholder', zh:'自由输入 · 占位提示'},
  'comp.loop':        {en:'Loop', zh:'循环'},
  'comp.loop.desc':   {en:'Repeat Trial N Times', zh:'重复当前试次 N 次'},
  'comp.branch':      {en:'Branch', zh:'条件分支'},
  'comp.branch.desc': {en:'Correct / Response / Variable', zh:'按键对错 / 变量判断'},
  'comp.delay':       {en:'Delay', zh:'延迟'},
  'comp.delay.desc':  {en:'Insert Wait (ms)', zh:'插入等待 ms'},
  'comp.randomize':   {en:'Randomize', zh:'随机化'},
  'comp.randomize.desc':{en:'Shuffle Order Within Trial', zh:'试次内顺序随机排列'},
  'comp.variable':    {en:'Variable', zh:'变量'},
  'comp.variable.desc':{en:'Score / Counter / Custom', zh:'计分 / 计数 / 自定义'},
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
        return icon ? icon + ' ' + name : name;
      }

      var devicePresets = [
        {name: 'Desktop', icon: '🖥️', w: 1280, h: 720},
        {name: 'Mobile', icon: '📱', w: 390, h: 844},
      ];

      function addPhase(type) {
        var labels = {instructions: 'Instructions', trials: 'Trials', feedback: 'Feedback'};
        saveState();
        editor.phases.push({
          id: 'ph' + ++editor.pc,
          type: type,
          name: labels[type] || type,
          color: type === 'instructions' ? 'i' : type === 'feedback' ? 'f' : 't',
          trials: [],
        });
        document.getElementById('empty-state').style.display = 'none';
        renderFlow();
      }

      function addTrial(pid) {
        var t = {id: 't' + ++editor.tc, components: []};
        var ph = editor.phases.find((p) => p.id === pid);
        if (ph) {
          saveState();
          ph.trials.push(t);
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
          p.trials = p.trials.filter((t) => t.id !== id);
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
        for (var p of editor.phases) for (var t of p.trials) if (t.id === id) return t;
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
            posX: 0,
            posY: 0,
            映射按键: '',
          },
          shape: {type: 'shape', shape: 'circle', size: 80, color: '#6366f1', position: 'center', posX: 0, posY: 0, 映射按键: ''},
          image: {type: 'image', fileData: '', fileName: '', width: 200, posX: 0, posY: 0, 映射按键: ''},
          audio: {type: 'audio', fileData: '', fileName: '', posX: 0, posY: 0},
          video: {type: 'video', fileData: '', fileName: '', width: 320, posX: 0, posY: 0},
          fixation: {type: 'fixation', duration: 500, durationMin: 0, durationMax: 0, posX: 0, posY: 0},
          keyboard: {type: 'keyboard', keys: 'a,l', prompt: 'Press a key', timeout: 0, posX: 0, posY: 0},
          button: {type: 'button', labels: 'Yes,No', color: '#6366f1', posX: 0, posY: 0},
          slider: {type: 'slider', min: 0, max: 100, step: 1, labelMin: '', labelMax: '', showValue: true, posX: 0, posY: 0},
          click: {type: 'click', posX: 0, posY: 0},
          textInput: {
            type: 'textInput',
            placeholder: 'Enter text',
            correctAnswer: '',
            validation: 'contains',
            posX: 0,
            posY: 0,
            映射按键: '',
          },
          loop: {type: 'loop', count: 10, posX: 0, posY: 0},
          branch: {type: 'branch', condition: 'correct', matchValue: '', targetFail: '', operator: '>=', compareValue: '', posX: 0, posY: 0},
          randomize: {type: 'randomize', mode: 'pick-one', posX: 0, posY: 0},
          delay: {type: 'delay', duration: 1000, durationMin: 0, durationMax: 0, posX: 0, posY: 0},
          variable: {type: 'variable', name: 'score', initial: 0, mode: 'correct', posX: 0, posY: 0},
        };
        var c = JSON.parse(JSON.stringify(defs[type] || {type: type}));
        c.id = 'c' + ++editor.cc;
        c.cat = cat;
        var dev = editor.device || {w: 1280, h: 720};
        c.posX = Math.round(dev.w / 2);
        c.posY = Math.round(dev.h / 2);
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
            'timeout',
            'maxSize',
            'count',
            'min',
            'max',
            'step',
            'width',
            'initial',
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
        audio: '🎵',
        video: '🎬',
        fixation: '➕',
        keyboard: '⌨️',
        button: '🔘',
        slider: '🎚️',
        click: '👆',
        textInput: '📝',
        loop: '🔄',
        branch: '🔀',
        delay: '⏱️',
        randomize: '🎲',
        variable: '📊',
      };
      var labels = {
        text: 'Text',
        shape: 'Shape',
        image: 'Image',
        audio: 'Audio',
        video: 'Video',
        fixation: 'Fixation',
        keyboard: 'Keyboard',
        button: 'Button',
        slider: 'Slider',
        click: 'Click',
        textInput: 'Text Input',
        loop: 'Loop',
        branch: 'Branch',
        delay: 'Delay',
        randomize: 'Randomize',
        variable: 'Variable',
      };
      var propLabel = {
        content: 'Content',
        fontSize: 'Font Size',
        color: 'Color',
        position: 'Position',
        fontWeight: 'Weight',
        posX: 'X Offset',
        posY: 'Y Offset',
        shape: 'Shape',
        size: 'Size',
        correctKeyHint: 'Key Hint',
        width: 'Width',
        height: 'Height',
        duration: 'Duration',
        behavior: 'Behavior',
        maxSize: 'Max Size',
        keys: 'Keys',
        映射按键: '🎯 Key Mapping',
        timeout: 'Timeout',
        labels: 'Labels', color: 'Btn Color',
        min: 'Min',
        max: 'Max',
        step: 'Step', labelMin: 'Left Label', labelMax: 'Right Label', showValue: 'Show Value',
        placeholder: 'Placeholder',
        validation: 'Validation',
        count: 'Count',
        mode: 'Mode',
        condition: 'Condition',
        targetFail: 'Target on Fail', matchValue: '🎯 Match Value', operator: 'Operator', compareValue: 'Compare Value',
        target: 'Target',
        name: 'Var Name',
        initial: 'Initial',
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
        // Remove old rendered nodes (keep SVG and empty-state)
        fc.querySelectorAll('.phase-card,.phase-arrow').forEach((el) => el.remove());
        fc.querySelectorAll('.flow-row').forEach((el) => el.remove());
        var svg = document.getElementById('flow-svg');
        svg.innerHTML = '';

        var allNodes = []; // {el, x, y, w, h} for SVG arrows
        var nodeY = 20;

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
            if (mc && mt && ph.trials.length > 0) {
              moveComponent(mt, mc, ph.trials[0].id);
            }
          };
          card.onclick = function (e) {
            if (ph.trials.length > 0) {
              editor.selectedTrial = ph.trials[0].id;
              editor.selComp = ph.trials[0].components.length > 0 ? ph.trials[0].components[0].id : null;
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
            ph.trials.length +
            ' trials</span><button data-phase="' +
            ph.id +
            '" class="phase-delete-btn" style="margin-left:auto;background:none;border:none;color:var(--red);cursor:pointer;font-size:0.7rem;opacity:0.4;padding:2px 8px;border-radius:4px" title="Delete this phase">✕ Delete</button>';
          card.appendChild(hdr);

          // Card body
          var cardBody = document.createElement('div');
          cardBody.className = 'phase-card-body';

          if (ph.trials.length === 0) {
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
                var nt = ph.trials[ph.trials.length - 1];
                if (nt) moveComponent(mt, mc, nt.id);
              } else if (window._dt) {
                addTrial(ph.id);
                var nt = ph.trials[ph.trials.length - 1];
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
          ph.trials.forEach(function (t) {
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
              var badgeEl = _logicBadges(t);
              if (badgeEl) row.appendChild(badgeEl);
              visualComps.forEach(function (c, i) {
                var node = document.createElement('div');
                var sel = t.id === editor.selectedTrial && editor.selComp === c.id;
                node.className = 'flow-node' + (sel ? ' selected' : '');
                var iconBg = c.cat === 's' ? '#eef0ff' : c.cat === 'r' ? '#fff7ed' : '#f0fdf4';
                var iconColor = c.cat === 's' ? 'var(--accent)' : c.cat === 'r' ? 'var(--orange)' : 'var(--green)';
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
                // Individual component delete button - uses data attributes to avoid closure issues
                node.setAttribute('data-trial-id', t.id);
                node.setAttribute('data-comp-id', c.id);
                var compDel = document.createElement('button');
                compDel.style.cssText =
                  'background:none;border:none;color:var(--red);cursor:pointer;font-size:0.6rem;opacity:0.3;padding:0 2px;margin-left:2px';
                compDel.textContent = '✕';
                compDel.title = 'Remove this component';
                compDel.onclick = function (e) {
                  e.stopPropagation();
                  var n = e.target.closest('.flow-node');
                  removeComponent(n.getAttribute('data-trial-id'), n.getAttribute('data-comp-id'));
                };
                node.appendChild(compDel);
                row.appendChild(node);

                // Arrow between components
                if (i < visualComps.length - 1) {
                  var arrow = document.createElement('span');
                  arrow.className = 'flow-arrow';
                  arrow.textContent = '→';
                  row.appendChild(arrow);
                }
              });
            }

            // Branch annotation: visual hint when trial contains a branch component

            // Branch target badge: show where this trial jumps on error
            // Branch source badge: show where this branch jumps to (human-readable)
            var branchComp = t.components.find(function (c) { return c.type === 'branch' && c.targetFail; });
            if (branchComp) {
              // Search all phases for the target trial
              var targetTrial = null, targetPhaseIdx = -1, targetTrialIdx = -1;
              editor.phases.forEach(function (p2, pi2) {
                p2.trials.forEach(function (tr, ti2) { if (tr.id === branchComp.targetFail) { targetTrial = tr; targetPhaseIdx = pi2; targetTrialIdx = ti2; } });
              });
              if (targetTrial) {
                var targetPhase = editor.phases[targetPhaseIdx];
                var phaseLabel = _stripEmoji(targetPhase.name);
                var desc = phaseLabel + ' Trial ' + (targetTrialIdx + 1);
                var branchBadge = document.createElement('span');
                branchBadge.style.cssText = 'font-size:0.55rem;padding:2px 8px;border-radius:8px;background:#fef3c7;color:#b45309;border:1px solid rgba(245,158,11,0.3);margin-left:8px;white-space:nowrap;cursor:default';
                var condLabel = branchComp.condition === 'response' ? '🔀 Match→' : '🔀 Error→';
                branchBadge.innerHTML = condLabel + desc;
                branchBadge.title = (branchComp.condition === 'response' ? 'Match "' + (branchComp.matchValue || '') + '"' : 'Error') + ' → ' + desc;
                row.appendChild(branchBadge);
              }
            }
            // Branch target indicator: show which trial(s) point here
            var srcTrials = [];
            editor.phases.forEach(function (p2) {
              p2.trials.forEach(function (t2) {
                var bc = t2.components.find(function (c) { return c.type === 'branch' && c.targetFail && c.targetFail === t.id; });
                if (bc) srcTrials.push({phaseName: _stripEmoji(p2.name), trialIdx: p2.trials.indexOf(t2) + 1, condition: bc.condition});
              });
            });
            if (srcTrials.length > 0) {
              var targetBadge = document.createElement('span');
              targetBadge.style.cssText = 'font-size:0.55rem;padding:2px 8px;border-radius:8px;background:#fef3c7;color:#b45309;border:1px solid rgba(245,158,11,0.3);margin-left:8px;white-space:nowrap;cursor:default';
              targetBadge.innerHTML = '🎯 from ' + srcTrials.map(function(s) { return s.phaseName + 'T' + s.trialIdx; }).join(', ');
              targetBadge.title = 'Branch source: ' + srcTrials.map(function(s) { return s.phaseName + ' Trial ' + s.trialIdx + ' (' + s.condition + ')'; }).join(', ');
              row.appendChild(targetBadge);
            }

            // Action buttons
            var del = document.createElement('button');
            del.style.cssText =
              'background:none;border:none;color:var(--red);cursor:pointer;font-size:0.7rem;opacity:0.4;margin-left:12px;z-index:2';
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
        if (c.type === 'fixation') return (c.duration || 500) + 'ms';
        if (c.type === 'image') return c.fileName || 'Not uploaded';
        if (c.type === 'audio') return c.fileName || 'Not uploaded';
        if (c.type === 'video') return c.fileName || 'Not uploaded';
        if (c.type === 'keyboard') return 'Keys: ' + c.keys.split(',').map(function(k) { var t = k.trim(); return t || 'space'; }).join(',');
        if (c.type === 'button') return c.labels;
        if (c.type === 'slider') return c.min + '-' + c.max;
        if (c.type === 'click') return 'Click anywhere';
        if (c.type === 'delay') return (c.duration || 1000) + 'ms';
        if (c.type === 'loop') return '×' + c.count;
        if (c.type === 'branch') return 'if ' + c.condition;
        return '';
      }

      // Trial-level settings rendered as compact badges on the flow row.
      // In jsPsych these are node/trial parameters, not trials:
      //   loop → repetitions, randomize → sample/randomize_order,
      //   branch → conditional_function, delay → trial_duration, variable → user JS
      function _logicBadges(t) {
        var out = [];
        t.components.forEach(function (c) {
          if (c.type === 'loop') out.push('↻ ' + (c.count || 1) + '×');
          else if (c.type === 'randomize') out.push('🎲 ' + (c.mode === 'shuffle' ? 'shuffle' : 'pick-one'));
          else if (c.type === 'branch') out.push('🔀 ' + (c.condition || 'correct'));
          else if (c.type === 'delay') out.push('⏱ ' + (c.duration || 0) + 'ms');
          else if (c.type === 'variable') out.push('📊 ' + (c.name || 'var'));
        });
        if (!out.length) return null;
        var el = document.createElement('div');
        el.className = 'flow-badges';
        el.title = 'Trial settings — jsPsych node / trial parameters';
        el.innerHTML = out.map(function (b) {
          return '<span class="flow-badge">' + b + '</span>';
        }).join('');
        return el;
      }

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
        function get(type) {
          return t.components.filter(function (c) { return c.type === type; })[0] || null;
        }
        function setter(type, field) {
          return "_setTrialLogic('" + t.id + "','" + type + "','" + field + "',this.value)";
        }
        var loop = get('loop'), rand = get('randomize'), br = get('branch'),
            dly = get('delay'), v = get('variable');

        var h = '';
        h += '<div style="padding-bottom:10px;border-bottom:1px solid var(--border);margin-bottom:14px">';
        h += '<div style="font-weight:700;font-size:0.85rem">Trial Settings</div>';
        h += '<div style="font-size:0.66rem;color:var(--text2);margin-top:3px;line-height:1.5">' +
             'These become jsPsych <b>node / trial parameters</b>, not trials.<br>Leave a field empty to remove it.</div>';
        h += '</div>';

        h += _settingRow('Loop', 'jsPsych repetitions',
          '<input type="number" min="1" style="' + _SET_INPUT_CSS + '" value="' + (loop ? loop.count : '') +
          '" placeholder="e.g. 48" onchange="' + setter('loop', 'count') + '">');

        h += _settingRow('Randomize', 'jsPsych sample / randomize_order',
          '<select style="' + _SET_INPUT_CSS + '" onchange="' + setter('randomize', 'mode') + '">' +
          '<option value=""' + (!rand ? ' selected' : '') + '>— none —</option>' +
          '<option value="pick-one"' + (rand && rand.mode !== 'shuffle' ? ' selected' : '') + '>pick-one (sample size 1)</option>' +
          '<option value="shuffle"' + (rand && rand.mode === 'shuffle' ? ' selected' : '') + '>shuffle (randomize_order)</option>' +
          '</select>');

        h += _settingRow('Branch', 'jsPsych conditional_function',
          '<select style="' + _SET_INPUT_CSS + '" onchange="' + setter('branch', 'condition') + '">' +
          '<option value=""' + (!br ? ' selected' : '') + '>— none —</option>' +
          '<option value="correct"' + (br && br.condition === 'correct' ? ' selected' : '') + '>on incorrect answer</option>' +
          '<option value="response"' + (br && br.condition === 'response' ? ' selected' : '') + '>on specific response</option>' +
          '<option value="variable"' + (br && br.condition === 'variable' ? ' selected' : '') + '>on variable threshold</option>' +
          '</select>');

        h += _settingRow('Delay', 'jsPsych trial_duration (ms)',
          '<input type="number" min="0" style="' + _SET_INPUT_CSS + '" value="' + (dly ? dly.duration : '') +
          '" placeholder="e.g. 200" onchange="' + setter('delay', 'duration') + '">');

        h += _settingRow('Counter', 'plain JS variable',
          '<input type="text" style="' + _SET_INPUT_CSS + '" value="' + (v ? (v.name || '') : '') +
          '" placeholder="e.g. score" onchange="' + setter('variable', 'name') + '">');

        if (v) {
          h += _settingRow('Counter update', 'when to increment',
            '<select style="' + _SET_INPUT_CSS + '" onchange="' + setter('variable', 'mode') + '">' +
            '<option value="correct"' + (v.mode !== 'always' && v.mode !== 'manual' ? ' selected' : '') + '>+1 on correct</option>' +
            '<option value="always"' + (v.mode === 'always' ? ' selected' : '') + '>+1 on any response</option>' +
            '<option value="manual"' + (v.mode === 'manual' ? ' selected' : '') + '>manual</option>' +
            '</select>');
        }
        insp.innerHTML = h;
      }

      // Create / update / remove the logic component backing a trial setting.
      function _setTrialLogic(trialId, type, field, value) {
        var t = findTrial(trialId);
        if (!t) return;
        var c = t.components.filter(function (x) { return x.type === type; })[0];
        if (!c) {
          if (value === '' || value == null) return; // nothing to remove
          addComponent(trialId, type, 'l');
          c = t.components[t.components.length - 1];
        }
        if (value === '' || value == null) {
          t.components = t.components.filter(function (x) { return x !== c; });
        } else {
          c[field] = (field === 'count' || field === 'duration' || field === 'initial') ? Number(value) : value;
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
            image: 'Click upload to select a local image (≤4MB), stored as base64. Displayed directly in fullscreen preview.',
            audio: 'Upload MP3/WAV audio (≤16MB). Playable in fullscreen preview. Ideal for auditory stimulus experiments.',
            video: 'Upload MP4/WebM video (≤64MB). Playable in fullscreen preview.',
            fixation: 'Cross fixation point. duration(ms) controls display time. In fullscreen preview, the fixation appears first then auto-disappears after duration.',
            keyboard: 'Set allowed keys (comma-separated) and prompt text. In fullscreen preview, pressing any allowed key advances to the next stage. Set timeout>0 for auto-advance.',
            button: 'Set button labels (comma-separated). Clicking a button in fullscreen preview auto-advances. Ideal for "Start Experiment" buttons in instructions.',
            slider: 'Set min, max, and step values. In fullscreen preview, drag the slider then click confirm to submit. Suitable for continuous-value experiments like trust games.',
            click: 'Defines a clickable area on the canvas. Clicking/tapping within this area in fullscreen preview auto-advances.',
            textInput: 'Set placeholder text. Optional: correctAnswer (comma-separated acceptable answers) and validation rule (contains/exact/none). Free text input with confirm button.',
            loop: 'Set count (repetitions). Place as the last component in a trial. In fullscreen preview, remaining count is shown in the navigation bar.',
            branch: 'Select condition type. targetFail = target trial ID on error (dropdown lists same-phase trials). Leave empty = retry current trial without consuming loop count.',
            delay: 'Set duration(ms). Splits trial rendering: components before delay appear first, then after delay the rest appear. Multiple delays can create multi-stage trials.',
            randomize: 'Select mode. pick-one = randomly selects 1 variant per loop (for Simon/Stroop). shuffle = shows all variants in random order (for memory tests).',
            variable: '📊 Score counter. Place at trial start (init) and/or end (update). correct mode: +1 on correct answer. always mode: +1 on any response. manual mode: manual control. Current value shown in navigation bar.',
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
            keys: 'Comma-separated keys, e.g. a,l',
            correctKey: 'Participant must press this key for a correct response. Supports comma-separated values (e.g. a,l). Leave empty if using 🎲 randomize pick-one.',
            timeout: 'Timeout (ms). 0=no limit. If >0, auto-judges as timeout and records RT when exceeded.',
            labels: 'Comma-separated button labels, e.g. Yes,No',
            targetFail: '',
            correctAnswer: 'Comma-separated acceptable answers (e.g. apple,banana)',
            validation: 'contains=substring match | exact=full match | none=no validation',
            labelMin: 'Left slider label (e.g. Strongly Disagree)',
            labelMax: 'Right slider label (e.g. Strongly Agree)',
            showValue: 'Show current value above the slider',
            mode: 'pick-one=randomly select 1 variant per loop | shuffle=show all in random order',
            映射按键: '🎲 When randomize pick-one selects this element, its key mapping becomes the correct keyboard key. Just type the letter (e.g. a/l/k).',
          };
          // For branch targetFail: build dropdown from same-phase trial IDs
          var currentPhase = editor.phases.find(function (p) {
            return p.trials.some(function (tr) {
              return tr.id === t.id;
            });
          });
          Object.keys(c).forEach(function (k) {
            if (k === 'id' || k === 'cat' || k === 'type' || k === 'fileData' || k === 'fileName') return;
            if (k === 'correctKey' || k === '颜色按键映射' || k === '按键映射' || k === 'correctKeyHint') return;
            if (c.cat === 'l' && (k === 'posX' || k === 'posY')) return;
            if (c.type === 'variable' && k === 'mode') return;
            // Ensure variable always shows mode (even if property missing in older data)
            if (c.type === 'variable' && k === 'initial') {
              h += '<div class="prop-row"><label>Count Mode</label>';
              h += "<select onchange=\"updateComponent('" + t.id + "','" + c.id + "','mode',this.value)\"><option value=\"correct\"" + ((c.mode||'correct')==='correct'?' selected':'') + ">Correct +1</option><option value=\"always\"" + (c.mode==='always'?' selected':'') + ">Always +1</option><option value=\"manual\"" + (c.mode==='manual'?' selected':'') + ">Manual</option></select>";
              h += '</div>';
            }
            var v = c[k];
            var displayLabel = propLabel[k] || k;
            if (k === 'targetFail' && c.condition === 'response') displayLabel = '🎯 Jump Target';
            if (k === 'targetFail' && c.condition === 'correct') displayLabel = '❌ Target on Fail';
            if (k === 'targetFail' && c.condition === 'variable') displayLabel = '🎯 Jump Target';
            if (k === 'matchValue' && c.condition === 'variable') displayLabel = '📊 Variable Name';
            if (k === 'matchValue' && c.condition === 'response') displayLabel = '🎯 Match Value';
            if (k === 'matchValue' && c.condition === 'correct') return;
            if (k === 'operator' && c.condition !== 'variable') return;
            if (k === 'compareValue' && c.condition !== 'variable') return;
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
            else if (k === 'condition') {
              h += '<select onchange="_switchBranchCondition(\'' + t.id + '\',\'' + c.id + '\',this.value)">';
              [{v:'correct',l:'✅ Correct Key'},{v:'response',l:'💬 Response Match'},{v:'variable',l:'📊 Variable Check'}].forEach(function(o) { h += '<option value="' + o.v + '"' + (v === o.v ? ' selected' : '') + '>' + o.l + '</option>'; });
              h += '</select>';
            }
            else if (k === 'operator') { h += sel(k, ['>=','<=','>','<','==','!='], v||'>=', t.id, c.id); }
            else if (k === 'compareValue') { h += '<input value="' + (v || '') + '" onchange="updateComponent(\'' + t.id + '\',\'' + c.id + '\',\'compareValue\',this.value)" placeholder="比较值（如: 5）" type="number">'; }
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
            else if (k === 'showValue') h += '<select onchange="updateComponent(\'' + t.id + '\',\'' + c.id + '\',\'showValue\',this.value)"><option value="true"' + (v !== false && v !== 'false' ? ' selected' : '') + '>Show</option><option value="false"' + (v === false || v === 'false' ? ' selected' : '') + '>Hide</option></select>';
            else if (k === 'validation') h += sel(k, ['contains', 'exact', 'none'], v || 'contains', t.id, c.id);
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
                editor.phases.forEach(function (ph2, pi2) { ph2.trials.forEach(function (tr, ti2) { if (tr.id !== t.id) h += '<option value="' + tr.id + '"' + (v === tr.id ? ' selected' : '') + '>' + _phaseLabel(ph2) + ' · Trial ' + (ti2 + 1) + '</option>'; }); });
                h += '</select>';
              }
              else {
                h += '<select onchange="updateComponent(\'' + t.id + '\',\'' + c.id + '\',\'targetFail\',this.value)">';
                h += '<option value=""' + (v ? '' : ' selected') + '>Retry current trial</option>';
                editor.phases.forEach(function (ph2, pi2) { ph2.trials.forEach(function (tr, ti2) { if (tr.id !== t.id) h += '<option value="' + tr.id + '"' + (v === tr.id ? ' selected' : '') + '>' + _phaseLabel(ph2) + ' · Trial ' + (ti2 + 1) + '</option>'; }); });
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
            if (hints[k])
              h +=
                '<div style="font-size:0.6rem;color:var(--text2);flex-basis:100%;margin-top:-2px">' +
                hints[k] +
                '</div>';
            h += '</div>';
          });
          if (c.type === 'loop') {
            h +=
              '<p style="font-size:0.7rem;color:var(--text2);line-height:1.5;margin:4px 0">Repeats the current trial a specified number of times. Use for multi-round experiments.</p>';
          }
          if (c.type === 'variable') {
            h +=
              '<p style="font-size:0.7rem;color:var(--text2);line-height:1.5;margin:4px 0">Defines a variable readable by branch conditions or modifiable by other components.</p>';
          }
          if (c.type === 'click') {
            h +=
              '<p style="font-size:0.7rem;color:var(--text2);line-height:1.5;margin:4px 0">Records mouse click or touch input. No additional configuration needed.</p>';
          }
          if (c.type === 'delay') {
            h +=
              '<p style="font-size:0.7rem;color:var(--text2);line-height:1.5;margin:4px 0">Inserts a wait period. Participant sees a blank screen for the specified duration.</p>';
          }
          if (c.type === 'randomize') {
            h +=
              '<p style="font-size:0.7rem;color:var(--text2);line-height:1.5;margin:4px 0">Shuffles the order of stimulus components within the trial. Random order on each run.</p>';
          }
          if (c.type === 'branch') {
            var cd = {
              correct: 'Check if key press matches correct key',
              response: 'Check if participant made a response',
              variable: 'Check if variable value meets condition',
            };
            h +=
              '<p style="font-size:0.7rem;color:var(--text2);line-height:1.5;margin:4px 0">' +
              (cd[c.condition] || '') +
              '</p>';
          }
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
          '\',\'keyboard\',\'r\')">⌨️ Keyboard</button><button class="btn btn-outline" style="font-size:0.65rem;padding:4px 8px" onclick="addComponent(\'' +
          t.id +
          "','loop','l')\">🔄 Loop</button></div>";
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
        }, 0);
      }
      function sel(field, opts, v, tid, cid) {
        var s = '<select onchange="updateComponent(\'' + tid + "','" + cid + "','" + field + '\',this.value)">';
        opts.forEach(function (o) {
          s += '<option' + (v === o ? ' selected' : '') + '>' + o + '</option>';
        });
        s += '</select>';
        return s;
      }

      // Unified trial content renderer — used by all previews
      function renderTrialHTML(t, opts) {
        opts = opts || {};
        var s = opts.scale || 1;
        var h = '';
        var usePixel = opts.usePixel || false;
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
        t.components.forEach(function (c) {
          _compIdx++;
          // in pick-one, skip every variant but the first
          if (_variantStart >= 0 && _compIdx > _variantStart &&
              c.cat === 's' && ['text','shape','image','audio','video','fixation'].indexOf(c.type) >= 0) {
            return;
          }
          var hasPixel = usePixel && typeof c.posX === 'number' && typeof c.posY === 'number';
          var al = c.position === 'left' ? 'flex-start' : c.position === 'right' ? 'flex-end' : 'center';
          var ta = c.position === 'left' ? 'left' : c.position === 'right' ? 'right' : 'center';
          // posX semantics: 'center'→visual center, 'left'→left edge, 'right'→right edge
          var tx = '';
          if (hasPixel && (!c.position || c.position === 'center')) tx = 'transform:translateX(-50%);';
          else if (hasPixel && c.position === 'right') tx = 'transform:translateX(-100%);';
          var px = hasPixel ? 'position:absolute;left:' + (c.posX || 0) + 'px;top:' + (c.posY || 0) + 'px;' + tx : '';
          var wrapperW = usePixel || hasPixel ? '' : 'width:100%;';
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
                '" style="max-width:' +
                Math.round(260 * s) +
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
            c.keys.split(',').forEach(function (k) {
              var displayKey = k.trim() || 'space';
              h += '<span style="padding:' + Math.round(10 * s) + 'px ' + Math.round(22 * s) + 'px;border-radius:' + Math.round(10 * s) + 'px;background:#fff7ed;border:2px solid rgba(245,158,11,0.15);color:#f97316;font-weight:700;font-size:' + Math.round(15 * s) + 'px;box-shadow:0 2px 6px rgba(0,0,0,0.05)">' + displayKey + '</span>';
            });
            h += '</div></div>';
          } else if (c.type === 'button')
            h +=
              '<div data-cid="' +
              c.id +
              '" style="' +
              px +
              'display:inline-flex;gap:' +
              Math.round(10 * s) +
              'px;flex-wrap:wrap;justify-content:center;width:auto">' +
              c.labels
                .split(',')
                .map(function (l) {
                  return (
                    '<span style="padding:' +
                    Math.round(10 * s) +
                    'px ' +
                    Math.round(24 * s) +
                    'px;border-radius:' +
                    Math.round(10 * s) +
                    'px;background:' + (c.color || '#6366f1') + ';color:#ffffff;font-weight:600;font-size:' +
                    Math.round(14 * s) +
                    'px;box-shadow:0 2px 8px rgba(99,102,241,0.25);white-space:nowrap" data-btn="">' +
                    l.trim() +
                    '</span>'
                  );
                })
                .join('') +
              '</div>';
          else if (c.type === 'slider') {
      var sv = Math.round((c.min + c.max) / 2);
      h += '<div data-cid="' + c.id + '" style="' + px + 'display:flex;flex-direction:column;align-items:center;gap:' + Math.round(4 * s) + 'px">';
      if (c.showValue !== false && c.showValue !== 'false') h += '<span id="sv-' + c.id + '" style="font-size:' + Math.round(14 * s) + 'px;font-weight:700;color:var(--accent)">' + sv + '</span>';
      h += '<div style="display:flex;align-items:center;gap:' + Math.round(8 * s) + 'px;font-size:' + Math.round(11 * s) + 'px;color:#888">';
      if (c.labelMin) h += '<span>' + c.labelMin + '</span>';
      h += '<input type="range" min="' + c.min + '" max="' + c.max + '" step="' + (c.step || 1) + '" value="' + sv + '" style="width:' + Math.round(200 * s) + 'px;accent-color:var(--accent)" oninput="this.parentElement.previousElementSibling.textContent=this.value">';
      if (c.labelMax) h += '<span>' + c.labelMax + '</span>';
      h += '</div></div>';
    }else if (c.type === 'textInput')
            h +=
              '<div data-cid="' +
              c.id +
              '" style="' +
              px +
              'display:flex;flex-direction:column;align-items:center;gap:' +
              Math.round(8 * s) +
              'px"><input placeholder="' +
              c.placeholder +
              '" style="padding:' +
              Math.round(10 * s) +
              'px ' +
              Math.round(16 * s) +
              'px;border:2px solid #e0e0e8;border-radius:' +
              Math.round(10 * s) +
              'px;font-size:' +
              Math.round(14 * s) +
              'px;width:' +
              Math.round(240 * s) +
              'px;text-align:center;outline:none"></div>';
          else if (c.type === 'click')
            h +=
              '<div data-cid="' +
              c.id +
              '" style="' +
              px +
              'width:' +
              Math.round(280 * s) +
              'px;height:' +
              Math.round(180 * s) +
              'px;border:2px dashed #d0d0d8;border-radius:' +
              Math.round(16 * s) +
              'px;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:' +
              Math.round(15 * s) +
              'px;transition:all 0.15s">👆 Click anywhere</div>';
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
          p.trials.forEach(function (tr) {
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
          if (p.trials.some(function (x) { return x.id === t.id; })) ph = p;
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
             'Flow layout \u00b7 same HTML the jsPsych stimulus uses</span>';
        h += '<button id="exp-prev-close" style="background:none;border:1px solid var(--border);' +
             'border-radius:6px;color:var(--text2);cursor:pointer;font-size:0.8rem;padding:3px 10px;' +
             'font-family:inherit">\u2715</button>';
        h += '</div>';
        h += '<div style="flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;' +
             'background:#f4f4f8;padding:24px">';
        h += '<div id="exp-prev-stage" style="width:100%;max-width:' + dev.w + 'px;background:#fff;' +
             'border-radius:10px;box-shadow:0 6px 28px rgba(0,0,0,.12)"></div>';
        h += '</div>';

        box.innerHTML = h;
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        document.getElementById('exp-prev-stage').innerHTML = renderTrialHTML(t, {scale: 1});
        document.getElementById('exp-prev-close').onclick = function () { overlay.remove(); };
        overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
      }

      function previewExperiment() {
        if (editor.phases.length === 0) {
          alert('Please add phases and trials first');
          return;
        }
        var overlay = document.createElement('div');
        overlay.style.cssText =
          "position:fixed;inset:0;z-index:2000;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;overflow-y:auto;padding:20px;font-family:'Inter','Noto Sans SC',sans-serif";
        overlay.id = 'exp-preview';
        document.body.appendChild(overlay);
        var dev = editor.device;
        // Bars overhead: phase label ~30px + progress dots ~26px + nav ~50px + gaps ~20px ≈ 130px
        var barsH = 130;
        var cardW = dev ? dev.w : null,
          cardH = dev ? dev.h : null;
        if (dev) {
          var maxW = window.innerWidth - 60,
            maxH = window.innerHeight - 60 - barsH;
          var s = Math.min(1, maxW / dev.w, maxH / dev.h);
          cardW = Math.round(dev.w * s);
          cardH = Math.round(dev.h * s);
        }
        var devRef = editor.device || {w: 1280, h: 720};
        var textScale = dev
          ? Math.min(1, cardW / devRef.w, cardH / devRef.h)
          : Math.min(1, (window.innerWidth - 100) / devRef.w, (window.innerHeight - 140) / devRef.h);
        var cardInner = dev ? 'width:100%;height:100%;overflow:hidden;' : 'min-width:380px;max-width:90vw;';
        var pi = 0,
          ti = 0,
          count = 0;
        var responses = []; // collected response data
        var variables = {}; // variable store
        var advanceTimer = null; // for auto-advance
        var _branchJumped = false; // tracks branch→target jumps
        var loopRemaining = 0;
        var _lastTrialId = null;
        function cleanupInteraction() {
          if (advanceTimer) {
            clearTimeout(advanceTimer);
            advanceTimer = null;
          }
          overlay._keydown && overlay.removeEventListener('keydown', overlay._keydown);
          overlay._keydown = null;
        }

        function showCurrent() {
          cleanupInteraction();
          console.log("showCurrent pi="+pi+" ti="+ti);
          if (pi >= editor.phases.length) {
            // Done — show summary
            var summary = '';
            var correctCount = responses.filter(function (r) {
              return r.correct;
            }).length;
            if (responses.length > 0) {
              var avgRT = Math.round(
                responses.reduce(function (s, r) {
                  return s + r.rt;
                }, 0) / responses.length,
              );
              summary =
                '<div style="margin-top:16px;font-size:0.85rem;color:#888">✅ Correct: ' +
                correctCount +
                '/' +
                responses.length +
                ' | ⏱ Avg RT: ' +
                avgRT +
                'ms</div>';
            }
            overlay.innerHTML =
              '<div style="background:#fff;border-radius:20px;padding:56px 64px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.4)"><div style="font-size:3rem;margin-bottom:16px">🎉</div><h2 style="color:#1a1a2e;margin-bottom:8px;font-size:1.4rem">Preview Complete</h2><p style="color:#888;font-size:0.9rem;margin-bottom:4px">' +
              count +
              ' trials, ' +
              editor.phases.length +
              ' phases</p>' +
              summary +
              '<button onclick="document.getElementById(\'exp-preview\').remove()" style="margin-top:20px;padding:12px 32px;border-radius:10px;border:none;background:#6366f1;color:#ffffff;cursor:pointer;font-size:0.95rem;font-weight:600;box-shadow:0 4px 16px rgba(99,102,241,0.3)">Close Preview</button></div>';
            return;
          }
          var ph = editor.phases[pi];
          if (ti >= ph.trials.length) {
            pi++;
            ti = 0;
            showCurrent();
            return;
          }
          // Auto-skip: if this trial is a branch target but we arrived via normal flow (not branch jump), skip it
          if (!_branchJumped) {
            var isTarget = editor.phases.some(function (p2) {
              return p2.trials.some(function (t2) {
                var bc = t2.components.find(function (c) {
                  return c.type === 'branch' && c.targetFail && c.targetFail === ph.trials[ti].id;
                });
                return !!bc;
              });
            });
            if (isTarget) {
              ti++;
              showCurrent();
              return;
            }
          }
          // Auto-skip: trials with only logic components (no visual elements) — skip silently
          var visualTypes = [
            'text',
            'shape',
            'image',
            'fixation',
            'audio',
            'video',
            'keyboard',
            'button',
            'slider',
            'click',
            'textInput',
          ];
          var curTrial = ph.trials[ti];
          if (!curTrial) return;
          var hasVisual = curTrial.components.some(function (c) {
            return visualTypes.indexOf(c.type) >= 0;
          });
          if (!hasVisual) {
            ti++;
            showCurrent();
            return;
          }
          _branchJumped = false;
          var t = ph.trials[ti];
          count++;
          var phaseLabel = _stripEmoji(ph.name);
          var phaseColor = ph.color === 'i' ? '#818cf8' : ph.color === 'f' ? '#22c55e' : '#f97316';

          // Analyze trial for interaction
          var hasKeyboard = false,
            hasButton = false,
            hasSlider = false,
            hasClick = false,
            hasTextInput = false,
            hasBranch = false,
            branchTargetFail = '',
            branchMatchValue = '',
            branchCondition = 'correct',
            branchOperator = '>=',
            branchCompValue = '',
            branchMatchValue = '',
            branchCondition = 'correct',
            branchOperator = '>=',
            branchCompValue = '',
            hasVariable = false,
            varName = '',
            varInit = 0,
            varMode = 'correct';
          var kbKeys = '',
            autoAdvance = 0;
          // Reset loop counter when switching to a different trial
          if (t.id !== _lastTrialId) {
            loopRemaining = 0;
            _lastTrialId = t.id;
          }
          t.components.forEach(function (c) {
            if (c.type === 'keyboard') {
              hasKeyboard = true;
              kbKeys = c.keys || '';
              kbCorrect = c.correctKey || '';
              kbTimeout = c.timeout || 0;
            }
            if (c.type === 'button') hasButton = true;
            if (c.type === 'slider') hasSlider = true;
            if (c.type === 'click') hasClick = true;
            if (c.type === 'textInput') hasTextInput = true;
            if (c.type === 'fixation' && c.duration) autoAdvance = c.duration;
            if (c.type === 'delay' && c.duration) autoAdvance = Math.max(autoAdvance, c.duration);
            if (c.type === 'loop' && loopRemaining === 0) loopRemaining = c.count || 0;
            if (c.type === 'branch') {
              hasBranch = true;
              branchTargetFail = c.targetFail || '';
              branchMatchValue = c.matchValue || '';
              branchCondition = c.condition || 'correct';
              branchOperator = c.operator || '>=';
              branchCompValue = c.compareValue || '';
              branchMatchValue = c.matchValue || '';
              branchCondition = c.condition || 'correct';
              branchOperator = c.operator || '>=';
              branchCompValue = c.compareValue || '';
            }
            if (c.type === 'variable') {
              hasVariable = true;
              varName = c.name || '';
              varInit = c.initial || 0;
              varMode = c.mode || 'correct';
            }
          });
          var isInteractive = hasKeyboard || hasButton || hasSlider || hasClick || hasTextInput;
          // Initialize variable if not yet set
          if (hasVariable && !(varName in variables)) variables[varName] = varInit;

          function cardHTML(comps) {
            if (comps.length === 0) return '<span style="color:#bbb;font-size:1.1rem">+</span>';
            var tmp = {id: t.id, components: comps};
            var iw = devRef.w,
              ih = devRef.h,
              isc = textScale;
            return (
              '<div style="width:' +
              Math.round(iw * isc) +
              'px;height:' +
              Math.round(ih * isc) +
              'px;overflow:hidden;position:relative;margin:0 auto">' +
              '<div style="width:' +
              iw +
              'px;height:' +
              ih +
              'px;transform:scale(' +
              isc +
              ');transform-origin:0 0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:' +
              Math.round(20 * isc) +
              'px">' +
              renderTrialHTML(tmp, {scale: 1}) +
              '</div></div>'
            );
          }
          var isPractice = ph.type === 'instructions' || ph.type === 'feedback';

          var h = '';
          // Top bar
          h += '<div style="width:100%;max-width:520px;display:flex;align-items:center;gap:12px;margin-bottom:4px">';
          h +=
            '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' +
            phaseColor +
            '"></span>';
          h += '<span style="color:rgba(255,255,255,0.7);font-size:0.78rem;font-weight:600">' + phaseLabel + '</span>';
          h +=
            '<span style="color:rgba(255,255,255,0.35);font-size:0.7rem;margin-left:auto">' +
            (ti + 1) +
            ' / ' +
            ph.trials.length +
            '</span>';
          h +=
            '<button id="preview-exit-btn" style="background:none;border:1px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.4);padding:3px 12px;border-radius:6px;cursor:pointer;font-size:0.72rem;margin-left:8px">✕ Exit</button>';
          h += '</div>';
          // Progress dots
          h += '<div style="display:flex;gap:4px;margin-bottom:20px">';
          for (var d = 0; d < ph.trials.length; d++) {
            h +=
              '<div style="width:' +
              (d === ti ? '20' : '6') +
              'px;height:6px;border-radius:3px;background:' +
              (d === ti ? phaseColor : d < ti ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)') +
              ';transition:all 0.3s"></div>';
          }
          h += '</div>';
          // Card
          h +=
            '<div id="preview-card" style="background:#fff;border-radius:' +
            (dev ? '24px' : '16px') +
            ';padding:' +
            (dev ? '0' : '40px 56px') +
            ';box-shadow:0 20px 60px rgba(0,0,0,0.35);display:flex;flex-direction:column;align-items:center;justify-content:' +
            (dev ? 'flex-start' : 'center') +
            ';gap:20px;position:relative;overflow:hidden;' +
            cardInner +
            (dev ? 'width:' + cardW + 'px;height:' + cardH + 'px;' : '') +
            '">';
          if (t.components.length === 0) {
            h += '<span style="color:#bbb;font-size:1.1rem">Empty Trial</span>';
          } else {
            // Phased rendering: pre-delay first, then all non-delay after timeout
            var allNonDelay = t.components.filter(function (c) {
              return c.type !== 'delay';
            });
            // Randomize: deep-clone + shuffle stimulus components after the randomize marker
            var hasRandomize = t.components.some(function (c) {
              return c.type === 'randomize';
            });
            var renderComps = t.components.map(function (c) {
              return Object.assign({}, c);
            }); // shallow clone
            if (hasRandomize) {
              var ri = renderComps.findIndex(function (c) {
                return c.type === 'randomize';
              });
              var stimTypes = ['text', 'shape', 'image'];
              var before = [],
                stims = [],
                after = [];
              renderComps.forEach(function (c, i) {
                if (i <= ri) {
                  before.push(c);
                } else if (stimTypes.indexOf(c.type) >= 0) {
                  stims.push(c);
                } else {
                  after.push(c);
                }
              });
              // Randomly pick ONE stimulus (N-choose-1 mode for Simon/Stroop) or shuffle all (memory test mode)
              // If stims all share same category (text/shape), pick 1; if mixed types, shuffle all
              var randComp = renderComps.find(function (c) {
                return c.type === 'randomize';
              });
              var randMode = randComp ? randComp.mode || 'pick-one' : 'pick-one';
              if (randMode === 'pick-one' && stims.length > 0) {
                var picked = stims[Math.floor(Math.random() * stims.length)];
                stims = [picked];
                // Sync correctKey from keyboard's 颜色按键映射 based on picked shape's color
                var kbComp = renderComps.find(function (rc) {
                  return rc.type === 'keyboard';
                });
                // Sync correctKey from picked component's 映射按键
                if (picked && picked.映射按键) {
                  var kbComp2 = renderComps.find(function (rc) { return rc.type === 'keyboard'; });
                  if (kbComp2) {
                    kbComp2.correctKey = picked.映射按键;
                    var origKb2 = t.components.find(function (oc) { return oc.type === 'keyboard'; });
                    if (origKb2) origKb2.correctKey = picked.映射按键;
                    kbCorrect = picked.映射按键;
                  }
                }
                // Fallback: legacy correctKeyHint on shape
                if (!picked.映射按键 && picked.correctKeyHint) {
                  renderComps.forEach(function (rc) {
                    if (rc.type === 'keyboard') rc.correctKey = picked.correctKeyHint;
                  });
                  t.components.forEach(function (oc) {
                    if (oc.type === 'keyboard') oc.correctKey = picked.correctKeyHint;
                  });
                  kbCorrect = picked.correctKeyHint;
                }
              } else {
                var origPos = stims.map(function (c) {
                  return {cx: c.posX, cy: c.posY};
                });
                for (var si = stims.length - 1; si > 0; si--) {
                  var sj = Math.floor(Math.random() * (si + 1));
                  var tmp = stims[si];
                  stims[si] = stims[sj];
                  stims[sj] = tmp;
                }
                stims.forEach(function (c, i) {
                  c.posX = origPos[i].cx;
                  c.posY = origPos[i].cy;
                });
              }
              renderComps = before.concat(stims).concat(after);
            }
            // --- Generalized multi-phase rendering: split by delay markers ---
            var phases = [[]]; // phases[0]=before 1st delay, phases[1]=after 1st, etc.
            var delays = []; // delays[i] = ms between phase i and phase i+1
            renderComps.forEach(function (c) {
              if (c.type === 'delay' && c.duration > 0) {
                delays.push(c.duration);
                phases.push([]);
              } else {
                phases[phases.length - 1].push(c);
              }
            });
            h += cardHTML(phases[0]); // render first phase immediately

            // Chain setTimeout for subsequent phases; activate interaction only after last
            function runPhase(idx) {
              if (idx >= phases.length) {
                setupInteraction();
                return;
              }
              advanceTimer = setTimeout(
                function () {
                  var card = document.getElementById('preview-card');
                  if (card) card.innerHTML = cardHTML(phases[idx]);
                  if (idx === phases.length - 1) {
                    trialStart = Date.now();
                    setupInteraction();
                  } else {
                    runPhase(idx + 1);
                  }
                },
                delays[idx - 1],
              );
            }
            if (phases.length > 1) runPhase(1);
            else setupInteraction();
          }
          h += '</div>';
          // RT feedback area
          h +=
            '<div id="preview-rt" style="height:24px;font-size:0.75rem;color:rgba(255,255,255,0.5);text-align:center;margin-top:6px"></div>';
          // Nav
          var navLabel = isPractice
            ? ''
            : isInteractive
              ? loopRemaining
                ? 'Respond (' + loopRemaining + ' remaining)'
                : 'Respond'
              : '';
          // Show variables if any
          var varDisplay = '';
          Object.keys(variables).forEach(function (vk) {
            varDisplay += ' ' + vk + ':' + variables[vk];
          });
          if (varDisplay) navLabel += varDisplay;
          h += '<div style="display:flex;align-items:center;gap:16px;margin-top:14px">';
          h +=
            '<button id="preview-prev-btn" style="padding:10px 18px;border-radius:10px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.7);cursor:pointer;font-size:0.85rem;font-family:inherit;font-weight:500;transition:all 0.15s" onmouseover="this.style.background=\'rgba(255,255,255,0.12)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.06)\'">← Prev Trial</button>';
          h +=
            '<span style="color:rgba(255,255,255,0.35);font-size:0.75rem;flex:1;text-align:center">' +
            navLabel +
            '</span>';
          h +=
            '<button id="preview-skip-btn" style="padding:10px 18px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);cursor:pointer;font-size:0.8rem;font-family:inherit">Skip →</button>';
          h += '</div>';
          if (dev)
            h +=
              '<div style="font-size:0.65rem;color:rgba(255,255,255,0.2);text-align:center;margin-top:8px">' +
              dev.w +
              '×' +
              dev.h +
              '</div>';
          overlay.innerHTML = h;

          // Exit button — JS handler
          var exitBtn = document.getElementById('preview-exit-btn');
          if (exitBtn)
            exitBtn.onclick = function () {
              cleanupInteraction();
              overlay.remove();
            };

          // Skip / prev buttons
          document.getElementById('preview-skip-btn').onclick = function () {
            loopRemaining = 0;
            ti++;
            showCurrent();
          };
          var prevBtn = document.getElementById('preview-prev-btn');
          if (prevBtn) {
            prevBtn.onclick = function () {
              if (ti > 0) ti--;
              else if (pi > 0) {
                pi--;
                ti = editor.phases[pi].trials.length - 1;
              }
              showCurrent();
            };
            if (ti === 0 && pi === 0) prevBtn.style.opacity = '0.3';
          }

          var trialStart = Date.now(),
            responded = false;
          function advance(skipDecrement) {
            cleanupInteraction();
            if (skipDecrement) {
              showCurrent();
            } else if (loopRemaining > 1) {
              loopRemaining--;
              showCurrent();
            } else {
              loopRemaining = 0;
              ti++;
              showCurrent();
            }
          }
          function recordAndAdvance(rt, resp, correct) {
            if (responded) return; // guard against duplicate responses
            // Auto-increment score variable on correct response
            // For textInput: validate against component's correctAnswer if set
            if (hasTextInput) {
              var inputComp = t.components.find(function (c) {
                return c.type === 'textInput';
              });
              if (inputComp && inputComp.correctAnswer && inputComp.validation !== 'none') {
                var answers = inputComp.correctAnswer.split(',').map(function (s) {
                  return s.trim().toLowerCase();
                });
                var inputVal = (resp || '').toLowerCase();
                if (inputComp.validation === 'exact') {
                  correct = answers.indexOf(inputVal) >= 0;
                } else {
                  correct = answers.some(function (a) {
                    return inputVal.indexOf(a) >= 0;
                  });
                }
              }
            }
            responded = true;
            // Don't record responses for instructions/feedback (practice) phases
            if (!isPractice) {
              if (hasVariable && variables[varName] !== undefined) {
              if (varMode === 'correct' && correct) variables[varName]++;
              else if (varMode === 'always') variables[varName]++;
            }
              responses.push({phase: _stripEmoji(ph.name), trial: ti + 1, rt: rt, response: resp, correct: correct});
              var rtEl = document.getElementById('preview-rt');
              if (rtEl)
                rtEl.innerHTML =
                  '\u23f1 ' +
                  rt +
                  'ms ' +
                  (correct ? '\u2705' : '\u274c') +
                  ' <span style="font-size:0.6rem">(' +
                  resp +
                  ')</span>';
            }
            var shouldBranch = false, branchJumpTarget = '';
            if (hasBranch) {
              if (branchCondition === 'correct') { shouldBranch = !correct; branchJumpTarget = branchTargetFail; }
              else if (branchCondition === 'variable') {
                var varVal = variables[branchMatchValue] || 0;
                var cmpVal = parseFloat(branchCompValue) || 0;
                var op = branchOperator || '>=';
                if (op === '>=') shouldBranch = varVal >= cmpVal;
                else if (op === '<=') shouldBranch = varVal <= cmpVal;
                else if (op === '>') shouldBranch = varVal > cmpVal;
                else if (op === '<') shouldBranch = varVal < cmpVal;
                else if (op === '==') shouldBranch = varVal == cmpVal;
                else if (op === '!=') shouldBranch = varVal != cmpVal;
                if (shouldBranch) branchJumpTarget = branchTargetFail;
              }
              else if (branchCondition === 'response') {
                var matchValues = (branchMatchValue || '').split(',').map(function(m) { return m.trim(); });
                var matchIdx = matchValues.indexOf(resp);
                if (matchIdx >= 0) {
                  shouldBranch = true;
                  var targets = (branchTargetFail || '').split(',').map(function(t) { return t.trim(); });
                  branchJumpTarget = targets[Math.min(matchIdx, targets.length - 1)] || branchTargetFail;
                }
              }
            }
            if (shouldBranch) {
              // Branch triggered: jump to target or retry
              var card = document.getElementById('preview-card');
              if (card) {
                card.style.boxShadow = '0 0 0 4px #ef4444';
                setTimeout(function () { card.style.boxShadow = ''; }, 500);
              }
              if (branchJumpTarget) {
                // Find target trial and jump (search all phases)
                setTimeout(function () {
                  var found = false;
                  editor.phases.forEach(function (p2) {
                    p2.trials.forEach(function (tr, tri) {
                      if (tr.id === branchJumpTarget && !found) {
                        pi = editor.phases.indexOf(p2);
                        ti = tri;
                        _branchJumped = true;
                        found = true;
                      }
                    });
                  });
                  advance(true);
                }, 800);
              } else {
                setTimeout(function () {
                  advance(true);
                }, 800);
              }
            } else {
              setTimeout(
                function () {
                  advance();
                },
                isInteractive ? 250 : 50,
              );
            }
          }

          // --- Set up interactions (wrapped for phased delay) ---
          function setupInteraction() {
            if (autoAdvance && !isInteractive) {
              advanceTimer = setTimeout(function () {
                advance();
              }, autoAdvance);
            }

            // Helper: bind button clicks
            function bindButtons() {
              setTimeout(function () {
                var card = document.getElementById('preview-card');
                if (!card) return;
                var btns = card.querySelectorAll('[data-btn]');
                btns.forEach(function (btn) {
                  var txt = (btn.textContent || '').trim();
                  if (!txt) return;
                  btn.style.cursor = 'pointer';
                  btn.onclick = function (e) {
                    e.stopPropagation();
                    var rt = Date.now() - trialStart;
                    recordAndAdvance(rt, txt, true);
                  };
                });
              }, 150);
            }

            if (hasKeyboard) {
              var validKeys = kbKeys.split(',').map(function (k) {
                var t = k.trim();
                return t || ' ';
              });
              overlay._keydown = function (e) {
                var k = e.key.toLowerCase();
                if (validKeys.indexOf(k) >= 0) {
                  var rt = Date.now() - trialStart;
                  var correctKeys = kbCorrect ? kbCorrect.split(',').map(function (x) { var t = x.trim(); return t ? t.toLowerCase() : ' '; }) : [];
                  var correct = !kbCorrect || correctKeys.indexOf(k) >= 0;
                  recordAndAdvance(rt, k, correct);
                }
              };
              overlay.addEventListener('keydown', overlay._keydown);
              if (kbTimeout)
                advanceTimer = setTimeout(function () {
                  recordAndAdvance(kbTimeout, 'timeout', false);
                }, kbTimeout);
            } else if (hasButton) {
              bindButtons();
            } else if (hasSlider) {
              setTimeout(function () {
                var card = document.getElementById('preview-card');
                if (!card) return;
                var slider = card.querySelector('input[type=range]');
                if (!slider) return;
                var confirmBtn = document.createElement('button');
                confirmBtn.textContent = 'Confirm';
                confirmBtn.style.cssText =
                  'margin-top:8px;padding:8px 24px;border-radius:8px;border:none;background:#6366f1;color:#ffffff;cursor:pointer;font-size:0.85rem;font-weight:600';
                confirmBtn.onclick = function () {
                  var rt = Date.now() - trialStart;
                  recordAndAdvance(rt, slider.value, true);
                };
                slider.parentNode.appendChild(confirmBtn);
              }, 100);
            } else if (hasTextInput) {
              // Text input: user types freely, clicks confirm to submit
              setTimeout(function () {
                var card = document.getElementById('preview-card');
                if (!card) return;
                var input = card.querySelector('input[type=text],input:not([type])');
                if (!input) return;
                input.focus();
                input.addEventListener('keydown', function (e) {
                  e.stopPropagation();
                }); // don't bubble to overlay
                var confirmBtn = document.createElement('button');
                confirmBtn.textContent = 'Confirm';
                confirmBtn.style.cssText =
                  'margin-top:8px;padding:8px 24px;border-radius:8px;border:none;background:#6366f1;color:#ffffff;cursor:pointer;font-size:0.85rem;font-weight:600';
                confirmBtn.onclick = function (e) {
                  e.stopPropagation();
                  var rt = Date.now() - trialStart;
                  recordAndAdvance(rt, input.value || '(empty)', true);
                };
                input.parentNode.appendChild(confirmBtn);
                // Also allow Enter key to submit
                input.addEventListener('keypress', function (e) {
                  if (e.key === 'Enter') {
                    confirmBtn.click();
                  }
                });
              }, 100);
            } else if (hasClick) {
              overlay._keydown = function (e) {
                recordAndAdvance(Date.now() - trialStart, e.key, true);
              };
              overlay.addEventListener('keydown', overlay._keydown);
            }
          } // end setupInteraction

          overlay.setAttribute('tabindex', '0');
          overlay.focus();
        }
        try {
          showCurrent();
        } catch (e) {
          overlay.innerHTML =
            '<div style="background:#fff;border-radius:16px;padding:40px;text-align:center;color:#ef4444"><h2>Preview failed to load</h2><p>' +
            e.message +
            '</p><p style="font-size:0.72rem;color:#888;margin-top:8px">phases length: ' +
            editor.phases.length +
            ' | pi: ' +
            pi +
            ' | ti: ' +
            ti +
            '</p><p style="font-size:0.72rem;color:#888">phases[pi]: ' +
            (editor.phases[pi] ? JSON.stringify(editor.phases[pi]).slice(0, 80) : 'undefined') +
            '</p><button onclick="document.getElementById(\'exp-preview\').remove()" style="margin-top:16px;padding:8px 24px;border-radius:8px;border:none;background:#6366f1;color:#ffffff;cursor:pointer">关闭</button></div>';
        }
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
      function migratePos() {
        editor.phases.forEach(function (p) {
          p.trials.forEach(function (t) {
            t.components.forEach(function (c) {
              if (!('posX' in c)) c.posX = 0;
              if (!('posY' in c)) c.posY = 0;
            });
          });
        });
      }
      function undo() {
        if (editor.hi < 0) return;
        var s = editor.history[editor.hi];
        editor.hi--;
        if (!s) return;
        editor.phases = s.phases;
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
        var dev = editor.device || {w: 1280, h: 720};
        var visuals = [],
          logics = [];
        t.components.forEach(function (c) {
          if (['loop', 'branch', 'delay', 'randomize', 'variable'].indexOf(c.type) >= 0) logics.push(c);
          else visuals.push(c);
        });
        if (visuals.length === 0) {
          alert('No visual elements to arrange');
          return;
        }

        function estH(c) {
          switch (c.type) {
            case 'text':
              var lines = (c.content || '').split('\n').length;
              return (c.fontSize || 32) * 1.6 * Math.max(1, lines);
            case 'shape':
              return c.size || 80;
            case 'image':
              return c.width ? Math.round(c.width * 0.7) : 180;
            case 'fixation':
              return 48;
            case 'keyboard':
              return 56;
            case 'button':
              return 48;
            case 'slider':
              return 80;
            case 'click':
              return 180;
            case 'textInput':
              return 56;
            case 'audio':
              return 40;
            case 'video':
              return c.width ? Math.round(c.width * 0.6) : 200;
            default:
              return 60;
          }
        }

        saveState();
        // Split: stimulus types → upper area, response types → lower area
        var stim = [],
          resp = [];
        visuals.forEach(function (c) {
          if (['text', 'shape', 'image', 'fixation', 'audio', 'video'].indexOf(c.type) >= 0) stim.push(c);
          else resp.push(c);
        });

        // Ensure visual components are content-centered
        visuals.forEach(function (c) {
          if (['text', 'shape', 'image'].indexOf(c.type) >= 0) c.position = 'center';
        });

        var centerX = Math.round(dev.w / 2);
        var gap = Math.round(dev.h * 0.04);

        // Calculate total block height for vertical centering
        var allComps = stim.concat(resp);
        var totalH = allComps.reduce(function (s, c) {
          return s + estH(c);
        }, 0);
        var totalGaps = (allComps.length - 1) * gap;
        if (stim.length > 0 && resp.length > 0) totalGaps += Math.round(dev.h * 0.04); // extra stim-resp gap
        var startY = Math.round((dev.h - totalH - totalGaps) / 2);
        var y = startY;

        // Layout stimuli from centered start
        stim.forEach(function (c) {
          c.posX = centerX;
          c.posY = y;
          y += estH(c) + gap;
        });
        // Extra gap before responses
        if (resp.length > 0 && stim.length > 0) y += Math.round(dev.h * 0.04);
        resp.forEach(function (c) {
          c.posX = centerX;
          c.posY = y;
          y += estH(c) + gap;
        });

        autoSave();
        renderAll();
      }

      // ============ Templates ============
      function loadTemplate(name) {
        resetEditor();
        // Helper: set component props by index in a trial
        function sc(trial, idx, props) {
          var c = trial.components[idx];
          Object.keys(props).forEach(function (k) {
            c[k] = props[k];
          });
        }
        // Position helper: proportion of device dimensions → pixel coords
        var dev = editor.device || {w: 1280, h: 720};
        function px(rx, ry) {
          return {posX: Math.round(dev.w * rx), posY: Math.round(dev.h * ry)};
        }

        if (name === 'stroop') {
          // Phase 1: Instructions
          addPhase('instructions');
          var p1 = editor.phases[0].id;
          addTrial(p1);
          addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'button', 'r');
          var t1 = findTrial(editor.selectedTrial);
          sc(t1, 0, Object.assign({content: 'Welcome to the Stroop experiment!\n\nYou will see color words (RED, BLUE, GREEN) displayed in different font colors.\nYour task is to respond to the FONT COLOR, ignoring the word meaning.\n\nRed font → Press A\nBlue font → Press L\nGreen font → Press K\n\nRespond as quickly and accurately as possible!', fontSize: 20, position: 'center'}, px(0.5, 0.12)));
          sc(t1, 1, Object.assign({labels: 'Start Experiment'}, px(0.5, 0.76)));
          // Phase 2: Stroop trials — 9 variants (3 colors × 3 characters)
          addPhase('trials');
          var p2 = editor.phases[1].id;
          // Main trial: fixation → delay → randomize(9 texts) → keyboard → branch → loop
          addTrial(p2);
          addComponent(editor.selectedTrial, 'fixation', 's');
          addComponent(editor.selectedTrial, 'delay', 'l');
          addComponent(editor.selectedTrial, 'randomize', 'l');
          for (var si = 0; si < 9; si++) addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'keyboard', 'r');
          addComponent(editor.selectedTrial, 'branch', 'l');
          addComponent(editor.selectedTrial, 'loop', 'l');
          var t2 = findTrial(editor.selectedTrial);
          sc(t2, 0, Object.assign({duration: 500}, px(0.5, 0.45)));
          sc(t2, 1, {duration: 200});
          sc(t2, 2, {mode: 'pick-one'});
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
            sc(t2, 3 + vi, Object.assign({content: v.content, color: v.color, fontSize: 36, position: 'center', fontWeight: 'bold', 映射按键: v.key}, px(0.5, 0.38)));
          });
          sc(t2, 12, Object.assign({keys: 'a,l,k', prompt: 'Red→A  Blue→L  Green→K'}, px(0.5, 0.62)));
          sc(t2, 13, {condition: 'correct'});
          sc(t2, 14, {count: 48});
          // Error feedback trial
          addTrial(p2);
          addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'delay', 'l');
          var t3 = findTrial(editor.selectedTrial);
          sc(t3, 0, Object.assign({content: 'Press the key for the FONT COLOR!\nRed=A  Blue=L  Green=K', fontSize: 22, color: '#ef4444', position: 'center'}, px(0.5, 0.4)));
          sc(t3, 1, {duration: 1200});
          sc(t2, 13, {condition: 'correct', targetFail: t3.id});
          // Phase 3: Feedback
          addPhase('feedback');
          var p3 = editor.phases[2].id;
          addTrial(p3);
          addComponent(editor.selectedTrial, 'text', 's');
          var t3 = findTrial(editor.selectedTrial);
          sc(
            t3,
            0,
            Object.assign(
              {content: 'Experiment complete!\n\nThank you for your participation.\nYour response data has been recorded.', fontSize: 22, position: 'center'},
              px(0.5, 0.4),
            ),
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
            Object.assign(
              {
                content:
                  'Welcome to the Simon effect experiment!\n\nColored circles will appear on the left or right side of the screen.\nIgnore the position and respond based on COLOR:\n\nRed → Press A\nGreen → Press L\n\nRespond as quickly and accurately as possible!',
                fontSize: 20,
                position: 'center',
              },
              px(0.5, 0.14),
            ),
          );
          sc(t1, 1, Object.assign({labels: 'Start Experiment'}, px(0.5, 0.74)));
          // Phase 2: Simon trials — pick-one from 4 variants (red/green × left/right)
          addPhase('trials');
          var p2 = editor.phases[1].id;
          // Main trial: fixation → delay → randomize(4 shapes) → keyboard → branch → loop
          addTrial(p2);
          addComponent(editor.selectedTrial, 'fixation', 's');
          addComponent(editor.selectedTrial, 'delay', 'l');
          addComponent(editor.selectedTrial, 'randomize', 'l');
          addComponent(editor.selectedTrial, 'shape', 's');
          addComponent(editor.selectedTrial, 'shape', 's');
          addComponent(editor.selectedTrial, 'shape', 's');
          addComponent(editor.selectedTrial, 'shape', 's');
          addComponent(editor.selectedTrial, 'keyboard', 'r');
          addComponent(editor.selectedTrial, 'branch', 'l');
          addComponent(editor.selectedTrial, 'loop', 'l');
          var t2 = findTrial(editor.selectedTrial);
          sc(t2, 0, Object.assign({duration: 500}, px(0.5, 0.45))); // fixation
          sc(t2, 1, {duration: 200}); // delay 200ms
          sc(t2, 2, {mode: 'pick-one'}); // randomize: pick one each loop
          sc(t2, 3, Object.assign({shape: 'circle', size: 80, color: '#ef4444', position: 'center', 映射按键: 'a'}, px(0.25, 0.38))); // 左→A
          sc(t2, 4, Object.assign({shape: 'circle', size: 80, color: '#ef4444', position: 'center', 映射按键: 'a'}, px(0.75, 0.38))); // 右→A
          sc(t2, 5, Object.assign({shape: 'circle', size: 80, color: '#22c55e', position: 'center', 映射按键: 'l'}, px(0.25, 0.38))); // 左→L
          sc(t2, 6, Object.assign({shape: 'circle', size: 80, color: '#22c55e', position: 'center', 映射按键: 'l'}, px(0.75, 0.38))); // 右→L
          sc(t2, 7, Object.assign({keys: 'a,l', prompt: 'Red→A  Green→L'}, px(0.5, 0.62))); // keyboard
          sc(t2, 8, {condition: 'correct'}); // branch placeholder (targetFail set below)
          sc(t2, 9, {count: 60}); // 60 trials
          // Error feedback trial (branch target)
          addTrial(p2);
          addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'delay', 'l');
          var t3 = findTrial(editor.selectedTrial);
          sc(
            t3,
            0,
            Object.assign(
              {content: 'Press the key for the COLOR!\nRed=A  Green=L', fontSize: 22, color: '#ef4444', position: 'center'},
              px(0.5, 0.4),
            ),
          );
          sc(t3, 1, {duration: 1200});
          // Set branch target to error trial
          sc(t2, 8, {condition: 'correct', targetFail: t3.id});
          // Phase 3: Feedback
          addPhase('feedback');
          var p3 = editor.phases[2].id;
          addTrial(p3);
          addComponent(editor.selectedTrial, 'text', 's');
          var tf = findTrial(editor.selectedTrial);
          sc(
            tf,
            0,
            Object.assign(
              {
                content: 'Experiment complete!\n\nThank you for your participation.\nYour reaction time and accuracy have been recorded.',
                fontSize: 24,
                position: 'center',
              },
              px(0.5, 0.4),
            ),
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
          sc(t1, 0, Object.assign({
            content: 'Welcome to the Flanker task!', fontSize: 20, color: '#1e293b', position: 'center'
          }, px(0.5, 0.15)));
          sc(t1, 1, Object.assign({
            content: 'A row of arrows will appear in the center. Judge the direction of the MIDDLE arrow.\nIf the middle arrow points LEFT (←), press F.\nIf the middle arrow points RIGHT (→), press J.\nIgnore the flanking arrows. Respond quickly and accurately.',
            fontSize: 16, color: '#333333', position: 'center'
          }, px(0.5, 0.30)));
          sc(t1, 2, Object.assign({labels: 'Start Experiment'}, px(0.5, 0.76)));
          // Phase 2: Flanker trials
          addPhase('trials');
          var p2 = editor.phases[1].id;
          // Main trial: fixation → delay → randomize(5 texts) → keyboard → branch → loop
          addTrial(p2);
          addComponent(editor.selectedTrial, 'fixation', 's');
          addComponent(editor.selectedTrial, 'delay', 'l');
          addComponent(editor.selectedTrial, 'randomize', 'l');
          for (var fi = 0; fi < 5; fi++) addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'keyboard', 'r');
          addComponent(editor.selectedTrial, 'branch', 'l');
          addComponent(editor.selectedTrial, 'loop', 'l');
          var t2 = findTrial(editor.selectedTrial);
          sc(t2, 0, Object.assign({duration: 500}, px(0.5, 0.45)));
          sc(t2, 1, {duration: 200});
          sc(t2, 2, {mode: 'pick-one'});
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
            sc(t2, 3 + fi2, Object.assign({content: fv.content, fontSize: 28, color: fv.color, position: 'center', 映射按键: fv.映射按键}, px(0.5, 0.38)));
          }
          sc(t2, 8, Object.assign({keys: 'f,j', prompt: '← Press F  → Press J', timeout: 1500}, px(0.5, 0.62)));
          sc(t2, 9, {condition: 'correct', targetFail: ''});
          sc(t2, 10, {count: 80});
          // Error feedback trial (branch target)
          addTrial(p2);
          addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'delay', 'l');
          var tErr = findTrial(editor.selectedTrial);
          sc(tErr, 0, Object.assign({
            content: 'Press the key according to the rules!', fontSize: 20, color: '#ef4444', position: 'center'
          }, px(0.5, 0.42)));
          sc(tErr, 1, {duration: 1500});
          sc(t2, 9, {condition: 'correct', targetFail: tErr.id});
          // Error message trial (shown after main experiment)
          addTrial(p2);
          addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'keyboard', 'r');
          var t3 = findTrial(editor.selectedTrial);
          sc(t3, 0, Object.assign({
            content: 'Incorrect answer. Please focus.', fontSize: 22, color: '#dc2626', position: 'center'
          }, px(0.5, 0.38)));
          sc(t3, 1, Object.assign({keys: ' ', prompt: 'Press space to continue'}, px(0.5, 0.62)));
          // Phase 3: Feedback
          addPhase('feedback');
          var p3 = editor.phases[2].id;
          addTrial(p3);
          addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'keyboard', 'r');
          var tf = findTrial(editor.selectedTrial);
          sc(tf, 0, Object.assign({
            content: 'Experiment complete. Thank you for your participation!', fontSize: 22, color: '#1e293b', position: 'center'
          }, px(0.5, 0.38)));
          sc(tf, 1, Object.assign({keys: ' '}, px(0.5, 0.62)));
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
            Object.assign(
              {
                content:
                  'Branch Demo\n\nThis experiment demonstrates the branch component:\n• Red text → Press A\n• Blue text → Press L\n• Wrong answer → jumps to error feedback\n• Correct answer → proceeds normally\n\n2 sets of 3 trials each.',
                fontSize: 18,
                position: 'center',
              },
              px(0.5, 0.14),
            ),
          );
          sc(t1, 1, Object.assign({labels: 'Start Demo'}, px(0.5, 0.74)));
          // Phase 2: branch demo trials
          addPhase('trials');
          var p2 = editor.phases[1].id;
          // -- Trial 2: red text, A key (correctKey: a), branch→t3 on error
          addTrial(p2);
          addComponent(editor.selectedTrial, 'fixation', 's');
          addComponent(editor.selectedTrial, 'delay', 'l');
          addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'keyboard', 'r');
          addComponent(editor.selectedTrial, 'branch', 'l');
          addComponent(editor.selectedTrial, 'loop', 'l');
          var t2 = findTrial(editor.selectedTrial);
          sc(t2, 0, Object.assign({duration: 500}, px(0.5, 0.45)));
          sc(t2, 1, {duration: 200});
          sc(t2, 2, Object.assign({content: 'RED', color: '#ef4444', fontSize: 36, position: 'center'}, px(0.5, 0.38)));
          sc(t2, 3, Object.assign({keys: 'a,l', correctKey: 'a'}, px(0.5, 0.62)));
          sc(t2, 4, {condition: 'correct'}); // targetFail set below after trial IDs known
          sc(t2, 5, {count: 3});
          // -- Trial 3: error feedback (target of branch from trial 2)
          addTrial(p2);
          addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'delay', 'l');
          var t3 = findTrial(editor.selectedTrial);
          sc(
            t3,
            0,
            Object.assign(
              {content: 'Wrong key!\n\nPress A for RED text', fontSize: 22, color: '#ef4444', position: 'center'},
              px(0.5, 0.4),
            ),
          );
          sc(t3, 1, {duration: 1500});
          // -- Trial 4: blue text, L key (correctKey: l), branch→t5 on error
          addTrial(p2);
          addComponent(editor.selectedTrial, 'fixation', 's');
          addComponent(editor.selectedTrial, 'delay', 'l');
          addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'keyboard', 'r');
          addComponent(editor.selectedTrial, 'branch', 'l');
          addComponent(editor.selectedTrial, 'loop', 'l');
          var t4 = findTrial(editor.selectedTrial);
          sc(t4, 0, Object.assign({duration: 500}, px(0.5, 0.45)));
          sc(t4, 1, {duration: 200});
          sc(t4, 2, Object.assign({content: 'BLUE', color: '#3b82f6', fontSize: 36, position: 'center'}, px(0.5, 0.38)));
          sc(t4, 3, Object.assign({keys: 'a,l', correctKey: 'l'}, px(0.5, 0.62)));
          sc(t4, 4, {condition: 'correct'});
          sc(t4, 5, {count: 3});
          // -- Trial 5: error feedback (target of branch from trial 4)
          addTrial(p2);
          addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'delay', 'l');
          var t5 = findTrial(editor.selectedTrial);
          sc(
            t5,
            0,
            Object.assign(
              {content: 'Wrong key!\n\nPress L for BLUE text', fontSize: 22, color: '#ef4444', position: 'center'},
              px(0.5, 0.4),
            ),
          );
          sc(t5, 1, {duration: 1500});
          // Now set targetFail references (trial IDs are known)
          sc(t2, 4, {condition: 'correct', targetFail: t3.id});
          sc(t4, 4, {condition: 'correct', targetFail: t5.id});
          // Phase 3: feedback
          addPhase('feedback');
          var p3 = editor.phases[2].id;
          addTrial(p3);
          addComponent(editor.selectedTrial, 'text', 's');
          var tf = findTrial(editor.selectedTrial);
          sc(
            tf,
            0,
            Object.assign(
              {
                content:
                  'Demo complete!\n\nKey branch features:\n• targetFail property specifies error jump target\n• Correct answer: continues main flow\n• Wrong answer: flashes red → jumps to error page\n• Error page ends → returns to main flow\n• Target trials auto-skipped when reached via normal flow',
                fontSize: 20,
                position: 'center',
              },
              px(0.5, 0.3),
            ),
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
            Object.assign(
              {
                content:
                  'Randomize + Variable Demo\n\nThis experiment demonstrates two logic components:\n\nVariable: stores experiment data (e.g. score)\n  • Creates variable score=0 at trial start\n  • +1 on each correct answer\n\nRandomize: shuffles component display order\n  • 4 fruit names in random order\n  • Different order each loop\n\nMemorize the fruit names, then type them in.\n5 rounds total.',
                fontSize: 17,
                position: 'center',
              },
              px(0.5, 0.12),
            ),
          );
          sc(t1, 1, Object.assign({labels: 'Start Demo'}, px(0.5, 0.76)));
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
          addComponent(editor.selectedTrial, 'delay', 'l');
          addComponent(editor.selectedTrial, 'randomize', 'l');
          addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'text', 's');
          addComponent(editor.selectedTrial, 'delay', 'l');
          addComponent(editor.selectedTrial, 'textInput', 'r');
          addComponent(editor.selectedTrial, 'variable', 'l');
          addComponent(editor.selectedTrial, 'loop', 'l');
          var t3 = findTrial(editor.selectedTrial);
          sc(t3, 0, Object.assign({duration: 500}, px(0.5, 0.45)));
          sc(t3, 1, {duration: 200});
          sc(t3, 2, {mode: 'shuffle'});
          sc(
            t3,
            3,
            Object.assign({content: 'Apple', fontSize: 30, color: '#ef4444', position: 'center'}, px(0.5, 0.2)),
          );
          sc(
            t3,
            4,
            Object.assign({content: 'Banana', fontSize: 30, color: '#f59e0b', position: 'center'}, px(0.5, 0.3)),
          );
          sc(
            t3,
            5,
            Object.assign({content: 'Orange', fontSize: 30, color: '#f97316', position: 'center'}, px(0.5, 0.4)),
          );
          sc(
            t3,
            6,
            Object.assign({content: 'Grape', fontSize: 30, color: '#a855f7', position: 'center'}, px(0.5, 0.5)),
          );
          sc(t3, 7, {duration: 2000});
          sc(
            t3,
            8,
            Object.assign(
              {placeholder: 'Enter the fruits you remember', correctAnswer: 'Apple,Banana,Orange,Grape', validation: 'contains'},
              px(0.5, 0.7),
            ),
          );
          sc(t3, 9, {name: 'score', initial: 0});
          sc(t3, 10, {count: 5});
          // Phase 3: Feedback
          addPhase('feedback');
          var p3 = editor.phases[2].id;
          addTrial(p3);
          addComponent(editor.selectedTrial, 'text', 's');
          var tf = findTrial(editor.selectedTrial);
          sc(
            tf,
            0,
            Object.assign(
              {
                content:
                  'Demo complete!\n\nVariable component:\n• Stores and updates experiment data\n• e.g. scores, cumulative RT\n• Converted to data fields in jsPsych\n\nRandomize component:\n• Shuffles component order within a trial\n• Controls order effects\n• Converted to timeline_variables in jsPsych',
                fontSize: 20,
                position: 'center',
              },
              px(0.5, 0.28),
            ),
          );
        }
        if (editor.selectedTrial) {
          var ft = findTrial(editor.selectedTrial);
          if (ft && ft.components.length > 0) editor.selComp = ft.components[0].id;
        }
        renderAll();
      }

      function setDevice(idx) {
        if (idx === '') {
          editor.device = null;
        } else {
          editor.device = devicePresets[parseInt(idx)];
        }
        renderAll();
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
        function _mediaRef(c) {
          if (!c.fileData) return null;
          if (_mediaVars[c.fileData]) return _mediaVars[c.fileData];
          var name = 'EXP_MEDIA_' + _mediaDecls.length;
          _mediaVars[c.fileData] = name;
          _mediaDecls.push({name: name, type: c.type, data: c.fileData});
          return name;
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
        // used as intended; for button/slider/textInput/click it serves as the trial
        // container with choices: "NO_KEYS" — the controls are drawn into the
        // stimulus and the trial ends via jsPsych.finishTrial().
        function pluginName(rt) {
          var name = 'jsPsychHtmlKeyboardResponse';
          _usedPlugins[name] = true;
          return name;
        }

        // Build styled stimulus HTML for a component (mirrors renderTrialHTML style)
        // ---- Self-rendered response controls -------------------------------
        // jsPsych's *-button / *-slider / survey-text plugins render their controls
        // *below* the stimulus, which is why a control dragged to posY ended up
        // outside the canvas. We draw the controls into the stimulus HTML at their
        // real coordinates and end the trial ourselves with jsPsych.finishTrial().
        function _esc(s) {
          return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        }
        var _CTL_CSS =
          'font:inherit;font-size:16px;padding:11px 24px;border-radius:10px;' +
          'border:1px solid #c9c9d2;background:#ffffff;color:#17171c;cursor:pointer;';
        function _ctlButton(label, kind, idx, val, extra) {
          return '<button type="button" class="expvis-ctl" data-kind="' + kind + '"' +
            (idx == null ? '' : ' data-index="' + idx + '"') +
            ' data-value="' + _esc(val) + '" style="' + _CTL_CSS + (extra || '') + '">' +
            _esc(label) + '</button>';
        }
        function _ctlHTML(c, px) {
          if (c.type === 'button') {
            var labels = String(c.labels || '').split(',').map(function (x) { return x.trim(); })
              .filter(function (x) { return x; });
            return '<div style="' + px + 'display:flex;gap:14px;justify-content:center">' +
              labels.map(function (l, i) { return _ctlButton(l, 'button', i, l); }).join('') +
              '</div>';
          }
          if (c.type === 'slider') {
            var lo = c.min == null ? 0 : c.min, hi = c.max == null ? 100 : c.max;
            var st = c.step || 1, mid = Math.round((lo + hi) / 2);
            return '<div style="' + px + 'text-align:center">' +
              '<input type="range" class="expvis-range" min="' + lo + '" max="' + hi +
              '" step="' + st + '" value="' + mid + '" style="width:320px;accent-color:#6366f1">' +
              '<div class="expvis-range-val" style="font-size:1.3em;font-weight:700;margin:6px 0 10px">' + mid + '</div>' +
              _ctlButton('Continue', 'slider', null, mid) +
              '</div>';
          }
          if (c.type === 'textInput') {
            return '<div style="' + px + 'text-align:center">' +
              '<input type="text" class="expvis-text" placeholder="' + _esc(c.placeholder || '') +
              '" style="font:inherit;font-size:16px;padding:10px 14px;border:1px solid #c9c9d2;' +
              'border-radius:8px;width:280px"> ' +
              _ctlButton('Continue', 'textInput', null, 'submit') +
              '</div>';
          }
          if (c.type === 'click') {
            return '<div class="expvis-ctl expvis-clickzone" data-kind="click" data-value="click" ' +
              'style="position:absolute;left:0;top:0;right:0;bottom:0;cursor:pointer"></div>';
          }
          return '';
        }

        function compHTML(c) {
          // jsPsych-style flow layout: components are blocks in a flex column,
          // not absolutely positioned pixels. `position` becomes the alignment.
          // This is what makes the stimulus responsive and matches how hand-written
          // jsPsych lays out stimuli.
          var pos = c.position || 'center';
          var _al = pos === 'left' ? 'flex-start' : pos === 'right' ? 'flex-end' : 'center';
          var _ta = pos === 'left' ? 'left' : pos === 'right' ? 'right' : 'center';
          var px = 'align-self:' + _al + ';text-align:' + _ta + ';';
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
                ';text-align:' +
                (c.position === 'left' ? 'left' : c.position === 'right' ? 'right' : 'center') +
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
            case 'button':
            case 'slider':
            case 'textInput':
            case 'click':
              return _ctlHTML(c, px);
            case 'image':
              return c.fileData
                ? '<img src="@@' + _mediaRef(c) + '@@" style="' + px + 'max-width:' + (c.width || 200) + 'px">'
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
          ph.trials.forEach(function (t, ti) {
                  // --- Classify components ---
      var stims = [],
        respType = null,
        respInfo = {},
        logic = { loop: null, hints: [], randomizeMode: null, randomizeStims: [], timeout: 0, hasBranch: false, branchCond: 'correct', branchTarget: '', branchMatch: '', branchOp: '>=', branchCmp: '', hasVariable: false, varName: '', varInit: 0, varMode: 'correct' };
      var preStims = [], postStims = [], foundRandomize = false;
      // fixation / delay are *timed segments*: each becomes its own jsPsych trial
      // inside the node's timeline, so their durations actually take effect.
      // (Previously they were folded into the stimulus HTML and the duration was
      // recorded but never emitted.)
      var preTiming = [], postTiming = [], seenVisual = false;
      // response components drawn into the stimulus at their own coordinates
      var respControls = [];
      t.components.forEach(function (c) {
        if (c.type === 'fixation' || c.type === 'delay') {
          // Keep the component itself: its own renderer supplies the look
          // (e.g. the fixation cross is 40px #ccc), so a trimmed {kind,duration}
          // would silently lose that styling.
          if (seenVisual) { postTiming.push(c); } else { preTiming.push(c); }
          return;
        }
        var isStim = ['text', 'shape', 'image', 'audio', 'video'].indexOf(c.type) >= 0;
        if (isStim) {
          seenVisual = true;
          if (!foundRandomize) { preStims.push(c); }
          else { postStims.push(c); logic.randomizeStims.push(c); }
          stims.push(c);
          return;
        }
        if (c.type === 'keyboard') {
          respType = 'keyboard';
          respInfo = respInfo || {};
          respInfo.choices = c.keys.split(',').map(function (k) { var t = k.trim(); return t || ' '; });
          respInfo.correctKey = c.correctKey || '';
          if (c.timeout) logic.timeout = Math.max(logic.timeout || 0, c.timeout);
        } else if (c.type === 'button' || c.type === 'slider' ||
                   c.type === 'textInput' || c.type === 'click') {
          // Self-rendered: drawn into the stimulus, so posX/posY are honoured.
          if (!respType) respType = c.type;
          respInfo = respInfo || {};
          if (c.type === 'button') {
            respInfo.choices = String(c.labels || '').split(',').map(function (l) { return l.trim(); });
          } else if (c.type === 'slider') {
            respInfo.min = c.min; respInfo.max = c.max; respInfo.step = c.step;
            respInfo.labelMin = c.labelMin || '';
            respInfo.labelMax = c.labelMax || '';
          } else if (c.type === 'textInput') {
            respInfo.placeholder = c.placeholder || '';
            respInfo.correctAnswer = c.correctAnswer || '';
            respInfo.validation = c.validation || 'none';
          }
          respControls.push(c);
        } else if (c.type === 'loop') {
          logic.loop = c.count;
        } else if (c.type === 'randomize') {
          foundRandomize = true;
          logic.randomizeMode = c.mode || 'pick-one';
        } else if (c.type === 'branch') {
          logic.hasBranch = true;
          logic.branchCond = c.condition || 'correct';
          logic.branchTarget = c.targetFail || '';
          logic.branchMatch = c.matchValue || '';
          logic.branchOp = c.operator || '>=';
          logic.branchCmp = c.compareValue || '';
        } else if (c.type === 'variable') {
          logic.hasVariable = true;
          logic.varName = c.name;
          logic.varInit = c.initial;
          logic.varMode = c.mode || 'correct';
        }
      });
// Default: any-key to continue (for instructions / feedback / stimulus-only)
            if (!respType) {
              respType = 'keyboard';
              if (stims.length > 0) respInfo = {choices: [' ']};
            }

            // A jsPsych trial runs exactly one response plugin, so a trial carrying
            // several response components can only emit one of them. Say so loudly
            // instead of dropping the rest silently.
            var respComps = t.components.filter(function (c) {
              return ['keyboard', 'button', 'slider', 'textInput', 'click'].indexOf(c.type) >= 0;
            });
            if (respComps.length > 1) {
              logic.hints.push('// !! This trial has ' + respComps.length +
                ' response components (' + respComps.map(function (c) { return c.type; }).join(', ') +
                '), but a jsPsych trial runs a single response plugin.');
              logic.hints.push('// !! Only "' + respType + '" was generated. Split the others into ' +
                'their own trials if you need to capture all responses.');
            }

            // Semantic, stable names in the generated code: the phase type plus
            // the trial's index within that phase.
            var _slug = ph.type === 'instructions' ? 'instructions'
                      : ph.type === 'feedback' ? 'feedback' : 'trials';
            var trialName = _slug + '_trial_' + (ti + 1);
            var pname = pluginName(respType);

            // --- Build stimulus HTML ---
            // For randomize pick-one: generate timeline_variables per stimulus variant
            var hasRandomizePickOne = logic.randomizeMode === 'pick-one' && logic.randomizeStims.length > 1;
            var hasRandomizeShuffle = logic.randomizeMode === 'shuffle' && logic.randomizeStims.length > 1;
            // Both modes drive the trial from timeline_variables; they differ only in
            // how many variants run per repetition (see the `sample` / `randomize_order` below).
            var hasVariantTimeline = hasRandomizePickOne || hasRandomizeShuffle;
            // Build HTML for pre-randomize components (fixation etc.)
            var preHTML = preStims.map(function (c) { return compHTML(c); }).join('');
            // Individual stimulus variants for timeline_variables
            var stimVariants = logic.randomizeStims.map(function (c) {
              return { html: compHTML(c), correctKey: c.映射按键 || '' };
            });
            // Self-rendered controls join the stimulus at their own coordinates.
            // A click-anywhere zone goes first so it sits *under* the other controls
            // (otherwise it would swallow their clicks).
            var _clickZones = respControls.filter(function (c) { return c.type === 'click'; });
            var _otherCtls = respControls.filter(function (c) { return c.type !== 'click'; });
            var ctlHTML = _clickZones.map(function (c) {
                            // click-anywhere spans the viewport, independent of the flow
                            return _ctlHTML(c, 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:1;');
                          }).join('') +
                          _otherCtls.map(function (c) {
                            var cp = c.position || 'center';
                            var cal = cp === 'left' ? 'flex-start' : cp === 'right' ? 'flex-end' : 'center';
                            return _ctlHTML(c, 'align-self:' + cal + ';');
                          }).join('');
            // Flow container: no fixed canvas, no absolute positioning — content
            // stacks in a centred flex column and adapts to any viewport.
            var fullStimHTML = '<div style="display:flex;flex-direction:column;align-items:center;' +
              'justify-content:center;min-height:60vh;gap:1.5em;padding:2em;box-sizing:border-box">' +
              preHTML + ctlHTML +
              (hasVariantTimeline ? '__VARIANT__' : postStims.map(function(c){return compHTML(c);}).join('')) +
              '</div>';
            fullStimHTML = _jsStr(fullStimHTML);

            // Where the correct answer comes from. Recorded into the trial's `data`
            // so the export is directly analysable, and used to score the trial.
            var correctResponseExpr = null;
            if (hasVariantTimeline && stimVariants.length > 1) {
              correctResponseExpr = "jsPsych.timelineVariable('correct_response')";
            } else if (respInfo.correctKey) {
              correctResponseExpr = "'" + String(respInfo.correctKey).replace(/'/g, "\\'") + "'";
            }

            // --- Generate trial object ---
            var lines = [];
            function L(indent, str) {
              lines.push('  '.repeat(indent) + str);
            }

            // Variable init
            if (logic.hasVariable && logic.varName) {
              code += 'var ' + logic.varName + ' = ' + (logic.varInit || 0) + ';\n';
            }
            // Emit hints for remaining unsupported logic
            logic.hints.forEach(function (h) {
              code += h + '\n';
            });

            L(0, 'var ' + trialName + ' = {');

            if (hasVariantTimeline && stimVariants.length > 1) {
              // Variants live in their own named array (as in the jsPsych
              // tutorial), which keeps the node itself readable.
              code += '// Stimulus variants for ' + trialName + '\n';
              code += 'var ' + trialName + '_variants = [\n';
              stimVariants.forEach(function (v) {
                code += '  {stimulus: \'' + _jsStr(preHTML + v.html) +
                        '\', correct_response: "' + (v.correctKey || '') + '"},\n';
              });
              code += '];\n\n';
              L(1, 'timeline_variables: ' + trialName + '_variants,');
              if (hasRandomizePickOne) {
                // pick-one: draw ONE variant per repetition.
                // (randomize_order would instead run every variant each round.)
                L(1, "sample: {type: 'with-replacement', size: 1},");
              } else {
                // shuffle: run every variant, in a random order, each repetition.
                L(1, 'randomize_order: true,');
              }
              if (logic.loop) {
                L(1, 'repetitions: ' + logic.loop + ',');
              }
            } else if (logic.loop) {
              L(1, 'repetitions: ' + logic.loop + ',');
            }

            // --- node timeline: timed segments around the stimulus trial ---
            L(1, 'timeline: [');
            var ei = 2;
            // A fixed-duration trial that waits for nothing.
            function emitTimingTrial(c) {
              _usedPlugins['jsPsychHtmlKeyboardResponse'] = true;
              // fixation renders its cross through the normal component renderer
              // (so font size / colour are preserved); delay is a blank wait.
              var stim = c.type === 'fixation' ? compHTML(c) : '';
              L(ei, '{');
              L(ei + 1, 'type: jsPsychHtmlKeyboardResponse,');
              L(ei + 1, "stimulus: '" + _jsStr(stim) + "',");
              L(ei + 1, "choices: 'NO_KEYS',");
              // A min<max range turns the duration into a dynamic parameter, the
              // same idiom the jsPsych tutorial uses for a jittered fixation.
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
                L(ei + 1, 'trial_duration: ' + (c.duration || 0) + ',');
              }
              L(ei + 1, "data: {task: '" + c.type + "'}");
              L(ei, '},');
            }
            preTiming.forEach(emitTimingTrial);

            L(ei, '{');
            var indent = ei + 1;
            L(indent, 'type: ' + pname + ',');
            if (respType === 'textInput') {
              L(indent, 'questions: ' + JSON.stringify(respInfo.questions) + ',');
            } else {
              if (hasVariantTimeline && stimVariants.length > 1) {
                L(indent, "stimulus: jsPsych.timelineVariable('stimulus'),");
              } else if (preHTML || postStims.length > 0) {
                L(indent, "stimulus: '" + fullStimHTML + "',");
              }
              if (respControls.length > 0 && respType !== 'keyboard') {
                // controls are self-rendered; the plugin must not listen for anything
                L(indent, "choices: 'NO_KEYS',");
              } else if (respInfo.choices) {
                L(indent,'choices: [' + respInfo.choices.map(function (x) { return '"' + x + '"'; }).join(',') + '],');
              }
            }
            if (respInfo.min != null) L(indent, 'min: ' + respInfo.min + ',');
            if (respInfo.max != null) L(indent, 'max: ' + respInfo.max + ',');
            if (respInfo.step != null) L(indent, 'step: ' + respInfo.step + ',');
            if (respType === 'slider' && (respInfo.labelMin || respInfo.labelMax))
              L(indent, 'labels: ["' + respInfo.labelMin + '", "' + respInfo.labelMax + '"],');
            // ---- self-rendered controls: wire up their events ----
            var _selfRendered = respControls.length > 0 && respType !== 'keyboard';
            if (_selfRendered) {
              var _scored = respType === 'textInput' && !!respInfo.correctAnswer && respInfo.validation !== 'none';
              var _acc = _scored
                ? String(respInfo.correctAnswer).split(',').map(function (a) { return a.trim().toLowerCase(); })
                    .filter(function (a) { return a; })
                : [];
              L(indent, 'on_load: function () {');
              L(indent + 1, 'var _t0 = performance.now();');
              L(indent + 1, 'function _done(p) {');
              L(indent + 2, 'p.rt = Math.round(performance.now() - _t0);');
              L(indent + 2, 'jsPsych.finishTrial(p);');
              L(indent + 1, '}');
              if (respType === 'button') {
                L(indent + 1, "Array.prototype.forEach.call(document.querySelectorAll('.expvis-ctl[data-kind=\"button\"]'), function (b) {");
                L(indent + 2, "b.addEventListener('click', function () {");
                L(indent + 3, "_done({response: b.getAttribute('data-value'), button_index: Number(b.getAttribute('data-index'))});");
                L(indent + 2, '});');
                L(indent + 1, '});');
              } else if (respType === 'slider') {
                L(indent + 1, "var _r = document.querySelector('.expvis-range');");
                L(indent + 1, "var _v = document.querySelector('.expvis-range-val');");
                L(indent + 1, "if (_r && _v) { _r.addEventListener('input', function () { _v.textContent = _r.value; }); }");
                L(indent + 1, "var _sb = document.querySelector('.expvis-ctl[data-kind=\"slider\"]');");
                L(indent + 1, "if (_sb) { _sb.addEventListener('click', function () { _done({response: _r ? Number(_r.value) : null}); }); }");
              } else if (respType === 'textInput') {
                L(indent + 1, "var _inp = document.querySelector('.expvis-text');");
                L(indent + 1, "var _tb = document.querySelector('.expvis-ctl[data-kind=\"textInput\"]');");
                L(indent + 1, 'function _submit() {');
                L(indent + 2, "var _ans = _inp ? _inp.value : '';");
                if (_scored) {
                  L(indent + 2, 'var _acc = ' + JSON.stringify(_acc) + ';');
                  L(indent + 2, 'var _low = _ans.trim().toLowerCase();');
                  L(indent + 2, respInfo.validation === 'exact'
                    ? 'var _ok = _acc.indexOf(_low) >= 0;'
                    : 'var _ok = _acc.some(function (a) { return _low.indexOf(a) >= 0; });');
                  L(indent + 2, '_done({response: _ans, correct: _ok});');
                } else {
                  L(indent + 2, '_done({response: _ans});');
                }
                L(indent + 1, '}');
                L(indent + 1, "if (_tb) { _tb.addEventListener('click', _submit); }");
                L(indent + 1, "if (_inp) { _inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') _submit(); }); }");
              } else if (respType === 'click') {
                L(indent + 1, "var _z = document.querySelector('.expvis-clickzone');");
                L(indent + 1, "if (_z) { _z.addEventListener('click', function () { _done({response: 'click'}); }); }");
              }
              L(indent, '},');
            }
            if (logic.timeout) L(indent, 'trial_duration: ' + logic.timeout + ',');
            if (stims.length === 0 && respType === 'keyboard') L(indent, "prompt: '<p>Press any key to continue</p>',");

            // --- what runs after the response: scoring, counter, branch jump ---
            var hasScore = !!correctResponseExpr;
            // free-text answers are scored here (survey-text returns an object)
            var hasTextScore = respType === 'textInput' && !!respInfo.correctAnswer &&
              respInfo.validation !== 'none';
            var hasVarUpdate = !!(logic.hasVariable && logic.varName && logic.varMode !== 'manual');
            var branchCondCode = null;
            if (logic.hasBranch && logic.branchTarget) {
              if (logic.branchCond === 'correct') {
                if (hasScore) {
                  branchCondCode = '!data.correct';
                } else {
                  logic.hints.push('// NOTE: branch waits on correctness, but no correct key is ' +
                    'configured for this trial — the jump will be skipped. Set the keyboard ' +
                    "component's correct key, or use a shape/text key mapping.");
                }
              } else if (logic.branchCond === 'response') {
                branchCondCode = 'data.response === "' +
                  String(logic.branchMatch).replace(/"/g, '\\"') + '"';
              } else if (logic.branchCond === 'variable' && logic.branchMatch) {
                branchCondCode = logic.branchMatch + ' ' + logic.branchOp + ' ' +
                  (logic.branchCmp === '' ? '0' : logic.branchCmp);
              }
            }
            var needsOnFinish = hasScore || hasTextScore || hasVarUpdate || !!branchCondCode;

            // Variable tracking in data.
            // NB: `trial_index` is a jsPsych reserved key — a custom value would be
            // silently ignored, so use a non-conflicting name for the in-phase index.
            var dataStr = "data: {phase:'" + _stripEmoji(ph.name) + "',trial_in_phase:" + (ti + 1);
            if (logic.hasVariable && logic.varName) {
              dataStr += ',' + logic.varName + ':' + logic.varName;
            }
            if (correctResponseExpr) {
              dataStr += ',correct_response: ' + correctResponseExpr;
            }
            if (hasTextScore) {
              dataStr += ',correct_answer: "' + String(respInfo.correctAnswer).replace(/"/g, '\\"') + '"';
            }
            dataStr += '}';
            if (needsOnFinish) dataStr += ',';
            L(indent, dataStr);

            if (needsOnFinish) {
              L(indent, 'on_finish: function(data) {');
              if (hasTextScore) {
                var accepted = String(respInfo.correctAnswer).split(',').map(function (a) {
                  return a.trim().toLowerCase();
                }).filter(function (a) { return a; });
                L(indent + 1, "var ans = String((data.response && data.response.response) || '').trim().toLowerCase();");
                L(indent + 1, 'var accepted = ' + JSON.stringify(accepted) + ';');
                L(indent + 1, respInfo.validation === 'exact'
                  ? 'data.correct = accepted.indexOf(ans) >= 0;'
                  : 'data.correct = accepted.some(function (a) { return ans.indexOf(a) >= 0; });');
              } else if (hasScore) {
                L(indent + 1, 'data.correct = jsPsych.pluginAPI.compareKeys(data.response, data.correct_response);');
              }
              if (hasVarUpdate) {
                L(indent + 1, (logic.varMode === 'correct' ? 'if (data.correct) ' : '') +
                  logic.varName + ' += 1;');
              }
              // The branch is emitted as a conditional timeline entry below, so
              // on_finish only scores the trial.
              L(indent, '},');
            }
            // strip the trial's trailing property comma, then close the entry
            var last = lines[lines.length - 1];
            if (last.slice(-1) === ',') lines[lines.length - 1] = last.slice(0, -1);
            L(ei, '},');

            // timed segments after the stimulus
            // Branch jump as a conditional timeline entry — the jsPsych idiom
            // (conditional_function), rather than mutating the timeline mid-run.
            if (branchCondCode) {
              _usedPlugins['jsPsychHtmlButtonResponse'] = true;
              // Render the branch's target trial as the error page, so what the
              // researcher designed in the GUI is what the participant sees.
              var failTrialObj = logic.branchTarget ? findTrial(logic.branchTarget) : null;
              var failHTML = null;
              var failDuration = 1500;
              if (failTrialObj && failTrialObj.components.length) {
                failHTML = failTrialObj.components
                  .filter(function (fc) { return fc.type !== 'delay'; })
                  .map(function (fc) { return compHTML(fc); }).join('');
                failTrialObj.components.forEach(function (fc) {
                  if (fc.type === 'delay' && fc.duration) failDuration = fc.duration;
                });
              }
              var prevRef = "jsPsych.data.get().last(1).values()[0]";
              var condExpr;
              if (logic.branchCond === 'correct') {
                condExpr = '!' + prevRef + '.correct';
              } else if (logic.branchCond === 'response') {
                condExpr = prevRef + '.response === "' + String(logic.branchMatch).replace(/"/g, '\\"') + '"';
              } else {
                condExpr = logic.branchMatch + ' ' + logic.branchOp + ' ' + (logic.branchCmp === '' ? '0' : logic.branchCmp);
              }
              L(ei, '{');
              L(ei + 1, 'timeline: [{');
              L(ei + 2, 'type: jsPsychHtmlButtonResponse,');
              L(ei + 2, failHTML
                ? "stimulus: '" + _jsStr(failHTML) + "',"
                : "stimulus: '<p style=\"color:#ef4444;font-size:22px\">Wrong answer! Press the key according to the rules.</p>',");
              L(ei + 2, 'choices: ["Continue"],');
              L(ei + 2, 'trial_duration: ' + failDuration);
              L(ei + 1, '}],');
              L(ei + 1, 'conditional_function: function () {');
              L(ei + 2, 'return ' + condExpr + ';');
              L(ei + 1, '}');
              L(ei, '},');
            }

            postTiming.forEach(emitTimingTrial);

            // strip the trailing comma of the last timeline entry
            var tlLast = lines[lines.length - 1];
            if (tlLast.slice(-1) === ',') lines[lines.length - 1] = tlLast.slice(0, -1);

            L(1, ']');
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
      };

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
        if (extraStyle) h += '  <style>\n' + extraStyle + '  </style>\n';
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
          stroop:'Design a classic Stroop color-word interference experiment. Use randomize to shuffle text variants (different colors and word meanings). Red mapped to key:a, Blue to key:l. Include:\n1. Instructions phase: explain task rules (red→A, blue→L, green→K), click to start\n2. Trials phase: 48 trials, each: fixation→delay→randomize→texts(different colors/meanings, each with color-key mapping)→keyboard(keys:a,l,k)→loop. Add branch for error feedback if needed\n3. Feedback phase: thank participant',
          simon:'Design a Simon effect experiment. Each trial uses randomize(pick-one) to select 1 shape variant. Red circle→key:a, Green circle→key:l. Include:\n1. Instructions: task rules (red→A, green→L, ignore position), click to start\n2. Trials: 60 trials, fixation→delay→randomize→shapes(red/green × left/right = 4 variants, each with key mapping)→keyboard(keys:a,l)→loop. Add branch for error feedback\n3. Feedback: thank participant',
          flanker:'Design a Flanker task. Each trial uses randomize(pick-one) to select 1 arrow variant. Left arrow→key:f, Right arrow→key:j. Include:\n1. Instructions: title + rules (press F for left middle arrow, J for right, ignore flankers), click to start\n2. Trials: 80 trials, fixation→delay→randomize→texts(5 arrow types: congruent <<<<<, incongruent >><>> red, congruent >>>>>, incongruent <><<< red, incongruent >>><> green, each with key mapping)→keyboard(keys:f,j,timeout:1500)→branch(correct)→error feedback→loop\n3. Feedback: thank participant',
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
            '  {"type":"trials","color":"t","trials":[{"id":"t2","components":[fixation+delay+randomize(if needed)+stimulus×N+response+branch(if needed)+loop]}]},\n' +
            '  {"type":"feedback","color":"f","trials":[{"id":"tN","components":[text(thanks)]}]}\n' +
            ']}\n\n' +
            '【Full Component Schema】(cat: s=stimulus r=response l=logic)\n\n' +
            'text:       {type:"text",content:"text",fontSize:32,color:"#333333",position:"center",fontWeight:"bold","映射按键":"a",posX:' + Math.round(dev.w / 2) + ',posY:number,cat:"s"}\n' +
            'shape:      {type:"shape",shape:"circle|square|triangle|diamond|star",size:80,color:"#6366f1",position:"center","映射按键":"a",posX:' + Math.round(dev.w / 2) + ',posY:number,cat:"s"}\n' +
            'fixation:   {type:"fixation",duration:500,posX:' + Math.round(dev.w / 2) + ',posY:number,cat:"s"}\n' +
            'image:      {type:"image",fileData:"",fileName:"",width:200,posX:' + Math.round(dev.w / 2) + ',posY:number,cat:"s"}\n' +
            'audio:      {type:"audio",fileData:"",fileName:"",posX:' + Math.round(dev.w / 2) + ',posY:number,cat:"s"}\n' +
            'video:      {type:"video",fileData:"",fileName:"",width:320,posX:' + Math.round(dev.w / 2) + ',posY:number,cat:"s"}\n' +
            'keyboard:   {type:"keyboard",keys:"a,l",prompt:"Press a key",timeout:0,posX:' + Math.round(dev.w / 2) + ',posY:number,cat:"r"}\n' +
            'button:     {type:"button",labels:"Yes,No",color:"#6366f1",posX:' + Math.round(dev.w / 2) + ',posY:number,cat:"r"}\n' +
            'slider:     {type:"slider",min:0,max:100,step:1,labelMin:"",labelMax:"",showValue:true,posX:' + Math.round(dev.w / 2) + ',posY:number,cat:"r"}\n' +
            'textInput:  {type:"textInput",placeholder:"Type here",correctAnswer:"",validation:"contains",posX:' + Math.round(dev.w / 2) + ',posY:number,cat:"r"}\n' +
            'click:      {type:"click",posX:' + Math.round(dev.w / 2) + ',posY:number,cat:"r"}\n' +
            'loop:       {type:"loop",count:48,posX:0,posY:0,cat:"l"}\n' +
            'delay:      {type:"delay",duration:200,posX:0,posY:0,cat:"l"}\n' +
            'branch:     {type:"branch",condition:"correct",matchValue:"",targetFail:"",operator:">=",compareValue:"",posX:0,posY:0,cat:"l"}\n' +
            'randomize:  {type:"randomize",mode:"pick-one",posX:0,posY:0,cat:"l"}\n' +
            'variable:   {type:"variable",name:"score",initial:0,mode:"correct",posX:0,posY:0,cat:"l"}\n\n' +
            '【Color Rules — CRITICAL! Preview background is WHITE #fff】\n' +
            '  Text color must use DARK colors (#333, #1a1a2e, #1e293b). NEVER use #fff/#ffffff/white/light gray!\n' +
            '  Button color: medium-dark (#6366f1, #ef4444, #3b82f6). Do NOT use white!\n' +
            '  Shape color: vivid dark (#ef4444, #22c55e, #3b82f6, #6366f1). Do NOT use white!\n' +
            '  Keyboard keys support spacebar, use keys:" " displayed as "space"; multiple keys comma-separated e.g., "a,l, "\n\n' +
            '【Standard Trial Structure — follow STRICTLY】\n' +
            '[fixation] → [delay] → [randomize(if multiple stimuli)] → [stimulus(text/shape)×N] → [response(keyboard/button/slider/textInput)] → [branch(if error feedback needed)] → [loop]\n' +
            '  ⚠ Every trial MUST end with loop, or it runs only once!\n' +
            '  ⚠ Every trial MUST have delay (after fixation, before stimulus), duration=200\n' +
            '  ⚠ Multiple stimulus variants MUST be wrapped in randomize, or all display at once!\n' +
            '  ⚠ Logic components (loop/delay/branch/randomize/variable) have posX=0, posY=0, cat="l"\n\n' +
            '【Position System】Device: ' + dev.w + '×' + dev.h + '\n' +
            '  Horizontal center: posX=' + Math.round(dev.w / 2) + ' + position:"center"\n' +
            '  Fixation posY≈' + Math.round(dev.h * 0.45) + '  Stimulus posY≈' + Math.round(dev.h * 0.38) + '  Response posY≈' + Math.round(dev.h * 0.62) + '\n' +
            '  Multiple texts on same screen: MUST use different posY! Top to bottom, spacing ≥' + Math.round(dev.h * 0.08) + 'px\n' +
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
            '  Stroop: texts(different colors/words, each with key mapping a/l/k) → randomize(pick-one) → keyboard(keys:"a,l,k") → branch(correct→error page) → loop(48)\n' +
            '  Simon: shapes(red/green × left/right = 4 variants, each with key mapping a/l) → randomize(pick-one) → keyboard(keys:"a,l") → branch(correct→error page) → loop(60)\n' +
            '  Flanker: 5 arrow text variants with explicit 映射按键 f/j based on MIDDLE arrow direction:\n' +
            '    "<<<<<" (5 left)   → 映射按键:"f" (middle ←)\n' +
            '    ">>>>>" (5 right)  → 映射按键:"j" (middle →)\n' +
            '    "><><>" (conflict, middle >) → 映射按键:"j"\n' +
            '    "<><<>" (conflict, middle <) → 映射按键:"f"\n' +
            '    ">>><>" (conflict, middle >) → 映射按键:"j"\n' +
            '    keyboard(keys:"f,j",timeout:1500) → branch(correct→error page) → loop(80)\n' +
            '  Memory: variable(name,initial) → randomize(shuffle) → texts → delay(memorize) → textInput(correctAnswer,validation) → loop\n' +
            '  Survey: text(question, top) + textInput(answer key, bottom) + loop\n' +
            '  Game: text(instructions) + slider(amount,min:0,max:100) + loop\n\n' +
            '【FORBIDDEN — common causes of invalid JSON】\n' +
            '  ❌ text color = #fff/white → invisible on white background\n' +
            '  ❌ Multiple texts sharing same posY → overlapping text\n' +
            '  ❌ randomize present but text/shape missing key mapping → keyboard has no correct key\n' +
            '  ❌ Error feedback trial placed BEFORE main trial → preview shows error first\n' +
            '  ❌ Trial missing loop → only runs once\n' +
            '  ❌ Trial missing delay → no gap between fixation and stimulus\n' +
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
              if (!ph.name) ph.name = ph.type === 'instructions' ? i18n('phase.instructions') : ph.type === 'feedback' ? i18n('phase.feedback') : i18n('phase.trials');
              ph.trials.forEach(function (tr) {
                tr.id = 't' + ++editor.tc;
                tr.components.forEach(function (c) {
                  c.id = 'c' + ++editor.cc;
                  if (!c.posX) c.posX = 0;
                  if (!c.posY) c.posY = 0;
                });
              });
            });
            migratePos();
            // Ensure 3-phase structure
            if (editor.phases.length === 0 || editor.phases[0].type !== 'instructions') {
              var instrPh = { id:'ph_ai_inst', type:'instructions', name: i18n('phase.instructions'), color:'i', trials:[{ id:'t_ai_inst', components:[ { id:'c_ai_txt', type:'text', content:'Welcome to this experiment!\n\nPlease read the instructions carefully before starting.', fontSize:20, color:'#333333', position:'center', fontWeight:'bold', posX:Math.round(dev.w/2), posY:Math.round(dev.h*0.14), cat:'s' }, { id:'c_ai_btn', type:'button', labels:'Start Experiment', posX:Math.round(dev.w/2), posY:Math.round(dev.h*0.74), cat:'r' } ] }] };
              editor.phases.unshift(instrPh);
              editor.tc++; editor.cc += 2;
            }
            var lastPh = editor.phases[editor.phases.length - 1];
            if (!lastPh || lastPh.type !== 'feedback') {
              var fbPh = { id:'ph_ai_fb', type:'feedback', name: i18n('phase.feedback'), color:'f', trials:[{ id:'t_ai_fb', components:[ { id:'c_ai_fbt', type:'text', content:'Experiment complete!\n\nThank you for your participation.', fontSize:24, color:'#333333', position:'center', fontWeight:'bold', posX:Math.round(dev.w/2), posY:Math.round(dev.h*0.4), cat:'s' } ] }] };
              editor.phases.push(fbPh);
              editor.tc++; editor.cc++;
            }
            if (editor.phases.length > 0 && editor.phases[0].trials.length > 0) {
              editor.selectedTrial = editor.phases[0].trials[0].id;
              if (editor.phases[0].trials[0].components.length > 0) editor.selComp = editor.phases[0].trials[0].components[0].id;
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
              return s + p.trials.length;
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
            return p.trials.length === 0;
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
        h += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:28px">';
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
          h += '<div style="font-size:0.68rem;color:var(--text2)">' + d.w + ' × ' + d.h + '</div></div>';
        });
        h += '</div>';
        card.innerHTML = h;
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        card.querySelectorAll('.device-option').forEach(function (opt) {
          opt.onclick = function () {
            var idx = parseInt(opt.getAttribute('data-idx'));
            editor.device = devicePresets[idx];
            localStorage.setItem(_vek('device'), idx);
            document.getElementById('device-select').value = idx;
            overlay.remove();
            if (callback) callback();
          };
        });
      }

      // Restore last session
      (function () {
        try {
          var savedDevice = localStorage.getItem(_vek('device'));
          if (savedDevice !== null) {
            editor.device = devicePresets[parseInt(savedDevice)];
            document.getElementById('device-select').value = savedDevice;
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
      // Hide splash after 1 second - schedule FIRST before any heavy init
      setTimeout(function () {
        var splash = document.getElementById('splash');
        if (splash) {
          splash.classList.add('fade-out');
          setTimeout(function () {
            splash.remove();
          }, 300);
        }
      }, 1000);
      // Auto-load template from URL parameter
      (function () {
        var m = location.search.match(/[?&]template=(\w+)/);
        if (m) {
          setTimeout(function () {
            loadTemplate(m[1]);
          }, 300);
        }
      })();
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
              desc: 'The toolbox on the left provides <strong>components</strong> in two categories:<br><br>📺 <strong>Display</strong> — Text, Shape, Image, Audio, Video, Fixation<br>🎮 <strong>Response</strong> — Keyboard, Button, Slider, Click, Text Input<br><br>Drag into a trial node to add. Click a node to edit its properties.<br>Preset templates at the bottom for a quick start.',
              el: 'panel-left',
              btn: 'Next →',
            },
            {
              title: '🧩 Trial Settings',
              desc: 'Click a <strong>trial</strong> (not a component) to open its settings:<br>loop count · randomization · branch condition · delay · counter.<br>These become jsPsych <strong>node / trial parameters</strong>, not trials.<br><br>Components stack in a responsive flow — click <strong>⛶ Expand</strong> for a full-window layout preview.',
              el: 'inspector',
              btn: 'Next →',
            },
            {
              title: '🎮 Interactive Fullscreen Preview',
              desc: 'Fullscreen preview is NOT a static screenshot —<br>participants can <strong>press keys, click buttons, drag sliders</strong>.<br>Auto-records <strong>reaction times</strong> and accuracy.<br><br>Supports 🔀 branching, 🔄 loop countdown,<br>⏱️ staged delays, 🎲 randomization, 📊 variable tracking.',
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
    
function _switchBranchCondition(trialId, compId, newVal) {
  updateComponent(trialId, compId, 'condition', newVal);
  if (newVal === 'correct') {
    updateComponent(trialId, compId, 'matchValue', '');
  } else if (newVal === 'variable') {
    updateComponent(trialId, compId, 'matchValue', '');
    updateComponent(trialId, compId, 'operator', '>=');
    updateComponent(trialId, compId, 'compareValue', '');
  }
  if (newVal !== 'variable') {
    updateComponent(trialId, compId, 'operator', '>=');
    updateComponent(trialId, compId, 'compareValue', '');
  }
  renderInspector();
}

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