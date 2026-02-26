import { db } from './firebase.js';
import { collection, getDocs, doc, getDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { initTheme } from './ui.js';

let docsData = [];
let activeDocId = null;

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
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
    if (!db) return;
    const nav = document.getElementById('docs-nav');

    try {
        const q = query(collection(db, 'docs'), orderBy('order', 'asc'));
        const snap = await getDocs(q);
        docsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (docsData.length === 0) {
            nav.innerHTML = '<p class="text-sm text-gray-500 py-2">Документация пока пуста.</p>';
            return;
        }

        renderNav(docsData);

        // Check URL params for specific doc
        const urlParams = new URLSearchParams(window.location.search);
        const docId = urlParams.get('id');
        if (docId) selectDoc(docId);

    } catch (e) {
        console.error('Error loading docs:', e);
        nav.innerHTML = '<p class="text-sm text-red-500 py-2">Ошибка загрузки.</p>';
    }
}

function renderNav(items) {
    const nav = document.getElementById('docs-nav');

    // Group by category
    const categories = {};
    items.forEach(item => {
        const cat = item.category || 'Общее';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(item);
    });

    nav.innerHTML = Object.entries(categories).map(([cat, docs]) => `
        <div class="mb-4">
            <h4 class="text-xs font-semibold text-gray-400 dark:text-gray-500 mb-2 px-3">${cat}</h4>
            <div class="space-y-1">
                ${docs.map(d => `
                    <button onclick="window.selectDoc('${d.id}')" data-id="${d.id}"
                        class="doc-nav-btn w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-200 
                        ${d.id === activeDocId ? 'bg-primary/10 text-primary font-bold border-l-4 border-primary' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400'}">
                        ${d.title}
                    </button>
                `).join('')}
            </div>
        </div>
    `).join('');
}

window.selectDoc = async (id) => {
    activeDocId = id;
    const placeholder = document.getElementById('doc-placeholder');
    const render = document.getElementById('doc-render');

    // UI feedback
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

    // Update URL without reload
    const url = new URL(window.location);
    url.searchParams.set('id', id);
    window.history.pushState({}, '', url);

    // Render markdown
    render.innerHTML = `
        <div class="fade-in">
            <div class="mb-8 pb-8 border-b border-gray-100 dark:border-gray-700">
                <span class="text-xs font-bold text-primary uppercase tracking-widest mb-2 block">${docItem.category || 'Общее'}</span>
                <h1 class="text-3xl md:text-4xl font-extrabold">${docItem.title}</h1>
            </div>
            <div class="prose prose-blue dark:prose-invert max-w-none">
                ${marked.parse(docItem.content || '')}
            </div>
        </div>
    `;

    // Smooth scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

function setupSearch() {
    const input = document.getElementById('docs-search');
    if (!input) return;

    input.oninput = (e) => {
        const q = e.target.value.toLowerCase();
        const filtered = docsData.filter(d =>
            d.title.toLowerCase().includes(q) ||
            (d.category && d.category.toLowerCase().includes(q))
        );
        renderNav(filtered);
    };
}
