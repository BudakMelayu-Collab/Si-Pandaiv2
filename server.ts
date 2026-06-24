import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

// Service Account Access Token Cache
interface CachedToken {
  accessToken: string;
  expiresAt: number;
}
let tokenCache: CachedToken | null = null;

// Firebase ID token verifier using Firebase Auth REST API
async function verifyFirebaseIdToken(idToken: string): Promise<string | null> {
  const apiKey = process.env.VITE_FIREBASE_API_KEY;
  if (!apiKey) {
    console.error("VITE_FIREBASE_API_KEY is not defined on server.");
    return null;
  }
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken })
    });
    if (res.ok) {
      const data = await res.json();
      const email = data.users?.[0]?.email;
      return email || null;
    } else {
      const txt = await res.text();
      console.warn("IdToken verification failed:", txt);
    }
  } catch (e) {
    console.error("Error verifying Firebase ID token:", e);
  }
  return null;
}

// Fetch settings/gdrive_service_account document REST-fully
async function fetchServiceAccountFromFirestoreRes(idToken: string): Promise<any> {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  const databaseId = process.env.VITE_FIREBASE_DATABASE_ID || "(default)";
  if (!projectId) {
    throw new Error("VITE_FIREBASE_PROJECT_ID environment variable is not defined on the Server.");
  }
  
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/settings/gdrive_service_account`;
  const res = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${idToken}`
    }
  });
  
  if (res.status === 404 || res.status === 403) {
    // Document not found or insufficient permissions (e.g. not configured yet)
    return null;
  }
  
  if (!res.ok) {
    const text = await res.text();
    console.error("fetchServiceAccountFromFirestoreRes error:", res.status, text);
    throw new Error(`Gagal mengambil Service Account dari Firestore: ${res.status}`);
  }
  
  const body = await res.json();
  const fields = body.fields || {};
  const jsonStr = fields.service_account_json?.stringValue;
  if (!jsonStr) {
    return null;
  }
  
  return JSON.parse(jsonStr);
}

// Sign RS256 JWT
function signGoogleJwt(payload: any, privateKey: string): string {
  const header = { alg: "RS256", typ: "JWT" };
  const base64Header = Buffer.from(JSON.stringify(header)).toString("base64url");
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  
  const sign = crypto.createSign("SHA256");
  sign.update(`${base64Header}.${base64Payload}`);
  
  const formattedKey = privateKey.replace(/\\n/g, '\n');
  const signature = sign.sign(formattedKey, "base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  
  return `${base64Header}.${base64Payload}.${signature}`;
}

// Exchange JWT for GDrive bearer access token
async function getDriveAccessTokenFromServiceAccount(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };
  
  const jwt = signGoogleJwt(payload, sa.private_key);
  
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google OAuth exchanges failed: ${response.statusText} (${errText})`);
  }
  
  const data = await response.json();
  if (!data.access_token) {
    throw new Error("Google tidak mengembalikan access_token.");
  }
  return data.access_token;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Parse JSON payloads
  app.use(express.json({ limit: "15mb" }));

  // Chatbot Assistant API endpoint
  app.post("/api/gemini/chat", async (req: express.Request, res: express.Response) => {
    try {
      const { messages, contextData } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ 
          error: "GEMINI_API_KEY environment variable is not defined on the Server side. Please set it in Settings > Secrets." 
        });
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          }
        }
      });

      const systemInstruction = `
Anda adalah Asisten AI Gemini yang terintegrasi secara cerdas di dalam platform "Si-PANDAI".
Tugas Anda adalah mendampingi para staf administrasi, keuangan, dan pimpinan program "Si-PANDAI" (Sistem Administrasi Bantuan Sosial) Kabupaten Siak, Riau, Indonesia.

Berikan jawaban yang ramah, profesional, cerdas, bernada santun, dan produktif dalam bahasa Indonesia yang baik dan benar.

Berikut adalah ringkasan konteks mengenai platform Si-PANDAI:
- Platform ini membantu pengelolaan dan verifikasi 'Mustahik' (penerima manfaat dana zakat & bantuan sosial).
- Memiliki lima pilar program utama pelindung kemaslahatan umat (disebut Program Bidang SIAK):
  1. Siak Cerdas (Bantuan pendidikan, beasiswa, perlengkapan sekolah anak kurang mampu)
  2. Siak Dakwah (Program dakwah, kemasjidan, pembinaan muallaf, bantuan guru ngaji/preacher)
  3. Siak Peduli (Bantuan konsumtif rutin/non-rutin, sembako, tanggap darurat musibah/bencana, santunan lansia)
  4. Siak Sehat (Bantuan pembiayaan kesehatan, pengobatan dhuafa, layanan rujukan medis)
  5. Siak Sejahtera (Pemberdayaan ekonomi produktif, modal usaha mikro, bantuan sarana tani/nelayan, ATM Beras, Rumah Singgah)
- Workflow administrasi dokumen utama:
  - Tanda Terima Berkas (Receipt)
  - MPZIS (Memorandum Rekomendasi Unit Pengumpul Zakat)
  - E-PPD (Elektronik Permohonan Pengeluaran Dana)
  - SURVEY / Verifikasi Kelayakan lapangan terstruktur dengan model scoring desil
- Pengguna dapat menggabungkan dokumen scan (Merge/Gabung berkas).

${contextData ? `Berikut adalah data mustahik ter-update yang saat ini aktif di sistem:\n${JSON.stringify(contextData)}\n` : ""}

Petunjuk Tambahan:
1. Jika pengguna bertanya tentang data penerima atau statistik (misal: "siapa saja yang mendaftar hari ini?", "berapa total usulan bantuan?", "cari nama Mustahik X"), silakan Anda analisis data mustahik aktual di atas dan berikan ringkasan/tabel informasi yang rapi.
2. Jika ada data, sampaikan detail nama, NIK, alamat kampung, program, dan nominal bantuan secara detail dan terstruktur dengan format Markdown yang indah.
3. Selalu sambut pertanyaan pengguna dengan penuh keramahan khas adat melayu/Riau jika relevan.
`;

      const contents = messages.map((m: any) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }]
      }));

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash-lite",
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.7,
        }
      });

      res.json({ text: response.text });
    } catch (err: any) {
      console.error("Gemini Assistant Error:", err);
      res.status(500).json({ 
        error: err.message || "Terjadi kesalahan internal ketika memanggil backend Gemini AI." 
      });
    }
  });

  // Auto Classification API endpoint using Gemini structured JSON
  app.post("/api/gemini/classify", async (req: express.Request, res: express.Response) => {
    try {
      const { description } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ 
          error: "GEMINI_API_KEY environment variable is not defined on the Server side. Silakan isi API Key di Settings." 
        });
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          }
        }
      });

      const prompt = `
Anda adalah mesin klasifikasi dan analisis cerdas untuk berkas pendaftaran bantuan sosial "Si-PANDAI" Kabupaten Siak, Riau.
Tugas Anda mendeteksi kategori yang cocok berdasarkan teks penjelasan keadaan pendaftar/mustahik.

Teks keadaan/permohonan pendaftar:
"${description}"

Silakan analisis teks di atas lalu tentukan klasifikasi terbaik menggunakan data pilihan yang diizinkan di sistem kami berikut ini:

1. Bidang (Sector):
   Harus salah satu dari: "Siak Cerdas", "Siak Dakwah", "Siak Peduli", "Siak Sejahtera", "Siak Sehat"

2. Sub Bidang (Sub Sector) berdasarkan Bidang:
   - "Siak Cerdas": ["Pendidikan Anak Usia Dini", "Pendidikan Dasar", "Pendidikan Menengah", "Pendidikan Atas", "Pendidikan Tinggi", "Pendidikan Khusus", "Pendidikan Agama", "Pendidikan Vokasional dan Kejuruan", "Transportasi Luar Negeri", "Transportasi Dalam Negeri", "Seragam"]
   - "Siak Dakwah": ["Muallaf", "Suluk", "Amil UPZ", "Operasional"]
   - "Siak Peduli": ["Bantuan Alat Kesehatan", "Kesehatan Ibu dan Anak", "Layanan Medis", "Bantuan Utilitas", "Infrastruktur Sanitasi", "Kebutuhan Dasar", "Layanan Asuhan"]
   - "Siak Sejahtera": ["Ekonomi Kreatif", "Kuliner", "Food Herbal", "Perdagangan Eceran", "Perikanan dan Perdagangan", "Industri dan Perdagangan", "Peternakan dan Perdagangan", "Kehutanan dan Perdagangan", "Jasa Perawatan Pribadi dan Rumah Tangga", "Jasa Pembersihan Kendaraan", "Jasa Perawatan dan Perbaikan Kendaraan"]
   - "Siak Sehat": ["Santunan Harian", "Santunan Transportasi Rujukan", "Dana Transportasi Kontrol"]

3. Jenis Bantuan (Aid Type) berdasarkan Bidang:
   - "Siak Cerdas": ["Bantuan Tunai Pendidikan", "Beasiswa Tunai Pendidikan", "Bantuan Tunai Pendidikan Transportasi Pendidikan Luar Negeri", "Seragam Tunai", "Seragam Non Tunai", "Beasiswa Penuh", "Bantuan Tunai Pendidikan Transportasi Pendidikan Dalam Negeri"]
   - "Siak Sejahtera": ["Modal Usaha", "Gerobak", "Pertanian", "Perikanan", "Kambing", "Sapi", "Ayam", "Peralatan Usaha dan Modal Usaha", "Branding", "Peralatan Usaha"]
   - "Siak Dakwah": ["Santunan Tunai", "Santunan Non Tunai", "Bahan Pokok dan Sembako"]
   - "Siak Peduli": ["Alat Kesehatan Non Tunai", "Tunai", "Rehabilitasi Rumah", "Pemasangan KWH Listrik", "Pembangunan Infrastruktur Sanitasi", "Sembako/Bahan Pokok", "Transfer Bulanan", "Santunan", "Alat Kesehatan Tunai"]
   - "Siak Sehat": ["Bantuan Tunai", "Bantuan Non Tunai"]

4. Nama Program (Program Name) berdasarkan Bidang:
   - "Siak Cerdas": ["Biaya Pendidikan", "Siceria Yatim Dhuafa", "Siceria Riset", "Siceria KAT", "Beasiswa Cendikia Baznas", "Satu Keluarga Satu Sarjana"]
   - "Siak Dakwah": ["Santunan Mualaf", "Suluk"]
   - "Siak Sejahtera": ["Mitra Skelas", "Mitra BLK", "Usaha Produktif Kecamatan III", "Usaha Produktif Kecamatan II", "MIKO", "Z-Kuliner Gerobak Bakso", "Z-Auto", "Z-Mart", "Ternak Unggas", "Ternak Kambing/Domba", "Lumbung Pangan", "Z-Chiken", "Microprenuer Mandiri", "Santripreneur", "Terunapreneur"]
   - "Siak Peduli": ["Bantuan Alat Kesehatan", "Stunting", "KWH Listrik", "Sanitasi Sehat", "Fakir Berkelanjutan", "Biaya Hidup", "RTLH", "RLH", "Khitanan Massal", "Tanggap Bencana"]
   - "Siak Sehat": ["Transfortasi Pasien", "Pendamping Pasien"]

5. Nominal Diajukan (Amount Proposed):
   Tolong analisis apakah ada jumlah uang atau nominal bantuan yang tersirat atau tersurat dalam teks (misalnya "dua juta", "1.500.000", "5 ratus ribu"). Jika ada, kembalikan dalam bentuk angka bulat (number). Jika tidak terdeteksi sama sekali, berikan perkiraan default yang rasional untuk program tersebut (misalnya 1500000 atau 2000000).

6. Mengajukan Bantuan Untuk (Purpose):
   Tuliskan rumusan tujuan pengajuan bantuan secara singkat, padat, dan formal dalam bahasa Indonesia. Maksimal 100 karakter. Contoh: "Bantuan Modal Usaha Dagang Kue Keliling" atau "Bantuan Biaya Pengobatan Kanker Mustahik".

7. Catatan/Analisis AI (Notes):
   Beri rangkasan analisis singkat (1-2 kalimat) mengapa klasifikasi ini cocok serta kelayakan awalnya berdasarkan deskripsi.

Kembalikan jawaban Anda dalam format JSON murni dengan struktur berikut:
{
  "sector": "...",
  "subSector": "...",
  "aidType": "...",
  "programName": "...",
  "amountProposed": 1500000,
  "purpose": "...",
  "notes": "..."
}
`;

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash-lite",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.2,
        }
      });

      res.setHeader("Content-Type", "application/json");
      res.send(response.text);
    } catch (err: any) {
      console.error("Gemini Classification Error:", err);
      res.status(500).json({ 
        error: err.message || "Terjadi kesalahan ketika melakukan klasifikasi menggunakan Gemini AI." 
      });
    }
  });

  // GET /api/gdrive/token - Return a cached/issued Google OAuth2 token using the Service Account
  app.get("/api/gdrive/token", async (req: express.Request, res: express.Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Sesi autentikasi diperlukan. Hubungkan akun Anda." });
      }
      
      const idToken = authHeader.substring(7);
      const email = await verifyFirebaseIdToken(idToken);
      if (!email) {
        return res.status(401).json({ error: "Sesi Anda tidak valid atau telah kadaluarsa." });
      }

      // Check Cache
      if (tokenCache && tokenCache.expiresAt > Date.now() + 60000) {
        return res.json({ accessToken: tokenCache.accessToken });
      }

      let sa: any = null;
      // 1. Env variable secret checks
      if (process.env.GDRIVE_SERVICE_ACCOUNT_JSON) {
        try {
          sa = JSON.parse(process.env.GDRIVE_SERVICE_ACCOUNT_JSON);
        } catch (e: any) {
          console.error("Failed to parse GDRIVE_SERVICE_ACCOUNT_JSON:", e);
        }
      }

      // 2. Db fallback
      if (!sa) {
        sa = await fetchServiceAccountFromFirestoreRes(idToken);
      }

      if (!sa || !sa.private_key || !sa.client_email) {
        return res.status(404).json({ error: "Service account tidak dikonfigurasi. Silakan minta Super Admin mengaturnya." });
      }

      const accessToken = await getDriveAccessTokenFromServiceAccount(sa);

      // Cache it
      tokenCache = {
        accessToken: accessToken,
        expiresAt: Date.now() + 3500 * 1000 // Cache for 58 mins
      };

      return res.json({ accessToken });
    } catch (err: any) {
      console.error("Service Account Token Endpoint Error:", err);
      return res.status(500).json({ error: err.message || "Gagal mendapatkan token Google Drive." });
    }
  });

  // POST /api/gdrive/test-auth - Test custom Service Account keys
  app.post("/api/gdrive/test-auth", async (req: express.Request, res: express.Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Sesi administratif diperlukan." });
      }
      
      const idToken = authHeader.substring(7);
      const email = await verifyFirebaseIdToken(idToken);
      if (!email) {
        return res.status(401).json({ error: "Layanan autentikasi gagal dihubungi." });
      }

      // Strict admin filter
      if (email !== "muhammad.nawa@gmail.com") {
        return res.status(403).json({ error: "Hanya Super Admin muhammad.nawa@gmail.com yang berhak menguji Service Account." });
      }

      const { service_account_json } = req.body;
      if (!service_account_json) {
        return res.status(400).json({ error: "JSON Service Account daddituhkan." });
      }

      const sa = JSON.parse(service_account_json);
      if (!sa.private_key || !sa.client_email) {
        return res.status(400).json({ error: "Struktur JSON tidak sah. Harus memiliki 'private_key' dan 'client_email'." });
      }

      const accessToken = await getDriveAccessTokenFromServiceAccount(sa);

      // Quick test call to verification endpoint
      const testRes = await fetch("https://www.googleapis.com/drive/v3/files?pageSize=1", {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });

      if (!testRes.ok) {
        const driveErr = await testRes.text();
        throw new Error(`Tes Google Drive API Gagal. Aktifkan Google Drive API di Google Cloud Console. Detail: ${driveErr}`);
      }

      return res.json({ 
        status: "ok", 
        clientEmail: sa.client_email,
        message: "Akun Robot Service Anda berhasil terhubung dan diotorisasi!"
      });
    } catch (err: any) {
      console.error("Service Account Test Route Error:", err);
      return res.status(400).json({ error: err.message || "Format JSON salah/gagal divalidasi oleh Google." });
    }
  });

  // Vite middleware logic
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Si-PANDAI Server is booting up and running on port ${PORT}`);
  });
}

startServer();
