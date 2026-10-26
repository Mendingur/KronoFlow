import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  setDoc,
  getDoc,
  collection,
  getDocs,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Transaction, Habit, TaskItem } from '../types';

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/presentations.readonly',
  'https://www.googleapis.com/auth/documents.readonly',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/meetings.space.created',
  'https://www.googleapis.com/auth/chat.spaces.readonly',
  'https://www.googleapis.com/auth/forms.body.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

const provider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  provider.addScope(scope);
}

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else if (!isSigningIn) {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Không lấy được mã truy cập OAuth từ Google.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

// Synchronize state with Firestore adhering strictly to firebase-blueprint.json & firestore.rules
export async function syncDataToFirestore(
  userId: string,
  monthlyBudget: number,
  transactions: Transaction[],
  habits: Habit[],
  tasks: TaskItem[]
) {
  const userPath = `users/${userId}`;
  try {
    const existingDoc = await getDoc(doc(db, 'users', userId));
    if (!existingDoc.exists()) {
      await setDoc(doc(db, 'users', userId), {
        ownerId: userId,
        monthlyBudget: Math.min(100000000000, Math.max(0, monthlyBudget)),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(
        doc(db, 'users', userId),
        {
          ownerId: userId,
          monthlyBudget: Math.min(100000000000, Math.max(0, monthlyBudget)),
          createdAt: existingDoc.data().createdAt,
          updatedAt: serverTimestamp(),
        },
        { merge: false }
      );
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }

  for (const tx of transactions.slice(0, 50)) {
    const safeId = tx.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
    const txPath = `users/${userId}/transactions/${safeId}`;
    try {
      const existingTx = await getDoc(doc(db, 'users', userId, 'transactions', safeId));
      await setDoc(doc(db, 'users', userId, 'transactions', safeId), {
        ownerId: userId,
        amount: Math.min(100000000000, Math.max(1, tx.amount)),
        type: tx.type === 'income' ? 'income' : 'expense',
        category: String(tx.category).slice(0, 64),
        note: String(tx.note || '').slice(0, 300),
        date: String(tx.date).slice(0, 32),
        createdAt: existingTx.exists() ? existingTx.data().createdAt : serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, txPath);
    }
  }

  for (const hb of habits.slice(0, 30)) {
    const safeId = hb.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
    const hbPath = `users/${userId}/habits/${safeId}`;
    try {
      const existingHb = await getDoc(doc(db, 'users', userId, 'habits', safeId));
      await setDoc(doc(db, 'users', userId, 'habits', safeId), {
        ownerId: userId,
        title: String(hb.title).slice(0, 120),
        category: String(hb.category).slice(0, 64),
        completedDates: hb.completedDates.slice(0, 366).map((d) => String(d).slice(0, 16)),
        createdAt: existingHb.exists() ? existingHb.data().createdAt : serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, hbPath);
    }
  }

  for (const tsk of tasks.slice(0, 50)) {
    const safeId = tsk.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
    const tskPath = `users/${userId}/tasks/${safeId}`;
    try {
      const existingTsk = await getDoc(doc(db, 'users', userId, 'tasks', safeId));
      await setDoc(doc(db, 'users', userId, 'tasks', safeId), {
        ownerId: userId,
        title: String(tsk.title).slice(0, 200),
        priority: tsk.priority,
        deadline: String(tsk.deadline).slice(0, 32),
        status: tsk.status,
        createdAt: existingTsk.exists() ? existingTsk.data().createdAt : serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, tskPath);
    }
  }
}

export async function loadDataFromFirestore(userId: string) {
  const userPath = `users/${userId}`;
  try {
    const userSnap = await getDoc(doc(db, 'users', userId));
    if (!userSnap.exists()) return null;

    const txSnap = await getDocs(collection(db, 'users', userId, 'transactions'));
    const hbSnap = await getDocs(collection(db, 'users', userId, 'habits'));
    const tskSnap = await getDocs(collection(db, 'users', userId, 'tasks'));

    return {
      monthlyBudget: userSnap.data().monthlyBudget as number,
      transactions: txSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Transaction, 'id'>),
      })),
      habits: hbSnap.docs.map((d) => ({
        id: d.id,
        targetDaysPerWeek: 7,
        ...(d.data() as Omit<Habit, 'id' | 'targetDaysPerWeek'>),
      })),
      tasks: tskSnap.docs.map((d) => ({
        id: d.id,
        subtasks: [],
        ...(d.data() as Omit<TaskItem, 'id' | 'subtasks'>),
      })),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }
}

export async function deleteFirestoreItem(
  userId: string,
  subcollection: 'transactions' | 'habits' | 'tasks',
  itemId: string
) {
  const safeId = itemId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  const path = `users/${userId}/${subcollection}/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, subcollection, safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
