import React, { useState, useEffect } from 'react';
import { Recipient } from '../types';
import { 
  Printer, X, FileCheck, Edit3, Upload, Image as ImageIcon, 
  Trash2, Eye, FileText, AlertCircle, ChevronRight, Loader2,
  Download
} from 'lucide-react';
import { cn, compressImage, isBase64SizeValid } from '../lib/utils';
import * as storage from '../lib/storage';

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
  const [viewMode, setViewMode] = useState<'template' | 'scan'>('template');
  
  const [signedReceiptPdfUrl, setSignedReceiptPdfUrl] = useState<string | null>(null);
  const [signedPdfBlobUrl, setSignedPdfBlobUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [scale, setScale] = useState(0.85);
  const [paperSize, setPaperSize] = useState<'A4' | 'F4'>('F4');
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadedRecipientId, setLoadedRecipientId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');

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
      setLogo(await storage.getItem('baznas_logo'));

      // Try local storage first
      let savedData = await storage.getItem(`receipt_data_${recipient.id}`);

      // If not in local storage, try cloud
      if (!savedData) {
        try {
          const { getRecipientTemplateData } = await import('../firebase');
          savedData = await getRecipientTemplateData(recipient.id, 'receipt');
          if (savedData) {
            await storage.setItem(`receipt_data_${recipient.id}`, savedData);
          }
        } catch (e) {
          console.error("Cloud receipt load failed", e);
        }
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
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        setLogo(base64);
        await storage.setItem('baznas_logo', base64);
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
      const isPdf = file.type === 'application/pdf';

      if (!isPdf) {
        alert('Mohon upload file dalam format PDF.');
        return;
      }

      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;

        // Validate size for Firestore (1MB limit)
        if (!isBase64SizeValid(base64)) {
          alert('File terlalu besar. Silakan gunakan file yang lebih kecil atau resolusi lebih rendah (Maksimal ~700KB setelah kompresi).');
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
    <div className={cn(
      "w-full px-8 py-4 font-sans leading-tight text-black flex flex-col relative border-gray-300 print:border-gray-400 bg-white",
      type === 'PEMOHON' ? "border-b border-dashed pb-4 mb-2 print:mb-0 print:pb-2" : "pt-1"
    )}>
      {/* Header */}
      <div className="flex items-center gap-4 mb-2 border-b border-black pb-1">
        <div className="w-16 h-16 flex-shrink-0 flex items-center justify-center border-2 border-dashed border-slate-200 relative group overflow-hidden rounded bg-white print:border-none print:bg-transparent">
          {logo ? (
            <img src={logo} alt="Logo" className="max-w-full max-h-full object-contain" />
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
          <h1 className="text-lg font-bold uppercase tracking-tight mb-0">BADAN AMIL ZAKAT NASIONAL</h1>
          <p className="text-base font-bold uppercase tracking-tight mb-0">KABUPATEN SIAK</p>
          <p className="text-[10px] leading-tight">Gedung Graha Baznas Kabupaten Siak, Jl Sultan Syarif Ali</p>
          <p className="text-[10px] leading-tight font-medium">Kecamatan Siak, Kabupaten Siak, Riau</p>
        </div>
      </div>

      {/* Title */}
      <div className="text-center mb-1 relative">
        <h2 className="text-lg font-bold underline mb-0 uppercase tracking-widest leading-none">TANDA TERIMA</h2>
        <p className="text-[11px] mt-0.5 font-bold">Nomor: {recipient.id.substring(0, 8).toUpperCase()}/TT/BAZ-SIAK/{new Date().getFullYear()}</p>
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
          { label: 'Identitas / NIK', value: receiptData.identity, key: 'identity' },
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

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-50 flex flex-col print:p-0 print:bg-white print:block overflow-hidden">
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
                className="bg-white w-full max-w-[800px] shadow-2xl rounded-sm print-container origin-top transition-transform duration-200 p-0"
                style={{ 
                  transform: `scale(${scale})`,
                  minHeight: paperSize === 'A4' ? '1120px' : '1250px'
                }}
              >
                {renderReceiptContent('PEMOHON')}
                {renderReceiptContent('ARSIP')}
              </div>
              <div style={{ height: `${Math.max(100, scale * 1200)}px` }} className="print:hidden h-20" />
            </div>
          ) : (
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
