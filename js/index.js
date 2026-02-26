import { getPosts } from './posts.js';
import { formatDate, showToast } from './ui.js';
import { checkAuth, login, register, logout, updateUserProfile, loginWithTelegram } from './auth.js';
import { getReviews, addReview } from './reviews.js';
import { storage, db } from './firebase.js';
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let currentUser = null;
let currentAuthMode = 'login'; // 'login' or 'register'

async function loadLatestPosts() {
    const container = document.getElementById('latest-posts');
    try {
        const posts = await getPosts(3);

        if (posts.length === 0) {
            container.innerHTML = `<div class="col-span-3 text-center py-10 text-gray-500">Пока нет опубликованных постов.</div>`;
            return;
        }

        container.innerHTML = posts.map((post, index) => `
            <a href="post.html?id=${post.id}" class="group block bg-white dark:bg-gray-800 rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-700 hover:shadow-xl transition fade-in" style="transition-delay: ${index * 100}ms">
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

        // Trigger animations for new elements
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) entry.target.classList.add('visible');
            });
        }, { threshold: 0.1 });
        container.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

    } catch (error) {
        console.error("Error loading posts:", error);
        container.innerHTML = `<div class="col-span-3 text-center py-10 text-red-500">Ошибка при загрузке постов. Проверьте настройки Firebase.</div>`;
    }
}

// --- Auth Logic ---

function setupAuth() {
    checkAuth(async (user) => {
        if (user) {
            // Ensure profile data is fully loaded (fixes mobile email login)
            if (!user.displayName) {
                try {
                    await user.reload();
                    // Re-read from auth after reload
                    const { auth } = await import('./firebase.js');
                    user = auth.currentUser || user;
                } catch (e) {
                    console.warn('Could not reload user profile:', e);
                }
            }
        }
        currentUser = user;
        updateNavAuth();
        updateReviewSection();
    });

    const authForm = document.getElementById('auth-form');
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('auth-email').value;
            const password = document.getElementById('auth-password').value;
            const name = document.getElementById('auth-name').value;
            const btn = document.getElementById('auth-submit-btn');

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Загрузка...';

            try {
                if (currentAuthMode === 'login') {
                    await login(email, password);
                    showToast('Успешный вход', 'success');
                } else {
                    await register(email, password, name || 'Пользователь');
                    showToast('Успешная регистрация', 'success');
                }
                window.closeAuthModal();
            } catch (error) {
                console.error(error);
                showToast(error.message || 'Ошибка авторизации', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = currentAuthMode === 'login' ? 'Войти' : 'Зарегистрироваться';
            }
        });
    }
}

function updateNavAuth() {
    const navSection = document.getElementById('nav-auth-section');
    const mobileSection = document.getElementById('mobile-auth-section');

    if (!navSection || !mobileSection) return;

    if (currentUser) {
        // Simple check for admin email (you should ideally use Firebase Custom Claims for real security)
        const adminEmails = ['counterflug@stormcreate.com', 'andrewsker@stormcreate.com'];
        const isAdmin = adminEmails.includes(currentUser.email);
        const adminLink = isAdmin ? `<a href="admin.html" class="text-sm font-medium text-primary hover:text-blue-600 mr-4"><i class="fas fa-cog"></i> Админка</a>` : '';
        const mobileAdminLink = isAdmin ? `<a href="admin.html" class="block px-3 py-2 text-primary hover:text-blue-600 font-medium"><i class="fas fa-cog"></i> Админка</a>` : '';

        const avatarUrl = currentUser.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.displayName || currentUser.email)}&background=random`;
        const avatarImg = `<img src="${avatarUrl}" alt="Avatar" class="w-8 h-8 rounded-full border-2 border-primary object-cover inline-block mr-2">`;

        const html = `
            ${adminLink}
            <button onclick="window.openProfileModal()" class="flex items-center text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-primary mr-4">
                ${avatarImg} Профиль
            </button>
            <span class="text-sm text-gray-600 dark:text-gray-300 mr-2">${currentUser.displayName || currentUser.email}</span>
            <button onclick="window.logoutUser()" class="text-sm text-red-500 hover:text-red-600 font-medium">Выйти</button>
        `;
        const mobileHtml = `
            ${mobileAdminLink}
            <button onclick="window.openProfileModal()" class="w-full flex items-center text-left px-3 py-2 text-gray-700 dark:text-gray-200 hover:text-primary font-medium">
                ${avatarImg} Профиль
            </button>
            <span class="block px-3 py-2 text-sm text-gray-600 dark:text-gray-300">${currentUser.displayName || currentUser.email}</span>
            <button onclick="window.logoutUser()" class="w-full text-left px-3 py-2 text-red-500 hover:text-red-600 font-medium">Выйти</button>
        `;
        navSection.innerHTML = html;
        mobileSection.innerHTML = mobileHtml;
    } else {
        const html = `
            <button onclick="window.openAuthModal('login')" class="text-sm font-medium hover:text-primary transition">Войти</button>
            <button onclick="window.openAuthModal('register')" class="text-sm font-medium px-4 py-2 bg-primary text-white rounded-full hover:bg-blue-600 transition">Регистрация</button>
        `;
        const mobileHtml = `
            <button onclick="window.openAuthModal('login')" class="w-full text-left px-3 py-2 hover:text-primary font-medium">Войти</button>
            <button onclick="window.openAuthModal('register')" class="w-full text-left px-3 py-2 text-primary font-medium">Регистрация</button>
        `;
        navSection.innerHTML = html;
        mobileSection.innerHTML = mobileHtml;
    }
}

window.logoutUser = async () => {
    try {
        await logout();
        showToast('Вы вышли из аккаунта', 'info');
    } catch (e) {
        console.error(e);
    }
};

window.onTelegramAuth = async (user) => {
    try {
        showToast('Авторизация через Telegram...', 'info');
        await loginWithTelegram(user);
        showToast('Успешный вход через Telegram!', 'success');
        window.closeAuthModal();
    } catch (error) {
        console.error(error);
        showToast('Ошибка авторизации через Telegram', 'error');
    }
};

function renderTelegramWidget() {
    const container = document.getElementById('telegram-login-container');
    if (!container) return;
    container.innerHTML = '';
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', 'StormCreateBot'); // Replace with your actual bot username
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    script.setAttribute('data-request-access', 'write');
    container.appendChild(script);
}

window.openAuthModal = (mode = 'login') => {
    const modal = document.getElementById('auth-modal');
    modal.classList.remove('hidden');
    void modal.offsetWidth; // trigger reflow
    modal.classList.remove('opacity-0');
    window.switchAuthTab(mode);
    renderTelegramWidget();
};

window.closeAuthModal = () => {
    const modal = document.getElementById('auth-modal');
    modal.classList.add('opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
};

window.openProfileModal = () => {
    if (!currentUser) return;
    const modal = document.getElementById('profile-modal');
    document.getElementById('profile-name').value = currentUser.displayName || '';

    const avatarInput = document.getElementById('profile-avatar');
    if (avatarInput) avatarInput.value = ''; // clear file input

    const preview = document.getElementById('profile-avatar-preview');
    if (preview) {
        if (currentUser.photoURL) {
            preview.src = currentUser.photoURL;
            preview.classList.remove('hidden');
        } else {
            preview.src = '';
            preview.classList.add('hidden');
        }
    }

    modal.classList.remove('hidden');
    void modal.offsetWidth; // trigger reflow
    modal.classList.remove('opacity-0');
};

window.closeProfileModal = () => {
    const modal = document.getElementById('profile-modal');
    modal.classList.add('opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
};

function setupProfileForm() {
    const form = document.getElementById('profile-form');
    const avatarInput = document.getElementById('profile-avatar');
    const preview = document.getElementById('profile-avatar-preview');

    if (avatarInput && preview) {
        avatarInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    preview.src = e.target.result;
                    preview.classList.remove('hidden');
                };
                reader.readAsDataURL(file);
            }
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('profile-name').value.trim();
            const btn = document.getElementById('profile-submit-btn');

            if (!name) return;

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Сохранение...';

            try {
                let avatarUrl = currentUser.photoURL;
                const file = avatarInput && avatarInput.files.length > 0 ? avatarInput.files[0] : null;

                if (file) {
                    // Проверка размера файла (макс. 5 МБ)
                    if (file.size > 5 * 1024 * 1024) {
                        throw new Error('Файл слишком большой. Максимальный размер — 5 МБ.');
                    }

                    if (!storage) {
                        throw new Error('Хранилище не настроено. Невозможно загрузить аватар.');
                    }

                    const storageRef = ref(storage, `avatars/${currentUser.uid}_${Date.now()}_${file.name}`);

                    // Таймаут 15 секунд
                    const uploadPromise = uploadBytes(storageRef, file);
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error("Превышено время ожидания загрузки. Проверьте VPN или подключение к интернету.")), 15000)
                    );

                    let snapshot;
                    try {
                        snapshot = await Promise.race([uploadPromise, timeoutPromise]);
                    } catch (uploadError) {
                        console.error('Upload error:', uploadError);
                        throw new Error(uploadError.message || 'Ошибка загрузки аватара. Попробуйте позже.');
                    }
                    avatarUrl = await getDownloadURL(snapshot.ref);
                }

                await updateUserProfile(name, avatarUrl);

                // Force update currentUser locally
                if (currentUser) {
                    currentUser.displayName = name;
                    currentUser.photoURL = avatarUrl;
                }
                updateNavAuth(); // refresh UI
                updateReviewSection(); // refresh review form if open
                showToast('Профиль обновлен', 'success');
                window.closeProfileModal();
            } catch (error) {
                console.error(error);
                showToast(error.message || 'Ошибка при обновлении профиля', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = 'Сохранить';
            }
        });
    }
}

window.switchAuthTab = (mode) => {
    currentAuthMode = mode;
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const nameField = document.getElementById('name-field');
    const submitBtn = document.getElementById('auth-submit-btn');

    if (mode === 'login') {
        tabLogin.className = "flex-1 py-3 text-center font-medium text-primary border-b-2 border-primary";
        tabRegister.className = "flex-1 py-3 text-center font-medium text-gray-500 dark:text-gray-400 border-b-2 border-transparent hover:text-gray-700 dark:hover:text-gray-300";
        nameField.classList.add('hidden');
        document.getElementById('auth-name').required = false;
        submitBtn.innerText = 'Войти';
    } else {
        tabRegister.className = "flex-1 py-3 text-center font-medium text-primary border-b-2 border-primary";
        tabLogin.className = "flex-1 py-3 text-center font-medium text-gray-500 dark:text-gray-400 border-b-2 border-transparent hover:text-gray-700 dark:hover:text-gray-300";
        nameField.classList.remove('hidden');
        document.getElementById('auth-name').required = true;
        submitBtn.innerText = 'Зарегистрироваться';
    }
};

// --- Reviews Logic ---

async function loadReviews() {
    const container = document.getElementById('reviews-list');
    if (!container) return;

    try {
        const reviews = await getReviews();
        if (reviews.length === 0) {
            container.innerHTML = `<div class="col-span-full text-center py-10 text-gray-500">Пока нет отзывов. Будьте первым!</div>`;
            return;
        }

        container.innerHTML = reviews.map(review => {
            const stars = Array(5).fill(0).map((_, i) =>
                `<i class="fas fa-star ${i < review.rating ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'}"></i>`
            ).join('');

            return `
            <div class="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition">
                <div class="flex items-center gap-4 mb-4">
                    <div class="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-xl">
                        ${review.userName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h4 class="font-bold text-gray-900 dark:text-white">${review.userName}</h4>
                        <div class="text-sm text-gray-500">${formatDate(review.createdAt)}</div>
                    </div>
                </div>
                <div class="flex gap-1 mb-3 text-sm">
                    ${stars}
                </div>
                <p class="text-gray-700 dark:text-gray-300">${review.text}</p>
            </div>
            `;
        }).join('');
    } catch (e) {
        console.error(e);
        container.innerHTML = `<div class="col-span-full text-center py-10 text-red-500">Ошибка загрузки отзывов.</div>`;
    }
}

function updateReviewSection() {
    const formContainer = document.getElementById('review-form-container');
    const authPrompt = document.getElementById('review-auth-prompt');

    if (!formContainer || !authPrompt) return;

    if (currentUser) {
        formContainer.classList.remove('hidden');
        authPrompt.classList.add('hidden');
    } else {
        formContainer.classList.add('hidden');
        authPrompt.classList.remove('hidden');
    }
}

function setupReviewForm() {
    const stars = document.querySelectorAll('#star-rating i');
    const ratingInput = document.getElementById('review-rating');

    stars.forEach(star => {
        star.addEventListener('click', (e) => {
            const rating = parseInt(e.target.getAttribute('data-rating'));
            ratingInput.value = rating;

            stars.forEach((s, index) => {
                if (index < rating) {
                    s.classList.remove('text-gray-300');
                    s.classList.add('text-yellow-400');
                } else {
                    s.classList.remove('text-yellow-400');
                    s.classList.add('text-gray-300');
                }
            });
        });
    });

    const form = document.getElementById('review-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentUser) return;

            const text = document.getElementById('review-text').value.trim();
            const rating = document.getElementById('review-rating').value;
            const btn = form.querySelector('button[type="submit"]');

            if (!text) return;

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Отправка...';

            try {
                await addReview(currentUser.uid, currentUser.displayName || currentUser.email.split('@')[0], text, rating);
                showToast('Отзыв успешно добавлен!', 'success');
                document.getElementById('review-text').value = '';
                loadReviews();
            } catch (error) {
                console.error(error);
                showToast('Ошибка при добавлении отзыва', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = 'Отправить отзыв';
            }
        });
    }
}

window.updatePricing = () => {
    const period = parseInt(document.getElementById('billing-period').value);
    let discount = 0;
    if (period === 3) discount = 0.05;
    if (period === 6) discount = 0.10;
    if (period === 12) discount = 0.20;

    const basePrices = { basic: 1500, pro: 2300, ultra: 3000 };

    const label = period === 1 ? 'руб/мес' : `руб за ${period} мес`;

    document.getElementById('price-basic').innerText = Math.round(basePrices.basic * (1 - discount) * period);
    document.getElementById('price-pro').innerText = Math.round(basePrices.pro * (1 - discount) * period);
    document.getElementById('price-ultra').innerText = Math.round(basePrices.ultra * (1 - discount) * period);

    document.getElementById('price-label-basic').innerText = label;
    document.getElementById('price-label-pro').innerText = label;
    document.getElementById('price-label-ultra').innerText = label;
};

document.addEventListener('DOMContentLoaded', () => {
    loadLatestPosts();
    setupAuth();
    loadReviews();
    setupReviewForm();
    setupProfileForm();
    loadSiteSettings();
});

async function loadSiteSettings() {
    if (!db) return;
    try {
        const snap = await getDoc(doc(db, 'settings', 'site'));
        if (!snap.exists()) return;
        const s = snap.data();

        if (s.heroTitle) {
            const el = document.getElementById('hero-title-text');
            if (el) el.textContent = s.heroTitle;
        }
        if (s.heroSubtitle) {
            const el = document.getElementById('hero-subtitle-text');
            if (el) el.textContent = s.heroSubtitle;
        }
        if (s.botLink) {
            const el = document.getElementById('hero-bot-link');
            if (el) el.href = s.botLink;
        }
        if (s.channelLink) {
            const el = document.getElementById('hero-channel-link');
            if (el) el.href = s.channelLink;
        }
        if (s.footerCopy) {
            const el = document.getElementById('footer-copyright');
            if (el) el.textContent = s.footerCopy;
        }
        if (s.footerTg) {
            const el = document.getElementById('footer-tg-link');
            if (el) el.href = s.footerTg;
        }
    } catch (e) {
        console.warn('Could not load site settings:', e);
    }
}
