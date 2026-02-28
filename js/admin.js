import { checkAuth, login, logout } from './auth.js';
import { getPosts, createPost, updatePost, deletePost } from './posts.js';
import { getAllComments, deleteComment, replyToComment } from './comments.js';
import { getReviews, deleteReview } from './reviews.js';
import { getTariffs, saveTariff, deleteTariff } from './tariffs.js';
import { getTariffSections, saveTariffSection, deleteTariffSection, addProductToSection, updateProductInSection, deleteProductFromSection, initDefaultSections } from './tariff-sections.js';
import { showToast, formatDate, initTheme } from './ui.js';
import { storage, db } from './firebase.js';
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc, addDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Mobile sidebar functionality
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function initMobileSidebar() {
    const sidebarToggle = document.getElementById('mobile-sidebar-toggle');
    const sidebar = document.querySelector('#admin-dashboard aside');
    const backdrop = document.getElementById('sidebar-backdrop');
    const themeToggleMobile = document.getElementById('theme-toggle-mobile');

    if (!sidebarToggle || !sidebar) return;

    const openSidebar = () => {
        sidebar.classList.add('mobile-open');
        if (backdrop) backdrop.classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    const closeSidebar = () => {
        sidebar.classList.remove('mobile-open');
        if (backdrop) backdrop.classList.remove('active');
        document.body.style.overflow = '';
    };

    sidebarToggle.addEventListener('click', openSidebar);

    if (backdrop) {
        backdrop.addEventListener('click', closeSidebar);
    }

    // Close sidebar when clicking nav buttons on mobile
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (window.innerWidth < 768) {
                closeSidebar();
            }
        });
    });

    // Set ARIA attributes for accessibility
    if (backdrop) {
        backdrop.setAttribute('role', 'button');
        backdrop.setAttribute('aria-label', 'Закрыть меню');
        backdrop.setAttribute('tabindex', '-1');
    }
    sidebarToggle.setAttribute('aria-label', 'Открыть меню');
    sidebarToggle.setAttribute('aria-expanded', 'false');

    // Keyboard accessibility - close on ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar.classList.contains('mobile-open')) {
            closeSidebar();
            sidebarToggle.focus();
        }
    });

    // Focus trap inside sidebar when opened
    const openSidebarWithFocus = () => {
        openSidebar();
        const firstFocusable = sidebar.querySelector('a, button');
        if (firstFocusable) {
            setTimeout(() => firstFocusable.focus(), 100);
        }
        sidebarToggle.setAttribute('aria-expanded', 'true');
    };

    const closeSidebarWithFocus = () => {
        closeSidebar();
        sidebarToggle.focus();
        sidebarToggle.setAttribute('aria-expanded', 'false');
    };

    sidebarToggle.addEventListener('click', openSidebarWithFocus);
    if (backdrop) {
        backdrop.addEventListener('click', closeSidebarWithFocus);
    }

    // Mobile theme toggle - use existing initTheme from ui.js
    const themeToggleBtn = document.getElementById('theme-toggle');
    if (themeToggleMobile && themeToggleBtn) {
        themeToggleMobile.addEventListener('click', () => {
            themeToggleBtn.click();
        });
    }

    // Handle resize
    window.addEventListener('resize', () => {
        if (window.innerWidth >= 768) {
            closeSidebar();
        }
    });
}

let simplemde;
let postsData = [];
let commentsData = [];
let reviewsData = [];

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMobileSidebar();

    // Event delegation for table action buttons (XSS-safe)
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action][data-id]');
        if (!btn) return;

        const action = btn.dataset.action;
        const id = btn.dataset.id;

        switch (action) {
            case 'edit':
                window.editPost(id);
                break;
            case 'delete':
                window.deletePostHandler(id);
                break;
            case 'delete-comment':
                window.deleteCommentHandler(id);
                break;
            case 'reply-comment':
                window.replyToComment(id);
                break;
            case 'delete-review':
                window.deleteReviewHandler(id);
                break;
        }
    });

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
            startNotificationSystem();
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
            if (targetId === 'tariffs-view') loadAdminTariffs();
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
    await loadAdminTariffs();
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
            <td class="p-4 font-medium" data-label="Заголовок">${escapeHtml(post.title)}</td>
            <td class="p-4 text-gray-500" data-label="Дата">${formatDate(post.createdAt)}</td>
            <td class="p-4 text-gray-500" data-label="Просмотры">${post.views || 0}</td>
            <td class="p-4 text-right" data-label="Действия">
                <button data-action="edit" data-id="${escapeHtml(post.id)}" class="text-blue-500 hover:text-blue-700 mr-3"><i class="fas fa-edit"></i></button>
                <button data-action="delete" data-id="${escapeHtml(post.id)}" class="text-red-500 hover:text-red-700"><i class="fas fa-trash"></i></button>
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
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-gray-500">Нет комментариев</td></tr>`;
        return;
    }

    tbody.innerHTML = commentsData.map(comment => `
        <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
            <td class="p-4 font-medium" data-label="Автор">${escapeHtml(comment.author)}</td>
            <td class="p-4 text-gray-500 truncate max-w-xs" data-label="Текст">${escapeHtml(comment.text)}</td>
            <td class="p-4 text-gray-500" data-label="Дата">${formatDate(comment.createdAt)}</td>
            <td class="p-4 text-center" data-label="Ответ">
                ${comment.reply ?
            '<span class="text-green-500 text-xs"><i class="fas fa-check"></i> Отвечено</span>' :
            '<button data-action="reply-comment" data-id="' + escapeHtml(comment.id) + '" class="text-blue-500 hover:text-blue-700" title="Ответить"><i class="fas fa-reply"></i></button>'
        }
            </td>
            <td class="p-4 text-right" data-label="Действия">
                <button data-action="delete-comment" data-id="${escapeHtml(comment.id)}" class="text-red-500 hover:text-red-700 ml-2" title="Удалить"><i class="fas fa-trash"></i></button>
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
            <td class="p-4 font-medium" data-label="Автор">${escapeHtml(review.userName)}</td>
            <td class="p-4" data-label="Оценка"><div class="flex gap-1 text-sm">${stars}</div></td>
            <td class="p-4 text-gray-600 dark:text-gray-400 truncate max-w-xs" data-label="Текст">${escapeHtml(review.text)}</td>
            <td class="p-4 text-gray-500 text-sm" data-label="Дата">${formatDate(review.createdAt)}</td>
            <td class="p-4 text-right" data-label="Действия">
                <button data-action="delete-review" data-id="${escapeHtml(review.id)}" class="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition" title="Удалить">
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

// --- Tariffs Management ---
let tariffsData = [];
let tariffSectionsData = [];

async function loadAdminTariffs() {
    try {
        // Initialize default sections if needed
        await initDefaultSections();

        // Load new tariff sections
        tariffSectionsData = await getTariffSections();
        renderTariffSections();
    } catch (error) {
        console.error('Error loading tariff sections:', error);
        showToast('Ошибка при загрузке разделов тарифов', 'error');
    }
}

function renderTariffSections() {
    const container = document.getElementById('tariff-sections-container');
    if (!container) return;

    if (tariffSectionsData.length === 0) {
        container.innerHTML = `
            <div class="col-span-full text-center py-12 text-gray-500">
                <i class="fas fa-tags text-4xl mb-4"></i>
                <p>Нет разделов. Добавьте первый раздел.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = tariffSectionsData.map(section => {
        const products = section.products || [];
        const iconClass = section.icon || 'fa-tag';

        return `
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <!-- Section Header -->
                <div class="bg-gradient-to-r from-primary/10 to-purple-500/10 p-6 border-b border-gray-200 dark:border-gray-700">
                    <div class="flex justify-between items-start">
                        <div class="flex items-center gap-4">
                            <div class="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center text-2xl">
                                <i class="fas ${iconClass}"></i>
                            </div>
                            <div>
                                <h3 class="text-xl font-bold">${escapeHtml(section.name)}</h3>
                                <p class="text-gray-500 text-sm">${escapeHtml(section.description || 'Нет описания')}</p>
                            </div>
                        </div>
                        <div class="flex gap-2">
                            <button data-action="edit-section" data-id="${escapeHtml(section.id)}" class="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition text-sm">
                                <i class="fas fa-edit mr-1"></i>Изменить
                            </button>
                            <button data-action="delete-section" data-id="${escapeHtml(section.id)}" class="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition text-sm">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- Section Products -->
                <div class="p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h4 class="font-medium text-gray-700 dark:text-gray-300">Товары и услуги</h4>
                        <button data-action="add-product" data-section-id="${escapeHtml(section.id)}" class="px-3 py-1 bg-green-500 text-white rounded-lg hover:bg-green-600 transition text-sm">
                            <i class="fas fa-plus mr-1"></i>Добавить товар
                        </button>
                    </div>
                    
                    ${products.length > 0 ? `
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            ${products.map(product => `
                                <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 border ${product.isActive ? 'border-gray-200 dark:border-gray-600' : 'border-red-200 dark:border-red-800'} relative">
                                    ${!product.isActive ? '<span class="absolute top-2 right-2 text-xs bg-red-500 text-white px-2 py-1 rounded">Неактивен</span>' : ''}
                                    
                                    <div class="flex justify-between items-start mb-2">
                                        <h5 class="font-bold">${escapeHtml(product.name)}</h5>
                                        <span class="text-lg font-bold text-primary">${product.price} ₽</span>
                                    </div>
                                    
                                    <p class="text-sm text-gray-500 mb-3">${escapeHtml(product.description || '')}</p>
                                    
                                    <div class="flex items-center gap-2 mb-3">
                                        ${product.paymentType === 'subscription' ?
                `<span class="text-xs bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 px-2 py-1 rounded">
                                                <i class="fas fa-redo mr-1"></i>Подписка ${product.subscriptionPeriod} дн.
                                            </span>` :
                `<span class="text-xs bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400 px-2 py-1 rounded">
                                                <i class="fas fa-check mr-1"></i>Разовая покупка
                                            </span>`
            }
                                    </div>
                                    
                                    ${product.features && product.features.length > 0 ? `
                                        <ul class="text-xs text-gray-600 dark:text-gray-400 space-y-1 mb-3">
                                            ${product.features.map(f => `<li><i class="fas fa-check text-green-500 mr-1"></i>${escapeHtml(f)}</li>`).join('')}
                                        </ul>
                                    ` : ''}
                                    
                                    <div class="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                                        <button data-action="edit-product" data-section-id="${escapeHtml(section.id)}" data-product-id="${escapeHtml(product.id)}" class="flex-1 px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition text-xs">
                                            <i class="fas fa-edit mr-1"></i>Изменить
                                        </button>
                                        <button data-action="delete-product" data-section-id="${escapeHtml(section.id)}" data-product-id="${escapeHtml(product.id)}" class="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition text-xs">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <div class="text-center py-8 text-gray-500">
                            <i class="fas fa-box-open text-3xl mb-2"></i>
                            <p>Нет товаров в этом разделе</p>
                        </div>
                    `}
                </div>
            </div>
        `;
    }).join('');
}

// Toggle subscription period field visibility
window.toggleSubscriptionPeriod = function () {
    const paymentType = document.getElementById('product-payment-type').value;
    const periodContainer = document.getElementById('subscription-period-container');
    if (paymentType === 'subscription') {
        periodContainer.classList.remove('hidden');
    } else {
        periodContainer.classList.add('hidden');
    }
};

// Event handlers for tariff sections
document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action^="edit-section"], [data-action^="delete-section"], [data-action^="add-product"], [data-action^="edit-product"], [data-action^="delete-product"]');
    if (!btn) return;

    const action = btn.dataset.action;
    const sectionId = btn.dataset.sectionId;
    const productId = btn.dataset.productId;

    switch (action) {
        case 'edit-section':
            const section = tariffSectionsData.find(s => s.id === sectionId);
            if (section) {
                document.getElementById('section-id').value = section.id;
                document.getElementById('section-name').value = section.name || '';
                document.getElementById('section-icon').value = section.icon || 'fa-tag';
                document.getElementById('section-description').value = section.description || '';
                document.getElementById('section-sort-order').value = section.sortOrder || 1;
                document.getElementById('section-active').checked = section.isActive !== false;
                document.getElementById('section-form-modal').classList.remove('hidden');
                document.getElementById('section-name').focus();
            }
            break;

        case 'delete-section':
            if (confirm('Вы уверены, что хотите удалить этот раздел со всеми товарами?')) {
                deleteTariffSection(sectionId).then(() => {
                    showToast('Раздел удален', 'success');
                    loadAdminTariffs();
                }).catch(err => {
                    console.error(err);
                    showToast('Ошибка при удалении', 'error');
                });
            }
            break;

        case 'add-product':
            document.getElementById('product-section-id').value = sectionId;
            document.getElementById('product-id').value = '';
            document.getElementById('product-name').value = '';
            document.getElementById('product-price').value = '';
            document.getElementById('product-description').value = '';
            document.getElementById('product-payment-type').value = 'one-time';
            document.getElementById('product-subscription-period').value = '30';
            document.getElementById('product-features').value = '';
            document.getElementById('product-active').checked = true;
            document.getElementById('subscription-period-container').classList.add('hidden');
            document.getElementById('product-form-modal').classList.remove('hidden');
            document.getElementById('product-name').focus();
            break;

        case 'edit-product':
            const sec = tariffSectionsData.find(s => s.id === sectionId);
            const product = sec?.products?.find(p => p.id === productId);
            if (product) {
                document.getElementById('product-section-id').value = sectionId;
                document.getElementById('product-id').value = product.id;
                document.getElementById('product-name').value = product.name || '';
                document.getElementById('product-price').value = product.price || '';
                document.getElementById('product-description').value = product.description || '';
                document.getElementById('product-payment-type').value = product.paymentType || 'one-time';
                document.getElementById('product-subscription-period').value = product.subscriptionPeriod || '30';
                document.getElementById('product-features').value = (product.features || []).join(', ');
                document.getElementById('product-active').checked = product.isActive !== false;

                if (product.paymentType === 'subscription') {
                    document.getElementById('subscription-period-container').classList.remove('hidden');
                } else {
                    document.getElementById('subscription-period-container').classList.add('hidden');
                }

                document.getElementById('product-form-modal').classList.remove('hidden');
                document.getElementById('product-name').focus();
            }
            break;

        case 'delete-product':
            if (confirm('Вы уверены, что хотите удалить этот товар?')) {
                deleteProductFromSection(sectionId, productId).then(() => {
                    showToast('Товар удален', 'success');
                    loadAdminTariffs();
                }).catch(err => {
                    console.error(err);
                    showToast('Ошибка при удалении', 'error');
                });
            }
            break;
    }
});

// Section form handling
document.addEventListener('DOMContentLoaded', () => {
    const addSectionBtn = document.getElementById('add-section-btn');
    const cancelSectionBtn = document.getElementById('cancel-section-btn');
    const sectionForm = document.getElementById('section-form');

    if (addSectionBtn) {
        addSectionBtn.addEventListener('click', () => {
            document.getElementById('section-form').reset();
            document.getElementById('section-id').value = '';
            document.getElementById('section-active').checked = true;
            document.getElementById('section-sort-order').value = (tariffSectionsData.length + 1);
            document.getElementById('section-form-modal').classList.remove('hidden');
            document.getElementById('section-name').focus();
        });
    }

    if (cancelSectionBtn) {
        cancelSectionBtn.addEventListener('click', () => {
            document.getElementById('section-form-modal').classList.add('hidden');
            document.getElementById('section-form').reset();
        });
    }

    if (sectionForm) {
        sectionForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const section = {
                id: document.getElementById('section-id').value || null,
                name: document.getElementById('section-name').value,
                icon: document.getElementById('section-icon').value,
                description: document.getElementById('section-description').value,
                sortOrder: document.getElementById('section-sort-order').value,
                isActive: document.getElementById('section-active').checked
            };

            try {
                await saveTariffSection(section);
                showToast(section.id ? 'Раздел обновлен' : 'Раздел добавлен', 'success');
                document.getElementById('section-form-modal').classList.add('hidden');
                document.getElementById('section-form').reset();
                await loadAdminTariffs();
            } catch (error) {
                console.error(error);
                showToast('Ошибка при сохранении', 'error');
            }
        });
    }

    // Product form handling
    const cancelProductBtn = document.getElementById('cancel-product-btn');
    const productForm = document.getElementById('product-form');

    if (cancelProductBtn) {
        cancelProductBtn.addEventListener('click', () => {
            document.getElementById('product-form-modal').classList.add('hidden');
            document.getElementById('product-form').reset();
        });
    }

    if (productForm) {
        productForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const sectionId = document.getElementById('product-section-id').value;
            const productId = document.getElementById('product-id').value;
            const features = document.getElementById('product-features').value
                .split(',')
                .map(f => f.trim())
                .filter(f => f);

            const productData = {
                name: document.getElementById('product-name').value,
                price: document.getElementById('product-price').value,
                description: document.getElementById('product-description').value,
                paymentType: document.getElementById('product-payment-type').value,
                subscriptionPeriod: document.getElementById('product-subscription-period').value,
                features: features,
                isActive: document.getElementById('product-active').checked
            };

            try {
                if (productId) {
                    // Update existing product
                    await updateProductInSection(sectionId, productId, productData);
                    showToast('Товар обновлен', 'success');
                } else {
                    // Add new product
                    await addProductToSection(sectionId, {
                        ...productData,
                        id: `prod_${Date.now()}`
                    });
                    showToast('Товар добавлен', 'success');
                }
                document.getElementById('product-form-modal').classList.add('hidden');
                document.getElementById('product-form').reset();
                await loadAdminTariffs();
            } catch (error) {
                console.error(error);
                showToast('Ошибка при сохранении', 'error');
            }
        });
    }
});

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

window.replyToComment = (id) => {
    const comment = commentsData.find(c => c.id === id);
    if (!comment) return;

    // Создаем модальное окно динамически
    const modalHtml = `
        <div id="comment-reply-modal" class="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
            <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-lg w-full scale-animation">
                <h3 class="text-xl font-bold mb-4">Ответить на комментарий</h3>
                <div class="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg mb-4">
                    <div class="text-sm text-gray-500 mb-1">Комментарий от ${escapeHtml(comment.author)}:</div>
                    <p class="text-gray-700 dark:text-gray-300">${escapeHtml(comment.text)}</p>
                </div>
                <form id="reply-comment-form" class="space-y-4">
                    <input type="hidden" id="reply-comment-id" value="${escapeHtml(comment.id)}">
                    <div>
                        <label class="block text-sm font-medium mb-1">Ваш ответ</label>
                        <textarea id="reply-comment-text" required rows="4"
                            class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-primary outline-none"
                            placeholder="Напишите ваш ответ..."></textarea>
                    </div>
                    <div class="flex gap-3 justify-end">
                        <button type="button" onclick="document.getElementById('comment-reply-modal').remove()"
                            class="px-4 py-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Отмена</button>
                        <button type="submit" class="px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-600">Отправить ответ</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    // Удаляем старое модальное окно, если есть
    const existingModal = document.getElementById('comment-reply-modal');
    if (existingModal) existingModal.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Обработка отправки формы
    document.getElementById('reply-comment-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const commentId = document.getElementById('reply-comment-id').value;
        const replyText = document.getElementById('reply-comment-text').value.trim();

        if (!replyText) return;

        try {
            const adminName = document.getElementById('admin-email')?.textContent || 'Администратор';
            await replyToComment(commentId, adminName, replyText);
            showToast('Ответ отправлен!', 'success');
            document.getElementById('comment-reply-modal').remove();
            await loadAdminComments();
        } catch (error) {
            console.error(error);
            showToast('Ошибка при отправке ответа', 'error');
        }
    });
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
                        <h4 class="font-bold text-lg">${escapeHtml(ticket.subject)}</h4>
                        <p class="text-sm text-gray-500">${escapeHtml(ticket.userName)} (${escapeHtml(ticket.userEmail)})</p>
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

    // Отображение истории ответов
    const repliesHtml = ticket.replies && ticket.replies.length > 0 ? `
        <div class="mt-4">
            <label class="block text-xs text-gray-400 uppercase font-bold mb-2">История ответов</label>
            <div class="space-y-3">
                ${ticket.replies.map(reply => `
                    <div class="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border-l-4 border-blue-500">
                        <div class="flex items-center justify-between mb-1">
                            <span class="font-medium text-blue-600 dark:text-blue-400">${escapeHtml(reply.author)}</span>
                            <span class="text-xs text-gray-400">${formatDate(reply.createdAt)}</span>
                        </div>
                        <p class="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">${escapeHtml(reply.text)}</p>
                    </div>
                `).join('')}
            </div>
        </div>
    ` : '';

    details.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl">
            <div>
                <label class="block text-xs text-gray-400 uppercase font-bold mb-1">Пользователь</label>
                <div class="font-medium">${escapeHtml(ticket.userName)}</div>
                <div class="text-sm text-gray-500">${escapeHtml(ticket.userEmail)}</div>
            </div>
            <div>
                <label class="block text-xs text-gray-400 uppercase font-bold mb-1">Категория</label>
                <div class="font-medium capitalize">${escapeHtml(ticket.category)}</div>
                <div class="text-xs text-gray-400">${id}</div>
            </div>
        </div>
        <div>
            <label class="block text-xs text-gray-400 uppercase font-bold mb-1">Тема</label>
            <div class="text-xl font-bold">${escapeHtml(ticket.subject)}</div>
        </div>
        <div>
            <label class="block text-xs text-gray-400 uppercase font-bold mb-1">Сообщение</label>
            <div class="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-700 whitespace-pre-line leading-relaxed">
                ${escapeHtml(ticket.message)}
            </div>
        </div>
        ${repliesHtml}
        
        <!-- Форма ответа -->
        <div class="mt-4">
            <label class="block text-xs text-gray-400 uppercase font-bold mb-2">Ответить</label>
            <form id="ticket-reply-form" class="space-y-3">
                <textarea id="ticket-reply-text" required rows="3"
                    class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-primary outline-none"
                    placeholder="Напишите ваш ответ..."></textarea>
                <button type="submit" class="px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-600 transition text-sm font-medium">
                    <i class="fas fa-paper-plane mr-2"></i>Отправить ответ
                </button>
            </form>
        </div>
        
        <div class="text-xs text-gray-400 mt-4">
            Создан: ${formatDate(ticket.createdAt)}
        </div>
    `;

    // Обработка отправки формы ответа - удаляем старый обработчик, если есть
    const replyForm = document.getElementById('ticket-reply-form');
    const existingHandler = replyForm._submitHandler;
    if (existingHandler) {
        replyForm.removeEventListener('submit', existingHandler);
    }

    const handleReplySubmit = async (e) => {
        e.preventDefault();
        const replyText = document.getElementById('ticket-reply-text').value.trim();
        if (!replyText) return;

        const adminName = document.getElementById('admin-email')?.textContent || 'Администратор';
        const newReply = {
            text: replyText,
            author: adminName,
            createdAt: new Date()
        };

        const replies = ticket.replies || [];
        replies.push(newReply);

        try {
            await setDoc(doc(db, 'tickets', id), {
                replies: replies,
                status: 'pending',
                updatedAt: new Date()
            }, { merge: true });
            showToast('Ответ отправлен!', 'success');
            window.viewTicket(id); // Перезагрузить тикет
        } catch (e) {
            console.error(e);
            showToast('Ошибка при отправке ответа', 'error');
        }
    };

    replyForm._submitHandler = handleReplySubmit;
    replyForm.addEventListener('submit', handleReplySubmit);

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

// --- Notifications System ---
let lastTicketCount = 0;
let lastCommentCount = 0;
let notificationInterval = null;

// Добавить счетчик уведомлений в sidebar
function addNotificationBadge() {
    const ticketsNavBtn = document.querySelector('[data-target="tickets-view"]');
    const commentsNavBtn = document.querySelector('[data-target="comments-view"]');

    if (ticketsNavBtn && !document.getElementById('tickets-badge')) {
        const badge = document.createElement('span');
        badge.id = 'tickets-badge';
        badge.className = 'ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full hidden';
        ticketsNavBtn.appendChild(badge);
    }
    if (commentsNavBtn && !document.getElementById('comments-badge')) {
        const badge = document.createElement('span');
        badge.id = 'comments-badge';
        badge.className = 'ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full hidden';
        commentsNavBtn.appendChild(badge);
    }
}

// Проверить новые тикеты и комментарии
async function checkForNotifications() {
    if (!db) return;

    try {
        // Проверка тикетов
        const ticketsQ = query(collection(db, 'tickets'), orderBy('createdAt', 'desc'));
        const ticketsSnap = await getDocs(ticketsQ);
        const currentTicketCount = ticketsSnap.size;

        if (lastTicketCount > 0 && currentTicketCount > lastTicketCount) {
            const newTickets = currentTicketCount - lastTicketCount;
            showToast(`Новых тикетов: ${newTickets}`, 'info');

            // Обновить badge
            const badge = document.getElementById('tickets-badge');
            if (badge) {
                badge.textContent = newTickets;
                badge.classList.remove('hidden');
            }
        }
        lastTicketCount = currentTicketCount;

        // Проверка комментариев
        const commentsQ = query(collection(db, 'comments'), orderBy('createdAt', 'desc'));
        const commentsSnap = await getDocs(commentsQ);
        const currentCommentCount = commentsSnap.size;

        if (lastCommentCount > 0 && currentCommentCount > lastCommentCount) {
            const newComments = currentCommentCount - lastCommentCount;
            showToast(`Новых комментариев: ${newComments}`, 'info');

            // Обновить badge
            const badge = document.getElementById('comments-badge');
            if (badge) {
                badge.textContent = newComments;
                badge.classList.remove('hidden');
            }
        }
        lastCommentCount = currentCommentCount;

    } catch (e) {
        console.error('Error checking notifications:', e);
    }
}

// Запустить систему уведомлений
function startNotificationSystem() {
    addNotificationBadge();

    // Первоначальная проверка
    checkForNotifications().then(() => {
        // Установить интервал проверки (каждые 2 минуты)
        notificationInterval = setInterval(checkForNotifications, 120000);
    });
}

// Остановить систему уведомлений
function stopNotificationSystem() {
    if (notificationInterval) {
        clearInterval(notificationInterval);
        notificationInterval = null;
    }
}

// Экспортировать функции
window.startNotificationSystem = startNotificationSystem;
window.stopNotificationSystem = stopNotificationSystem;
