import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

//le o arquivo do fire
const serviceAccount = JSON.parse(fs.readFileSync('./mathstats-firebase-adminsdk-fbsvc-0d93ccc6d5.json', 'utf8'));

if (getApps().length === 0) {
    initializeApp({
        credential: cert(serviceAccount)
    });
}

export const db = getFirestore();