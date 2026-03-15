/**
 * StormEditor — Полноценный редактор сайтов
 * Поддерживает HTML, CSS, JS с Monaco Editor, AI-помощником и живым превью
 */

const SEEditor = (() => {
    // ─── Состояние ───────────────────────────────────────────────────────────
    let monacoEditor = null;
    let currentFile = 'index.html';
    let wordWrap = false;
    let aiPanelOpen = false;
    let autoSaveTimer = null;
    let resizing = false;

    const files = {
        'index.html': { lang: 'html', content: getDefaultHTML() },
        'style.css':  { lang: 'css',  content: getDefaultCSS() },
        'script.js':  { lang: 'javascript', content: getDefaultJS() }
    };

    const aiMessages = [];

    // ─── Инициализация ───────────────────────────────────────────────────────
    function init() {
        if (typeof require === 'undefined') {
            console.warn('Monaco loader not found, retrying...');
            setTimeout(init, 500);
            return;
        }

        require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });
        require(['vs/editor/editor.main'], () => {
            monacoEditor = monaco.editor.create(document.getElementById('se-monaco-container'), {
                value: files['index.html'].content,
                language: 'html',
                theme: 'vs-dark',
                fontSize: 14,
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                fontLigatures: true,
                minimap: { enabled: true },
                scrollBeyondLastLine: false,
                wordWrap: 'off',
                automaticLayout: true,
                tabSize: 2,
                formatOnPaste: true,
                suggestOnTriggerCharacters: true,
                lineNumbers: 'on',
                glyphMargin: true,
                folding: true,
                renderLineHighlight: 'all',
                cursorBlinking: 'expand',
                smoothScrolling: true,
                padding: { top: 12, bottom: 12 },
            });

            // Cursor position tracking
            monacoEditor.onDidChangeCursorPosition(e => {
                const { lineNumber, column } = e.position;
                document.getElementById('se-cursor-pos').textContent = `Стр: ${lineNumber}, Кол: ${column}`;
            });

            // Content change → auto preview + auto save
            monacoEditor.onDidChangeModelContent(() => {
                files[currentFile].content = monacoEditor.getValue();
                updateCharCount();
                scheduleAutoSave();
                debouncePreview();
            });

            updateCharCount();
            refreshPreview();
        });

        // AI Enter key handler
        const aiInput = document.getElementById('se-ai-input');
        if (aiInput) {
            aiInput.addEventListener('keydown', e => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendAIMessage();
            });
        }

        // Resize handle events
        document.addEventListener('mousemove', onResize);
        document.addEventListener('mouseup', stopResize);
    }

    // ─── Файлы ───────────────────────────────────────────────────────────────
    function switchFile(filename) {
        if (!files[filename]) return;
        // Save current
        if (monacoEditor) files[currentFile].content = monacoEditor.getValue();

        currentFile = filename;
        const fileData = files[filename];

        if (monacoEditor) {
            const model = monaco.editor.createModel(fileData.content, fileData.lang);
            monacoEditor.setModel(model);
        }

        // Update tabs
        document.querySelectorAll('.se-tab').forEach(tab => {
            tab.classList.toggle('active-tab', tab.dataset.file === filename);
        });

        // Update status bar
        document.getElementById('se-file-lang').textContent = fileData.lang.toUpperCase();
        updateCharCount();
    }

    function addFile() {
        const name = prompt('Название файла (напр: about.html, utils.js, theme.css):');
        if (!name || !name.trim()) return;
        const trimmed = name.trim();
        if (files[trimmed]) { alert('Файл уже существует!'); return; }

        const ext = trimmed.split('.').pop().toLowerCase();
        const lang = ext === 'html' ? 'html' : ext === 'css' ? 'css' : ext === 'js' ? 'javascript' : 'plaintext';
        files[trimmed] = { lang, content: '' };

        const tabs = document.getElementById('se-file-tabs');
        const addBtn = tabs.querySelector('button:last-child');
        const tab = document.createElement('button');
        tab.className = 'se-tab';
        tab.dataset.file = trimmed;

        const icon = lang === 'html' ? `<i class="fab fa-html5" style="color:#e34c26;"></i>` :
                     lang === 'css'  ? `<i class="fab fa-css3-alt" style="color:#264de4;"></i>` :
                     lang === 'javascript' ? `<i class="fab fa-js-square" style="color:#f7df1e;"></i>` :
                     `<i class="fas fa-file-code" style="color:#aaa;"></i>`;

        tab.innerHTML = `${icon} ${trimmed} <span onclick="SEEditor.closeFile('${trimmed}', event)" style="margin-left:0.4rem; opacity:0.5; font-size:0.7rem;">✕</span>`;
        tab.onclick = () => switchFile(trimmed);
        tabs.insertBefore(tab, addBtn);
        switchFile(trimmed);
    }

    function closeFile(filename, event) {
        event.stopPropagation();
        if (['index.html','style.css','script.js'].includes(filename)) {
            alert('Нельзя удалить основные файлы!'); return;
        }
        if (!confirm(`Удалить файл ${filename}?`)) return;
        delete files[filename];
        const tab = document.querySelector(`.se-tab[data-file="${filename}"]`);
        if (tab) tab.remove();
        if (currentFile === filename) switchFile('index.html');
    }

    // ─── Превью ──────────────────────────────────────────────────────────────
    let previewTimer = null;
    function debouncePreview() {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(refreshPreview, 600);
    }

    function refreshPreview() {
        const frame = document.getElementById('se-preview-frame');
        if (!frame) return;
        frame.srcdoc = buildPreviewHTML();
    }

    function buildPreviewHTML() {
        let html = files['index.html'].content;
        const css = files['style.css'].content;
        const js = files['script.js'].content;

        // Inject CSS inline
        if (css && !html.includes('<link')) {
            html = html.replace('</head>', `<style>\n${css}\n</style>\n</head>`);
        }
        // Inject JS inline
        if (js) {
            html = html.replace('</body>', `<script>\n${js}\n</script>\n</body>`);
        }
        return html;
    }

    function setPreviewMode(mode) {
        const wrapper = document.getElementById('se-preview-wrapper');
        const frame = document.getElementById('se-preview-frame');
        document.querySelectorAll('.se-device-btn').forEach(b => b.classList.remove('active-device'));
        document.querySelectorAll(`.se-device-btn[data-mode="${mode}"]`).forEach(b => b.classList.add('active-device'));

        const sizes = { desktop: '100%', tablet: '768px', mobile: '375px' };
        frame.style.width = sizes[mode] || '100%';
        frame.style.maxWidth = sizes[mode] || '100%';
        wrapper.style.justifyContent = mode === 'desktop' ? 'center' : 'center';
    }

    function toggleFullPreview() {
        const panel = document.getElementById('se-full-preview');
        const isVisible = panel.style.display !== 'none';
        if (isVisible) {
            panel.style.display = 'none';
        } else {
            panel.style.display = 'flex';
            document.getElementById('se-full-preview-frame').srcdoc = buildPreviewHTML();
        }
    }

    function setFullPreviewMode(mode) {
        const frame = document.getElementById('se-full-preview-frame');
        const sizes = { desktop: '100%', tablet: '768px', mobile: '375px' };
        frame.style.width = sizes[mode];
        frame.style.maxWidth = sizes[mode];
    }

    function openInNewTab() {
        const blob = new Blob([buildPreviewHTML()], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    // ─── Форматирование ──────────────────────────────────────────────────────
    function formatCode() {
        if (!monacoEditor) return;
        monacoEditor.getAction('editor.action.formatDocument').run().then(() => {
            showSEToast('✅ Код отформатирован', 'success');
        });
    }

    function toggleWrap() {
        wordWrap = !wordWrap;
        if (monacoEditor) {
            monacoEditor.updateOptions({ wordWrap: wordWrap ? 'on' : 'off' });
        }
        const btn = document.getElementById('se-wrap-btn');
        if (btn) btn.style.color = wordWrap ? '#c084fc' : '';
    }

    // ─── Resize ──────────────────────────────────────────────────────────────
    function startResize(e) {
        resizing = true;
        e.preventDefault();
    }

    function onResize(e) {
        if (!resizing) return;
        const container = document.getElementById('se-editor-panel').parentElement;
        const rect = container.getBoundingClientRect();
        const pct = ((e.clientX - rect.left) / rect.width) * 100;
        const clamped = Math.min(Math.max(pct, 20), 80);
        document.getElementById('se-editor-panel').style.width = clamped + '%';
    }

    function stopResize() { resizing = false; }

    // ─── Автосохранение ──────────────────────────────────────────────────────
    function scheduleAutoSave() {
        clearTimeout(autoSaveTimer);
        const status = document.getElementById('se-auto-save-status');
        if (status) status.style.color = '#f59e0b';
        autoSaveTimer = setTimeout(() => {
            saveToLocalStorage();
            if (status) status.style.color = '#4ade80';
        }, 2000);
    }

    function saveToLocalStorage() {
        try {
            localStorage.setItem('se_files', JSON.stringify(files));
        } catch(e) {}
    }

    function loadFromLocalStorage() {
        try {
            const saved = localStorage.getItem('se_files');
            if (saved) {
                const parsed = JSON.parse(saved);
                Object.assign(files, parsed);
                return true;
            }
        } catch(e) {}
        return false;
    }

    // ─── Скачать проект ──────────────────────────────────────────────────────
    function downloadProject() {
        // Build a simple ZIP-like structure using a single HTML bundle
        const html = buildPreviewHTML();
        const blob = new Blob([html], { type: 'text/html' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'stormcreate-project.html';
        a.click();
        URL.revokeObjectURL(a.href);
        showSEToast('📦 Проект скачан!', 'success');
    }

    // ─── Шаблоны ─────────────────────────────────────────────────────────────
    function loadTemplate(tpl) {
        if (!tpl) return;
        if (!confirm('Загрузить шаблон? Текущий код будет заменён.')) {
            document.getElementById('se-template-select').value = '';
            return;
        }

        const templates = {
            empty: {
                html: `<!DOCTYPE html>\n<html lang="ru">\n<head>\n  <meta charset="UTF-8">\n  <title>Мой сайт</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>Привет, мир!</h1>\n  <script src="script.js"><\/script>\n</body>\n</html>`,
                css: `* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { font-family: sans-serif; }`,
                js: `console.log('Привет!');`
            },
            landing: getLandingTemplate(),
            portfolio: getPortfolioTemplate(),
            blog: getBlogTemplate(),
            dashboard: getDashboardTemplate()
        };

        const t = templates[tpl];
        if (!t) return;

        files['index.html'].content = t.html;
        files['style.css'].content = t.css;
        files['script.js'].content = t.js;

        if (monacoEditor && currentFile === 'index.html') {
            monacoEditor.setValue(t.html);
        }
        switchFile('index.html');
        refreshPreview();
        document.getElementById('se-template-select').value = '';
        showSEToast(`🚀 Шаблон "${tpl}" загружен!`, 'success');
    }

    // ─── Счётчик символов ────────────────────────────────────────────────────
    function updateCharCount() {
        const len = monacoEditor ? monacoEditor.getValue().length : 0;
        const el = document.getElementById('se-char-count');
        if (el) el.textContent = `${len.toLocaleString()} символов`;
    }

    // ─── AI Панель ───────────────────────────────────────────────────────────
    function toggleAI() {
        aiPanelOpen = !aiPanelOpen;
        const panel = document.getElementById('se-ai-panel');
        panel.style.width = aiPanelOpen ? '320px' : '0';
    }

    async function sendAIMessage() {
        const input = document.getElementById('se-ai-input');
        const text = input.value.trim();
        if (!text) return;
        input.value = '';

        appendAIMessage('user', text);

        const context = `Текущий код файла ${currentFile}:\n\`\`\`\n${files[currentFile].content}\n\`\`\`\n\nЗапрос: ${text}`;
        appendAIMessage('assistant', '⏳ Генерирую...');

        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 2000,
                    system: `Ты — опытный веб-разработчик. Помогаешь редактировать HTML, CSS, JS код.
Когда нужно изменить код, возвращай ТОЛЬКО изменённый код в блоке \`\`\`language\n...\n\`\`\`.
Если только объясняешь — пиши обычный текст. Отвечай на русском языке. Код делай красивым и современным.`,
                    messages: [{ role: 'user', content: context }]
                })
            });

            const data = await response.json();
            const reply = data.content?.[0]?.text || 'Ошибка ответа';
            removeLastAIMessage();
            appendAIMessage('assistant', reply);

            // Extract code block and apply
            const codeMatch = reply.match(/```(?:html|css|javascript|js)?\n([\s\S]*?)```/);
            if (codeMatch) {
                const newCode = codeMatch[1];
                files[currentFile].content = newCode;
                if (monacoEditor) monacoEditor.setValue(newCode);
                refreshPreview();
                showSEToast('✅ AI применил изменения!', 'success');
            }
        } catch (err) {
            removeLastAIMessage();
            appendAIMessage('assistant', `❌ Ошибка: ${err.message}`);
        }
    }

    function quickPrompt(text) {
        document.getElementById('se-ai-input').value = text;
        sendAIMessage();
    }

    function appendAIMessage(role, text) {
        const container = document.getElementById('se-ai-messages');
        const msg = document.createElement('div');
        msg.className = `se-ai-msg se-ai-${role}`;
        msg.innerHTML = text.replace(/`([^`]+)`/g, '<code style="background:#2d2d4e;padding:0.1rem 0.3rem;border-radius:3px;font-size:0.8rem;">$1</code>');
        container.appendChild(msg);
        container.scrollTop = container.scrollHeight;
    }

    function removeLastAIMessage() {
        const container = document.getElementById('se-ai-messages');
        if (container.lastChild) container.removeChild(container.lastChild);
    }

    // ─── Toast ───────────────────────────────────────────────────────────────
    function showSEToast(message, type = 'info') {
        const el = document.createElement('div');
        el.style.cssText = `
            position: fixed; bottom: 1.5rem; right: 1.5rem; z-index: 99999;
            background: ${type === 'success' ? '#16a34a' : type === 'error' ? '#dc2626' : '#4f46e5'};
            color: white; padding: 0.75rem 1.25rem; border-radius: 10px; font-size: 0.875rem;
            font-weight: 600; box-shadow: 0 4px 20px rgba(0,0,0,0.3); animation: fadeInUp 0.3s ease;
        `;
        el.textContent = message;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3000);
    }

    // ─── Шаблоны контента ────────────────────────────────────────────────────
    function getDefaultHTML() {
        return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Мой сайт</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <nav>
      <div class="logo">⚡ MyBrand</div>
      <ul>
        <li><a href="#about">О нас</a></li>
        <li><a href="#services">Услуги</a></li>
        <li><a href="#contact">Контакт</a></li>
      </ul>
    </nav>
  </header>

  <main>
    <section class="hero">
      <h1>Добро пожаловать!</h1>
      <p>Создайте что-то удивительное с StormEditor</p>
      <button class="btn-primary">Начать</button>
    </section>

    <section id="about" class="about">
      <h2>О нас</h2>
      <p>Мы создаём современные веб-сайты</p>
    </section>
  </main>

  <footer>
    <p>© 2025 MyBrand. Все права защищены.</p>
  </footer>

  <script src="script.js"><\/script>
</body>
</html>`;
    }

    function getDefaultCSS() {
        return `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --primary: #6366f1;
  --dark: #0f172a;
  --light: #f8fafc;
}

body {
  font-family: 'Segoe UI', sans-serif;
  background: var(--light);
  color: var(--dark);
}

/* Навигация */
header {
  background: white;
  box-shadow: 0 1px 12px rgba(0,0,0,.08);
  position: sticky;
  top: 0;
  z-index: 100;
}

nav {
  max-width: 1100px;
  margin: 0 auto;
  padding: 1rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logo {
  font-weight: 800;
  font-size: 1.3rem;
  color: var(--primary);
}

nav ul {
  display: flex;
  gap: 2rem;
  list-style: none;
}

nav a {
  text-decoration: none;
  color: #334155;
  font-weight: 500;
  transition: color .2s;
}

nav a:hover { color: var(--primary); }

/* Герой */
.hero {
  min-height: 80vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: linear-gradient(135deg, #e0e7ff 0%, #f0f9ff 100%);
  padding: 4rem 1.5rem;
}

.hero h1 {
  font-size: clamp(2rem, 6vw, 4rem);
  font-weight: 900;
  color: var(--dark);
  margin-bottom: 1rem;
}

.hero p {
  font-size: 1.25rem;
  color: #64748b;
  margin-bottom: 2rem;
}

.btn-primary {
  padding: .9rem 2.5rem;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 50px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform .2s, box-shadow .2s;
}

.btn-primary:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 25px rgba(99,102,241,.4);
}

/* Секции */
.about {
  max-width: 1100px;
  margin: 0 auto;
  padding: 5rem 1.5rem;
  text-align: center;
}

.about h2 {
  font-size: 2rem;
  margin-bottom: 1rem;
  color: var(--dark);
}

footer {
  text-align: center;
  padding: 2rem;
  background: var(--dark);
  color: #94a3b8;
  font-size: .875rem;
}`;
    }

    function getDefaultJS() {
        return `// StormEditor — JavaScript
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Сайт загружен!');

  // Плавная прокрутка
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const target = document.querySelector(a.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
  });

  // Анимация кнопки
  const btn = document.querySelector('.btn-primary');
  if (btn) {
    btn.addEventListener('click', () => {
      btn.textContent = '🎉 Отлично!';
      setTimeout(() => btn.textContent = 'Начать', 2000);
    });
  }
});`;
    }

    function getLandingTemplate() {
        return {
            html: `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StormLanding</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="header">
    <div class="container nav-container">
      <div class="logo">⚡ Storm</div>
      <nav>
        <a href="#features">Возможности</a>
        <a href="#pricing">Цены</a>
        <a href="#contact">Контакт</a>
      </nav>
      <button class="cta-nav">Попробовать</button>
    </div>
  </header>

  <section class="hero">
    <div class="container hero-inner">
      <div class="hero-badge">🚀 Новый уровень</div>
      <h1>Создавай сайты<br><span class="gradient-text">быстро и красиво</span></h1>
      <p>Профессиональный инструмент для разработчиков и дизайнеров. Без лишнего кода.</p>
      <div class="hero-btns">
        <button class="btn-primary">Начать бесплатно</button>
        <button class="btn-ghost">Смотреть демо ▶</button>
      </div>
      <div class="hero-stats">
        <div><strong>10K+</strong> Пользователей</div>
        <div><strong>50K+</strong> Сайтов</div>
        <div><strong>99%</strong> Довольны</div>
      </div>
    </div>
  </section>

  <section id="features" class="features">
    <div class="container">
      <h2>Почему выбирают нас</h2>
      <div class="features-grid">
        <div class="feature-card">
          <div class="feature-icon">⚡</div>
          <h3>Молниеносно</h3>
          <p>Оптимизированный код для максимальной скорости загрузки</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">🎨</div>
          <h3>Красиво</h3>
          <p>Десятки готовых шаблонов и компонентов</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">📱</div>
          <h3>Адаптивно</h3>
          <p>Отлично выглядит на всех устройствах</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">🤖</div>
          <h3>AI-помощник</h3>
          <p>Генерация кода с помощью искусственного интеллекта</p>
        </div>
      </div>
    </div>
  </section>

  <section class="cta-section">
    <div class="container">
      <h2>Готовы начать?</h2>
      <p>Присоединяйтесь к тысячам разработчиков</p>
      <button class="btn-primary large">Создать аккаунт бесплатно</button>
    </div>
  </section>

  <footer>
    <div class="container">
      <p>© 2025 Storm. Сделано с ❤️</p>
    </div>
  </footer>
  <script src="script.js"><\/script>
</body>
</html>`,
            css: `*{margin:0;padding:0;box-sizing:border-box}
:root{--primary:#6366f1;--dark:#0f172a;--light:#f8fafc}
body{font-family:'Segoe UI',sans-serif;color:var(--dark)}
.container{max-width:1100px;margin:0 auto;padding:0 1.5rem}
.header{position:sticky;top:0;z-index:100;background:rgba(255,255,255,.9);backdrop-filter:blur(12px);border-bottom:1px solid #e2e8f0}
.nav-container{display:flex;align-items:center;justify-content:space-between;padding:1rem 1.5rem}
.logo{font-weight:900;font-size:1.4rem;color:var(--primary)}
nav{display:flex;gap:2rem}
nav a{text-decoration:none;color:#475569;font-weight:500;transition:color .2s}
nav a:hover{color:var(--primary)}
.cta-nav{padding:.5rem 1.25rem;background:var(--primary);color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer}
.hero{min-height:90vh;display:flex;align-items:center;background:linear-gradient(160deg,#e0e7ff 0%,#f0f9ff 60%,#faf5ff 100%);padding:5rem 0}
.hero-inner{text-align:center}
.hero-badge{display:inline-block;background:#e0e7ff;color:var(--primary);padding:.35rem 1rem;border-radius:50px;font-size:.85rem;font-weight:600;margin-bottom:1.5rem}
h1{font-size:clamp(2.5rem,7vw,5rem);font-weight:900;line-height:1.1;margin-bottom:1.5rem}
.gradient-text{background:linear-gradient(135deg,#6366f1,#8b5cf6,#ec4899);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.hero p{font-size:1.2rem;color:#64748b;max-width:560px;margin:0 auto 2.5rem}
.hero-btns{display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;margin-bottom:3rem}
.btn-primary{padding:.9rem 2rem;background:var(--primary);color:#fff;border:none;border-radius:50px;font-size:1rem;font-weight:700;cursor:pointer;transition:all .2s}
.btn-primary:hover{transform:translateY(-3px);box-shadow:0 10px 30px rgba(99,102,241,.4)}
.btn-primary.large{padding:1.1rem 3rem;font-size:1.1rem}
.btn-ghost{padding:.9rem 2rem;background:transparent;color:var(--primary);border:2px solid var(--primary);border-radius:50px;font-size:1rem;font-weight:700;cursor:pointer;transition:all .2s}
.btn-ghost:hover{background:var(--primary);color:#fff}
.hero-stats{display:flex;gap:3rem;justify-content:center;font-size:.9rem;color:#64748b}
.hero-stats strong{display:block;font-size:1.75rem;font-weight:900;color:var(--dark)}
.features{padding:6rem 0;background:#fff}
.features h2{text-align:center;font-size:2.5rem;font-weight:900;margin-bottom:3rem}
.features-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:2rem}
.feature-card{padding:2rem;border:1px solid #e2e8f0;border-radius:16px;transition:all .3s;background:#fafafa}
.feature-card:hover{transform:translateY(-8px);box-shadow:0 20px 40px rgba(99,102,241,.12);border-color:var(--primary)}
.feature-icon{font-size:2.5rem;margin-bottom:1rem}
.feature-card h3{font-size:1.2rem;font-weight:700;margin-bottom:.5rem}
.feature-card p{color:#64748b;line-height:1.6}
.cta-section{padding:6rem 0;background:linear-gradient(135deg,var(--primary),#8b5cf6);text-align:center;color:#fff}
.cta-section h2{font-size:2.5rem;font-weight:900;margin-bottom:1rem}
.cta-section p{font-size:1.1rem;opacity:.85;margin-bottom:2rem}
footer{padding:2rem;background:var(--dark);text-align:center;color:#64748b}`,
            js: `document.addEventListener('DOMContentLoaded',()=>{
  // Scroll анимации
  const cards = document.querySelectorAll('.feature-card');
  const io = new IntersectionObserver(entries=>{
    entries.forEach(e=>{
      if(e.isIntersecting){e.target.style.opacity=1;e.target.style.transform='translateY(0)';}
    });
  },{threshold:.1});
  cards.forEach(c=>{c.style.opacity=0;c.style.transform='translateY(30px)';c.style.transition='all .5s ease';io.observe(c);});

  // CTA кнопки
  document.querySelectorAll('.btn-primary').forEach(btn=>{
    btn.addEventListener('click',()=>{
      btn.textContent='🎉 Вы зарегистрированы!';
      btn.style.background='#16a34a';
      setTimeout(()=>{btn.textContent='Создать аккаунт бесплатно';btn.style.background='';},3000);
    });
  });
});`
        };
    }

    function getPortfolioTemplate() {
        return {
            html: `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Портфолио</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="cursor"></div>
  <header>
    <div class="logo">АА</div>
    <nav>
      <a href="#work">Работы</a>
      <a href="#about">Обо мне</a>
      <a href="#contact">Контакт</a>
    </nav>
  </header>
  <section class="hero">
    <h1><span>Алексей</span><br>Андреев</h1>
    <p>Frontend разработчик & UI/UX дизайнер</p>
    <div class="scroll-hint">↓</div>
  </section>
  <section id="work" class="work">
    <h2>Избранные работы</h2>
    <div class="work-grid">
      <div class="work-item"><div class="work-img" style="background:#6366f1">01</div><h3>E-commerce платформа</h3><span>React, Node.js</span></div>
      <div class="work-item large"><div class="work-img" style="background:#8b5cf6">02</div><h3>Мобильное приложение</h3><span>Flutter, Firebase</span></div>
      <div class="work-item"><div class="work-img" style="background:#ec4899">03</div><h3>Брендинг агентства</h3><span>Figma, Illustrator</span></div>
      <div class="work-item"><div class="work-img" style="background:#14b8a6">04</div><h3>Dashboard аналитики</h3><span>Vue, D3.js</span></div>
    </div>
  </section>
  <section id="about" class="about-section">
    <div class="about-text">
      <h2>Обо мне</h2>
      <p>5 лет опыта в создании цифровых продуктов. Специализируюсь на React, Vue, и современных CSS техниках.</p>
      <div class="skills">
        <span>React</span><span>Vue</span><span>Node.js</span><span>Figma</span><span>TypeScript</span><span>CSS</span>
      </div>
    </div>
  </section>
  <footer id="contact">
    <p>Готов к сотрудничеству</p>
    <a href="mailto:hello@alex.dev">hello@alex.dev</a>
  </footer>
  <script src="script.js"><\/script>
</body>
</html>`,
            css: `*{margin:0;padding:0;box-sizing:border-box}
:root{--dark:#050508;--light:#f5f5f0}
body{background:var(--dark);color:var(--light);font-family:'Helvetica Neue',sans-serif;cursor:none}
.cursor{width:20px;height:20px;border:2px solid #fff;border-radius:50%;position:fixed;pointer-events:none;z-index:9999;transition:transform .1s,opacity .3s;mix-blend-mode:difference}
header{position:fixed;top:0;left:0;right:0;z-index:100;padding:1.5rem 3rem;display:flex;align-items:center;justify-content:space-between;mix-blend-mode:difference}
.logo{font-size:1.2rem;font-weight:900;letter-spacing:.2em}
nav{display:flex;gap:2.5rem}
nav a{text-decoration:none;color:#fff;font-size:.85rem;letter-spacing:.1em;text-transform:uppercase;transition:opacity .2s}
nav a:hover{opacity:.5}
.hero{height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.hero h1{font-size:clamp(5rem,14vw,12rem);font-weight:900;line-height:.9;letter-spacing:-.05em;text-transform:uppercase}
.hero h1 span{display:block;-webkit-text-stroke:1px var(--light);color:transparent}
.hero p{margin-top:2rem;color:#888;font-size:1rem;letter-spacing:.2em;text-transform:uppercase}
.scroll-hint{position:absolute;bottom:2rem;font-size:1.5rem;animation:bounce 2s infinite}
@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(10px)}}
.work{padding:8rem 3rem}
.work h2{font-size:.85rem;letter-spacing:.2em;text-transform:uppercase;color:#666;margin-bottom:3rem}
.work-grid{display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:auto;gap:1.5rem}
.work-item{cursor:none;overflow:hidden;border-radius:8px}
.work-item.large{grid-column:span 2}
.work-img{height:280px;display:flex;align-items:center;justify-content:center;font-size:4rem;font-weight:900;color:rgba(255,255,255,.2);transition:transform .5s,filter .5s}
.work-item:hover .work-img{transform:scale(1.05);filter:brightness(1.1)}
.work-item h3{margin-top:.75rem;font-size:1rem;font-weight:700}
.work-item span{font-size:.8rem;color:#666}
.about-section{padding:8rem 3rem;max-width:800px;margin:0 auto}
.about-section h2{font-size:3rem;font-weight:900;margin-bottom:1.5rem}
.about-section p{color:#aaa;line-height:1.8;font-size:1.1rem;margin-bottom:2rem}
.skills{display:flex;flex-wrap:wrap;gap:.75rem}
.skills span{padding:.4rem 1rem;border:1px solid #333;border-radius:50px;font-size:.85rem;color:#888}
footer{padding:5rem 3rem;text-align:center}
footer p{color:#555;font-size:.85rem;letter-spacing:.2em;text-transform:uppercase;margin-bottom:1rem}
footer a{font-size:3rem;font-weight:900;color:var(--light);text-decoration:none;transition:opacity .2s}
footer a:hover{opacity:.5}`,
            js: `const cursor=document.querySelector('.cursor');
document.addEventListener('mousemove',e=>{cursor.style.left=e.clientX-10+'px';cursor.style.top=e.clientY-10+'px';});
document.addEventListener('mousedown',()=>cursor.style.transform='scale(2)');
document.addEventListener('mouseup',()=>cursor.style.transform='scale(1)');
document.querySelectorAll('a,button,.work-item').forEach(el=>{
  el.addEventListener('mouseenter',()=>cursor.style.transform='scale(2)');
  el.addEventListener('mouseleave',()=>cursor.style.transform='scale(1)');
});`
        };
    }

    function getBlogTemplate() {
        return {
            html: `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Мой Блог</title><link rel="stylesheet" href="style.css"></head>
<body>
<header><div class="container"><a class="logo" href="#">✍️ Мой Блог</a>
<nav><a href="#">Статьи</a><a href="#">Категории</a><a href="#">Обо мне</a></nav></div></header>
<main class="container">
<div class="featured">
  <article class="post-featured">
    <div class="post-meta"><span class="cat">Технологии</span><span>12 мар 2025</span></div>
    <h1>Будущее веб-разработки: что нас ждёт в 2025</h1>
    <p>Искусственный интеллект, WebAssembly и новые фреймворки меняют отрасль быстрее, чем мы успеваем осваивать инструменты...</p>
    <a class="read-more" href="#">Читать далее →</a>
  </article>
</div>
<div class="posts-grid">
  <article class="post-card"><span class="cat">Дизайн</span><h3>10 правил хорошего UI</h3><p>Что отличает хороший интерфейс от плохого...</p><a href="#">→</a></article>
  <article class="post-card"><span class="cat">JavaScript</span><h3>Async/Await на практике</h3><p>Как работать с асинхронным кодом без боли...</p><a href="#">→</a></article>
  <article class="post-card"><span class="cat">CSS</span><h3>CSS Grid за 10 минут</h3><p>Всё что нужно знать для создания макетов...</p><a href="#">→</a></article>
</div>
</main>
<footer><div class="container"><p>© 2025 Мой Блог</p></div></footer>
<script src="script.js"><\/script></body></html>`,
            css: `*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Georgia,serif;background:#fffef9;color:#1a1a1a;line-height:1.7}
.container{max-width:900px;margin:0 auto;padding:0 1.5rem}
header{border-bottom:1px solid #e5e0d5;padding:1.25rem 0;margin-bottom:3rem}
header .container{display:flex;align-items:center;justify-content:space-between}
.logo{font-size:1.3rem;font-weight:700;text-decoration:none;color:#1a1a1a}
nav{display:flex;gap:2rem}
nav a{text-decoration:none;color:#888;font-size:.9rem;transition:color .2s}
nav a:hover{color:#1a1a1a}
.featured{margin-bottom:3rem}
.post-featured{padding:2.5rem;background:#f7f3ea;border-radius:16px}
.post-meta{display:flex;gap:1rem;align-items:center;margin-bottom:1rem;font-size:.85rem;color:#888}
.cat{background:#1a1a1a;color:#fff;padding:.2rem .7rem;border-radius:4px;font-size:.75rem;font-family:'Segoe UI',sans-serif;font-weight:600;letter-spacing:.05em}
.post-featured h1{font-size:2rem;line-height:1.3;margin-bottom:1rem}
.post-featured p{color:#555;margin-bottom:1.5rem}
.read-more{color:#1a1a1a;font-weight:700;text-decoration:none;font-family:'Segoe UI',sans-serif}
.posts-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:1.5rem;margin-bottom:3rem}
.post-card{padding:1.75rem;border:1px solid #e5e0d5;border-radius:12px;transition:all .2s}
.post-card:hover{border-color:#1a1a1a;transform:translateY(-4px)}
.post-card .cat{font-family:'Segoe UI',sans-serif;font-size:.75rem;margin-bottom:.75rem;display:inline-block}
.post-card h3{font-size:1.1rem;margin-bottom:.5rem;line-height:1.4}
.post-card p{color:#888;font-size:.9rem;margin-bottom:1rem}
.post-card a{color:#1a1a1a;text-decoration:none;font-weight:700;font-family:'Segoe UI',sans-serif}
footer{padding:2rem 0;border-top:1px solid #e5e0d5;color:#aaa;font-size:.85rem;font-family:'Segoe UI',sans-serif;text-align:center}`,
            js: `// Анимация появления карточек
const cards = document.querySelectorAll('.post-card');
const io = new IntersectionObserver(e=>{
  e.forEach(entry=>{if(entry.isIntersecting){entry.target.style.opacity=1;entry.target.style.transform='translateY(0)';}});
},{threshold:.1});
cards.forEach(c=>{c.style.opacity=0;c.style.transform='translateY(20px)';c.style.transition='all .4s ease';io.observe(c);});`
        };
    }

    function getDashboardTemplate() {
        return {
            html: `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Dashboard</title><link rel="stylesheet" href="style.css"></head>
<body>
<div class="app">
<aside class="sidebar">
  <div class="sidebar-logo">⚡ Аналитика</div>
  <nav>
    <a href="#" class="active"><span>📊</span> Дашборд</a>
    <a href="#"><span>📈</span> Аналитика</a>
    <a href="#"><span>👥</span> Пользователи</a>
    <a href="#"><span>💰</span> Продажи</a>
    <a href="#"><span>⚙️</span> Настройки</a>
  </nav>
</aside>
<main>
  <div class="topbar"><h1>Обзор</h1><div class="user-pill">👤 Алексей</div></div>
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-icon" style="background:#e0e7ff">📈</div><div><p>Выручка</p><h3>₽1,234,567</h3><span class="badge up">+12%</span></div></div>
    <div class="stat-card"><div class="stat-icon" style="background:#dcfce7">👥</div><div><p>Пользователи</p><h3>8,492</h3><span class="badge up">+5%</span></div></div>
    <div class="stat-card"><div class="stat-icon" style="background:#fce7f3">🛒</div><div><p>Заказы</p><h3>1,234</h3><span class="badge down">-2%</span></div></div>
    <div class="stat-card"><div class="stat-icon" style="background:#fef3c7">⭐</div><div><p>Рейтинг</p><h3>4.8</h3><span class="badge up">+0.2</span></div></div>
  </div>
  <div class="content-grid">
    <div class="card">
      <h2>Последние заказы</h2>
      <table><thead><tr><th>Клиент</th><th>Сумма</th><th>Статус</th></tr></thead>
      <tbody>
        <tr><td>Иван С.</td><td>₽12,500</td><td><span class="status ok">Выполнен</span></td></tr>
        <tr><td>Мария К.</td><td>₽8,300</td><td><span class="status pending">В процессе</span></td></tr>
        <tr><td>Пётр В.</td><td>₽21,000</td><td><span class="status ok">Выполнен</span></td></tr>
        <tr><td>Анна М.</td><td>₽5,600</td><td><span class="status cancel">Отменён</span></td></tr>
      </tbody></table>
    </div>
    <div class="card"><h2>Активность</h2><div class="bars" id="bars"></div></div>
  </div>
</main>
</div>
<script src="script.js"><\/script></body></html>`,
            css: `*{margin:0;padding:0;box-sizing:border-box}
:root{--primary:#6366f1;--sidebar-w:220px}
body{font-family:'Segoe UI',sans-serif;background:#f1f5f9;color:#1e293b;height:100vh}
.app{display:flex;height:100vh}
.sidebar{width:var(--sidebar-w);background:#fff;border-right:1px solid #e2e8f0;display:flex;flex-direction:column;padding:1.5rem 1rem;flex-shrink:0}
.sidebar-logo{font-weight:900;font-size:1.2rem;color:var(--primary);padding:.5rem;margin-bottom:1.5rem}
.sidebar nav{display:flex;flex-direction:column;gap:.25rem}
.sidebar nav a{display:flex;align-items:center;gap:.75rem;padding:.7rem 1rem;border-radius:8px;text-decoration:none;color:#64748b;font-size:.9rem;transition:all .2s}
.sidebar nav a:hover,.sidebar nav a.active{background:#e0e7ff;color:var(--primary);font-weight:600}
main{flex:1;overflow-y:auto;padding:1.5rem 2rem}
.topbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem}
.topbar h1{font-size:1.5rem;font-weight:800}
.user-pill{background:#fff;border:1px solid #e2e8f0;padding:.4rem 1rem;border-radius:50px;font-size:.85rem}
.stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1.5rem}
.stat-card{background:#fff;border-radius:12px;padding:1.25rem;display:flex;align-items:center;gap:1rem;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.stat-icon{width:48px;height:48px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0}
.stat-card p{font-size:.8rem;color:#94a3b8;margin-bottom:.2rem}
.stat-card h3{font-size:1.3rem;font-weight:800;margin-bottom:.25rem}
.badge{font-size:.75rem;font-weight:700;padding:.15rem .5rem;border-radius:4px}
.badge.up{background:#dcfce7;color:#16a34a}
.badge.down{background:#fee2e2;color:#dc2626}
.content-grid{display:grid;grid-template-columns:1.5fr 1fr;gap:1.5rem}
.card{background:#fff;border-radius:12px;padding:1.5rem;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.card h2{font-size:1rem;font-weight:700;margin-bottom:1.25rem;color:#475569}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:.5rem;font-size:.8rem;color:#94a3b8;border-bottom:1px solid #f1f5f9}
td{padding:.75rem .5rem;font-size:.875rem;border-bottom:1px solid #f8fafc}
.status{padding:.25rem .75rem;border-radius:50px;font-size:.75rem;font-weight:600}
.status.ok{background:#dcfce7;color:#16a34a}
.status.pending{background:#fef3c7;color:#d97706}
.status.cancel{background:#fee2e2;color:#dc2626}
.bars{display:flex;align-items:flex-end;gap:.5rem;height:120px;padding-top:.5rem}
.bar-item{flex:1;border-radius:4px 4px 0 0;transition:height .3s;position:relative}
.bar-item:hover{filter:brightness(1.1)}`,
            js: `// Генерация баров
const data=[65,40,80,55,90,45,70,85,60,75,50,95];
const labels=['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
const colors=['#6366f1','#8b5cf6','#ec4899','#14b8a6','#f59e0b','#3b82f6'];
const bars=document.getElementById('bars');
data.forEach((v,i)=>{
  const w=document.createElement('div');
  w.style.cssText='flex:1;display:flex;flex-direction:column;align-items:center;gap:.25rem;height:100%';
  const b=document.createElement('div');
  b.className='bar-item';
  b.style.cssText='width:100%;background:'+colors[i%colors.length]+';opacity:.85;';
  b.style.height='0';
  b.title=labels[i]+': '+v+'%';
  w.appendChild(b);
  const l=document.createElement('span');
  l.style.cssText='font-size:.65rem;color:#94a3b8;';
  l.textContent=labels[i];
  w.appendChild(l);
  bars.appendChild(w);
  setTimeout(()=>{b.style.height=v+'%';b.style.transition='height .6s ease '+i*.05+'s';},100);
});`
        };
    }

    // ─── Инициализация при переходе на вкладку ───────────────────────────────
    function initOnTabSwitch() {
        const observer = new MutationObserver(() => {
            const view = document.getElementById('site-editor-view');
            if (view && !view.classList.contains('hidden') && !monacoEditor) {
                setTimeout(init, 100);
                observer.disconnect();
            }
        });
        const target = document.getElementById('site-editor-view');
        if (target) {
            observer.observe(target, { attributes: true, attributeFilter: ['class'] });
            // Also try to init if already visible
            if (!target.classList.contains('hidden')) setTimeout(init, 100);
        }
    }

    // Public API
    return {
        init, switchFile, addFile, closeFile,
        refreshPreview, setPreviewMode, toggleFullPreview, setFullPreviewMode,
        formatCode, toggleWrap, startResize,
        downloadProject, openInNewTab, loadTemplate,
        toggleAI, sendAIMessage, quickPrompt,
        initOnTabSwitch
    };
})();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SEEditor.initOnTabSwitch());
} else {
    SEEditor.initOnTabSwitch();
}
