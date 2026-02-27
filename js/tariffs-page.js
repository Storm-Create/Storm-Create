import { getTariffSections } from './tariff-sections.js';
import { formatDate, showToast, initTheme } from './ui.js';
import { db } from './firebase.js';
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
    const grid = document.getElementById('tariff-sections-public');

    try {
        const sections = await getTariffSections();
        renderTariffSections(sections);
    } catch (error) {
        console.error('Error loading tariffs:', error);
        renderDefaultTariffs();
    }
}

function renderTariffSections(sections) {
    const container = document.getElementById('tariff-sections-public');
    const billingPeriod = parseInt(document.getElementById('billing-period')?.value || 1);

    const discount = billingPeriod === 3 ? 0.95 : billingPeriod === 6 ? 0.90 : billingPeriod === 12 ? 0.80 : 1;
    const periodLabel = billingPeriod === 1 ? 'руб/мес' : 'руб';
    const periodText = billingPeriod > 1 ? `за ${billingPeriod} мес` : '';

    if (!sections || sections.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10 text-gray-500">
                <i class="fas fa-tags text-4xl mb-4"></i>
                <p>Тарифы скоро появятся</p>
            </div>
        `;
        return;
    }

    container.innerHTML = sections.map((section, sectionIndex) => {
        const products = section.products || [];
        const activeProducts = products.filter(p => p.isActive !== false);
        const iconClass = section.icon || 'fa-tag';

        if (activeProducts.length === 0) return '';

        return `
            <div class="tariff-section fade-in" style="animation-delay: ${sectionIndex * 0.1}s">
                <div class="text-center mb-8">
                    <div class="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-2xl mb-4">
                        <i class="fas ${iconClass} text-2xl text-primary"></i>
                    </div>
                    <h3 class="text-2xl font-bold mb-2">${escapeHtml(section.name)}</h3>
                    <p class="text-gray-500 dark:text-gray-400 max-w-xl mx-auto">${escapeHtml(section.description || '')}</p>
                </div>
                
                <div class="grid md:grid-cols-2 lg:grid-cols-${Math.min(activeProducts.length, 3)} gap-6">
                    ${activeProducts.map((product, index) => {
            const basePrice = product.price || 0;
            const discountedPrice = Math.round(basePrice * discount);
            const totalPrice = discountedPrice * billingPeriod;
            const isSubscription = product.paymentType === 'subscription';
            const periodDays = product.subscriptionPeriod || 30;
            const isPopular = index === 0 && sectionIndex === 0;
            const features = product.features || [];
            const productLink = `https://t.me/stormcreatebot?start=product${product.id}`;

            return `
                            <div class="bg-gray-50 dark:bg-gray-800 rounded-2xl shadow-sm p-6 border border-gray-200 dark:border-gray-700 relative flex flex-col hover:shadow-lg transition ${isPopular ? 'ring-2 ring-primary transform md:-translate-y-2' : ''}">
                                ${isPopular ? `
                                    <div class="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-blue-400 to-blue-600 text-white px-4 py-1 rounded-full text-sm font-bold shadow-lg whitespace-nowrap">
                                        Популярный
                                    </div>
                                ` : ''}
                                
                                <h4 class="text-lg font-bold mb-2">${escapeHtml(product.name)}</h4>
                                <p class="text-gray-500 text-sm mb-4">${escapeHtml(product.description || '')}</p>
                                
                                <div class="mb-4">
                                    <span class="text-3xl font-bold">${totalPrice}</span>
                                    <span class="text-gray-500"> ${periodLabel}</span>
                                    ${billingPeriod > 1 ? `<div class="text-sm text-gray-400">${discountedPrice} × ${billingPeriod} мес</div>` : ''}
                                </div>
                                
                                <div class="flex items-center gap-2 mb-4">
                                    ${isSubscription ?
                    `<span class="text-xs bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 px-2 py-1 rounded">
                                            <i class="fas fa-redo mr-1"></i>Подписка ${periodDays} дн.
                                        </span>` :
                    `<span class="text-xs bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400 px-2 py-1 rounded">
                                            <i class="fas fa-check mr-1"></i>Разовая покупка
                                        </span>`
                }
                                </div>
                                
                                <ul class="space-y-2 mb-6 flex-1">
                                    ${features.map(feature => `
                                        <li class="flex items-center text-sm">
                                            <i class="fas fa-check text-green-500 mr-2"></i> ${escapeHtml(feature)}
                                        </li>
                                    `).join('')}
                                </ul>
                                
                                <a href="${productLink}" target="_blank"
                                    class="block w-full py-3 rounded-lg font-medium ${isPopular ? 'bg-primary text-white hover:bg-blue-600' : 'border-2 border-primary text-primary hover:bg-primary hover:text-white'} transition text-center">
                                    ${isSubscription ? 'Подписаться' : 'Купить'}
                                </a>
                            </div>
                        `;
        }).join('')}
                </div>
            </div>
        `;
    }).join('');
}

function renderDefaultTariffs() {
    // Fallback to old display if no sections available
    const container = document.getElementById('tariff-sections-public');
    const billingPeriod = parseInt(document.getElementById('billing-period')?.value || 1);
    const discount = billingPeriod === 3 ? 0.95 : billingPeriod === 6 ? 0.90 : billingPeriod === 12 ? 0.80 : 1;

    container.innerHTML = `
        <div class="grid md:grid-cols-3 gap-8">
            ${defaultTariffs.map((tariff, index) => {
        const monthlyPrice = Math.round(tariff.price * discount);
        const totalPrice = monthlyPrice * billingPeriod;
        const isPopular = tariff.isPopular;

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
                            <span class="text-gray-500"> руб/мес</span>
                            ${billingPeriod > 1 ? `<div class="text-sm text-gray-400">${monthlyPrice} × ${billingPeriod} мес</div>` : ''}
                        </div>
                        <ul class="space-y-4 mb-8 flex-1">
                            ${tariff.features.map(feature => `
                                <li class="flex items-center">
                                    <i class="fas fa-check text-green-500 mr-3"></i> ${escapeHtml(feature)}
                                </li>
                            `).join('')}
                        </ul>
                        <a href="https://t.me/stormcreatebot?start=plan${tariff.id}" target="_blank"
                            class="block w-full py-3 rounded-lg font-medium ${isPopular ? 'bg-primary text-white hover:bg-blue-600' : 'border-2 border-primary text-primary hover:bg-primary hover:text-white'} transition text-center">
                            Выбрать
                        </a>
                    </div>
                `;
    }).join('')}
        </div>
    `;
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
            userName: localStorage.getItem('userName') || localStorage.getItem('userEmail') || 'Гость',
            userEmail: localStorage.getItem('userEmail') || 'Не указан',
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
    if (!localStorage.getItem('userEmail')) {
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
