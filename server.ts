import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

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
        model: "gemini-2.0-flash",
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
        model: "gemini-2.0-flash",
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

  // OCR API endpoint using Gemini Vision
  app.post("/api/gemini/ocr", async (req: express.Request, res: express.Response) => {
    try {
      const { imageBase64 } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ 
          error: "GEMINI_API_KEY environment variable is not defined on the Server side. Silakan isi API Key di Settings." 
        });
      }

      if (!imageBase64) {
        return res.status(400).json({ error: "No image provided" });
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          }
        }
      });

      // Remove the data:image/jpeg;base64, prefix if it exists
      const base64Data = imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

      const prompt = `
Anda adalah sistem ekstraksi teks pintar (OCR) untuk KTP (Kartu Tanda Penduduk) dan KK (Kartu Keluarga) Indonesia.
Tolong ekstrak informasi dari gambar/foto dokumen kependudukan yang diberikan dan kembalikan ke dalam format JSON.

Jika itu KTP, ekstrak selengkap mungkin:
- NIK (16 digit angka) -> nik
- Nama -> name
- Tempat Lahir -> pob
- Tanggal Lahir (dd-mm-yyyy) -> dob
- Jenis Kelamin (Laki-laki / Perempuan) -> gender
- Golongan Darah -> bloodType
- Alamat -> address
- RT -> rt
- RW -> rw
- Kel/Desa -> kampung
- Kecamatan -> district
- Agama -> religion
- Status Perkawinan -> maritalStatus
- Pekerjaan -> occupation
- Kewarganegaraan -> citizenship
- Berlaku Hingga -> validUntil

Jika gambar tidak jelas atau nilai tidak ditemukan, isikan dengan string kosong "".

Format JSON yang diwajibkan:
{
  "nik": "16 digit angka",
  "name": "nama lengkap",
  "pob": "tempat lahir",
  "dob": "tanggal lahir",
  "gender": "Laki-laki atau Perempuan",
  "bloodType": "A/B/AB/O/-",
  "address": "alamat lengkap",
  "rt": "rt",
  "rw": "rw",
  "kampung": "nama desa/kelurahan",
  "district": "nama kecamatan",
  "religion": "agama",
  "maritalStatus": "status perkawinan",
  "occupation": "pekerjaan",
  "citizenship": "WNI/WNA",
  "validUntil": "Seumur Hidup atau tanggal"
}
`;

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [
           prompt,
           {
             inlineData: {
               data: base64Data,
               mimeType: "image/jpeg"
             }
           }
        ],
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
        }
      });

      res.setHeader("Content-Type", "application/json");
      res.send(response.text);
    } catch (err: any) {
      console.error("Gemini OCR Error:", err);
      if (err.status === 429 || (err.message && err.message.includes("429"))) {
        return res.status(429).json({
          error: "Quota limits exceeded. Mohon tunggu sekitar 1 menit sebelum mencoba scan KTP lagi."
        });
      }
      if (err.status === 503 || (err.message && err.message.includes("503"))) {
        return res.status(503).json({
          error: "Sistem AI sedang sibuk (High Demand). Silakan coba lagi dalam beberapa saat atau gunakan input manual."
        });
      }
      res.status(500).json({ 
        error: err.message || "Terjadi kesalahan ketika melakukan OCR." 
      });
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
