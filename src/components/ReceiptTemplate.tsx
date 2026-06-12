import React, { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import { Recipient } from '../types';
import { 
  Printer, X, FileCheck, Edit3, Upload, Image as ImageIcon, 
  Trash2, Eye, FileText, AlertCircle, ChevronRight, Loader2,
  Download, Settings, Save
} from 'lucide-react';
import { cn, compressImage, isBase64SizeValid } from '../lib/utils';
import * as storage from '../lib/storage';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

interface ReceiptTemplateProps {
  recipient: Recipient;
  onClose: () => void;
  onEdit: (recipient: Recipient) => void;
}

const DOCUMENT_OPTIONS = [
  "Surat Permohonan",
  "Fotocopy KTP",
  "Fotocopy KK",
  "Surat Keterangan Tidak Mampu Asli",
  "Surat Keterangan Tidak Mampu Fotocopy",
  "Surat Kontrol Rumah Sakit",
  "Surat Rawat Inap Pasien",
  "Foto Mustahik",
  "Fotocopy Buku Rekening Bank",
  "Surat Keterangan Aktif Belajar",
  "Surat Keterangan Aktif Kuliah",
  "Fotocopy Rapor",
  "Fotocopy KRS",
  "Fotocopy KHS",
  "Fotocopy Transkip Nilai",
  "Lainnya"
];

export default function ReceiptTemplate({ recipient, onClose, onEdit }: ReceiptTemplateProps) {
  const [logo, setLogo] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [viewMode, setViewMode] = useState<'template' | 'scan' | 'config'>('template');
  
  const [signedReceiptPdfUrl, setSignedReceiptPdfUrl] = useState<string | null>(null);
  const [signedPdfBlobUrl, setSignedPdfBlobUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [scale, setScale] = useState(0.85);
  const [paperSize, setPaperSize] = useState<'A4' | 'F4'>('F4');
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadedRecipientId, setLoadedRecipientId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');

  const [templateConfig, setTemplateConfig] = useState({
    logo: '',
    institution: '',
    region: 'KABUPATEN SIAK',
    subText: 'Badan Amil Zakat Nasional',
    fontSize: 9,
    logoSize: 48
  });

  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Local state for template-specific edits
  const [receiptData, setReceiptData] = useState({
    name: recipient.name,
    subject: `${recipient.aidType} - ${recipient.programName}`,
    docCount: '1 (Satu) Berkas',
    identity: `${recipient.nik} / ${recipient.kk}`,
    phone: recipient.contact,
    address: `${recipient.address}, ${recipient.kampung}, ${recipient.district}`,
    documents: [
      'Surat Permohonan',
      'Fotocopy KTP',
      'Fotocopy KK',
      'Surat Keterangan Tidak Mampu Asli',
      'Foto Mustahik'
    ],
    giverName: '',
    receiverLabel: 'Penerima Berkas',
    receiverName: '',
    giverLabel: 'Pemberi Berkas'
  });

  // Load saved data from storage/cloud on mount
  useEffect(() => {
    const loadData = async () => {
      setIsLoaded(false);
      
      let savedLogo = null;
      try {
        const { getDoc, doc: fsDoc } = await import('firebase/firestore');
        
        // 1. Try global settings
        const snap = await getDoc(fsDoc(db, 'settings', 'app'));
        if (snap.exists() && snap.data().logoUrl) {
          savedLogo = snap.data().logoUrl;
        }

        // 2. Try Survey template (which is the most reliable cloud logo)
        if (!savedLogo) {
          const surveySnap = await getDoc(fsDoc(db, 'settings', 'survey_template'));
          if (surveySnap.exists() && surveySnap.data().logo) {
            savedLogo = surveySnap.data().logo;
          }
        }

        // 3. Try Receipt template config itself
        if (!savedLogo) {
          const receiptSnap = await getDoc(fsDoc(db, 'settings', 'receipt_template'));
          if (receiptSnap.exists() && receiptSnap.data().logo) {
            savedLogo = receiptSnap.data().logo;
          }
        }

        // 4. Try MPZIS template config
        if (!savedLogo) {
          const mpzisSnap = await getDoc(fsDoc(db, 'settings', 'mpzis_template'));
          if (mpzisSnap.exists() && mpzisSnap.data().logo) {
            savedLogo = mpzisSnap.data().logo;
          }
        }

        // 5. Try E-PPD template config
        if (!savedLogo) {
          const eppdSnap = await getDoc(fsDoc(db, 'settings', 'eppd_template'));
          if (eppdSnap.exists() && eppdSnap.data().logo) {
            savedLogo = eppdSnap.data().logo;
          }
        }

        if (savedLogo) {
          await storage.setItem('baznas_logo', savedLogo);
        }
      } catch (err) {
        console.error("Failed to load global logo dynamically from Cloud Firestore in ReceiptTemplate:", err);
      }

      if (!savedLogo) {
        savedLogo = await storage.getItem('baznas_logo');
      }
      setLogo(savedLogo);

      // Try Cloud Firestore first to ensure the latest data from other devices/roles is loaded
      let savedData = null;
      try {
        const { getRecipientTemplateData } = await import('../firebase');
        savedData = await getRecipientTemplateData(recipient.id, 'receipt');
        if (savedData) {
          await storage.setItem(`receipt_data_${recipient.id}`, savedData);
        }
      } catch (e) {
        console.error("Cloud receipt load failed, trying local storage fallback", e);
      }

      // If not available from cloud, fallback to local storage
      if (!savedData) {
        savedData = await storage.getItem(`receipt_data_${recipient.id}`);
      }

      if (savedData) {
        setReceiptData(typeof savedData === 'string' ? JSON.parse(savedData) : savedData);
      }
      
      setLoadedRecipientId(recipient.id);
      setIsLoaded(true);
    };
    loadData();
  }, [recipient.id]);

  // Auto-save receipt data
  useEffect(() => {
    if (!isLoaded || loadedRecipientId !== recipient.id) return;

    const saveData = async () => {
      setSaveStatus('saving');
      try {
        await storage.setItem(`receipt_data_${recipient.id}`, receiptData);
        const { saveRecipientTemplateData } = await import('../firebase');
        await saveRecipientTemplateData(recipient.id, 'receipt', receiptData);
        setSaveStatus('saved');
      } catch (e) {
        console.error("Cloud receipt save failed", e);
        setSaveStatus('error');
      }
    };

    const timer = setTimeout(saveData, 1500);
    return () => clearTimeout(timer);
  }, [receiptData, recipient.id, isLoaded, loadedRecipientId]);

  // Listen to real-time updates for global configuration
  useEffect(() => {
    const configDoc = doc(db, 'settings', 'receipt_template');
    const unsubscribe = onSnapshot(configDoc, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setTemplateConfig(prev => ({
          ...prev,
          ...data,
          fontSize: data.fontSize || 9,
          logoSize: data.logoSize || 48
        }));
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLogoUploadConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          const MAX_DIM = 400;
          if (width > height) {
            if (width > MAX_DIM) {
              height *= MAX_DIM / width;
              width = MAX_DIM;
            }
          } else {
            if (height > MAX_DIM) {
              width *= MAX_DIM / height;
              height = MAX_DIM;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/png');
          setTemplateConfig(prev => ({ ...prev, logo: dataUrl }));
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const saveConfig = async () => {
    try {
      setIsSavingConfig(true);
      const configDoc = doc(db, 'settings', 'receipt_template');
      await setDoc(configDoc, {
        ...templateConfig,
        updatedAt: new Date().toISOString()
      });
      alert('Konfigurasi template berhasil disimpan secara global!');
      setViewMode('template');
    } catch (error) {
      console.error('Error saving config:', error);
      alert('Gagal menyimpan konfigurasi. Pastikan Anda memiliki izin.');
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Fetch scan from subcollection
  useEffect(() => {
    const fetchScan = async () => {
      if (recipient.hasSignedReceiptPdf && !signedReceiptPdfUrl) {
        setIsLoadingFile(true);
        try {
          const { getRecipientFile } = await import('../firebase');
          const base64 = await getRecipientFile(recipient.id, 'receipt');
          if (base64) {
            setSignedReceiptPdfUrl(base64);
            // Auto switch to scan mode if it exists and we're just opening
            if (viewMode === 'template') setViewMode('scan');
          } else {
            // Clear stale flag
            const { updateRecipientReceiptPdf } = await import('../firebase');
            await updateRecipientReceiptPdf(recipient.id, null);
          }
        } catch (error) {
          console.error("Failed to fetch scan", error);
        } finally {
          setIsLoadingFile(false);
        }
      }
    };
    fetchScan();
  }, [recipient.id, recipient.hasSignedReceiptPdf]);

  // Convert Base64 to Blob URL
  useEffect(() => {
    if (signedReceiptPdfUrl && signedReceiptPdfUrl.startsWith('data:application/pdf')) {
      const createBlobUrl = async () => {
        try {
          if (signedPdfBlobUrl) URL.revokeObjectURL(signedPdfBlobUrl);
          const response = await fetch(signedReceiptPdfUrl);
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          setSignedPdfBlobUrl(url);
        } catch (e) {
          console.error("Failed to create blob URL", e);
        }
      };
      createBlobUrl();
      return () => {
        if (signedPdfBlobUrl) URL.revokeObjectURL(signedPdfBlobUrl);
      };
    } else {
      if (signedPdfBlobUrl) {
        URL.revokeObjectURL(signedPdfBlobUrl);
        setSignedPdfBlobUrl(null);
      }
    }
  }, [signedReceiptPdfUrl]);

  const handlePrint = () => {
    window.print();
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 500) {
        alert('File logo terlalu besar. Maksimal 500KB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        setLogo(base64);
        await storage.setItem('baznas_logo', base64);
        try {
          const { updateAppSettings } = await import('../firebase');
          await updateAppSettings({ logoUrl: base64 });

          // Sync directly to config document as well so it updates templateConfig in real-time
          const { setDoc, doc: fsDoc } = await import('firebase/firestore');
          await setDoc(fsDoc(db, 'settings', 'receipt_template'), {
            logo: base64
          }, { merge: true });
        } catch (err) {
          console.error("Failed to sync logo inside ReceiptTemplate:", err);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSavePdfToServer = async (base64: string | null) => {
    setIsUploading(true);
    try {
      const { updateRecipientReceiptPdf } = await import('../firebase');
      await updateRecipientReceiptPdf(recipient.id, base64);
      setSignedReceiptPdfUrl(base64);
      if (base64) setViewMode('scan');
    } catch (error: any) {
      console.error(error);
      alert('Gagal menyimpan ke Cloud. ' + (error.message.includes('quota') ? 'Quota storage penuh.' : 'File mungkin terlalu besar (>1MB).'));
    } finally {
      setIsUploading(false);
    }
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const { ensureGoogleDriveConnected, getGoogleAccessToken } = await import('../firebase');
      await ensureGoogleDriveConnected();

      const isPdf = file.type === 'application/pdf';

      if (!isPdf) {
        alert('Mohon upload file dalam format PDF.');
        setIsUploading(false);
        return;
      }

      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;

        // Validate size for Firestore if Google Drive is not connected (1MB limit)
        if (!getGoogleAccessToken() && !isBase64SizeValid(base64)) {
          alert('File terlalu besar. Silakan gunakan file yang lebih kecil atau resolusi lebih rendah (Maksimal ~700KB setelah kompresi) atau hubungkan Google Drive Anda.');
          setIsUploading(false);
          return;
        }

        await handleSavePdfToServer(base64);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Upload error:', error);
      alert('Terjadi kesalahan saat memproses file.');
      setIsUploading(false);
    }
  };

  const renderReceiptContent = (type: 'PEMOHON' | 'ARSIP') => (
    <div 
      className={cn(
        "w-full px-8 py-4 font-sans leading-tight text-black flex flex-col relative border-gray-300 print:border-gray-400 bg-white",
        type === 'PEMOHON' ? "border-b border-dashed pb-4 mb-2 print:mb-0 print:pb-2" : "pt-1"
      )}
      style={{ fontSize: `${templateConfig.fontSize}pt` }}
    >
      {/* Header */}
      <div className="flex items-center gap-4 mb-2 border-b border-black pb-1">
        <div 
          className="flex-shrink-0 flex items-center justify-center border-2 border-dashed border-slate-200 relative group overflow-hidden rounded bg-white print:border-none print:bg-transparent"
          style={{ width: `${templateConfig.logoSize + 16}px`, height: `${templateConfig.logoSize + 16}px` }}
        >
          {templateConfig.logo ? (
            <img src={templateConfig.logo} alt="Logo" className="max-w-full max-h-full object-contain" style={{ height: `${templateConfig.logoSize}px` }} />
          ) : logo ? (
            <img src={logo} alt="Logo" className="max-w-full max-h-full object-contain" style={{ height: `${templateConfig.logoSize}px` }} />
          ) : (
            <div className="text-center p-1">
              <ImageIcon className="w-6 h-6 text-slate-300 mx-auto group-hover:text-indigo-400 transition-colors" />
            </div>
          )}
          <label className="absolute inset-0 cursor-pointer flex items-center justify-center bg-black/0 hover:bg-black/40 opacity-0 hover:opacity-100 transition-all print:hidden">
            <Upload className="w-4 h-4 text-white" />
            <input type="file" className="hidden" onChange={handleLogoUpload} accept="image/*" />
          </label>
        </div>
        <div className="flex-1 text-center pr-16">
          <h1 className="font-bold uppercase tracking-tight mb-0" style={{ fontSize: `${templateConfig.fontSize + 4}pt` }}>
            {templateConfig.subText || "BADAN AMIL ZAKAT NASIONAL"}
          </h1>
          <p className="font-bold uppercase tracking-tight mb-0" style={{ fontSize: `${templateConfig.fontSize + 2}pt` }}>
            {templateConfig.region || "KABUPATEN SIAK"}
          </p>
          <p className="leading-tight mb-0" style={{ fontSize: `${templateConfig.fontSize - 1}pt` }}>
            Gedung Graha Baznas Kabupaten Siak, Jl Sultan Syarif Ali
          </p>
          <p className="leading-tight font-medium" style={{ fontSize: `${templateConfig.fontSize - 1}pt` }}>
            Kecamatan Siak, Kabupaten Siak, Riau
          </p>
        </div>
      </div>

      {/* Title */}
      <div className="text-center mb-1 relative">
        <h2 className="text-lg font-bold underline mb-0 uppercase tracking-widest leading-none">TANDA TERIMA</h2>
        <p className="text-[11px] mt-0.5 font-bold">
          Nomor: {recipient.registrationId}/TT/{
            recipient.sector === 'Siak Cerdas' ? 'SC' :
            recipient.sector === 'Siak Dakwah' ? 'SD' :
            recipient.sector === 'Siak Peduli' ? 'SP' :
            recipient.sector === 'Siak Sehat' ? 'SS' :
            recipient.sector === 'Siak Sejahtera' ? 'SJ' : 'SC'
          }/{['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][new Date().getMonth()]}/{new Date().getFullYear()}
        </p>
        <div className="absolute top-0 right-0 px-2 py-0.5 bg-slate-100 rounded text-[9px] font-bold tracking-widest text-black border border-slate-200 uppercase print:border-black print:bg-white">
          {type} COPY
        </div>
      </div>

      <p className="mb-1 text-sm">
        Telah di terima berkas permohonan bantuan atas nama :
      </p>

      {/* Data Body */}
      <div className="space-y-0.5 mb-2 text-sm">
        {[
          { label: 'Nama Pemohon', value: receiptData.name, key: 'name' },
          { label: 'Perihal', value: receiptData.subject, key: 'subject' },
          { label: 'Jumlah Berkas', value: receiptData.docCount, key: 'docCount' },
          { label: 'NIK/No.KK', value: receiptData.identity, key: 'identity' },
          { label: 'Nomor HP', value: receiptData.phone, key: 'phone' },
          { label: 'Alamat Lengkap', value: receiptData.address, key: 'address', multiline: true }
        ].map((item) => (
          <div key={item.key} className="grid grid-cols-[160px_20px_1fr] items-start">
            <span className="text-black font-bold">{item.label}</span>
            <span className="text-black font-bold">:</span>
            {isEditing ? (
              item.multiline ? (
                <textarea 
                  className="border-b border-indigo-200 focus:border-indigo-500 outline-none w-full bg-indigo-50/20 px-2 py-0.5 resize-none font-sans text-sm"
                  rows={2}
                  value={item.value}
                  onChange={e => setReceiptData({...receiptData, [item.key]: e.target.value})}
                />
              ) : (
                <input 
                  className="border-b border-indigo-200 focus:border-indigo-500 outline-none w-full bg-indigo-50/20 px-2 py-0.5 font-sans text-sm"
                  value={item.value}
                  onChange={e => setReceiptData({...receiptData, [item.key]: e.target.value})}
                />
              )
            ) : (
              <span className="text-black font-sans leading-tight">{item.value}</span>
            )}
          </div>
        ))}
      </div>

      <h4 className="border-b border-black pb-0.5 mb-1.5 text-xs font-bold tracking-wider uppercase">Berkas Lampiran :</h4>
      <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 mb-3 text-[11px] min-h-[30px]">


        {receiptData.documents.map((doc, idx) => {
          const isPredefined = DOCUMENT_OPTIONS.slice(0, -1).includes(doc);

          return (
            <div key={idx} className="flex items-start gap-1">
              <span className="text-black font-medium">[{idx + 1}]</span>
              {isEditing ? (
                <div className="flex flex-col flex-1 gap-1">
                  <div className="flex items-center gap-1">
                    <select 
                      className="border-b border-indigo-200 focus:border-indigo-500 outline-none flex-1 bg-indigo-50/30 font-sans py-0 text-[11px]"
                      value={isPredefined ? doc : (doc === "" ? "" : "Lainnya")}
                      onChange={e => {
                        const val = e.target.value;
                        const newDocs = [...receiptData.documents];
                        newDocs[idx] = val === "Lainnya" ? "" : val;
                        setReceiptData({...receiptData, documents: newDocs});
                      }}
                    >
                      <option value="">-- Pilih Berkas --</option>
                      {DOCUMENT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                    <button 
                      onClick={() => {
                        const newDocs = receiptData.documents.filter((_, i) => i !== idx);
                        setReceiptData({...receiptData, documents: newDocs});
                      }}
                      className="text-red-400 hover:text-red-600 p-0.5"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ) : (
                <span className="text-black font-sans">{doc || '-'}</span>
              )}
            </div>
          );
        })}
        {isEditing && receiptData.documents.length < 12 && (
          <button 
            onClick={() => setReceiptData({...receiptData, documents: [...receiptData.documents, '']})}
            className="col-span-2 mt-1 flex items-center justify-center gap-1.5 py-1 border-2 border-dashed border-indigo-100 text-indigo-400 hover:border-indigo-300 hover:text-indigo-600 rounded text-[9px] font-bold uppercase transition-all"
          >
            + Tambah Berkas Lampiran
          </button>
        )}
      </div>

      {/* Signatures */}
      <div className="flex justify-between items-start pt-1">
        <div className="text-center w-44">
          {isEditing ? (
            <input 
              className="border-b border-indigo-200 focus:border-indigo-500 outline-none w-full bg-indigo-50/30 text-center mb-8 text-[10px] uppercase font-bold"
              value={receiptData.receiverLabel}
              onChange={e => setReceiptData({...receiptData, receiverLabel: e.target.value})}
            />
          ) : (
            <p className="mb-8 text-xs font-bold underline">{receiptData.receiverLabel},</p>
          )}
          
          {isEditing ? (
            <input 
              className="border-b border-indigo-200 focus:border-indigo-500 outline-none w-full bg-indigo-50/30 text-center text-xs font-bold"
              value={receiptData.receiverName}
              onChange={e => setReceiptData({...receiptData, receiverName: e.target.value})}
            />
          ) : (
            <p className="border-b border-black pb-0.5 uppercase tracking-tighter text-xs font-bold">{receiptData.receiverName}</p>
          )}
        </div>
        <div className="text-center w-48">
          <p className="text-xs mb-8 text-black font-bold">Siak, {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <div className="mb-0.5">
            {isEditing ? (
              <input 
                className="border-b border-indigo-200 focus:border-indigo-500 outline-none w-full bg-indigo-50/30 text-center text-xs font-bold"
                value={receiptData.giverName}
                onChange={e => setReceiptData({...receiptData, giverName: e.target.value})}
              />
            ) : (
              <p className="border-b border-black pb-0.5 uppercase tracking-tighter text-xs font-bold">{receiptData.giverName || '(....................................)'}</p>
            )}
          </div>
          {isEditing ? (
            <input 
              className="border-b border-indigo-200 focus:border-indigo-500 outline-none w-full bg-indigo-50/30 text-center text-[10px] font-bold"
              value={receiptData.giverLabel}
              onChange={e => setReceiptData({...receiptData, giverLabel: e.target.value})}
            />
          ) : (
            <p className="text-[10px] text-black font-bold uppercase">{receiptData.giverLabel}</p>
          )}
        </div>
      </div>


      
      {/* Watermark */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.02] pointer-events-none -rotate-12 text-center">
        <h1 className="text-5xl leading-none font-black">BADAN AMIL ZAKAT NASIONAL</h1>
      </div>
    </div>
  );

  const renderApplicationForm = () => (
    <div 
      className="w-full px-8 py-8 font-sans leading-tight text-black flex flex-col relative bg-white print:break-before-page"
      style={{ fontSize: `${templateConfig.fontSize}pt` }}
    >
      {/* Header */}
      <table className="w-full border-collapse mb-4 border border-black">
        <tbody>
          <tr>
            <td className="w-[120px] p-2 border-r border-black align-middle text-center">
              {templateConfig.logo ? (
                <img src={templateConfig.logo} alt="Logo" className="max-w-full max-h-full object-contain mx-auto" style={{ height: `${templateConfig.logoSize}px` }} />
              ) : logo ? (
                <img src={logo} alt="Logo" className="max-w-full max-h-full object-contain mx-auto" style={{ height: `${templateConfig.logoSize}px` }} />
              ) : null}
            </td>
            <td className="p-4 align-middle">
              <h1 className="font-bold uppercase tracking-tight text-[12pt] mb-0 leading-none">LAYANAN MUSTAHIK</h1>
              <h2 className="uppercase tracking-tight text-[10pt] font-normal leading-none mt-1 text-slate-700">{templateConfig.institution || "BAZNAS PROVINSI RIAU"}</h2>
            </td>
            <td className="w-[160px] p-2 border-l border-black align-middle text-center bg-white">
              <div className="flex flex-col items-center justify-center">
                 <div className="flex w-full h-8 items-end justify-between px-2 mb-1 gap-[1px]">
                    {Array.from({length: 42}).map((_, i) => (
                      <div key={i} className="bg-black shrink-0" style={{ width: [1, 2, 3][Math.floor(Math.random() * 3)] + 'px', height: '100%' }}></div>
                    ))}
                 </div>
                 <span className="text-[10px] font-mono tracking-widest">{recipient.registrationId.split('-')[1]}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Main Table */}
      <table className="w-full border-collapse mb-4 border border-black text-[10px]">
        <thead>
          <tr>
            <th colSpan={2} className="border-b border-black p-1.5 text-center font-bold text-xs underline uppercase relative tracking-wide">
              FORMULIR PERMOHONAN
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border-b border-r border-black p-1.5 font-bold w-[180px]">Registrasi</td>
            <td className="border-b border-black p-1.5 uppercase">{recipient.submissionDate}</td>
          </tr>
          <tr>
            <td className="border-b border-r border-black p-1.5 font-bold">Penerima</td>
            <td className="border-b border-black p-1.5 uppercase">{recipient.name}</td>
          </tr>
          <tr>
            <td className="border-b border-r border-black p-1.5 font-bold">Indentitas</td>
            <td className="border-b border-black p-1.5 uppercase">{recipient.nik}</td>
          </tr>
          <tr>
            <td className="border-b border-r border-black p-1.5 font-bold">Tempat Lahir</td>
            <td className="border-b border-black p-1.5 uppercase">{recipient.pob}</td>
          </tr>
          <tr>
            <td className="border-b border-r border-black p-1.5 font-bold">Tanggal Lahir</td>
            <td className="border-b border-black p-1.5 uppercase">{recipient.dob ? new Date(recipient.dob).toLocaleDateString('id-ID') : '-'}</td>
          </tr>
          <tr>
            <td className="border-b border-r border-black p-1.5 font-bold">Kontak Person</td>
            <td className="border-b border-black p-1.5 uppercase">{recipient.contact}</td>
          </tr>
          <tr>
            <td className="border-b border-r border-black p-1.5 font-bold">Alamat</td>
            <td className="border-b border-black p-1.5 uppercase">{recipient.address}, RT{recipient.rt}/RW{recipient.rw}, {recipient.kampung}, {recipient.district}</td>
          </tr>
          <tr>
            <td className="border-b border-r border-black p-1.5 font-bold">Status Berkas</td>
            <td className="border-b border-black p-1.5 uppercase">LENGKAP</td>
          </tr>
          <tr>
            <td className="border-b border-r border-black p-1.5 font-bold">Indeks</td>
            <td className="border-b border-black p-1.5 uppercase">{recipient.companion || '-'}</td>
          </tr>
          <tr>
            <td className="border-b border-r border-black p-1.5 font-bold">Program</td>
            <td className="border-b border-black p-1.5 uppercase">{receiptData.subject}</td>
          </tr>
          <tr>
            <td className="border-b border-r border-black p-1.5 font-bold">Nominal</td>
            <td className="border-b border-black p-1.5 uppercase">Rp. {recipient.amountProposed?.toLocaleString('id-ID') || 0}</td>
          </tr>
          <tr>
            <td className="border-b border-r border-black p-1.5 font-bold">Rekening</td>
            <td className="border-b border-black p-1.5 uppercase leading-tight">
              {recipient.schoolName ? `${recipient.schoolName}\n` : ''}
              {recipient.bankAccountHolder ? `${recipient.bankAccountHolder}/` : ''}
              {recipient.bankName ? `${recipient.bankName}-` : ''}
              {recipient.bankAccountNo || '-'}
            </td>
          </tr>
          <tr>
            <td className="border-r border-black p-1.5 font-bold">Keterangan</td>
            <td className="border-black p-1.5 uppercase">{recipient.purpose}</td>
          </tr>
        </tbody>
      </table>

      {/* Signature Table */}
      <table className="w-full border-collapse border border-black text-xs text-center mb-8 bg-white" style={{ pageBreakInside: 'avoid' }}>
        <thead>
          <tr>
            <th className="border-b border-r border-black p-1 font-normal w-1/2">Petugas</th>
            <th className="border-b border-black p-1 font-normal w-1/2">Mustahik</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border-b border-r border-black p-2 align-middle overflow-hidden" style={{ height: '140px'}}>
              {/* Petugas Signature Placeholder */}
              <div className="flex items-center justify-center h-full max-w-full px-2">
                <a href="#" className="text-blue-600 underline text-[10px] break-all text-center max-w-[200px]">
                  {recipient.registrationId.split('-')[1]}.TTD_PETUGAS.{String(Math.floor(Math.random() * 100000)).padStart(5, '0')}
                </a>
              </div>
            </td>
            <td className="border-b border-black p-3 align-middle bg-white">
               <div className="flex justify-center bg-white p-1">
                 <QRCode value={recipient.registrationId} size={100} level="M" />
               </div>
            </td>
          </tr>
          <tr>
            <td className="border-r border-black p-2 font-bold uppercase tracking-tight">{recipient.companion || '-'}</td>
            <td className="border-black p-2 uppercase tracking-tight">{recipient.name}</td>
          </tr>
        </tbody>
      </table>
      
    </div>
  );

  return (
    <div className="receipt-template-overlay fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-50 flex flex-col print:p-0 print:bg-white print:block overflow-hidden">
      {/* Toolbar */}
      <div className="bg-[#111827] border-b border-white/10 p-3 flex items-center justify-between print:hidden shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
            title="Tutup (Esc)"
          >
            <ChevronRight className="w-6 h-6 rotate-180" />
          </button>
          
          <div className="flex items-center gap-3 border-l border-white/10 pl-4 h-10">
            <div className="w-9 h-9 bg-indigo-600/20 rounded-xl flex items-center justify-center border border-indigo-500/30">
              <FileCheck className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="hidden sm:block">
              <h3 className="font-bold text-white text-sm leading-tight">Sistem Tanda Terima</h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-indigo-300/60 uppercase font-bold tracking-wider">F-AZN / {recipient.registrationId.substring(0,6)}</span>
                {saveStatus === 'saving' && <span className="text-white/40 animate-pulse text-[8px] uppercase tracking-tighter bg-white/5 px-1.5 py-0.5 rounded border border-white/5">● Menyimpan...</span>}
                {saveStatus === 'saved' && <span className="text-emerald-400 text-[8px] uppercase tracking-tighter bg-emerald-400/10 px-1.5 py-0.5 rounded border border-emerald-400/10">● Tersimpan</span>}
                {saveStatus === 'error' && <span className="text-red-400 text-[8px] uppercase tracking-tighter bg-red-400/10 px-1.5 py-0.5 rounded border border-red-400/10">● Gagal</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 shrink-0 mx-4">
          <button 
            onClick={() => setViewMode('template')}
            className={cn(
              "px-6 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all",
              viewMode === 'template' ? "bg-white/10 text-white shadow-xl" : "text-white/30 hover:text-white"
            )}
          >
            <FileText className="w-3.5 h-3.5" />
            Template
          </button>
          <button 
            onClick={() => setViewMode('scan')}
            className={cn(
              "px-6 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all relative",
              viewMode === 'scan' ? "bg-white/10 text-white shadow-xl" : "text-white/30 hover:text-white"
            )}
          >
            <Eye className="w-3.5 h-3.5" />
            Scan Tertanda
            {signedReceiptPdfUrl && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-[#111827]" />
            )}
          </button>
          <button 
            onClick={() => setViewMode('config')}
            className={cn(
              "px-6 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all",
              viewMode === 'config' ? "bg-white/10 text-white shadow-xl" : "text-white/30 hover:text-white"
            )}
          >
            <Settings className="w-3.5 h-3.5" />
            Config
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsEditing(!isEditing)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0",
              isEditing 
                ? "bg-amber-500 text-white shadow-lg shadow-amber-500/20" 
                : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border border-white/10"
            )}
          >
            {isEditing ? <FileCheck className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
            {isEditing ? "Kembali" : "Edit Konten"}
          </button>
          
          <button 
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold transition-all shadow-lg active:scale-95 shrink-0"
          >
            <Printer className="w-4 h-4" />
            Cetak
          </button>

          <div className="flex items-center gap-3 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10 ml-2">
            <span className="text-[10px] font-bold text-white/40 uppercase">Ukuran Kertas</span>
            <div className="flex bg-black/40 p-1 rounded-lg border border-white/5">
              <button 
                onClick={() => setPaperSize('A4')}
                className={cn(
                  "px-3 py-0.5 rounded text-[10px] font-bold transition-all",
                  paperSize === 'A4' ? "bg-white/10 text-white shadow" : "text-white/30 hover:text-white"
                )}
              >
                A4
              </button>
              <button 
                onClick={() => setPaperSize('F4')}
                className={cn(
                  "px-3 py-0.5 rounded text-[10px] font-bold transition-all",
                  paperSize === 'F4' ? "bg-white/10 text-white shadow" : "text-white/30 hover:text-white"
                )}
              >
                F4
              </button>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-3 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10 ml-2">
            <span className="text-[10px] font-bold text-white/40 uppercase">Zoom</span>
            <input 
              type="range" 
              min="0.3" 
              max="1.5" 
              step="0.05" 
              value={scale} 
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="w-20 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_320px] print:block bg-slate-950">
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            @page {
              size: ${paperSize === 'A4' ? '210mm 297mm' : '215.9mm 330.2mm'};
              margin: 10mm 10mm;
            }
            #root > div > *:not(.receipt-template-overlay) {
              display: none !important;
            }
            #root > div {
              display: block !important;
              height: auto !important;
              min-height: auto !important;
              overflow: visible !important;
              background-color: white !important;
            }
            body, html, #root {
              background-color: white !important;
              overflow: visible !important;
              height: auto !important;
              position: static !important;
            }
            body { 
              background: white !important;
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }
            .print-container {
              width: 100% !important;
              max-width: none !important;
              margin: 0 !important;
              padding: 0 !important;
              box-shadow: none !important;
              transform: none !important;
            }
            /* Reset any screen-only styling that might interfere */
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
        `}} />
        {/* Document Area */}
        <div className="flex-1 p-4 md:p-10 overflow-y-auto bg-slate-950/20 flex flex-col items-center print:p-0 print:bg-white print:block scroll-smooth">
          {viewMode === 'template' && (
            <div className="mb-6 w-full max-w-[800px] bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-4 flex items-start gap-4 print:hidden">
              <div className="p-2 bg-indigo-500/20 rounded-xl text-indigo-400">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-indigo-300 font-bold text-sm">Panduan Cetak Tanda Terima</h4>
                <p className="text-white/60 text-xs leading-relaxed">
                  Tanda terima ini dicetak <span className="text-white font-bold">2 rangkap (Atas & Bawah) dalam 1 lembar F4</span>. 
                  Potong kertas di garis putus-putus setelah dicetak. Gunakan ukuran kertas <span className="text-white font-bold">F4/Folio</span> atau <span className="text-white font-bold">Legal</span> pada setting printer.
                </p>
              </div>
            </div>
          )}
               {viewMode === 'template' ? (
            <div className="flex flex-col items-center w-full">
              <div 
                className="flex flex-col gap-8 w-full items-center origin-top transition-transform duration-200"
                style={{ transform: `scale(${scale})` }}
              >
                <div 
                  className="bg-white w-full max-w-[800px] shadow-2xl rounded-sm print-container p-0 shrink-0 relative"
                  style={{ minHeight: paperSize === 'A4' ? '1120px' : '1250px' }}
                >
                  {renderReceiptContent('PEMOHON')}
                  {renderReceiptContent('ARSIP')}
                </div>
                
                <div 
                  className="bg-white w-full max-w-[800px] shadow-2xl rounded-sm print-container p-0 shrink-0 relative"
                  style={{ minHeight: paperSize === 'A4' ? '1120px' : '1250px' }}
                >
                  {renderApplicationForm()}
                </div>
              </div>
              <div style={{ height: `${Math.max(100, scale * 2400)}px` }} className="print:hidden h-20" />
            </div>
          ) : viewMode === 'scan' ? (
            <div className="w-full h-full max-w-4xl flex flex-col gap-4">
              {!signedReceiptPdfUrl ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 bg-white/5 border-2 border-dashed border-white/10 rounded-3xl text-center">
                  <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/10">
                    {isLoadingFile ? (
                      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent animate-spin rounded-full" />
                    ) : (
                      <Upload className="w-10 h-10 text-white/20" />
                    )}
                  </div>
                  <h4 className="text-xl font-bold text-white mb-2">
                    {isLoadingFile ? 'Memuat Dokumen dari Cloud...' : 'Belum Ada Scan Tanda Terima'}
                  </h4>
                  <p className="text-white/40 max-w-md mb-8">
                    {isLoadingFile ? 'Mohon tunggu sebentar, file berukuran besar sedang diproses.' : 'Silakan upload scan Dokumen Tanda Terima yang sudah ditandatangani oleh pemohon dan staff.'}
                  </p>
                  {!isLoadingFile && (
                    <label className={cn(
                      "px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-xl flex items-center gap-2 cursor-pointer",
                      isUploading ? "bg-slate-700 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-500 text-white"
                    )}>
                      {isUploading ? <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full" /> : <Upload className="w-4 h-4" />}
                      Upload File PDF
                      <input type="file" className="hidden" accept="application/pdf" onChange={handlePdfUpload} disabled={isUploading} />
                    </label>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col bg-white/5 rounded-3xl overflow-hidden border border-white/10 p-2 relative shadow-2xl">
                  {/* Action Header for PDF View */}
                  <div className="flex items-center justify-between p-3 bg-black/40 border-b border-white/10 shrink-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                        <FileCheck className="w-4 h-4 text-emerald-400" />
                      </div>
                      <span className="text-xs font-bold text-white">HASIL SCAN TANDA TERIMA</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <a 
                        href={signedReceiptPdfUrl} 
                        download={`Scan_Tanda_Terima_${recipient.registrationId}.pdf`}
                        className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-500 transition-all"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download
                      </a>
                      <button 
                        onClick={() => {
                          if(confirm('Hapus file scan dari Cloud?')) handleSavePdfToServer(null);
                        }}
                        disabled={isUploading}
                        className="flex items-center gap-2 px-4 py-1.5 bg-red-500 text-white rounded-lg text-[10px] font-bold hover:bg-red-600 transition-all disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Hapus
                      </button>
                    </div>
                  </div>

                   <object 
                    data={signedPdfBlobUrl || signedReceiptPdfUrl} 
                    type="application/pdf"
                    className="w-full h-full rounded-b-2xl bg-white"
                  >
                    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                      <p className="text-white font-bold mb-2 text-lg">Pratinjau Gagal Dimuat</p>
                      <p className="text-white/40 text-sm mb-8">Browser Anda mungkin memblokir pratinjau otomatis untuk file dari storage lokal.</p>
                      <a 
                        href={signedReceiptPdfUrl} 
                        download={`Tanda_Terima_Scan_${recipient.registrationId}.pdf`}
                        className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-xl shadow-indigo-500/20"
                      >
                        Download Untuk Dilihat
                      </a>
                    </div>
                  </object>
                </div>
              )}
            </div>
          ) : (
            /* CONFIG PANEL VIEW */
            <div className="w-full max-w-2xl space-y-6 my-4">
              <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 shadow-2xl">
                <div className="flex items-center gap-4 mb-8 border-b border-white/5 pb-4">
                  <div className="p-3 bg-amber-500/20 rounded-xl">
                    <Settings className="w-6 h-6 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Konfigurasi Template</h3>
                    <p className="text-slate-400 text-sm">Sesuaikan branding dan logo lembaga Anda secara global</p>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Logo Upload Section */}
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-slate-300">Logo Lembaga</label>
                    <div 
                      onClick={() => {
                        const fileInput = document.getElementById('config-logo-input-receipt');
                        fileInput?.click();
                      }}
                      className="group relative h-40 bg-black/40 border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-amber-500/50 hover:bg-amber-500/5 transition-all overflow-hidden"
                    >
                      {templateConfig.logo ? (
                        <>
                          <img src={templateConfig.logo} alt="Logo Preview" className="h-full object-contain p-4" />
                          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Upload className="w-8 h-8 text-white mb-2" />
                            <span className="text-white text-xs font-bold">Ganti Logo</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <Upload className="w-8 h-8 text-slate-500 mb-2 group-hover:text-amber-500 transition-colors" />
                          <span className="text-slate-400 text-sm group-hover:text-amber-400">Klik untuk upload logo</span>
                        </>
                      )}
                      <input 
                        type="file" 
                        id="config-logo-input-receipt" 
                        onChange={handleLogoUploadConfig} 
                        className="hidden" 
                        accept="image/*"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nama Lembaga (Utama)</label>
                      <input 
                        type="text" 
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500 transition-colors"
                        value={templateConfig.institution}
                        onChange={(e) => setTemplateConfig(p => ({ ...p, institution: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Region / Wilayah</label>
                      <input 
                        type="text" 
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500 transition-colors"
                        value={templateConfig.region}
                        onChange={(e) => setTemplateConfig(p => ({ ...p, region: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Deskripsi Lembaga (Bottom)</label>
                    <input 
                      type="text" 
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500 transition-colors"
                      value={templateConfig.subText}
                      onChange={(e) => setTemplateConfig(p => ({ ...p, subText: e.target.value }))}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Logo Size (Height px)</label>
                      <div className="flex items-center gap-3">
                        <input 
                          type="range" 
                          min="20" 
                          max="120" 
                          className="flex-1 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-500"
                          value={templateConfig.logoSize}
                          onChange={(e) => setTemplateConfig(p => ({ ...p, logoSize: Number(e.target.value) }))}
                        />
                        <span className="text-white font-mono text-sm w-12 text-right">{templateConfig.logoSize}px</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Base Font Size (pt)</label>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => setTemplateConfig(p => ({ ...p, fontSize: Math.max(6, p.fontSize - 1) }))}
                          className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-lg text-white"
                        >-</button>
                        <span className="text-white font-mono text-sm w-8 text-center">{templateConfig.fontSize}</span>
                        <button 
                          onClick={() => setTemplateConfig(p => ({ ...p, fontSize: Math.min(14, p.fontSize + 1) }))}
                          className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-lg text-white"
                        >+</button>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 flex gap-3 border-t border-white/5">
                    <button 
                      onClick={saveConfig}
                      disabled={isSavingConfig}
                      className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-800 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                      {isSavingConfig ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                      {isSavingConfig ? 'Menyimpan...' : 'Simpan Konfigurasi Secara Global'}
                    </button>
                    <button 
                      onClick={() => setViewMode('template')}
                      disabled={isSavingConfig}
                      className="px-6 bg-white/5 hover:bg-white/10 text-slate-400 font-bold py-3 rounded-xl transition-all"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {viewMode === 'template' && !isEditing && (
            <p className="text-white/20 text-xs italic print:hidden py-4 border-t border-white/5 w-full max-w-[800px] flex items-center justify-center gap-2">
              <FileCheck className="w-3.5 h-3.5" />
              Dokumen ini dihasilkan secara otomatis oleh sistem administrasi Si-PANDAI
            </p>
          )}
        </div>

        {/* Sidebar Controls */}
        <div className="w-[320px] bg-slate-900 border-l border-white/10 p-6 hidden lg:flex flex-col gap-6 print:hidden">
          <div className="space-y-4">
            <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Dokumen Cloud</h4>
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
              <div className="flex items-center gap-3 mb-4">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center",
                  signedReceiptPdfUrl ? "bg-green-500/20 text-green-400" : "bg-white/5 text-white/20"
                )}>
                   <FileCheck className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-white text-xs font-bold leading-none mb-1">Scan Tertanda</p>
                  <p className="text-[10px] text-white/40">{isLoadingFile ? 'Memuat...' : (signedReceiptPdfUrl ? 'Tersedia di Cloud' : 'Belum diunggah')}</p>
                </div>
              </div>
              
              <div className="flex gap-2">
                <label className={cn(
                  "flex-1 flex items-center justify-center gap-2 text-[10px] font-bold py-2 rounded-lg cursor-pointer transition-all",
                  isUploading ? "bg-slate-700 text-white/40 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-500 text-white"
                )}>
                  {isUploading ? <div className="w-3 h-3 border-2 border-white/50 border-t-transparent animate-spin rounded-full" /> : <Upload className="w-3.5 h-3.5" />}
                  Upload
                  <input type="file" className="hidden" accept="application/pdf" onChange={handlePdfUpload} disabled={isUploading} />
                </label>
                
                {signedReceiptPdfUrl && (
                  <button 
                    disabled={isUploading}
                    onClick={() => {
                      if(confirm('Hapus file scan dari Cloud?')) handleSavePdfToServer(null);
                    }}
                    className="p-2 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition-all disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                ) }
              </div>
            </div>
          </div>

          <div className="mt-auto">
             <div className="p-4 bg-indigo-500/5 rounded-2xl border border-indigo-500/10 mb-4">
              <h5 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                <Printer className="w-3 h-3" />
                Instruksi Cetak
              </h5>
              <p className="text-[10px] text-indigo-300/60 leading-relaxed italic">
                Aplikasi telah diatur untuk mencetak 2 rangkap (Pemohon & Arsip) dalam satu lembar. 
                Pilih format {paperSize} pada pengaturan printer browser.
              </p>
            </div>
            
            <button 
              onClick={onClose}
              className="w-full py-4 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 rounded-2xl text-xs font-bold transition-all border border-white/5 flex items-center justify-center gap-2"
            >
              Tutup Pratinjau
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
