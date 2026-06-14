import { db, auth } from './firebase';
import { collection, doc, setDoc, getDoc, getDocs, deleteDoc, query, onSnapshot, serverTimestamp, orderBy } from 'firebase/firestore';

export interface InvoiceItem {
  desc: string;
  qtd: number;
  preco: number;
  total: number;
}

export interface CustomField {
  key: string;
  value: string;
}

export interface HistoryRecord {
  id: string;
  date: string;
  num: string;
  type: string;
  client: string;
  total: number;
  items: InvoiceItem[];
  customFields?: CustomField[];
  userId?: string;
}

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
  authInfo: any;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // Not throwing to avoid crashing the app completely for non-critical writes in this simple app
}

export async function ensureUserDoc() {
  if (!auth.currentUser) return;
  const userId = auth.currentUser.uid;
  const userDocRef = doc(db, 'users', userId);
  
  try {
    const snap = await getDoc(userDocRef);
    if (!snap.exists()) {
      await setDoc(userDocRef, {
        email: auth.currentUser.email,
        createdAt: serverTimestamp()
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${userId}`);
  }
}

export async function saveInvoiceToFirebase(record: HistoryRecord) {
  if (!auth.currentUser) return;
  const userId = auth.currentUser.uid;
  const invDocRef = doc(db, 'users', userId, 'invoices', record.id);
  
  try {
    await ensureUserDoc();

    // Check if it exists for update vs create rules
    let snap;
    try {
      snap = await getDoc(invDocRef);
    } catch (err) {
      // If offline, we might not be able to check existence, but we can try to setDoc anyway
      // setDoc with merge:true is safe
      console.warn('Offline getDoc failed, attempting merge setDoc', err);
    }

    if (snap?.exists()) {
       await setDoc(invDocRef, {
        num: record.num,
        date: record.date,
        type: record.type,
        client: record.client,
        total: record.total,
        items: record.items,
        customFields: record.customFields || [],
        updatedAt: serverTimestamp()
      }, { merge: true });
    } else {
      await setDoc(invDocRef, {
        ...record,
        customFields: record.customFields || [],
        userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `users/${userId}/invoices/${record.id}`);
  }
}

export async function removeInvoiceFromFirebase(invoiceId: string) {
  if (!auth.currentUser) return;
  const userId = auth.currentUser.uid;
  const invDocRef = doc(db, 'users', userId, 'invoices', invoiceId);
  try {
    await deleteDoc(invDocRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${userId}/invoices/${invoiceId}`);
  }
}

export function subscribeToInvoices(callback: (invoices: HistoryRecord[]) => void) {
  if (!auth.currentUser) return () => {};
  const userId = auth.currentUser.uid;
  const invoicesRef = collection(db, 'users', userId, 'invoices');
  
  const q = query(invoicesRef, orderBy('createdAt', 'desc'));
  
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => {
      const docData = doc.data() as HistoryRecord;
      return {
        ...docData,
        id: doc.id
      };
    });
    callback(data);
  }, (err) => {
    handleFirestoreError(err, OperationType.LIST, `users/${userId}/invoices`);
  });
}
