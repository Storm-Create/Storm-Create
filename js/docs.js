import { db } from './firebase.js';
import { collection, getDocs, doc, getDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { initTheme } from './ui.js';

const LOCAL_DOC_SOURCE = 'Storm_Create_Documentation.txt';
const DEFAULT_SUMMARY_TITLE = 'Полная пользовательская документация';

let docsData = [];
let activeDocId = null;
let closeDocsSidebar = () => { };

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupResponsiveSidebar();
    loadSiteSettings();
    loadDocs();
    setupSearch();
});

async function loadSiteSettings() {
    if (!db) return;
    try {
        const snap = await getDoc(doc(db, 'settings', 'site'));
        if (snap.exists()) {
            const s = snap.data();
            if (s.primaryColor) {
                document.documentElement.style.setProperty('--primary-color', s.primaryColor);
            }
        }
    } catch (e) {
        console.warn('Could not load site settings:', e);
    }
}

async function loadDocs() {
    const nav = document.getElementById('docs-nav');
    if (!nav) return;

    let summaryMeta = {
        title: DEFAULT_SUMMARY_TITLE,
        updatedAt: ''
    };

    setSummaryMeta(summaryMeta, 0);

    try {
        const local = await loadLocalDocs();
        docsData = local.docs;
        summaryMeta = local.meta;
    } catch (localError) {
        console.warn('Local docs are unavailable, trying Firebase fallback:', localError);
        docsData = await loadDocsFromFirestore();
        summaryMeta = {
            title: 'Онлайн база знаний Storm Create',
            updatedAt: ''
        };
    }

    setSummaryMeta(summaryMeta, docsData.length);

    if (docsData.length === 0) {
        nav.innerHTML = '<p class="text-sm text-red-500 py-2">Не удалось загрузить документацию.</p>';
        return;
    }

    docsData.sort((a, b) => (a.order || 0) - (b.order || 0));
    renderNav(docsData);

    const urlParams = new URLSearchParams(window.location.search);
    const docId = urlParams.get('id');
    const defaultId = docsData[0]?.id;
    const hasDocId = docId && docsData.some(d => d.id === docId);
    selectDoc(hasDocId ? docId : defaultId);
}

async function loadLocalDocs() {
    const response = await fetch(LOCAL_DOC_SOURCE, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Failed to fetch ${LOCAL_DOC_SOURCE}: ${response.status}`);
    }

    const rawText = await response.text();
    const parsed = parseLocalDocumentation(rawText);
    if (!parsed.docs.length) {
        throw new Error('Parsed local documentation is empty');
    }

    return parsed;
}

async function loadDocsFromFirestore() {
    if (!db) return [];

    try {
        const q = query(collection(db, 'docs'), orderBy('order', 'asc'));
        const snap = await getDocs(q);
        return snap.docs.map((d, i) => ({
            id: `cloud-${d.id}`,
            ...d.data(),
            order: Number.isFinite(d.data().order) ? d.data().order : 1000 + i
        }));
    } catch (e) {
        console.error('Error loading docs from Firebase:', e);
        return [];
    }
}

function parseLocalDocumentation(rawText) {
    const text = String(rawText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^\uFEFF/, '');
    const lines = text.split('\n');

    const meta = {
        title: DEFAULT_SUMMARY_TITLE,
        updatedAt: ''
    };

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!meta.title || meta.title === DEFAULT_SUMMARY_TITLE) {
            if (trimmed.toUpperCase().startsWith('STORM CREATE')) {
                meta.title = trimmed;
            }
        }

        const updatedMatch = trimmed.match(/^Актуально на:\s*(.+)$/i);
        if (updatedMatch) {
            meta.updatedAt = updatedMatch[1].trim();
        }
    });

    const sectionStarts = [];
    for (let i = 0; i < lines.length; i++) {
        const heading = parseTopLevelHeading(lines, i);
        if (heading) {
            sectionStarts.push({ ...heading, index: i });
        }
    }

    const docs = sectionStarts.map((section, idx) => {
        const nextSection = sectionStarts[idx + 1];
        const contentLines = lines.slice(section.index + 1, nextSection ? nextSection.index : lines.length);

        return {
            id: section.id,
            title: section.displayTitle,
            category: resolveSectionCategory(section),
            order: section.type === 'appendix' ? 9000 + idx : section.number,
            content: toMarkdown(contentLines)
        };
    });

    return { meta, docs };
}

function parseTopLevelHeading(lines, index) {
    const rawLine = lines[index] || '';
    const line = rawLine.trim();
    if (!line) return null;

    const numberedMatch = line.match(/^(\d+)\)\s+(.+)$/);
    const appendixMatch = line.match(/^ПРИЛОЖЕНИЕ\s+([A-ZА-Я0-9]+)\)\s+(.+)$/i);

    if (!numberedMatch && !appendixMatch) {
        return null;
    }

    const prevNonEmpty = getNearestNonEmptyIndex(lines, index - 1, -1);
    const nextNonEmpty = getNearestNonEmptyIndex(lines, index + 1, 1);
    const hasSeparatorsAround = prevNonEmpty !== -1
        && nextNonEmpty !== -1
        && isSeparatorLine(lines[prevNonEmpty])
        && isSeparatorLine(lines[nextNonEmpty]);

    if (!hasSeparatorsAround) {
        return null;
    }

    if (numberedMatch) {
        const number = Number(numberedMatch[1]);
        const title = numberedMatch[2].trim();
        return {
            id: `storm-doc-${number}`,
            type: 'section',
            number,
            title,
            displayTitle: `${number}. ${title}`
        };
    }

    const appendix = appendixMatch[1].toUpperCase();
    const appendixTitle = appendixMatch[2].trim();

    return {
        id: `storm-doc-appendix-${appendix.toLowerCase()}`,
        type: 'appendix',
        appendix,
        number: 9999,
        title: appendixTitle,
        displayTitle: `Приложение ${appendix}. ${appendixTitle}`
    };
}

function resolveSectionCategory(section) {
    if (section.type === 'appendix') return 'Юридические документы';

    const n = section.number;
    if (n <= 7) return 'Старт и основы';
    if (n <= 21) return 'Shop-бот';
    if (n <= 27) return 'Поддержка и безопасность';
    if (n <= 32) return 'Расширенные функции';
    return 'VPN-бот';
}

function toMarkdown(lines) {
    const mdLines = [];

    lines.forEach(raw => {
        const line = String(raw || '').replace(/\t/g, '    ').trimEnd();
        const trimmed = line.trim();

        if (!trimmed || isSeparatorLine(trimmed)) {
            pushBlankLine(mdLines);
            return;
        }

        const subsectionMatch = trimmed.match(/^(\d+\.\d+)\s+(.+)$/);
        if (subsectionMatch) {
            pushBlankLine(mdLines);
            mdLines.push(`### ${subsectionMatch[1]} ${subsectionMatch[2]}`);
            pushBlankLine(mdLines);
            return;
        }

        const legalHeadingMatch = trimmed.match(/^(\d+)\.\s+([A-ZА-ЯЁ0-9][A-ZА-ЯЁ0-9 ,:«»"()\/\-]{4,})$/);
        if (legalHeadingMatch) {
            pushBlankLine(mdLines);
            mdLines.push(`## ${legalHeadingMatch[1]}. ${legalHeadingMatch[2]}`);
            pushBlankLine(mdLines);
            return;
        }

        const listItemMatch = trimmed.match(/^(\d+)\)\s+(.+)$/);
        if (listItemMatch) {
            mdLines.push(`${listItemMatch[1]}. ${listItemMatch[2]}`);
            return;
        }

        if (/^[A-Za-zА-Яа-яЁё0-9][^:]{1,80}:$/.test(trimmed)) {
            mdLines.push(`**${trimmed}**`);
            return;
        }

        mdLines.push(trimmed);
    });

    return mdLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function getNearestNonEmptyIndex(lines, startIndex, step) {
    for (let i = startIndex; i >= 0 && i < lines.length; i += step) {
        if ((lines[i] || '').trim()) {
            return i;
        }
    }
    return -1;
}

function isSeparatorLine(line) {
    return /^={8,}$/.test(String(line || '').trim());
}

function pushBlankLine(lines) {
    if (lines.length > 0 && lines[lines.length - 1] !== '') {
        lines.push('');
    }
}

function setSummaryMeta(meta, count) {
    const titleEl = document.getElementById('docs-summary-title');
    const updatedEl = document.getElementById('docs-summary-updated');
    const countEl = document.getElementById('docs-summary-count');

    if (titleEl) {
        titleEl.textContent = meta?.title || DEFAULT_SUMMARY_TITLE;
    }

    if (updatedEl) {
        updatedEl.textContent = `Актуальность: ${meta?.updatedAt || 'без даты'}`;
    }

    if (countEl) {
        countEl.textContent = `Разделов: ${count || 0}`;
    }
}

function renderNav(items) {
    const nav = document.getElementById('docs-nav');
    if (!nav) return;

    if (!items.length) {
        nav.innerHTML = '<p class="text-sm text-gray-500 py-2">Ничего не найдено по вашему запросу.</p>';
        return;
    }

    const categories = {};
    items.forEach(item => {
        const cat = item.category || 'Общее';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(item);
    });

    const categoryPriority = {
        'Старт и основы': 1,
        'Shop-бот': 2,
        'Поддержка и безопасность': 3,
        'Расширенные функции': 4,
        'VPN-бот': 5,
        'Юридические документы': 6,
        'Общее': 7
    };

    const orderedCategories = Object.entries(categories).sort((a, b) => {
        const aRank = categoryPriority[a[0]] || 99;
        const bRank = categoryPriority[b[0]] || 99;
        return aRank - bRank;
    });

    nav.innerHTML = orderedCategories.map(([cat, docs]) => `
        <div class="mb-4">
            <h4 class="text-xs font-semibold text-gray-400 dark:text-gray-500 mb-2 px-3">${cat}</h4>
            <div class="space-y-1">
                ${docs.map(d => `
                    <button onclick="window.selectDoc('${d.id}')" data-id="${d.id}"
                        class="doc-nav-btn w-full text-left px-3 py-2.5 rounded-lg text-sm leading-snug transition-all duration-200 
                        ${d.id === activeDocId ? 'bg-primary/10 text-primary font-bold border-l-4 border-primary' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'}">
                        ${d.title}
                    </button>
                `).join('')}
            </div>
        </div>
    `).join('');
}

async function selectDoc(id, options = {}) {
    activeDocId = id;
    const placeholder = document.getElementById('doc-placeholder');
    const render = document.getElementById('doc-render');
    if (!render || !placeholder) return;

    document.querySelectorAll('.doc-nav-btn').forEach(btn => {
        const btnId = btn.getAttribute('data-id');
        if (btnId === id) {
            btn.classList.add('bg-primary/10', 'text-primary', 'font-bold', 'border-l-4', 'border-primary');
            btn.classList.remove('text-gray-600', 'dark:text-gray-400');
        } else {
            btn.classList.remove('bg-primary/10', 'text-primary', 'font-bold', 'border-l-4', 'border-primary');
            btn.classList.add('text-gray-600', 'dark:text-gray-400');
        }
    });

    placeholder.classList.add('hidden');
    render.classList.remove('hidden');
    render.innerHTML = '<div class="flex justify-center py-20"><i class="fas fa-spinner fa-spin text-4xl text-primary"></i></div>';

    const docItem = docsData.find(d => d.id === id);
    if (!docItem) {
        render.innerHTML = '<p class="text-center py-20 text-red-500">Документ не найден.</p>';
        return;
    }

    if (!options.skipHistory) {
        const url = new URL(window.location);
        url.searchParams.set('id', id);
        window.history.pushState({}, '', url);
    }

    render.innerHTML = `
        <div class="fade-in visible">
            <div class="mb-8 pb-8 border-b border-gray-100 dark:border-gray-700">
                <span class="text-xs font-bold text-primary uppercase tracking-widest mb-2 block">${docItem.category || 'Общее'}</span>
                <h1 class="text-3xl md:text-4xl font-extrabold">${docItem.title}</h1>
            </div>
            <div class="prose prose-blue dark:prose-invert max-w-none">
                ${window.marked ? window.marked.parse(docItem.content || '') : docItem.content || ''}
            </div>
        </div>
    `;

    closeDocsSidebar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.selectDoc = selectDoc;

function setupResponsiveSidebar() {
    const layout = document.getElementById('docs-layout');
    const sidebar = document.getElementById('docs-sidebar');
    const toggle = document.getElementById('docs-menu-toggle');
    const close = document.getElementById('docs-menu-close');
    const backdrop = document.getElementById('docs-sidebar-backdrop');
    const mobileMedia = window.matchMedia('(max-width: 1023px)');

    if (!layout || !sidebar || !toggle || !backdrop) {
        closeDocsSidebar = () => { };
        return;
    }

    const syncAria = (isOpen) => {
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        sidebar.setAttribute('aria-hidden', isOpen ? 'false' : (mobileMedia.matches ? 'true' : 'false'));
    };

    const openSidebar = () => {
        if (!mobileMedia.matches) return;
        layout.classList.add('docs-sidebar-open');
        backdrop.classList.add('active');
        document.body.classList.add('docs-lock-scroll');
        syncAria(true);
    };

    closeDocsSidebar = () => {
        layout.classList.remove('docs-sidebar-open');
        backdrop.classList.remove('active');
        document.body.classList.remove('docs-lock-scroll');
        syncAria(false);
    };

    const handleViewportChange = () => {
        if (!mobileMedia.matches) {
            closeDocsSidebar();
            sidebar.setAttribute('aria-hidden', 'false');
        }
    };

    toggle.addEventListener('click', () => {
        if (layout.classList.contains('docs-sidebar-open')) {
            closeDocsSidebar();
            return;
        }
        openSidebar();
    });

    close?.addEventListener('click', closeDocsSidebar);
    backdrop.addEventListener('click', closeDocsSidebar);

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && layout.classList.contains('docs-sidebar-open')) {
            closeDocsSidebar();
        }
    });

    window.addEventListener('resize', handleViewportChange);
    handleViewportChange();
    syncAria(false);
}

function setupSearch() {
    const input = document.getElementById('docs-search');
    if (!input) return;

    input.oninput = (e) => {
        const q = e.target.value.toLowerCase().trim();
        if (!q) {
            renderNav(docsData);
            return;
        }

        const filtered = docsData.filter(d =>
            d.title.toLowerCase().includes(q) ||
            (d.category && d.category.toLowerCase().includes(q)) ||
            (d.content && d.content.toLowerCase().includes(q))
        );

        renderNav(filtered);

        if (filtered.length && !filtered.some(d => d.id === activeDocId)) {
            selectDoc(filtered[0].id, { skipHistory: true });
        }
    };
}
