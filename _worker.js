// _workers.js – Cloudflare Worker (ES modules format)

// 内存缓存，用于临时分享订阅链接
const configCache = new Map();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (path === '/' && request.method === 'GET') {
      return new Response(getHTML(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    if (path === '/api/generate' && request.method === 'POST') {
      return handleGenerate(request);
    }

    if (path.startsWith('/api/get/') && request.method === 'GET') {
      const id = path.split('/api/get/')[1];
      return handleGetConfig(id);
    }

    return new Response('Not Found', { status: 404 });
  },
};

// 处理临时配置获取
function handleGetConfig(id) {
  const config = configCache.get(id);
  if (!config) {
    return new Response('Config not found or expired', { status: 404 });
  }
  return new Response(config, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// 前端 HTML（IndexedDB 存储 + 文件导入）
function getHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sing‑Box 订阅合并器</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      max-width: 1000px;
      margin: 2rem auto;
      padding: 1rem;
      background: #f2f2f7;
      color: #1c1c1e;
      line-height: 1.5;
    }
    h1 { margin-top: 0; font-weight: 600; font-size: 1.8rem; color: #000; }
    h2 { font-weight: 500; font-size: 1.2rem; margin: 1.5rem 0 0.5rem; color: #3a3a3c; }
    p { margin: 0.5rem 0; font-size: 0.95rem; }
    .card {
      background: #ffffff;
      border-radius: 12px;
      padding: 1.2rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
      border: 1px solid #e5e5ea;
      width: 100%;
    }
    .source-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem;
      margin-bottom: 0.6rem;
      align-items: center;
    }
    .source-row input,
    .source-row select {
      padding: 0.5rem 0.7rem;
      border: 1px solid #d1d1d6;
      border-radius: 8px;
      font-size: 0.9rem;
      background: #fff;
      transition: border-color 0.2s;
      min-width: 0;
    }
    .source-row input:focus,
    .source-row select:focus {
      outline: none;
      border-color: #007aff;
      box-shadow: 0 0 0 3px rgba(0,122,255,0.15);
    }
    .name { flex: 1 1 100px; }
    .url { flex: 3 1 200px; }
    .type { flex: 0 1 110px; }
    .remove-btn-wrapper { flex: 0 0 auto; }

    button {
      padding: 0.5rem 1rem;
      cursor: pointer;
      border: none;
      border-radius: 8px;
      font-weight: 500;
      font-size: 0.9rem;
      transition: background 0.2s, opacity 0.2s;
      color: #fff;
      white-space: nowrap;
    }
    .remove-btn {
      background: #ff3b30;
      padding: 0.5rem;
      width: 34px;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
    }
    .remove-btn:hover { background: #e0352b; }
    .add-btn {
      background: #007aff;
      margin-top: 0.5rem;
    }
    .add-btn:hover { background: #0066d6; }
    .action-btn {
      background: #34c759;
      margin-right: 0.5rem;
    }
    .action-btn:hover { background: #2db14e; }
    .action-btn:disabled {
      background: #aeaeb2;
      cursor: not-allowed;
    }
    .copy-btn {
      background: #5e5ce6;
    }
    .copy-btn:hover { background: #4b49cc; }
    .link-btn {
      background: #ff9500;
    }
    .link-btn:hover { background: #e68600; }
    .import-btn {
      background: #5856d6;
      margin-left: 0.5rem;
    }
    .import-btn:hover { background: #4b49cc; }

    .code-editor {
      width: 100%;
      max-width: 100%;
      min-height: 150px;
      font-family: 'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace;
      font-size: 0.85rem;
      line-height: 1.6;
      padding: 1rem;
      border: 1px solid #48484a;
      border-radius: 8px;
      background: #1e1e1e;
      color: #d4d4d4;
      resize: vertical;
      tab-size: 2;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
      box-sizing: border-box;
    }
    .code-editor:focus {
      border-color: #007aff;
      box-shadow: 0 0 0 3px rgba(0,122,255,0.3);
    }
    .output-area {
      width: 100%;
      height: 400px;
      font-family: 'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace;
      font-size: 0.85rem;
      padding: 1rem;
      border: 1px solid #48484a;
      border-radius: 8px;
      background: #1e1e1e;
      color: #d4d4d4;
      resize: vertical;
      white-space: pre;
      overflow: auto;
      box-sizing: border-box;
    }
    #status {
      margin: 0.8rem 0;
      min-height: 1.5rem;
      font-size: 0.9rem;
    }
    .error { color: #ff3b30; }
    .warning { color: #ff9f0a; }
    .success { color: #34c759; }
    .flex-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      margin-top: 0.8rem;
    }
    @media (max-width: 600px) {
      body { padding: 0.8rem; margin: 1rem auto; }
      .source-row { gap: 0.4rem; }
      .name { flex: 1 1 80px; }
      .url { flex: 3 1 150px; }
      .type { flex: 0 1 100px; }
    }
  </style>
</head>
<body>
  <h1>🔀 Sing‑Box 多源代理组生成器</h1>
  <p style="color: #6e6e73;">从多个订阅源提取代理节点，为每个源生成 <code>selector</code> 或 <code>urltest</code> 组，并整合用户自定义的其他配置（可包含已有 outbounds）。</p>

  <div class="card">
    <h2>📥 订阅源设置</h2>
    <div id="sources-container"></div>
    <button id="add-source" class="add-btn">＋ 添加订阅源</button>
  </div>

  <div class="card">
    <h2>📦 其他配置 (不含或含 outbounds，都会保留)</h2>
    <p style="color: #6e6e73; font-size: 0.85rem;">
      在此输入 Sing‑Box 配置的其余部分（JSON 对象），可包含 <code>outbounds</code> 字段，拉取的节点将追加到其后。<br>
      <strong>超大配置建议：</strong>点击 <button class="import-btn" id="import-file-btn" style="font-size:0.8rem; padding:0.2rem 0.6rem;">📂 从文件导入</button> 加载本地 JSON 文件。
    </p>
    <textarea id="config-input" class="code-editor" placeholder='{
  "log": { "level": "info" },
  "inbounds": [...],
  "dns": {...},
  "route": {...}
}'></textarea>
  </div>

  <div class="flex-row">
    <button id="generate" class="action-btn">⚡ 生成完整配置</button>
    <button id="download" class="action-btn" style="display:none;">⬇ 下载 JSON</button>
    <button id="copy-result" class="copy-btn" style="display:none;">📋 复制 JSON</button>
    <button id="copy-link" class="link-btn" style="display:none;">🔗 复制订阅源链接</button>
  </div>

  <div id="status"></div>

  <div id="result" style="display:none;" class="card">
    <h2>✅ 生成的配置</h2>
    <textarea id="output" class="output-area" readonly></textarea>
  </div>

  <script>
    (function() {
      // ========== IndexedDB 存储大文本 ==========
      const DB_NAME = 'singbox-merger';
      const DB_VERSION = 1;
      const STORE_NAME = 'config';
      const CONFIG_KEY = 'other_config';

      let db = null;

      function openDB() {
        return new Promise((resolve, reject) => {
          if (db) return resolve(db);
          const request = indexedDB.open(DB_NAME, DB_VERSION);
          request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
              database.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
          };
          request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
          };
          request.onerror = (event) => {
            reject(event.target.error);
          };
        });
      }

      async function saveConfigToDB(text) {
        try {
          const database = await openDB();
          const tx = database.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          store.put({ id: CONFIG_KEY, value: text });
          return new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
          });
        } catch (e) {
          console.warn('IndexedDB 保存失败，回退到 localStorage', e);
          try { localStorage.setItem(STORAGE_KEY_CONFIG, text); } catch (_) {}
        }
      }

      async function loadConfigFromDB() {
        try {
          const database = await openDB();
          const tx = database.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const request = store.get(CONFIG_KEY);
          return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result ? request.result.value : '');
            request.onerror = () => reject(request.error);
          });
        } catch (e) {
          console.warn('IndexedDB 加载失败，尝试 localStorage', e);
          return localStorage.getItem(STORAGE_KEY_CONFIG) || '';
        }
      }

      // ========== localStorage 存储订阅源列表 ==========
      const STORAGE_KEY_SOURCES = 'singbox_merger_sources';
      const STORAGE_KEY_CONFIG = 'singbox_merger_config'; // 仅作后备

      function loadSources() {
        try {
          const saved = localStorage.getItem(STORAGE_KEY_SOURCES);
          if (saved) {
            const arr = JSON.parse(saved);
            if (Array.isArray(arr) && arr.length > 0) return arr;
          }
        } catch (e) {}
        return [{ name: 'HK', url: 'https://example.com/sub.json', type: 'selector' }];
      }

      function saveSources(sourcesArray) {
        localStorage.setItem(STORAGE_KEY_SOURCES, JSON.stringify(sourcesArray));
      }

      // UI 元素
      const sourcesContainer = document.getElementById('sources-container');
      const addBtn = document.getElementById('add-source');
      const generateBtn = document.getElementById('generate');
      const downloadBtn = document.getElementById('download');
      const copyResultBtn = document.getElementById('copy-result');
      const copyLinkBtn = document.getElementById('copy-link');
      const configInput = document.getElementById('config-input');
      const outputArea = document.getElementById('output');
      const resultDiv = document.getElementById('result');
      const statusDiv = document.getElementById('status');
      const importFileBtn = document.getElementById('import-file-btn');

      let currentGeneratedId = null;

      function collectSources() {
        const rows = document.querySelectorAll('.source-row');
        const sources = [];
        rows.forEach(row => {
          const name = row.querySelector('.name').value.trim();
          const url = row.querySelector('.url').value.trim();
          const type = row.querySelector('.type').value;
          if (name || url) {
            sources.push({ name, url, type });
          }
        });
        return sources;
      }

      let saveTimeout;
      function scheduleSave() {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          saveSources(collectSources());
          saveConfigToDB(configInput.value);  // 使用 IndexedDB
        }, 300);
      }

      function createSourceRow(name = '', url = '', type = 'selector') {
        const div = document.createElement('div');
        div.className = 'source-row';
        div.innerHTML = \`
          <input class="name" placeholder="组名" value="\${name}">
          <input class="url" placeholder="订阅源 URL" value="\${url}">
          <select class="type">
            <option value="selector" \${type === 'selector' ? 'selected' : ''}>selector</option>
            <option value="urltest" \${type === 'urltest' ? 'selected' : ''}>urltest</option>
          </select>
          <span class="remove-btn-wrapper"><button class="remove-btn">✕</button></span>
        \`;

        div.querySelector('.remove-btn').addEventListener('click', () => {
          div.remove();
          scheduleSave();
        });

        div.querySelectorAll('input, select').forEach(el => {
          el.addEventListener('input', scheduleSave);
          el.addEventListener('change', scheduleSave);
        });

        return div;
      }

      function renderSources(sources) {
        sourcesContainer.innerHTML = '';
        sources.forEach(src => {
          sourcesContainer.appendChild(createSourceRow(src.name, src.url, src.type));
        });
      }

      async function initFromCache() {
        const sources = loadSources();
        renderSources(sources);
        const savedConfig = await loadConfigFromDB();
        configInput.value = savedConfig;
      }

      addBtn.addEventListener('click', () => {
        const row = createSourceRow();
        sourcesContainer.appendChild(row);
        scheduleSave();
      });

      configInput.addEventListener('input', scheduleSave);

      // 文件导入功能
      importFileBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.txt';
        input.onchange = (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            configInput.value = ev.target.result;
            scheduleSave();  // 触发保存
          };
          reader.readAsText(file);
        };
        input.click();
      });

      // 生成按钮逻辑
      generateBtn.addEventListener('click', async () => {
        statusDiv.textContent = '';
        resultDiv.style.display = 'none';
        downloadBtn.style.display = 'none';
        copyResultBtn.style.display = 'none';
        copyLinkBtn.style.display = 'none';

        const rows = document.querySelectorAll('.source-row');
        const sources = [];
        for (const row of rows) {
          const name = row.querySelector('.name').value.trim();
          const url = row.querySelector('.url').value.trim();
          const type = row.querySelector('.type').value;
          if (!name || !url) {
            statusDiv.innerHTML = '<span class="error">请填写所有组名和 URL</span>';
            return;
          }
          sources.push({ name, url, type });
        }

        let configObj = {};
        const configText = configInput.value.trim();
        if (configText) {
          try {
            configObj = JSON.parse(configText);
          } catch (e) {
            statusDiv.innerHTML = '<span class="error">其他配置 JSON 格式错误：' + e.message + '</span>';
            return;
          }
        }

        saveSources(sources);
        saveConfigToDB(configText);

        statusDiv.textContent = '正在请求订阅源...';
        try {
          const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sources, config: configObj }),
          });
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || 'HTTP ' + response.status);
          }
          const warnings = response.headers.get('X-Errors');
          if (warnings && warnings !== 'none') {
            statusDiv.innerHTML = '<span class="warning">⚠ 部分源出错：' + warnings + '</span>';
          } else {
            statusDiv.innerHTML = '<span class="success">✅ 生成成功！</span>';
          }

          const jsonStr = JSON.stringify(result.config, null, 2);
          outputArea.value = jsonStr;
          resultDiv.style.display = 'block';
          downloadBtn.style.display = 'inline-block';
          copyResultBtn.style.display = 'inline-block';

          if (result.id) {
            currentGeneratedId = result.id;
            copyLinkBtn.style.display = 'inline-block';
          } else {
            copyLinkBtn.style.display = 'none';
          }

          downloadBtn.onclick = () => {
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'sing-box-config.json';
            a.click();
          };

          copyResultBtn.onclick = async () => {
            try {
              await navigator.clipboard.writeText(jsonStr);
              copyResultBtn.textContent = '✅ 已复制';
              setTimeout(() => { copyResultBtn.textContent = '📋 复制 JSON'; }, 2000);
            } catch (err) {
              copyResultBtn.textContent = '❌ 复制失败';
              setTimeout(() => { copyResultBtn.textContent = '📋 复制 JSON'; }, 2000);
            }
          };

          copyLinkBtn.onclick = async () => {
            if (!currentGeneratedId) return;
            const link = location.origin + '/api/get/' + currentGeneratedId;
            try {
              await navigator.clipboard.writeText(link);
              copyLinkBtn.textContent = '✅ 链接已复制';
              setTimeout(() => { copyLinkBtn.textContent = '🔗 复制订阅源链接'; }, 2000);
            } catch (err) {
              copyLinkBtn.textContent = '❌ 复制失败';
              setTimeout(() => { copyLinkBtn.textContent = '🔗 复制订阅源链接'; }, 2000);
            }
          };
        } catch (err) {
          statusDiv.innerHTML = '<span class="error">生成失败：' + err.message + '</span>';
        }
      });

      initFromCache();
    })();
  </script>
</body>
</html>`;
}

// 需要排除的出站类型
const EXCLUDED_TYPES = ['direct', 'selector', 'urltest', 'dns', 'block'];

async function handleGenerate(request) {
  try {
    const body = await request.json();
    const { sources, config = {} } = body;

    if (!Array.isArray(sources) || sources.length === 0) {
      throw new Error('至少需要提供一个订阅源');
    }

    const fetchTasks = sources.map(async (source) => {
      const { name, url, type = 'selector' } = source;
      if (!name || !url) throw new Error('每个源必须提供 name 和 url');

      try {
        const resp = await fetch(url, {
          headers: { 'User-Agent': 'Cloudflare-Worker-SubMerger/1.0' },
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const text = await resp.text();

        let outbounds = [];
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
          outbounds = data;
        } else if (data && Array.isArray(data.outbounds)) {
          outbounds = data.outbounds;
        } else {
          throw new Error('无法识别的格式（需为数组或包含 outbounds 的对象）');
        }

        const filtered = outbounds.filter(ob => {
          if (!ob || typeof ob !== 'object') return false;
          return !EXCLUDED_TYPES.includes(ob.type);
        });

        const proxies = filtered.map(ob => ({
          ...ob,
          tag: ob.tag || 'unnamed',
        }));

        const tags = proxies.map(p => p.tag);
        if (tags.length === 0) {
          return { name, proxies: [], group: null, error: '该源无有效代理节点' };
        }

        const group = {
          type: type,
          tag: name,
          outbounds: tags,
          default: tags[0],
        };

        return { name, proxies, group, error: null };
      } catch (err) {
        return { name, proxies: [], group: null, error: err.message };
      }
    });

    const results = await Promise.all(fetchTasks);

    const allProxies = [];
    const allGroups = [];
    const errors = [];

results.forEach(res => {
      if (res.error) {
        errors.push('[' + res.name + '] ' + res.error);
      } else {
        if (res.proxies.length) allProxies.push(...res.proxies);
        if (res.group) allGroups.push(res.group);
      }
    });

    const userOutbounds = Array.isArray(config.outbounds) ? config.outbounds : [];
    const finalOutbounds = [...userOutbounds, ...allProxies, ...allGroups];
    const { outbounds: _, ...restConfig } = config;
    const finalConfig = { ...restConfig, outbounds: finalOutbounds };

    const id = crypto.randomUUID();
    configCache.set(id, JSON.stringify(finalConfig));

    return new Response(JSON.stringify({ id, config: finalConfig }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Errors': errors.join('; ') || 'none',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
  }
