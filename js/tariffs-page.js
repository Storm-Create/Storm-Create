import { getTariffs } from './tariffs.js';
import { formatDate, showToast, initTheme } from './ui.js';
import { db, currentUser } from './firebase.js';
import { addDoc, collection, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Default tariffs if none in database
const defaultTariffs = [
    {
        id: 'basic',
        name: 'Базовый',
        description: 'Идеально для старта',
        price: 1500,
        features: ['Без рекламы', 'До 50 товаров', 'Базовая поддержка'],
        isPopular: false,
        productsLimit: 50
    },
    {
        id: 'pro',
        name: 'Pro',
        description: 'Для растущих продаж',
        price: 2300,
        features: ['Без рекламы', 'До 500 товаров', 'Кнопки в магазине', '1 кастомный домен'],
        isPopular: true,
        productsLimit: 500
    },
    {
        id: 'ultra',
        name: 'Ultra',
        description: 'Максимум возможностей',
        price: 3000,
        features: ['Безлимит товаров', 'Безлимит доменов', 'Чеки PDF', 'Приоритетная поддержка', 'API доступ'],
        isPopular: false,
        productsLimit: 0
    }
];

async function initTariffsPage() {
    initTheme();
    loadTariffs();
    setupSupportForm();
}

async function loadTariffs() {
    const grid = document.getElementById('tariffs-grid');

    try {
        const tariffs = await getTariffs();
        const tariffsToShow = tariffs.length > 0 ? tariffs : defaultTariffs;

        renderTariffs(tariffsToShow);
    } catch (error) {
        console.error('Error loading tariffs:', error);
        renderTariffs(defaultTariffs);
    }
}

function renderTariffs(tariffs) {
    const grid = document.getElementById('tariffs-grid');
    const billingPeriod = parseInt(document.getElementById('billing-period')?.value || 1);

    const discount = billingPeriod === 3 ? 0.95 : billingPeriod === 6 ? 0.90 : billingPeriod === 12 ? 0.80 : 1;
    const periodLabel = billingPeriod === 1 ? 'руб/мес' : billingPeriod === 3 ? 'руб/мес' : billingPeriod === 6 ? 'руб/мес' : 'руб/мес';
    const periodText = billingPeriod > 1 ? `за ${billingPeriod} мес` : '';

    grid.innerHTML = tariffs.map((tariff, index) => {
        const monthlyPrice = Math.round(tariff.price * discount);
        const totalPrice = monthlyPrice * billingPeriod;

        const features = tariff.features || defaultTariffs[index]?.features || [];
        const isPopular = tariff.isPopular || defaultTariffs[index]?.isPopular || false;

        const planId = tariff.id || ['basic', 'pro', 'ultra'][index];

        return `
            <div class="bg-gray-50 dark:bg-gray-800 rounded-2xl shadow-sm p-8 border border-gray-200 dark:border-gray-700 relative flex flex-col hover:shadow-lg transition ${isPopular ? 'ring-2 ring-primary transform md:-translate-y-4' : ''}">
                ${isPopular ? `
                    <div class="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-blue-400 to-blue-600 text-white px-4 py-1 rounded-full text-sm font-bold shadow-lg whitespace-nowrap">
                        Популярный
                    </div>
                ` : ''}
                <h3 class="text-xl font-bold mb-2">${escapeHtml(tariff.name)}</h3>
                <p class="text-gray-500 text-sm mb-6">${escapeHtml(tariff.description)}</p>
                <div class="mb-6">
                    <span class="text-4xl font-bold">${totalPrice}</span>
                    <span class="text-gray-500"> ${periodLabel}</span>
                    ${billingPeriod > 1 ? `<div class="text-sm text-gray-400">${monthlyPrice} × ${billingPeriod} мес</div>` : ''}
                </div>
                <ul class="space-y-4 mb-8 flex-1">
                    ${features.map(feature => `
                        <li class="flex items-center">
                            <i class="fas fa-check text-green-500 mr-3"></i> ${escapeHtml(feature)}
                        </li>
                    `).join('')}
                </ul>
                <a href="https://t.me/stormcreatebot?start=plan${planId}" target="_blank"
                    class="block w-full py-3 rounded-lg font-medium ${isPopular ? 'bg-primary text-white hover:bg-blue-600' : 'border-2 border-primary text-primary hover:bg-primary hover:text-white'} transition text-center">
                    Выбрать
                </a>
            </div>
        `;
    }).join('');
}

window.updatePricing = function () {
    loadTariffs();
};

// Support form functionality
function setupSupportForm() {
    const form = document.getElementById('support-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const btn = document.getElementById('support-submit-btn');
        const data = {
            userName: currentUser?.displayName || currentUser?.email || 'Гость',
            userEmail: currentUser?.email || 'Не указан',
            category: document.getElementById('support-category').value,
            subject: document.getElementById('support-subject').value.trim(),
            message: document.getElementById('support-message').value.trim(),
            status: 'open',
            createdAt: new Date()
        };

        if (!data.subject || !data.message) {
            showToast('Пожалуйста, заполните все поля', 'error');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Отправка...';

        try {
            await addDoc(collection(db, 'tickets'), data);
            showToast('Тикет успешно отправлен! Мы свяжемся с вами.', 'success');
            form.reset();
            window.closeSupportModal();
        } catch (error) {
            console.error('Error creating ticket:', error);
            showToast('Ошибка при отправке тикета', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Отправить тикет';
        }
    });
}

window.openSupportModal = () => {
    if (!currentUser) {
        window.openAuthModal?.('login');
        return;
    }
    const modal = document.getElementById('support-modal');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
    }, 10);
    document.body.style.overflow = 'hidden';
};

window.closeSupportModal = () => {
    const modal = document.getElementById('support-modal');
    modal.classList.add('opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }, 300);
};

// Close modal on outside click
document.addEventListener('click', (e) => {
    const modal = document.getElementById('support-modal');
    if (e.target === modal) {
        window.closeSupportModal();
    }
});

// Close modal on Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.closeSupportModal();
    }
});

document.addEventListener('DOMContentLoaded', initTariffsPage);
