import { getPost, getPosts, incrementViews, toggleLike } from './posts.js';
import { getComments, addComment } from './comments.js';
import { formatDate, showToast } from './ui.js';

let currentPostId = null;
let converter = new showdown.Converter({ tables: true, strikethrough: true, tasklists: true });

async function initPost() {
    const urlParams = new URLSearchParams(window.location.search);
    currentPostId = urlParams.get('id');

    if (!currentPostId) {
        document.getElementById('post-content-container').innerHTML = `<div class="text-center py-20 text-red-500">Пост не найден.</div>`;
        return;
    }

    try {
        const post = await getPost(currentPostId);
        if (!post) {
            document.getElementById('post-content-container').innerHTML = `<div class="text-center py-20 text-red-500">Пост не найден или удален.</div>`;
            return;
        }

        document.title = `${post.title} - StormCreate`;
        renderPost(post);
        incrementViews(currentPostId);

        document.getElementById('comments-section').classList.remove('hidden');
        loadComments();
        setupCommentForm();
        setupImageModal();
        setupLikeButton();
        loadRelatedPosts(post.tags, currentPostId);

    } catch (error) {
        console.error("Error loading post:", error);
        document.getElementById('post-content-container').innerHTML = `<div class="text-center py-20 text-red-500">Ошибка при загрузке поста.</div>`;
    }
}

async function loadRelatedPosts(tags, currentId) {
    if (!tags || tags.length === 0) return;

    const list = document.getElementById('related-posts-list');
    const section = document.getElementById('related-posts-section');

    try {
        const posts = await getPosts(4, tags[0]);
        const related = posts.filter(p => p.id !== currentId).slice(0, 2);

        if (related.length > 0) {
            section.classList.remove('hidden');
            list.innerHTML = related.map(post => `
                <a href="post.html?id=${post.id}" class="group block bg-white dark:bg-gray-800 rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-700 hover:shadow-xl transition">
                    ${post.imageUrl ? `<div class="h-32 overflow-hidden"><img src="${post.imageUrl}" alt="${post.title}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500"></div>` : ''}
                    <div class="p-4">
                        <h4 class="font-bold mb-2 group-hover:text-primary transition line-clamp-2">${post.title}</h4>
                        <div class="text-xs text-gray-500">${formatDate(post.createdAt)}</div>
                    </div>
                </a>
            `).join('');
        }
    } catch (e) {
        console.error("Error loading related posts:", e);
    }
}

function renderPost(post) {
    const container = document.getElementById('post-content-container');
    const htmlContent = DOMPurify.sanitize(converter.makeHtml(post.content));

    // Simple user ID based on localStorage for likes
    let userId = localStorage.getItem('userId');
    if (!userId) {
        userId = 'user_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('userId', userId);
    }
    const hasLiked = (post.likes || []).includes(userId);

    container.innerHTML = `
        <div class="flex items-center text-sm text-gray-500 mb-6">
            <a href="index.html" class="hover:text-primary">Главная</a>
            <span class="mx-2">/</span>
            <a href="blog.html" class="hover:text-primary">Блог</a>
            <span class="mx-2">/</span>
            <span class="text-gray-900 dark:text-gray-100 truncate">${post.title}</span>
        </div>
        
        <div class="flex flex-wrap gap-2 mb-6">
            ${(post.tags || []).map(tag => `<span class="text-sm font-medium px-3 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">${tag}</span>`).join('')}
        </div>
        
        <h1 class="text-4xl md:text-5xl font-bold mb-6 leading-tight">${post.title}</h1>
        
        <div class="flex items-center text-sm text-gray-500 dark:text-gray-400 mb-10 pb-6 border-b border-gray-200 dark:border-gray-800">
            <i class="far fa-calendar-alt mr-2"></i> ${formatDate(post.createdAt)}
            <span class="mx-4">•</span>
            <i class="far fa-eye mr-2"></i> ${post.views || 0} просмотров
        </div>
        
        ${post.imageUrl ? `<div class="mb-10 rounded-2xl overflow-hidden shadow-lg"><img src="${post.imageUrl}" alt="${post.title}" class="w-full h-auto object-cover max-h-[500px] cursor-pointer post-image"></div>` : ''}
        
        <div class="markdown-body text-lg text-gray-800 dark:text-gray-200">
            ${htmlContent}
        </div>
        
        <div class="mt-12 pt-8 border-t border-gray-200 dark:border-gray-800 flex justify-between items-center">
            <button id="like-btn" class="flex items-center gap-2 px-4 py-2 rounded-full transition ${hasLiked ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-red-50 hover:text-red-500'}">
                <i class="${hasLiked ? 'fas' : 'far'} fa-heart text-xl"></i>
                <span id="like-count" class="font-medium">${(post.likes || []).length}</span>
            </button>
            
            <div class="flex gap-4">
                <button onclick="navigator.clipboard.writeText(window.location.href); showToast('Ссылка скопирована', 'success')" class="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition">
                    <i class="fas fa-link"></i>
                </button>
            </div>
        </div>
    `;
}

function setupLikeButton() {
    const likeBtn = document.getElementById('like-btn');
    if (!likeBtn) return;

    likeBtn.addEventListener('click', async () => {
        const userId = localStorage.getItem('userId');
        const isLiked = await toggleLike(currentPostId, userId);

        const icon = likeBtn.querySelector('i');
        const countSpan = document.getElementById('like-count');
        let count = parseInt(countSpan.innerText);

        if (isLiked) {
            likeBtn.className = 'flex items-center gap-2 px-4 py-2 rounded-full transition bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400';
            icon.className = 'fas fa-heart text-xl';
            countSpan.innerText = count + 1;
        } else {
            likeBtn.className = 'flex items-center gap-2 px-4 py-2 rounded-full transition bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-red-50 hover:text-red-500';
            icon.className = 'far fa-heart text-xl';
            countSpan.innerText = Math.max(0, count - 1);
        }
    });
}

async function loadComments() {
    const list = document.getElementById('comments-list');
    try {
        const comments = await getComments(currentPostId);
        if (comments.length === 0) {
            list.innerHTML = `<p class="text-gray-500 text-center py-4">Пока нет комментариев. Будьте первым!</p>`;
            return;
        }

        list.innerHTML = comments.map(comment => `
            <div class="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700">
                <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold">
                            ${comment.author.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div class="font-bold">${DOMPurify.sanitize(comment.author)}</div>
                            <div class="text-xs text-gray-500">${formatDate(comment.createdAt)}</div>
                        </div>
                    </div>
                </div>
                <p class="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">${DOMPurify.sanitize(comment.text)}</p>
                ${comment.reply ? `
                    <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <div class="flex items-center gap-2 mb-2">
                            <i class="fas fa-user-shield text-primary"></i>
                            <span class="font-medium text-primary">Ответ администратора</span>
                            <span class="text-xs text-gray-400">${comment.reply.createdAt ? formatDate(comment.reply.createdAt) : ''}</span>
                        </div>
                        <p class="text-gray-600 dark:text-gray-400 whitespace-pre-wrap bg-gray-50 dark:bg-gray-900 p-3 rounded-lg">${DOMPurify.sanitize(comment.reply.text)}</p>
                    </div>
                ` : ''}
            </div>
        `).join('');
    } catch (e) {
        list.innerHTML = `<p class="text-red-500">Ошибка загрузки комментариев.</p>`;
    }
}

function setupCommentForm() {
    const form = document.getElementById('comment-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('comment-name');
        const textInput = document.getElementById('comment-text');
        const submitBtn = form.querySelector('button[type="submit"]');

        const name = nameInput.value.trim();
        const text = textInput.value.trim();

        if (!name || !text) return;

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Отправка...';

        try {
            await addComment(currentPostId, name, text);
            showToast('Комментарий добавлен', 'success');
            nameInput.value = '';
            textInput.value = '';
            loadComments();
        } catch (error) {
            console.error(error);
            showToast('Ошибка при добавлении комментария', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Отправить';
        }
    });
}

function setupImageModal() {
    const modal = document.getElementById('image-modal');
    const modalImg = document.getElementById('modal-image');
    const closeBtn = document.getElementById('close-modal');

    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('post-image') || (e.target.tagName === 'IMG' && e.target.closest('.markdown-body'))) {
            modalImg.src = e.target.src;
            modal.classList.remove('hidden');
            // Trigger reflow
            void modal.offsetWidth;
            modal.classList.remove('opacity-0');
            document.body.style.overflow = 'hidden';
        }
    });

    const closeModal = () => {
        modal.classList.add('opacity-0');
        setTimeout(() => {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
        }, 300);
    };

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initPost();
});
