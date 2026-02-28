import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { initializeFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { firebaseConfig } from '../firebase-config.js';

let app, db, auth, storage;

try {
    if (firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY") {
        console.log("Initializing Firebase with config:", {
            authDomain: firebaseConfig.authDomain,
            projectId: firebaseConfig.projectId
        });

        app = initializeApp(firebaseConfig);

        // Use initializeFirestore with experimentalForceLongPolling to fix connection issues in some regions/VPNs
        db = initializeFirestore(app, {
            experimentalForceLongPolling: true
        });

        auth = getAuth(app);
        storage = getStorage(app);

        console.log("Firebase initialized successfully");
    } else {
        console.warn("Firebase is not configured. Please update firebase-config.js");
    }
} catch (error) {
    console.error("Error initializing Firebase:", error);
}

export { app, db, auth, storage };
