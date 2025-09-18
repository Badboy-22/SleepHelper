import { db } from './firebase.js';
const users = () => db.collection('users');
const usernames = () => db.collection('usernames');

export async function createUserUnique({ username, passwordHash }) {
    return await db.runTransaction(async (tx) => {
        const unameRef = usernames().doc(username);
        if ((await tx.get(unameRef)).exists) throw new Error('USERNAME_TAKEN');
        const now = new Date();
        const userRef = users().doc();
        tx.set(userRef, { username, passwordHash, createdAt: now });
        tx.set(unameRef, { userId: userRef.id, at: now });
        return { id: userRef.id, username, passwordHash, createdAt: now };
    });
}
export async function findUserByUsername(username) {
    const s = await users().where('username', '==', username).limit(1).get();
    return s.empty ? null : ({ id: s.docs[0].id, ...s.docs[0].data() });
}
export async function findUserById(id) {
    const d = await users().doc(id).get();
    return d.exists ? ({ id: d.id, ...d.data() }) : null;
}
export async function updateLastLoginAt(userId) {
    await users().doc(userId).set({ lastLoginAt: new Date() }, { merge: true });
}
