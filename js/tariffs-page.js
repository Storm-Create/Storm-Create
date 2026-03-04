import { getTariffSections } from './tariff-sections.js';
import { showToast, initTheme, initScrollAnimations } from './ui.js';
import { db } from './firebase.js';
import { addDoc, collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// FAQ data
const defaultFaqData = [
    {
        question: 'Можно ли сменить тариф позже?',
        answer: 'Да, вы можете сменить тариф в любой момент. При переходе на более дорогой тариф разница будет зачислена на ваш счёт.'
    },
    {
        question: 'Как оплатить подписку?',
        answer: 'Оплата производится через Telegram бот. Мы принимаем карты, ЮMoney, криптовалюту и другие способы оплаты.'
    },
    {
        question: 'Есть ли пробный период?',
        answer: 'Да, каждый новый пользователь получает 3 дня бесплатного периода на тарифе Pro для ознакомления с функционалом.'
    },
    {
        question: 'Что происходит при окончании подписки?',
        answer: 'При окончании подписки магазин переводится в режим чтения. У вас будет 7 дней на продление, после чего данные могут быть удалены.'
    },
    {
        question: 'Какие способы оплаты вы принимаете?',
        answer: 'Мы принимаем банковские карты (Visa, MasterCard, МИР), электронные кошельки (ЮMoney, Qiwi), криптовалюту (BTC, ETH, USDT) и переводы через Telegram.'
    },
    {
        question: 'Можно ли получить чек на оплату?',
        answer: 'Да, на тарифах Pro и Ultra доступна автоматическая отправка чеков в PDF формате на email после каждой оплаты.'
    }
];
let tariffsFaqData = [...defaultFaqData];
const SUPPORT_CHAT_STORAGE_PREFIX = 'storm_support_chat_history_v1';
const SUPPORT_CHAT_MAX_MESSAGES = 80;
let supportChatMessages = [];
let supportChatSending = false;

// Comparison features
const comparisonFeatures = [
    { key: 'users', label: 'Пользователей', type: 'text' },
    { key: 'products', label: 'Товаров', type: 'text' },
    { key: 'adFree', label: 'Без рекламы', type: 'boolean' },
    { key: 'storeButtons', label: 'Кнопки в магазине', type: 'boolean' },
    { key: 'pdfReceipts', label: 'Чеки (PDF)', type: 'boolean' },
    { key: 'customDomains', label: 'Кастомные домены', type: 'text' },
    { key: 'prioritySupport', label: 'Приоритетная поддержка', type: 'boolean' },
    { key: 'apiAccess', label: 'API доступ', type: 'boolean' }
];

// Default comparison data based on default products
const defaultComparison = {
    'bot-basic': { users: 'До 1000', products: 'До 50', adFree: true, storeButtons: false, pdfReceipts: false, customDomains: '0', prioritySupport: false, apiAccess: false },
    'bot-pro': { users: 'Безлимит', products: 'До 500', adFree: true, storeButtons: true, pdfReceipts: false, customDomains: '1', prioritySupport: true, apiAccess: true },
    'channel-sub': { users: 'Безлимит', products: 'Безлимит', adFree: true, storeButtons: false, pdfReceipts: true, customDomains: 'Безлимит', prioritySupport: true, apiAccess: false },
    'group-lifetime': { users: 'Безлимит', products: 'Безлимит', adFree: true, storeButtons: true, pdfReceipts: true, customDomains: 'Безлимит', prioritySupport: true, apiAccess: true },
    'sub-monthly': { users: 'Безлимит', products: 'Безлимит', adFree: true, storeButtons: true, pdfReceipts: true, customDomains: 'Безлимит', prioritySupport: true, apiAccess: true },
    'sub-yearly': { users: 'Безлимит', products: 'Безлимит', adFree: true, storeButtons: true, pdfReceipts: true, customDomains: 'Безлимит', prioritySupport: true, apiAccess: true }
};

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function loadTariffsFaqData() {
    if (!db) {
        tariffsFaqData = [...defaultFaqData];
        return;
    }

    try {
        const q = query(collection(db, 'tariffs_faq'), orderBy('order', 'asc'));
        const snap = await getDocs(q);
        const loadedFaq = snap.docs.map((item) => item.data()).filter(Boolean);
        tariffsFaqData = loadedFaq;
    } catch (error) {
        console.error('Error loading tariffs FAQ:', error);
        tariffsFaqData = [...defaultFaqData];
    }
}

async function initTariffsPage() {
    initTheme();
    await loadTariffsFaqData();
    loadTariffs();
    setupSupportChat();
    renderComparisonTable();
    renderFAQ();
}

async function loadTariffs() {
    try {
        console.log('Loading tariff sections for public page...');
        const sections = await getTariffSections();
        console.log('Loaded sections:', sections.length);
        sections.forEach(s => {
            const activeProducts = (s.products || []).filter(p => p.isActive !== false);
            console.log(`  - ${s.name}: ${activeProducts.length} active products`);
        });
        renderTariffSections(sections);
    } catch (error) {
        console.error('Error loading tariffs:', error);
        renderTariffSections([]);
    }
}

function renderTariffSections(sections) {
    const container = document.getElementById('tariff-sections-public');
    const billingPeriod = parseInt(document.getElementById('billing-period')?.value || 1);

    const discount = billingPeriod === 3 ? 0.95 : billingPeriod === 6 ? 0.90 : billingPeriod === 12 ? 0.80 : 1;
    const periodLabel = billingPeriod === 1 ? 'руб/мес' : 'руб';

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

    // Re-bind scroll animations for dynamically rendered sections.
    initScrollAnimations();
}

window.updatePricing = function () {
    loadTariffs();
};

document.addEventListener('DOMContentLoaded', initTariffsPage);

// Render comparison table
function renderComparisonTable() {
    const tableContainer = document.getElementById('comparison-table');
    if (!tableContainer) return;

    // Get products from sections for comparison
    const productsForComparison = [];

    // Try to get products from sections
    getTariffSections().then(sections => {
        sections.forEach(section => {
            if (section.products) {
                section.products.forEach(product => {
                    if (product.isActive !== false) {
                        productsForComparison.push({
                            ...product,
                            sectionName: section.name
                        });
                    }
                });
            }
        });

        // Use default comparison if no products
        if (productsForComparison.length === 0) {
            renderDefaultComparison(tableContainer);
            return;
        }

        // Limit to 4 products for readability
        const displayProducts = productsForComparison.slice(0, 4);

        let html = `
            <thead>
                <tr class="border-b border-gray-200 dark:border-gray-700">
                    <th class="p-4 font-medium text-gray-500 w-1/4">Возможность</th>
        `;

        displayProducts.forEach(product => {
            html += `<th class="p-4 font-medium text-center text-gray-500">${escapeHtml(product.name)}</th>`;
        });

        html += '</tr></thead><tbody class="divide-y divide-gray-200 dark:divide-gray-700">';

        // Render feature rows
        comparisonFeatures.forEach(feature => {
            html += `<tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">`;
            html += `<td class="p-4 font-medium">${feature.label}</td>`;

            displayProducts.forEach(product => {
                const normalizedProductId = String(product.id ?? product.productId ?? '');
                const value = product.comparison?.[feature.key] ?? defaultComparison[normalizedProductId]?.[feature.key];
                const cellClass = getComparisonCellClass(feature.type, value);
                html += `<td class="p-4 text-center ${cellClass}">${formatComparisonValue(feature.type, value)}</td>`;
            });

            html += '</tr>';
        });

        html += '</tbody>';
        tableContainer.innerHTML = html;
    }).catch(() => {
        renderDefaultComparison(tableContainer);
    });
}

function renderDefaultComparison(tableContainer) {
    // Fallback to static comparison with 3 main plans
    const plans = [
        { name: 'Базовый', id: 'basic' },
        { name: 'Pro', id: 'pro' },
        { name: 'Ultra', id: 'ultra' }
    ];

    const staticData = {
        basic: { products: 'До 50', adFree: true, storeButtons: false, pdfReceipts: false, customDomains: '0', prioritySupport: false, apiAccess: false },
        pro: { products: 'До 500', adFree: true, storeButtons: true, pdfReceipts: false, customDomains: '1', prioritySupport: false, apiAccess: false },
        ultra: { products: 'Безлимит', adFree: true, storeButtons: true, pdfReceipts: true, customDomains: 'Безлимит', prioritySupport: true, apiAccess: true }
    };

    let html = `
        <thead>
            <tr class="border-b border-gray-200 dark:border-gray-700">
                <th class="p-4 font-medium text-gray-500 w-1/4">Возможность</th>
    `;

    plans.forEach(plan => {
        html += `<th class="p-4 font-medium text-center text-gray-500">${plan.name}</th>`;
    });

    html += '</tr></thead><tbody class="divide-y divide-gray-200 dark:divide-gray-700">';

    const features = [
        { key: 'products', label: 'Товаров', type: 'text' },
        { key: 'adFree', label: 'Без рекламы', type: 'boolean' },
        { key: 'storeButtons', label: 'Кнопки в магазине', type: 'boolean' },
        { key: 'pdfReceipts', label: 'Чеки (PDF)', type: 'boolean' },
        { key: 'customDomains', label: 'Кастомные домены', type: 'text' },
        { key: 'prioritySupport', label: 'Приоритетная поддержка', type: 'boolean' },
        { key: 'apiAccess', label: 'API доступ', type: 'boolean' }
    ];

    features.forEach(feature => {
        html += `<tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">`;
        html += `<td class="p-4 font-medium">${feature.label}</td>`;

        plans.forEach(plan => {
            const value = staticData[plan.id]?.[feature.key];
            const cellClass = getComparisonCellClass(feature.type, value);
            html += `<td class="p-4 text-center ${cellClass}">${formatComparisonValue(feature.type, value)}</td>`;
        });

        html += '</tr>';
    });

    html += '</tbody>';
    tableContainer.innerHTML = html;
}

function getComparisonCellClass(type, value) {
    if (type === 'boolean') {
        return value ? 'text-green-500 font-medium' : 'text-gray-400';
    }
    if (value === 'Безлимит' || value === true) {
        return 'text-green-500 font-medium';
    }
    return '';
}

function formatComparisonValue(type, value) {
    if (type === 'boolean') {
        return value ? '<i class="fas fa-check text-xl"></i>' : '<i class="fas fa-times text-xl"></i>';
    }
    if (value === undefined || value === null || value === '') {
        return '—';
    }
    return escapeHtml(String(value));
}

// Render FAQ accordion
function renderFAQ() {
    const faqContainer = document.getElementById('tariffs-faq');
    if (!faqContainer) return;

    if (!tariffsFaqData.length) {
        faqContainer.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <i class="fas fa-question-circle text-2xl mb-2"></i>
                <p>FAQ скоро появится</p>
            </div>
        `;
        return;
    }

    faqContainer.innerHTML = tariffsFaqData.map((item, index) => `
        <div class="faq-item bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
            <button class="faq-question w-full px-6 py-4 text-left flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
                    onclick="window.toggleFAQ(${index})">
                <span class="font-medium text-lg">${escapeHtml(item.question)}</span>
                <i class="fas fa-chevron-down faq-icon text-gray-400 transition-transform duration-300"></i>
            </button>
            <div class="faq-answer overflow-hidden max-h-0 transition-all duration-300">
                <div class="px-6 pb-4 text-gray-600 dark:text-gray-400">
                    ${escapeHtml(item.answer)}
                </div>
            </div>
        </div>
    `).join('');
}

// Toggle FAQ item
window.toggleFAQ = function (index) {
    const faqItems = document.querySelectorAll('.faq-item');
    const item = faqItems[index];
    const answer = item.querySelector('.faq-answer');
    const icon = item.querySelector('.faq-icon');

    const isOpen = answer.classList.contains('open');

    // Close all other items
    faqItems.forEach((otherItem, otherIndex) => {
        if (otherIndex !== index) {
            const otherAnswer = otherItem.querySelector('.faq-answer');
            const otherIcon = otherItem.querySelector('.faq-icon');
            otherAnswer.style.maxHeight = '0';
            otherAnswer.classList.remove('open');
            otherIcon.classList.remove('rotate-180');
        }
    });

    // Toggle current item
    if (isOpen) {
        answer.style.maxHeight = '0';
        answer.classList.remove('open');
        icon.classList.remove('rotate-180');
    } else {
        answer.style.maxHeight = answer.scrollHeight + 'px';
        answer.classList.add('open');
        icon.classList.add('rotate-180');
    }
};

// Support chat functionality (new mini chat widget)
function getSupportHistoryKey() {
    const userKey =
        localStorage.getItem('userEmail') ||
        localStorage.getItem('supportContact') ||
        'guest';
    return `${SUPPORT_CHAT_STORAGE_PREFIX}:${String(userKey).toLowerCase()}`;
}

function loadSupportChatHistory() {
    try {
        const raw = localStorage.getItem(getSupportHistoryKey());
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error('Support chat history parse error:', error);
        return [];
    }
}

function saveSupportChatHistory() {
    localStorage.setItem(
        getSupportHistoryKey(),
        JSON.stringify(supportChatMessages.slice(-SUPPORT_CHAT_MAX_MESSAGES))
    );
}

function formatSupportMessageTime(ts) {
    try {
        const date = new Date(ts);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

function renderSupportChatMessages() {
    const container = document.getElementById('support-chat-messages');
    if (!container) return;

    if (!supportChatMessages.length) {
        container.innerHTML = `
            <div class="text-center text-xs text-gray-500 dark:text-gray-400 py-4">
                Напишите в чат, и мы поможем с тарифами, оплатой и настройкой.
            </div>
        `;
        return;
    }

    container.innerHTML = supportChatMessages.map((message) => {
        const role = message.role || 'system';
        const isUser = role === 'user';
        const isSupport = role === 'support';
        const wrapperClass = isUser ? 'justify-end' : 'justify-start';
        const bubbleClass = isUser
            ? 'bg-primary text-white rounded-2xl rounded-br-md'
            : isSupport
                ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-2xl rounded-bl-md border border-gray-200 dark:border-gray-600'
                : 'bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200 rounded-2xl rounded-bl-md border border-amber-200 dark:border-amber-800';

        return `
            <div class="flex ${wrapperClass}">
                <div class="max-w-[85%] px-3 py-2 text-sm ${bubbleClass}">
                    <div class="whitespace-pre-wrap break-words">${escapeHtml(message.text || '')}</div>
                    <div class="mt-1 text-[10px] opacity-70 text-right">${formatSupportMessageTime(message.ts)}</div>
                </div>
            </div>
        `;
    }).join('');

    container.scrollTop = container.scrollHeight;
}

function setSupportChatSendingState(isSending) {
    supportChatSending = isSending;
    const sendBtn = document.getElementById('support-chat-send');
    if (!sendBtn) return;
    sendBtn.disabled = isSending;
    sendBtn.innerHTML = isSending
        ? '<i class="fas fa-spinner fa-spin"></i>'
        : '<i class="fas fa-paper-plane"></i>';
}

function getSupportIdentity() {
    const profileEmail = localStorage.getItem('userEmail') || '';
    const profileName = localStorage.getItem('userName') || '';
    const contactInput = document.getElementById('support-chat-contact');
    const enteredContact = contactInput?.value?.trim() || '';
    const savedContact = localStorage.getItem('supportContact') || '';
    const contact = enteredContact || savedContact;

    if (enteredContact) {
        localStorage.setItem('supportContact', enteredContact);
    }

    return {
        userEmail: profileEmail || contact,
        userName: profileName || profileEmail || contact || 'Гость'
    };
}

function buildSupportSubject(category, message) {
    const categoryLabelMap = {
        technical: 'Техподдержка',
        billing: 'Оплата',
        partnership: 'Партнерство',
        other: 'Другое'
    };
    const prefix = categoryLabelMap[category] || 'Поддержка';
    const shortMessage = message.replace(/\s+/g, ' ').trim().slice(0, 56);
    return `${prefix}: ${shortMessage || 'Новое обращение'}`;
}

async function sendSupportChatMessage() {
    if (supportChatSending) return;

    const input = document.getElementById('support-chat-input');
    const categorySelect = document.getElementById('support-chat-category');
    const contactInput = document.getElementById('support-chat-contact');
    if (!input || !categorySelect) return;

    const messageText = input.value.trim();
    if (!messageText) return;

    const identity = getSupportIdentity();
    if (!identity.userEmail) {
        showToast('Укажите контакт: email или @username', 'error');
        contactInput?.focus();
        return;
    }

    supportChatMessages.push({
        role: 'user',
        text: messageText,
        ts: Date.now()
    });
    supportChatMessages = supportChatMessages.slice(-SUPPORT_CHAT_MAX_MESSAGES);
    saveSupportChatHistory();
    renderSupportChatMessages();

    input.value = '';
    setSupportChatSendingState(true);

    const category = categorySelect.value || 'other';
    const subject = buildSupportSubject(category, messageText);

    try {
        if (!db) {
            throw new Error('Firebase is not configured');
        }

        const docRef = await addDoc(collection(db, 'tickets'), {
            userName: identity.userName,
            userEmail: identity.userEmail,
            category,
            subject,
            message: messageText,
            status: 'open',
            source: 'tariffs_chat',
            createdAt: new Date(),
            updatedAt: new Date()
        });

        supportChatMessages.push({
            role: 'support',
            text: `Сообщение отправлено. Номер обращения: ${docRef.id.slice(0, 8)}. Скоро ответим.`,
            ts: Date.now()
        });
        supportChatMessages = supportChatMessages.slice(-SUPPORT_CHAT_MAX_MESSAGES);
        saveSupportChatHistory();
        renderSupportChatMessages();
        showToast('Сообщение отправлено в поддержку', 'success');
    } catch (error) {
        console.error('Support chat send error:', error);
        supportChatMessages.push({
            role: 'system',
            text: 'Не удалось отправить сообщение. Проверьте подключение и попробуйте снова.',
            ts: Date.now()
        });
        supportChatMessages = supportChatMessages.slice(-SUPPORT_CHAT_MAX_MESSAGES);
        saveSupportChatHistory();
        renderSupportChatMessages();
        showToast('Ошибка отправки сообщения', 'error');
    } finally {
        setSupportChatSendingState(false);
        input.focus();
    }
}

window.openSupportChat = () => {
    const panel = document.getElementById('support-chat-panel');
    if (!panel) return;
    panel.classList.remove('hidden');
    renderSupportChatMessages();
    document.getElementById('support-chat-input')?.focus();
};

window.closeSupportChat = () => {
    const panel = document.getElementById('support-chat-panel');
    if (!panel) return;
    panel.classList.add('hidden');
};

window.toggleSupportChat = () => {
    const panel = document.getElementById('support-chat-panel');
    if (!panel) return;
    if (panel.classList.contains('hidden')) {
        window.openSupportChat();
    } else {
        window.closeSupportChat();
    }
};

// Backward compatibility with old handlers.
window.openSupportModal = window.openSupportChat;
window.closeSupportModal = window.closeSupportChat;

function setupSupportChat() {
    const panel = document.getElementById('support-chat-panel');
    const toggleBtn = document.getElementById('support-chat-toggle');
    const closeBtn = document.getElementById('support-chat-close');
    const form = document.getElementById('support-chat-form');
    const input = document.getElementById('support-chat-input');
    const contactInput = document.getElementById('support-chat-contact');

    if (!panel || !toggleBtn || !closeBtn || !form || !input) return;

    supportChatMessages = loadSupportChatHistory();
    if (!supportChatMessages.length) {
        supportChatMessages = [
            {
                role: 'support',
                text: 'Здравствуйте! Это чат поддержки StormCreate. Напишите ваш вопрос, и мы поможем.',
                ts: Date.now()
            }
        ];
        saveSupportChatHistory();
    }
    renderSupportChatMessages();

    const emailFromProfile = localStorage.getItem('userEmail') || '';
    if (contactInput && emailFromProfile && !contactInput.value) {
        contactInput.value = emailFromProfile;
    }

    toggleBtn.addEventListener('click', window.toggleSupportChat);
    closeBtn.addEventListener('click', window.closeSupportChat);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await sendSupportChatMessage();
    });

    input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            await sendSupportChatMessage();
        }
    });

    document.addEventListener('click', (e) => {
        if (panel.classList.contains('hidden')) return;
        const isInsidePanel = panel.contains(e.target);
        const isToggle = toggleBtn.contains(e.target);
        if (!isInsidePanel && !isToggle) {
            window.closeSupportChat();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            window.closeSupportChat();
        }
    });
}


