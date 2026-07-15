import React, { useState, useEffect, useRef } from 'react';
import { Recipient } from '../types';
import { 
  Printer, X, FileText, CheckSquare, Square, 
  Image as ImageIcon, Upload, Edit3, Plus, Trash2,
  FileCheck, ExternalLink, AlertCircle, ChevronRight, Download, Eye,
  ClipboardList, Loader2, Bold, Italic, Underline, List, AlignLeft, AlignCenter, AlignRight, Type,
  Layout, Save, FilePlus, Settings, AlertTriangle, CheckCircle, Minus
} from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { cn, compressImage, isBase64SizeValid } from '../lib/utils';
import { PPDRecord } from '../types';
import * as storage from '../lib/storage';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

interface EPPDTemplateProps {
  recipient: Recipient;
  lampiranItems?: Recipient[];
  records: PPDRecord[];
  onSaveRecord: (record: Omit<PPDRecord, 'id' | 'createdAt'>) => void;
  onDeleteRecord: (id: string) => void;
  onClose: () => void;
  isEmbedded?: boolean;
}

function chunkArray<T>(array: T[], size: number): T[][] {
  if (!array || array.length === 0) return [[]];
  const chunked: T[][] = [];
  let index = 0;
  while (index < array.length) {
    chunked.push(array.slice(index, size + index));
    index += size;
  }
  return chunked;
}

export default function EPPDTemplate({ recipient, lampiranItems, records, onSaveRecord, onDeleteRecord, onClose, isEmbedded }: EPPDTemplateProps) {
  const [logo, setLogo] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [viewMode, setViewMode] = useState<'template' | 'scan'>('template');
  const [isDesignMode, setIsDesignMode] = useState(false);
  const [isConfigMode, setIsConfigMode] = useState(false);
  const [scale, setScale] = useState(0.85);
  
  const [templateConfig, setTemplateConfig] = useState({
    logo: '',
    institution: 'BAZNAS',
    region: 'KABUPATEN SIAK',
    subText: 'Badan Amil Zakat Nasional',
    fontSize: 9,
    logoSize: 48,
    printMarginTop: 15,
    printMarginRight: 15,
    printMarginBottom: 15,
    printMarginLeft: 15,
    printMarginTopLampiran: 15,
    printMarginRightLampiran: 15,
    printMarginBottomLampiran: 15,
    printMarginLeftLampiran: 15
  });

  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [signedPdfUrl, setSignedPdfUrl] = useState<string | null>(null);
  const [signedPdfBlobUrl, setSignedPdfBlobUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [paperSize, setPaperSize] = useState<'A4' | 'F4'>('F4');
  const [loadedRecipientId, setLoadedRecipientId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [showExitEditWarning, setShowExitEditWarning] = useState(false);
  const [toastMessage, setToastMessage] = useState<{title: string; message: string; type: 'success'|'error'} | null>(null);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Fetch scan from subcollection if it exists but isn't loaded
  useEffect(() => {
    const fetchScan = async () => {
      if (recipient.hasSignedPdf && !signedPdfUrl) {
        setIsLoadingFile(true);
        try {
          const { getRecipientFile } = await import('../firebase');
          const base64 = await getRecipientFile(recipient.id, 'eppd');
          if (base64) {
            setSignedPdfUrl(base64);
          } else {
            // Clear stale flag
            const { updateRecipientPdf } = await import('../firebase');
            await updateRecipientPdf(recipient.id, null);
          }
        } catch (error) {
          console.error("Failed to fetch scan", error);
        } finally {
          setIsLoadingFile(false);
        }
      }
    };
    fetchScan();
  }, [recipient.id, recipient.hasSignedPdf]);

  // Convert Base64 to Blob URL for better browser compatibility
  useEffect(() => {
    if (signedPdfUrl && signedPdfUrl.startsWith('data:application/pdf')) {
      const createBlobUrl = async () => {
        try {
          const response = await fetch(signedPdfUrl);
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
      setSignedPdfBlobUrl(null);
    }
  }, [signedPdfUrl]);

  // Listen to real-time updates for global configuration
  useEffect(() => {
    const configDoc = doc(db, 'settings', 'eppd_template');
    const unsubscribe = onSnapshot(configDoc, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setTemplateConfig(prev => ({
          ...prev,
          ...data,
          fontSize: data.fontSize || 9,
          logoSize: data.logoSize || 48,
          printMarginTop: data.printMarginTop !== undefined ? Number(data.printMarginTop) : 15,
          printMarginRight: data.printMarginRight !== undefined ? Number(data.printMarginRight) : 15,
          printMarginBottom: data.printMarginBottom !== undefined ? Number(data.printMarginBottom) : 15,
          printMarginLeft: data.printMarginLeft !== undefined ? Number(data.printMarginLeft) : 15,
          printMarginTopLampiran: data.printMarginTopLampiran !== undefined ? Number(data.printMarginTopLampiran) : 15,
          printMarginRightLampiran: data.printMarginRightLampiran !== undefined ? Number(data.printMarginRightLampiran) : 15,
          printMarginBottomLampiran: data.printMarginBottomLampiran !== undefined ? Number(data.printMarginBottomLampiran) : 15,
          printMarginLeftLampiran: data.printMarginLeftLampiran !== undefined ? Number(data.printMarginLeftLampiran) : 15
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
      const configDoc = doc(db, 'settings', 'eppd_template');
      await setDoc(configDoc, {
        ...templateConfig,
        updatedAt: new Date().toISOString()
      });
      alert('Konfigurasi template berhasil disimpan secara global!');
      setIsConfigMode(false);
    } catch (error) {
      console.error('Error saving config:', error);
      alert('Gagal menyimpan konfigurasi. Pastikan Anda memiliki izin.');
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Dropdown modes
  const [divisiMode, setDivisiMode] = useState<'select' | 'input'>(() => {
    const saved = localStorage.getItem(`ppd_data_${recipient.id}`);
    if (saved) {
      const data = JSON.parse(saved);
      const options = ["Pendistribusian", "Pendayagunaan"];
      return options.includes(data.division) ? 'select' : 'input';
    }
    return 'select';
  });

  const [pemohonMode, setPemohonMode] = useState<'select' | 'input'>(() => {
    const saved = localStorage.getItem(`ppd_data_${recipient.id}`);
    if (saved) {
      const data = JSON.parse(saved);
      const options = ["Satriyanda, SE", "Muslikhun Thohari, S.I.Kom.", "Ikhlasul Amal, M.Ag.", "Dina Alvinda, S.Pd."];
      return options.includes(data.requestedBy) ? 'select' : 'input';
    }
    return 'select';
  });

  // Budget Dictionary State
  const [budgetList, setBudgetList] = useState<{code: string, label: string}[]>(() => {
    const saved = localStorage.getItem('baznas_ppd_budget_list');
    return saved ? JSON.parse(saved) : [];
  });
  
  // formating helpers
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

  // Local state for PPD data with persistence per recipient
  const [ppdData, setPpdData] = useState(() => {
    let defaultNoPpd = '';
    const bidCode = getBidangCode(recipient.sector || '');
    const dateObj = new Date();
    const rmMonth = getRomanMonth(dateObj.getMonth() + 1);
    
    let maxCounter = 1;
    const localSaved = localStorage.getItem('eppd_seq_counter');
    if (localSaved) {
      maxCounter = parseInt(localSaved, 10);
    }
    if (records && records.length > 0) {
      records.forEach(r => {
        if (r.no) {
          const match = r.no.match(/\.(\d+)$/);
          if (match) {
            const seqVal = parseInt(match[1], 10);
            if (seqVal >= maxCounter) {
              maxCounter = seqVal + 1;
            }
          }
        }
      });
    }
    const seqStr = String(maxCounter).padStart(3, '0');
    // E.g. "24.SC.2026.VI.001"
    defaultNoPpd = `24.${bidCode}.${dateObj.getFullYear()}.${rmMonth}.${seqStr}`;
    
    return {
      no: `${recipient.registrationId}`,
      noPpd: defaultNoPpd,
    requestedBy: '',
    division: 'Pendistribusian',
    function: 'Staf',
    date: new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    amount: 0,
    proposeFor: '',
    paidFor: '',
    refNo: '-',
    requestDisbursement: '',
    transferDetails: '',
    transactionType: recipient.transactionType || 'Pembayaran',
    rows: [
      { id: Date.now().toString() + Math.random().toString(36).substring(2), budgetCode: recipient.budgetCode || '', classification: recipient.budgetName || '', total: 0 }
    ],
    signers: {
      staff: { name: '', role: 'Staf' },
      kabid: { name: 'Andreas Supriadi, S.I.Kom', role: 'Kabid. PDP' },
      waka: { name: 'H. Sukijo', role: 'Waka II. PDP' },
      ketua: { name: 'H. Samparis Bin Tatan, S.Pd.I', role: 'Ketua' },
      finance1: { name: '', role: 'Pemeriksa' },
      finance2: { name: '', role: 'Disetujui' }
    },
    note: '',
    noteFinance: '',
    attachment: '',
    lampiranRows: [
      {
        id: Date.now().toString() + Math.random().toString(36).substring(2),
        nama: recipient.name || '',
        nik: recipient.nik || '',
        noHp: recipient.contact || '',
        kecamatan: recipient.district || '',
        rekening: `${recipient.bankAccountNo || ''} ${recipient.bankName || ''} ${recipient.bankAccountHolder || ''}`.trim(),
        alamat: recipient.address || '',
        kampung: recipient.kampung || '',
        jumlah: recipient.amountProposed || 0
      }
    ],
    // Label customizations for Word-like experience
    labels: {
      headerTitle: 'PERMOHONAN PENGELUARAN DANA',
      headerSubtitle: '(E-PPD)',
      requestedBy: 'Pemohon',
      division: 'Divisi',
      function: 'Jabatan',
      date: 'Tanggal',
      amountLines: 'Jumlah Dana :',
      proposeFor: 'Tujuan Pengajuan :',
      paidFor: 'Dibayarkan kepada :',
      refNo: 'Mengacu pada NO. PPD :',
      disbursement: 'Mohon Dana Dikeluarkan',
      transfer: 'Transfer : No. Rek / Bank / Atas nama :',
      footerDate: 'Tanggal',
      footerSign: 'Tanda Tangan',
      footerName: 'Nama',
      footerFunction: 'Jabatan',
      footerFinance: 'Divisi Keuangan',
      footerAttachment: 'Lampiran'
    }
  };
  });

  // Sync state when recipient changes
  useEffect(() => {
    const loadSaved = async () => {
      setIsLoaded(false); // Reset loaded state while fetching
      
      let savedLogo = null;
      try {
        const { getDoc, doc: fsDoc } = await import('firebase/firestore');
        
        // 1. Try global settings
        const snap = await getDoc(fsDoc(db, 'settings', 'app'));
        if (snap.exists() && snap.data().logoUrl) {
          savedLogo = snap.data().logoUrl;
        }

        // 2. Try Survey template (which has stable cloud logo uploads)
        if (!savedLogo) {
          const surveySnap = await getDoc(fsDoc(db, 'settings', 'survey_template'));
          if (surveySnap.exists() && surveySnap.data().logo) {
            savedLogo = surveySnap.data().logo;
          }
        }

        // 3. Try E-PPD template config itself
        if (!savedLogo) {
          const eppdSnap = await getDoc(fsDoc(db, 'settings', 'eppd_template'));
          if (eppdSnap.exists() && eppdSnap.data().logo) {
            savedLogo = eppdSnap.data().logo;
          }
        }

        // 4. Try MPZIS template config
        if (!savedLogo) {
          const mpzisSnap = await getDoc(fsDoc(db, 'settings', 'mpzis_template'));
          if (mpzisSnap.exists() && mpzisSnap.data().logo) {
            savedLogo = mpzisSnap.data().logo;
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
        console.error("Failed to load global logo dynamically from Cloud Firestore in EPPDTemplate:", err);
      }

      if (!savedLogo) {
        savedLogo = await storage.getItem('baznas_logo');
      }
      setLogo(savedLogo);

      // Try Cloud Firestore first to ensure the latest data from other devices/roles is loaded
      let savedData = null;
      try {
        const { getRecipientTemplateData } = await import('../firebase');
        savedData = await getRecipientTemplateData(recipient.id, 'eppd');
        if (savedData) {
          await storage.setItem(`ppd_data_${recipient.id}`, savedData);
        }
      } catch (e) {
        console.error("Cloud fetch failed, trying local storage fallback", e);
      }

      // If not available from cloud, fallback to local storage
      if (!savedData) {
        savedData = await storage.getItem(`ppd_data_${recipient.id}`);
      }

      const itemsToUse = lampiranItems && lampiranItems.length > 0 ? lampiranItems : [recipient];
      const initialLampiranRows = itemsToUse.map(r => ({
        id: Date.now().toString() + Math.random().toString(36).substring(2),
        nama: r.name || '',
        nik: r.nik || '',
        noHp: r.contact || '',
        kecamatan: r.district || '',
        rekening: `${r.bankAccountNo || ''} ${r.bankName || ''} ${r.bankAccountHolder || ''}`.trim(),
        alamat: r.address || '',
        kampung: r.kampung || '',
        jumlah: r.amountProposed || 0
      }));

      if (savedData) {
        const parsed = typeof savedData === 'string' ? JSON.parse(savedData) : savedData;
        if (!parsed.noPpd || parsed.noPpd.trim() === '' || !parsed.noPpd.startsWith('24.') || parsed.noPpd.includes('BDG.')) {
          let maxCounter = 1;
          const localSaved = localStorage.getItem('eppd_seq_counter');
          if (localSaved) {
            maxCounter = parseInt(localSaved, 10);
          }
          if (records && records.length > 0) {
            records.forEach(r => {
              if (r.no) {
                const match = r.no.match(/\.(\d+)$/);
                if (match) {
                  const seqVal = parseInt(match[1], 10);
                  if (seqVal >= maxCounter) {
                    maxCounter = seqVal + 1;
                  }
                }
              }
            });
          }
          const seqStr = String(maxCounter).padStart(3, '0');
          if (parsed.noPpd && parsed.noPpd.includes('BDG.')) {
            parsed.noPpd = parsed.noPpd.replace(/BDG\.\d/g, getBidangCode(recipient.sector || ''));
          } else {
            parsed.noPpd = `24.${getBidangCode(recipient.sector || '')}.${new Date().getFullYear()}.${getRomanMonth(new Date().getMonth() + 1)}.${seqStr}`;
          }
        }
        if (parsed.labels) {
          if (parsed.labels.division === 'Divisi -' || parsed.labels.division === 'Divisi :') parsed.labels.division = 'Divisi';
          if (parsed.labels.date === 'Tanggal -' || parsed.labels.date === 'Tanggal :') parsed.labels.date = 'Tanggal';
          if (parsed.labels.requestedBy === 'Pemohon :') parsed.labels.requestedBy = 'Pemohon';
          if (parsed.labels.function === 'Jabatan :') parsed.labels.function = 'Jabatan';
        }
        
        if (parsed.function && parsed.function.includes('Penanggung Jawab')) {
          parsed.function = 'Staf';
        }
        if (parsed.signers) {
          if (parsed.signers.staff && parsed.signers.staff.role && parsed.signers.staff.role.includes('Penanggung Jawab')) {
            parsed.signers.staff.role = 'Staf';
          }
          if (parsed.signers.kabid && parsed.signers.kabid.role && parsed.signers.kabid.role.includes('Pendistribusian')) {
            parsed.signers.kabid.role = 'Kabid. PDP';
          }
          if (parsed.signers.lampiranPembuatRole && parsed.signers.lampiranPembuatRole.includes('Penanggung Jawab')) {
            parsed.signers.lampiranPembuatRole = 'Staf';
          }
          if (parsed.signers.lampiranPemeriksaRole && parsed.signers.lampiranPemeriksaRole.includes('Pendistribusian')) {
            parsed.signers.lampiranPemeriksaRole = 'Kabid. PDP';
          }
        }

        const calculatedTotalAmount = itemsToUse.reduce((sum, r) => sum + (Number(r.amountProposed) || 0), 0);
        
        parsed.amount = calculatedTotalAmount;
        if (parsed.rows && parsed.rows.length === 1) {
          parsed.rows[0].total = calculatedTotalAmount;
          if (recipient.budgetCode && recipient.budgetName) {
            parsed.rows[0].budgetCode = recipient.budgetCode;
            parsed.rows[0].classification = recipient.budgetName;
          }
        }
        
        if (recipient.transactionType) {
           parsed.transactionType = recipient.transactionType;
        }

        const isMultiple = itemsToUse.length > 1;
        const primaryItem = itemsToUse[0] || recipient;
        const currentRekeningStr = `${primaryItem.bankAccountNo || ''} / ${primaryItem.bankName || ''} / ${primaryItem.bankAccountHolder || ''}`.replace(/^\s*\/\s*\/\s*$/, '').trim();
        const hasRekening = itemsToUse.some(r => r.bankAccountNo && r.bankAccountNo.trim() !== '');
        if (!parsed.requestDisbursement) {
          parsed.requestDisbursement = hasRekening ? 'Transfer' : 'Tunai';
        }
        
        if (!isMultiple) {
          parsed.transferDetails = currentRekeningStr;
          parsed.paidFor = itemsToUse[0]?.penerimaDana || itemsToUse[0]?.name || recipient.penerimaDana || recipient.name || '';
        } else {
          if (!parsed.transferDetails || parsed.transferDetails.trim() === '' || parsed.transferDetails === currentRekeningStr) {
             parsed.transferDetails = 'Terlampir';
          }
          parsed.paidFor = 'Terlampir';
        }

        // Always update lampiran from selection if it was provided, or if none exists
        // This ensures name and amount updates in subRecipients reflect here too
        parsed.lampiranRows = initialLampiranRows;
        
        if (recipient.tujuanPengajuan) {
          parsed.proposeFor = recipient.tujuanPengajuan;
          parsed.attachment = recipient.tujuanPengajuan;
        } else if (!parsed.proposeFor) {
          parsed.proposeFor = recipient.purpose || '';
          parsed.attachment = recipient.purpose || '';
        }

        setPpdData(parsed);
      } else {
        const sector = (recipient.sector || '').toLowerCase();
        let defaultRequestedBy = '';
        if (sector.includes('cerdas') || sector.includes('dakwah')) {
          defaultRequestedBy = 'Satriyanda, SE';
        } else if (sector.includes('peduli')) {
          defaultRequestedBy = 'Muslikhun Thohari, S.I.Kom.';
        } else if (sector.includes('sehat')) {
          defaultRequestedBy = 'Dina Alvinda, S.Pd.';
        } else if (sector.includes('sejahtera')) {
          defaultRequestedBy = 'Ikhlasul Amal, M.Ag.';
        }

        const isMultiple = itemsToUse.length > 1;
        const proposeForStr = recipient.tujuanPengajuan || recipient.purpose || '';
        const paidForStr = isMultiple ? 'Terlampir' : (itemsToUse[0]?.penerimaDana || itemsToUse[0]?.name || recipient.penerimaDana || recipient.name || '');
        const hasRekening = itemsToUse.some(r => r.bankAccountNo && r.bankAccountNo.trim() !== '');
        const transactionTypeDefault = hasRekening ? 'Transfer' : 'Tunai';
        let transferDetailsDefault = '';
        if (transactionTypeDefault === 'Transfer') {
           const primaryItem = itemsToUse[0] || recipient;
           transferDetailsDefault = isMultiple ? 'Terlampir' : `${primaryItem.bankAccountNo || ''} / ${primaryItem.bankName || ''} / ${primaryItem.bankAccountHolder || ''}`.replace(/^\s*\/\s*\/\s*$/, '').trim();
        }

        const calculatedTotalAmount = itemsToUse.reduce((sum, r) => sum + (Number(r.amountProposed) || 0), 0);

        let maxCounter = 1;
        const localSaved = localStorage.getItem('eppd_seq_counter');
        if (localSaved) {
          maxCounter = parseInt(localSaved, 10);
        }
        if (records && records.length > 0) {
          records.forEach(r => {
            if (r.no) {
              const match = r.no.match(/\.(\d+)$/);
              if (match) {
                const seqVal = parseInt(match[1], 10);
                if (seqVal >= maxCounter) {
                  maxCounter = seqVal + 1;
                }
              }
            }
          });
        }
        const seqStr = String(maxCounter).padStart(3, '0');
        const defaultNoPpd = `24.${getBidangCode(recipient.sector || '')}.${new Date().getFullYear()}.${getRomanMonth(new Date().getMonth() + 1)}.${seqStr}`;

        setPpdData({
          no: `${recipient.registrationId}`,
          noPpd: defaultNoPpd,
          requestedBy: defaultRequestedBy,
          division: 'Pendistribusian',
          function: 'Staf',
          date: new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }),
          amount: calculatedTotalAmount,
          proposeFor: proposeForStr,
          paidFor: paidForStr,
          refNo: '-',
          requestDisbursement: transactionTypeDefault,
          transferDetails: transferDetailsDefault,
          transactionType: recipient.transactionType || 'Pembayaran',
          rows: [
            { id: Date.now().toString() + Math.random().toString(36).substring(2), budgetCode: recipient.budgetCode || '', classification: recipient.budgetName || '', total: calculatedTotalAmount }
          ],
          signers: {
            staff: { name: '', role: 'Staf' },
            kabid: { name: 'Andreas Supriadi, S.IKom', role: 'Kabid. PDP' },
            waka: { name: 'H. Sukijo', role: 'Waka II. PDP' },
            ketua: { name: 'H. Samparis Bin Tatan, S.Pd.I', role: 'Ketua' },
            finance1: { name: '', role: 'Pemeriksa' },
            finance2: { name: '', role: 'Disetujui' }
          },
          note: '',
          noteFinance: '',
          attachment: proposeForStr,
          lampiranRows: initialLampiranRows
        });
      }

      setLoadedRecipientId(recipient.id);
      setIsLoaded(true);

      const savedPdf = await storage.getItem(`ppd_signed_pdf_${recipient.id}`);
      setSignedPdfUrl(savedPdf);
      
      // Reset modes
      const optionsDiv = ["Pendistribusian", "Pendayagunaan"];
      const optionsPem = ["Satriyanda, SE", "Muslikhun Thohari, S.I.Kom.", "Ikhlasul Amal, M.Ag.", "Dina Alvinda, S.Pd."];
      
      if (savedData) {
        let data = typeof savedData === 'string' ? JSON.parse(savedData) : savedData;
        
        // Auto-assign requestedBy if it was empty, based on sector
        if (!data.requestedBy || data.requestedBy.trim() === '') {
          const sector = (recipient.sector || '').toLowerCase();
          if (sector.includes('cerdas') || sector.includes('dakwah')) {
            data.requestedBy = 'Satriyanda, SE';
          } else if (sector.includes('peduli')) {
            data.requestedBy = 'Muslikhun Thohari, S.I.Kom.';
          } else if (sector.includes('sehat')) {
            data.requestedBy = 'Dina Alvinda, S.Pd.';
          } else if (sector.includes('sejahtera')) {
            data.requestedBy = 'Ikhlasul Amal, M.Ag.';
          }
          // Also save it to trigger sync
          setPpdData(prev => ({...prev, requestedBy: data.requestedBy}));
        }

        setDivisiMode(optionsDiv.includes(data.division) ? 'select' : 'input');
        setPemohonMode(optionsPem.includes(data.requestedBy) ? 'select' : 'input');
      } else {
        setDivisiMode('select');
        setPemohonMode('select');
      }
    };
    loadSaved();
  }, [
    recipient.id,
    recipient.name,
    recipient.amountProposed,
    recipient.kampung,
    recipient.district,
    recipient.bankAccountNo,
    recipient.bankName,
    recipient.bankAccountHolder,
    recipient.sector,
    recipient.purpose,
    recipient.tujuanPengajuan
  ]);

  // Save changes to storage automatically
  useEffect(() => {
    if (!isLoaded || loadedRecipientId !== recipient.id) return;
    
    const saveData = async () => {
      if (recipient.id.startsWith('TBD-')) {
        setSaveStatus('saved');
        return;
      }
      setSaveStatus('saving');
      try {
        const match = ppdData.noPpd?.match(/\.(\d+)$/);
        if (match) {
          const seq = parseInt(match[1], 10);
          const currentCounter = parseInt(localStorage.getItem('eppd_seq_counter') || '1', 10);
          if (seq >= currentCounter) {
            localStorage.setItem('eppd_seq_counter', String(seq + 1));
          }
        }
        await storage.setItem(`ppd_data_${recipient.id}`, ppdData);
        const { saveRecipientTemplateData } = await import('../firebase');
        await saveRecipientTemplateData(recipient.id, 'eppd', ppdData);
        setSaveStatus('saved');
      } catch (e) {
        console.error("Save failed", e);
        setSaveStatus('error');
      }
    };

    const timer = setTimeout(saveData, 1000);
    return () => clearTimeout(timer);
  }, [ppdData, recipient.id, isLoaded, loadedRecipientId]);

  const handleSavePdfToServer = async (base64: string | null) => {
    setIsUploading(true);
    try {
      const { updateRecipientPdf } = await import('../firebase');
      await updateRecipientPdf(recipient.id, base64);
      setSignedPdfUrl(base64);
    } catch (error: any) {
      console.error(error);
      alert('Gagal menyimpan ke Cloud. ' + (error.message.includes('quota') ? 'Quota storage penuh.' : 'File mungkin terlalu besar (>1MB).'));
    } finally {
      setIsUploading(false);
    }
  };

  // Helper to convert number to Indonesian words
  const terbilang = (n: number): string => {
    if (n === 0) return 'Nol Rupiah';
    
    const helper = (num: number): string => {
      const units = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
      if (num === 0) return '';
      if (num < 12) return units[num];
      if (num < 20) return units[num - 10] + ' Belas';
      if (num < 100) return (num < 20 ? units[num-10] + ' Belas' : (Math.floor(num / 10) === 1 ? 'Sepuluh' : units[Math.floor(num / 10)]) + ' Puluh ' + helper(num % 10));
      if (num < 200) return 'Seratus ' + helper(num - 100);
      if (num < 1000) return (Math.floor(num / 100) === 1 ? 'Seratus' : units[Math.floor(num / 100)]) + ' Ratus ' + helper(num % 100);
      if (num < 2000) return 'Seribu ' + helper(num - 1000);
      if (num < 1000000) return helper(Math.floor(num / 1000)) + ' Ribu ' + helper(num % 1000);
      if (num < 1000000000) return helper(Math.floor(num / 1000000)) + ' Juta ' + helper(num % 1000000);
      return '';
    };
    
    // Indonesian specific grammar for "Puluh" and "Ratus" with "Satu"
    const fixIndonesian = (str: string) => {
      return str
        .replace(/Satu Puluh/g, 'Sepuluh')
        .replace(/Satu Ratus/g, 'Seratus')
        .replace(/Satu Ribu/g, 'Seribu') // though handled in logic, sometimes needed for consistency
        .replace(/\s+/g, ' ')
        .trim();
    };

    return fixIndonesian(helper(n)) + ' Rupiah';
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    window.print();
  };

  const handleLoadRecord = (record: PPDRecord) => {
    // Basic implementation to load record data back into editor if needed
    // For now, we update the main fields from the record
    setPpdData(prev => ({
      ...prev,
      no: record.no,
      date: record.date,
      requestedBy: record.requestedBy,
      amount: record.amount,
      proposeFor: record.proposeFor
    }));
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
          await setDoc(fsDoc(db, 'settings', 'eppd_template'), {
            logo: base64
          }, { merge: true });
        } catch (err) {
          console.error("Failed to sync logo inside EPPDTemplate:", err);
        }
      };
      reader.readAsDataURL(file);
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

        if (!getGoogleAccessToken() && !isBase64SizeValid(base64)) {
          alert('File scan terlalu besar. Silakan gunakan resolusi lebih rendah atau file yang lebih kecil (Maksimal ~700KB setelah kompresi) atau hubungkan Google Drive Anda.');
          setIsUploading(false);
          return;
        }

        setSignedPdfUrl(base64);
        await storage.setItem(`ppd_signed_pdf_${recipient.id}`, base64);
        await handleSavePdfToServer(base64);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Scan upload error:', error);
      setIsUploading(false);
    }
  };

  const openPdfInNewTab = () => {
    const url = signedPdfBlobUrl || signedPdfUrl;
    if (!url) return;
    const win = window.open();
    if (win) {
      win.document.write(`
        <html>
          <body style="margin:0; background: #333;">
            <embed width="100%" height="100%" src="${url}" type="application/pdf">
          </body>
        </html>
      `);
    } else {
      alert('Pop-up diblokir. Silahkan izinkan pop-up untuk melihat PDF.');
    }
  };

  const saveBudgetDictionary = (newList: {code: string, label: string}[]) => {
    setBudgetList(newList);
    localStorage.setItem('baznas_ppd_budget_list', JSON.stringify(newList));
  };

  const totalAmount = ppdData.rows.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
  const totalLampiran = ppdData.lampiranRows?.reduce((sum, row) => sum + (Number(row.jumlah) || 0), 0) || 0;

  const transactionTypes = ['Uang Muka', 'Reimbursment', 'Pembayaran', 'Piutang Penyaluran', 'Bank Program', 'Lain-lain'];

  const removeBudget = (code: string) => {
    const newList = budgetList.filter(b => b.code !== code);
    saveBudgetDictionary(newList);
  };

  return (
    <div className={cn(
      "eppd-template-overlay flex flex-col print:relative print:overflow-visible print:h-auto print:p-0 print:bg-white print:block overflow-hidden",
      isEmbedded ? "relative w-full h-auto overflow-visible" : "fixed inset-0 bg-black/60 backdrop-blur-md z-50 overflow-hidden"
    )}>
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
          <CheckCircle className="w-6 h-6 text-emerald-500" />
          <div className="flex flex-col">
            <span className="text-white font-bold text-sm">{toastMessage.title}</span>
            <span className="text-slate-300 text-xs">{toastMessage.message}</span>
          </div>
        </div>
      )}

      {/* Toolbar */}
      {!isEmbedded && (
        <div className="bg-[#1a1c2c] border-b border-white/10 p-3 flex items-center justify-between print:hidden shrink-0">
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
              <FileText className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="hidden sm:block">
              <h3 className="font-bold text-white text-sm leading-tight">E-PPD</h3>
              <div className="flex items-center gap-2">
                {saveStatus === 'saving' && <span className="text-white/40 animate-pulse text-[8px] uppercase tracking-tighter bg-white/5 px-1.5 py-0.5 rounded border border-white/5">● Menyimpan...</span>}
                {saveStatus === 'saved' && <span className="text-emerald-400 text-[8px] uppercase tracking-tighter bg-emerald-400/10 px-1.5 py-0.5 rounded border border-emerald-400/10">● Tersimpan</span>}
                {saveStatus === 'error' && <span className="text-red-400 text-[8px] uppercase tracking-tighter bg-red-400/10 px-1.5 py-0.5 rounded border border-red-400/10">● Gagal</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center gap-2 max-w-xl px-4 overflow-x-auto scrollbar-hide">
          <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 shrink-0 mr-2 items-center">
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
              {signedPdfUrl && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-[#111827]" />
              )}
            </button>
          </div>

          <button 
            onClick={() => {
              setIsDesignMode(!isDesignMode);
              if (isEditing) setIsEditing(false);
              if (isConfigMode) setIsConfigMode(false);
            }}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0",
              isDesignMode 
                ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20" 
                : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border border-white/10"
            )}
          >
            <Layout className="w-4 h-4" />
            {isDesignMode ? "Tutup" : "Desain"}
          </button>

          <button 
            onClick={() => {
              setIsConfigMode(!isConfigMode);
              if (isEditing) setIsEditing(false);
              if (isDesignMode) setIsDesignMode(false);
            }}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0",
              isConfigMode 
                ? "bg-amber-600 text-white shadow-lg shadow-amber-600/20" 
                : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border border-white/10"
            )}
          >
            <Settings className="w-4 h-4" />
            Config
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-1.5 mr-2">
            {records.filter(r => r.recipientId === recipient.id).slice(0, 2).map(record => (
              <button
                key={record.id}
                onClick={() => handleLoadRecord(record)}
                className="px-2 py-1 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/80 rounded-lg text-[9px] font-bold border border-white/5 uppercase transition-all whitespace-nowrap"
              >
                {record.date}
              </button>
            ))}
          </div>

          <button 
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white rounded-xl text-xs font-bold transition-all shrink-0 border border-white/10"
          >
            <Printer className="w-4 h-4" /> Cetak
          </button>

          <button 
            onClick={() => {
              if (isEditing) {
                setShowExitEditWarning(true);
              } else {
                setIsEditing(true);
              }
            }}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold transition-all shrink-0 border",
              isEditing 
                ? "bg-amber-400 text-amber-900 border-amber-300 hover:bg-amber-300 shadow-amber-500/20" 
                : "bg-slate-700/80 text-white border-white/10 hover:bg-slate-600 backdrop-blur-md"
            )}
          >
            {isEditing ? <FileCheck className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
            {isEditing ? "Selesai Edit" : "Mode Edit"}
          </button>

          <button 
            onClick={async () => {
              let asnafValue = recipient.ashnaf || '-';
              try {
                if (!recipient.id.startsWith('TBD-')) {
                  setSaveStatus('saving');
                  const { saveRecipientTemplateData, getRecipientTemplateData } = await import('../firebase');
                  await saveRecipientTemplateData(recipient.id, 'eppd', ppdData);
                  await storage.setItem(`ppd_data_${recipient.id}`, ppdData);
                  
                  const mpzisData = await getRecipientTemplateData(recipient.id, 'mpzis');
                  if (mpzisData && mpzisData.ashnaf && asnafValue === '-') {
                    asnafValue = mpzisData.ashnaf;
                  }
                }
                setSaveStatus('saved');
              } catch (e) {
                console.error("Save failed", e);
              }
              
              onSaveRecord({
                no: ppdData.noPpd,
                date: ppdData.date,
                requestedBy: ppdData.requestedBy,
                amount: totalAmount,
                proposeFor: ppdData.proposeFor,
                recipientId: recipient.id,
                recipientName: recipient.name,
                recipientNik: recipient.nik,
                asnaf: asnafValue,
                familyStatus: recipient.familyStatus,
                programName: recipient.programName,
                kampung: recipient.kampung,
                district: recipient.district,
                paymentMethod: ppdData.transactionType,
                bankAccountNo: recipient.bankAccountNo,
                bankAccountName: recipient.bankAccountHolder,
                notes: ppdData.note
              });
            }}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 shrink-0"
          >
            <Plus className="w-4 h-4" />
            Simpan
          </button>
          
          <div className="flex items-center gap-3 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10 ml-2 print:hidden">
            <button 
              onClick={() => setScale(Math.max(0.5, scale - 0.1))}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="text-[10px] font-bold text-slate-300 w-8 text-center">{Math.round(scale * 100)}%</span>
            <button 
              onClick={() => setScale(Math.min(1.5, scale + 0.1))}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Document View */}
      <div className={cn(
        "flex-1 flex print:block",
        isEmbedded ? "bg-transparent overflow-visible p-0" : "overflow-hidden bg-slate-900/50 print:bg-white print:overflow-visible"
      )}>
        {viewMode === 'template' ? (
          <>
        {/* Form Panel (Left Side) */}
        {isEditing && (
          <div className="w-[400px] bg-slate-800 border-r border-white/10 overflow-y-auto p-4 flex flex-col gap-6 print:hidden">
            <div className="flex items-center gap-2 text-white border-b border-white/10 pb-4">
              <Plus className="w-5 h-5 text-amber-500" />
              <h4 className="font-bold">Form Pengisian PPD</h4>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-medium text-white/40 block mb-1 font-medium">Divisi/ division :</label>
                {divisiMode === 'select' ? (
                  <select 
                    className="w-full bg-slate-700 border border-white/10 rounded px-2 py-1.5 text-white text-sm"
                    value={ppdData.division}
                    onChange={e => {
                      if (e.target.value === 'Lainnya') {
                        setDivisiMode('input');
                        setPpdData({...ppdData, division: ''});
                      } else {
                        setPpdData({...ppdData, division: e.target.value});
                        localStorage.setItem('ppd_pdp_division', e.target.value);
                      }
                    }}
                  >
                    <option value="">-- Pilih Divisi --</option>
                    <option value="Pendistribusian">Pendistribusian</option>
                    <option value="Pendayagunaan">Pendayagunaan</option>
                    <option value="Lainnya">Lainnya...</option>
                  </select>
                ) : (
                  <div className="flex gap-2">
                    <input 
                      className="flex-1 bg-slate-700 border border-white/10 rounded px-2 py-1.5 text-white text-sm"
                      value={ppdData.division} 
                      placeholder="Masukkan Divisi..."
                      onChange={e => {
                        setPpdData({...ppdData, division: e.target.value});
                        localStorage.setItem('ppd_pdp_division', e.target.value);
                      }}
                    />
                    <button 
                      onClick={() => setDivisiMode('select')}
                      className="px-2 bg-white/10 rounded text-xs text-white"
                    >
                      Batal
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-medium text-white/40 block mb-1 font-medium">Pemohon/ requested by :</label>
                  <select 
                    className="w-full bg-slate-700 border border-white/10 rounded px-2 py-1.5 text-white text-sm"
                    value={ppdData.requestedBy}
                    onChange={e => {
                      setPpdData({...ppdData, requestedBy: e.target.value});
                      localStorage.setItem('ppd_pdp_name', e.target.value);
                    }}
                  >
                    <option value="">-- Pilih Pemohon --</option>
                    <option value="Satriyanda, SE">Satriyanda, SE</option>
                    <option value="Muslikhun Thohari, S.I.Kom.">Muslikhun Thohari, S.I.Kom.</option>
                    <option value="Dina Alvinda, S.Pd.">Dina Alvinda, S.Pd.</option>
                    <option value="Ikhlasul Amal, M.Ag.">Ikhlasul Amal, M.Ag.</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-medium text-white/40 block mb-1 font-medium">Jabatan/ function :</label>
                  <select 
                    className="w-full bg-slate-700 border border-white/10 rounded px-2 py-1.5 text-white text-sm"
                    value={ppdData.function}
                    onChange={e => {
                      setPpdData({...ppdData, function: e.target.value});
                      localStorage.setItem('ppd_pdp_role', e.target.value);
                    }}
                  >
                    <option value="">-- Pilih Jabatan --</option>
                    <option value="Staf">Staf</option>
                    <option value="Kesubid">Kesubid</option>
                    <option value="Kabid">Kabid</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-medium text-white/40 block mb-1 font-medium">Tujuan Pengajuan/ propose for :</label>
                <textarea 
                  className="w-full bg-slate-700 border border-white/10 rounded px-2 py-1.5 text-white text-sm resize-none"
                  rows={2}
                  value={ppdData.proposeFor} 
                  onChange={e => setPpdData({...ppdData, proposeFor: e.target.value, attachment: e.target.value})}
                />
              </div>

              <div>
                <label className="text-[10px] font-medium text-white/40 block mb-1 font-medium">Dibayarkan kepada/ paid for :</label>
                <input 
                  className="w-full bg-slate-700 border border-white/10 rounded px-2 py-1.5 text-white text-sm"
                  value={ppdData.paidFor} 
                  onChange={e => setPpdData({...ppdData, paidFor: e.target.value})}
                />
              </div>

              <div>
                <label className="text-[10px] font-medium text-white/40 block mb-1 font-medium">Mohon dana dikeluarkan :</label>
                <input 
                  className="w-full bg-slate-700 border border-white/10 rounded px-2 py-1.5 text-white text-sm italic font-bold"
                  value={ppdData.requestDisbursement} 
                  onChange={e => setPpdData({...ppdData, requestDisbursement: e.target.value})}
                />
              </div>

              <div>
                <label className="text-[10px] font-medium text-white/40 block mb-1 font-medium">Transfer: No. Rek / Bank / Atas nama :</label>
                <input 
                  className="w-full bg-slate-700 border border-white/10 rounded px-2 py-1.5 text-white text-sm"
                  value={ppdData.transferDetails} 
                  onChange={e => setPpdData({...ppdData, transferDetails: e.target.value})}
                  placeholder="e.g. 12345678 / BANK Riau / Nama"
                />
              </div>

              <div className="bg-slate-900/50 p-2 rounded border border-white/5">
                <label className="text-[10px] font-medium text-white/40 block mb-2 font-medium">Jenis Transaksi :</label>
                <div className="grid grid-cols-2 gap-2">
                  {transactionTypes.map(type => (
                    <button
                      key={type}
                      onClick={() => setPpdData({...ppdData, transactionType: type})}
                      className={cn(
                        "text-[10px] font-medium p-2 rounded border transition-all text-left flex items-center gap-2",
                        ppdData.transactionType === type 
                          ? "bg-amber-500 border-amber-400 text-white" 
                          : "bg-slate-700 border-white/10 text-white/60 hover:border-white/20"
                      )}
                    >
                      {ppdData.transactionType === type ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Kamus / Budget Dictionary Section */}
              <div className="bg-slate-900/40 p-3 rounded-xl border border-white/5 mt-2">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-[10px] font-bold text-white uppercase tracking-wider">Kamus Anggaran</span>
                  </div>
                  <button 
                    onClick={() => {
                      const code = prompt('Kode Anggaran Baru:');
                      const label = prompt('Nama Anggaran Baru:');
                      if (code && label) saveBudgetDictionary([...budgetList, { code, label }]);
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500 hover:text-white transition-all rounded-md text-[9px] font-bold border border-indigo-500/20"
                  >
                    <Plus className="w-2.5 h-2.5" /> Tambah
                  </button>
                </div>

                {budgetList.length > 0 ? (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                    {budgetList.map(b => (
                      <div key={b.code} className="group bg-white/5 border border-white/5 rounded-lg p-1.5 hover:bg-white/10 transition-all">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-col min-w-0">
                            <span className="text-emerald-400 font-bold text-[9px] truncate">{b.code}</span>
                            <span className="text-white/60 text-[9px] truncate leading-tight">{b.label}</span>
                          </div>
                          <button 
                            onClick={() => removeBudget(b.code)}
                            className="p-1 text-white/10 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-3 text-center border border-dashed border-white/10 rounded-lg">
                    <span className="text-[9px] text-white/20 italic">Kamus kosong</span>
                  </div>
                )}
              </div>

              <div className="border-t border-white/10 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px]  text-white/40 font-bold uppercase tracking-wider">Data Anggaran/ Budget</label>
                  <button 
                    onClick={() => {
                        const newRows = [...ppdData.rows, { id: Date.now().toString() + Math.random().toString(36).substring(2), budgetCode: '', classification: '', total: 0 }];
                        setPpdData({...ppdData, rows: newRows});
                    }}
                    className="p-1 hover:bg-white/10 rounded text-amber-500 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-4">
                  {ppdData.rows.map((row, idx) => (
                    <div key={row.id} className="p-3 bg-slate-900/40 rounded border border-white/5 space-y-2 relative group">
                      <button 
                        onClick={() => {
                          if (ppdData.rows.length > 1) {
                            setPpdData({...ppdData, rows: ppdData.rows.filter(r => r.id !== row.id)});
                          }
                        }}
                        className="absolute right-2 top-2 p-1 text-white/20 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      
                      <div>
                        <label className="text-[9px] text-white/40 block mb-1">Kode Anggaran</label>
                        <input 
                          list="budget-codes"
                          className="w-full bg-slate-700 border border-white/10 rounded px-2 py-1 text-white text-xs"
                          value={row.budgetCode} 
                          onBlur={e => {
                            const code = e.target.value;
                            if (code && !budgetList.find(b => b.code === code)) {
                              const newBudget = { code, label: row.classification || 'Budget Baru' };
                              saveBudgetDictionary([...budgetList, newBudget]);
                            }
                          }}
                          onChange={e => {
                            const code = e.target.value;
                            const selected = budgetList.find(b => b.code === code);
                            const newRows = [...ppdData.rows];
                            newRows[idx].budgetCode = code;
                            if (selected) newRows[idx].classification = selected.label;
                            setPpdData({...ppdData, rows: newRows});
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-white/40 block mb-1">Nama Anggaran</label>
                        <textarea 
                          className="w-full bg-slate-700 border border-white/10 rounded px-2 py-1 text-white text-xs resize-none"
                          rows={2}
                          value={row.classification} 
                          onChange={e => {
                            const newRows = [...ppdData.rows];
                            newRows[idx].classification = e.target.value;
                            setPpdData({...ppdData, rows: newRows});
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-white/40 block mb-1">Total (Rp.)</label>
                        <input 
                          type="text"
                          className="w-full bg-slate-700 border border-white/10 rounded px-2 py-1 text-white text-xs font-bold"
                          value={row.total === 0 ? '' : row.total.toLocaleString('id-ID')} 
                          onChange={e => {
                            const newRows = [...ppdData.rows];
                            const val = e.target.value.replace(/\./g, '').replace(/\D/g, '');
                            newRows[idx].total = val === '' ? 0 : Number(val);
                            setPpdData({...ppdData, rows: newRows});
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <datalist id="budget-codes">
              {budgetList.map(b => (
                <option key={b.code} value={b.code}>{b.label}</option>
              ))}
            </datalist>

            <div className="border-t border-white/10 pt-4 flex flex-col gap-3">
              <label className="text-[10px]  text-white/40 font-bold uppercase tracking-wider">Hasil Scan PPD (PDF)</label>
              <div className="flex gap-2">
                <label className={cn(
                  "flex-1 flex items-center justify-center gap-2 text-white text-xs font-bold py-2 rounded cursor-pointer transition-colors shadow-lg shadow-indigo-500/20",
                  isUploading ? "bg-slate-600 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-500"
                )}>
                  {isUploading || isLoadingFile ? <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full" /> : <Upload className="w-3.5 h-3.5" />}
                  {signedPdfUrl ? "Ganti Scan PDF" : "Upload Scan PDF"}
                  <input type="file" className="hidden" accept="application/pdf" onChange={handlePdfUpload} disabled={isUploading || isLoadingFile} />
                </label>
                {signedPdfUrl && (
                  <button 
                    disabled={isUploading}
                    onClick={() => {
                      if(confirm('Hapus file scan dari Cloud?')) handleSavePdfToServer(null);
                    }}
                    className="p-2 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded transition-all disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className={cn(
          "flex-1 flex flex-col items-center print:p-0 print:bg-white print:overflow-visible pb-32",
          isEmbedded ? "p-0 overflow-visible bg-transparent lg:pb-0" : "p-4 md:p-8 overflow-y-auto bg-slate-900"
        )}>
          <style dangerouslySetInnerHTML={{ __html: `
            .eppd-print-page, .lampiran-print-page {
              background-color: white;
            }
            .eppd-print-page {
              width: ${paperSize === 'A4' ? '210mm' : '215.9mm'};
              height: ${paperSize === 'A4' ? '297mm' : '330.2mm'};
              min-height: ${paperSize === 'A4' ? '297mm' : '330.2mm'};
            }
            .lampiran-print-page {
              width: ${paperSize === 'A4' ? '297mm' : '330.2mm'};
              height: ${paperSize === 'A4' ? '210mm' : '215.9mm'};
              min-height: ${paperSize === 'A4' ? '210mm' : '215.9mm'};
            }
            @media print {
              @page {
                size: ${paperSize === 'A4' ? 'A4 portrait' : '215.9mm 330.2mm'};
                margin: 0;
              }
              
              @page lampiran_page {
                size: ${paperSize === 'A4' ? 'A4 landscape' : '330.2mm 215.9mm'};
              }

              .lampiran-print-page {
                page: lampiran_page;
              }
              
              ${!isEmbedded ? `
              #root > div > *:not(.eppd-template-overlay) {
                display: none !important;
              }
              ` : ""}
              #root > div {
                display: block !important;
                height: 100% !important;
                min-height: auto !important;
                overflow: visible !important;
                background-color: white !important;
              }
              body, html, #root {
                background-color: white !important;
                overflow: visible !important;
                height: 100% !important;
                position: static !important;
              }
              body { 
                print-color-adjust: exact;
                -webkit-print-color-adjust: exact;
              }
              .print\\:hidden {
                display: none !important;
              }
              
              .eppd-print-page, .lampiran-print-page {
                page-break-after: always !important;
                break-after: page !important;
                margin: 0 !important;
                border: none !important;
                box-shadow: none !important;
                border-radius: 0 !important;
                box-sizing: border-box !important;
                position: relative !important;
                overflow: hidden !important;
                flex-shrink: 0 !important;
                background-color: white !important;
              }
              
              .eppd-print-page {
                width: 100% !important;
                height: auto !important;
                min-height: auto !important;
                padding-top: ${templateConfig.printMarginTop !== undefined ? templateConfig.printMarginTop : 15}mm !important;
                padding-right: ${templateConfig.printMarginRight !== undefined ? templateConfig.printMarginRight : 15}mm !important;
                padding-bottom: ${templateConfig.printMarginBottom !== undefined ? templateConfig.printMarginBottom : 15}mm !important;
                padding-left: ${templateConfig.printMarginLeft !== undefined ? templateConfig.printMarginLeft : 15}mm !important;
              }

              .lampiran-print-page {
                width: 100% !important;
                height: auto !important;
                min-height: auto !important;
                padding-top: ${templateConfig.printMarginTopLampiran !== undefined ? templateConfig.printMarginTopLampiran : (templateConfig.printMarginTop !== undefined ? templateConfig.printMarginTop : 15)}mm !important;
                padding-right: ${templateConfig.printMarginRightLampiran !== undefined ? templateConfig.printMarginRightLampiran : (templateConfig.printMarginRight !== undefined ? templateConfig.printMarginRight : 15)}mm !important;
                padding-bottom: ${templateConfig.printMarginBottomLampiran !== undefined ? templateConfig.printMarginBottomLampiran : (templateConfig.printMarginBottom !== undefined ? templateConfig.printMarginBottom : 15)}mm !important;
                padding-left: ${templateConfig.printMarginLeftLampiran !== undefined ? templateConfig.printMarginLeftLampiran : (templateConfig.printMarginLeft !== undefined ? templateConfig.printMarginLeft : 15)}mm !important;
              }
              
              .eppd-print-page:last-child, .lampiran-print-page:last-child {
                page-break-after: avoid !important;
                break-after: avoid !important;
              }
            }
          `}} />
          {isConfigMode ? (
            /* CONFIG PANEL VIEW */
            <div className="w-full max-w-2xl space-y-6 my-4 pb-20">
              <div className="bg-slate-850 border border-white/10 rounded-2xl p-8 shadow-2xl bg-slate-900">
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
                        const fileInput = document.getElementById('config-logo-input-eppd');
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
                        id="config-logo-input-eppd" 
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

                  {/* Print Margin Settings Form */}
                  <div className="border-t border-white/5 pt-6 space-y-4">
                    <div>
                      <h4 className="text-sm font-bold text-slate-300">Konfigurasi Margin Cetak (Print Margins)</h4>
                      <p className="text-slate-400 text-xs mt-1">Sesuaikan batas/margin halaman cetak dalam satuan milimeter (mm)</p>
                    </div>

                    <div className="grid grid-cols-2 gap-6 bg-black/20 p-4 rounded-xl border border-white/5">
                      {/* Margin EPPD */}
                      <div className="space-y-4">
                        <span className="text-xs font-bold text-amber-500 block uppercase tracking-wider font-semibold">Template E-PPD</span>
                        <div className="grid grid-cols-2 gap-2.5">
                          <div className="space-y-1">
                            <label className="text-[10px]  text-slate-400 font-bold block uppercase">Atas (Top)</label>
                            <div className="relative">
                              <input 
                                type="number" 
                                min="0" 
                                max="100"
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500 text-center bg-slate-950"
                                value={templateConfig.printMarginTop !== undefined ? templateConfig.printMarginTop : 15}
                                onChange={(e) => setTemplateConfig(p => ({ ...p, printMarginTop: Number(e.target.value) }))}
                              />
                              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-500 pointer-events-none">mm</span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px]  text-slate-400 font-bold block uppercase">Bawah (Bot)</label>
                            <div className="relative">
                              <input 
                                type="number" 
                                min="0" 
                                max="100"
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500 text-center bg-slate-950"
                                value={templateConfig.printMarginBottom !== undefined ? templateConfig.printMarginBottom : 15}
                                onChange={(e) => setTemplateConfig(p => ({ ...p, printMarginBottom: Number(e.target.value) }))}
                              />
                              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-500 pointer-events-none">mm</span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px]  text-slate-400 font-bold block uppercase">Kiri (Left)</label>
                            <div className="relative">
                              <input 
                                type="number" 
                                min="0" 
                                max="100"
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500 text-center bg-slate-950"
                                value={templateConfig.printMarginLeft !== undefined ? templateConfig.printMarginLeft : 15}
                                onChange={(e) => setTemplateConfig(p => ({ ...p, printMarginLeft: Number(e.target.value) }))}
                              />
                              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-500 pointer-events-none">mm</span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px]  text-slate-400 font-bold block uppercase">Kanan (Right)</label>
                            <div className="relative">
                              <input 
                                type="number" 
                                min="0" 
                                max="100"
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500 text-center bg-slate-950"
                                value={templateConfig.printMarginRight !== undefined ? templateConfig.printMarginRight : 15}
                                onChange={(e) => setTemplateConfig(p => ({ ...p, printMarginRight: Number(e.target.value) }))}
                              />
                              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-500 pointer-events-none">mm</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Margin Lampiran */}
                      <div className="space-y-4 border-l border-white/10 pl-6">
                        <span className="text-xs font-bold text-amber-500 block uppercase tracking-wider font-semibold">Lampiran E-PPD</span>
                        <div className="grid grid-cols-2 gap-2.5">
                          <div className="space-y-1">
                            <label className="text-[10px]  text-slate-400 font-bold block uppercase">Atas (Top)</label>
                            <div className="relative">
                              <input 
                                type="number" 
                                min="0" 
                                max="100"
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500 text-center bg-slate-950"
                                value={templateConfig.printMarginTopLampiran !== undefined ? templateConfig.printMarginTopLampiran : 15}
                                onChange={(e) => setTemplateConfig(p => ({ ...p, printMarginTopLampiran: Number(e.target.value) }))}
                              />
                              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-500 pointer-events-none">mm</span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px]  text-slate-400 font-bold block uppercase">Bawah (Bot)</label>
                            <div className="relative">
                              <input 
                                type="number" 
                                min="0" 
                                max="100"
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500 text-center bg-slate-950"
                                value={templateConfig.printMarginBottomLampiran !== undefined ? templateConfig.printMarginBottomLampiran : 15}
                                onChange={(e) => setTemplateConfig(p => ({ ...p, printMarginBottomLampiran: Number(e.target.value) }))}
                              />
                              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-500 pointer-events-none">mm</span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px]  text-slate-400 font-bold block uppercase">Kiri (Left)</label>
                            <div className="relative">
                              <input 
                                type="number" 
                                min="0" 
                                max="100"
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500 text-center bg-slate-950"
                                value={templateConfig.printMarginLeftLampiran !== undefined ? templateConfig.printMarginLeftLampiran : 15}
                                onChange={(e) => setTemplateConfig(p => ({ ...p, printMarginLeftLampiran: Number(e.target.value) }))}
                              />
                              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-500 pointer-events-none">mm</span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px]  text-slate-400 font-bold block uppercase">Kanan (Right)</label>
                            <div className="relative">
                              <input 
                                type="number" 
                                min="0" 
                                max="100"
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-500 text-center bg-slate-950"
                                value={templateConfig.printMarginRightLampiran !== undefined ? templateConfig.printMarginRightLampiran : 15}
                                onChange={(e) => setTemplateConfig(p => ({ ...p, printMarginRightLampiran: Number(e.target.value) }))}
                              />
                              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-500 pointer-events-none">mm</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button 
                        type="button"
                        onClick={() => setTemplateConfig(p => ({
                          ...p,
                          printMarginTop: 15,
                          printMarginRight: 15,
                          printMarginBottom: 15,
                          printMarginLeft: 15,
                          printMarginTopLampiran: 15,
                          printMarginRightLampiran: 15,
                          printMarginBottomLampiran: 15,
                          printMarginLeftLampiran: 15
                        }))}
                        className="text-[10px] font-bold text-slate-400 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg px-3 py-1.5 transition-colors"
                      >
                        Reset Normal (15mm)
                      </button>
                      <button 
                        type="button"
                        onClick={() => setTemplateConfig(p => ({
                          ...p,
                          printMarginTop: 10,
                          printMarginRight: 10,
                          printMarginBottom: 10,
                          printMarginLeft: 10,
                          printMarginTopLampiran: 10,
                          printMarginRightLampiran: 10,
                          printMarginBottomLampiran: 10,
                          printMarginLeftLampiran: 10
                        }))}
                        className="text-[10px] font-bold text-slate-400 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg px-3 py-1.5 transition-colors"
                      >
                        Reset Sempit (10mm)
                      </button>
                      <button 
                        type="button"
                        onClick={() => setTemplateConfig(p => ({
                          ...p,
                          printMarginTop: 5,
                          printMarginRight: 5,
                          printMarginBottom: 5,
                          printMarginLeft: 5,
                          printMarginTopLampiran: 5,
                          printMarginRightLampiran: 5,
                          printMarginBottomLampiran: 5,
                          printMarginLeftLampiran: 5
                        }))}
                        className="text-[10px] font-bold text-slate-400 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg px-3 py-1.5 transition-colors"
                      >
                        Reset Sangat Sempit (5mm)
                      </button>
                    </div>
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
                      onClick={() => setIsConfigMode(false)}
                      disabled={isSavingConfig}
                      className="px-6 bg-white/5 hover:bg-white/10 text-slate-400 font-bold py-3 rounded-xl transition-all"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
            <div 
              className="flex flex-col gap-12 w-full items-center origin-top transition-transform duration-200 print:block print-scale-reset print:items-start mt-6"
              style={{ transform: isEmbedded ? 'none' : `scale(${scale})` }}
            >
            <div className={cn(
              "eppd-print-page bg-white w-full max-w-[950px] shadow-2xl p-6 text-black font-sans relative transition-all border border-slate-300 print:shadow-none print:p-0 print:max-w-none print:w-full mb-16 shrink-0 overflow-hidden flex flex-col",
              isEditing && "ring-4 ring-amber-500/30"
            )}
            style={{ 
              fontSize: `${templateConfig.fontSize + 2.5}pt`,
              paddingTop: `${templateConfig.printMarginTop !== undefined ? templateConfig.printMarginTop : 15}mm`,
              paddingRight: `${templateConfig.printMarginRight !== undefined ? templateConfig.printMarginRight : 15}mm`,
              paddingBottom: `${templateConfig.printMarginBottom !== undefined ? templateConfig.printMarginBottom : 15}mm`,
              paddingLeft: `${templateConfig.printMarginLeft !== undefined ? templateConfig.printMarginLeft : 15}mm`,
            }}
            >

              {/* Watermark in E-PPD */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-[0.03] overflow-hidden z-0 print:opacity-[0.03]">
                <div className="text-[140px] font-black tracking-tighter whitespace-nowrap transform -rotate-45" style={{fontFamily: 'Inter, sans-serif'}}>BAZNAS SIAK</div>
              </div>
            
            {/* Header */}
            <div className="grid grid-cols-[150px_1fr_170px] gap-2 mb-4">
              <div className="border border-black p-2 flex items-center justify-center relative group">
                {templateConfig.logo ? (
                  <img src={templateConfig.logo} alt="Logo" className="object-contain" style={{ maxHeight: `${templateConfig.logoSize + 32}px` }} />
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
            <div className="border border-black p-2 text-center flex flex-col justify-center">
              {isDesignMode ? (
                <input 
                  className="font-bold text-xl leading-tight text-center bg-indigo-50 border border-indigo-200 outline-none w-full"
                  value={ppdData.labels?.headerTitle || 'PERMOHONAN PENGELUARAN DANA'}
                  onChange={e => setPpdData({...ppdData, labels: {...ppdData.labels, headerTitle: e.target.value}})}
                />
              ) : (
                <h1 className="font-bold text-xl leading-tight">{ppdData.labels?.headerTitle || 'PERMOHONAN PENGELUARAN DANA'}</h1>
              )}
              {isDesignMode ? (
                <input 
                  className="font-bold text-lg leading-tight text-center bg-indigo-50 border border-indigo-200 outline-none w-full mt-1"
                  value={ppdData.labels?.headerSubtitle || '(PPD)'}
                  onChange={e => setPpdData({...ppdData, labels: {...ppdData.labels, headerSubtitle: e.target.value}})}
                />
              ) : (
                <h2 className="font-bold text-lg leading-tight text-slate-800">{ppdData.labels?.headerSubtitle || '(PPD)'}</h2>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <div className="border border-black p-1 text-[13px] text-center text-black font-bold">Normal</div>
              <div className="flex-1 flex flex-col gap-1">
                <div className="border border-black flex-1 p-1 text-xs flex items-center gap-1">
                  <span className="text-[10px] font-bold whitespace-nowrap">No</span>
                  {isEditing ? (
                    <input className="flex-1 bg-amber-50 border-none outline-none text-[10px] font-bold whitespace-nowrap" value={ppdData.no} onChange={e => setPpdData({...ppdData, no: e.target.value})} />
                  ) : (
                    <span className="text-[10px] font-bold whitespace-nowrap">{ppdData.no}</span>
                  )}
                </div>
                <div className="border border-black flex-1 p-1 text-xs flex items-center gap-1">
                  <span className="text-[10px] font-bold whitespace-nowrap">No PPD :</span>
                  {isEditing ? (
                    <input className="flex-1 bg-amber-50 border-none outline-none text-[10px] font-bold whitespace-nowrap" value={ppdData.noPpd} onChange={e => setPpdData({...ppdData, noPpd: e.target.value})} />
                  ) : (
                    <span className="text-[10px] font-bold whitespace-nowrap">{ppdData.noPpd}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Form Top */}
          <div className="border border-black text-[10px] font-medium divide-y divide-black font-medium">
            {/* Baris 1: Pemohon - Nama - Divisi */}
            <div className="grid grid-cols-[180px_1fr_210px] min-h-[44px]">
              <div className="border-r border-black px-2 py-2 flex items-center bg-white text-[10px] font-medium leading-tight group relative text-black font-medium">
                {isDesignMode ? (
                  <input 
                    className="bg-indigo-50 border border-indigo-200 outline-none w-full px-1"
                    value={ppdData.labels?.requestedBy || 'Pemohon'}
                    onChange={e => setPpdData({...ppdData, labels: {...ppdData.labels, requestedBy: e.target.value}})}
                  />
                ) : (
                  <span>{ppdData.labels?.requestedBy || 'Pemohon'}</span>
                )}
              </div>
              <div className="border-r border-black px-3 py-2 flex items-center text-black">
                {isEditing ? (
                  <select 
                    className="bg-amber-50 outline-none w-full px-1 text-[10px] font-bold" 
                    value={ppdData.requestedBy} 
                    onChange={e => {
                      setPpdData({...ppdData, requestedBy: e.target.value});
                      localStorage.setItem('ppd_pdp_name', e.target.value);
                    }} 
                  >
                    <option value="">-- Pilih Pemohon --</option>
                    <option value="Satriyanda, SE">Satriyanda, SE</option>
                    <option value="Muslikhun Thohari, S.I.Kom.">Muslikhun Thohari, S.I.Kom.</option>
                    <option value="Dina Alvinda, S.Pd.">Dina Alvinda, S.Pd.</option>
                    <option value="Ikhlasul Amal, M.Ag.">Ikhlasul Amal, M.Ag.</option>
                  </select>
                ) : (
                  <span className="text-[10px] font-bold">{ppdData.requestedBy || '(Nama Pemohon)'}</span>
                )}
              </div>
              <div className="grid grid-cols-[80px_1fr] h-full text-[10px] font-medium text-black font-medium">
                <div className="border-r border-black px-2 py-2 flex items-center bg-white">
                  {isDesignMode ? (
                     <input 
                      className="bg-indigo-50 border border-indigo-200 outline-none w-full px-1 text-left text-[10px] font-medium"
                      value={ppdData.labels?.division || 'Divisi'}
                      onChange={e => setPpdData({...ppdData, labels: {...ppdData.labels, division: e.target.value}})}
                    />
                  ) : (
                    <span>{ppdData.labels?.division || 'Divisi'}</span>
                  )}
                </div>
                <div className="px-3 py-2 flex items-center justify-start text-left">
                  {isEditing ? (
                    <input 
                      className="bg-amber-50 outline-none w-full text-left px-1 text-[10px] font-bold" 
                      value={ppdData.division} 
                      onChange={e => setPpdData({...ppdData, division: e.target.value})} 
                    />
                  ) : (
                    <span className="text-[10px] font-bold">{ppdData.division}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Baris 2: Jabatan - Staff - Tanggal */}
            <div className="grid grid-cols-[180px_1fr_210px] min-h-[44px]">
              <div className="border-r border-black px-2 py-2 flex items-center bg-white text-[10px] font-medium leading-tight text-black font-medium">
                {isDesignMode ? (
                  <input 
                    className="bg-indigo-50 border border-indigo-200 outline-none w-full px-1"
                    value={ppdData.labels?.function || 'Jabatan'}
                    onChange={e => setPpdData({...ppdData, labels: {...ppdData.labels, function: e.target.value}})}
                  />
                ) : (
                  <span>{ppdData.labels?.function || 'Jabatan'}</span>
                )}
              </div>
              <div className="border-r border-black px-3 py-2 flex items-center text-black">
                {isEditing ? (
                  <select 
                    className="bg-amber-50 outline-none w-full px-1 text-[10px] font-bold" 
                    value={ppdData.function} 
                    onChange={e => {
                      setPpdData({...ppdData, function: e.target.value});
                      localStorage.setItem('ppd_pdp_role', e.target.value);
                    }} 
                  >
                    <option value="">-- Pilih Jabatan --</option>
                    <option value="Staf">Staf</option>
                    <option value="Kesubid">Kesubid</option>
                    <option value="Kabid">Kabid</option>
                  </select>
                ) : (
                  <span className="text-[10px] font-bold">{ppdData.function}</span>
                )}
              </div>
              <div className="grid grid-cols-[80px_1fr] h-full text-[10px] font-medium text-black font-medium">
                <div className="border-r border-black px-2 py-2 flex items-center bg-white">
                  {isDesignMode ? (
                    <input 
                      className="bg-indigo-50 border border-indigo-200 outline-none w-full px-1 text-left text-[10px] font-medium"
                      value={ppdData.labels?.date || 'Tanggal'}
                      onChange={e => setPpdData({...ppdData, labels: {...ppdData.labels, date: e.target.value}})}
                    />
                  ) : (
                    <span>{ppdData.labels?.date || 'Tanggal'}</span>
                  )}
                </div>
                <div className="px-3 py-2 flex items-center justify-start text-left">
                  {isEditing ? (
                    <input 
                      className="bg-amber-50 outline-none w-full text-left px-1 text-[10px] font-bold" 
                      value={ppdData.date} 
                      onChange={e => setPpdData({...ppdData, date: e.target.value})} 
                    />
                  ) : (
                     <span className="tracking-tighter text-[10px] font-bold">{ppdData.date}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Baris 3: Jumlah Dana */}
            <div className="grid grid-cols-[180px_1fr] min-h-[44px]">
              <div className="border-r border-black px-2 py-2 flex items-center bg-white text-[10px] font-medium leading-tight text-black font-medium">
                {isDesignMode ? (
                  <input 
                    className="bg-indigo-50 border border-indigo-200 outline-none w-full px-1"
                    value={ppdData.labels?.amountLines || 'Jumlah Dana :'}
                    onChange={e => setPpdData({...ppdData, labels: {...ppdData.labels, amountLines: e.target.value}})}
                  />
                ) : (
                  <span>{ppdData.labels?.amountLines || 'Jumlah Dana :'}</span>
                )}
              </div>
              <div className="px-4 py-2 flex items-center">
                <span className="text-[10px]  truncate text-black px-1 font-bold">
                  {terbilang(totalAmount)}
                </span>
              </div>
            </div>

            {/* Baris 4: Tujuan Pengajuan */}
            <div className="grid grid-cols-[180px_1fr] min-h-[64px]">
              <div className="border-r border-black px-2 py-2 flex items-start pt-3 bg-white text-[10px] font-medium leading-tight text-black font-medium">
                {isDesignMode ? (
                  <input 
                    className="bg-indigo-50 border border-indigo-200 outline-none w-full px-1"
                    value={ppdData.labels?.proposeFor || 'Tujuan Pengajuan :'}
                    onChange={e => setPpdData({...ppdData, labels: {...ppdData.labels, proposeFor: e.target.value}})}
                  />
                ) : (
                  <span>{ppdData.labels?.proposeFor || 'Tujuan Pengajuan :'}</span>
                )}
              </div>
              <div className="p-3 text-black">
                {isEditing ? (
                  <textarea 
                    className="w-full bg-amber-50 outline-none p-2 text-[10px] font-medium min-h-[80px] font-medium"
                    value={ppdData.proposeFor} 
                    onChange={e => {
                      const val = e.target.value;
                      setPpdData({...ppdData, proposeFor: val, attachment: val});
                    }} 
                  />
                ) : (
                  <div className="leading-tight text-[10px] font-bold text-black whitespace-pre-wrap">
                    {ppdData.proposeFor}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="border-x border-b border-black text-[10px] font-medium divide-y divide-black font-medium">
            <div className="grid grid-cols-[180px_1fr] min-h-[44px]">
              <div className="border-r border-black px-2 py-2 h-full flex items-center bg-white text-[10px] font-medium leading-tight text-black font-medium">
                {isDesignMode ? (
                  <input 
                    className="bg-indigo-50 border border-indigo-200 outline-none w-full px-1"
                    value={ppdData.labels?.paidFor || 'Dibayarkan kepada :'}
                    onChange={e => setPpdData({...ppdData, labels: {...ppdData.labels, paidFor: e.target.value}})}
                  />
                ) : (
                  <span>{ppdData.labels?.paidFor || 'Dibayarkan kepada :'}</span>
                )}
              </div>
              <div className="px-3 py-2 flex items-center text-black text-[10px] font-bold">
                {isEditing ? (
                  <input className="bg-amber-50 outline-none w-full px-1 font-bold" value={ppdData.paidFor} onChange={e => setPpdData({...ppdData, paidFor: e.target.value})} />
                ) : (
                  <span className="font-bold">{ppdData.paidFor || '-'}</span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-[180px_1fr] min-h-[44px]">
              <div className="border-r border-black px-2 py-2 h-full flex items-center bg-white text-[10px] font-medium leading-tight text-black font-medium">
                {isDesignMode ? (
                  <input 
                    className="bg-indigo-50 border border-indigo-200 outline-none w-full px-1"
                    value={ppdData.labels?.refNo || 'Mengacu pada NO. PPD :'}
                    onChange={e => setPpdData({...ppdData, labels: {...ppdData.labels, refNo: e.target.value}})}
                  />
                ) : (
                  <span>{ppdData.labels?.refNo || 'Mengacu pada NO. PPD :'}</span>
                )}
              </div>
              <div className="px-3 py-2 flex items-center font-bold text-[10px] ">
                {isEditing ? (
                  <input className="bg-amber-50 outline-none w-full px-1 font-bold" value={ppdData.refNo} onChange={e => setPpdData({...ppdData, refNo: e.target.value})} />
                ) : (
                  <span className="font-bold">{ppdData.refNo || '-'}</span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-[180px_1fr] min-h-[44px]">
              <div className="border-r border-black px-2 py-2 h-full flex items-center bg-white text-[10px] font-medium leading-tight text-black font-medium">
                {isDesignMode ? (
                  <input 
                    className="bg-indigo-50 border border-indigo-200 outline-none w-full px-1 italic"
                    value={ppdData.labels?.disbursement || 'Mohon Dana Dikeluarkan'}
                    onChange={e => setPpdData({...ppdData, labels: {...ppdData.labels, disbursement: e.target.value}})}
                  />
                ) : (
                  <span>{ppdData.labels?.disbursement || 'Mohon Dana Dikeluarkan'}</span>
                )}
              </div>
              <div className="px-3 py-2 flex items-center text-black">
                {isEditing ? (
                  <input 
                    className="bg-amber-50 outline-none w-full px-1 text-[10px] font-medium text-black font-medium" 
                    value={ppdData.requestDisbursement} 
                    onChange={e => setPpdData({...ppdData, requestDisbursement: e.target.value})} 
                  />
                ) : (
                  <span className="text-[10px]  underline text-black font-bold">{ppdData.requestDisbursement}</span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-[180px_1fr] min-h-[44px]">
              <div className="border-r border-black px-2 py-2 h-full flex items-center bg-white text-[10px] font-medium leading-tight text-black font-medium">
                {isDesignMode ? (
                  <input 
                    className="bg-indigo-50 border border-indigo-200 outline-none w-full px-1"
                    value={ppdData.labels?.transfer || 'Transfer : No. Rek / Bank / Atas nama :'}
                    onChange={e => setPpdData({...ppdData, labels: {...ppdData.labels, transfer: e.target.value}})}
                  />
                ) : (
                  <span>{ppdData.labels?.transfer || 'Transfer : No. Rek / Bank / Atas nama :'}</span>
                )}
              </div>
              <div className="px-3 py-2 flex items-center text-[10px]  text-black font-bold">
                {isEditing ? (
                  <input className="bg-amber-50 outline-none w-full px-1 font-bold text-[10px] " value={ppdData.transferDetails} onChange={e => setPpdData({...ppdData, transferDetails: e.target.value})} />
                ) : (
                  <span className="font-bold">{ppdData.transferDetails}</span>
                )}
              </div>
            </div>
          </div>

          {/* Checkboxes Area */}
          <div className="border-x border-b border-black p-3 flex flex-wrap gap-6 text-[10px] font-medium">
            {transactionTypes.map(type => (
              <div 
                key={type} 
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => isEditing && setPpdData({...ppdData, transactionType: type})}
              >
                {ppdData.transactionType === type ? <CheckSquare className="w-5 h-5 text-indigo-600" /> : <Square className="w-5 h-5 text-slate-300" />}
                <span className="text-black">{type}</span>
              </div>
            ))}
          </div>

          {/* Table */}
          <table className="w-full border-collapse border border-black text-[10px] font-medium mt-4 font-medium">
            <thead>
              <tr className="bg-white">
                <th rowSpan={2} className="border border-black p-2 w-12 text-center text-[10px] font-medium text-black font-normal font-medium">No</th>
                <th colSpan={2} className="border border-black p-2 text-[10px] font-medium text-center text-black font-normal font-medium">Uraian/ Description</th>
                <th rowSpan={2} className="border border-black p-2 w-40 text-center text-[10px] font-medium text-black font-normal font-medium">Total (Rp.)</th>
              </tr>
              <tr className="bg-white">
                <th className="border border-black p-2 text-[10px] font-medium text-center text-black font-normal font-medium">Kode Anggaran/ Budget Code</th>
                <th className="border border-black p-2 text-[10px] font-medium text-center text-black font-normal font-medium">Nama Anggaran/ Budget Classification</th>
              </tr>
            </thead>
            <tbody>
              {ppdData.rows.map((row, idx) => (
                <tr key={row.id}>
                  <td className="border border-black p-3 text-center align-top font-bold">{idx + 1}</td>
                  <td className="border border-black p-3 align-top min-w-[150px]">
                    {isEditing ? (
                      <div className="flex flex-col gap-1">
                        <select 
                          className="w-full bg-amber-50 outline-none text-[10px] font-bold"
                          value={row.budgetCode}
                          onChange={e => {
                            const selected = budgetList.find(b => b.code === e.target.value);
                            const newRows = [...ppdData.rows];
                            newRows[idx].budgetCode = e.target.value;
                            if (selected) newRows[idx].classification = selected.label;
                            setPpdData({...ppdData, rows: newRows});
                          }}
                        >
                          <option value="">-- Pilih Kode --</option>
                          {budgetList.map(b => (
                            <option key={b.code} value={b.code}>{b.code} - {b.label}</option>
                          ))}
                        </select>
                        <input className="w-full bg-amber-50 outline-none border-t border-amber-200 text-[10px] font-bold" value={row.budgetCode} onChange={e => {
                          const newRows = [...ppdData.rows];
                          newRows[idx].budgetCode = e.target.value;
                          setPpdData({...ppdData, rows: newRows});
                        }} />
                      </div>
                    ) : (
                      <span className="font-bold">{row.budgetCode}</span>
                    )}
                  </td>
                  <td className="border border-black p-3 min-h-[60px] group relative align-top">
                    {isEditing ? (
                      <textarea className="w-full bg-amber-50 outline-none resize-none text-[10px] font-bold" rows={2} value={row.classification} onChange={e => {
                        const newRows = [...ppdData.rows];
                        newRows[idx].classification = e.target.value;
                        setPpdData({...ppdData, rows: newRows});
                      }} />
                    ) : (
                      <span className="font-bold">{row.classification}</span>
                    )}
                  </td>
                  <td className="border border-black p-3 text-right align-top text-[10px]  text-black font-bold">
                    {isEditing ? (
                      <input type="number" className="w-full bg-amber-50 outline-none text-right text-[10px]  text-black font-bold" value={row.total} onChange={e => {
                        const newRows = [...ppdData.rows];
                        newRows[idx].total = Number(e.target.value);
                        setPpdData({...ppdData, rows: newRows});
                      }} />
                    ) : (
                      <span className="font-bold">{row.total.toLocaleString('id-ID')}</span>
                    )}
                  </td>
                </tr>
              ))}
              {/* Padding rows removed */}
              <tr className="bg-white">
                <td colSpan={3} className="border border-black text-right pr-4 py-3 text-[10px] font-medium tracking-wider text-black font-medium">Total Rp</td>
                <td className="border border-black p-3 text-right text-[10px]  text-black font-bold">{totalAmount.toLocaleString('id-ID')}</td>
              </tr>
            </tbody>
          </table>

          {/* Footer Grid */}
          <div className="grid grid-cols-[max-content_2fr_max-content] border border-black text-[10px] font-medium mt-4 font-medium">
            <div className="border-r border-black divide-y divide-black w-[75px] shrink-0">
              <div className="min-h-[44px] p-2 flex items-end justify-start text-black text-[10px] font-medium tracking-tight whitespace-nowrap font-medium">
                {isDesignMode ? (
                  <input 
                    className="bg-indigo-50 border border-indigo-200 outline-none w-full px-1"
                    value={ppdData.labels?.footerDate || 'Tanggal'}
                    onChange={e => setPpdData({...ppdData, labels: {...ppdData.labels, footerDate: e.target.value}})}
                  />
                ) : (
                  <span>{ppdData.labels?.footerDate || 'Tanggal'}</span>
                )}
              </div>
              <div className="min-h-[100px] p-2 flex items-center justify-start text-black/40 text-[10px] font-medium leading-tight text-left font-medium">
                {isDesignMode ? (
                  <textarea 
                    className="bg-indigo-50 border border-indigo-200 outline-none w-full px-1 text-left resize-none h-10 overflow-hidden"
                    value={ppdData.labels?.footerSign || 'Tanda\nTangan'}
                    onChange={e => setPpdData({...ppdData, labels: {...ppdData.labels, footerSign: e.target.value}})}
                  />
                ) : (
                  <span className="text-left whitespace-pre-wrap break-words inline-block leading-[1.1]">{ppdData.labels?.footerSign || 'Tanda\nTangan'}</span>
                )}
              </div>
              <div className="min-h-[32px] p-2 items-center flex justify-start tracking-tight text-[10px] font-medium whitespace-nowrap font-medium">
                {isDesignMode ? (
                  <input 
                    className="bg-indigo-50 border border-indigo-200 outline-none w-full px-1"
                    value={ppdData.labels?.footerName || 'Nama'}
                    onChange={e => setPpdData({...ppdData, labels: {...ppdData.labels, footerName: e.target.value}})}
                  />
                ) : (
                  <span>{ppdData.labels?.footerName || 'Nama'}</span>
                )}
              </div>
              <div className="min-h-[32px] p-2 items-center flex justify-start tracking-tight text-[10px] font-medium whitespace-nowrap font-medium">
                {isDesignMode ? (
                  <input 
                    className="bg-indigo-50 border border-indigo-200 outline-none w-full px-1"
                    value={ppdData.labels?.footerFunction || 'Jabatan'}
                    onChange={e => setPpdData({...ppdData, labels: {...ppdData.labels, footerFunction: e.target.value}})}
                  />
                ) : (
                  <span>{ppdData.labels?.footerFunction || 'Jabatan'}</span>
                )}
              </div>
            </div>
            <div className="divide-y divide-black text-[10px] font-medium">
              <div className="grid grid-cols-[1fr_3.2fr] divide-x divide-black h-full">
                <div className="flex flex-col">
                  <div className="h-[44px] divide-y divide-black bg-white border-b border-black">
                    <div className="h-1/2 flex items-center justify-center p-1 text-[10px] font-medium text-black border-black whitespace-nowrap overflow-hidden font-medium">
                      Pemohon
                    </div>
                    <div className="h-1/2 flex items-center justify-center p-1 text-[10px] font-medium text-black font-medium">
                      <div className="text-[10px]  text-black font-bold">{ppdData.date}</div>
                    </div>
                  </div>
                  <div className="min-h-[100px] border-b border-black"></div>
                  <div className="min-h-[32px] border-b border-black p-1.5 text-center flex items-center justify-center text-[10px] font-medium text-black whitespace-nowrap font-medium">
                    {isEditing ? (
                      <input 
                        className="w-full bg-amber-50 text-center outline-none font-bold" 
                        value={ppdData.requestedBy} 
                        onChange={e => {
                          const val = e.target.value;
                          setPpdData({...ppdData, requestedBy: val, signers: {...ppdData.signers, staff: {...ppdData.signers.staff, name: val}}});
                          localStorage.setItem('ppd_pdp_name', val);
                        }} 
                      />
                    ) : (
                      <span className="font-bold text-[10px] ">{ppdData.requestedBy}</span>
                    )}
                  </div>
                  <div className="min-h-[32px] p-1.5 text-center flex items-center justify-center text-[10px] font-medium text-black whitespace-nowrap font-medium">
                    {isEditing ? (
                      <input 
                        className="w-full bg-amber-50 text-center outline-none" 
                        value={ppdData.function} 
                        onChange={e => {
                          const val = e.target.value;
                          setPpdData({...ppdData, function: val, signers: {...ppdData.signers, staff: {...ppdData.signers.staff, role: val}}});
                          localStorage.setItem('ppd_pdp_role', val);
                        }} 
                      />
                    ) : (
                      <span>{ppdData.function}</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col">
                  <div className="h-[44px] divide-y divide-black bg-white border-b border-black">
                    <div className="h-1/2 flex items-center justify-center p-1 text-[10px] font-medium text-black border-black whitespace-nowrap font-medium">
                      Disetujui Oleh/ Approved by
                    </div>
                    <div className="h-1/2"></div>
                  </div>
                  <div className="grid grid-cols-[1fr_1.1fr_1.2fr] divide-x divide-black flex-1">
                    <div className="flex flex-col divide-y divide-black">
                      <div className="min-h-[100px] flex flex-col justify-end p-2 text-center"></div>
                      <div className="min-h-[32px] p-1.5 font-bold text-center flex items-center justify-center text-[10px]  whitespace-nowrap">
                        {isEditing ? (
                          <input className="w-full bg-amber-50 text-center outline-none font-bold" value={ppdData.signers.kabid.name} onChange={e => setPpdData({...ppdData, signers: {...ppdData.signers, kabid: {...ppdData.signers.kabid, name: e.target.value}}})} />
                        ) : (
                          <span className="text-[10px]  leading-tight text-black font-bold">{ppdData.signers.kabid.name}</span>
                        )}
                      </div>
                      <div className="min-h-[32px] p-1.5 text-center flex items-center justify-center text-[10px] font-medium text-black whitespace-nowrap font-medium">{ppdData.signers.kabid.role}</div>
                    </div>
                    <div className="flex flex-col divide-y divide-black">
                      <div className="min-h-[100px] flex flex-col justify-end p-2 text-center"></div>
                      <div className="min-h-[32px] p-1.5 font-bold text-center flex items-center justify-center text-[10px]  whitespace-nowrap">
                         {isEditing ? (
                          <input className="w-full bg-amber-50 text-center outline-none font-bold" value={ppdData.signers.waka.name} onChange={e => setPpdData({...ppdData, signers: {...ppdData.signers, waka: {...ppdData.signers.waka, name: e.target.value}}})} />
                        ) : (
                          <span className="text-[10px]  leading-tight text-black font-bold">{ppdData.signers.waka.name}</span>
                        )}
                      </div>
                      <div className="min-h-[32px] p-1.5 text-center flex items-center justify-center text-[10px] font-medium text-black whitespace-nowrap font-medium">{ppdData.signers.waka.role}</div>
                    </div>
                    <div className="flex flex-col divide-y divide-black">
                      <div className="min-h-[100px] flex flex-col justify-end p-2 text-center"></div>
                      <div className="min-h-[32px] p-1.5 font-bold text-center flex items-center justify-center text-[10px]  whitespace-nowrap">
                         {isEditing ? (
                          <input className="w-full bg-amber-50 text-center outline-none font-bold" value={ppdData.signers.ketua.name} onChange={e => setPpdData({...ppdData, signers: {...ppdData.signers, ketua: {...ppdData.signers.ketua, name: e.target.value}}})} />
                        ) : (
                          <span className="text-[10px]  text-center leading-tight text-black font-bold">{ppdData.signers.ketua.name}</span>
                        )}
                      </div>
                      <div className="min-h-[32px] p-1.5 text-center flex items-center justify-center text-[10px] font-medium text-black whitespace-nowrap font-medium">{ppdData.signers.ketua.role}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-l border-black flex flex-col">
              <div className="h-[22px] bg-white border-b border-black flex items-center justify-center p-1 text-[10px] font-medium text-black whitespace-nowrap font-medium">
                {isDesignMode ? (
                  <input 
                    className="bg-indigo-50 border border-indigo-200 outline-none w-full px-1 text-center"
                    value={ppdData.labels?.footerFinance || 'Divisi Keuangan'}
                    onChange={e => setPpdData({...ppdData, labels: {...ppdData.labels, footerFinance: e.target.value}})}
                  />
                ) : (
                  <span>{ppdData.labels?.footerFinance || 'Divisi Keuangan'}</span>
                )}
              </div>
              <div className="grid grid-cols-2 divide-x divide-black flex-1">
                <div className="flex flex-col min-w-[70px] divide-y divide-black">
                  <div className="h-[22px] bg-white flex items-center justify-center text-center text-[10px] font-medium text-black tracking-tight font-medium">Pemeriksa</div>
                  <div className="flex-1"></div>
                  <div className="min-h-[32px] p-1.5 text-center flex items-center justify-center text-[10px] font-bold text-black whitespace-nowrap">
                    {isEditing ? (
                      <input className="w-full bg-amber-50 text-center outline-none font-bold" value={ppdData.signers.finance1.name} onChange={e => setPpdData({...ppdData, signers: {...ppdData.signers, finance1: {...ppdData.signers.finance1, name: e.target.value}}})} />
                    ) : (
                      <span className="text-[10px]  leading-tight text-black font-bold">{ppdData.signers.finance1.name}</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col min-w-[70px] divide-y divide-black">
                  <div className="h-[22px] bg-white flex items-center justify-center text-center text-[10px] font-medium text-black tracking-tight font-medium">Disetujui oleh</div>
                  <div className="flex-1"></div>
                  <div className="min-h-[32px] p-1.5 text-center flex items-center justify-center text-[10px] font-bold text-black whitespace-nowrap">
                    {isEditing ? (
                      <input className="w-full bg-amber-50 text-center outline-none font-bold" value={ppdData.signers.finance2.name} onChange={e => setPpdData({...ppdData, signers: {...ppdData.signers, finance2: {...ppdData.signers.finance2, name: e.target.value}}})} />
                    ) : (
                      <span className="text-[10px]  leading-tight text-black font-bold">{ppdData.signers.finance2.name}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="grid grid-cols-2 border-x border-b border-black text-[10px] font-medium min-h-[100px] text-black font-medium">
            <div className="border-r border-black p-2 flex flex-col">
              <span className="text-[10px] font-medium text-black mb-1 font-medium">Lampiran :</span>
              {isEditing ? (
                <textarea 
                  className="w-full bg-amber-50 outline-none p-2 text-[10px] font-medium flex-1 min-h-[60px] font-medium"
                  value={ppdData.attachment} 
                  onChange={e => setPpdData({...ppdData, attachment: e.target.value})} 
                />
              ) : (
                <div className="mt-1 font-medium italic prose prose-sm max-w-none text-black line-clamp-4 overflow-hidden whitespace-pre-wrap">
                  {ppdData.attachment}
                </div>
              )}
            </div>
            <div className="p-2 bg-white/30 flex flex-col text-black">
              <span className="text-[10px] font-medium text-black mb-1 font-medium">Note (finance only)</span>
              {isEditing ? (
                <textarea 
                  className="w-full bg-amber-50 outline-none p-2 text-[10px] font-medium flex-1 min-h-[60px] font-medium"
                  value={ppdData.noteFinance} 
                  onChange={e => setPpdData({...ppdData, noteFinance: e.target.value})} 
                />
              ) : (
                <div className="mt-1 font-medium italic prose prose-sm max-w-none text-black line-clamp-4 overflow-hidden whitespace-pre-wrap">
                  {ppdData.noteFinance}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Lampiran Section */}
          {chunkArray<any>(ppdData.lampiranRows || [], 18).map((pageRows, pageIndex, allPages) => (
        <div key={`lampiran-page-${pageIndex}`} className={cn(
          "lampiran-print-page bg-white w-full max-w-[1300px] shadow-2xl p-6 text-black font-sans relative transition-all border border-slate-300 print:shadow-none print:p-0 print:max-w-full mb-16 shrink-0 overflow-hidden flex flex-col print:break-before-page",
          pageIndex > 0 && "print:break-before-page",
          isEditing && "ring-4 ring-amber-500/30"
        )}
        style={{ 
          fontSize: `${templateConfig.fontSize + 2.5}pt`,
          paddingTop: `${templateConfig.printMarginTopLampiran !== undefined ? templateConfig.printMarginTopLampiran : (templateConfig.printMarginTop !== undefined ? templateConfig.printMarginTop : 15)}mm`,
          paddingRight: `${templateConfig.printMarginRightLampiran !== undefined ? templateConfig.printMarginRightLampiran : (templateConfig.printMarginRight !== undefined ? templateConfig.printMarginRight : 15)}mm`,
          paddingBottom: `${templateConfig.printMarginBottomLampiran !== undefined ? templateConfig.printMarginBottomLampiran : (templateConfig.printMarginBottom !== undefined ? templateConfig.printMarginBottom : 15)}mm`,
          paddingLeft: `${templateConfig.printMarginLeftLampiran !== undefined ? templateConfig.printMarginLeftLampiran : (templateConfig.printMarginLeft !== undefined ? templateConfig.printMarginLeft : 15)}mm`,
        }}
        >
          {/* Watermark in Lampiran */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-[0.03] overflow-hidden z-0 print:opacity-[0.03]">
            <div className="text-[140px] font-black tracking-tighter whitespace-nowrap transform -rotate-45" style={{fontFamily: 'Inter, sans-serif'}}>BAZNAS SIAK</div>
          </div>

          <div className="flex flex-col gap-4 relative z-10">
            {isEditing ? (
              <input className="text-center font-bold text-lg bg-amber-50 outline-none w-full" value={ppdData.labels?.lampiranTitle || `Daftar Nama Penerima Program ${recipient.programName || ''}`} onChange={e => setPpdData({...ppdData, labels: {...ppdData.labels, lampiranTitle: e.target.value}})} />
            ) : (
              <h2 className="text-center font-bold text-lg">{(ppdData.labels?.lampiranTitle || `Daftar Nama Penerima Program ${recipient.programName || ''}`)}{allPages.length > 1 ? ` (Hal. ${pageIndex + 1})` : ''}</h2>
            )}
            
            <div className="overflow-x-auto relative min-h-[400px]">
              <table className="w-full border-collapse border border-black text-[10px] font-medium bg-transparent font-medium">
                <thead>
                  <tr className="bg-slate-100/50 print:bg-white text-center">
                    <th className="border border-black p-2 font-bold w-12">No</th>
                    <th className="border border-black p-2 font-bold">Nama</th>
                    <th className="border border-black p-2 font-bold">NIK</th>
                    <th className="border border-black p-2 font-bold">No Hp</th>
                    <th className="border border-black p-2 font-bold">Kecamatan</th>
                    <th className="border border-black p-2 font-bold">Info Rekening</th>
                    <th className="border border-black p-2 font-bold">Alamat</th>
                    <th className="border border-black p-2 font-bold">Kampung</th>
                    <th className="border border-black p-2 font-bold w-32">Jumlah</th>
                    {isEditing && <th className="border border-black p-2 font-bold print:hidden w-16">Aksi</th>}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, localIdx) => {
                    const idx = pageIndex * 18 + localIdx;
                    return (
                    <tr key={row.id}>
                      <td className="border border-black p-2 text-center">{idx + 1}</td>
                      <td className="border border-black p-1 text-center">
                        {isEditing ? <input className="w-full bg-amber-50 p-1 outline-none text-center" value={row.nama} onChange={e => {
                          const newRows = [...ppdData.lampiranRows];
                          newRows[idx].nama = e.target.value;
                          setPpdData({...ppdData, lampiranRows: newRows});
                        }} /> : <span className="block px-1 py-1">{row.nama}</span>}
                      </td>
                      <td className="border border-black p-1 text-center">
                        {isEditing ? <input className="w-full bg-amber-50 p-1 outline-none text-center" value={row.nik} onChange={e => {
                          const newRows = [...ppdData.lampiranRows];
                          newRows[idx].nik = e.target.value;
                          setPpdData({...ppdData, lampiranRows: newRows});
                        }} /> : <span className="block px-1 py-1">{row.nik}</span>}
                      </td>
                      <td className="border border-black p-1 text-center">
                        {isEditing ? <input className="w-full bg-amber-50 p-1 outline-none text-center" value={row.noHp} onChange={e => {
                          const newRows = [...ppdData.lampiranRows];
                          newRows[idx].noHp = e.target.value;
                          setPpdData({...ppdData, lampiranRows: newRows});
                        }} /> : <span className="block px-1 py-1">{row.noHp}</span>}
                      </td>
                      <td className="border border-black p-1 text-center">
                        {isEditing ? <input className="w-full bg-amber-50 p-1 outline-none text-center" value={row.kecamatan} onChange={e => {
                          const newRows = [...ppdData.lampiranRows];
                          newRows[idx].kecamatan = e.target.value;
                          setPpdData({...ppdData, lampiranRows: newRows});
                        }} /> : <span className="block px-1 py-1">{row.kecamatan}</span>}
                      </td>
                      <td className="border border-black p-1 text-center">
                        {isEditing ? <textarea className="w-full bg-amber-50 p-1 outline-none text-center resize-none" rows={2} value={row.rekening} onChange={e => {
                          const newRows = [...ppdData.lampiranRows];
                          newRows[idx].rekening = e.target.value;
                          setPpdData({...ppdData, lampiranRows: newRows});
                        }} /> : <span className="block px-1 py-1 whitespace-pre-wrap">{row.rekening}</span>}
                      </td>
                      <td className="border border-black p-1 text-center">
                        {isEditing ? <input className="w-full bg-amber-50 p-1 outline-none text-center" value={row.alamat} onChange={e => {
                          const newRows = [...ppdData.lampiranRows];
                          newRows[idx].alamat = e.target.value;
                          setPpdData({...ppdData, lampiranRows: newRows});
                        }} /> : <span className="block px-1 py-1">{row.alamat}</span>}
                      </td>
                      <td className="border border-black p-1 text-center">
                        {isEditing ? <input className="w-full bg-amber-50 p-1 outline-none text-center" value={row.kampung} onChange={e => {
                          const newRows = [...ppdData.lampiranRows];
                          newRows[idx].kampung = e.target.value;
                          setPpdData({...ppdData, lampiranRows: newRows});
                        }} /> : <span className="block px-1 py-1">{row.kampung}</span>}
                      </td>
                      <td className="border border-black p-1 text-center">
                        {isEditing ? <input type="text" className="w-full bg-amber-50 p-1 outline-none text-right font-bold" value={row.jumlah === 0 ? '' : row.jumlah.toLocaleString('id-ID')} onChange={e => {
                          const val = e.target.value.replace(/\./g, '').replace(/\D/g, '');
                          const newRows = [...ppdData.lampiranRows];
                          newRows[idx].jumlah = val === '' ? 0 : Number(val);
                          setPpdData({...ppdData, lampiranRows: newRows});
                        }} /> : <span className="block px-1 py-1 text-right font-bold">{row.jumlah.toLocaleString('id-ID')}</span>}
                      </td>
                      {isEditing && (
                        <td className="border border-black p-1 text-center print:hidden">
                          <button onClick={() => {
                            const newRows = ppdData.lampiranRows.filter((_, i) => i !== idx);
                            setPpdData({...ppdData, lampiranRows: newRows});
                          }} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                    );
                  })}
                  
                  {isEditing && pageIndex === allPages.length - 1 && (
                    <tr className="print:hidden">
                      <td colSpan={10} className="border border-black p-2 text-center bg-slate-50">
                        <button onClick={() => {
                          setPpdData({
                            ...ppdData,
                            lampiranRows: [
                              ...ppdData.lampiranRows,
                              { id: Date.now().toString() + Math.random().toString(36).substring(2), nama: '', nik: '', noHp: '', kecamatan: '', rekening: '', alamat: '', kampung: '', jumlah: 0 }
                            ]
                          });
                        }} className="flex items-center justify-center gap-2 w-full py-2 hover:text-emerald-600 font-bold text-[10px] ">
                          <Plus className="w-4 h-4" /> Tambah Baris
                        </button>
                      </td>
                    </tr>
                  )}
                  
                  {pageIndex === allPages.length - 1 && (
                  <tr>
                    <td colSpan={8} className="border border-black p-2 text-right font-bold tracking-widest px-4">TOTAL Rp</td>
                    <td className="border border-black p-2 text-right font-bold">{totalLampiran.toLocaleString('id-ID')}</td>
                    {isEditing && <td className="border border-black p-2 print:hidden"></td>}
                  </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            <div className="grid grid-cols-2 mt-auto text-center text-[10px] font-medium pt-4 font-medium">
              <div className="flex flex-col items-center justify-start h-32">
                <span className="mb-auto">Pemeriksa</span>
                <div className="font-bold border-b border-black w-64 mb-1 leading-none pb-1 text-[10px] ">
                  {isEditing ? <input className="w-full bg-amber-50 text-center outline-none" value={ppdData.signers?.lampiranPemeriksaName || 'Andreas Supriadi, S.IKom'} onChange={(e) => setPpdData({...ppdData, signers: {...ppdData.signers, lampiranPemeriksaName: e.target.value}})} /> : (ppdData.signers?.lampiranPemeriksaName || 'Andreas Supriadi, S.IKom')}
                </div>
                {isEditing ? <input className="w-64 bg-amber-50 text-center outline-none text-[10px] font-medium" value={ppdData.signers?.lampiranPemeriksaRole || 'Kabid. PDP'} onChange={(e) => setPpdData({...ppdData, signers: {...ppdData.signers, lampiranPemeriksaRole: e.target.value}})} /> : <span className="text-[10px] font-medium">{ppdData.signers?.lampiranPemeriksaRole || 'Kabid. PDP'}</span>}
              </div>
              <div className="flex flex-col items-center justify-start h-32">
                <span className="mb-auto">Pembuat</span>
                <div className="font-bold border-b border-black w-48 mb-1 leading-none pb-1 text-[10px] ">
                  {isEditing ? <input className="w-full bg-amber-50 text-center outline-none" value={ppdData.signers?.lampiranPembuatName || ppdData.requestedBy} onChange={(e) => setPpdData({...ppdData, signers: {...ppdData.signers, lampiranPembuatName: e.target.value}})} /> : (ppdData.signers?.lampiranPembuatName || ppdData.requestedBy || '(Pembuat)')}
                </div>
                {isEditing ? <input className="w-48 bg-amber-50 text-center outline-none text-[10px] font-medium" value={ppdData.signers?.lampiranPembuatRole || 'Staf'} onChange={(e) => setPpdData({...ppdData, signers: {...ppdData.signers, lampiranPembuatRole: e.target.value}})} /> : <span className="text-[10px] font-medium">{ppdData.signers?.lampiranPembuatRole || 'Staf'}</span>}
              </div>
            </div>
          </div>
        </div>
        ))}
        </div>

        {/* Instructions */}
        {!isEditing && (
          <p className="text-white/40 text-[10px] font-medium mt-6 italic print:hidden border border-white/10 px-4 py-2 rounded-full backdrop-blur-sm mx-auto mb-10 text-center font-medium">
            Gunakan tombol "Edit" untuk menyesuaikan detail Permohonan
          </p>
        )}
        </>
        )}
      </div>
      </>
    ) : viewMode === 'scan' ? (
      <div className="flex-1 flex w-full h-full max-h-screen">
        <div className="flex-1 flex flex-col p-4 md:p-8 overflow-y-auto bg-black/40 items-center justify-start relative w-full h-full">
          <div className="w-full max-w-4xl flex flex-col gap-4 h-full">
               {!signedPdfUrl ? (
                 <div className="flex-1 flex flex-col items-center justify-center p-12 bg-white/5 border-2 border-dashed border-white/10 rounded-3xl text-center min-h-[400px]">
                   <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/10">
                     {isLoadingFile ? (
                       <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent animate-spin rounded-full" />
                     ) : (
                       <Upload className="w-10 h-10 text-white/20" />
                     )}
                   </div>
                   <h4 className="text-xl font-bold text-white mb-2">
                     {isLoadingFile ? 'Memuat Dokumen dari Cloud...' : 'Belum Ada Scan PPD'}
                   </h4>
                   <p className="text-white/40 max-w-md mb-8">
                     {isLoadingFile ? 'Mohon tunggu sebentar, file berukuran besar sedang diproses.' : 'Silakan upload scan Dokumen PPD yang sudah ditandatangani basah dalam format PDF.'}
                   </p>
                   {!isLoadingFile && (
                     <label className={cn(
                       "px-8 py-3 rounded-xl text-[10px] font-bold transition-all shadow-xl flex items-center gap-2 cursor-pointer",
                       isUploading ? "bg-slate-700 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-500 text-white"
                     )}>
                       {isUploading ? <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full" /> : <Upload className="w-4 h-4" />}
                       Upload File PDF
                       <input type="file" className="hidden" accept="application/pdf" onChange={handlePdfUpload} disabled={isUploading} />
                     </label>
                   )}
                 </div>
               ) : (
                 <div className="flex-1 flex flex-col bg-white/5 rounded-3xl overflow-hidden border border-white/10 p-2 relative shadow-2xl min-h-[600px] h-full">
                   {/* Action Header for PDF View */}
                   <div className="flex items-center justify-between p-3 bg-black/40 border-b border-white/10 shrink-0">
                     <div className="flex items-center gap-3">
                       <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                         <FileCheck className="w-4 h-4 text-emerald-400" />
                       </div>
                       <span className="text-[10px] font-bold text-white">HASIL SCAN PPD</span>
                     </div>
                     <div className="flex items-center gap-2">
                       <a 
                         href={signedPdfUrl || ''} 
                         download={`Scan_PPD_${recipient.registrationId}.pdf`}
                         className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-500 transition-all"
                       >
                         <Download className="w-3.5 h-3.5" />
                         Download
                       </a>
                       <button 
                         onClick={() => {
                           if(confirm('Hapus file scan dari Cloud?')) {
                             setSignedPdfUrl(null);
                             handleSavePdfToServer(null);
                           }
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
                     data={signedPdfBlobUrl || signedPdfUrl || ''} 
                     type="application/pdf"
                     className="w-full h-full rounded-b-2xl bg-slate-100 flex-1"
                   >
                     <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-slate-800">
                       <p className="text-white font-bold mb-2 text-lg">Pratinjau Gagal Dimuat</p>
                       <p className="text-white/40 text-[10px] font-medium mb-8 font-medium">Browser Anda mungkin memblokir pratinjau otomatis untuk file dari storage lokal.</p>
                       <a 
                         href={signedPdfUrl || ''} 
                         download={`Scan_PPD_${recipient.registrationId}.pdf`}
                         className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-xl shadow-indigo-500/20"
                       >
                         Download Untuk Dilihat
                       </a>
                     </div>
                   </object>
                 </div>
               )}
          </div>
        </div>

        {/* Sidebar Controls */}
        <div className="w-[320px] shrink-0 bg-slate-900 border-l border-white/10 p-6 hidden lg:flex flex-col gap-6 print:hidden">
          <div className="space-y-4">
            <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Dokumen Cloud</h4>
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
              <div className="flex items-center gap-3 mb-4">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center",
                  signedPdfUrl ? "bg-green-500/20 text-green-400" : "bg-white/5 text-white/20"
                )}>
                   <FileCheck className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-white text-[10px] font-bold leading-none mb-1">Scan Tertanda</p>
                  <p className="text-[10px] font-medium text-white/40 font-medium">{isLoadingFile ? 'Memuat...' : (signedPdfUrl ? 'Tersedia di Cloud' : 'Belum diunggah')}</p>
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
                
                {signedPdfUrl && (
                  <button 
                    disabled={isUploading}
                    onClick={() => {
                      if(confirm('Hapus file scan dari Cloud?')) {
                        setSignedPdfUrl(null);
                        handleSavePdfToServer(null);
                      }
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
              className="w-full flex items-center justify-center gap-2 py-3 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 rounded-2xl text-[10px] font-bold transition-all border border-white/5"
            >
              Tutup Pratinjau
            </button>
          </div>
        </div>
      </div>
    ) : null}
      </div>
    </div>
  );
}
