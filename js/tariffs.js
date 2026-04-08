import { db } from './firebase.js';
import { collection, getDocs, addDoc, deleteDoc, doc, setDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const COLLECTION_NAME = 'tariffs';

export async function getTariffs() {
    if (!db) return [];
    try {
        const q = query(collection(db, COLLECTION_NAME), orderBy('price', 'asc'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error("Error getting tariffs:", e);
        return [];
    }
}

export async function saveTariff(tariff) {
    if (!db) throw new Error("Firebase not configured");

    const tariffData = {
        name: tariff.name.trim(),
        price: Number(tariff.price),
        description: tariff.description?.trim() || '',
        productsLimit: Number(tariff.productsLimit) || 0,
        features: tariff.features ? tariff.features.split(',').map(f => f.trim()).filter(f => f) : [],
        isPopular: Boolean(tariff.isPopular),
        isActive: Boolean(tariff.isActive),
        createdAt: tariff.createdAt || new Date(),
        updatedAt: new Date()
    };

    if (tariff.id) {
        // Update existing
        await setDoc(doc(db, COLLECTION_NAME, tariff.id), tariffData, { merge: true });
        return tariff.id;
    } else {
        // Create new
        const docRef = await addDoc(collection(db, COLLECTION_NAME), tariffData);
        return docRef.id;
    }
}

export async function deleteTariff(id) {
    if (!db) throw new Error("Firebase not configured");
    return await deleteDoc(doc(db, COLLECTION_NAME, id));
}
