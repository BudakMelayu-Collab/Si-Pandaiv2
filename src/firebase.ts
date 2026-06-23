import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  User,
  indexedDBLocalPersistence,
  setPersistence
} from 'firebase/auth';
import { 
  getFirestore,
  initializeFirestore,
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  doc, 
  getDocs, 
  query, 
  where,
  orderBy, 
  setDoc,
  getDocFromServer,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  getDoc,
  DocumentReference,
  DocumentSnapshot,
  limit
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { Recipient, AidStatus, PPDRecord, MonthlyPayment, AppSettings, Announcement, Assessment, UserConfig, SystemLog } from './types';
import { evaluateRecipientStatus } from './lib/utils';

// Priority: JSON Config > Env Vars (to allow user overrides in the UI)
const finalConfig = {
  apiKey: firebaseConfig?.apiKey || import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: firebaseConfig?.authDomain || import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: firebaseConfig?.projectId || import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: firebaseConfig?.storageBucket || import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: firebaseConfig?.messagingSenderId || import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: firebaseConfig?.appId || import.meta.env.VITE_FIREBASE_APP_ID || '',
};

// Use explicit ID from config, then env, or fall back to default
const dbIdFromJson = (firebaseConfig as any)?.firestoreDatabaseId;
const dbIdFromEnv = import.meta.env.VITE_FIREBASE_DATABASE_ID;
const dbId = (dbIdFromJson && dbIdFromJson !== "" ? dbIdFromJson : null) || dbIdFromEnv || '(default)';

console.log('Firebase Initialization Status:');
console.log('- Project ID (Active):', finalConfig.projectId || 'NOT SET');
console.log('- JSON Project ID:', firebaseConfig?.projectId || 'NOT SET');
console.log('- Env Project ID:', import.meta.env.VITE_FIREBASE_PROJECT_ID || 'NOT SET');
console.log('- API Key:', finalConfig.apiKey ? 'PRESENT (First 5 chars: ' + finalConfig.apiKey.substring(0, 5) + '...)' : 'MISSING');
console.log('- Database ID:', dbId);

if (!finalConfig.apiKey || !finalConfig.projectId) {
  console.warn('Firebase configuration is incomplete. Authentication and Database features will be unavailable.');
}

const app = initializeApp(finalConfig);

console.log('Using Firestore Database Instance:', dbId);

// Initialize Firestore with long polling to ensure reliability in proxy/iframe/containers
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, dbId === '(default)' ? undefined : dbId);

export const auth = getAuth(app);

// Attempt to set persistence to indexedDB which is more reliable in some iframes
setPersistence(auth, indexedDBLocalPersistence).catch(err => {
  console.warn('Auth persistence could not be set to indexedDB:', err);
});

const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');

let cachedGoogleAccessToken: string | null = null;

// Listen for auth state changes to clear token on logout
onAuthStateChanged(auth, (user) => {
  if (!user) {
    cachedGoogleAccessToken = null;
  }
});

export const getGoogleAccessToken = () => cachedGoogleAccessToken;
export const setGoogleAccessToken = (token: string | null) => {
  cachedGoogleAccessToken = token;
};

export const fetchServiceAccountDriveToken = async (): Promise<string | null> => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) return null;
    
    // Get Firebase ID Token
    const idToken = await currentUser.getIdToken();
    
    // Call server API endpoint
    const response = await fetch('/api/gdrive/token', {
      headers: {
        'Authorization': `Bearer ${idToken}`
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.accessToken || null;
    }
  } catch (error) {
    console.error("Gagal mendapatkan Token Google Drive Service Account dari server:", error);
  }
  return null;
};

export const fetchSharedGoogleAccessToken = async (): Promise<string | null> => {
  try {
    // 1. Prioritaskan Google Service Account (Akses Otomatis Tanpa Login Ulang)
    const saToken = await fetchServiceAccountDriveToken();
    if (saToken) {
      return saToken;
    }

    // 2. Fallback ke akses manual Google Drive Super Admin
    const docRef = doc(db, 'settings', 'gdrive_token');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      return data.accessToken || null;
    }
  } catch (error) {
    console.error("Gagal mengambil token shared Google Drive dari Firestore:", error);
  }
  return null;
};

export const validateGoogleToken = async (token: string): Promise<boolean> => {
  try {
    const res = await fetch('https://www.googleapis.com/drive/v3/files?pageSize=1', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.ok;
  } catch (e) {
    return false;
  }
};

const handleDriveFetch = async (url: string, options?: RequestInit) => {
  const res = await fetch(url, options);
  if (res.status === 401) {
    cachedGoogleAccessToken = null;
    try {
      const { deleteDoc, doc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'settings', 'gdrive_token'));
    } catch(e) {
      console.warn('Failed to delete expired GDrive token from Firestore', e);
    }
    throw new Error('Sesi Google Drive kadaluarsa (Token berlaku 1 Jam). Silakan hubungi Super Admin (muhammad.nawa@gmail.com) di menu Form Pendaftaran untuk mengklik tombol "Sambungkan Kembali Drive Super Admin".');
  }
  return res;
};

const getFileExtensionFromBase64 = (base64DataUrl: string): string => {
  if (base64DataUrl.includes('data:image/png')) return '.png';
  if (base64DataUrl.includes('data:image/jpeg') || base64DataUrl.includes('data:image/jpg')) return '.jpg';
  if (base64DataUrl.includes('data:application/pdf')) return '.pdf';
  return '.pdf'; // Default
};

export const uploadBase64ToGoogleDrive = async (
  base64DataUrl: string, 
  filename: string,
  recipientName: string = 'Umum',
  recipientIdOrNik: string = '',
  sector: string = 'Umum',
  programName: string = ''
): Promise<{ id: string; webViewLink: string }> => {
  let token = getGoogleAccessToken();
  if (!token) {
    token = await fetchSharedGoogleAccessToken();
    if (token) {
      cachedGoogleAccessToken = token;
    }
  }
  if (!token) {
    throw new Error("Sesi Google Drive Super Admin belum diaktifkan atau telah kadaluarsa. Silakan hubungi Super Admin (muhammad.nawa@gmail.com) di menu Form Pendaftaran untuk mendelegasikan/menyambungkan kembali Google Drive Super Admin.");
  }

  // Parse mime type and base64 helper
  const parts = base64DataUrl.split(',');
  const mimeTypeMatch = parts[0].match(/:(.*?);/);
  const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'application/pdf';
  const base64Content = parts[1] || parts[0];

  // Resolve directory parent
  const parentId = await getOrCreateFolderHierarchy(recipientName, token, recipientIdOrNik, sector, programName);

  const metadata: any = {
    name: filename,
    mimeType: mimeType,
  };
  if (parentId && parentId !== 'root') {
    metadata.parents = [parentId];
  }

  const boundary = 'foo_bar_baz_multipart';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: ' + mimeType + '\r\n' +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    base64Content +
    closeDelimiter;

  const response = await handleDriveFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gagal mengunggah ke Google Drive: ${response.statusText}. Detail: ${errorText}`);
  }

  const result = await response.json();
  return { id: result.id, webViewLink: `https://drive.google.com/file/d/${result.id}/view?usp=drivesdk` };
};

export const syncFileToGoogleDriveIfConnected = async (
  base64: string,
  docTypeLabel: string,
  recipientName: string,
  recipientIdOrNik: string = '',
  sector: string = 'Umum',
  programName: string = ''
): Promise<string> => {
  let token = getGoogleAccessToken();
  if (!token) {
    token = await fetchSharedGoogleAccessToken();
    if (token) {
      cachedGoogleAccessToken = token;
    }
  }
  if (token) {
    try {
      const ext = getFileExtensionFromBase64(base64);
      const cleanLabel = docTypeLabel.trim();
      const cleanName = recipientName.replace(/[^a-zA-Z0-9 ]/g, '').trim();
      const filename = `${cleanLabel} - ${cleanName}${ext}`;
      
      console.log(`Auto uploading ${filename} to Google Drive under recipient folder ${recipientName}...`);
      const gdriveRes = await uploadBase64ToGoogleDrive(base64, filename, recipientName, recipientIdOrNik, sector, programName);
      return `gdrive:${gdriveRes.id}`;
    } catch (err: any) {
      console.error(`Gagal mengunggah otomatis ke Google Drive:`, err);
      if (err?.message?.includes('kadaluarsa')) {
        alert(err.message);
      }
    }
  }
  return base64; // Fallback to base64
};

export const ensureGoogleDriveConnected = async (): Promise<boolean> => {
  let token = getGoogleAccessToken();
  if (!token) {
    token = await fetchSharedGoogleAccessToken();
    if (token) {
      cachedGoogleAccessToken = token;
    }
  }

  // Active validation to detect expired tokens before doing GDrive ops
  if (token) {
    const isValid = await validateGoogleToken(token);
    if (!isValid) {
      console.warn("Detected expired or invalid Google Drive token in ensureGoogleDriveConnected. Clearing document...");
      cachedGoogleAccessToken = null;
      token = null;
      try {
        const { deleteDoc, doc } = await import('firebase/firestore');
        await deleteDoc(doc(db, 'settings', 'gdrive_token'));
      } catch (e) {
        console.warn('Failed to delete expired GDrive token from Firestore during validation', e);
      }
    }
  }

  if (!token) {
    const currentUser = auth.currentUser;
    const isSuperAdmin = currentUser?.email === 'muhammad.nawa@gmail.com';
    if (isSuperAdmin) {
      const confirmOAuth = window.confirm(
        "Sesi Google Drive Super Admin belum terhubung atau kadaluarsa.\n\nHubungkan akun Google Drive Super Admin Anda sekarang agar seluruh Staff dapat melakukan sinkronisasi otomatis?"
      );
      if (confirmOAuth) {
        try {
          await loginWithGoogle();
          token = getGoogleAccessToken();
        } catch (e: any) {
          console.error("Gagal menghubungkan Google Drive:", e);
          alert("Gagal menghubungkan Google Drive: " + (e.message || e));
        }
      }
    } else {
      console.warn("Shared Google Drive token is missing or expired. Falling back to local Firestore storage.");
    }
  }
  return !!token;
};

// Folder Cache to optimize network roundtrips
const folderCache: Record<string, string> = {};

export const getOrCreateFolderHierarchy = async (
  recipientName: string,
  token: string,
  recipientIdOrNik: string = '',
  sector: string = 'Umum',
  programName: string = ''
): Promise<string> => {
  const mainFolderName = 'SI-PANDAI Berkas Administratif';
  const cleanSector = (sector || 'Umum').trim();
  const cleanProgram = (programName || '').trim();
  
  // Create beautiful uppercase folder name for each recipient
  const cleanRecipient = (recipientName || 'Umum').trim()
    .toUpperCase()
    .replace(/[/\\?%*:|"<>\s]+/g, '_');
  const cleanNikOrId = (recipientIdOrNik || '').trim()
    .replace(/[/\\?%*:|"<>\s]+/g, '_');
  
  const recipientFolderName = `${cleanRecipient}${cleanNikOrId ? `_${cleanNikOrId}` : ''}`;
  const cacheKey = `${mainFolderName}/${cleanSector}/${cleanProgram ? `${cleanProgram}/` : ''}${recipientFolderName}`;
  
  if (folderCache[cacheKey]) {
    return folderCache[cacheKey];
  }
  
  try {
    // 1. Get or create main folder
    let mainFolderId = folderCache[mainFolderName];
    if (!mainFolderId) {
      const qMain = `name='${mainFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;
      const searchMainUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(qMain)}&fields=files(id)`;
      
      const searchMainRes = await handleDriveFetch(searchMainUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (searchMainRes.ok) {
        const data = await searchMainRes.json();
        if (data.files && data.files.length > 0) {
          mainFolderId = data.files[0].id;
        }
      }
      
      if (!mainFolderId) {
        const createMainRes = await handleDriveFetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: mainFolderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: ['root']
          })
        });
        
        if (createMainRes.ok) {
          const data = await createMainRes.json();
          mainFolderId = data.id;
        } else {
          console.error("Gagal membuat folder utama di Google Drive:", await createMainRes.text());
        }
      }
      
      if (mainFolderId) {
        folderCache[mainFolderName] = mainFolderId;
      }
    }
    
    if (!mainFolderId) {
      return 'root';
    }

    // 2. Get or create Sector (bidang) folder under the main folder
    const sectorCacheKey = `${mainFolderName}/${cleanSector}`;
    let sectorFolderId = folderCache[sectorCacheKey];
    if (!sectorFolderId) {
      const qSector = `name='${cleanSector.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${mainFolderId}' in parents and trashed=false`;
      const searchSectorUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(qSector)}&fields=files(id)`;
      
      const searchSectorRes = await handleDriveFetch(searchSectorUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (searchSectorRes.ok) {
        const data = await searchSectorRes.json();
        if (data.files && data.files.length > 0) {
          sectorFolderId = data.files[0].id;
        }
      }
      
      if (!sectorFolderId) {
        const createSectorRes = await handleDriveFetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: cleanSector,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [mainFolderId]
          })
        });
        
        if (createSectorRes.ok) {
          const data = await createSectorRes.json();
          sectorFolderId = data.id;
        } else {
          console.error(`Gagal membuat folder bidang ${cleanSector}:`, await createSectorRes.text());
        }
      }
      
      if (sectorFolderId) {
        folderCache[sectorCacheKey] = sectorFolderId;
      }
    }

    let parentFolderIdForRecipient = sectorFolderId || mainFolderId;

    // 2b. Optional: Get or create Program folder under Bidang
    if (cleanProgram && cleanProgram !== '-') {
      const programCacheKey = `${mainFolderName}/${cleanSector}/${cleanProgram}`;
      let programFolderId = folderCache[programCacheKey];
      if (!programFolderId) {
        const qProgram = `name='${cleanProgram.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentFolderIdForRecipient}' in parents and trashed=false`;
        const searchProgramUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(qProgram)}&fields=files(id)`;
        
        const searchProgramRes = await handleDriveFetch(searchProgramUrl, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (searchProgramRes.ok) {
          const data = await searchProgramRes.json();
          if (data.files && data.files.length > 0) {
            programFolderId = data.files[0].id;
          }
        }
        
        if (!programFolderId) {
          const createProgramRes = await handleDriveFetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: cleanProgram,
              mimeType: 'application/vnd.google-apps.folder',
              parents: [parentFolderIdForRecipient]
            })
          });
          
          if (createProgramRes.ok) {
            const data = await createProgramRes.json();
            programFolderId = data.id;
          } else {
            console.error(`Gagal membuat folder program ${cleanProgram}:`, await createProgramRes.text());
          }
        }
        
        if (programFolderId) {
          folderCache[programCacheKey] = programFolderId;
        }
      }
      if (programFolderId) {
        parentFolderIdForRecipient = programFolderId;
      }
    }
    
    // 3. Get or create subfolder inside Sector or Program folder for this specific recipient
    let subFolderId = '';
    const qSub = `name='${recipientFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentFolderIdForRecipient}' in parents and trashed=false`;
    const searchSubUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(qSub)}&fields=files(id)`;
    
    const searchSubRes = await handleDriveFetch(searchSubUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (searchSubRes.ok) {
      const data = await searchSubRes.json();
      if (data.files && data.files.length > 0) {
        subFolderId = data.files[0].id;
      }
    }
    
    if (!subFolderId) {
      const createSubRes = await handleDriveFetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: recipientFolderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentFolderIdForRecipient]
        })
      });
      
      if (createSubRes.ok) {
        const data = await createSubRes.json();
        subFolderId = data.id;
      } else {
        console.error(`Gagal membuat subfolder ${recipientFolderName}:`, await createSubRes.text());
      }
    }
    
    if (subFolderId) {
      folderCache[cacheKey] = subFolderId;
      return subFolderId;
    }
    
    return parentFolderIdForRecipient;
  } catch (error: any) {
    console.error("Gagal memproses struktur folder Google Drive:", error);
    if (error?.message?.includes('Otorisasi Google Drive kadaluarsa')) {
      throw error;
    }
    return 'root';
  }
};

export const uploadFileToGoogleDrive = async (
  file: File,
  recipientName: string = 'Umum',
  recipientIdOrNik: string = '',
  slotLabel: string = '',
  sector: string = 'Umum',
  programName: string = ''
): Promise<{ id: string; webViewLink: string }> => {
  let token = getGoogleAccessToken();
  if (!token) {
    token = await fetchSharedGoogleAccessToken();
    if (token) {
      cachedGoogleAccessToken = token;
    }
  }
  if (!token) {
    throw new Error("Sesi Google Drive Super Admin belum diaktifkan atau telah kadaluarsa. Silakan hubungi Super Admin (muhammad.nawa@gmail.com) di menu Form Pendaftaran untuk mendelegasikan/menyambungkan kembali Google Drive Super Admin.");
  }

  // Resolve directory parent
  const parentId = await getOrCreateFolderHierarchy(recipientName, token, recipientIdOrNik, sector, programName);

  // Create boundary
  const boundary = 'foo_bar_baz';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  let displayFilename = file.name;
  if (slotLabel) {
    const extIdx = file.name.lastIndexOf('.');
    const ext = extIdx !== -1 ? file.name.slice(extIdx) : '';
    const baseName = extIdx !== -1 ? file.name.substring(0, extIdx) : file.name;
    // Avoid double labeling if filename already contains slotLabel
    if (!baseName.toLowerCase().includes(slotLabel.toLowerCase())) {
      displayFilename = `${slotLabel} - ${file.name}`;
    }
  }

  const metadata: any = {
    name: displayFilename,
    mimeType: file.type || 'application/octet-stream',
  };
  if (parentId && parentId !== 'root') {
    metadata.parents = [parentId];
  }

  // Convert file content to base64 to build the multipart message body
  const base64Content = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Get only the base64 part
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: ' + (file.type || 'application/octet-stream') + '\r\n' +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    base64Content +
    closeDelimiter;

  const response = await handleDriveFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gagal mengunggah ke Google Drive: ${response.statusText}. Detail: ${errorText}`);
  }

  const result = await response.json();
  return { id: result.id, webViewLink: `https://drive.google.com/file/d/${result.id}/view?usp=drivesdk` };
};

export const downloadGoogleDriveFileAsBase64 = async (fileId: string): Promise<string | null> => {
  try {
    let token = getGoogleAccessToken();
    if (!token) {
      token = await fetchSharedGoogleAccessToken();
      if (token) {
        cachedGoogleAccessToken = token;
      }
    }
    if (!token) {
      throw new Error("Sesi Google Drive Super Admin belum diaktifkan atau telah kadaluarsa. Silakan hubungi Super Admin (muhammad.nawa@gmail.com) di menu Form Pendaftaran untuk mendelegasikan/menyambungkan kembali Google Drive Super Admin.");
    }
    const res = await handleDriveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Gagal mengunduh file dari Drive: ${res.statusText}`);
    }
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error("Error downloading file from Google Drive:", err);
    throw err;
  }
};


export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  code?: string;
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
  }
}

function handleFirestoreError(error: any, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    code: error?.code,
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
  }
  console.error('Firestore Error Detailed:', JSON.stringify(errInfo, null, 2));
  
  if (error?.code === 'unavailable') {
    console.error('FIREBASE UNAVAILABLE: Cloud Firestore backend is unreachable. Possible reasons:');
    console.error('1. No internet connection');
    console.error('2. Firestore not enabled for project:', finalConfig.projectId);
    console.error('3. Project ID/API Key mismatch');
    console.error('4. Outgoing port 443 blocked in the current network');
  }
  
  throw new Error(JSON.stringify(errInfo));
}

function handleAuthError(error: any) {
  let message = error.message;
  
  switch (error.code) {
    case 'auth/invalid-credential':
      message = 'Email atau kata sandi salah. Silakan periksa kembali kredensial Anda.';
      break;
    case 'auth/user-not-found':
      message = 'Akun tidak ditemukan. Silakan mendaftar terlebih dahulu.';
      break;
    case 'auth/wrong-password':
      message = 'Kata sandi salah. Silakan coba lagi.';
      break;
    case 'auth/email-already-in-use':
      message = 'Email sudah terdaftar. Silakan gunakan email lain atau masuk.';
      break;
    case 'auth/weak-password':
      message = 'Kata sandi terlalu lemah. Gunakan minimal 6 karakter.';
      break;
    case 'auth/invalid-email':
      message = 'Format email tidak valid.';
      break;
    case 'auth/user-disabled':
      message = 'Akun ini telah dinonaktifkan.';
      break;
    case 'auth/too-many-requests':
      message = 'Terlalu banyak percobaan masuk. Akun Anda diblokir sementara. Coba lagi nanti.';
      break;
    case 'auth/operation-not-allowed':
      message = 'Metode masuk ini belum diaktifkan di Firebase Console. Silakan buka Console > Authentication > Sign-in method dan aktifkan "Email/Password" serta "Google".';
      break;
    case 'auth/popup-closed-by-user':
      message = 'Jendela login ditutup sebelum selesai.';
      break;
    case 'auth/unauthorized-domain':
      message = `Domain ${window.location.hostname} belum diizinkan. Tambahkan di Firebase Console > Auth > Settings.`;
      break;
    case 'auth/network-request-failed':
      message = 'Koneksi internet bermasalah atau API Key tidak valid. Jika Anda menggunakan VPN, coba matikan. Pastikan juga domain ini sudah ditambahkan ke "Authorized domains" di Firebase Console (Auth > Settings).';
      break;
  }
  
  error.message = message;
  return error;
}

export const registerWithEmail = async (email: string, pass: string, name: string) => {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(result.user, { displayName: name });
    return result.user;
  } catch (error: any) {
    console.error('Firebase Registration Error:', error);
    throw handleAuthError(error);
  }
};

export const loginWithEmail = async (email: string, pass: string) => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, pass);
    return result.user;
  } catch (error: any) {
    console.error('Firebase Login Error:', error);
    throw handleAuthError(error);
  }
};

export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    cachedGoogleAccessToken = credential?.accessToken || null;
    
    if (cachedGoogleAccessToken) {
      try {
        const docRef = doc(db, 'settings', 'gdrive_token');
        await setDoc(docRef, {
          accessToken: cachedGoogleAccessToken,
          updatedAt: new Date().toISOString(),
          email: result.user.email,
          displayName: result.user.displayName
        });
        console.log('Successfully saved shared Google Drive token to settings/gdrive_token in Firestore.');
      } catch (saveErr) {
        console.error('Failed to save shared GDrive token to Firestore:', saveErr);
      }
    }

    return result.user;
  } catch (error: any) {
    const handled = handleAuthError(error);
    if (error.code === 'auth/unauthorized-domain') {
      console.error('DOMAIN NOT AUTHORIZED: You must add the current domain to Firebase Console > Auth > Settings > Authorized Domains');
      console.error('Domain to add:', window.location.hostname);
    } else if (error.code === 'auth/api-key-not-valid' || error.message?.includes('api-key-not-valid')) {
      console.error('API KEY INVALID: The API key provided is invalid for project', finalConfig.projectId);
      console.error('Check if the API Key matches the project in Firebase Console.');
      const isConfigEmpty = !finalConfig.apiKey || finalConfig.apiKey === '';
      handled.message = isConfigEmpty ? 'Firebase API Key is missing. Please run "Set up Firebase" in the chat.' : 'Firebase API Key is invalid. Check your Firebase console settings.';
    }
    console.error('Firebase Login Detail:', handled);
    throw handled;
  }
};

export const logout = () => auth.signOut();

export const testConnection = async () => {
  if (!finalConfig.apiKey || !finalConfig.projectId) {
    const msg = 'Configuration is missing.';
    console.warn('Skipping connection test:', msg);
    return msg;
  }
  
  console.log('Starting Firebase Connection Test...');
  console.log('- Endpoint: firestore.googleapis.com');
  console.log('- Using Long Polling:', true);
  
  try {
    // Attempt to fetch a document with a longer timeout
    const fetchPromise = getDocFromServer(doc(db, 'test', 'connection'));
    console.log('- Database Path:', `projects/${finalConfig.projectId}/databases/${dbId}/documents/test/connection`);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Connection timeout (20s) - Backend unreachable at ${finalConfig.projectId}/${dbId}`)), 20000)
    );
    
    await Promise.race([fetchPromise, timeoutPromise]);
    console.log('Firebase connection successful');
    return null;
  } catch (error: any) {
    let errorMsg = error.message;
    const errorCode = error.code || 'unknown';
    
    console.log(`Connection Test Failed with code: ${errorCode}`);

    // Permission denied is actually GOOD signs here as it means we connected
    if (errorMsg.includes('permission-denied') || error.code === 'permission-denied') {
      console.log('Firebase connection confirmed (received permission denied which implies connectivity)');
      return null;
    }
    
    if (errorMsg.includes('the client is offline') || errorCode === 'unavailable' || errorMsg.includes('timeout')) {
      errorMsg = "Sistem Offline/Timeout: SDK tidak dapat terhubung ke server Google. " +
                 "Pastikan Project ID (" + finalConfig.projectId + ") & API Key benar, " +
                 "dan pastikan Cloud Firestore telah di-ENABLE untuk project ini di Firebase Console.";
    }
    
    console.error("Firebase connection test error:", errorMsg);
    return errorMsg;
  }
};

// Helper to remove undefined fields that would cause Firestore to error
const sanitizeData = (data: any) => {
  const sanitized: any = {};
  Object.keys(data).forEach(key => {
    if (data[key] !== undefined) {
      sanitized[key] = data[key];
    }
  });
  return sanitized;
};

export const safeGetDoc = async (ref: DocumentReference): Promise<DocumentSnapshot> => {
  try {
    return await getDocFromServer(ref);
  } catch (err: any) {
    console.warn(`getDocFromServer failed, falling back to standard getDoc:`, err);
    try {
      return await getDoc(ref);
    } catch (fallbackErr: any) {
      console.error(`Both getDocFromServer and getDoc failed:`, fallbackErr);
      // Return a simulated non-existent document snapshot instead of crashing the app
      return {
        exists: () => false,
        data: () => undefined,
        id: ref.id,
        ref: ref,
        metadata: { fromCache: true, hasPendingWrites: false }
      } as unknown as DocumentSnapshot;
    }
  }
};

export const saveRecipient = async (recipientData: any) => {
  const path = 'recipients';
  try {
    let documentsToSave: { id: string; base64: string }[] = [];
    let updatedDocumentsMeta: any[] = [];

    if (recipientData.documents && Array.isArray(recipientData.documents)) {
      recipientData.documents.forEach((docItem: any, idx: number) => {
        if (docItem && docItem.url && docItem.url.length > 100) {
          const docId = `reg_${idx}`;
          documentsToSave.push({ id: docId, base64: docItem.url });
          updatedDocumentsMeta.push({
            ...docItem,
            url: docId // Store identifier/pointer instead of heavy base64
          });
        } else {
          updatedDocumentsMeta.push(docItem);
        }
      });
    }

    const recipientPayload = {
      ...recipientData,
      pob: recipientData.pob || '',
      dob: recipientData.dob || '',
      isTermsAccepted: recipientData.isTermsAccepted || false,
      status: 'Proses Berkas',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (updatedDocumentsMeta.length > 0) {
      recipientPayload.documents = updatedDocumentsMeta;
    }

    // Ensure all mandatory keys for firestore rules are present
    const payload = sanitizeData(recipientPayload);
    
    const docRef = await addDoc(collection(db, path), payload);
    const recipientId = docRef.id;

    // Save heavy file documents under individual scans subcollection
    if (documentsToSave.length > 0) {
      for (const docToSave of documentsToSave) {
        const scanRef = doc(db, 'recipients', recipientId, 'scans', docToSave.id);
        await setDoc(scanRef, {
          base64: docToSave.base64,
          updatedAt: serverTimestamp()
        });
      }
    }

    try {
      await logUserAction('CREATE', 'Penerima Manfaat', `Mendaftarkan penerima manfaat baru: ${recipientData.name} (${recipientData.nik})`);
    } catch (logErr) {
      console.warn('Logging user action failed', logErr);
    }

    return recipientId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
};

export const savePPDRecord = async (record: Omit<PPDRecord, 'id' | 'createdAt'> & { signedPdfUrl?: string | null }) => {
  const path = 'ppd_records';
  try {
    const payload = sanitizeData({
      ...record,
      createdAt: serverTimestamp(),
    });
    const docRef = await addDoc(collection(db, path), payload);
    
    try {
      await logUserAction('GENERATION', 'Kuitansi / PPD', `Membuat rekap pencairan PPD No: ${record.no} senilai Rp ${record.amount.toLocaleString('id-ID')}`);
    } catch (logErr) {
      console.warn('Logging user action failed', logErr);
    }
    
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
};

export const deletePPDRecordServer = async (id: string) => {
  const path = `ppd_records/${id}`;
  try {
    const ref = doc(db, 'ppd_records', id);
    const snap = await getDoc(ref);
    let ppdNo = id;
    let ppdAmount = 0;
    if (snap.exists()) {
      const data = snap.data();
      ppdNo = data.no || id;
      ppdAmount = data.amount || 0;
    }

    const { deleteDoc } = await import('firebase/firestore');
    await deleteDoc(ref);

    try {
      await logUserAction('DELETE', 'Kuitansi / PPD', `Menghapus rekap pencairan PPD No: ${ppdNo} senilai Rp ${ppdAmount.toLocaleString('id-ID')}`);
    } catch (logErr) {
      console.warn('Logging user action failed', logErr);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
    throw error;
  }
};

export const deleteRecipientServer = async (id: string) => {
  const path = `recipients/${id}`;
  try {
    const ref = doc(db, 'recipients', id);
    const snap = await getDoc(ref);
    let recipientName = '(Tidak Diketahui)';
    let recipientNik = '';
    if (snap.exists()) {
      const data = snap.data();
      recipientName = data.name || '(Tidak Diketahui)';
      recipientNik = data.nik || '';
    }

    const { deleteDoc } = await import('firebase/firestore');
    await deleteDoc(ref);

    try {
      await logUserAction('DELETE', 'Penerima Manfaat', `Menghapus data penerima manfaat: ${recipientName} ${recipientNik ? `NIK (${recipientNik})` : ''}`);
    } catch (logErr) {
      console.warn('Logging user action failed', logErr);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
    throw error;
  }
};

export const getRecipientFile = async (recipientId: string, fileType: string) => {
  try {
    if (fileType && fileType.startsWith('gdrive:')) {
      const fileId = fileType.split(':')[1];
      return await downloadGoogleDriveFileAsBase64(fileId);
    }

    const path = `recipients/${recipientId}/scans/${fileType}`;
    const ref = doc(db, 'recipients', recipientId, 'scans', fileType);
    const snap = await safeGetDoc(ref);
    if (snap.exists()) {
      return snap.data().base64 as string;
    }
    return null;
  } catch (error: any) {
    console.warn(`Error loading recipient file:`, error);
    if (error?.message?.includes('Google Drive') || error?.message?.includes('Otorisasi') || error?.message?.includes('OAuth')) {
      throw error;
    }
    return null;
  }
};

export const getRecipientTemplateData = async (recipientId: string, templateType: string) => {
  const path = `recipients/${recipientId}/templates/${templateType}`;
  try {
    const ref = doc(db, 'recipients', recipientId, 'templates', templateType);
    const snap = await safeGetDoc(ref);
    if (snap.exists()) {
      return snap.data().data;
    }
    return null;
  } catch (error) {
    console.warn(`Error loading recipient template data for ${path}. Returning null.`, error);
    return null;
  }
};

export const saveRecipientTemplateData = async (recipientId: string, templateType: string, templateData: any) => {
  const path = `recipients/${recipientId}/templates/${templateType}`;
  try {
    const ref = doc(db, 'recipients', recipientId, 'templates', templateType);
    await setDoc(ref, {
      data: templateData,
      updatedAt: serverTimestamp()
    });
    
    // Also update the generated flag on the Recipient
    const recipientRef = doc(db, 'recipients', recipientId);
    if (templateType === 'mpzis') {
      await updateDoc(recipientRef, { isMPZISGenerated: true, updatedAt: serverTimestamp() });
    } else if (templateType === 'eppd') {
      await updateDoc(recipientRef, { isEPPDGenerated: true, updatedAt: serverTimestamp() });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const updateRecipientReceiptPdf = async (id: string, pdfBase64: string | null) => {
  const path = `recipients/${id}`;
  try {
    const ref = doc(db, 'recipients', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Recipient not found');
    
    const recipient = snap.data() as Recipient;
    const finalBase64 = pdfBase64 ? await syncFileToGoogleDriveIfConnected(pdfBase64, 'Tanda Terima', recipient.name || id, recipient.nik || '', recipient.sector || 'Umum', recipient.programName || '') : null;
    const hasFile = !!finalBase64 && finalBase64.length > 5;
    
    // Save heavy file/delete from subcollection
    const scanRef = doc(db, 'recipients', id, 'scans', 'receipt');
    if (finalBase64) {
      await setDoc(scanRef, {
        base64: finalBase64,
        updatedAt: serverTimestamp()
      });
    } else {
      const snapScan = await safeGetDoc(scanRef);
      if (snapScan.exists()) {
        const { deleteDoc } = await import('firebase/firestore');
        await deleteDoc(scanRef);
      }
    }

    const updatedStatus = evaluateRecipientStatus({ ...recipient, hasSignedReceiptPdf: hasFile });
    
    await updateDoc(ref, {
      hasSignedReceiptPdf: hasFile,
      signedReceiptPdfUrl: '', // Clear legacy field
      status: updatedStatus,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const updateRecipientPdf = async (id: string, pdfBase64: string | null) => {
  const path = `recipients/${id}`;
  try {
    const ref = doc(db, 'recipients', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Recipient not found');
    
    const recipient = snap.data() as Recipient;
    const finalBase64 = pdfBase64 ? await syncFileToGoogleDriveIfConnected(pdfBase64, 'E-PPD', recipient.name || id, recipient.nik || '', recipient.sector || 'Umum', recipient.programName || '') : null;
    const hasFile = !!finalBase64 && finalBase64.length > 5;

    // Save heavy file/delete from subcollection
    const scanRef = doc(db, 'recipients', id, 'scans', 'eppd');
    if (finalBase64) {
      await setDoc(scanRef, {
        base64: finalBase64,
        updatedAt: serverTimestamp()
      });
    } else {
      const snapScan = await safeGetDoc(scanRef);
      if (snapScan.exists()) {
        const { deleteDoc } = await import('firebase/firestore');
        await deleteDoc(scanRef);
      }
    }

    const updatedStatus = evaluateRecipientStatus({ ...recipient, hasSignedPdf: hasFile });
    
    await updateDoc(ref, {
      hasSignedPdf: hasFile,
      signedPdfUrl: '', // Clear legacy field
      status: updatedStatus,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const updateInternalMemoPdf = async (id: string, pdfBase64: string | null) => {
  const path = `recipients/${id}`;
  try {
    const ref = doc(db, 'recipients', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Recipient not found');
    
    const recipient = snap.data() as Recipient;
    const finalBase64 = pdfBase64 ? await syncFileToGoogleDriveIfConnected(pdfBase64, 'Internal Memo', recipient.name || id, recipient.nik || '', recipient.sector || 'Umum', recipient.programName || '') : null;
    const hasFile = !!finalBase64 && finalBase64.length > 5;

    // Save heavy file/delete from subcollection
    const scanRef = doc(db, 'recipients', id, 'scans', 'memo');
    if (finalBase64) {
      await setDoc(scanRef, {
        base64: finalBase64,
        updatedAt: serverTimestamp()
      });
    } else {
      const snapScan = await safeGetDoc(scanRef);
      if (snapScan.exists()) {
        const { deleteDoc } = await import('firebase/firestore');
        await deleteDoc(scanRef);
      }
    }
    
    await updateDoc(ref, {
      hasInternalMemoPdf: hasFile,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const updateRecipientMPZISPdf = async (id: string, pdfBase64: string | null) => {
  const path = `recipients/${id}`;
  try {
    const ref = doc(db, 'recipients', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Recipient not found');
    
    const recipient = snap.data() as Recipient;
    const finalBase64 = pdfBase64 ? await syncFileToGoogleDriveIfConnected(pdfBase64, 'MPZIS', recipient.name || id, recipient.nik || '', recipient.sector || 'Umum', recipient.programName || '') : null;
    const hasFile = !!finalBase64 && finalBase64.length > 5;

    // Save heavy file/delete from subcollection
    const scanRef = doc(db, 'recipients', id, 'scans', 'mpzis');
    if (finalBase64) {
      await setDoc(scanRef, {
        base64: finalBase64,
        updatedAt: serverTimestamp()
      });
    } else {
      const snapScan = await safeGetDoc(scanRef);
      if (snapScan.exists()) {
        const { deleteDoc } = await import('firebase/firestore');
        await deleteDoc(scanRef);
      }
    }

    const updatedStatus = evaluateRecipientStatus({ ...recipient, hasSignedMPZISPdf: hasFile });
    
    await updateDoc(ref, {
      hasSignedMPZISPdf: hasFile,
      signedMPZISPdfUrl: '', // Clear legacy field
      status: updatedStatus,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const updateRecipientSurveyPdf = async (id: string, pdfBase64: string | null) => {
  const path = `recipients/${id}`;
  try {
    const ref = doc(db, 'recipients', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Recipient not found');
    
    const recipient = snap.data() as Recipient;
    const finalBase64 = pdfBase64 ? await syncFileToGoogleDriveIfConnected(pdfBase64, 'Lembar Verifikasi', recipient.name || id, recipient.nik || '', recipient.sector || 'Umum', recipient.programName || '') : null;
    const hasFile = !!finalBase64 && finalBase64.length > 5;

    // Save heavy file/delete from subcollection
    const scanRef = doc(db, 'recipients', id, 'scans', 'survey');
    if (finalBase64) {
      await setDoc(scanRef, {
        base64: finalBase64,
        updatedAt: serverTimestamp()
      });
    } else {
      const snapScan = await safeGetDoc(scanRef);
      if (snapScan.exists()) {
        const { deleteDoc } = await import('firebase/firestore');
        await deleteDoc(scanRef);
      }
    }

    const updatedStatus = evaluateRecipientStatus({ ...recipient, hasSignedSurveyPdf: hasFile });
    
    await updateDoc(ref, {
      hasSignedSurveyPdf: hasFile,
      signedSurveyPdfUrl: '', // Clear legacy field
      status: updatedStatus,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const updateRecipientStatus = async (id: string, status: AidStatus) => {
  const path = `recipients/${id}`;
  try {
    const ref = doc(db, 'recipients', id);
    const snap = await getDoc(ref);
    let name = id;
    if (snap.exists()) {
      name = snap.data().name || id;
    }
    
    await updateDoc(ref, {
      status,
      updatedAt: serverTimestamp()
    });

    try {
      await logUserAction('UPDATE', 'Status Penerima', `Mengubah status bantuan ${name} menjadi "${status}"`);
    } catch (logErr) {
      console.warn('Logging user action failed', logErr);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const updateRecipientData = async (id: string, data: Partial<Recipient>) => {
  const path = `recipients/${id}`;
  try {
    const ref = doc(db, 'recipients', id);
    
    // Process documents if they exist
    let documentsToSave: { id: string; base64: string }[] = [];
    let updatedDocumentsMeta: any[] = [];
    
    const { id: _id, createdAt, documents, ...rawCleanData } = data as any;
    
    // Strip undefined values to prevent Firestore updateDoc errors
    const cleanData = Object.fromEntries(
      Object.entries(rawCleanData).filter(([_, v]) => v !== undefined)
    );
    
    if (documents && Array.isArray(documents)) {
      documents.forEach((docItem: any, idx: number) => {
        if (docItem && docItem.url && docItem.url.startsWith('data:')) {
          const docId = `reg_${Date.now()}_${idx}`;
          documentsToSave.push({ id: docId, base64: docItem.url });
          updatedDocumentsMeta.push({
            ...docItem,
            url: docId // Store identifier/pointer
          });
        } else {
          updatedDocumentsMeta.push(docItem);
        }
      });
      
      cleanData.documents = updatedDocumentsMeta;
    }
    
    await updateDoc(ref, {
      ...cleanData,
      updatedAt: serverTimestamp()
    });
    
    // Save heavy file documents under individual scans subcollection
    if (documentsToSave.length > 0) {
      for (const docToSave of documentsToSave) {
        const scanRef = doc(db, 'recipients', id, 'scans', docToSave.id);
        await setDoc(scanRef, {
          base64: docToSave.base64,
          updatedAt: serverTimestamp()
        });
      }
    }

    try {
      await logUserAction('UPDATE', 'Penerima Manfaat', `Memperbarui data penerima manfaat: ${data.name || id}`);
    } catch (logErr) {
      console.warn('Logging user action failed', logErr);
    }
    
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    throw error;
  }
};

export const streamRecipients = (callback: (data: Recipient[]) => void) => {
  const path = 'recipients';
  const q = query(collection(db, path), orderBy('createdAt', 'desc'));
  
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(d => {
      const data = d.data();
      return { 
        id: d.id, 
        ...data,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : data.updatedAt,
      } as Recipient;
    });
    callback(data);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, path);
  });
};

export const streamPPDRecords = (callback: (data: PPDRecord[]) => void) => {
  const path = 'ppd_records';
  const q = query(collection(db, path), orderBy('createdAt', 'desc'));
  
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(d => {
      const data = d.data();
      return { 
        id: d.id, 
        ...data,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
      } as PPDRecord;
    });
    callback(data);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, path);
  });
};

// Companion Reports
export interface CompanionReport {
  id?: string;
  companionId: string;
  companionName: string;
  month: string;
  year: number;
  reportType: 'Bulanan' | 'Program';
  sector: string;
  title: string;
  coverUrl: string;
  fileUrl?: string;
  uploadedAt: string;
  uploaderId: string;
}

export const streamCompanionReports = (companionId: string, callback: (reports: CompanionReport[]) => void) => {
  const path = 'companionReports';
  // Removed orderBy to avoid index requirement
  const q = query(
    collection(db, path), 
    where('companionId', '==', companionId)
  );

  const MONTH_ORDER: Record<string, number> = {
    'Januari': 1, 'Februari': 2, 'Maret': 3, 'April': 4, 'Mei': 5, 'Juni': 6,
    'Juli': 7, 'Agustus': 8, 'September': 9, 'Oktober': 10, 'November': 11, 'Desember': 12
  };

  return onSnapshot(q, (snapshot) => {
    const reports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CompanionReport));
    
    // Manual sort: Year desc, then Month desc
    reports.sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      const orderA = MONTH_ORDER[a.month] || 0;
      const orderB = MONTH_ORDER[b.month] || 0;
      return orderB - orderA;
    });

    callback(reports);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, path);
  });
};

export const streamSectorReports = (sector: string, callback: (reports: CompanionReport[]) => void) => {
  const path = 'companionReports';
  const q = query(
    collection(db, path), 
    where('sector', '==', sector),
    where('reportType', '==', 'Bulanan')
  );

  const MONTH_ORDER: Record<string, number> = {
    'Januari': 1, 'Februari': 2, 'Maret': 3, 'April': 4, 'Mei': 5, 'Juni': 6,
    'Juli': 7, 'Agustus': 8, 'September': 9, 'Oktober': 10, 'November': 11, 'Desember': 12
  };

  return onSnapshot(q, (snapshot) => {
    const reports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CompanionReport));
    
    // Manual sort: Year desc, then Month desc
    reports.sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      const orderA = MONTH_ORDER[a.month] || 0;
      const orderB = MONTH_ORDER[b.month] || 0;
      return orderB - orderA;
    });

    callback(reports);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, path);
  });
};

export const saveCompanionReport = async (report: Omit<CompanionReport, 'id' | 'uploadedAt' | 'uploaderId'>) => {
  const path = 'companionReports';
  if (!auth.currentUser) throw new Error("Must be logged in to upload reports");
  
  try {
    const reportData = sanitizeData({
      ...report,
      uploadedAt: new Date().toISOString(),
      uploaderId: auth.currentUser.uid
    });
    
    const docRef = await addDoc(collection(db, path), reportData);
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
};

export const deleteCompanionReport = async (reportId: string) => {
  const path = `companionReports/${reportId}`;
  try {
    await deleteDoc(doc(db, 'companionReports', reportId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
    throw error;
  }
};

// Monthly Payments
export const saveMonthlyPayment = async (data: Omit<MonthlyPayment, 'id' | 'createdAt' | 'updatedAt'>) => {
  const path = 'monthly_payments';
  try {
    const payload = sanitizeData({
      ...data,
      budget: Number(data.budget) || 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const docRef = await addDoc(collection(db, path), payload);
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
};

export const updateMonthlyPayment = async (id: string, data: Partial<MonthlyPayment>) => {
  const path = `monthly_payments/${id}`;
  try {
    const payload = sanitizeData({
      ...data,
      updatedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'monthly_payments', id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const streamMonthlyPayments = (sector: string, callback: (data: MonthlyPayment[]) => void) => {
  const path = 'monthly_payments';
  // Removed orderBy to avoid index requirement
  const q = query(
    collection(db, path), 
    where('sector', '==', sector)
  );
  
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(d => {
      const data = d.data();
      return { 
        id: d.id, 
        ...data,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : data.updatedAt,
      } as MonthlyPayment;
    });

    // Manual sort by createdAt desc
    data.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    callback(data);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, path);
  });
};

export const deleteMonthlyPayment = async (id: string) => {
  const path = `monthly_payments/${id}`;
  try {
    await deleteDoc(doc(db, 'monthly_payments', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
    throw error;
  }
};

// App Settings
export const streamAppSettings = (callback: (data: AppSettings | null) => void) => {
  const path = 'settings/app';
  const ref = doc(db, 'settings', 'app');
  
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      callback({
        id: snap.id,
        ...data,
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : data.updatedAt,
      } as AppSettings);
    } else {
      callback(null);
    }
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, path);
  });
};

export const updateAppSettings = async (data: Partial<AppSettings>) => {
  const path = 'settings/app';
  try {
    const ref = doc(db, 'settings', 'app');
    const payload = sanitizeData({
      ...data,
      updatedAt: serverTimestamp(),
    });
    await setDoc(ref, payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

// Announcements
export const streamAnnouncements = (callback: (data: Announcement[]) => void) => {
  const path = 'announcements';
  const q = query(collection(db, path), orderBy('createdAt', 'desc'));
  
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(d => {
      const data = d.data();
      return { 
        id: d.id, 
        ...data,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
      } as Announcement;
    });
    callback(data);
  }, (error) => {
    // If no index, fallback to manual sort
    if (error.message.includes('requires an index')) {
      const qNoOrder = query(collection(db, path));
      return onSnapshot(qNoOrder, (snap) => {
        const data = snap.docs.map(d => ({ 
          id: d.id, 
          ...d.data(),
          createdAt: d.data().createdAt instanceof Timestamp ? d.data().createdAt.toDate().toISOString() : d.data().createdAt,
        } as Announcement));
        data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        callback(data);
      });
    }
    handleFirestoreError(error, OperationType.LIST, path);
  });
};

export const saveAnnouncement = async (data: Omit<Announcement, 'id' | 'createdAt'>) => {
  const path = 'announcements';
  try {
    const payload = sanitizeData({
      ...data,
      createdAt: serverTimestamp(),
    });
    await addDoc(collection(db, path), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
};

export const updateAnnouncement = async (id: string, data: Partial<Announcement>) => {
  const path = `announcements/${id}`;
  try {
    await updateDoc(doc(db, 'announcements', id), sanitizeData(data));
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const deleteAnnouncement = async (id: string) => {
  const path = `announcements/${id}`;
  try {
    await deleteDoc(doc(db, 'announcements', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
    throw error;
  }
};

// Assessments
export const saveAssessment = async (data: Omit<Assessment, 'id' | 'createdAt' | 'updatedAt'>) => {
  const path = 'assessments';
  try {
    const payload = sanitizeData({
      ...data,
      economicScore: Number(data.economicScore) || 0,
      socialScore: Number(data.socialScore) || 0,
      healthScore: Number(data.healthScore) || 0,
      housingScore: Number(data.housingScore) || 0,
      educationScore: Number(data.educationScore) || 0,
      totalScore: Number(data.totalScore) || 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const docRef = await addDoc(collection(db, path), payload);
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
};

export const updateAssessment = async (id: string, data: Partial<Assessment>) => {
  const path = `assessments/${id}`;
  try {
    const payload = sanitizeData({
      ...data,
      updatedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'assessments', id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const streamAssessments = (callback: (data: Assessment[]) => void) => {
  const path = 'assessments';
  const q = query(collection(db, path), orderBy('createdAt', 'desc'));
  
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(d => {
      const data = d.data();
      return { 
        id: d.id, 
        ...data,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : data.updatedAt,
      } as Assessment;
    });
    callback(data);
  }, (error) => {
    // If no index, fallback to manual sort
    if (error.message.includes('requires an index')) {
      const qNoOrder = query(collection(db, path));
      return onSnapshot(qNoOrder, (snap) => {
        const data = snap.docs.map(d => ({ 
          id: d.id, 
          ...d.data(),
          createdAt: d.data().createdAt instanceof Timestamp ? d.data().createdAt.toDate().toISOString() : d.data().createdAt,
          updatedAt: d.data().updatedAt instanceof Timestamp ? d.data().updatedAt.toDate().toISOString() : d.data().updatedAt,
        } as Assessment));
        data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        callback(data);
      });
    }
    handleFirestoreError(error, OperationType.LIST, path);
  });
};

export const deleteAssessment = async (id: string) => {
  const path = `assessments/${id}`;
  try {
    await deleteDoc(doc(db, 'assessments', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
    throw error;
  }
};

// User Configurations
export const streamUserConfigs = (callback: (data: UserConfig[]) => void) => {
  const path = 'user_configs';
  const q = query(collection(db, path), orderBy('createdAt', 'desc'));
  
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(d => {
      const data = d.data();
      return { 
        id: d.id, 
        ...data,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : data.updatedAt,
      } as UserConfig;
    });
    callback(data);
  }, (error) => {
    if (error.message.includes('requires an index')) {
      const qNoOrder = query(collection(db, path));
      return onSnapshot(qNoOrder, (snap) => {
        const data = snap.docs.map(d => ({ 
          id: d.id, 
          ...d.data(),
          createdAt: d.data().createdAt instanceof Timestamp ? d.data().createdAt.toDate().toISOString() : d.data().createdAt,
          updatedAt: d.data().updatedAt instanceof Timestamp ? d.data().updatedAt.toDate().toISOString() : d.data().updatedAt,
        } as UserConfig));
        callback(data);
      });
    }
    handleFirestoreError(error, OperationType.LIST, path);
  });
};

export const streamUserConfigByEmail = (email: string, callback: (data: UserConfig | null) => void) => {
  const path = 'user_configs';
  const q = query(collection(db, path), where('email', '==', email.toLowerCase().trim()));
  
  return onSnapshot(q, (snapshot) => {
    if (!snapshot.empty) {
      const d = snapshot.docs[0];
      const data = d.data();
      callback({
        id: d.id,
        ...data,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
        updatedAt: data.updatedAt instanceof Timestamp ? d.data().updatedAt.toDate().toISOString() : data.updatedAt,
      } as UserConfig);
    } else {
      callback(null);
    }
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, path);
  });
};

export const saveUserConfig = async (email: string, config: Omit<UserConfig, 'id' | 'createdAt' | 'updatedAt'>) => {
  const path = 'user_configs';
  try {
    const q = query(collection(db, 'user_configs'), where('email', '==', email.toLowerCase().trim()));
    const snapshot = await getDocs(q);
    
    let docRef;
    if (!snapshot.empty) {
      docRef = doc(db, 'user_configs', snapshot.docs[0].id);
      await updateDoc(docRef, sanitizeData({
        ...config,
        email: email.toLowerCase().trim(),
        updatedAt: serverTimestamp(),
      }));

      try {
        await logUserAction('UPDATE', 'Manajemen User', `Memperbarui hak akses user ${email} (${config.role})`);
      } catch (logErr) {
        console.warn('Logging user action failed', logErr);
      }
    } else {
      docRef = doc(collection(db, 'user_configs'));
      await setDoc(docRef, sanitizeData({
        ...config,
        email: email.toLowerCase().trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }));

      try {
        await logUserAction('CREATE', 'Manajemen User', `Menambahkan hak akses baru untuk user ${email} (${config.role})`);
      } catch (logErr) {
        console.warn('Logging user action failed', logErr);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const deleteUserConfig = async (id: string) => {
  const path = `user_configs/${id}`;
  try {
    const ref = doc(db, 'user_configs', id);
    const snap = await getDoc(ref);
    let targetEmail = id;
    if (snap.exists()) {
      targetEmail = snap.data().email || id;
    }

    await deleteDoc(ref);

    try {
      await logUserAction('DELETE', 'Manajemen User', `Menghapus hak akses user: ${targetEmail}`);
    } catch (logErr) {
      console.warn('Logging user action failed', logErr);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
    throw error;
  }
};

// System Audit Logs
export const addSystemLog = async (logPayload: Omit<SystemLog, 'id' | 'createdAt'>) => {
  const path = 'system_logs';
  try {
    const docRef = doc(collection(db, 'system_logs'));
    const payload = sanitizeData({
      ...logPayload,
      createdAt: serverTimestamp()
    });
    await setDoc(docRef, payload);
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
};

export const logUserAction = async (
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'GENERATION', 
  target: string, 
  details: string
) => {
  const email = auth.currentUser?.email || 'system@si-pandai.or.id';
  const name = auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'Staff';
  return addSystemLog({
    email,
    name,
    action,
    target,
    details
  });
};

export const streamSystemLogs = (callback: (data: SystemLog[]) => void) => {
  const path = 'system_logs';
  const q = query(collection(db, path), orderBy('createdAt', 'desc'), limit(150));
  
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt
      } as SystemLog;
    });
    callback(data);
  }, (error) => {
    if (error.message.includes('requires an index')) {
      const qNoOrder = query(collection(db, path), limit(150));
      return onSnapshot(qNoOrder, (snap) => {
        const data = snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          createdAt: d.data().createdAt instanceof Timestamp ? d.data().createdAt.toDate().toISOString() : d.data().createdAt
        } as SystemLog));
        callback(data);
      });
    }
    handleFirestoreError(error, OperationType.LIST, path);
  });
};

export const syncAllLocalFilesToGoogleDrive = async (
  onProgress?: (index: number, total: number, status: string) => void
): Promise<{ successCount: number; errors: string[] }> => {
  let token = getGoogleAccessToken();
  if (!token) {
    token = await fetchSharedGoogleAccessToken();
    if (token) {
      cachedGoogleAccessToken = token;
    }
  }
  if (!token) {
    throw new Error("Sesi Google Drive belum terhubung atau telah kadaluarsa. Super Admin harus menghubungkan Google Drive terlebih dahulu.");
  }

  // 1. Fetch all recipients
  const querySnapshot = await getDocs(collection(db, 'recipients'));
  const recipients = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Recipient));
  
  let successCount = 0;
  const errors: string[] = [];
  const total = recipients.length;

  for (let i = 0; i < total; i++) {
    const recipient = recipients[i];
    const nameStr = recipient.name || 'Penerima Tanpa Nama';
    const cleanNik = recipient.nik || '';
    const sectorVal = recipient.sector || 'Umum';
    const programVal = recipient.programName || '';

    if (onProgress) {
      onProgress(i + 1, total, `Memproses data: ${nameStr}...`);
    }

    try {
      let isRecipientDocModified = false;
      
      // A. Sync attachments (documents array)
      if (recipient.documents && recipient.documents.length > 0) {
        const updatedDocs = [...recipient.documents];
        for (let j = 0; j < updatedDocs.length; j++) {
          const docItem = updatedDocs[j];
          if (docItem.url && docItem.url.startsWith('data:')) {
            try {
              if (onProgress) {
                onProgress(i + 1, total, `Mengunggah lampiran [${docItem.name}] untuk ${nameStr}...`);
              }
              const ext = getFileExtensionFromBase64(docItem.url);
              const cleanDocName = docItem.name.replace(/[/\\?%*:|"<>\s]+/g, '_');
              const filename = `${cleanDocName} - ${nameStr.replace(/[^a-zA-Z0-9 ]/g, '').trim()}${ext}`;
              
              const gdriveRes = await uploadBase64ToGoogleDrive(
                docItem.url,
                filename,
                nameStr,
                cleanNik,
                sectorVal,
                programVal
              );
              
              docItem.url = `gdrive:${gdriveRes.id}`;
              isRecipientDocModified = true;
              successCount++;
            } catch (err: any) {
              console.error(`Gagal sync berkas lampiran ${docItem.name} untuk ${nameStr}:`, err);
              errors.push(`Lampiran [${docItem.name}] ${nameStr}: ${err.message || err}`);
            }
          }
        }
        
        if (isRecipientDocModified) {
          const recipientRef = doc(db, 'recipients', recipient.id);
          await updateDoc(recipientRef, {
            documents: updatedDocs,
            updatedAt: new Date().toISOString()
          });
        }
      }

      // B. Sync template PDFs (scans subcollection: receipt, eppd, memo, mpzis, survey)
      const scanTypes = [
        { key: 'receipt', label: 'Tanda Terima', hasFlag: 'hasSignedReceiptPdf' as const },
        { key: 'eppd', label: 'E-PPD', hasFlag: 'hasSignedPdf' as const },
        { key: 'memo', label: 'Internal Memo', hasFlag: 'hasInternalMemoPdf' as const },
        { key: 'mpzis', label: 'MPZIS', hasFlag: 'hasSignedMPZISPdf' as const },
        { key: 'survey', label: 'Lembar Verifikasi', hasFlag: 'hasSignedSurveyPdf' as const }
      ];

      for (const scanType of scanTypes) {
        const flagVal = recipient[scanType.hasFlag];
        if (flagVal) {
          const scanRef = doc(db, 'recipients', recipient.id, 'scans', scanType.key);
          const scanSnap = await safeGetDoc(scanRef);
          if (scanSnap.exists()) {
            const scanData = scanSnap.data();
            const localBase64 = scanData?.base64;
            
            if (localBase64 && localBase64.startsWith('data:')) {
              try {
                if (onProgress) {
                  onProgress(i + 1, total, `Mengunggah berkas ${scanType.label} untuk ${nameStr}...`);
                }
                const ext = getFileExtensionFromBase64(localBase64);
                const filename = `${scanType.label} - ${nameStr.replace(/[^a-zA-Z0-9 ]/g, '').trim()}${ext}`;
                
                const gdriveRes = await uploadBase64ToGoogleDrive(
                  localBase64,
                  filename,
                  nameStr,
                  cleanNik,
                  sectorVal,
                  programVal
                );
                
                await setDoc(scanRef, {
                  base64: `gdrive:${gdriveRes.id}`,
                  updatedAt: new Date().toISOString()
                });
                
                successCount++;
              } catch (err: any) {
                console.error(`Gagal sync PDF ${scanType.label} untuk ${nameStr}:`, err);
                errors.push(`Berkas [${scanType.label}] ${nameStr}: ${err.message || err}`);
              }
            }
          }
        }
      }
    } catch (errRecipient: any) {
      console.error(`Gagal memproses penerima ${nameStr}:`, errRecipient);
      errors.push(`Penerima [${nameStr}]: ${errRecipient.message || errRecipient}`);
    }
  }

  return { successCount, errors };
};
