import { db } from './firebase.js';
const sleepLogs = () => db.collection('sleepLogs');
const fatigueLogs = () => db.collection('fatigueLogs');

export async function addSleepLog({ userId, date, sleepStart, sleepEnd }) {
    const ref = sleepLogs().doc();
    await ref.set({ userId, date, sleepStart, sleepEnd });
    return { id: ref.id };
}
export async function listSleepLogsByDateRange({ userId, fromDate, toDate }) {
    const s = await sleepLogs()
        .where('userId', '==', userId)
        .where('date', '>=', fromDate)
        .where('date', '<=', toDate)
        .orderBy('date', 'asc')
        .get();
    return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function addFatigueLog({ userId, recordedAt, type, value }) {
    const ref = fatigueLogs().doc();
    await ref.set({ userId, recordedAt, type, value });
    return { id: ref.id };
}
