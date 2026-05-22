import React, { useState, useEffect } from 'react';
import { Recipient } from '../types';
import { 
  Printer, X, FileText, CheckSquare, Square, 
  Image as ImageIcon, Upload, Edit3, Plus, Trash2,
  FileCheck, ExternalLink, Download, Loader2, ChevronRight,
  Settings, Save
} from 'lucide-react';
import { cn, compressImage, isBase64SizeValid } from '../lib/utils';
import * as storage from '../lib/storage';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

interface MPZISTemplateProps {
  recipient: Recipient;
  onClose: () => void;
}

export default function MPZISTemplate({ recipient, onClose }: MPZISTemplateProps) {
  const [logo, setLogo] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'template' | 'scan' | 'config'>('template');
  const [paperSize, setPaperSize] = useState<'A4' | 'F4'>('F4');

  const [templateConfig, setTemplateConfig] = useState({
    logo: '',
    institution: 'BAZNAS',
    region: 'KABUPATEN SIAK',
    subText: 'Badan Amil Zakat Nasional',
    fontSize: 9,
    logoSize: 48
  });

  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [mpzisFiles, setMpzisFiles] = useState<{ name: string; data: string }[]>([]);
  const [ isLoadingFile, setIsLoadingFile] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadedRecipientId, setLoadedRecipientId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  
  // Load saved data from storage on mount
  React.useEffect(() => {
    const loadData = async () => {
      setIsLoaded(false);
      
      let savedLogo = null;
      try {
        const { getDoc, doc } = await import('firebase/firestore');
        const snap = await getDoc(doc(db, 'settings', 'app'));
        if (snap.exists() && snap.data().logoUrl) {
          savedLogo = snap.data().logoUrl;
          await storage.setItem('baznas_logo', savedLogo);
        }
      } catch (err) {
        console.error("Failed to load global logo from Cloud Firestore, falling back to local:", err);
      }

      if (!savedLogo) {
        savedLogo = await storage.getItem('baznas_logo');
      }
      setLogo(savedLogo);
      
      // Load memorandum data
      let savedMemo = await storage.getItem(`mpzis_memo_${recipient.id}`);
      if (!savedMemo) {
        try {
          const { getRecipientTemplateData } = await import('../firebase');
          savedMemo = await getRecipientTemplateData(recipient.id, 'mpzis');
        } catch (e) {
          console.error("Cloud memo load failed", e);
        }
      }

      if (savedMemo) {
        const parsed = typeof savedMemo === 'string' ? JSON.parse(savedMemo) : savedMemo;
        
        // Normalize column labels if they are the old uppercase ones
        if (parsed.columns) {
          const defaultsMap: {[key: string]: string} = {
            'URAIAN': 'Uraian',
            'NAMA': 'Nama',
            'IDENTITAS/NIK': 'Identitas/nik',
            'REKENING/BANK/NAMA REKENING': 'Rekening/bank/nama rekening/bank',
            'JUMLAH BANTUAN': 'Jumlah bantuan'
          };
          parsed.columns = parsed.columns
            .filter((col: any) => col.key !== 'bank')
            .map((col: any) => ({
              ...col,
              label: defaultsMap[col.label] || col.label
            }));
        }
        
        setMemoData(parsed);
      }
      setLoadedRecipientId(recipient.id);
      setIsLoaded(true);

      const savedData = await storage.getItem(`survey_${recipient.nik || recipient.id}`);
      let currentFiles: { name: string; data: string }[] = [];
      
      if (savedData) {
        try {
          const parsed = typeof savedData === 'string' ? JSON.parse(savedData) : savedData;
          currentFiles = parsed.mpzisFiles || [];
          setMpzisFiles(currentFiles);
        } catch (e) {
          console.error('Failed to load MPZIS survey data', e);
        }
      }

      // If no local files but firestore says we have one, fetch it
      if (currentFiles.length === 0 && recipient.hasSignedMPZISPdf) {
        setIsLoadingFile(true);
        try {
          const { getRecipientFile } = await import('../firebase');
          const base64 = await getRecipientFile(recipient.id, 'mpzis');
          if (base64) {
            setMpzisFiles([{ name: 'Scan_MPZIS_Cloud.pdf', data: base64 }]);
          } else {
            // Stale flag detected (flag is true but file is missing), clear it
            const { updateRecipientMPZISPdf } = await import('../firebase');
            await updateRecipientMPZISPdf(recipient.id, null);
          }
        } catch (error) {
          console.error('Failed to fetch MPZIS scan from cloud', error);
        } finally {
          setIsLoadingFile(false);
        }
      }
    };
    loadData();
  }, [recipient.id, recipient.nik, recipient.hasSignedMPZISPdf]);

  // Listen to real-time updates for global configuration
  useEffect(() => {
    const configDoc = doc(db, 'settings', 'mpzis_template');
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
      const configDoc = doc(db, 'settings', 'mpzis_template');
      await setDoc(configDoc, {
        ...templateConfig,
        updatedAt: new Date().toISOString()
      });
      alert('Konfigurasi template berhasil disimpan secara global!');
      setActiveTab('template');
    } catch (error) {
      console.error('Error saving config:', error);
      alert('Gagal menyimpan konfigurasi. Pastikan Anda memiliki izin.');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleSaveArchives = async (updatedFiles: { name: string; data: string }[]) => {
    // Current behavior: saves array of files to storage
    const savedData = await storage.getItem(`survey_${recipient.nik || recipient.id}`);
    let dataToSave: any = {};
    if (savedData) {
      dataToSave = typeof savedData === 'string' ? JSON.parse(savedData) : savedData;
    }
    dataToSave.mpzisFiles = updatedFiles;
    await storage.setItem(`survey_${recipient.nik || recipient.id}`, dataToSave);

    // New behavior: Upate Firestore with the first file if it's the primary scan
    if (updatedFiles.length > 0) {
      try {
        const { updateRecipientMPZISPdf } = await import('../firebase');
        await updateRecipientMPZISPdf(recipient.id, updatedFiles[0].data);
      } catch (error) {
        console.error('Failed to update MPZIS PDF in Firestore', error);
      }
    } else {
      try {
        const { updateRecipientMPZISPdf } = await import('../firebase');
        await updateRecipientMPZISPdf(recipient.id, null);
      } catch (error) {
        console.error('Failed to clear MPZIS PDF in Firestore', error);
      }
    }
  };
  
  const handleMpzisUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setIsSaving(true);
      const newFiles: { name: string; data: string }[] = [];
      const fileList = Array.from(files) as File[];
      let processedCount = 0;

      for (const file of fileList) {
        if (file.type !== 'application/pdf') {
          alert(`File "${file.name}" bukan PDF. Harap unggah hanya file PDF.`);
          processedCount++;
          if (processedCount === fileList.length) setIsSaving(false);
          continue;
        }

        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = reader.result as string;

          if (!isBase64SizeValid(base64)) {
            alert(`File "${file.name}" terlalu besar. Silakan gunakan resolusi lebih rendah atau file yang lebih kecil (Maksimal ~700KB per file).`);
            processedCount++;
            if (processedCount === fileList.length) setIsSaving(false);
            return;
          }

          newFiles.push({
            name: file.name,
            data: base64
          });
          processedCount++;
          
          if (processedCount === fileList.length) {
            const updated = [...mpzisFiles, ...newFiles];
            setMpzisFiles(updated);
            await handleSaveArchives(updated);
            setIsSaving(false);
            if (newFiles.length > 0) {
              alert('Berhasil mengunggah scan MPZIS');
              setActiveTab('scan'); // Switch to scan tab to show results
            }
          }
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const removeMpzisFile = (index: number) => {
    const updated = mpzisFiles.filter((_, i) => i !== index);
    setMpzisFiles(updated);
    handleSaveArchives(updated);
  };

  const openInNewTab = (data: string) => {
    try {
      const parts = data.split(';base64,');
      if (parts.length > 1) {
        const contentType = parts[0].split(':')[1];
        const raw = window.atob(parts[1]);
        const rawLength = raw.length;
        const uInt8Array = new Uint8Array(rawLength);
        for (let i = 0; i < rawLength; ++i) {
          uInt8Array[i] = raw.charCodeAt(i);
        }
        const blob = new Blob([uInt8Array], { type: contentType });
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
      } else {
        window.open(data, '_blank');
      }
    } catch (e) {
      console.error('Failed to open file', e);
      window.open(data, '_blank');
    }
  };

  const downloadFile = (data: string, name: string) => {
    const link = document.createElement('a');
    link.href = data;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Local state for memorandum data
  const [memoData, setMemoData] = useState({
    nomor: `${recipient.registrationId}/MPZIS/SP/I/${new Date().getFullYear()}`,
    programValue: recipient.sector || '',
    headerDate: new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    classification: `Baznas ${recipient.sector || 'Siak Sehat'}`,
    purpose: `Melaksanakan program ${recipient.programName}`,
    ashnaf: 'Miskin',
    source: 'Zakat / Infaq / Shadaqah',
    budgetPost: recipient.aidType,
    transactionType: 'TRANSFER' as 'CASH' | 'TRANSFER',
    columns: [
      { key: 'description', label: 'Uraian' },
      { key: 'name', label: 'Nama' },
      { key: 'nik', label: 'Identitas/nik' },
      { key: 'amount', label: 'Jumlah bantuan' }
    ],
    rows: [
      { 
        id: Date.now(), 
        description: recipient.aidType, 
        name: recipient.name, 
        nik: recipient.nik,
        amount: Number(recipient.amountProposed) 
      }
    ],
    signersTop: [
      { label: 'Disiapkan', name: 'Rina Wasih', role: 'Pic program' },
      { label: 'Diperiksa', name: 'Andreas Supriadi, S.I.Kom', role: 'Kabid. pendistribusian dan pendayagunaan' },
      { label: 'Disetujui', name: 'Sutarno Nurdianto, SE', role: 'Kepala pelaksana' }
    ],
    signersBottom: [
      { name: "H. Samparis Bin Tatan, S.Pd.I", role: "Ketua" },
      { name: "Syukron Wahib, M.Pd.I", role: "Wakil ketua 1" },
      { name: "H. Sukijo", role: "Wakil ketua 2" },
      { name: "KH. Moch Sowwam Amin, SH", role: "Wakil ketua 3" },
      { name: "H. Rojikin, S.Ag, MH", role: "Wakil ketua 4" }
    ]
  });
  
  // Auto-save memo data
  React.useEffect(() => {
    if (!isLoaded || loadedRecipientId !== recipient.id) return;
    const saveMemo = async () => {
      setSaveStatus('saving');
      try {
        await storage.setItem(`mpzis_memo_${recipient.id}`, memoData);
        const { saveRecipientTemplateData } = await import('../firebase');
        await saveRecipientTemplateData(recipient.id, 'mpzis', memoData);
        setSaveStatus('saved');
      } catch (e) {
        console.error("Cloud memo save failed", e);
        setSaveStatus('error');
      }
    };
    const timer = setTimeout(saveMemo, 1000);
    return () => clearTimeout(timer);
  }, [memoData, recipient.id, isLoaded, loadedRecipientId]);

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
        } catch (err) {
          console.error("Failed to sync logo to Cloud Firestore settings:", err);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const addColumn = () => {
    const newKey = `col_${Date.now()}`;
    setMemoData({
      ...memoData,
      columns: [...memoData.columns, { key: newKey, label: 'KOLOM BARU' }],
      rows: memoData.rows.map(row => ({ ...row, [newKey]: '' }))
    });
  };

  const removeColumn = (key: string) => {
    if (memoData.columns.length > 1) {
      setMemoData({
        ...memoData,
        columns: memoData.columns.filter(col => col.key !== key)
      });
    }
  };

  const addRow = () => {
    setMemoData({
      ...memoData,
      rows: [...memoData.rows, { id: Date.now() + Math.random(), description: '', name: '', nik: '', bank: '', amount: 0 }]
    });
  };

  const removeRow = (id: number) => {
    if (memoData.rows.length > 1) {
      setMemoData({
        ...memoData,
        rows: memoData.rows.filter(row => row.id !== id)
      });
    }
  };

  const updateRow = (id: number, field: string, value: any) => {
    setMemoData({
      ...memoData,
      rows: memoData.rows.map(row => row.id === id ? { ...row, [field]: value } : row)
    });
  };

  const totalAmount = memoData.rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  // Helper to convert number to Indonesian words
  const terbilang = (n: number): string => {
    if (n === 0) return 'NOL RUPIAH';
    
    const helper = (num: number): string => {
      const units = ['', 'SATU', 'DUA', 'TIGA', 'EMPAT', 'LIMA', 'ENAM', 'TUJUH', 'DELAPAN', 'SEMBILAN', 'SEPULUH', 'SEBELAS'];
      if (num === 0) return '';
      if (num < 12) return units[num];
      if (num < 20) return units[num - 10] + ' BELAS';
      if (num < 100) return units[Math.floor(num / 10)] + ' PULUH ' + helper(num % 10);
      if (num < 200) return 'SERATUS ' + helper(num - 100);
      if (num < 1000) return units[Math.floor(num / 100)] + ' RATUS ' + helper(num % 100);
      if (num < 2000) return 'SERIBU ' + helper(num - 1000);
      if (num < 1000000) return helper(Math.floor(num / 1000)) + ' RIBU ' + helper(num % 1000);
      if (num < 1000000000) return helper(Math.floor(num / 1000000)) + ' JUTA ' + helper(num % 1000000);
      return '';
    };
    
    return helper(n).replace(/\s+/g, ' ').trim() + ' RUPIAH';
  };

  return (
    <div className="mpzis-template-overlay fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex flex-col print:p-0 print:bg-white print:block overflow-hidden">
      {/* Toolbar */}
      <div className="bg-[#0f2a24] border-b border-white/10 p-3 flex items-center justify-between print:hidden shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
            title="Tutup (Esc)"
          >
            <ChevronRight className="w-6 h-6 rotate-180" />
          </button>
          
          <div className="flex items-center gap-3 border-l border-white/10 pl-4 h-10">
            <div className="w-9 h-9 bg-emerald-600/20 rounded-xl flex items-center justify-center border border-emerald-500/30">
              <FileText className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="hidden sm:block">
              <h3 className="font-bold text-white text-sm leading-tight">MPZIS Administrator</h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-emerald-300/60 uppercase font-bold tracking-wider italic">Sistem Administrasi BAZNAS</span>
                {saveStatus === 'saving' && <span className="text-white/40 animate-pulse text-[8px] uppercase tracking-tighter bg-white/5 px-1.5 py-0.5 rounded border border-white/5">● Menyimpan...</span>}
                {saveStatus === 'saved' && <span className="text-emerald-400 text-[8px] uppercase tracking-tighter bg-emerald-400/10 px-1.5 py-0.5 rounded border border-emerald-400/10">● Tersimpan</span>}
                {saveStatus === 'error' && <span className="text-red-400 text-[8px] uppercase tracking-tighter bg-red-400/10 px-1.5 py-0.5 rounded border border-red-400/10">● Gagal</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center gap-2 max-w-2xl px-4 overflow-x-auto scrollbar-hide">
          <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 shrink-0 mr-2">
            <button
              onClick={() => setActiveTab('template')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                activeTab === 'template' 
                  ? "bg-emerald-600 text-white shadow-lg" 
                  : "text-white/40 hover:text-white/60"
              )}
            >
              <FileText className="w-3.5 h-3.5" />
              Template
            </button>
            <button
              onClick={() => setActiveTab('scan')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 relative",
                activeTab === 'scan' 
                  ? "bg-purple-600 text-white shadow-lg" 
                  : "text-white/40 hover:text-white/60"
              )}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              Hasil Scan
              {mpzisFiles.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[8px] flex items-center justify-center rounded-full border border-black group-hover:scale-110 transition-transform">
                  {mpzisFiles.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('config')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                activeTab === 'config' 
                  ? "bg-amber-600 text-white shadow-lg" 
                  : "text-white/40 hover:text-white/60"
              )}
            >
              <Settings className="w-3.5 h-3.5" />
              Config
            </button>
          </div>

          <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 shrink-0 mr-2">
            <button 
              onClick={() => setPaperSize('A4')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all",
                paperSize === 'A4' ? "bg-white/10 text-white" : "text-white/30 hover:text-white"
              )}
            >
              A4
            </button>
            <button 
              onClick={() => setPaperSize('F4')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all",
                paperSize === 'F4' ? "bg-white/10 text-white" : "text-white/30 hover:text-white"
              )}
            >
              F4
            </button>
          </div>

          <div className="w-px h-6 bg-white/10 shrink-0" />

          {activeTab === 'template' && (
            <>
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
                {isEditing ? "Selesai Edit" : "Edit Konten"}
              </button>

              <button 
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-xl text-xs font-bold transition-all shrink-0 border border-emerald-500/20"
              >
                <Printer className="w-4 h-4" />
                Cetak Memo
              </button>
            </>
          )}

          {activeTab === 'scan' && (
            <label className={cn(
              "px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-purple-500 transition-all shadow-lg shadow-purple-500/20 active:scale-95 cursor-pointer shrink-0",
              (isSaving || isLoadingFile) && "opacity-50 animate-pulse pointer-events-none"
            )}>
              <Upload className="w-4 h-4" />
              {isSaving || isLoadingFile ? "Memproses..." : "Upload Scan Baru"}
              <input type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={handleMpzisUpload} />
            </label>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button 
            onClick={async () => {
              setSaveStatus('saving');
              try {
                const { saveRecipientTemplateData } = await import('../firebase');
                await saveRecipientTemplateData(recipient.id, 'mpzis', memoData);
                await storage.setItem(`mpzis_memo_${recipient.id}`, memoData);
                setSaveStatus('saved');
              } catch (e) {
                console.error("Manual save failed", e);
                setSaveStatus('error');
              }
            }}
            disabled={saveStatus === 'saving'}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50"
          >
            {saveStatus === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />}
            Simpan ke Server
          </button>
        </div>
      </div>

      {/* Document View */}
      <div className="flex-1 p-4 md:p-8 overflow-y-auto bg-slate-900/50 flex flex-col items-center print:p-0 print:bg-white overflow-x-hidden">
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            @page {
              size: ${paperSize === 'A4' ? '210mm 297mm' : '215.9mm 330.2mm'};
              margin: 10mm;
            }
            #root > div > *:not(.mpzis-template-overlay) {
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
            }
          }
        `}} />
        {activeTab === 'template' ? (
          <div className={cn(
            "bg-white w-full max-w-[950px] shadow-2xl p-7 text-black font-sans relative transition-all print:shadow-none print:p-0 print-container",
            isEditing && "ring-4 ring-amber-500/30"
          )}>
          
          {/* Header Area - Simplified to match EPPD style */}
          <div className="grid grid-cols-[150px_1fr_170px] gap-2 mb-6">
            <div className="border border-black p-2 flex items-center justify-center relative group">
              {templateConfig.logo ? (
                <img src={templateConfig.logo} alt="Logo" className="max-h-20 object-contain" />
              ) : logo ? (
                <img src={logo} alt="Logo" className="max-h-20 object-contain" />
              ) : (
                <div className="text-center p-2">
                  <ImageIcon className="w-8 h-8 text-slate-300 mx-auto" />
                </div>
              )}
              <label className="absolute inset-0 cursor-pointer opacity-0 hover:opacity-100 bg-black/10 flex items-center justify-center transition-all print:hidden">
                <Upload className="w-4 h-4 text-white" />
                <input type="file" className="hidden" onChange={handleLogoUpload} accept="image/*" />
              </label>
            </div>
            
            <div className="border border-black p-2 text-center flex flex-col justify-center text-black">
              <h1 className="text-xl font-bold mb-1 uppercase">MEMORANDUM</h1>
              <h2 className="text-xs font-bold uppercase mb-1">PENYALURAN DANA ZAKAT INFAQ DAN SHADAQAH</h2>
              <h2 className="text-xs font-bold uppercase mb-2">TAHUN {new Date().getFullYear()}</h2>
              {isEditing ? (
                <input 
                  className="text-center w-full bg-amber-50 border-b border-amber-200 outline-none p-1 text-sm text-black font-bold"
                  value={memoData.nomor}
                  onChange={e => setMemoData({...memoData, nomor: e.target.value})}
                />
              ) : (
                <p className="text-sm font-bold tracking-tight">NOMOR : {memoData.nomor}</p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <div className="border border-black p-1 text-center text-black font-bold text-sm bg-slate-50 uppercase">
                {recipient.sector?.toLowerCase().startsWith('siak') ? recipient.sector : recipient.sector || 'SIAK SEHAT'}
              </div>
              <div className="border border-black flex-1 p-2 text-[10px] leading-snug text-black flex flex-col justify-center gap-1">
                <div className="grid grid-cols-[45px_1fr]">
                  <span className="opacity-70">Program</span>
                  <div className="font-bold border-l border-black/10 pl-1 overflow-hidden">
                    {isEditing ? (
                      <input 
                        className="w-full bg-amber-50 outline-none text-[10px]" 
                        value={memoData.programValue || ''} 
                        placeholder={recipient.sector}
                        onChange={e => setMemoData({...memoData, programValue: e.target.value})} 
                      />
                    ) : (
                      <span>{memoData.programValue || (recipient.sector + ' ' + new Date().getFullYear())}</span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-[45px_1fr]">
                  <span className="opacity-70">Tanggal</span>
                  <div className="font-bold border-l border-black/10 pl-1 overflow-hidden">
                    {isEditing ? (
                      <input 
                        className="w-full bg-amber-50 outline-none text-[10px]" 
                        value={memoData.headerDate || ''} 
                        placeholder={new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        onChange={e => setMemoData({...memoData, headerDate: e.target.value})} 
                      />
                    ) : (
                      <span>{memoData.headerDate || new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Date removed as per request */}

          <p className="text-base mb-6 leading-relaxed text-black">
            Kami yang bertanda tangan dibawah ini Komite Pendistribusian dan Pendayagunaan menyetujui dan memutuskan penyaluran sebagai berikut :
          </p>

          {/* List Details */}
          <div className="space-y-3 text-base mb-8 text-black font-sans">
            <div className="grid grid-cols-[220px_10px_1fr] items-center">
              <span className="font-normal">1. Klasifikasi program</span>
              <span>:</span>
              {isEditing ? (
                <input className="bg-amber-50 border-b border-amber-200 outline-none w-full px-1 text-[15px] font-bold text-black" value={memoData.classification} onChange={e => setMemoData({...memoData, classification: e.target.value})} />
              ) : (
                <span className="text-[15px] font-bold">{memoData.classification}</span>
              )}
            </div>
            <div className="grid grid-cols-[220px_10px_1fr] items-center">
              <span className="font-normal">2. Tujuan penyaluran</span>
              <span>:</span>
              {isEditing ? (
                <input className="bg-amber-50 border-b border-amber-200 outline-none w-full px-1 text-[15px] font-bold text-black" value={memoData.purpose} onChange={e => setMemoData({...memoData, purpose: e.target.value})} />
              ) : (
                <span className="text-[15px] font-bold">{memoData.purpose}</span>
              )}
            </div>
            <div className="grid grid-cols-[220px_10px_1fr] items-center">
              <span className="font-normal">3. Ashnaf</span>
              <span>:</span>
              {isEditing ? (
                <input className="bg-amber-50 border-b border-amber-200 outline-none w-full px-1 text-[15px] font-bold text-black" value={memoData.ashnaf} onChange={e => setMemoData({...memoData, ashnaf: e.target.value})} />
              ) : (
                <span className="text-[15px] font-bold">{memoData.ashnaf}</span>
              )}
            </div>
            <div className="grid grid-cols-[220px_10px_1fr] items-center">
              <span className="font-normal">4. Sumber dana</span>
              <span>:</span>
              {isEditing ? (
                <input className="bg-amber-50 border-b border-amber-200 outline-none w-full px-1 text-[15px] font-bold text-black" value={memoData.source} onChange={e => setMemoData({...memoData, source: e.target.value})} />
              ) : (
                <span className="text-[15px] font-bold">{memoData.source}</span>
              )}
            </div>
            <div className="grid grid-cols-[220px_10px_1fr] items-center">
              <span className="font-normal">5. Post anggaran rkat</span>
              <span>:</span>
              {isEditing ? (
                <input className="bg-amber-50 border-b border-amber-200 outline-none w-full px-1 text-[15px] font-bold text-black" value={memoData.budgetPost} onChange={e => setMemoData({...memoData, budgetPost: e.target.value})} />
              ) : (
                <span className="text-[15px] font-bold">{memoData.budgetPost}</span>
              )}
            </div>
            <div className="grid grid-cols-[220px_10px_1fr] items-center">
              <span className="font-normal">6. Jenis transaksi</span>
              <span>:</span>
              <div className="flex items-center gap-6">
                <div 
                  className={cn("flex items-center gap-1.5 cursor-pointer", isEditing && "hover:text-emerald-600")}
                  onClick={() => isEditing && setMemoData({...memoData, transactionType: 'CASH'})}
                >
                  {memoData.transactionType === 'CASH' ? <CheckSquare className="w-5 h-5 text-emerald-600" /> : <Square className="w-5 h-5 text-slate-400" />}
                  <span className="text-[15px] font-bold">Cash</span>
                </div>
                <div 
                  className={cn("flex items-center gap-1.5 cursor-pointer", isEditing && "hover:text-emerald-600")}
                  onClick={() => isEditing && setMemoData({...memoData, transactionType: 'TRANSFER'})}
                >
                  {memoData.transactionType === 'TRANSFER' ? <CheckSquare className="w-5 h-5 text-emerald-600" /> : <Square className="w-5 h-5 text-slate-400" />}
                  <span className="text-[15px] font-bold">Transfer</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mb-3">
            <p className="text-base font-normal tracking-wide">7. Penerima dana :</p>
            {isEditing && (
              <div className="flex gap-2">
                <button 
                  onClick={addColumn}
                  className="flex items-center gap-1 px-2 py-1 bg-blue-500 text-white rounded text-[10px] font-bold hover:bg-blue-600 transition-colors shadow-sm"
                >
                  <Plus className="w-3 h-3" />
                  Tambah Kolom
                </button>
                <button 
                  onClick={addRow}
                  className="flex items-center gap-1 px-2 py-1 bg-emerald-500 text-white rounded text-[10px] font-bold hover:bg-emerald-600 transition-colors shadow-sm"
                >
                  <Plus className="w-3 h-3" />
                  Tambah Baris
                </button>
              </div>
            )}
          </div>
          
          <table className="w-full border-collapse border border-black text-base mb-6 text-black font-sans">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-black p-3 w-12 font-bold text-[15px]">No</th>
                {memoData.columns.map((col) => (
                  <th 
                    key={col.key} 
                    className={cn(
                      "border border-black p-3 relative group font-bold text-center tracking-tight text-[15px]",
                      col.key === 'description' ? "w-[30%] min-w-[200px]" : ""
                    )}
                  >
                    {isEditing ? (
                      <div className="flex flex-col gap-1">
                        <input 
                          className="w-full text-center bg-amber-50 outline-none border-b border-amber-200"
                          value={col.label}
                          onChange={e => {
                            const newCols = memoData.columns.map(c => c.key === col.key ? {...c, label: e.target.value} : c);
                            setMemoData({...memoData, columns: newCols});
                          }}
                        />
                        <button 
                          onClick={() => removeColumn(col.key)}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity print:hidden"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
                {isEditing && <th className="border border-black p-3 w-12 print:hidden text-slate-400 select-none">#</th>}
              </tr>
            </thead>
            <tbody>
              {memoData.rows.map((row, idx) => (
                <tr key={row.id}>
                  <td className="border border-black p-3 text-center align-top">{idx + 1}</td>
                  {memoData.columns.map((col) => (
                    <td key={col.key} className={cn("border border-black p-3 align-top", col.key === 'amount' ? "text-right" : "")}>
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          {col.key === 'amount' && <span>Rp.</span>}
                          <input 
                            className={cn(
                              "w-full outline-none bg-transparent",
                              col.key === 'amount' ? "text-right" : ""
                            )}
                            type={col.key === 'amount' ? 'number' : 'text'}
                            value={(row as any)[col.key]} 
                            onChange={e => updateRow(row.id, col.key, e.target.value)} 
                          />
                        </div>
                      ) : (
                        col.key === 'amount' 
                          ? `Rp. ${Number((row as any)[col.key]).toLocaleString('id-ID')},-`
                          : (row as any)[col.key]
                      )}
                    </td>
                  ))}
                  {isEditing && (
                    <td className="border border-black p-1 text-center print:hidden align-top">
                      <button 
                        onClick={() => removeRow(row.id)}
                        className="text-red-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              <tr className="bg-slate-50 font-bold border-t border-black">
                <td colSpan={memoData.columns.length} className="border border-black p-3 text-right font-bold text-base">Total bantuan</td>
                <td className="border border-black p-3 text-right text-[15px] font-bold">
                  Rp. {totalAmount.toLocaleString('id-ID')},-
                </td>
                {isEditing && <td className="border border-black p-3 print:hidden bg-slate-100"></td>}
              </tr>
            </tbody>
          </table>

          <div className="border border-black p-4 text-[14px] font-bold mb-8 bg-slate-50 tracking-tight text-black">
            Terbilang : {terbilang(totalAmount)}
          </div>

          <p className="text-base italic mb-12 text-center leading-relaxed text-black">
            Demikian Memorandum Penyaluran ZIS ini dibuat dengan sebenarnya dan dapat dipergunakan dengan semestinya.
          </p>

          {/* Approval Section */}
          <div className="grid grid-cols-3 border border-black mb-10 text-[13px] font-sans text-black">
            {memoData.signersTop.map((signer, idx) => (
              <div key={idx} className={cn("p-4 flex flex-col items-center", idx < 2 && "border-r border-black")}>
                {isEditing ? (
                  <input 
                    className="font-bold mb-20 border-b border-black pb-1 w-full text-center bg-amber-50 outline-none text-black"
                    value={signer.label}
                    onChange={e => {
                      const newSigners = [...memoData.signersTop];
                      newSigners[idx].label = e.target.value;
                      setMemoData({...memoData, signersTop: newSigners});
                    }}
                  />
                ) : (
                  <p className="font-bold mb-20 border-b border-black pb-1 w-full text-center tracking-wide leading-tight">{signer.label}</p>
                )}
                
                <div className="text-center w-full">
                  {isEditing ? (
                    <>
                      <input 
                        className="font-bold underline leading-none mb-0.5 w-full text-center bg-amber-50 outline-none text-black"
                        value={signer.name}
                        onChange={e => {
                          const newSigners = [...memoData.signersTop];
                          newSigners[idx].name = e.target.value;
                          setMemoData({...memoData, signersTop: newSigners});
                        }}
                      />
                      <input 
                        className="text-[10px] w-full text-center bg-amber-50 outline-none text-black"
                        value={signer.role}
                        onChange={e => {
                          const newSigners = [...memoData.signersTop];
                          newSigners[idx].role = e.target.value;
                          setMemoData({...memoData, signersTop: newSigners});
                        }}
                      />
                    </>
                  ) : (
                    <>
                      <p className="font-bold underline leading-none mb-0 tracking-tight">{signer.name}</p>
                      <p className="text-[11px] font-bold opacity-80 leading-none mt-0.5">{signer.role}</p>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Footer Decision Section */}
          <div className="border border-black text-xs font-sans text-black">
            <div>
              <p className="text-center font-bold border-b border-black py-2 bg-slate-100 italic text-[13px]">Diputuskan</p>
              <div className="grid grid-cols-[1fr_1fr_1fr_1.15fr_1fr] h-40">
                {memoData.signersBottom.map((signer, idx) => (
                  <div key={idx} className="border-r last:border-r-0 border-black p-1 flex flex-col justify-end text-center overflow-hidden">
                    {isEditing ? (
                      <>
                        <input 
                          className="font-bold text-[8px] underline leading-tight mb-0 w-full text-center bg-amber-50 outline-none text-black"
                          value={signer.name}
                          onChange={e => {
                            const newSigners = [...memoData.signersBottom];
                            newSigners[idx].name = e.target.value;
                            setMemoData({...memoData, signersBottom: newSigners});
                          }}
                        />
                        <input 
                          className="text-[9px] leading-none mb-2 w-full text-center bg-amber-50 outline-none text-black"
                          value={signer.role}
                          onChange={e => {
                            const newSigners = [...memoData.signersBottom];
                            newSigners[idx].role = e.target.value;
                            setMemoData({...memoData, signersBottom: newSigners});
                          }}
                        />
                      </>
                    ) : (
                      <>
                        <p className="font-bold text-[13px] underline mb-0 leading-tight tracking-tighter whitespace-nowrap">{signer.name}</p>
                        <div className="h-6 flex items-start justify-center">
                          <p className="text-[10px] leading-tight font-bold opacity-80">{signer.role}</p>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Watermark */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.04] pointer-events-none -rotate-12 select-none text-center">
            <h1 className="text-9xl font-black whitespace-nowrap">BAZNAS SIAK</h1>
          </div>
          </div>
        ) : activeTab === 'scan' ? (
          /* Scan Results Tab */
          <div className="w-full max-w-4xl space-y-6 pb-20">
            {mpzisFiles.length === 0 ? (
              <div className="bg-white/5 border-2 border-dashed border-white/10 rounded-2xl p-20 flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 bg-purple-500/10 rounded-full flex items-center justify-center text-purple-400 mb-6">
                  <Upload className="w-10 h-10" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Belum ada Scan MPZIS</h3>
                <p className="text-white/40 text-sm max-w-xs">
                  Silakan unggah berkas MPZIS yang sudah ditandatangani untuk arsip digital.
                </p>
                <label className="mt-8 px-6 py-3 bg-purple-600 text-white rounded-xl font-bold cursor-pointer hover:bg-purple-500 transition-all flex items-center gap-2 shadow-xl shadow-purple-500/20">
                  <Plus className="w-5 h-5" />
                  Unggah Sekarang
                  <input type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={handleMpzisUpload} />
                </label>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {mpzisFiles.map((file, idx) => (
                  <div 
                    key={idx} 
                    className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xl flex flex-col group hover:border-purple-400 transition-all"
                  >
                    <div className="h-48 bg-slate-100 relative overflow-hidden flex items-center justify-center">
                      {file.data.startsWith('data:application/pdf') ? (
                        <div className="flex flex-col items-center gap-3 text-slate-400">
                          <FileText className="w-12 h-12" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">PDF Document</span>
                        </div>
                      ) : (
                        <img 
                          src={file.data} 
                          alt={file.name} 
                          className="w-full h-full object-cover"
                        />
                      )}
                      
                      {/* Hover Overlay */}
                      <div className="absolute inset-0 bg-black/60 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                        <button 
                          onClick={() => openInNewTab(file.data)}
                          className="p-3 bg-white text-black rounded-full hover:bg-purple-500 hover:text-white transition-all transform translate-y-4 group-hover:translate-y-0"
                          title="Buka di tab baru"
                        >
                          <ExternalLink className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => downloadFile(file.data, file.name)}
                          className="p-3 bg-white text-black rounded-full hover:bg-emerald-500 hover:text-white transition-all transform translate-y-4 group-hover:translate-y-0 delay-75"
                          title="Unduh"
                        >
                          <Download className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="p-4 flex items-center justify-between border-t border-slate-100">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-8 h-8 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col overflow-hidden">
                          <span className="text-xs font-bold text-slate-900 truncate">{file.name}</span>
                          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Hlm {idx + 1} • Scan MPZIS</span>
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => removeMpzisFile(idx)}
                        className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                        title="Hapus"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                
                {/* Add More Card */}
                <label className="border-2 border-dashed border-white/10 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:border-purple-400/50 hover:bg-white/5 transition-all group">
                  <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center text-white/20 mb-4 group-hover:scale-110 group-hover:text-purple-400 transition-all">
                    <Plus className="w-6 h-6" />
                  </div>
                  <span className="text-sm font-bold text-white/40 group-hover:text-white transition-colors">Tambah Scan Lagi</span>
                  <input type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={handleMpzisUpload} />
                </label>
              </div>
            )}
          </div>
        ) : (
          /* CONFIG PANEL VIEW */
          <div className="w-full max-w-2xl space-y-6 my-4 pb-20">
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
                      const fileInput = document.getElementById('config-logo-input-mpzis');
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
                      id="config-logo-input-mpzis" 
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
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500 transition-colors bg-slate-950"
                      value={templateConfig.institution}
                      onChange={(e) => setTemplateConfig(p => ({ ...p, institution: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Region / Wilayah</label>
                    <input 
                      type="text" 
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500 transition-colors bg-slate-950"
                      value={templateConfig.region}
                      onChange={(e) => setTemplateConfig(p => ({ ...p, region: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Deskripsi Lembaga (Bottom)</label>
                  <input 
                    type="text" 
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500 transition-colors bg-slate-950"
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
                    className="flex-1 bg-amber-600 hover:bg-amber-550 disabled:bg-amber-800 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                  >
                    {isSavingConfig ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    {isSavingConfig ? 'Menyimpan...' : 'Simpan Konfigurasi Secara Global'}
                  </button>
                  <button 
                    onClick={() => setActiveTab('template')}
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
      </div>
    </div>
  );
}
