import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
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

  // KTP OCR API endpoint using Gemini-3.5-flash
  app.post("/api/gemini/ocr-ktp", async (req: express.Request, res: express.Response) => {
    try {
      const { imageData } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ 
          error: "GEMINI_API_KEY environment variable is not defined on the Server side. Silakan isi API Key di Settings." 
        });
      }

      if (!imageData) {
        return res.status(400).json({ error: "Parameter 'imageData' required" });
      }

      // Strip out potential data URL prefix
      let mimeType = "image/jpeg";
      let base64Data = imageData;
      const match = imageData.match(/^data:([^;]+);base64,(.*)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          }
        }
      });

      const promptString = `Please extract values from this Indonesian national ID card (KTP) image and return them as JSON matching the requested schema. If a field is illegible or not present on the card, keep it empty or write "".`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data,
              }
            },
            {
              text: promptString
            }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              nik: { type: Type.STRING, description: "Nomor Induk Kependudukan (NIK) of 16 digits" },
              nama: { type: Type.STRING, description: "Full name / Nama" },
              tempat_lahir: { type: Type.STRING, description: "Place of birth / Tempat Lahir" },
              tanggal_lahir: { type: Type.STRING, description: "Birth date in standard DD-MM-YYYY format / Tanggal Lahir" },
              alamat: { type: Type.STRING, description: "Main street/neighborhood address / Alamat" },
              rt_rw: { type: Type.STRING, description: "RT/RW format e.g. 003/002" },
              kel_desa: { type: Type.STRING, description: "Kelurahan or Desa / Kel/Desa" },
              kecamatan: { type: Type.STRING, description: "Kecamatan" }
            },
            required: ["nik", "nama"]
          }
        }
      });

      res.setHeader("Content-Type", "application/json");
      res.send(response.text);
    } catch (err: any) {
      console.error("Gemini OCR Error:", err);
      res.status(500).json({ 
        error: err.message || "Terjadi kesalahan ketika mengekstrak data KTP menggunakan Gemini AI." 
      });
    }
  });

  // KK OCR API endpoint using Gemini-3.5-flash
  app.post("/api/gemini/ocr-kk", async (req: express.Request, res: express.Response) => {
    try {
      const { imageData } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ 
          error: "GEMINI_API_KEY environment variable is not defined on the Server side. Silakan isi API Key di Settings." 
        });
      }

      if (!imageData) {
        return res.status(400).json({ error: "Parameter 'imageData' required" });
      }

      // Strip out potential data URL prefix
      let mimeType = "image/jpeg";
      let base64Data = imageData;
      const match = imageData.match(/^data:([^;]+);base64,(.*)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          }
        }
      });

      const promptString = `Please perform high-precision OCR on this Indonesian Family Card (Kartu Keluarga - KK) image. 
Identify the UPPER TABLE (containing Nama, NIK, Jenis Kelamin, Tempat Lahir, Tanggal Lahir, Agama, Pendidikan, Jenis Pekerjaan) and the LOWER TABLE (containing Status Perkawinan, Status Hubungan Keluarga, Kewarganegaraan, No Paspor, No KITAP, Nama Ayah, Nama Ibu).
Merge the upper table and lower table data perfectly based on the row number / serial number (No.).
Extract the values and return them as JSON exactly matching the requested schema.
If any field or column is empty or contains a hyphen (-), represent its value with an empty string "" only.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data,
              }
            },
            {
              text: promptString
            }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              no_kk: { type: Type.STRING, description: "Nomor Kartu Keluarga" },
              nama_kepala_keluarga: { type: Type.STRING, description: "Nama Kepala Keluarga" },
              alamat: { type: Type.STRING, description: "Alamat Jalan/Rumah" },
              rt_rw: { type: Type.STRING, description: "RT/RW format e.g. 003/002" },
              kode_pos: { type: Type.STRING, description: "Kode Pos" },
              desa_kelurahan: { type: Type.STRING, description: "Desa atau Kelurahan" },
              kecamatan: { type: Type.STRING, description: "Kecamatan" },
              kabupaten_kota: { type: Type.STRING, description: "Kabupaten atau Kota" },
              provinsi: { type: Type.STRING, description: "Provinsi" },
              anggota_keluarga: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    no: { type: Type.INTEGER, description: "Nomor urut anggota keluarga mulai dari 1" },
                    nama_lengkap: { type: Type.STRING, description: "Nama Lengkap" },
                    nik: { type: Type.STRING, description: "NIK (16 digit)" },
                    jenis_kelamin: { type: Type.STRING, description: "Jenis Kelamin (LAKI-LAKI / PEREMPUAN)" },
                    tempat_lahir: { type: Type.STRING, description: "Tempat Lahir" },
                    tanggal_lahir: { type: Type.STRING, description: "Tanggal Lahir (DD-MM-YYYY)" },
                    agama: { type: Type.STRING, description: "Agama" },
                    pendidikan: { type: Type.STRING, description: "Pendidikan terakhir" },
                    jenis_pekerjaan: { type: Type.STRING, description: "Jenis Pekerjaan" },
                    status_perkawinan: { type: Type.STRING, description: "Status Perkawinan" },
                    status_hubungan_keluarga: { type: Type.STRING, description: "Status Hubungan Keluarga (KEPALA KELUARGA, ISTERI, ANAK, dll)" },
                    kewarganegaraan: { type: Type.STRING, description: "Kewarganegaraan e.g. WNI" },
                    no_paspor: { type: Type.STRING, description: "Nomor Paspor" },
                    no_kitas_kitap: { type: Type.STRING, description: "Nomor KITAS/KITAP" },
                    nama_ayah: { type: Type.STRING, description: "Nama Lengkap Ayah" },
                    nama_ibu: { type: Type.STRING, description: "Nama Lengkap Ibu" }
                  },
                  required: [
                    "no", "nama_lengkap"
                  ]
                }
              }
            },
            required: [
              "no_kk", "anggota_keluarga"
            ]
          }
        }
      });

      res.setHeader("Content-Type", "application/json");
      res.send(response.text);
    } catch (err: any) {
      console.error("Gemini KK OCR Error:", err);
      res.status(500).json({ 
        error: err.message || "Terjadi kesalahan ketika mengekstrak data Kartu Keluarga menggunakan Gemini AI." 
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
