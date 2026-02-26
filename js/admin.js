import { checkAuth, login, logout } from './auth.js';
import { getPosts, createPost, updatePost, deletePost } from './posts.js';
import { getAllComments, deleteComment } from './comments.js';
import { getReviews, deleteReview } from './reviews.js';
import { showToast, formatDate, initTheme } from './ui.js';
import { storage } from './firebase.js';
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

let simplemde;
let postsData = [];
let commentsData = [];
let reviewsData = [];

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    
    checkAuth((user) => {
        const adminEmails = ['counterflug@stormcreate.com', 'andrewsker@stormcreate.com'];
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
        const id = document.getElementById('post-id').value;
        const title = document.getElementById('post-title').value.trim();
        const description = document.getElementById('post-description').value.trim();
        let imageUrl = document.getElementById('post-image').value.trim();
        const imageFile = document.getElementById('post-image-file').files[0];
        const tagsStr = document.getElementById('post-tags').value.trim();
        const content = simplemde.value().trim();

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
                
                const uploadPromise = uploadBytes(storageRef, imageFile);
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error("Превышено время ожидания загрузки. Проверьте VPN или подключение к интернету.")), 15000)
                );
                
                const snapshot = await Promise.race([uploadPromise, timeoutPromise]);
                imageUrl = await getDownloadURL(snapshot.ref);
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
