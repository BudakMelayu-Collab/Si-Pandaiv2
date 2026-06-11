import React, { useState, useEffect } from 'react';
import { Recipient } from '../types';
import { 
  Printer, X, FileText, CheckSquare, Square, 
  Image as ImageIcon, Upload, Edit3, Plus, Trash2,
  FileCheck, ExternalLink, Download, Loader2, ChevronRight,
  Settings, Save, Eye, RotateCcw, AlertTriangle, CheckCircle
} from 'lucide-react';
import { cn, compressImage, isBase64SizeValid } from '../lib/utils';
import * as storage from '../lib/storage';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

interface MPZISTemplateProps {
  recipient: Recipient;
  lampiranItems?: Recipient[];
  onClose: () => void;
}

function chunkArray<T>(array: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(array.length / size) }, (_, i) => array.slice(i * size, i * size + size));
}

export default function MPZISTemplate({ recipient, lampiranItems, onClose }: MPZISTemplateProps) {
  const [logo, setLogo] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'template' | 'scan' | 'config' | 'lampiran'>('template');
  const [paperSize, setPaperSize] = useState<'A4' | 'F4'>('F4');

  const [templateConfig, setTemplateConfig] = useState({
    logo: '',
    institution: 'BAZNAS',
    region: 'KABUPATEN SIAK',
    subText: 'Badan Amil Zakat Nasional',
    fontSize: 9,
    logoSize: 64
  });

  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [mpzisFiles, setMpzisFiles] = useState<{ name: string; data: string }[]>([]);
  const [ isLoadingFile, setIsLoadingFile] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadedRecipientId, setLoadedRecipientId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [showExitEditWarning, setShowExitEditWarning] = useState(false);
  const [toastMessage, setToastMessage] = useState<{title: string; message: string; type: 'success'|'error'} | null>(null);

  React.useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);
  
  // Load saved data from storage on mount
  React.useEffect(() => {
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

        // 2. Try Survey template (which is known to have a logo on other computers)
        if (!savedLogo) {
          const surveySnap = await getDoc(fsDoc(db, 'settings', 'survey_template'));
          if (surveySnap.exists() && surveySnap.data().logo) {
            savedLogo = surveySnap.data().logo;
          }
        }

        // 3. Try MPZIS template config itself
        if (!savedLogo) {
          const mpzisSnap = await getDoc(fsDoc(db, 'settings', 'mpzis_template'));
          if (mpzisSnap.exists() && mpzisSnap.data().logo) {
            savedLogo = mpzisSnap.data().logo;
          }
        }

        // 4. Try EPPD template config
        if (!savedLogo) {
          const eppdSnap = await getDoc(fsDoc(db, 'settings', 'eppd_template'));
          if (eppdSnap.exists() && eppdSnap.data().logo) {
            savedLogo = eppdSnap.data().logo;
          }
        }

        // 5. Try Receipt template config
        if (!savedLogo) {
          const receiptSnap = await getDoc(fsDoc(db, 'settings', 'receipt_template'));
          if (receiptSnap.exists() && receiptSnap.data().logo) {
            savedLogo = receiptSnap.data().logo;
          }
        }

        if (savedLogo) {
          await storage.setItem('baznas_logo', savedLogo);
        }
      } catch (err) {
        console.error("Failed to load global logo dynamically from Cloud Firestore, falling back to local:", err);
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
        
        const getPICName = (sector: string) => {
          switch(sector?.toLowerCase()) {
            case 'siak cerdas': return 'Satriyanda, SE';
            case 'siak dakwah': return 'Satriyanda';
            case 'siak peduli': return 'Muslikun Thohari, S.Ikom';
            case 'siak sehat': return 'Dina Alvinda';
            case 'siak sejahtera': return 'Ikhlasul Amal';
            default: return 'Satriyanda, SE';
          }
        };

        // Normalize column labels if they are the old uppercase ones
        if (parsed.columns) {
          const defaultsMap: {[key: string]: string} = {
            'URAIAN': 'Uraian',
            'NAMA': 'Nama',
            'IDENTITAS/NIK': 'Identitas',
            'REKENING/BANK/NAMA REKENING': 'Rekening/bank/nama rekening/bank',
            'JUMLAH BANTUAN': 'Jumlah bantuan'
          };
          parsed.columns = parsed.columns
            .filter((col: any) => col.key !== 'bank')
            .map((col: any) => ({
              ...col,
              label: (col.label === 'Identitas/nik') ? 'Identitas' : (defaultsMap[col.label] || col.label)
            }));
        }

        if (parsed.signersTop) {
          parsed.signersTop = parsed.signersTop.map((s: any) => {
            if (s.role === 'Pic program' || s.role === 'PIC Program') {
              s.role = 'PIC Program';
              if (s.name === 'Rina Wasih') {
                s.name = getPICName(recipient.sector || '');
              }
            }
            if (s.role === 'Kabid. pendistribusian dan pendayagunaan' || s.role === 'Kabid. Pendistribusian') s.role = 'Kabid. Pendistribusian dan Pendayagunaan';
            if (s.role === 'Kepala pelaksana') s.role = 'Kepala Pelaksana';
            return s;
          });
        }
        if (parsed.signersBottom) {
          parsed.signersBottom = parsed.signersBottom.map((s: any) => {
            if (s.role === 'Wakil ketua 1') s.role = 'Wakil Ketua I';
            if (s.role === 'Wakil ketua 2') s.role = 'Wakil Ketua II';
            if (s.role === 'Wakil ketua 3') s.role = 'Wakil Ketua III';
            if (s.role === 'Wakil ketua 4') s.role = 'Wakil Ketua IV';
            return s;
          });
        }

        // Apply new rules to existing saved data
        // 1. Classification
        if (parsed.classification?.startsWith('Baznas ')) {
          parsed.classification = recipient.sector || 'Siak Sejahtera';
        }
        // 2. Clear old hardcoded purposes / ashnaf / source / description
        if (parsed.purpose?.startsWith('Melaksanakan program ')) parsed.purpose = recipient.programName ? `Melaksanakan Program ${recipient.programName}` : '';
        if (parsed.ashnaf === 'Miskin' || !parsed.ashnaf) parsed.ashnaf = recipient.ashnaf || '';
        if (parsed.source === 'Zakat / Infaq / Shadaqah' || !parsed.source) parsed.source = recipient.fundingSource || '';
        if (parsed.budgetPost === recipient.aidType || !parsed.budgetPost) parsed.budgetPost = recipient.programName || '';
        if (parsed.purpose === 'Biaya Penddikan' || !parsed.purpose) parsed.purpose = recipient.programName ? `Melaksanakan Program ${recipient.programName}` : '';

        
        // Fix old `nomor` format dynamically if it contains the old pattern or uses BDG.
        if (!parsed.nomor || parsed.nomor.includes('BDG.')) {
          const getBidangCode = (sector: string) => {
            switch(sector?.toLowerCase()) {
              case 'siak cerdas': return 'SC';
              case 'siak dakwah': return 'SD';
              case 'siak peduli': return 'SP';
              case 'siak sehat': return 'SS';
              case 'siak sejahtera': return 'SJ';
              default: return 'SC';
            }
          };
          const getRomanMonth = (month: number) => {
            const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
            return romans[month - 1] || 'I';
          };
          
          let counter = parseInt(localStorage.getItem('mpzis_seq_counter') || '1', 10);
          let seqStr = String(counter).padStart(3, '0');
          
          // Only replace BDG. with correct code while preserving sequence if possible
          if (parsed.nomor && parsed.nomor.includes('BDG.')) {
             parsed.nomor = parsed.nomor.replace(/BDG\.\d/g, getBidangCode(recipient.sector || ''));
          } else {
             parsed.nomor = `${seqStr}/MPZIS/${getBidangCode(recipient.sector || '')}/${getRomanMonth(new Date().getMonth() + 1)}/${new Date().getFullYear()}`;
          }
        }
        
        // Always update rows from selection if it was provided
        if (lampiranItems && lampiranItems.length > 0) {
          parsed.rows = lampiranItems.map(r => {
            const existingRow = parsed.rows?.find((pr: any) => pr.nik === r.nik || pr.name === r.name);
            return {
              id: existingRow ? existingRow.id : (Date.now() + Math.random()),
              description: (existingRow && existingRow.description) ? existingRow.description : (r.purpose || recipient.purpose || ''),
              name: r.name || '',
              nik: r.nik || '',
              amount: existingRow ? Number(existingRow.amount) : (Number(r.amountProposed) || 0)
            };
          });
        } else if (parsed.rows && parsed.rows.length === 1) {
          if (!parsed.rows[0].description) {
            parsed.rows[0].description = recipient.purpose || '';
          }
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
          logoSize: data.logoSize || 64
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
      setToastMessage({ title: "Berhasil", message: "Konfigurasi template berhasil disimpan secara global!", type: 'success' });
      setActiveTab('template');
    } catch (error) {
      console.error('Error saving config:', error);
      setToastMessage({ title: "Gagal", message: "Gagal menyimpan konfigurasi. Pastikan Anda memiliki izin.", type: 'error' });
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

  // formatting helpers
  const getBidangCode = (sector: string) => {
    switch(sector?.toLowerCase()) {
      case 'siak cerdas': return 'SC';
      case 'siak dakwah': return 'SD';
      case 'siak peduli': return 'SP';
      case 'siak sehat': return 'SS';
      case 'siak sejahtera': return 'SJ';
      default: return 'SC';
    }
  };

  const getPICName = (sector: string) => {
    switch (sector?.toLowerCase()) {
      case 'siak cerdas': return 'Satriyanda, SE';
      case 'siak dakwah': return 'Satriyanda';
      case 'siak peduli': return 'Muslikun Thohari, S.Ikom';
      case 'siak sehat': return 'Dina Alvinda';
      case 'siak sejahtera': return 'Ikhlasul Amal';
      default: return 'Satriyanda, SE';
    }
  };

  const getRomanMonth = (month: number) => {
    const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    return romans[month - 1] || 'I';
  };

  // Local state for memorandum data
  const [memoData, setMemoData] = useState(() => {
    let defaultNomor = '';
    const dateObj = new Date();
    const bidCode = getBidangCode(recipient.sector || '');
    const rmMonth = getRomanMonth(dateObj.getMonth() + 1);
    
    // Instead of hardcoding 001, let's look for sequence counter
    // Only init if this is initial mount
    const counter = parseInt(localStorage.getItem('mpzis_seq_counter') || '1', 10);
    const seqStr = String(counter).padStart(3, '0');
    // E.g. "001/MPZIS/SS/VI/2026"
    defaultNomor = `${seqStr}/MPZIS/${bidCode}/${rmMonth}/${dateObj.getFullYear()}`;

    return {
      nomor: defaultNomor,
    programValue: recipient.sector || '',
    headerDate: new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    classification: recipient.sector || 'Siak Sehat',
    purpose: recipient.programName ? `Melaksanakan Program ${recipient.programName}` : '',
    ashnaf: recipient.ashnaf || '',
    source: recipient.fundingSource || '',
    budgetPost: recipient.programName || '',
    transactionType: 'TRANSFER' as 'CASH' | 'TRANSFER',
    columns: [
      { key: 'description', label: 'Uraian' },
      { key: 'name', label: 'Nama' },
      { key: 'nik', label: 'Identitas' },
      { key: 'amount', label: 'Jumlah bantuan' }
    ],
    rows: lampiranItems && lampiranItems.length > 0 
      ? lampiranItems.map(r => ({
          id: Date.now() + Math.random(),
          description: r.purpose || recipient.purpose || '',
          name: r.name || '',
          nik: r.nik || '',
          amount: Number(r.amountProposed) || 0
        }))
      : [
      { 
        id: Date.now(), 
        description: recipient.purpose || '', 
        name: recipient.name, 
        nik: recipient.nik,
        amount: Number(recipient.amountProposed) 
      }
    ],
    signersTop: [
      { label: 'Disiapkan', name: getPICName(recipient.sector || ''), role: 'PIC Program' },
      { label: 'Diperiksa', name: 'Andreas Supriadi, S.I.Kom', role: 'Kabid. Pendistribusian dan Pendayagunaan' },
      { label: 'Disetujui', name: 'Sutarno Nurdianto, SE', role: 'Kepala Pelaksana' }
    ],
    signersBottom: [
      { name: "H. Samparis Bin Tatan, S.Pd.I", role: "Ketua" },
      { name: "Syukron Wahib, M.Pd.I", role: "Wakil Ketua I" },
      { name: "H. Sukijo", role: "Wakil Ketua II" },
      { name: "KH. Moch Sowwam Amin, SH", role: "Wakil Ketua III" },
      { name: "H. Rojikin, S.Ag, MH", role: "Wakil Ketua IV" }
    ]
  };
  });
  
  // Auto-save memo data
  React.useEffect(() => {
    if (!isLoaded || loadedRecipientId !== recipient.id) return;
    const saveMemo = async () => {
      setSaveStatus('saving');
      try {
        const match = memoData.nomor?.match(/^(\d+)\/MPZIS\//);
        if (match) {
          const seq = parseInt(match[1], 10);
          const currentCounter = parseInt(localStorage.getItem('mpzis_seq_counter') || '1', 10);
          if (seq >= currentCounter) {
            localStorage.setItem('mpzis_seq_counter', String(seq + 1));
          }
        }
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
          
          // Sync directly to config document as well so it updates templateConfig in real-time
          const { setDoc, doc: fsDoc } = await import('firebase/firestore');
          await setDoc(fsDoc(db, 'settings', 'mpzis_template'), {
            logo: base64
          }, { merge: true });
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

  const resetColumns = () => {
    setMemoData({
      ...memoData,
      columns: [
        { key: 'description', label: 'Uraian' },
        { key: 'name', label: 'Nama' },
        { key: 'nik', label: 'Identitas' },
        { key: 'amount', label: 'Jumlah bantuan' }
      ]
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
      
      {showExitEditWarning && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 print:hidden">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-xl max-w-sm w-full mx-4 flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200">
            <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">Keluar Mode Edit</h3>
            <p className="text-slate-300 text-sm mb-6">Pastikan Anda telah menyimpan perubahan sebelum keluar agar data tidak hilang.</p>
            <div className="flex gap-3 w-full">
                <button onClick={() => setShowExitEditWarning(false)} className="flex-1 py-2 text-sm font-bold bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all">Kembali</button>
                <button onClick={() => { setShowExitEditWarning(false); setIsEditing(false); }} className="flex-1 py-2 text-sm font-bold bg-amber-500 hover:bg-amber-400 text-white rounded-xl transition-all">Selesai Edit</button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 bg-slate-900 border border-slate-700 p-4 rounded-xl shadow-2xl print:hidden animate-in slide-in-from-top-4 fade-in duration-300">
          {toastMessage.type === 'success' ? <CheckCircle className="w-6 h-6 text-emerald-500" /> : <AlertTriangle className="w-6 h-6 text-red-500" />}
          <div className="flex flex-col">
            <span className="text-white font-bold text-sm">{toastMessage.title}</span>
            <span className="text-white/60 text-xs">{toastMessage.message}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="ml-4 text-white/40 hover:text-white"><X className="w-4 h-4"/></button>
        </div>
      )}

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
              <h3 className="font-bold text-white text-[10px] leading-tight">MPZIS</h3>
              <div className="flex items-center gap-2">
                {saveStatus === 'saving' && <span className="text-white/40 animate-pulse text-[8px] uppercase tracking-tighter bg-white/5 px-1.5 py-0.5 rounded border border-white/5">● Menyimpan...</span>}
                {saveStatus === 'saved' && <span className="text-emerald-400 text-[8px] uppercase tracking-tighter bg-emerald-400/10 px-1.5 py-0.5 rounded border border-emerald-400/10">● Tersimpan</span>}
                {saveStatus === 'error' && <span className="text-red-400 text-[8px] uppercase tracking-tighter bg-red-400/10 px-1.5 py-0.5 rounded border border-red-400/10">● Gagal</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center gap-2 max-w-2xl px-4 overflow-x-auto scrollbar-hide">
        <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 shrink-0 mx-4">
          <button 
            onClick={() => setActiveTab('template')}
            className={cn(
              "px-6 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-2 transition-all",
              activeTab === 'template' ? "bg-white/10 text-white shadow-xl" : "text-white/30 hover:text-white"
            )}
          >
            <FileText className="w-3.5 h-3.5" />
            Template
          </button>
          <button 
            onClick={() => setActiveTab('scan')}
            className={cn(
              "px-6 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-2 transition-all relative",
              activeTab === 'scan' ? "bg-white/10 text-white shadow-xl" : "text-white/30 hover:text-white"
            )}
          >
            <Eye className="w-3.5 h-3.5" />
            Scan Tertanda
            {mpzisFiles.length > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-[#111827]" />
            )}
          </button>
          <button 
            onClick={() => setActiveTab('config')}
            className={cn(
              "px-6 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-2 transition-all",
              activeTab === 'config' ? "bg-white/10 text-white shadow-xl" : "text-white/30 hover:text-white"
            )}
          >
            <Settings className="w-3.5 h-3.5" />
            Config
          </button>
          
          {memoData.rows.length > 10 && (
            <button 
              onClick={() => setActiveTab('lampiran')}
              className={cn(
                "px-6 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-2 transition-all text-amber-300",
                activeTab === 'lampiran' ? "bg-amber-500/20 text-amber-300 shadow-xl border border-amber-500/30" : "hover:text-amber-200"
              )}
            >
              <FileText className="w-3.5 h-3.5" />
              Lampiran Penerima
            </button>
          )}
        </div>

          <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 shrink-0 mr-2 items-center">
            
          </div>

          <div className="w-px h-6 bg-white/10 shrink-0" />

          {activeTab === 'template' && (
            <>
              <button 
                onClick={() => {
                  if (isEditing) {
                    setShowExitEditWarning(true);
                  } else {
                    setIsEditing(true);
                  }
                }}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold transition-all shrink-0",
                  isEditing 
                    ? "bg-amber-500 text-white shadow-lg shadow-amber-500/20" 
                    : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border border-white/10"
                )}
              >
                {isEditing ? <FileCheck className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
                {isEditing ? "Selesai Edit" : "Edit"}
              </button>
            </>
          )}


        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button 
            onClick={handlePrint}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-bold hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20 active:scale-95 border border-indigo-500/20"
          >
            <Printer className="w-4 h-4" />
            Cetak
          </button>
          <button 
            onClick={async () => {
              setSaveStatus('saving');
              try {
                const { saveRecipientTemplateData } = await import('../firebase');
                await saveRecipientTemplateData(recipient.id, 'mpzis', memoData);
                await storage.setItem(`mpzis_memo_${recipient.id}`, memoData);
                setSaveStatus('saved');
                setToastMessage({ title: "Berhasil", message: "Data berhasil disimpan!", type: 'success' });
              } catch (e) {
                console.error("Manual save failed", e);
                setSaveStatus('error');
                setToastMessage({ title: "Gagal", message: "Gagal menyimpan data!", type: 'error' });
              }
            }}
            disabled={saveStatus === 'saving'}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-[10px] font-bold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50"
          >
            {saveStatus === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />}
            Simpan
          </button>
        </div>
      </div>

      {/* Document View & Sidebar Container */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_320px] print:block bg-slate-950">
        
        {/* Main Document View */}
        <div className="flex-1 p-4 md:p-8 overflow-y-auto bg-slate-950/20 flex flex-col items-center print:p-0 print:bg-white overflow-x-hidden scroll-smooth relative">
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            @page {
              size: ${activeTab === 'lampiran' ? (paperSize === 'A4' ? '297mm 210mm' : '330.2mm 215.9mm') : (paperSize === 'A4' ? '210mm 297mm' : '215.9mm 330.2mm')};
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
                <img src={templateConfig.logo} alt="Logo" className="object-contain" style={{ maxHeight: `${templateConfig.logoSize + 32}px` }} />
              ) : logo ? (
                <img src={logo} alt="Logo" className="object-contain" style={{ maxHeight: `${templateConfig.logoSize + 32}px` }} />
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
              <h2 className="text-[14px] font-bold uppercase mb-1">PENYALURAN DANA ZAKAT INFAQ DAN SHADAQAH</h2>
              <h2 className="text-[14px] font-bold uppercase mb-2">TAHUN {new Date().getFullYear()}</h2>
              {isEditing ? (
                <input 
                  className="text-center w-full bg-amber-50 border-b border-amber-200 outline-none p-1 text-[13px] text-black font-bold"
                  value={memoData.nomor}
                  onChange={e => setMemoData({...memoData, nomor: e.target.value})}
                />
              ) : (
                <p className="text-[13px] font-bold tracking-tight">No : {memoData.nomor}</p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <div className="border border-black p-1 text-center text-black font-bold text-[10px] bg-slate-50 uppercase">
                {recipient.sector?.toLowerCase().startsWith('siak') ? recipient.sector : recipient.sector || 'SIAK SEHAT'}
              </div>
              <div className="border border-black flex-1 p-2 text-[11px] leading-snug text-black flex flex-col justify-center gap-1">
                <div className="grid grid-cols-[45px_1fr]">
                  <span className="text-black">Program</span>
                  <div className="font-bold border-l border-black/10 pl-1 overflow-hidden">
                    {isEditing ? (
                      <input 
                        className="w-full bg-amber-50 outline-none text-[11px]" 
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
                  <span className="text-black">Tanggal</span>
                  <div className="font-bold border-l border-black/10 pl-1 overflow-hidden">
                    {isEditing ? (
                      <input 
                        className="w-full bg-amber-50 outline-none text-[11px]" 
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

          <p className="text-[10px] mb-6 leading-relaxed text-black font-sans">
            Kami yang bertanda tangan dibawah ini Komite Pendistribusian dan Pendayagunaan menyetujui dan memutuskan penyaluran sebagai berikut :
          </p>

          {/* List Details */}
          <div className="space-y-3 text-[10px] mb-8 text-black font-sans">
            <div className="grid grid-cols-[220px_10px_1fr] items-center">
              <span className="font-normal">1. Klasifikasi program</span>
              <span>:</span>
              {isEditing ? (
                <input className="bg-amber-50 border-b border-amber-200 outline-none w-full px-1 text-[10px] font-bold text-black" value={memoData.classification} onChange={e => setMemoData({...memoData, classification: e.target.value})} />
              ) : (
                <span className="text-[10px] font-bold">{memoData.classification}</span>
              )}
            </div>
            <div className="grid grid-cols-[220px_10px_1fr] items-center">
              <span className="font-normal">2. Tujuan penyaluran</span>
              <span>:</span>
              {isEditing ? (
                <input className="bg-amber-50 border-b border-amber-200 outline-none w-full px-1 text-[10px] font-bold text-black" value={memoData.purpose} onChange={e => setMemoData({...memoData, purpose: e.target.value})} />
              ) : (
                <span className="text-[10px] font-bold">{memoData.purpose}</span>
              )}
            </div>
            <div className="grid grid-cols-[220px_10px_1fr] items-center">
              <span className="font-normal">3. Ashnaf</span>
              <span>:</span>
              {isEditing ? (
                <input className="bg-amber-50 border-b border-amber-200 outline-none w-full px-1 text-[10px] font-bold text-black" value={memoData.ashnaf} onChange={e => setMemoData({...memoData, ashnaf: e.target.value})} />
              ) : (
                <span className="text-[10px] font-bold">{memoData.ashnaf}</span>
              )}
            </div>
            <div className="grid grid-cols-[220px_10px_1fr] items-center">
              <span className="font-normal">4. Sumber dana</span>
              <span>:</span>
              {isEditing ? (
                <input className="bg-amber-50 border-b border-amber-200 outline-none w-full px-1 text-[10px] font-bold text-black" value={memoData.source} onChange={e => setMemoData({...memoData, source: e.target.value})} />
              ) : (
                <span className="text-[10px] font-bold">{memoData.source}</span>
              )}
            </div>
            <div className="grid grid-cols-[220px_10px_1fr] items-center">
              <span className="font-normal">5. Post anggaran rkat</span>
              <span>:</span>
              {isEditing ? (
                <input className="bg-amber-50 border-b border-amber-200 outline-none w-full px-1 text-[10px] font-bold text-black" value={memoData.budgetPost} onChange={e => setMemoData({...memoData, budgetPost: e.target.value})} />
              ) : (
                <span className="text-[10px] font-bold">{memoData.budgetPost}</span>
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
                  <span className="text-[10px] font-bold">Cash</span>
                </div>
                <div 
                  className={cn("flex items-center gap-1.5 cursor-pointer", isEditing && "hover:text-emerald-600")}
                  onClick={() => isEditing && setMemoData({...memoData, transactionType: 'TRANSFER'})}
                >
                  {memoData.transactionType === 'TRANSFER' ? <CheckSquare className="w-5 h-5 text-emerald-600" /> : <Square className="w-5 h-5 text-slate-400" />}
                  <span className="text-[10px] font-bold">Transfer</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mb-3 text-black font-sans">
            <p className="text-[10px] font-normal tracking-wide">7. Penerima dana :</p>
            {isEditing && (
              <div className="flex gap-2">
                <button 
                  onClick={resetColumns}
                  className="flex items-center gap-1 px-2 py-1 bg-amber-500 text-white rounded text-[10px] font-bold hover:bg-amber-600 transition-colors shadow-sm"
                  title="Kembalikan ke kolom default"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </button>
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
          
          <table className="w-full border-collapse border border-black text-[10px] mb-6 text-black font-sans">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-black p-3 w-12 font-bold text-[10px]">No</th>
                {memoData.columns.map((col) => (
                  <th 
                    key={col.key} 
                    className={cn(
                      "border border-black p-3 relative group font-bold text-center tracking-tight text-[10px]",
                      isEditing 
                        ? (col.key === 'description' ? "w-auto min-w-[120px]" : "w-auto min-w-[100px]") 
                        : (col.key === 'description' ? "w-auto min-w-[150px]" : "w-[1%] whitespace-nowrap px-4")
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
              {memoData.rows.length > 10 ? (
                <tr key="terlampir">
                  <td className="border border-black p-3 text-center align-top">1</td>
                  {memoData.columns.map((col) => (
                    <td key={col.key} className={cn("border border-black p-3 align-top italic", col.key === 'amount' ? "text-right font-bold" : "", col.key !== 'description' ? "whitespace-nowrap w-[1%]" : "w-auto")}>
                      {col.key === 'amount' 
                        ? `Rp. ${totalAmount.toLocaleString('id-ID')},-` 
                        : "Terlampir"
                      }
                    </td>
                  ))}
                  {isEditing && (
                    <td className="border border-black p-1 text-center print:hidden align-top text-slate-400 text-[10px]">
                      Lihat di lampiran
                    </td>
                  )}
                </tr>
              ) : (
                memoData.rows.map((row, idx) => (
                  <tr key={row.id}>
                    <td className="border border-black p-3 text-center align-top">{idx + 1}</td>
                    {memoData.columns.map((col) => (
                      <td key={col.key} className={cn(
                        "border border-black p-3 align-top", 
                        col.key === 'amount' ? "text-right" : "", 
                        isEditing 
                          ? (col.key === 'description' ? "w-auto min-w-[120px]" : "w-auto min-w-[100px]") 
                          : (col.key !== 'description' ? "whitespace-nowrap w-[1%]" : "w-auto")
                      )}>
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
                ))
              )}
              <tr className="bg-slate-50 font-bold border-t border-black">
                <td colSpan={memoData.columns.length} className="border border-black p-3 text-right font-bold text-[10px]">Total bantuan</td>
                <td className="border border-black p-3 text-right text-[10px] font-bold">
                  Rp. {totalAmount.toLocaleString('id-ID')},-
                </td>
                {isEditing && <td className="border border-black p-3 print:hidden bg-slate-100"></td>}
              </tr>
            </tbody>
          </table>

          <div className="border border-black p-4 text-[10px] font-bold mb-8 bg-slate-50 tracking-tight text-black">
            Terbilang : {terbilang(totalAmount)}
          </div>

          <p className="text-[10px] italic mb-12 text-center leading-relaxed text-black">
            Demikian Memorandum Penyaluran ZIS ini dibuat dengan sebenarnya dan dapat dipergunakan dengan semestinya.
          </p>

          {/* Approval Section */}
          <div className="grid grid-cols-3 border border-black mb-10 text-[10px] font-sans text-black">
            {(() => {
              return memoData.signersTop.map((signer, idx) => (
              <div key={idx} className={cn("p-1 flex flex-col items-center justify-between min-h-[140px]", idx < 2 && "border-r border-black")}>
                <div className="w-full">
                  {isEditing ? (
                    <input 
                      className="font-bold border-b border-black pb-1 w-full text-center bg-amber-50 outline-none text-black text-[10px]"
                      value={signer.label}
                      onChange={e => {
                        const newSigners = [...memoData.signersTop];
                        newSigners[idx].label = e.target.value;
                        setMemoData({...memoData, signersTop: newSigners});
                      }}
                    />
                  ) : (
                    <p className="font-bold border-b border-black pb-1 w-full text-center tracking-wide leading-tight text-[10px]">{signer.label}</p>
                  )}
                </div>
                
                <div className="text-center w-full mt-auto pt-8 overflow-hidden">
                  {isEditing ? (
                    <>
                      <input 
                        className="font-bold underline leading-none mb-0 w-full text-center bg-amber-50 outline-none text-black text-[10px]"
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
                      <p className="font-bold underline leading-none mb-0 tracking-tight whitespace-nowrap mx-auto text-[10px]">{signer.name}</p>
                      <div className="h-6 flex items-start justify-center mt-0.5">
                        <p className="leading-tight font-bold text-[10px]">{signer.role}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))})()}
          </div>

          {/* Footer Decision Section */}
          <div className="border border-black text-[10px] font-sans text-black">
            <div>
              <p className="text-center font-bold border-b border-black py-2 bg-slate-100 italic text-[10px]">Diputuskan</p>
              <div className="grid grid-cols-[1fr_1fr_1fr_1.15fr_1fr] h-40">
                {(() => {
                  return memoData.signersBottom.map((signer, idx) => (
                    <div key={idx} className="border-r last:border-r-0 border-black p-1 flex flex-col justify-end text-center overflow-hidden">
                      {isEditing ? (
                        <>
                          <input 
                            className="font-bold underline leading-tight mb-0 w-full text-center bg-amber-50 outline-none text-black text-[10px]"
                            value={signer.name}
                            onChange={e => {
                              const newSigners = [...memoData.signersBottom];
                              newSigners[idx].name = e.target.value;
                              setMemoData({...memoData, signersBottom: newSigners});
                            }}
                          />
                          <input 
                            className="text-[10px] leading-none mb-2 w-full text-center bg-amber-50 outline-none text-black"
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
                          <p className="font-bold underline mb-0 leading-tight tracking-tighter mx-auto whitespace-nowrap text-[10px]">{signer.name}</p>
                          <div className="h-6 flex items-start justify-center mt-0.5">
                            <p className="text-[10px] leading-tight font-bold">{signer.role}</p>
                          </div>
                        </>
                      )}
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>

          {/* Watermark */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.04] pointer-events-none -rotate-12 select-none text-center">
            <h1 className="text-9xl font-black whitespace-nowrap">BAZNAS SIAK</h1>
          </div>
          </div>
        ) : activeTab === 'lampiran' ? (
          /* Lampiran Landscape Render */
          <div className="w-full flex flex-col gap-8 pb-20 items-center">
            {chunkArray<any>(memoData.rows, 18).map((pageRows, pageIndex, allPages) => (
              <div key={pageIndex} className={cn(
                "lampiran-print-page bg-white w-full max-w-[1300px] shadow-2xl p-6 text-black font-sans relative transition-all border border-slate-300 print:shadow-none print:p-0 print:max-w-full shrink-0 flex flex-col",
                pageIndex > 0 && "print:break-before-page",
                isEditing && "ring-4 ring-amber-500/30"
              )}
              style={{ fontSize: `${templateConfig.fontSize + 2.5}pt`, minHeight: paperSize === 'A4' ? '210mm' : '215.9mm' }}>
                <h3 className="font-bold text-center mb-6 text-lg">LAMPIRAN PENERIMA DANA ZIS</h3>
                <h4 className="font-bold text-center mb-6 text-md uppercase">PROGRAM: {memoData.classification}</h4>
                
                <table className="w-full border-collapse border border-black text-[10px] bg-transparent mb-auto">
                  <thead>
                    <tr className="bg-slate-100/50 print:bg-white text-center">
                      <th className="border border-black p-2 font-bold w-12">No</th>
                      {memoData.columns.map(col => (
                        <th key={col.key} className="border border-black p-2 font-bold">{col.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row: any, localIdx: number) => {
                      const absoluteIdx = pageIndex * 18 + localIdx + 1;
                      return (
                        <tr key={row.id}>
                          <td className="border border-black p-1 text-center align-top">{absoluteIdx}</td>
                          {memoData.columns.map((col) => (
                            <td key={col.key} className={cn(
                              "border border-black p-1 align-top", 
                              col.key === 'amount' ? "text-right" : "", 
                              isEditing 
                                ? (col.key === 'description' ? "w-auto min-w-[150px]" : "w-auto min-w-[100px]") 
                                : (col.key !== 'description' ? "whitespace-nowrap w-[1%]" : "w-auto")
                            )}>
                              {isEditing ? (
                                <div className="flex items-center gap-1">
                                  <input 
                                    className={cn("w-full outline-none bg-amber-50", col.key === 'amount' ? "text-right" : "")}
                                    type={col.key === 'amount' ? 'number' : 'text'}
                                    value={row[col.key]} 
                                    onChange={e => {
                                      const newRows = [...memoData.rows];
                                      const globalIdx = memoData.rows.findIndex(r => r.id === row.id);
                                      if(globalIdx !== -1) {
                                        newRows[globalIdx] = {...newRows[globalIdx], [col.key]: e.target.value};
                                        setMemoData({...memoData, rows: newRows});
                                      }
                                    }} 
                                  />
                                </div>
                              ) : (
                                col.key === 'amount' 
                                  ? `Rp. ${Number(row[col.key]).toLocaleString('id-ID')},-`
                                  : row[col.key]
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                    {pageIndex === allPages.length - 1 && (
                      <tr className="bg-slate-50 border-t border-black">
                        <td colSpan={memoData.columns.length} className="border border-black p-2 text-right font-bold text-[10px]">TOTAL Rp</td>
                        <td className="border border-black p-2 text-right font-bold text-[10px]">{totalAmount.toLocaleString('id-ID')}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                
                <div className="grid grid-cols-2 mt-auto text-center text-[10px] pt-4 h-32">
                  <div className="flex flex-col items-center justify-start">
                    <span className="mb-auto">Diperiksa</span>
                    <div className="font-bold border-b border-black w-64 mb-1 leading-none pb-1">
                      {isEditing ? <input className="w-full bg-amber-50 text-center outline-none" value={memoData.signersTop[1]?.name} onChange={(e) => {
                        const newSigners = [...memoData.signersTop];
                        if(newSigners[1]) newSigners[1].name = e.target.value;
                        setMemoData({...memoData, signersTop: newSigners});
                      }} /> : (memoData.signersTop[1]?.name)}
                    </div>
                    <span>{memoData.signersTop[1]?.role}</span>
                  </div>
                  <div className="flex flex-col items-center justify-start">
                    <span className="mb-auto">Disiapkan</span>
                    <div className="font-bold border-b border-black w-48 mb-1 leading-none pb-1">
                      {isEditing ? <input className="w-full bg-amber-50 text-center outline-none" value={memoData.signersTop[0]?.name} onChange={(e) => {
                        const newSigners = [...memoData.signersTop];
                        if(newSigners[0]) newSigners[0].name = e.target.value;
                        setMemoData({...memoData, signersTop: newSigners});
                      }} /> : (memoData.signersTop[0]?.name)}
                    </div>
                    <span>{memoData.signersTop[0]?.role}</span>
                  </div>
                </div>
                
              </div>
            ))}
          </div>
        ) : activeTab === 'scan' ? (
          /* Scan Results Tab */
          <div className="w-full h-full max-w-4xl flex flex-col gap-4">
            {mpzisFiles.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 bg-white/5 border-2 border-dashed border-white/10 rounded-3xl text-center min-h-[400px]">
                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/10">
                  {isSaving ? (
                    <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent animate-spin rounded-full" />
                  ) : (
                    <Upload className="w-10 h-10 text-white/20" />
                  )}
                </div>
                <h4 className="text-xl font-bold text-white mb-2">
                  {isSaving ? 'Memuat Dokumen dari Cloud...' : 'Belum Ada Scan MPZIS'}
                </h4>
                <p className="text-white/40 max-w-md mb-8">
                  {isSaving ? 'Mohon tunggu sebentar, file berukuran besar sedang diproses.' : 'Silakan upload scan Dokumen MPZIS yang sudah ditandatangani untuk arsip digital.'}
                </p>
                {!isSaving && (
                  <label className={cn(
                    "px-8 py-3 rounded-xl text-[10px] font-bold transition-all shadow-xl flex items-center gap-2 cursor-pointer",
                    "bg-indigo-600 hover:bg-indigo-500 text-white"
                  )}>
                    <Upload className="w-4 h-4" />
                    Upload File Scan
                    <input type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={handleMpzisUpload} disabled={isSaving} />
                  </label>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-6 w-full pb-20">
                {mpzisFiles.map((file, idx) => (
                  <div key={idx} className="flex-1 flex flex-col bg-white/5 rounded-3xl overflow-hidden border border-white/10 p-2 relative shadow-2xl min-h-[600px] h-[800px]">
                    <div className="flex items-center justify-between p-3 bg-black/40 border-b border-white/10 shrink-0">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                          <FileCheck className="w-4 h-4 text-emerald-400" />
                        </div>
                        <span className="text-[10px] font-bold text-white uppercase">HASIL SCAN MPZIS {mpzisFiles.length > 1 ? `(HLM ${idx + 1})` : ''}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => downloadFile(file.data, file.name)}
                          className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-500 transition-all"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download
                        </button>
                        <button 
                          onClick={() => {
                            if(confirm(`Hapus Halaman ${idx+1} dari Cloud?`)) removeMpzisFile(idx);
                          }}
                          disabled={isSaving}
                          className="flex items-center gap-2 px-4 py-1.5 bg-red-500 text-white rounded-lg text-[10px] font-bold hover:bg-red-600 transition-all disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Hapus
                        </button>
                      </div>
                    </div>

                    {file.data.startsWith('data:application/pdf') ? (
                      <object 
                        data={file.data} 
                        type="application/pdf"
                        className="w-full h-full rounded-b-2xl bg-white"
                      >
                        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                          <p className="text-white font-bold mb-2 text-lg">Pratinjau Gagal Dimuat</p>
                          <p className="text-white/40 text-[10px] mb-8">Browser Anda mungkin memblokir pratinjau otomatis untuk file PDF.</p>
                          <button 
                            onClick={() => downloadFile(file.data, file.name)}
                            className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-xl shadow-indigo-500/20"
                          >
                            Unduh Dokumen Secara Manual
                          </button>
                        </div>
                      </object>
                    ) : (
                      <div className="w-full h-full rounded-b-2xl bg-black/50 p-4 flex items-center justify-center overflow-auto">
                        <img src={file.data} alt={file.name} className="max-w-full max-h-full object-contain shadow-2xl rounded-lg" />
                      </div>
                    )}
                  </div>
                ))}
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
                  <p className="text-slate-400 text-[10px]">Sesuaikan branding dan logo lembaga Anda secara global</p>
                </div>
              </div>

              <div className="space-y-6">
                {/* Logo Upload Section */}
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-slate-300">Logo Lembaga</label>
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
                          <span className="text-white text-[10px] font-bold">Ganti Logo</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-slate-500 mb-2 group-hover:text-amber-500 transition-colors" />
                        <span className="text-slate-400 text-[10px] group-hover:text-amber-400">Klik untuk upload logo</span>
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
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nama Lembaga (Utama)</label>
                    <input 
                      type="text" 
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500 transition-colors bg-slate-950"
                      value={templateConfig.institution}
                      onChange={(e) => setTemplateConfig(p => ({ ...p, institution: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Region / Wilayah</label>
                    <input 
                      type="text" 
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500 transition-colors bg-slate-950"
                      value={templateConfig.region}
                      onChange={(e) => setTemplateConfig(p => ({ ...p, region: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Deskripsi Lembaga (Bottom)</label>
                  <input 
                    type="text" 
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500 transition-colors bg-slate-950"
                    value={templateConfig.subText}
                    onChange={(e) => setTemplateConfig(p => ({ ...p, subText: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Logo Size (Height px)</label>
                    <div className="flex items-center gap-3">
                      <input 
                        type="range" 
                        min="20" 
                        max="120" 
                        className="flex-1 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        value={templateConfig.logoSize}
                        onChange={(e) => setTemplateConfig(p => ({ ...p, logoSize: Number(e.target.value) }))}
                      />
                      <span className="text-white font-mono text-[10px] w-12 text-right">{templateConfig.logoSize}px</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Base Font Size (pt)</label>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => setTemplateConfig(p => ({ ...p, fontSize: Math.max(6, p.fontSize - 1) }))}
                        className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-lg text-white"
                      >-</button>
                      <span className="text-white font-mono text-[10px] w-8 text-center">{templateConfig.fontSize}</span>
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

        {/* Sidebar Controls */}
        <div className="w-[320px] bg-slate-900 border-l border-white/10 p-6 hidden lg:flex flex-col gap-6 print:hidden">
          <div className="space-y-4">

            <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
              <div className="flex items-center gap-3 mb-4">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center",
                  mpzisFiles.length > 0 ? "bg-green-500/20 text-green-400" : "bg-white/5 text-white/20"
                )}>
                   <FileCheck className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-white text-[10px] font-bold leading-none mb-1">Scan Tertanda</p>
                  <p className="text-[10px] text-white/40">{isSaving ? 'Memuat...' : (mpzisFiles.length > 0 ? 'Tersedia di Cloud' : 'Belum diunggah')}</p>
                </div>
              </div>
              
              <div className="flex gap-2">
                <label className={cn(
                  "flex-1 flex items-center justify-center gap-2 text-[10px] font-bold py-2 rounded-lg cursor-pointer transition-all",
                  isSaving ? "bg-slate-700 text-white/40 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-500 text-white"
                )}>
                  {isSaving ? <div className="w-3 h-3 border-2 border-white/50 border-t-transparent animate-spin rounded-full" /> : <Upload className="w-3.5 h-3.5" />}
                  Upload
                  <input type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={handleMpzisUpload} disabled={isSaving} />
                </label>
                
                {mpzisFiles.length > 0 && (
                  <button 
                    disabled={isSaving}
                    onClick={() => {
                      if(confirm('Hapus halaman terakhir dari Cloud?')) removeMpzisFile(mpzisFiles.length - 1);
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

            <button 
              onClick={onClose}
              className="w-full py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-[10px] font-bold transition-all border border-white/10"
            >
              Tutup Pratinjau
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
