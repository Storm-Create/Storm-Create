/**
 * Модуль управления разделами тарифов и платными услугами
 * Поддерживает: разделы, товары/услуги, типы оплаты (разовые/подписки)
 */

import { db } from './firebase.js';
import { collection, getDocs, getDoc, addDoc, deleteDoc, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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
    console.log("getTariffSections called, db:", db ? "initialized" : "NOT initialized");

    if (!db) {
        console.warn("Firebase not configured, returning empty sections list");
        return [];
    }

    try {
        const snapshot = await getDocs(collection(db, COLLECTION_NAME));
        const sections = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => {
                const aSort = Number.isFinite(Number(a.sortOrder)) ? Number(a.sortOrder) : Number.MAX_SAFE_INTEGER;
                const bSort = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : Number.MAX_SAFE_INTEGER;
                if (aSort !== bSort) return aSort - bSort;

                const aCreated = a.createdAt?.toMillis?.() || 0;
                const bCreated = b.createdAt?.toMillis?.() || 0;
                if (aCreated !== bCreated) return aCreated - bCreated;

                return String(a.name || '').localeCompare(String(b.name || ''));
            });

        console.log("Loaded tariff sections:", sections.length);
        return sections;
    } catch (e) {
        console.error("Error getting tariff sections:", e);
        return [];
    }
}

/**
 * Сохранить раздел тарифов (создать или обновить)
 */
export async function saveTariffSection(section) {
    console.log("saveTariffSection called, db:", db ? "initialized" : "NOT initialized");

    if (!db) throw new Error("Firebase not configured");

    let sectionData = {
        name: section.name?.trim() || 'Новый раздел',
        icon: section.icon || 'fa-tag',
        description: section.description?.trim() || '',
        sortOrder: Number(section.sortOrder) || 1,
        isActive: Boolean(section.isActive),
        updatedAt: new Date()
    };

    if (section.id) {
        // При обновлении нужно сохранить существующие продукты
        try {
            const sectionRef = doc(db, COLLECTION_NAME, section.id);
            const existingSectionSnap = await getDoc(sectionRef);

            if (existingSectionSnap.exists()) {
                const existingData = existingSectionSnap.data();
                sectionData.products = existingData.products || [];
            } else {
                sectionData.products = section.products || [];
            }

            await setDoc(sectionRef, sectionData, { merge: true });
            return section.id;
        } catch (error) {
            console.error("Error saving tariff section:", error);
            throw error;
        }
    } else {
        // Создать новый
        sectionData.products = section.products || [];
        sectionData.createdAt = new Date();
        const docRef = await addDoc(collection(db, COLLECTION_NAME), sectionData);
        return docRef.id;
    }
}

/**
 * Удалить раздел тарифов
 */
export async function deleteTariffSection(id) {
    console.log("deleteTariffSection called, db:", db ? "initialized" : "NOT initialized", "id:", id);

    if (!db) throw new Error("Firebase not configured");
    if (!id) throw new Error("ID раздела обязателен для удаления");
    return await deleteDoc(doc(db, COLLECTION_NAME, id));
}

/**
 * Добавить товар/услугу в раздел
 */
export async function addProductToSection(sectionId, product) {
    console.log("addProductToSection called, sectionId:", sectionId, "db:", db ? "initialized" : "NOT initialized");

    if (!db) throw new Error("Firebase not configured");

    if (!sectionId) {
        console.error("addProductToSection: sectionId is required");
        throw new Error("ID раздела обязателен");
    }

    try {
        const sectionRef = doc(db, COLLECTION_NAME, sectionId);
        const sectionSnap = await getDoc(sectionRef);

        if (!sectionSnap.exists()) {
            console.error("Section not found:", sectionId);
            throw new Error("Раздел не найден");
        }

        const sectionData = sectionSnap.data();
        const products = sectionData.products || [];

        const newProduct = {
            id: product.id || `prod_${Date.now()}`,
            name: product.name?.trim() || 'Новый товар',
            description: product.description?.trim() || '',
            price: Number(product.price) || 0,
            paymentType: product.paymentType || 'one-time',
            subscriptionPeriod: Number(product.subscriptionPeriod) || 30,
            features: Array.isArray(product.features) ? product.features : [],
            comparison: product.comparison && typeof product.comparison === 'object' && !Array.isArray(product.comparison)
                ? product.comparison
                : {},
            isActive: Boolean(product.isActive),
            createdAt: new Date()
        };

        products.push(newProduct);

        await setDoc(sectionRef, { products, updatedAt: new Date() }, { merge: true });

        return newProduct.id;
    } catch (error) {
        console.error("Error adding product to section:", error);
        throw error;
    }
}

/**
 * Обновить товар в разделе
 */
export async function updateProductInSection(sectionId, productId, productData, fallbackIndex = null) {
    console.log("updateProductInSection called, sectionId:", sectionId, "productId:", productId, "db:", db ? "initialized" : "NOT initialized");

    if (!db) throw new Error("Firebase not configured");

    const parsedFallbackIndex = Number.parseInt(fallbackIndex, 10);
    const hasFallbackIndex = Number.isInteger(parsedFallbackIndex) && parsedFallbackIndex >= 0;
    if (!sectionId || (!productId && !hasFallbackIndex)) {
        console.error("updateProductInSection: sectionId and productId/fallbackIndex are required");
        throw new Error("ID раздела и товара обязательны");
    }

    try {
        const sectionRef = doc(db, COLLECTION_NAME, sectionId);
        const sectionSnap = await getDoc(sectionRef);

        if (!sectionSnap.exists()) {
            console.error("Section not found:", sectionId);
            throw new Error("Раздел не найден");
        }

        const sectionData = sectionSnap.data();
        const products = sectionData.products || [];
        const normalizedProductId = String(productId || '');
        let productIndex = products.findIndex(p =>
            String(p?.id ?? p?.productId ?? '') === normalizedProductId
        );
        if (productIndex === -1 && hasFallbackIndex && parsedFallbackIndex < products.length) {
            productIndex = parsedFallbackIndex;
        }

        if (productIndex === -1) {
            console.error("Product not found:", productId);
            throw new Error("Товар не найден");
        }

        const currentProduct = products[productIndex] || {};
        const parsedPrice = Number(productData.price);
        const parsedSubscriptionPeriod = Number(productData.subscriptionPeriod);

        products[productIndex] = {
            ...currentProduct,
            id: String((currentProduct.id ?? currentProduct.productId ?? normalizedProductId) || `prod_${Date.now()}`),
            name: productData.name?.trim() || currentProduct.name || 'Новый товар',
            description: typeof productData.description === 'string' ? productData.description.trim() : (currentProduct.description || ''),
            price: Number.isFinite(parsedPrice) ? parsedPrice : (currentProduct.price || 0),
            paymentType: productData.paymentType || currentProduct.paymentType || 'one-time',
            subscriptionPeriod: Number.isFinite(parsedSubscriptionPeriod) && parsedSubscriptionPeriod > 0
                ? parsedSubscriptionPeriod
                : (currentProduct.subscriptionPeriod || 30),
            features: Array.isArray(productData.features) ? productData.features : (currentProduct.features || []),
            comparison: productData.comparison && typeof productData.comparison === 'object' && !Array.isArray(productData.comparison)
                ? productData.comparison
                : (currentProduct.comparison || {}),
            isActive: productData.isActive !== undefined ? Boolean(productData.isActive) : currentProduct.isActive !== false,
            updatedAt: new Date()
        };

        await setDoc(sectionRef, { products, updatedAt: new Date() }, { merge: true });

        return products[productIndex].id;
    } catch (error) {
        console.error("Error updating product in section:", error);
        throw error;
    }
}

/**
 * Удалить товар из раздела
 */
export async function deleteProductFromSection(sectionId, productId, fallbackIndex = null) {
    console.log("deleteProductFromSection called, sectionId:", sectionId, "productId:", productId, "db:", db ? "initialized" : "NOT initialized");

    if (!db) throw new Error("Firebase not configured");

    const parsedFallbackIndex = Number.parseInt(fallbackIndex, 10);
    const hasFallbackIndex = Number.isInteger(parsedFallbackIndex) && parsedFallbackIndex >= 0;
    if (!sectionId || (!productId && !hasFallbackIndex)) {
        console.error("deleteProductFromSection: sectionId and productId/fallbackIndex are required");
        throw new Error("ID раздела и товара обязательны");
    }

    try {
        const sectionRef = doc(db, COLLECTION_NAME, sectionId);
        const sectionSnap = await getDoc(sectionRef);

        if (!sectionSnap.exists()) {
            console.error("Section not found:", sectionId);
            throw new Error("Раздел не найден");
        }

        const sectionData = sectionSnap.data();
        const currentProducts = sectionData.products || [];
        const normalizedProductId = String(productId || '');
        let products = currentProducts.filter(p =>
            String(p?.id ?? p?.productId ?? '') !== normalizedProductId
        );

        // Legacy fallback: delete by index when id is absent or mismatched.
        if (products.length === currentProducts.length && hasFallbackIndex && parsedFallbackIndex < currentProducts.length) {
            products = currentProducts.filter((_, index) => index !== parsedFallbackIndex);
        }

        await setDoc(sectionRef, { products, updatedAt: new Date() }, { merge: true });

        return true;
    } catch (error) {
        console.error("Error deleting product from section:", error);
        throw error;
    }
}

/**
 * Инициализация разделов по умолчанию (для первой загрузки)
 */
export async function initDefaultSections() {
    console.log("initDefaultSections called, db:", db ? "initialized" : "NOT initialized");

    if (!db) {
        console.warn("Firebase not configured, skipping initDefaultSections");
        return;
    }

    try {
        const snapshot = await getDocs(collection(db, COLLECTION_NAME));
        const existingIds = new Set(snapshot.docs.map(doc => doc.id));
        if (!snapshot.empty) {
            console.log(`Found ${snapshot.size} existing sections, keeping them`);
            return;
        }

        // Создаём разделы по умолчанию, только если их нет в базе
        let createdCount = 0;
        for (const section of defaultSections) {
            if (!existingIds.has(section.id)) {
                await setDoc(doc(db, COLLECTION_NAME, section.id), {
                    ...section,
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
                createdCount++;
                console.log(`Created default section: ${section.id}`);
            }
        }

        if (createdCount > 0) {
            console.log(`Created ${createdCount} default tariff sections`);
        } else if (snapshot.empty) {
            // Если база пуста и нет defaultSections - создаём всё
            for (const section of defaultSections) {
                await setDoc(doc(db, COLLECTION_NAME, section.id), {
                    ...section,
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
            }
            console.log('Default tariff sections created (empty database)');
        } else {
            console.log(`Found ${snapshot.size} existing sections, keeping them`);
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
