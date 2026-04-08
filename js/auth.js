import { auth } from './firebase.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

export function login(email, password) {
    if (!auth) throw new Error("Firebase not configured");
    return signInWithEmailAndPassword(auth, email, password);
}

export async function register(email, password, displayName) {
    if (!auth) throw new Error("Firebase not configured");
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCredential.user, { displayName });
    await userCredential.user.reload();
    return auth.currentUser;
}

export function logout() {
    if (!auth) throw new Error("Firebase not configured");
    return signOut(auth);
}

export function updateUserProfile(displayName, photoURL) {
    if (!auth || !auth.currentUser) throw new Error("Firebase not configured or user not logged in");
    const updateData = { displayName };
    if (photoURL !== undefined) {
        updateData.photoURL = photoURL;
    }
    return updateProfile(auth.currentUser, updateData);
}

export async function loginWithTelegram(tgUser) {
    if (!auth) throw new Error("Firebase not configured");

    // Create a mock email and secure password based on Telegram ID
    // Note: In a real production app, this should be handled by a secure backend
    // using Firebase Custom Tokens. This is a client-side workaround for static hosting.
    const email = `${tgUser.id}@telegram.stormcreate.com`;
    const password = `tg_auth_${tgUser.id}_secure_mock_pwd_2026`;
    const displayName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || tgUser.username || 'Пользователь Telegram';

    try {
        // Try to login if user already exists
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        // Update profile in case they changed their name/photo in Telegram
        await updateProfile(userCredential.user, {
            displayName: displayName,
            photoURL: tgUser.photo_url || ''
        });
        return userCredential.user;
    } catch (error) {
        // If user doesn't exist, create a new one
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential' || error.code === 'auth/invalid-login-credentials') {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(userCredential.user, {
                displayName: displayName,
                photoURL: tgUser.photo_url || ''
            });
            return userCredential.user;
        }
        throw error;
    }
}


export async function loginWithGoogle() {
    if (!auth) throw new Error("Firebase not configured");
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, provider);
    return result.user;
}

export function checkAuth(callback) {
    if (!auth) {
        callback(null);
        return;
    }
    onAuthStateChanged(auth, user => {
        callback(user);
    });
}
