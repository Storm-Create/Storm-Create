/**
 * Модуль управления разделами тарифов и платными услугами
 * Поддерживает: разделы, товары/услуги, типы оплаты (разовые/подписки)
 */

import { db } from './firebase.js';
import { collection, getDocs, addDoc, deleteDoc, doc, setDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const COLLECTION_NAME = 'tariff_sections';

// Default sections for initial setup
const defaultSections = [
    {
        id: 'bots',
        name: 'Боты',
        icon: 'fa-robot',
        description: 'Telegram боты и автоматизация',
        sortOrder: 1,
        isActive: true,
        products: [
            {
                id: 'bot-basic',
                name: 'Базовый бот',
                description: 'Простой бот с основными функциями',
                price: 500,
                paymentType: 'one-time', // разовый платеж
                features: ['До 1000 пользователей', 'Базовая статистика', 'Email поддержка'],
                isActive: true
            },
            {
                id: 'bot-pro',
                name: 'Pro бот',
                description: 'Продвинутый бот с полным функционалом',
                price: 1500,
                paymentType: 'subscription',
                subscriptionPeriod: 30, // дней
                features: ['Безлимит пользователей', 'Полная статистика', 'Приоритетная поддержка', 'API доступ'],
                isActive: true
            }
        ]
    },
    {
        id: 'channels',
        name: 'Каналы',
        icon: 'fa-bullhorn',
        description: 'Управление Telegram каналами',
        sortOrder: 2,
        isActive: true,
        products: [
            {
                id: 'channel-sub',
                name: 'Подписка на канал',
                description: 'Премиум доступ к закрытому каналу',
                price: 299,
                paymentType: 'subscription',
                subscriptionPeriod: 30,
                features: ['Эксклюзивный контент', 'Ежедневные обновления', 'Чат участников'],
                isActive: true
            }
        ]
    },
    {
        id: 'groups',
        name: 'Группы',
        icon: 'fa-users',
        description: 'Приватные группы и сообщества',
        sortOrder: 3,
        isActive: true,
        products: [
            {
                id: 'group-lifetime',
                name: 'Пожизненный доступ',
                description: 'Покупка вечного доступа к группе',
                price: 990,
                paymentType: 'one-time',
                features: ['Вечный доступ', 'Без подписки', 'Все материалы'],
                isActive: true
            }
        ]
    },
    {
        id: 'subscriptions',
        name: 'Подписки',
        icon: 'fa-gem',
        description: 'Месячные и годовые подписки',
        sortOrder: 4,
        isActive: true,
        products: [
            {
                id: 'sub-monthly',
                name: 'Месячная подписка',
                description: 'Полный доступ на 1 месяц',
                price: 990,
                paymentType: 'subscription',
                subscriptionPeriod: 30,
                features: ['Доступ ко всем продуктам', 'Приоритетная поддержка', 'Обновления'],
                isActive: true
            },
            {
                id: 'sub-yearly',
                name: 'Годовая подписка',
                description: 'Полный доступ на 1 год',
                price: 9900,
                paymentType: 'subscription',
                subscriptionPeriod: 365,
                features: ['Доступ ко всем продуктам', 'Приоритетная поддержка', 'Обновления', 'Скидка 17%'],
                isActive: true
            }
        ]
    }
];

/**
 * Получить все разделы тарифов
 */
export async function getTariffSections() {
    if (!db) return defaultSections;
    try {
        const q = query(collection(db, COLLECTION_NAME), orderBy('sortOrder', 'asc'));
        const snapshot = await getDocs(q);
        const sections = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Если нет данных в БД, возвращаем дефолтные
        return sections.length > 0 ? sections : defaultSections;
    } catch (e) {
        console.error("Error getting tariff sections:", e);
        return defaultSections;
    }
}

/**
 * Сохранить раздел тарифов (создать или обновить)
 */
export async function saveTariffSection(section) {
    if (!db) throw new Error("Firebase not configured");

    const sectionData = {
        name: section.name?.trim() || 'Новый раздел',
        icon: section.icon || 'fa-tag',
        description: section.description?.trim() || '',
        sortOrder: Number(section.sortOrder) || 1,
        isActive: Boolean(section.isActive),
        products: section.products || [],
        updatedAt: new Date()
    };

    if (section.id) {
        // Обновить существующий
        await setDoc(doc(db, COLLECTION_NAME, section.id), sectionData, { merge: true });
        return section.id;
    } else {
        // Создать новый
        sectionData.createdAt = new Date();
        const docRef = await addDoc(collection(db, COLLECTION_NAME), sectionData);
        return docRef.id;
    }
}

/**
 * Удалить раздел тарифов
 */
export async function deleteTariffSection(id) {
    if (!db) throw new Error("Firebase not configured");
    return await deleteDoc(doc(db, COLLECTION_NAME, id));
}

/**
 * Добавить товар/услугу в раздел
 */
export async function addProductToSection(sectionId, product) {
    if (!db) throw new Error("Firebase not configured");

    const sectionDoc = await getDocs(query(collection(db, COLLECTION_NAME)));
    const section = sectionDoc.docs.find(d => d.id === sectionId);

    if (!section) throw new Error("Раздел не найден");

    const sectionData = section.data();
    const products = sectionData.products || [];

    const newProduct = {
        id: product.id || `prod_${Date.now()}`,
        name: product.name?.trim() || 'Новый товар',
        description: product.description?.trim() || '',
        price: Number(product.price) || 0,
        paymentType: product.paymentType || 'one-time', // 'one-time' | 'subscription'
        subscriptionPeriod: Number(product.subscriptionPeriod) || 30,
        features: Array.isArray(product.features) ? product.features : [],
        isActive: Boolean(product.isActive),
        createdAt: new Date()
    };

    products.push(newProduct);

    await setDoc(doc(db, COLLECTION_NAME, sectionId),
        { products, updatedAt: new Date() },
        { merge: true }
    );

    return newProduct.id;
}

/**
 * Обновить товар в разделе
 */
export async function updateProductInSection(sectionId, productId, productData) {
    if (!db) throw new Error("Firebase not configured");

    const sectionDoc = await getDocs(query(collection(db, COLLECTION_NAME)));
    const section = sectionDoc.docs.find(d => d.id === sectionId);

    if (!section) throw new Error("Раздел не найден");

    const sectionData = section.data();
    const products = sectionData.products || [];
    const productIndex = products.findIndex(p => p.id === productId);

    if (productIndex === -1) throw new Error("Товар не найден");

    products[productIndex] = {
        ...products[productIndex],
        name: productData.name?.trim() || products[productIndex].name,
        description: productData.description?.trim() || products[productIndex].description,
        price: Number(productData.price) || products[productIndex].price,
        paymentType: productData.paymentType || products[productIndex].paymentType,
        subscriptionPeriod: Number(productData.subscriptionPeriod) || products[productIndex].subscriptionPeriod,
        features: Array.isArray(productData.features) ? productData.features : products[productIndex].features,
        isActive: productData.isActive !== undefined ? Boolean(productData.isActive) : products[productIndex].isActive,
        updatedAt: new Date()
    };

    await setDoc(doc(db, COLLECTION_NAME, sectionId),
        { products, updatedAt: new Date() },
        { merge: true }
    );

    return productId;
}

/**
 * Удалить товар из раздела
 */
export async function deleteProductFromSection(sectionId, productId) {
    if (!db) throw new Error("Firebase not configured");

    const sectionDoc = await getDocs(query(collection(db, COLLECTION_NAME)));
    const section = sectionDoc.docs.find(d => d.id === sectionId);

    if (!section) throw new Error("Раздел не найден");

    const sectionData = section.data();
    const products = (sectionData.products || []).filter(p => p.id !== productId);

    await setDoc(doc(db, COLLECTION_NAME, sectionId),
        { products, updatedAt: new Date() },
        { merge: true }
    );

    return true;
}

/**
 * Инициализация разделов по умолчанию (для первой загрузки)
 */
export async function initDefaultSections() {
    if (!db) return;

    try {
        const snapshot = await getDocs(collection(db, COLLECTION_NAME));
        if (snapshot.empty) {
            // Создаем разделы по умолчанию
            for (const section of defaultSections) {
                await addDoc(collection(db, COLLECTION_NAME), {
                    ...section,
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
            }
            console.log('Default tariff sections created');
        }
    } catch (e) {
        console.error("Error initializing default sections:", e);
    }
}

// Доступные иконки для разделов
export const sectionIcons = [
    { value: 'fa-robot', label: 'Бот' },
    { value: 'fa-bullhorn', label: 'Канал' },
    { value: 'fa-users', label: 'Группа' },
    { value: 'fa-gem', label: 'Подписка' },
    { value: 'fa-shopping-cart', label: 'Магазин' },
    { value: 'fa-gamepad', label: 'Игры' },
    { value: 'fa-graduation-cap', label: 'Обучение' },
    { value: 'fa-headset', label: 'Поддержка' },
    { value: 'fa-chart-line', label: 'Аналитика' },
    { value: 'fa-crown', label: 'Премиум' },
    { value: 'fa-star', label: 'Звезда' },
    { value: 'fa-bolt', label: 'Молния' },
    { value: 'fa-fire', label: 'Огонь' },
    { value: 'fa-rocket', label: 'Ракета' },
    { value: 'fa-shield-alt', label: 'Защита' },
    { value: 'fa-cog', label: 'Настройки' }
];

// Периоды подписки
export const subscriptionPeriods = [
    { value: 7, label: '7 дней' },
    { value: 14, label: '14 дней' },
    { value: 30, label: '30 дней (месяц)' },
    { value: 90, label: '90 дней (3 месяца)' },
    { value: 180, label: '180 дней (6 месяцев)' },
    { value: 365, label: '365 дней (год)' }
];

// Типы оплаты
export const paymentTypes = [
    { value: 'one-time', label: 'Разовая покупка', description: 'Оплата один раз, без повторных списаний' },
    { value: 'subscription', label: 'Подписка', description: 'Регулярное списание каждый период' }
];
