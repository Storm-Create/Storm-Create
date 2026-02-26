import { db } from './firebase.js';
import { collection, getDocs, addDoc, deleteDoc, doc, query, orderBy, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const COLLECTION_NAME = 'comments';

export async function getComments(postId) {
    if (!db) return [];
    try {
        const q = query(collection(db, COLLECTION_NAME), where('postId', '==', postId));
        const snapshot = await getDocs(q);
        const comments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Sort explicitly in memory to avoid requiring a composite index in Firestore
        comments.sort((a, b) => {
            const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
            const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
            return dateB - dateA; // Descending
        });

        return comments;
    } catch (e) {
        console.error("Error getting comments:", e);
        return [];
    }
}

export async function addComment(postId, author, text) {
    if (!db) throw new Error("Firebase not configured");
    const comment = {
        postId,
        author,
        text,
        createdAt: new Date()
    };
    return await addDoc(collection(db, COLLECTION_NAME), comment);
}

export async function deleteComment(id) {
    if (!db) throw new Error("Firebase not configured");
    return await deleteDoc(doc(db, COLLECTION_NAME, id));
}

export async function getAllComments() {
    if (!db) return [];
    try {
        const q = query(collection(db, COLLECTION_NAME), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error("Error getting all comments:", e);
        return [];
    }
}
