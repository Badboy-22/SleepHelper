import 'dotenv/config';
import admin from 'firebase-admin';

const app = admin.apps.length
    ? admin.app()
    : admin.initializeApp({
        credential: admin.credential.applicationDefault(), // GOOGLE_APPLICATION_CREDENTIALS 사용
        projectId: process.env.FIREBASE_PROJECT_ID,
    });

export const db = admin.firestore(app);
export const FieldValue = admin.firestore.FieldValue;