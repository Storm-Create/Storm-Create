import { getPosts } from './posts.js';
import { formatDate } from './ui.js';

let allPosts = [];
let filteredPosts = [];
let currentPage = 1;
const POSTS_PER_PAGE = 6;
let currentTag = null;

async function initBlog() {
    const container = document.getElementById('posts-container');
    try {
        allPosts = await getPosts(100); // Fetch a reasonable amount for client-side pagination/search
        filteredPosts = [...allPosts];
        
        extractAndRenderTags();
        renderPosts();
        setupSearch();
    } catch (error) {
        console.error("Error initializing blog:", error);
        container.innerHTML = `<div class="col-span-2 text-center py-10 text-red-500">Ошибка при загрузке постов.</div>`;
    }
}

function extractAndRenderTags() {
    const tagsSet = new Set();
    allPosts.forEach(post => {
        if (post.tags && Array.isArray(post.tags)) {
            post.tags.forEach(tag => tagsSet.add(tag));
        }
    });

    const tagsContainer = document.getElementById('tags-container');
    if (tagsSet.size === 0) {
        tagsContainer.innerHTML = '<span class="text-sm text-gray-500">Нет тегов</span>';
        return;
    }

    tagsContainer.innerHTML = `
        <button class="tag-btn px-3 py-1 rounded-full text-sm font-medium transition ${currentTag === null ? 'bg-primary text-white' : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}" data-tag="">Все</button>
        ${Array.from(tagsSet).map(tag => `
            <button class="tag-btn px-3 py-1 rounded-full text-sm font-medium transition ${currentTag === tag ? 'bg-primary text-white' : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}" data-tag="${tag}">${tag}</button>
        `).join('')}
    `;

    document.querySelectorAll('.tag-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tag = e.target.getAttribute('data-tag');
            currentTag = tag ? tag : null;
            applyFilters();
            extractAndRenderTags(); // Re-render to update active state
        });
    });
}

function setupSearch() {
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', (e) => {
        applyFilters(e.target.value);
    });
}

function applyFilters(searchQuery = document.getElementById('search-input').value) {
    const query = searchQuery.toLowerCase();
    filteredPosts = allPosts.filter(post => {
        const matchesSearch = post.title.toLowerCase().includes(query) || post.content.toLowerCase().includes(query);
        const matchesTag = currentTag ? (post.tags && post.tags.includes(currentTag)) : true;
        return matchesSearch && matchesTag;
    });
    currentPage = 1;
    renderPosts();
}

function renderPosts() {
    const container = document.getElementById('posts-container');
    const paginationContainer = document.getElementById('pagination');
    
    if (filteredPosts.length === 0) {
        container.innerHTML = `<div class="col-span-2 text-center py-10 text-gray-500">Посты не найдены.</div>`;
        paginationContainer.innerHTML = '';
        return;
    }

    const startIndex = (currentPage - 1) * POSTS_PER_PAGE;
    const paginatedPosts = filteredPosts.slice(startIndex, startIndex + POSTS_PER_PAGE);
    const totalPages = Math.ceil(filteredPosts.length / POSTS_PER_PAGE);

    container.innerHTML = paginatedPosts.map((post, index) => `
        <a href="post.html?id=${post.id}" class="group block glass-card glass-card--lift rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-700 fade-in visible" style="animation-delay: ${index * 50}ms">
            ${post.imageUrl ? `<div class="h-48 overflow-hidden"><img src="${post.imageUrl}" alt="${post.title}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500"></div>` : '<div class="h-48 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/20 dark:to-purple-900/20 flex items-center justify-center"><i class="fas fa-image text-4xl text-gray-300 dark:text-gray-600"></i></div>'}
            <div class="p-6">
                <div class="flex flex-wrap gap-2 mb-3">
                    ${(post.tags || []).slice(0, 2).map(tag => `<span class="text-xs font-medium px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">${tag}</span>`).join('')}
                </div>
                <h3 class="text-xl font-bold mb-2 group-hover:text-primary transition">${post.title}</h3>
                <p class="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-2">${post.description || post.content.substring(0, 100) + '...'}</p>
                <div class="flex items-center text-xs text-gray-500 dark:text-gray-400">
                    <i class="far fa-calendar-alt mr-2"></i> ${formatDate(post.createdAt)}
                    <span class="mx-2">•</span>
                    <i class="far fa-eye mr-1"></i> ${post.views || 0}
                </div>
            </div>
        </a>
    `).join('');

    renderPagination(totalPages);
}

function renderPagination(totalPages) {
    const container = document.getElementById('pagination');
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '';
    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="page-btn w-10 h-10 rounded-lg font-medium transition ${i === currentPage ? 'bg-primary text-white shadow-md' : 'glass-card text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:text-primary'}" data-page="${i}">${i}</button>`;
    }
    container.innerHTML = html;

    document.querySelectorAll('.page-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            currentPage = parseInt(e.target.getAttribute('data-page'));
            renderPosts();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initBlog();
});
