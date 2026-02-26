import { checkAuth, login, logout } from './auth.js';
import { getPosts, createPost, updatePost, deletePost } from './posts.js';
import { getAllComments, deleteComment } from './comments.js';
import { getReviews, deleteReview } from './reviews.js';
import { showToast, formatDate, initTheme } from './ui.js';
import { storage, db } from './firebase.js';
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc, addDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let simplemde;
let postsData = [];
let commentsData = [];
let reviewsData = [];

document.addEventListener('DOMContentLoaded', () => {
    initTheme();

    checkAuth((user) => {
        const adminEmails = [
            'counterflug@stormcreate.com',
            'andrewsker@stormcreate.com',
            '852861796@telegram.stormcreate.com',
            '7456647404@telegram.stormcreate.com'
        ];
        if (user && adminEmails.includes(user.email)) {
            document.getElementById('login-section').classList.add('hidden');
            document.getElementById('admin-dashboard').classList.remove('hidden');
            document.getElementById('admin-email').innerText = user.email;

            // Set Gravatar
            const hash = md5(user.email.trim().toLowerCase());
            document.getElementById('admin-avatar').src = `https://www.gravatar.com/avatar/${hash}?d=mp&f=y`;

            initDashboard();
        } else {
            if (user) {
                // Logged in but not admin
                logout();
                showToast('Доступ запрещен: вы не администратор', 'error');
            }
            document.getElementById('login-section').classList.remove('hidden');
            document.getElementById('admin-dashboard').classList.add('hidden');
        }
    });

    setupLogin();
    setupNavigation();
    setupLogout();
    setupEditor();
    setupSettings();
    setupFaqHandlers();
    setupRoadmapHandlers();
    setupDocsHandlers();
});

function setupLogin() {
    const form = document.getElementById('login-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const btn = form.querySelector('button');

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Вход...';

        try {
            await login(email, password);
            showToast('Успешный вход', 'success');
        } catch (error) {
            console.error(error);
            showToast('Ошибка входа. Проверьте данные.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Войти';
        }
    });
}

function setupLogout() {
    document.getElementById('logout-btn').addEventListener('click', async () => {
        try {
            await logout();
            showToast('Вы вышли из системы', 'info');
        } catch (error) {
            console.error(error);
        }
    });
}

function setupNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active state
            navBtns.forEach(b => {
                b.classList.remove('bg-primary/10', 'text-primary');
                b.classList.add('hover:bg-gray-100', 'dark:hover:bg-gray-800', 'text-gray-600', 'dark:text-gray-400');
            });
            btn.classList.remove('hover:bg-gray-100', 'dark:hover:bg-gray-800', 'text-gray-600', 'dark:text-gray-400');
            btn.classList.add('bg-primary/10', 'text-primary');

            // Show target view
            const targetId = btn.getAttribute('data-target');
            document.querySelectorAll('.view-section').forEach(view => {
                view.classList.add('hidden');
            });
            document.getElementById(targetId).classList.remove('hidden');

            if (targetId === 'dashboard-view') updateDashboardStats();
            if (targetId === 'posts-view') loadAdminPosts();
            if (targetId === 'comments-view') loadAdminComments();
            if (targetId === 'reviews-view') loadAdminReviews();
            if (targetId === 'settings-view') loadSettings();
            if (targetId === 'faq-view') loadAdminFaq();
            if (targetId === 'roadmap-view') loadAdminRoadmap();
            if (targetId === 'docs-view') loadAdminDocs();
            if (targetId === 'tickets-view') loadAdminTickets();
        });
    });
}

async function initDashboard() {
    await loadAdminPosts();
    await loadAdminComments();
    await loadAdminReviews();
    updateDashboardStats();
    initChart();
}

async function loadAdminPosts() {
    try {
        postsData = await getPosts(1000); // Get all for admin
        renderAdminPosts();
    } catch (error) {
        console.error(error);
        showToast('Ошибка загрузки постов', 'error');
    }
}

function renderAdminPosts() {
    const tbody = document.getElementById('admin-posts-list');
    if (postsData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-gray-500">Нет постов</td></tr>`;
        return;
    }

    tbody.innerHTML = postsData.map(post => `
        <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
            <td class="p-4 font-medium">${post.title}</td>
            <td class="p-4 text-gray-500">${formatDate(post.createdAt)}</td>
            <td class="p-4 text-gray-500">${post.views || 0}</td>
            <td class="p-4 text-right">
                <button onclick="window.editPost('${post.id}')" class="text-blue-500 hover:text-blue-700 mr-3"><i class="fas fa-edit"></i></button>
                <button onclick="window.deletePostHandler('${post.id}')" class="text-red-500 hover:text-red-700"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

async function loadAdminComments() {
    try {
        commentsData = await getAllComments();
        renderAdminComments();
    } catch (error) {
        console.error(error);
    }
}

function renderAdminComments() {
    const tbody = document.getElementById('admin-comments-list');
    if (commentsData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-gray-500">Нет комментариев</td></tr>`;
        return;
    }

    tbody.innerHTML = commentsData.map(comment => `
        <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
            <td class="p-4 font-medium">${comment.author}</td>
            <td class="p-4 text-gray-500 truncate max-w-xs">${comment.text}</td>
            <td class="p-4 text-gray-500">${formatDate(comment.createdAt)}</td>
            <td class="p-4 text-right">
                <button onclick="window.deleteCommentHandler('${comment.id}')" class="text-red-500 hover:text-red-700"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

function updateDashboardStats() {
    document.getElementById('stat-posts').innerText = postsData.length;
    document.getElementById('stat-comments').innerText = commentsData.length;
    const totalViews = postsData.reduce((sum, post) => sum + (post.views || 0), 0);
    document.getElementById('stat-views').innerText = totalViews;
}

// --- Reviews Management ---

async function loadAdminReviews() {
    try {
        reviewsData = await getReviews();
        renderAdminReviews();
    } catch (error) {
        console.error("Error loading reviews:", error);
        showToast('Ошибка при загрузке отзывов', 'error');
    }
}

function renderAdminReviews() {
    const tbody = document.getElementById('admin-reviews-list');
    if (!tbody) return;

    if (reviewsData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-gray-500">Нет отзывов</td></tr>`;
        return;
    }

    tbody.innerHTML = reviewsData.map(review => {
        const stars = Array(5).fill(0).map((_, i) =>
            `<i class="fas fa-star ${i < review.rating ? 'text-yellow-400' : 'text-gray-300'}"></i>`
        ).join('');

        return `
        <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
            <td class="p-4 font-medium">${review.userName}</td>
            <td class="p-4"><div class="flex gap-1 text-sm">${stars}</div></td>
            <td class="p-4 text-gray-600 dark:text-gray-400 truncate max-w-xs">${review.text}</td>
            <td class="p-4 text-gray-500 text-sm">${formatDate(review.createdAt)}</td>
            <td class="p-4 text-right">
                <button onclick="window.deleteReviewHandler('${review.id}')" class="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition" title="Удалить">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `}).join('');
}

window.deleteReviewHandler = async (id) => {
    if (confirm('Вы уверены, что хотите удалить этот отзыв?')) {
        try {
            await deleteReview(id);
            showToast('Отзыв удален', 'success');
            await loadAdminReviews();
        } catch (error) {
            console.error(error);
            showToast('Ошибка при удалении', 'error');
        }
    }
};

function initChart() {
    const ctx = document.getElementById('viewsChart');
    if (!ctx) return;

    // Mock data for chart based on posts
    const labels = postsData.slice(0, 5).map(p => p.title.substring(0, 10) + '...');
    const data = postsData.slice(0, 5).map(p => p.views || 0);

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.length ? labels : ['Нет данных'],
            datasets: [{
                label: 'Просмотры',
                data: data.length ? data : [0],
                backgroundColor: '#3b82f6',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

function setupEditor() {
    simplemde = new SimpleMDE({ element: document.getElementById("post-content"), spellChecker: false });

    // Auto-save draft to localStorage
    simplemde.codemirror.on("change", () => {
        if (!document.getElementById('post-id').value) {
            localStorage.setItem('post_draft', simplemde.value());
        }
    });

    document.getElementById('create-post-btn').addEventListener('click', () => {
        document.getElementById('post-id').value = '';
        document.getElementById('post-title').value = '';
        document.getElementById('post-description').value = '';
        document.getElementById('post-image').value = '';
        document.getElementById('post-image-file').value = '';
        document.getElementById('post-tags').value = '';
        simplemde.value(localStorage.getItem('post_draft') || '');

        document.getElementById('editor-title').innerText = 'Создание поста';
        showView('editor-view');
    });

    document.getElementById('cancel-edit-btn').addEventListener('click', () => {
        showView('posts-view');
    });

    document.getElementById('save-post-btn').addEventListener('click', async () => {
        if (!document.getElementById('post-form').checkValidity()) {
            document.getElementById('post-form').reportValidity();
            return;
        }

        const id = document.getElementById('post-id').value;
        const title = document.getElementById('post-title').value.trim();
        const description = document.getElementById('post-description').value.trim();
        let imageUrl = document.getElementById('post-image').value.trim();
        const imageFile = document.getElementById('post-image-file').files[0];
        const tagsStr = document.getElementById('post-tags').value.trim();
        const content = simplemde.value().trim();

        if (imageUrl && !imageUrl.startsWith('http://') && !imageUrl.startsWith('https://') && !imageUrl.startsWith('data:')) {
            imageUrl = 'https://' + imageUrl;
            document.getElementById('post-image').value = imageUrl;
        }

        if (!title || !content) {
            showToast('Заголовок и содержание обязательны', 'error');
            return;
        }

        const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(t => t) : [];
        const btn = document.getElementById('save-post-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Сохранение...';

        try {
            if (imageFile && storage) {
                const storageRef = ref(storage, `posts/${Date.now()}_${imageFile.name}`);

                try {
                    const snapshot = await uploadBytes(storageRef, imageFile);
                    imageUrl = await getDownloadURL(snapshot.ref);
                } catch (uploadError) {
                    console.error('Upload error:', uploadError);
                    throw new Error(uploadError.message || 'Ошибка загрузки изображения. Попробуйте позже.');
                }
            }

            const postData = { title, description, imageUrl, tags, content };

            if (id) {
                await updatePost(id, postData);
                showToast('Пост обновлен', 'success');
            } else {
                await createPost(postData);
                showToast('Пост создан', 'success');
                localStorage.removeItem('post_draft');
            }
            await loadAdminPosts();
            showView('posts-view');
        } catch (error) {
            console.error(error);
            showToast(error.message || 'Ошибка при сохранении', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Сохранить';
        }
    });
}

function showView(viewId) {
    document.querySelectorAll('.view-section').forEach(view => view.classList.add('hidden'));
    document.getElementById(viewId).classList.remove('hidden');
}

// Global handlers for inline onclick
window.editPost = (id) => {
    const post = postsData.find(p => p.id === id);
    if (!post) return;

    document.getElementById('post-id').value = post.id;
    document.getElementById('post-title').value = post.title;
    document.getElementById('post-description').value = post.description || '';
    document.getElementById('post-image').value = post.imageUrl || '';
    document.getElementById('post-image-file').value = '';
    document.getElementById('post-tags').value = (post.tags || []).join(', ');
    simplemde.value(post.content);

    document.getElementById('editor-title').innerText = 'Редактирование поста';
    showView('editor-view');
};

window.deletePostHandler = async (id) => {
    if (confirm('Вы уверены, что хотите удалить этот пост?')) {
        try {
            await deletePost(id);
            showToast('Пост удален', 'success');
            await loadAdminPosts();
        } catch (error) {
            console.error(error);
            showToast('Ошибка при удалении', 'error');
        }
    }
};

window.deleteCommentHandler = async (id) => {
    if (confirm('Удалить комментарий?')) {
        try {
            await deleteComment(id);
            showToast('Комментарий удален', 'success');
            await loadAdminComments();
        } catch (error) {
            console.error(error);
            showToast('Ошибка при удалении', 'error');
        }
    }
};

// Simple MD5 implementation for Gravatar
function md5(string) {
    // This is a placeholder. In a real app, include a proper MD5 library via CDN.
    // For simplicity, we just return a dummy hash if no library is present.
    return '00000000000000000000000000000000';
}

// --- Settings Management ---

async function loadSettings() {
    if (!db) return;
    try {
        const snap = await getDoc(doc(db, 'settings', 'site'));
        if (snap.exists()) {
            const data = snap.data();
            document.getElementById('setting-hero-title').value = data.heroTitle || '';
            document.getElementById('setting-hero-subtitle').value = data.heroSubtitle || '';
            document.getElementById('setting-bot-link').value = data.botLink || '';
            document.getElementById('setting-channel-link').value = data.channelLink || '';
            document.getElementById('setting-footer-copy').value = data.footerCopy || '';
            document.getElementById('setting-footer-tg').value = data.footerTg || '';
            document.getElementById('setting-primary-color').value = data.primaryColor || '#3b82f6';

            // Stats
            document.getElementById('setting-stat-bots').value = data.statsBots || 0;
            document.getElementById('setting-stat-users').value = data.statsUsers || 0;
            document.getElementById('setting-stat-orders').value = data.statsOrders || 0;
        }
    } catch (e) {
        console.error('Error loading settings:', e);
        showToast('Ошибка загрузки настроек', 'error');
    }
}

function setupSettings() {
    const form = document.getElementById('settings-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('settings-save-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Сохранение...';

        const data = {
            heroTitle: document.getElementById('setting-hero-title').value.trim(),
            heroSubtitle: document.getElementById('setting-hero-subtitle').value.trim(),
            botLink: document.getElementById('setting-bot-link').value.trim(),
            channelLink: document.getElementById('setting-channel-link').value.trim(),
            footerCopy: document.getElementById('setting-footer-copy').value.trim(),
            footerTg: document.getElementById('setting-footer-tg').value.trim(),
            primaryColor: document.getElementById('setting-primary-color').value,

            // Stats
            statsBots: parseInt(document.getElementById('setting-stat-bots').value) || 0,
            statsUsers: parseInt(document.getElementById('setting-stat-users').value) || 0,
            statsOrders: parseInt(document.getElementById('setting-stat-orders').value) || 0,

            updatedAt: new Date().toISOString()
        };

        try {
            if (!db) throw new Error('Firebase не настроен');
            await setDoc(doc(db, 'settings', 'site'), data, { merge: true });
            showToast('Настройки сохранены!', 'success');
            // Apply primary color to admin panel too for consistency
            document.documentElement.style.setProperty('--primary-color', data.primaryColor);
        } catch (error) {
            console.error('Error saving settings:', error);
            showToast(error.message || 'Ошибка сохранения настроек', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Сохранить настройки';
        }
    });
}

// --- FAQ Management ---

let faqData = [];

async function loadAdminFaq() {
    if (!db) return;
    const list = document.getElementById('faq-admin-list');
    list.innerHTML = '<div class="text-center py-10 text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i> Загрузка...</div>';

    try {
        const q = query(collection(db, 'faq'), orderBy('order', 'asc'));
        const snap = await getDocs(q);
        faqData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (faqData.length === 0) {
            list.innerHTML = `
                <div class="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                    <p class="text-gray-500">Вопросов-ответов пока нет. Начните с первого!</p>
                </div>`;
            return;
        }

        list.innerHTML = faqData.map(item => `
            <div class="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 flex justify-between items-center group">
                <div>
                    <h4 class="font-bold flex items-center gap-2">
                        <span class="text-gray-400 font-mono text-xs">#${item.order}</span>
                        ${item.question}
                    </h4>
                    <p class="text-sm text-gray-500 line-clamp-3 mt-1">${item.answer}</p>
                </div>
                <div class="flex gap-2">
                    <button onclick="window.editFaq('${item.id}')" class="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition"><i class="fas fa-edit"></i></button>
                    <button onclick="window.deleteFaq('${item.id}')" class="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error(e);
        showToast('Ошибка загрузки FAQ', 'error');
    }
}

function setupFaqHandlers() {
    const btn = document.getElementById('add-faq-btn');
    const form = document.getElementById('faq-form');
    const modal = document.getElementById('faq-modal');

    if (btn) btn.onclick = () => {
        document.getElementById('faq-modal-title').innerText = 'Добавить вопрос';
        document.getElementById('faq-id').value = '';
        form.reset();
        modal.classList.remove('hidden');
    };

    window.editFaq = (id) => {
        const item = faqData.find(f => f.id === id);
        if (!item) return;
        document.getElementById('faq-modal-title').innerText = 'Редактировать вопрос';
        document.getElementById('faq-id').value = item.id;
        document.getElementById('faq-question').value = item.question;
        document.getElementById('faq-answer').value = item.answer;
        document.getElementById('faq-order').value = item.order || 0;
        modal.classList.remove('hidden');
    };

    window.deleteFaq = async (id) => {
        if (!confirm('Вы уверены, что хотите удалить этот вопрос?')) return;
        try {
            await deleteDoc(doc(db, 'faq', id));
            showToast('Вопрос удален', 'success');
            loadAdminFaq();
        } catch (e) {
            showToast('Ошибка при удалении', 'error');
        }
    };

    form.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('faq-id').value;
        const data = {
            question: document.getElementById('faq-question').value.trim(),
            answer: document.getElementById('faq-answer').value.trim(),
            order: parseInt(document.getElementById('faq-order').value) || 0
        };

        try {
            if (id) {
                await setDoc(doc(db, 'faq', id), data);
            } else {
                await addDoc(collection(db, 'faq'), data);
            }
            modal.classList.add('hidden');
            showToast('FAQ сохранено успешно!', 'success');
            loadAdminFaq();
        } catch (e) {
            showToast('Ошибка при сохранении', 'error');
        }
    };
}

// --- Roadmap Management ---

let roadmapData = [];

async function loadAdminRoadmap() {
    if (!db) return;
    const list = document.getElementById('roadmap-admin-list');
    list.innerHTML = '<div class="text-center py-10 text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i> Загрузка...</div>';

    try {
        const snap = await getDocs(collection(db, 'roadmap'));
        roadmapData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (roadmapData.length === 0) {
            list.innerHTML = `
                <div class="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                    <p class="text-gray-500">План развития пуст. Время строить будущее!</p>
                </div>`;
            return;
        }

        list.innerHTML = roadmapData.map(item => `
            <div class="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 flex justify-between items-center group">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="px-2 py-0.5 rounded text-[10px] uppercase font-bold ${item.status === 'done' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' :
                item.status === 'doing' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' :
                    'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
            }">${item.status === 'done' ? 'Готово' : item.status === 'doing' ? 'В работе' : 'План'}</span>
                        <h4 class="font-bold">${item.title}</h4>
                    </div>
                    <p class="text-sm text-gray-500">${item.date}</p>
                    ${item.description ? `<p class="text-sm text-gray-400 line-clamp-3 mt-2">${item.description}</p>` : ''}
                </div>
                <div class="flex gap-2">
                    <button onclick="window.editRoadmap('${item.id}')" class="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition"><i class="fas fa-edit"></i></button>
                    <button onclick="window.deleteRoadmap('${item.id}')" class="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error(e);
        showToast('Ошибка загрузки Roadmap', 'error');
    }
}

function setupRoadmapHandlers() {
    const btn = document.getElementById('add-roadmap-btn');
    const form = document.getElementById('roadmap-form');
    const modal = document.getElementById('roadmap-modal');

    if (btn) btn.onclick = () => {
        document.getElementById('roadmap-modal-title').innerText = 'Добавить этап Roadmap';
        document.getElementById('roadmap-id').value = '';
        form.reset();
        modal.classList.remove('hidden');
    };

    window.editRoadmap = (id) => {
        const item = roadmapData.find(r => r.id === id);
        if (!item) return;
        document.getElementById('roadmap-modal-title').innerText = 'Редактировать этап';
        document.getElementById('roadmap-id').value = item.id;
        document.getElementById('roadmap-title').value = item.title;
        document.getElementById('roadmap-date').value = item.date;
        document.getElementById('roadmap-status').value = item.status;
        document.getElementById('roadmap-desc').value = item.description || '';
        modal.classList.remove('hidden');
    };

    window.deleteRoadmap = async (id) => {
        if (!confirm('Вы уверены, что хотите удалить этот этап?')) return;
        try {
            await deleteDoc(doc(db, 'roadmap', id));
            showToast('Этап удален', 'success');
            loadAdminRoadmap();
        } catch (e) {
            showToast('Ошибка при удалении', 'error');
        }
    };

    form.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('roadmap-id').value;
        const data = {
            title: document.getElementById('roadmap-title').value.trim(),
            date: document.getElementById('roadmap-date').value.trim(),
            status: document.getElementById('roadmap-status').value,
            description: document.getElementById('roadmap-desc').value.trim(),
            updatedAt: new Date().toISOString()
        };

        try {
            if (id) {
                await setDoc(doc(db, 'roadmap', id), data);
            } else {
                await addDoc(collection(db, 'roadmap'), data);
            }
            modal.classList.add('hidden');
            showToast('Roadmap успешно обновлен!', 'success');
            loadAdminRoadmap();
        } catch (e) {
            showToast('Ошибка при сохранении', 'error');
        }
    };
}
// --- Documentation Management ---

let docsData = [];
let docsEditor;

async function loadAdminDocs() {
    if (!db) return;
    const list = document.getElementById('docs-admin-list');
    list.innerHTML = '<div class="col-span-full text-center py-10 text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i> Загрузка...</div>';

    try {
        const q = query(collection(db, 'docs'), orderBy('order', 'asc'));
        const snap = await getDocs(q);
        docsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (docsData.length === 0) {
            list.innerHTML = `
                <div class="col-span-full text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                    <p class="text-gray-500">Документация пуста. Создайте свой первый гайд!</p>
                </div>`;
            return;
        }

        list.innerHTML = docsData.map(item => `
            <div class="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-100 dark:border-gray-700 group hover:shadow-md transition-all">
                <div class="flex justify-between items-start mb-2">
                    <span class="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">${item.category || 'Общее'}</span>
                    <div class="flex gap-2">
                        <button onclick="window.editDoc('${item.id}')" class="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition"><i class="fas fa-edit"></i></button>
                        <button onclick="window.deleteDoc('${item.id}')" class="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                <h4 class="font-bold text-lg mb-1">${item.title}</h4>
                <p class="text-sm text-gray-500 line-clamp-2">${(item.content || '').substring(0, 100)}...</p>
            </div>
        `).join('');
    } catch (e) {
        console.error(e);
        showToast('Ошибка загрузки документации', 'error');
    }
}

function setupDocsHandlers() {
    const btn = document.getElementById('add-doc-btn');
    const form = document.getElementById('doc-form');
    const modal = document.getElementById('doc-modal');

    // Initialize Markdown editor for docs if not exists
    if (!docsEditor) {
        docsEditor = new SimpleMDE({
            element: document.getElementById('doc-content-editor'),
            spellChecker: false,
            placeholder: "Начните писать гайд...",
            status: false,
            autosave: { enabled: false }
        });
    }

    if (btn) btn.onclick = () => {
        document.getElementById('doc-modal-title').innerText = 'Создать статью';
        document.getElementById('doc-id').value = '';
        form.reset();
        docsEditor.value('');
        modal.classList.remove('hidden');
    };

    window.editDoc = (id) => {
        const item = docsData.find(d => d.id === id);
        if (!item) return;
        document.getElementById('doc-modal-title').innerText = 'Редактировать статью';
        document.getElementById('doc-id').value = item.id;
        document.getElementById('doc-title').value = item.title;
        document.getElementById('doc-category').value = item.category || '';
        document.getElementById('doc-order').value = item.order || 0;
        docsEditor.value(item.content || '');
        modal.classList.remove('hidden');
    };

    window.deleteDoc = async (id) => {
        if (!confirm('Вы уверены, что хотите удалить эту статью?')) return;
        try {
            await deleteDoc(doc(db, 'docs', id));
            showToast('Статья удалена', 'success');
            loadAdminDocs();
        } catch (e) {
            showToast('Ошибка при удалении', 'error');
        }
    };

    form.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('doc-id').value;
        const data = {
            title: document.getElementById('doc-title').value.trim(),
            category: document.getElementById('doc-category').value.trim() || 'Общее',
            order: parseInt(document.getElementById('doc-order').value) || 0,
            content: docsEditor.value(),
            updatedAt: new Date().toISOString()
        };

        try {
            if (id) {
                await setDoc(doc(db, 'docs', id), data);
            } else {
                await addDoc(collection(db, 'docs'), data);
            }
            modal.classList.add('hidden');
            showToast('Статья успешно сохранена!', 'success');
            loadAdminDocs();
        } catch (e) {
            showToast('Ошибка при сохранении', 'error');
        }
    };
}
// --- Support Management ---

let ticketsData = [];

async function loadAdminTickets() {
    if (!db) return;
    const list = document.getElementById('tickets-list');
    list.innerHTML = '<div class="text-center py-10 text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i> Загрузка тикетов...</div>';

    try {
        const q = query(collection(db, 'tickets'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        ticketsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (ticketsData.length === 0) {
            list.innerHTML = '<div class="text-center py-10 text-gray-500">Запросов пока нет.</div>';
            return;
        }

        list.innerHTML = ticketsData.map(ticket => `
            <div class="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-100 dark:border-gray-700 group hover:shadow-md transition-all">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div class="flex-grow">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="px-2 py-0.5 rounded text-[10px] uppercase font-bold ${ticket.status === 'open' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}">
                                ${ticket.status === 'open' ? 'Открыт' : 'Закрыт'}
                            </span>
                            <span class="text-xs text-gray-400">${formatDate(ticket.createdAt)}</span>
                        </div>
                        <h4 class="font-bold text-lg">${ticket.subject}</h4>
                        <p class="text-sm text-gray-500">${ticket.userName} (${ticket.userEmail})</p>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="window.viewTicket('${ticket.id}')" class="px-4 py-2 border border-blue-500 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition text-sm font-medium">Смотреть</button>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error(e);
        showToast('Ошибка загрузки тикетов', 'error');
    }
}

window.viewTicket = (id) => {
    const ticket = ticketsData.find(t => t.id === id);
    if (!ticket) return;

    const modal = document.getElementById('ticket-modal');
    const details = document.getElementById('ticket-details');
    const closeBtn = document.getElementById('close-ticket-btn');

    details.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl">
            <div>
                <label class="block text-xs text-gray-400 uppercase font-bold mb-1">Пользователь</label>
                <div class="font-medium">${ticket.userName}</div>
                <div class="text-sm text-gray-500">${ticket.userEmail}</div>
            </div>
            <div>
                <label class="block text-xs text-gray-400 uppercase font-bold mb-1">Категория</label>
                <div class="font-medium capitalize">${ticket.category}</div>
                <div class="text-xs text-gray-400">${id}</div>
            </div>
        </div>
        <div>
            <label class="block text-xs text-gray-400 uppercase font-bold mb-1">Тема</label>
            <div class="text-xl font-bold">${ticket.subject}</div>
        </div>
        <div>
            <label class="block text-xs text-gray-400 uppercase font-bold mb-1">Сообщение</label>
            <div class="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-700 whitespace-pre-line leading-relaxed">
                ${ticket.message}
            </div>
        </div>
        <div class="text-xs text-gray-400">
            Создан: ${formatDate(ticket.createdAt)}
        </div>
    `;

    closeBtn.onclick = async () => {
        if (!confirm('Вы уверены, что хотите закрыть этот тикет?')) return;
        try {
            await setDoc(doc(db, 'tickets', id), { status: 'closed' }, { merge: true });
            showToast('Тикет закрыт', 'success');
            modal.classList.add('hidden');
            loadAdminTickets();
        } catch (e) {
            showToast('Ошибка при закрытии тикета', 'error');
        }
    };

    modal.classList.remove('hidden');
};
