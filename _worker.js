// _workers.js – Cloudflare Worker (ES modules format)
// 
// 部署说明：
// 1. 在 Cloudflare Dashboard 中创建 KV 命名空间（名称随意，例如 SINGBOX_CONFIG）
// 2. 在 Worker 设置中绑定该 KV，变量名设为 SUB_CONFIG
// 3. 若未绑定 KV，将回退到内存存储（重启后丢失，不推荐）

// 内存缓存，用于无 KV 时的临时分享
const memoryStore = new Map();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 处理 CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // 主页：返回前端界面
    if (path === '/' && request.method === 'GET') {
      return new Response(getHTML(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // 获取永久订阅链接（返回最新配置）
    if (path === '/api/latest' && request.method === 'GET') {
      return handleGetLatest(env);
    }

    // 更新永久订阅链接配置
    if (path === '/api/update' && request.method === 'POST') {
      return handleUpdateLatest(request, env);
    }

    // 保留旧的临时分享接口（兼容）
    if (path.startsWith('/api/get/') && request.method === 'GET') {
      const id = path.split('/api/get/')[1];
      return handleGetTempConfig(id);
    }

    return new Response('Not Found', { status: 404 });
  },
};

// 获取永久订阅配置（优先从 KV 读取）
async function handleGetLatest(env) {
  const kv = env.SUB_CONFIG;
  if (kv) {
    const config = await kv.get('latest', 'text');
    if (config) {
      return new Response(config, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        },
      });
    }
    return new Response('尚未生成任何配置', { status: 404 });
  }
  // 回退到内存
  const config = memoryStore.get('latest');
  if (config) {
    return new Response(config, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      },
    });
  }
  return new Response('尚未生成任何配置', { status: 404 });
}

// 更新永久订阅配置（存入 KV 或内存）
async function handleUpdateLatest(request, env) {
  try {
    const body = await request.json();
    const configStr = JSON.stringify(body);
    const kv = env.SUB_CONFIG;
    if (kv) {
      await kv.put('latest', configStr);
    } else {
      memoryStore.set('latest', configStr);
    }
    return new Response(JSON.stringify({ success: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
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

// 旧的临时分享接口
function handleGetTempConfig(id) {
  const config = memoryStore.get(id);
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

// 前端 HTML（包含永久链接显示与持久化缓存）
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
    .cache-status {
      font-size: 0.75rem;
      color: #6e6e73;
      margin-left: 0.5rem;
      white-space: nowrap;
    }

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
    .refresh-btn {
      background: #ff9f0a;
      margin-right: 0.5rem;
    }
    .refresh-btn:hover { background: #e68600; }

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
    .info { color: #5e5ce6; }
    .flex-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      margin-top: 0.8rem;
    }
    .subscription-link-box {
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 0.6rem 1rem;
      border-radius: 8px;
      font-family: monospace;
      word-break: break-all;
      margin: 0.5rem 0;
      font-size: 0.9rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .subscription-link-box span {
      flex: 1;
    }
    .subscription-link-box button {
      background: #34c759;
      font-size: 0.8rem;
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
  <p style="color: #6e6e73;">从多个订阅源提取代理节点，为每个源生成 <code>selector</code> 或 <code>urltest</code> 组，并整合用户自定义的其他配置。</p>

  <div class="card">
    <h2>🔗 永久订阅链接</h2>
    <p style="color: #6e6e73; font-size: 0.85rem;">每次生成配置后，此链接将自动更新。可导入任何 Sing‑Box 客户端，始终保持最新配置。</p>
    <div id="subscription-link-container">
      <div class="subscription-link-box" id="subscription-link-box" style="display:none;">
        <span id="subscription-link-text"></span>
        <button id="copy-permanent-link">📋 复制</button>
      </div>
      <p id="no-link-hint" style="color: #6e6e73;">尚未生成配置，请点击下方按钮。</p>
    </div>
    <p style="font-size: 0.8rem; color: #8e8e93;">
      <strong>注意：</strong>需绑定 Cloudflare KV 以实现永久存储（否则链接可能在 Worker 重启后失效）。<br>
      部署时创建 KV 命名空间并绑定到变量 <code>SUB_CONFIG</code>。
    </p>
  </div>

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
    <button id="generate" class="action-btn">⚡ 生成配置（优先缓存）</button>
    <button id="refresh-generate" class="refresh-btn">🔄 强制刷新并生成</button>
    <button id="download" class="action-btn" style="display:none;">⬇ 下载 JSON</button>
    <button id="copy-result" class="copy-btn" style="display:none;">📋 复制 JSON</button>
  </div>

  <div id="status"></div>

  <div id="result" style="display:none;" class="card">
    <h2>✅ 生成的配置</h2>
    <textarea id="output" class="output-area" readonly></textarea>
  </div>

  <script>
    (function() {
      // ========== IndexedDB 存储 ==========
      const DB_NAME = 'singbox-merger';
      const DB_VERSION = 3;  // 升级版本，增加永久链接存储
      const CONFIG_STORE = 'config';
      const CACHE_STORE = 'proxyCache';
      const META_STORE = 'meta';
      const CONFIG_KEY = 'other_config';
      const PERMALINK_KEY = 'permanent_link';

      let db = null;

      function openDB() {
        return new Promise((resolve, reject) => {
          if (db) return resolve(db);
          const request = indexedDB.open(DB_NAME, DB_VERSION);
          request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(CONFIG_STORE)) {
              database.createObjectStore(CONFIG_STORE, { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains(CACHE_STORE)) {
              database.createObjectStore(CACHE_STORE, { keyPath: 'url' });
            }
            if (!database.objectStoreNames.contains(META_STORE)) {
              database.createObjectStore(META_STORE, { keyPath: 'id' });
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
          const tx = database.transaction(CONFIG_STORE, 'readwrite');
          const store = tx.objectStore(CONFIG_STORE);
          store.put({ id: CONFIG_KEY, value: text });
          return new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
          });
        } catch (e) {
          console.warn('IndexedDB 保存配置失败', e);
          try { localStorage.setItem('singbox_merger_config', text); } catch (_) {}
        }
      }

      async function loadConfigFromDB() {
        try {
          const database = await openDB();
          const tx = database.transaction(CONFIG_STORE, 'readonly');
          const store = tx.objectStore(CONFIG_STORE);
          const request = store.get(CONFIG_KEY);
          return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result ? request.result.value : '');
            request.onerror = () => reject(request.error);
          });
        } catch (e) {
          console.warn('IndexedDB 加载配置失败', e);
          return localStorage.getItem('singbox_merger_config') || '';
        }
      }

      // 代理缓存
      async function saveProxyCache(url, proxies, group) {
        try {
          const database = await openDB();
          const tx = database.transaction(CACHE_STORE, 'readwrite');
          const store = tx.objectStore(CACHE_STORE);
          store.put({ url, proxies, group, timestamp: Date.now() });
          return new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
          });
        } catch (e) {
          console.warn('保存代理缓存失败', e);
        }
      }

      async function getProxyCache(url) {
        try {
          const database = await openDB();
          const tx = database.transaction(CACHE_STORE, 'readonly');
          const store = tx.objectStore(CACHE_STORE);
          const request = store.get(url);
          return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
          });
        } catch (e) {
          console.warn('读取代理缓存失败', e);
          return null;
        }
      }

      // 永久链接存储
      async function savePermanentLink(link) {
        try {
          const database = await openDB();
          const tx = database.transaction(META_STORE, 'readwrite');
          const store = tx.objectStore(META_STORE);
          store.put({ id: PERMALINK_KEY, value: link });
          return new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
          });
        } catch (e) {
          console.warn('保存永久链接失败', e);
        }
      }

      async function loadPermanentLink() {
        try {
          const database = await openDB();
          const tx = database.transaction(META_STORE, 'readonly');
          const store = tx.objectStore(META_STORE);
          const request = store.get(PERMALINK_KEY);
          return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result ? request.result.value : '');
            request.onerror = () => reject(request.error);
          });
        } catch (e) {
          return '';
        }
      }

      // ========== localStorage 存储订阅源列表 ==========
      const STORAGE_KEY_SOURCES = 'singbox_merger_sources';

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
      const refreshGenerateBtn = document.getElementById('refresh-generate');
      const downloadBtn = document.getElementById('download');
      const copyResultBtn = document.getElementById('copy-result');
      const copyLinkBtn = document.getElementById('copy-link');
      const configInput = document.getElementById('config-input');
      const outputArea = document.getElementById('output');
      const resultDiv = document.getElementById('result');
      const statusDiv = document.getElementById('status');
      const importFileBtn = document.getElementById('import-file-btn');
      const subscriptionLinkBox = document.getElementById('subscription-link-box');
      const subscriptionLinkText = document.getElementById('subscription-link-text');
      const copyPermanentLinkBtn = document.getElementById('copy-permanent-link');
      const noLinkHint = document.getElementById('no-link-hint');

      // 永久订阅链接基础
      const permanentLinkBase = location.origin + '/api/latest';

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
          saveConfigToDB(configInput.value);
        }, 300);
      }

      // 更新永久链接显示
      function updateSubscriptionLinkDisplay() {
        subscriptionLinkText.textContent = permanentLinkBase;
        subscriptionLinkBox.style.display = 'flex';
        noLinkHint.style.display = 'none';
      }

      // 缓存状态指示器
      async function updateCacheStatusIndicators() {
        const rows = document.querySelectorAll('.source-row');
        rows.forEach(async (row) => {
          const urlInput = row.querySelector('.url');
          if (!urlInput) return;
          const url = urlInput.value.trim();
          if (!url) return;
          const cache = await getProxyCache(url);
          let statusSpan = row.querySelector('.cache-status');
          if (!statusSpan) {
            statusSpan = document.createElement('span');
            statusSpan.className = 'cache-status';
            row.appendChild(statusSpan);
          }
          if (cache) {
            const date = new Date(cache.timestamp);
            statusSpan.textContent = '缓存: ' + cache.proxies.length + ' 节点 (' + date.toLocaleString() + ')';
          } else {
            statusSpan.textContent = '无缓存';
          }
        });
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
          updateCacheStatusIndicators();
        });

        div.querySelectorAll('input, select').forEach(el => {
          el.addEventListener('input', () => {
            scheduleSave();
            updateCacheStatusIndicators();
          });
          el.addEventListener('change', () => {
            scheduleSave();
            updateCacheStatusIndicators();
          });
        });

        return div;
      }

      function renderSources(sources) {
        sourcesContainer.innerHTML = '';
        sources.forEach(src => {
          sourcesContainer.appendChild(createSourceRow(src.name, src.url, src.type));
        });
        updateCacheStatusIndicators();
      }

      async function initFromCache() {
        const sources = loadSources();
        renderSources(sources);
        const savedConfig = await loadConfigFromDB();
        configInput.value = savedConfig;
        // 加载并显示永久链接
        const savedLink = await loadPermanentLink();
        if (savedLink) {
          subscriptionLinkText.textContent = savedLink;
          subscriptionLinkBox.style.display = 'flex';
          noLinkHint.style.display = 'none';
        }
      }

      addBtn.addEventListener('click', () => {
        const row = createSourceRow();
        sourcesContainer.appendChild(row);
        scheduleSave();
        updateCacheStatusIndicators();
      });

      configInput.addEventListener('input', scheduleSave);

      // 文件导入
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
            scheduleSave();
          };
          reader.readAsText(file);
        };
        input.click();
      });

      // 复制永久链接
      copyPermanentLinkBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(subscriptionLinkText.textContent);
          copyPermanentLinkBtn.textContent = '✅ 已复制';
          setTimeout(() => { copyPermanentLinkBtn.textContent = '📋 复制'; }, 2000);
        } catch (err) {
          copyPermanentLinkBtn.textContent = '❌ 失败';
          setTimeout(() => { copyPermanentLinkBtn.textContent = '📋 复制'; }, 2000);
        }
      });

      // 安全的 JSON 解析
      function parseJSONSafe(text) {
        let fixed = text.replace(/,(\\s*[}\\]])/g, '$1');
        try {
          return JSON.parse(fixed);
        } catch (e) {
          throw new Error('JSON 无效：' + e.message + '\\n请检查标点（如末尾逗号）或使用 JSON 校验工具。');
        }
      }

      // 拉取单个源，支持缓存
      async function fetchSourceProxies(source, forceRefresh = false) {
        const { name, url, type } = source;
        if (!forceRefresh) {
          const cached = await getProxyCache(url);
          if (cached) {
            return { name, url, type, proxies: cached.proxies, group: cached.group, fromCache: true, error: null };
          }
        }

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

          const EXCLUDED_TYPES = ['direct', 'selector', 'urltest', 'dns', 'block'];
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
            throw new Error('该源无有效代理节点');
          }

          const group = {
            type: type,
            tag: name,
            outbounds: tags,
            default: tags[0],
          };

          await saveProxyCache(url, proxies, group);
          return { name, url, type, proxies, group, fromCache: false, error: null };
        } catch (err) {
          const cached = await getProxyCache(url);
          if (cached) {
            return { name, url, type, proxies: cached.proxies, group: cached.group, fromCache: true, error: err.message };
          }
          return { name, url, type, proxies: [], group: null, fromCache: false, error: err.message };
        }
      }

      async function performGenerate(forceRefresh) {
        statusDiv.textContent = '';
        resultDiv.style.display = 'none';
        downloadBtn.style.display = 'none';
        copyResultBtn.style.display = 'none';

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
            configObj = parseJSONSafe(configText);
          } catch (e) {
            statusDiv.innerHTML = '<span class="error">其他配置 ' + e.message + '</span>';
            return;
          }
        }

        saveSources(sources);
        saveConfigToDB(configText);

        statusDiv.textContent = '正在处理订阅源...';
        const fetchTasks = sources.map(src => fetchSourceProxies(src, forceRefresh));
        const results = await Promise.all(fetchTasks);

        const allProxies = [];
        const allGroups = [];
        const errors = [];
        const cacheWarnings = [];

        results.forEach(res => {
          if (res.error) {
            if (res.fromCache) {
              cacheWarnings.push('[' + res.name + '] 拉取失败，使用缓存 (' + res.proxies.length + ' 节点)');
              allProxies.push(...res.proxies);
              if (res.group) allGroups.push(res.group);
            } else {
              errors.push('[' + res.name + '] ' + res.error);
            }
          } else {
            if (res.fromCache) {
              cacheWarnings.push('[' + res.name + '] 使用缓存 (' + res.proxies.length + ' 节点)');
            }
            allProxies.push(...res.proxies);
            if (res.group) allGroups.push(res.group);
          }
        });

        let statusHTML = '';
        if (errors.length > 0) {
          statusHTML += '<span class="error">⚠ 部分源无缓存且拉取失败：' + errors.join('; ') + '</span><br>';
        }
        if (cacheWarnings.length > 0) {
          statusHTML += '<span class="info">ℹ️ ' + cacheWarnings.join('; ') + '</span>';
        }
        if (errors.length === 0 && cacheWarnings.length === 0) {
          statusHTML = '<span class="success">✅ 生成成功！</span>';
        } else if (errors.length === 0) {
          statusHTML += '<span class="success">✅ 生成成功（使用了缓存）</span>';
        }
        statusDiv.innerHTML = statusHTML;

        const userOutbounds = Array.isArray(configObj.outbounds) ? configObj.outbounds : [];
        const finalOutbounds = [...userOutbounds, ...allProxies, ...allGroups];
        const { outbounds: _, ...restConfig } = configObj;
        const finalConfig = { ...restConfig, outbounds: finalOutbounds };

        // 显示结果
        const jsonStr = JSON.stringify(finalConfig, null, 2);
        outputArea.value = jsonStr;
        resultDiv.style.display = 'block';
        downloadBtn.style.display = 'inline-block';
        copyResultBtn.style.display = 'inline-block';

        // 更新永久订阅链接到 KV/内存
        try {
          const resp = await fetch('/api/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: jsonStr,
          });
          if (resp.ok) {
            // 更新本地存储的永久链接
            await savePermanentLink(permanentLinkBase);
            updateSubscriptionLinkDisplay();
          }
        } catch (e) {
          console.warn('更新永久链接失败', e);
        }

        // 下载
        downloadBtn.onclick = () => {
          const blob = new Blob([jsonStr], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'sing-box-config.json';
          a.click();
        };

        // 复制 JSON
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

        updateCacheStatusIndicators();
      }

      generateBtn.addEventListener('click', () => performGenerate(false));
      refreshGenerateBtn.addEventListener('click', () => performGenerate(true));

      // 初始化
      initFromCache();
    })();
  </script>
</body>
</html>`;
}
