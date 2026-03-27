import { auth } from './firebase.js';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile,
    GoogleAuthProvider,
    OAuthProvider,
    signInWithPopup,
    sendPasswordResetEmail,
    sendSignInLinkToEmail,
    isSignInWithEmailLink,
    signInWithEmailLink,
    sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// ── Providers ────────────────────────────────────────────────────────────────
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('profile');
googleProvider.addScope('email');

const appleProvider = new OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');

// Storage key for magic-link flow
const EMAIL_LINK_KEY = 'stormcreate_email_signin_link';

// ── Helpers ──────────────────────────────────────────────────────────────────
function assertAuth() {
    if (!auth) throw new Error('Firebase не настроен');
}

// ── Core email/password ───────────────────────────────────────────────────────

export async function login(email, password) {
    assertAuth();
    return signInWithEmailAndPassword(auth, email, password);
}

export async function register(email, password, displayName) {
    assertAuth();
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: displayName || 'Пользователь' });
    // Send verification email automatically
    await sendEmailVerification(cred.user);
    await cred.user.reload();
    return auth.currentUser;
}

export function logout() {
    assertAuth();
    return signOut(auth);
}

export function updateUserProfile(displayName, photoURL) {
    if (!auth?.currentUser) throw new Error('Пользователь не авторизован');
    const payload = { displayName };
    if (photoURL !== undefined) payload.photoURL = photoURL;
    return updateProfile(auth.currentUser, payload);
}

// ── Google ────────────────────────────────────────────────────────────────────

export async function loginWithGoogle() {
    assertAuth();
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
}

// ── Apple (Sign in with Apple / Game Center on iOS) ───────────────────────────

export async function loginWithApple() {
    assertAuth();
    const result = await signInWithPopup(auth, appleProvider);
    // Apple may return a credential with name/email on first sign-in only
    const credential = OAuthProvider.credentialFromResult(result);
    const user = result.user;
    // If user doesn't have a display name yet, try to get it from additionalUserInfo
    if (!user.displayName) {
        const info = result.additionalUserInfo;
        const profile = info?.profile;
        const appleFullName =
            (profile?.name?.firstName || '') + ' ' + (profile?.name?.lastName || '');
        const trimmed = appleFullName.trim();
        if (trimmed) await updateProfile(user, { displayName: trimmed });
    }
    return user;
}

// ── Password reset ────────────────────────────────────────────────────────────

export async function resetPassword(email) {
    assertAuth();
    await sendPasswordResetEmail(auth, email, {
        // Optional: redirect back after reset
        url: window.location.origin + '/index.html'
    });
}

// ── Magic link (passwordless email OTP) ──────────────────────────────────────

export async function sendMagicLink(email) {
    assertAuth();
    const actionCodeSettings = {
        // Must be whitelisted in Firebase Console → Authentication → Sign-in methods → Authorized domains
        url: window.location.href,
        handleCodeInApp: true,
    };
    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    // Save email so we can complete sign-in on same device
    localStorage.setItem(EMAIL_LINK_KEY, email);
}

/**
 * Call on page load — completes magic-link sign-in if the URL contains a sign-in link.
 * Returns the signed-in user, or null if the URL is not a magic link.
 */
export async function completeMagicLinkSignIn() {
    assertAuth();
    if (!isSignInWithEmailLink(auth, window.location.href)) return null;

    let email = localStorage.getItem(EMAIL_LINK_KEY);
    if (!email) {
        // Different device / browser — ask user to confirm
        email = window.prompt(
            'Для входа подтвердите ваш email адрес:'
        );
    }
    if (!email) return null;

    const result = await signInWithEmailLink(auth, email, window.location.href);
    localStorage.removeItem(EMAIL_LINK_KEY);

    // Clean the URL so the link can't be reused
    window.history.replaceState(
        {},
        document.title,
        window.location.pathname
    );

    return result.user;
}

// ── Telegram ──────────────────────────────────────────────────────────────────

export async function loginWithTelegram(tgUser) {
    assertAuth();
    const email = `${tgUser.id}@telegram.stormcreate.com`;
    const password = `tg_auth_${tgUser.id}_secure_mock_pwd_2026`;
    const displayName =
        [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') ||
        tgUser.username ||
        'Пользователь Telegram';

    try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, {
            displayName,
            photoURL: tgUser.photo_url || ''
        });
        return cred.user;
    } catch (err) {
        if (
            err.code === 'auth/user-not-found' ||
            err.code === 'auth/invalid-credential' ||
            err.code === 'auth/invalid-login-credentials'
        ) {
            const newCred = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(newCred.user, {
                displayName,
                photoURL: tgUser.photo_url || ''
            });
            return newCred.user;
        }
        throw err;
    }
}

// ── Auth state ────────────────────────────────────────────────────────────────

export function checkAuth(callback) {
    if (!auth) { callback(null); return; }
    onAuthStateChanged(auth, user => callback(user));
}

// ── Auto-complete magic link on page load ─────────────────────────────────────
// Import this module on any page that accepts magic-link redirects.
// The promise resolves with the user if the URL contained a sign-in link.
export const magicLinkCompletion = (async () => {
    try {
        if (!auth) return null;
        return await completeMagicLinkSignIn();
    } catch {
        return null;
    }
})();
