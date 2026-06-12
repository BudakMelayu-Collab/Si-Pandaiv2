import React, { useState, useEffect, useRef } from 'react';
import { 
  Save, X, Upload, FileText, Image as ImageIcon, 
  MapPin, User, Hash, Phone, Calendar, DollarSign,
  Plus, Trash2, Layers, Edit3, Check, Eye, ChevronRight, Loader2, QrCode, Smartphone, Wand2
} from 'lucide-react';
import { SIAK_REGIONAL_DATA, SIAK_SECTORS, SIAK_AID_TYPES, SIAK_PROGRAM_NAMES, SIAK_COMPANIONS } from '../constants';
import { cn } from '../lib/utils';
import { AidDocument, Recipient } from '../types';
import { 
  getGoogleAccessToken, 
  setGoogleAccessToken,
  loginWithGoogle, 
  uploadFileToGoogleDrive, 
  downloadGoogleDriveFileAsBase64,
  fetchSharedGoogleAccessToken,
  auth
} from '../firebase';

interface RecipientFormProps {
  onSubmit: (data: any) => void | Promise<void>;
  onCancel: () => void;
  existingRecipients?: Recipient[];
  initialGroupRecipients?: Recipient[];
  isPublic?: boolean;
}

interface DocumentSlot {
  label: string;
  file?: {
    name: string;
    type: 'image' | 'pdf' | 'excel';
    url: string; // base64 representation
    size?: string;
  };
  isCustomLabel?: boolean;
}

const INITIAL_DOCUMENT_SLOTS: DocumentSlot[] = [
  { label: 'KTP' },
  { label: 'KK' },
  { label: 'SKTM' },
  { label: 'Surat Aktif Belajar' },
  { label: 'Surat Aktif Belajar' },
  { label: 'Rincian Bukti Tunggakan' },
  { label: 'Pas Foto' },
  { label: 'Surat Rawat Inap' },
  { label: 'Surat Rujukan' },
  { label: 'Lainnya', isCustomLabel: true },
  { label: 'Lainnya', isCustomLabel: true },
  { label: 'Lainnya', isCustomLabel: true },
  { label: 'Lainnya', isCustomLabel: true },
  { label: 'Lainnya', isCustomLabel: true },
  { label: 'Lainnya', isCustomLabel: true },
];

const DEFAULT_RECIPIENT_INPUT = {
  name: '',
  nik: '',
  kk: '',
  pob: '',
  dob: '',
  gender: 'Laki-laki',
  familyStatus: '',
  headOfFamilyName: '',
  headOfFamilyDob: '',
  contact: '',
  address: '',
  rt: '',
  rw: '',
  kampung: '',
  district: '',
  schoolName: '',
  schoolLevel: '',
  schoolClass: '',
  schoolAddress: '',
  schoolPhone: '',
  bankAccountNo: '',
  bankName: '',
  bankAccountHolder: '',
  purpose: '', // Tujuan Penyaluran
  tujuanPengajuan: '', // Tujuan Pengajuan
  notes: '',
  documentStatus: 'Lengkap',
  documentStatusNotes: '',
};

const PERSON_IN_CHARGE_OPTIONS = [
  "Andreas Supriadi",
  "Satriyanda",
  "Muslikun Thohari",
  "Anshori",
  "M. Sanusi Bernawa",
  "Ikhlasul Amal",
  "Dina Alvinda",
  "Syarifah Suci Merza"
];

export default function RecipientForm({ onSubmit, onCancel, existingRecipients, initialGroupRecipients, isPublic = false }: RecipientFormProps) {
  const generateRegId = () => `REG-${Math.floor(100000 + Math.random() * 900000)}`;

  // Main Registration Data State (Tabel Utama)
  const [registrationData, setRegistrationData] = useState({
    registrationId: generateRegId(),
    adminCategory: '',
    serviceType: '',
    source: '',
    ashnaf: '',
    institutionName: '',
    personInCharge: '',
    submissionDate: new Date().toISOString().split('T')[0],
    companion: '',
    sector: '',
    subSector: '',
    aidType: '',
    programName: '',
    amountProposed: '',
    fundingSource: '',
    notes: '',
    isTermsAccepted: true,
    status: 'Masuk Berkas', // Standard initial status
    documents: [],
  });

  // Current Recipient Input State
  const [recipientInput, setRecipientInput] = useState(DEFAULT_RECIPIENT_INPUT);
  
  // List of added Recipients in sub-table
  const [subRecipients, setSubRecipients] = useState<any[]>([]);
  
  // Editing state for sub-table recipient
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  
  const [isAddingToSub, setIsAddingToSub] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);

  // Google Drive Integration States
  const [saveToGDrive, setSaveToGDrive] = useState<boolean>(() => {
    return localStorage.getItem('ppd_save_gdrive') !== 'false';
  });
  const [gdriveToken, setGdriveToken] = useState<string | null>(getGoogleAccessToken());
  const [isConnectingGDrive, setIsConnectingGDrive] = useState<boolean>(false);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [gdriveBase64Data, setGdriveBase64Data] = useState<string | null>(null);

  const handleConnectGDrive = async (): Promise<string | null> => {
    setIsConnectingGDrive(true);
    try {
      await loginWithGoogle();
      const token = getGoogleAccessToken();
      setGdriveToken(token);
      setSaveToGDrive(true);
      localStorage.setItem('ppd_save_gdrive', 'true');
      return token;
    } catch (err: any) {
      console.error("Gagal menghubungkan Google Drive:", err);
      alert("Gagal menghubungkan Google Drive: " + (err.message || err));
      return null;
    } finally {
      setIsConnectingGDrive(false);
    }
  };

  const handleToggleGDrive = (val: boolean) => {
    if (val && !getGoogleAccessToken()) {
      handleConnectGDrive();
    } else {
      setSaveToGDrive(val);
      localStorage.setItem('ppd_save_gdrive', val ? 'true' : 'false');
    }
  };

  // Local states for 15 slots document upload
  const [documentSlots, setDocumentSlots] = useState<DocumentSlot[]>(() => 
    INITIAL_DOCUMENT_SLOTS.map(s => ({ ...s }))
  );
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{ name: string; url: string } | null>(null);
  const [mergingIdx, setMergingIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States for adding custom dropdown options
  const [customSubSectors, setCustomSubSectors] = useState<Record<string, string[]>>({});
  const [customAidTypes, setCustomAidTypes] = useState<Record<string, string[]>>({});
  const [customProgramNames, setCustomProgramNames] = useState<Record<string, string[]>>({});
  const [customCompanions, setCustomCompanions] = useState<string[]>([]);
  const [customPersonInCharge, setCustomPersonInCharge] = useState<string[]>([]);

  useEffect(() => {
    const fetchToken = async () => {
      const token = await fetchSharedGoogleAccessToken();
      if (token) {
        setGdriveToken(token);
      }
    };
    fetchToken();
  }, []);

  useEffect(() => {
    if (initialGroupRecipients && initialGroupRecipients.length > 0) {
      const first = initialGroupRecipients[0];
      setRegistrationData({
        registrationId: first.registrationId || generateRegId(),
        adminCategory: first.adminCategory || '',
        serviceType: first.serviceType || '',
        source: first.source || '',
        ashnaf: first.ashnaf || '',
        institutionName: first.institutionName || '',
        personInCharge: first.personInCharge || '',
        submissionDate: first.submissionDate || new Date().toISOString().split('T')[0],
        companion: first.companion || '',
        sector: first.sector || '',
        subSector: first.subSector || '',
        aidType: first.aidType || '',
        programName: first.programName || '',
        amountProposed: first.amountProposed || '',
        fundingSource: first.fundingSource || '',
        notes: first.notes || '',
        isTermsAccepted: true,
        status: first.status || 'Masuk Berkas',
        documents: []
      });
      setSubRecipients(initialGroupRecipients);
    }
  }, [initialGroupRecipients]);

  useEffect(() => {
    if (!existingRecipients) return;
    
    // Auto-discover unique custom parameters historically to prepopulate dropdowns
    const newCustomSubs = { ...customSubSectors };
    const newCustomAid = { ...customAidTypes };
    const newCustomProg = { ...customProgramNames };
    const newCustomCompanions = [ ...customCompanions ];
    const newCustomPersonInCharge = [ ...customPersonInCharge ];
    let hasChanges = false;

    existingRecipients.forEach(r => {
      const sec = r.sector;
      
      if (r.companion && r.companion !== '-') {
        if (!SIAK_COMPANIONS.includes(r.companion) && !newCustomCompanions.includes(r.companion)) {
          newCustomCompanions.push(r.companion);
          hasChanges = true;
        }
      }
      
      if (r.personInCharge && r.personInCharge !== '-') {
        if (!PERSON_IN_CHARGE_OPTIONS.includes(r.personInCharge) && !newCustomPersonInCharge.includes(r.personInCharge)) {
          newCustomPersonInCharge.push(r.personInCharge);
          hasChanges = true;
        }
      }

      if (!sec) return;
      
      if (r.subSector && r.subSector !== '-') {
        if (!(SIAK_SECTORS[sec] || []).includes(r.subSector)) {
          if (!newCustomSubs[sec]) newCustomSubs[sec] = [];
          if (!newCustomSubs[sec].includes(r.subSector)) {
            newCustomSubs[sec].push(r.subSector);
            hasChanges = true;
          }
        }
      }
      if (r.aidType && (r.aidType as string) !== '-') {
        if (!(SIAK_AID_TYPES[sec] || []).includes(r.aidType as string)) {
          if (!newCustomAid[sec]) newCustomAid[sec] = [];
          if (!newCustomAid[sec].includes(r.aidType as string)) {
            newCustomAid[sec].push(r.aidType as string);
            hasChanges = true;
          }
        }
      }
      if (r.programName && r.programName !== '-') {
        if (!(SIAK_PROGRAM_NAMES[sec] || []).includes(r.programName)) {
          if (!newCustomProg[sec]) newCustomProg[sec] = [];
          if (!newCustomProg[sec].includes(r.programName)) {
            newCustomProg[sec].push(r.programName);
            hasChanges = true;
          }
        }
      }
    });

    if (hasChanges) {
      setCustomSubSectors(newCustomSubs);
      setCustomAidTypes(newCustomAid);
      setCustomProgramNames(newCustomProg);
      setCustomCompanions(newCustomCompanions);
      setCustomPersonInCharge(newCustomPersonInCharge);
    }
  }, [existingRecipients]);

  const [isAddingSubSector, setIsAddingSubSector] = useState(false);
  const [newSubSectorVal, setNewSubSectorVal] = useState('');

  const [isAddingAidType, setIsAddingAidType] = useState(false);
  const [newAidTypeVal, setNewAidTypeVal] = useState('');

  const [isAddingProgramName, setIsAddingProgramName] = useState(false);
  const [newProgramNameVal, setNewProgramNameVal] = useState('');

  const [isAddingCompanion, setIsAddingCompanion] = useState(false);
  const [newCompanionVal, setNewCompanionVal] = useState('');

  const [isAddingPersonInCharge, setIsAddingPersonInCharge] = useState(false);
  const [newPersonInChargeVal, setNewPersonInChargeVal] = useState('');

  const handleAdminCategoryChange = (val: string) => {
    let nextState = { ...registrationData, adminCategory: val };
    
    if (val === 'Bantuan Sosial/Mustahik') {
      nextState.serviceType = '';
      nextState.source = '';
      nextState.sector = '';
      nextState.programName = '';
      nextState.aidType = '';
    } else if (val === 'Honorarium Pendamping') {
      nextState.serviceType = 'Assesment, Asistensi, dan Monev';
      nextState.source = 'Internal';
      nextState.sector = 'Siak Sejahtera';
      nextState.programName = 'Honor Pendamping Program';
      nextState.aidType = 'Dana Operasional Program';
      
      // Auto-add to custom state if not present
      if (!SIAK_AID_TYPES['Siak Sejahtera']?.includes('Dana Operasional Program')) {
        setCustomAidTypes(prev => {
          const list = prev['Siak Sejahtera'] || [];
          if (!list.includes('Dana Operasional Program')) {
            return { ...prev, ['Siak Sejahtera']: [...list, 'Dana Operasional Program'] };
          }
          return prev;
        });
      }
      
      if (!SIAK_PROGRAM_NAMES['Siak Sejahtera']?.includes('Honor Pendamping Program')) {
        setCustomProgramNames(prev => {
          const list = prev['Siak Sejahtera'] || [];
          if (!list.includes('Honor Pendamping Program')) {
            return { ...prev, ['Siak Sejahtera']: [...list, 'Honor Pendamping Program'] };
          }
          return prev;
        });
      }
    } else {
      nextState.serviceType = '';
      nextState.source = '';
      nextState.sector = '';
      nextState.programName = '';
      nextState.aidType = '';
    }
    
    setRegistrationData(nextState);
  };

  const handleServiceTypeChange = (val: string) => {
    let nextState = { ...registrationData, serviceType: val };
    if (val === 'Program Bulanan') {
      if (!['Siak Cerdas', 'Siak Dakwah', 'Siak Peduli'].includes(nextState.sector)) {
        nextState.sector = '';
        nextState.programName = '';
        nextState.aidType = '';
      }
    }
    setRegistrationData(nextState);
  };

  const handleProgramNameChange = (val: string) => {
    let nextState = { ...registrationData, programName: val };
    
    if (val === 'Beasiswa SKSS BAZNAS Siak') {
      nextState.aidType = 'Beasiswa Pendidikan (Rutin Berkala)';
    } else if (val === 'Satu Keluarga Satu Sarjana (SKSS)') {
      nextState.aidType = 'Pembinaan & Biaya Hidup Mahasiswa';
    } else if (['Beasiswa Santri Tingkat (MI, MTs dan MA)', 'Beasiswa Cendikia BAZNAS Jenjang S1', 'Beasiswa Cendikia BAZNAS Jenjang D3-D4', "Beasiswa Tahfidz Qur'an 1-5 Juz", 'Beasiswa Riset BAZNAS S1', 'Beasiswa Disabilitas, 3T dan KAT'].includes(val)) {
      nextState.aidType = 'Beasiswa Pendidikan (Sekali Bayar / Insidental)';
    } else if (['Bantuan Biaya Pendidikan', 'Bantuan Pendidikan', 'Bantuan Pendidikan Infak Terikat'].includes(val)) {
      nextState.aidType = 'Bantuan Biaya Pendidikan (Insidental / Tunggakan)';
    } else if (['Seragam Sekolah Tingkat SD', 'Seragam Sekolah Tingkat SMP', 'Seragam Sekolah Tingkat (MI, MTs dan MA)'].includes(val)) {
      nextState.aidType = 'Bantuan Perlengkapan & Sarana Belajar';
    } else if (['Santri Binaan (Ponpes Darul Hadist)', 'Santri Binaan (SMP Cendikia)', 'Santri Binaan (Abdur Rahman) di Darul Hadist Siak'].includes(val)) {
      nextState.aidType = 'Pembinaan & Biaya Hidup Santri';
    } else if (['Santunan Guru Madrasah Aliyah (MA)'].includes(val)) {
      nextState.aidType = 'Santunan & Insentif Guru (Pendidik)';
    }

    setRegistrationData(nextState);
  };

  const handleAddSubSector = () => {
    const trimmed = newSubSectorVal.trim();
    if (!trimmed || !registrationData.sector) return;
    setCustomSubSectors(prev => {
      const list = prev[registrationData.sector] || [];
      if (list.includes(trimmed)) return prev;
      return { ...prev, [registrationData.sector]: [...list, trimmed] };
    });
    setRegistrationData(prev => ({ ...prev, subSector: trimmed }));
    setIsAddingSubSector(false);
    setNewSubSectorVal('');
  };

  const handleAddAidType = () => {
    const trimmed = newAidTypeVal.trim();
    if (!trimmed || !registrationData.sector) return;
    setCustomAidTypes(prev => {
      const list = prev[registrationData.sector] || [];
      if (list.includes(trimmed)) return prev;
      return { ...prev, [registrationData.sector]: [...list, trimmed] };
    });
    setRegistrationData(prev => ({ ...prev, aidType: trimmed }));
    setIsAddingAidType(false);
    setNewAidTypeVal('');
  };

  const handleAddProgramName = () => {
    const trimmed = newProgramNameVal.trim();
    if (!trimmed || !registrationData.sector) return;
    setCustomProgramNames(prev => {
      const list = prev[registrationData.sector] || [];
      if (list.includes(trimmed)) return prev;
      return { ...prev, [registrationData.sector]: [...list, trimmed] };
    });
    setRegistrationData(prev => ({ ...prev, programName: trimmed }));
    setIsAddingProgramName(false);
    setNewProgramNameVal('');
  };

  const handleAddCompanion = () => {
    const trimmed = newCompanionVal.trim();
    if (!trimmed) return;
    setCustomCompanions(prev => {
      if (prev.includes(trimmed)) return prev;
      return [...prev, trimmed];
    });
    setRegistrationData(prev => ({ ...prev, companion: trimmed }));
    setIsAddingCompanion(false);
    setNewCompanionVal('');
  };

  const handleAddPersonInCharge = () => {
    const trimmed = newPersonInChargeVal.trim();
    if (!trimmed) return;
    setCustomPersonInCharge(prev => {
      if (prev.includes(trimmed)) return prev;
      return [...prev, trimmed];
    });
    setRegistrationData(prev => ({ ...prev, personInCharge: trimmed }));
    setIsAddingPersonInCharge(false);
    setNewPersonInChargeVal('');
  };

  // Conversion helper
  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const triggerUploadForSlot = (idx: number) => {
    setActiveSlotIndex(idx);
    if (fileInputRef.current) {
      fileInputRef.current.value = ''; // Reset value to allow uploading same file
      fileInputRef.current.click();
    }
  };

  const handleOpenPreview = async (name: string, url: string) => {
    if (url.startsWith('gdrive:')) {
      const fileId = url.split(':')[1];
      setPreviewDoc({ name, url });
      setPreviewLoading(true);
      setGdriveBase64Data(null);
      try {
        const base64 = await downloadGoogleDriveFileAsBase64(fileId);
        setGdriveBase64Data(base64);
      } catch (err: any) {
        console.error("Gagal memuat pratinjau Drive:", err);
      } finally {
        setPreviewLoading(false);
      }
    } else {
      setPreviewDoc({ name, url });
      setGdriveBase64Data(null);
      setPreviewLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (activeSlotIndex === null) return;
    const file = e.target.files?.[0];
    if (!file) return;

    let type: 'image' | 'pdf' | 'excel' = 'image';
    if (file.type === 'application/pdf' || file.name.slice(-4).toLowerCase() === '.pdf') {
      type = 'pdf';
    } else if (file.name.slice(-4).toLowerCase() === '.xls' || file.name.slice(-5).toLowerCase() === '.xlsx') {
      type = 'excel';
    }

    setIsSavingAll(true);
    try {
      let finalUrl = '';
      let displaySize = `${(file.size / 1024).toFixed(1)} KB`;

      // Try to get Google Drive token (either cached or shared in Firestore)
      let token = getGoogleAccessToken();
      if (!token) {
        token = await fetchSharedGoogleAccessToken();
        if (token) {
          setGoogleAccessToken(token);
          setGdriveToken(token);
        }
      }

      // If token exists, attempt to upload to Google Drive
      if (token) {
        try {
          const slotLabel = documentSlots[activeSlotIndex]?.label || 'Berkas_Penerima';
          const recipientName = recipientInput.name || 'Penerima_Tanpa_Nama';
          const recipientNik = recipientInput.nik || '';
          const sectorVal = registrationData.sector || 'Umum';
          const programVal = registrationData.programName || '';
          const gdriveRes = await uploadFileToGoogleDrive(file, recipientName, recipientNik, slotLabel, sectorVal, programVal);
          finalUrl = `gdrive:${gdriveRes.id}`;
          displaySize = `${(file.size / (1024 * 1024)).toFixed(2)} MB (Drive)`;
        } catch (gdriveErr: any) {
          console.error("Gagal mengunggah ke Google Drive, dialihkan ke penyimpanan lokal:", gdriveErr);
          if (gdriveErr?.message?.includes('kadaluarsa')) {
            alert(gdriveErr.message);
          }
          token = null; // trigger fallback
        }
      }

      // If no token or upload to Google Drive failed, fall back to base64
      if (!token) {
        let base64Url = await convertFileToBase64(file);

        if (type === 'image') {
          const { compressImage } = await import('../lib/utils');
          base64Url = await compressImage(base64Url);
          const compressedSizeInKB = (base64Url.length * 0.75) / 1024;
          displaySize = `${compressedSizeInKB.toFixed(1)} KB (kompresi)`;
        }

        // Check against Firestore single document limit (roughly 1MB)
        const sizeInBytes = base64Url.length * 0.75;
        if (sizeInBytes >= 700000) {
          alert(`Gagal: Berkas "${file.name}" terlalu besar (${(sizeInBytes / 1024).toFixed(1)} KB) bahkan setelah dikompresi. Mohon pilih berkas dengan resolusi lebih kecil (maksimal 700KB) agar form dapat dikirim.`);
          setIsSavingAll(false);
          return;
        }
        finalUrl = base64Url;
      }

      const updatedSlots = [...documentSlots];
      updatedSlots[activeSlotIndex] = {
        ...updatedSlots[activeSlotIndex],
        file: {
          name: file.name,
          type,
          url: finalUrl,
          size: displaySize,
        },
      };
      setDocumentSlots(updatedSlots);
    } catch (err: any) {
      console.error('Failed to upload/read file:', err);
      alert('Gagal mengunggah berkas: ' + (err.message || err));
    } finally {
      setIsSavingAll(false);
      setActiveSlotIndex(null);
    }
  };

  const handleRemoveFileForSlot = (idx: number) => {
    const updatedSlots = [...documentSlots];
    updatedSlots[idx] = {
      ...updatedSlots[idx],
      file: undefined,
    };
    if (updatedSlots[idx].isCustomLabel) {
      updatedSlots[idx].label = 'Lainnya';
    }
    setDocumentSlots(updatedSlots);
  };

  // Auto-synchronize "Siak Dakwah" parameters for the main registration data
  useEffect(() => {
    if (registrationData.sector === 'Siak Dakwah') {
      setRegistrationData(prev => {
        if (prev.subSector !== 'Muallaf' || prev.aidType !== 'Santunan Tunai' || prev.programName !== 'Santunan Mualaf') {
          return {
            ...prev,
            subSector: 'Muallaf',
            aidType: 'Santunan Tunai',
            programName: 'Santunan Mualaf'
          };
        }
        return prev;
      });
    }
  }, [registrationData.sector]);

  // Validate duplicate NIK or Name in database & current batch
  const checkDuplicate = (nik: string, name: string, subIndexToIgnore: number | null) => {
    const cleanNik = nik.trim();
    const cleanName = name.trim().toLowerCase();

    // 1. Check in existingRecipients (database)
    if (existingRecipients && existingRecipients.length > 0) {
      const currentEditingId = subIndexToIgnore !== null ? subRecipients[subIndexToIgnore]?.id : null;

      // First check NIK (strictly forbidden if duplicate of another record)
      const matchedNikDb = existingRecipients.find(r => {
        if (currentEditingId && r.id === currentEditingId) return false;
        const isCurrentlyBeingEditedInBatch = subRecipients.some(subR => subR.id === r.id);
        if (isCurrentlyBeingEditedInBatch) return false;
        return r.nik && cleanNik && r.nik.trim() === cleanNik;
      });

      if (matchedNikDb) {
        return {
          isDuplicate: true,
          type: 'NIK',
          strict: true,
          message: `Gagal: NIK (${cleanNik}) sudah terdaftar di database atas nama "${matchedNikDb.name}" pada program "${matchedNikDb.programName || '-'}"!`
        };
      }

      // Next check Name (warning with confirmation allowed)
      const matchedNameDb = existingRecipients.find(r => {
        if (currentEditingId && r.id === currentEditingId) return false;
        const isCurrentlyBeingEditedInBatch = subRecipients.some(subR => subR.id === r.id);
        if (isCurrentlyBeingEditedInBatch) return false;
        return r.name && cleanName && r.name.trim().toLowerCase() === cleanName;
      });

      if (matchedNameDb) {
        return {
          isDuplicate: true,
          type: 'NAME',
          strict: false,
          message: `Peringatan: Penerima dengan Nama "${name.trim()}" sudah ada di database (NIK: ${matchedNameDb.nik}) pada program "${matchedNameDb.programName || '-'}".\n\nApakah Anda yakin ingin tetap mendaftarkan orang ini?`
        };
      }
    }

    // 2. Check in current sub-table batch (subRecipients)
    // First check NIK (strictly forbidden)
    const matchedNikBatchIdx = subRecipients.findIndex((r, idx) => {
      if (subIndexToIgnore !== null && idx === subIndexToIgnore) return false;
      return r.nik && cleanNik && r.nik.trim() === cleanNik;
    });

    if (matchedNikBatchIdx !== -1) {
      const matchedR = subRecipients[matchedNikBatchIdx];
      return {
        isDuplicate: true,
        type: 'NIK',
        strict: true,
        message: `Gagal: NIK (${cleanNik}) sudah ada di sub-tabel pendaftaran rombongan ini atas nama "${matchedR.name}"!`
      };
    }

    // Next check Name (warning with confirmation allowed)
    const matchedNameBatchIdx = subRecipients.findIndex((r, idx) => {
      if (subIndexToIgnore !== null && idx === subIndexToIgnore) return false;
      return r.name && cleanName && r.name.trim().toLowerCase() === cleanName;
    });

    if (matchedNameBatchIdx !== -1) {
      const matchedR = subRecipients[matchedNameBatchIdx];
      return {
        isDuplicate: true,
        type: 'NAME',
        strict: false,
        message: `Peringatan: Nama "${name.trim()}" sudah ada di sub-tabel rombongan ini (NIK: ${matchedR.nik}).\n\nApakah Anda yakin ingin tetap mendaftarkannya?`
      };
    }

    return { isDuplicate: false, strict: false, message: '', type: '' };
  };

  // Handle addition of a recipient into the sub-table
  const handleAddRecipientToSubTable = async () => {
    if (!recipientInput.name.trim()) {
      alert('Nama penerima wajib diisi.');
      return;
    }
    if (!recipientInput.nik || recipientInput.nik.length !== 16) {
      alert('NIK penerima wajib diisi dan harus tepat 16 digit.');
      return;
    }
    if (!recipientInput.kk || recipientInput.kk.length !== 16) {
      alert('Nomor KK penerima wajib diisi dan harus tepat 16 digit.');
      return;
    }
    if (!recipientInput.address.trim()) {
      alert('Alamat domisili lengkap wajib diisi.');
      return;
    }
    if (!recipientInput.district) {
      alert('Kecamatan domisili wajib dipilih.');
      return;
    }

    // Check for duplicate NIK or Name
    const dupCheck = checkDuplicate(recipientInput.nik, recipientInput.name, editingIndex);
    if (dupCheck.isDuplicate) {
      if (dupCheck.strict) {
        alert(dupCheck.message);
        return;
      } else {
        const confirmResult = window.confirm(dupCheck.message);
        if (!confirmResult) {
          return;
        }
      }
    }

    setIsAddingToSub(true);
    // Simulate slight saving delay to show progress
    await new Promise(res => setTimeout(res, 500));

    const updatedDocuments: AidDocument[] = documentSlots
      .filter(slot => slot.file)
      .map(slot => ({
        name: slot.label,
        type: slot.file!.type,
        url: slot.file!.url,
      }));

    const finalRecipient = {
      ...recipientInput,
      documents: updatedDocuments,
    };

    if (editingIndex !== null) {
      // Update existing item
      const updated = [...subRecipients];
      updated[editingIndex] = finalRecipient;
      setSubRecipients(updated);
      setEditingIndex(null);
    } else {
      // Add new item
      setSubRecipients([...subRecipients, finalRecipient]);
    }

    // Reset input fields completely for new entry
    setRecipientInput(DEFAULT_RECIPIENT_INPUT);

    setDocumentSlots(INITIAL_DOCUMENT_SLOTS.map(s => ({ ...s })));
    setIsAddingToSub(false);
  };

  // Turn off editing state and reset
  const handleCancelEditRecipient = () => {
    setEditingIndex(null);
    setRecipientInput(DEFAULT_RECIPIENT_INPUT);
    setDocumentSlots(INITIAL_DOCUMENT_SLOTS.map(s => ({ ...s })));
  };

  // Load selected recipient back into the input fields for editing
  const handleLoadEditRecipient = (index: number) => {
    setEditingIndex(index);
    let recipient = subRecipients[index];

    setRecipientInput({
      ...recipient
    });

    const slotsCopy: DocumentSlot[] = INITIAL_DOCUMENT_SLOTS.map(s => ({ ...s }));

    if (recipient.documents && Array.isArray(recipient.documents)) {
      const docsToMap = [...recipient.documents];

      // Standard slots
      slotsCopy.forEach(slot => {
        if (!slot.isCustomLabel) {
          const docIdx = docsToMap.findIndex(d => d.name === slot.label);
          if (docIdx !== -1) {
            const matchedDoc = docsToMap[docIdx];
            slot.file = {
              name: matchedDoc.name + (matchedDoc.type === 'pdf' ? '.pdf' : matchedDoc.type === 'excel' ? '.xlsx' : '.jpg'),
              type: matchedDoc.type as any,
              url: matchedDoc.url,
            };
            docsToMap.splice(docIdx, 1);
          }
        }
      });

      // Custom "Lainnya" slots
      slotsCopy.forEach(slot => {
        if (slot.isCustomLabel && !slot.file && docsToMap.length > 0) {
          const leftoverDoc = docsToMap.shift()!;
          slot.label = leftoverDoc.name;
          slot.file = {
            name: leftoverDoc.name + (leftoverDoc.type === 'pdf' ? '.pdf' : leftoverDoc.type === 'excel' ? '.xlsx' : '.jpg'),
            type: leftoverDoc.type as any,
            url: leftoverDoc.url,
          };
        }
      });
    }

    setDocumentSlots(slotsCopy);
    // Scroll smoothly to form section
    document.getElementById('form-input-penerima')?.scrollIntoView({ behavior: 'smooth' });
  };

  // Remove recipient from the sub-table list
  const handleRemoveRecipientFromSubTable = (index: number) => {
    if (confirm(`Apakah Anda yakin ingin menghapus penerima "${subRecipients[index].name}" dari daftar sub-tabel ini?`)) {
      setSubRecipients(prev => prev.filter((_, i) => i !== index));
      if (editingIndex === index) {
        setEditingIndex(null);
        setRecipientInput(DEFAULT_RECIPIENT_INPUT);
        setDocumentSlots(INITIAL_DOCUMENT_SLOTS.map(s => ({ ...s })));
      } else if (editingIndex !== null && editingIndex > index) {
        setEditingIndex(editingIndex - 1);
      }
    }
  };

  // Submit the entire compound form (Tabel Utama + Sub Tabel)
  const handleSaveAllData = async (e: React.FormEvent) => {
    e.preventDefault();

    let finalRecipients = [...subRecipients];

    // If the list is empty but the user filled out the recipient form, try to auto-add it
    // A draft is only present if "name" is typed, since "kk", "address", and "district" are retained helper fields.
    const hasCurrentRecipientDraft = !!(recipientInput.name && recipientInput.name.trim());
    if (hasCurrentRecipientDraft) {
      // Ensure all required sub-fields validate on auto-insert
      if (!recipientInput.name || !recipientInput.nik || !recipientInput.kk || !recipientInput.address || !recipientInput.district) {
        alert('Mohon lengkapi seluruh kolom wajib pendaftaran penerima (*), atau kosongkan kolom formulir jika Anda telah menambahkan seluruh penerima ke sub-tabel di bawah.');
        return;
      }
      if (recipientInput.nik.length !== 16 || recipientInput.kk.length !== 16) {
        alert('NIK dan No KK harus tepat 16 digit.');
        return;
      }

      // Check for duplicate NIK or Name for the current draft recipient
      const dupCheck = checkDuplicate(recipientInput.nik, recipientInput.name, editingIndex);
      if (dupCheck.isDuplicate) {
        if (dupCheck.strict) {
          alert(dupCheck.message);
          return;
        } else {
          const confirmResult = window.confirm(dupCheck.message);
          if (!confirmResult) {
            return;
          }
        }
      }

      const draftDocs: AidDocument[] = documentSlots
        .filter(slot => slot.file)
        .map(slot => ({
          name: slot.label,
          type: slot.file!.type,
          url: slot.file!.url,
        }));

      finalRecipients.push({
        ...recipientInput,
        documents: draftDocs,
      });
    }

    if (finalRecipients.length === 0) {
      alert('Sub-tabel penerima masih kosong. Mohon tambahkan minimal 1 penerima.');
      return;
    }

    // Verify main parameters
    if (!registrationData.sector) {
      alert('Mohon pilih Bidang.');
      return;
    }
    if (!registrationData.aidType) {
      alert('Mohon pilih Jenis Bantuan.');
      return;
    }

    // Map each subRecipient element, applying the group (Tabel Utama) fields
    const { documents: groupDocs, status: groupStatus, ...groupSettings } = registrationData;
    const submissionData = finalRecipients.map(r => ({
      ...r,
      ...groupSettings,
      amountProposed: r.amountProposed ? Number(r.amountProposed) : 0,
      amountDisbursed: r.amountDisbursed ? Number(r.amountDisbursed) : 0,
    }));

    setIsSavingAll(true);
    try {
      await onSubmit(submissionData);
    } finally {
      setIsSavingAll(false);
    }
  };

  return (
    <div className="space-y-10 pb-36">
      <form onSubmit={e => e.preventDefault()} className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
        
        {/* SECTION 1: TABEL UTAMA - PARAMETER REGISTRASI & PENGAJUAN */}
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <Layers className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-lg">Parameter Registrasi & Pengajuan</h3>
              <p className="text-xs text-slate-500 font-medium">Informasi utama permohonan yang berlaku untuk seluruh rombongan/sub-penerima.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">ID Registrasi</label>
              <input type="text" className="form-input-custom bg-slate-100 font-mono !cursor-not-allowed" value={registrationData.registrationId} readOnly />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Kategori Administrasi</label>
              <select 
                className="form-input-custom font-medium" 
                value={registrationData.adminCategory} 
                onChange={e => handleAdminCategoryChange(e.target.value)}
              >
                <option value="">Pilih Kategori Administrasi</option>
                <option value="Bantuan Sosial/Mustahik">Bantuan Sosial/Mustahik</option>
                <option value="Honorarium Pendamping">Honorarium Pendamping</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Jenis Layanan</label>
              <select 
                className="form-input-custom font-medium" 
                value={registrationData.serviceType} 
                onChange={e => handleServiceTypeChange(e.target.value)}
              >
                <option value="">Pilih Jenis Layanan</option>
                {(!registrationData.adminCategory || registrationData.adminCategory === 'Bantuan Sosial/Mustahik') && (
                  <>
                    <option value="Layanan Konter">Layanan Konter</option>
                    <option value="Program Bulanan">Program Bulanan</option>
                  </>
                )}
                {registrationData.adminCategory === 'Honorarium Pendamping' && (
                  <option value="Assesment, Asistensi, dan Monev">Assesment, Asistensi, dan Monev</option>
                )}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Ashnaf</label>
              <select 
                className="form-input-custom font-medium" 
                value={registrationData.ashnaf} 
                onChange={e => setRegistrationData({...registrationData, ashnaf: e.target.value})}
              >
                <option value="">Pilih Ashnaf</option>
                <option value="Fakir">Fakir</option>
                <option value="Miskin">Miskin</option>
                <option value="Amil">Amil</option>
                <option value="Muallaf">Muallaf</option>
                <option value="Riqab">Riqab</option>
                <option value="Gharim">Gharim</option>
                <option value="Fisabilillah">Fisabilillah</option>
                <option value="Ibnu Sabil">Ibnu Sabil</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Sumber Berkas</label>
              <select 
                className="form-input-custom font-medium" 
                value={registrationData.source} 
                onChange={e => {
                  const val = e.target.value;
                  setRegistrationData({
                    ...registrationData,
                    source: val,
                    institutionName: ['UPZ', 'Online', 'Instansi', 'Lembaga'].includes(val) 
                      ? registrationData.institutionName 
                      : ''
                  });
                }}
              >
                <option value="">Pilih Sumber</option>
                <option value="Internal">Internal</option>
                <option value="KLM">KLM</option>
                <option value="UPZ">UPZ</option>
                <option value="Online">Online</option>
                <option value="Instansi">Instansi</option>
                <option value="Lembaga">Lembaga</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Sumber Dana</label>
              <select 
                className="form-input-custom font-medium" 
                value={registrationData.fundingSource} 
                onChange={e => setRegistrationData({...registrationData, fundingSource: e.target.value})}
              >
                <option value="">Pilih Sumber Dana</option>
                <option value="Zakat">Zakat</option>
                <option value="Infaq">Infaq</option>
                <option value="Shadaqah">Shadaqah</option>
                <option value="DSKL">DSKL</option>
              </select>
            </div>

            {['UPZ', 'Online', 'Instansi', 'Lembaga'].includes(registrationData.source) && (
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Nama Lembaga *</label>
                <input 
                  required
                  type="text" 
                  placeholder="Ketik nama lembaga/instansi/UPZ"
                  className="form-input-custom font-medium animate-in slide-in-from-top-1 duration-250 border-indigo-200" 
                  value={registrationData.institutionName} 
                  onChange={e => setRegistrationData({...registrationData, institutionName: e.target.value})} 
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Tgl Masuk Berkas *</label>
              <input required type="date" className="form-input-custom font-medium" value={registrationData.submissionDate} onChange={e => setRegistrationData({...registrationData, submissionDate: e.target.value})} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-700">Pendamping Program</label>
                <button 
                  type="button" 
                  onClick={() => setIsAddingCompanion(!isAddingCompanion)}
                  className="text-[10px] text-indigo-600 font-extrabold hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Tambah Manual
                </button>
              </div>
              <select className="form-input-custom font-medium" value={registrationData.companion} onChange={e => setRegistrationData({...registrationData, companion: e.target.value})}>
                <option value="">Pilih Pendamping</option>
                {[...SIAK_COMPANIONS, ...customCompanions].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {isAddingCompanion && (
                <div className="mt-1.5 p-2 bg-indigo-50/50 rounded-xl border border-indigo-100 flex gap-2 items-center duration-150 animate-in fade-in-50 slide-in-from-top-1">
                  <input 
                    type="text" 
                    placeholder="Nama Pendamping baru..."
                    className="form-input-custom font-medium text-xs bg-white py-1 flex-1 h-8"
                    value={newCompanionVal}
                    onChange={e => setNewCompanionVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCompanion(); } }}
                  />
                  <button
                    type="button"
                    onClick={handleAddCompanion}
                    className="bg-indigo-600 text-white font-extrabold text-[10px] px-2.5 py-1.5 rounded-lg hover:bg-indigo-750 transition-colors cursor-pointer"
                  >
                    Simpan
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsAddingCompanion(false); setNewCompanionVal(''); }}
                    className="bg-slate-200 text-slate-700 font-extrabold text-[10px] px-2.5 py-1.5 rounded-lg hover:bg-slate-300 transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-700">Penanggung Jawab</label>
                <button 
                  type="button" 
                  onClick={() => setIsAddingPersonInCharge(!isAddingPersonInCharge)}
                  className="text-[10px] text-indigo-600 font-extrabold hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Tambah Manual
                </button>
              </div>
              <select 
                className="form-input-custom font-medium" 
                value={registrationData.personInCharge} 
                onChange={e => setRegistrationData({...registrationData, personInCharge: e.target.value})}
              >
                <option value="">Pilih Penanggung Jawab</option>
                {[...PERSON_IN_CHARGE_OPTIONS, ...customPersonInCharge].map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              {isAddingPersonInCharge && (
                <div className="mt-1.5 p-2 bg-indigo-50/50 rounded-xl border border-indigo-100 flex gap-2 items-center duration-150 animate-in fade-in-50 slide-in-from-top-1">
                  <input 
                    type="text" 
                    placeholder="Nama Penanggung Jawab baru..."
                    className="form-input-custom font-medium text-xs bg-white py-1 flex-1 h-8"
                    value={newPersonInChargeVal}
                    onChange={e => setNewPersonInChargeVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddPersonInCharge(); } }}
                  />
                  <button
                    type="button"
                    onClick={handleAddPersonInCharge}
                    className="bg-indigo-600 text-white font-extrabold text-[10px] px-2.5 py-1.5 rounded-lg hover:bg-indigo-750 transition-colors cursor-pointer"
                  >
                    Simpan
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsAddingPersonInCharge(false); setNewPersonInChargeVal(''); }}
                    className="bg-slate-200 text-slate-700 font-extrabold text-[10px] px-2.5 py-1.5 rounded-lg hover:bg-slate-300 transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Bidang *</label>
              <select 
                required
                className="form-input-custom font-medium" 
                value={registrationData.sector} 
                onChange={e => setRegistrationData({...registrationData, sector: e.target.value, subSector: '', aidType: '', programName: ''})}
              >
                <option value="">Pilih Bidang</option>
                {Object.keys(SIAK_SECTORS)
                  .filter(s => registrationData.serviceType === 'Program Bulanan' ? ['Siak Cerdas', 'Siak Dakwah', 'Siak Peduli'].includes(s) : true)
                  .map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>



            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-700">Nama Program</label>
                {registrationData.sector && (
                  <button 
                    type="button" 
                    onClick={() => setIsAddingProgramName(!isAddingProgramName)}
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 active:scale-95 duration-100 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Tambah Manual
                  </button>
                )}
              </div>
              <select 
                className="form-input-custom font-medium" 
                value={registrationData.programName} 
                onChange={e => handleProgramNameChange(e.target.value)}
                disabled={!registrationData.sector}
              >
                <option value="">Pilih Program</option>
                {registrationData.sector && [
                  ...(SIAK_PROGRAM_NAMES[registrationData.sector] || []),
                  ...(customProgramNames[registrationData.sector] || [])
                ].filter(p => {
                  if (registrationData.serviceType === 'Layanan Konter') {
                    if (registrationData.sector === 'Siak Cerdas') {
                      if (!['Beasiswa Santri Tingkat (MI, MTs dan MA)', 'Beasiswa Cendikia BAZNAS Jenjang S1', 'Beasiswa Cendikia BAZNAS Jenjang D3-D4', "Beasiswa Tahfidz Qur'an 1-5 Juz", 'Beasiswa Riset BAZNAS S1', 'Beasiswa Disabilitas, 3T dan KAT', 'Bantuan Biaya Pendidikan', 'Bantuan Pendidikan', 'Bantuan Pendidikan Infak Terikat', 'Seragam Sekolah Tingkat SD', 'Seragam Sekolah Tingkat SMP', 'Seragam Sekolah Tingkat (MI, MTs dan MA)', 'Santunan Guru Madrasah Aliyah (MA)'].includes(p)) return false;
                    }
                  } else if (registrationData.serviceType === 'Program Bulanan') {
                    if (registrationData.sector === 'Siak Cerdas') {
                      if (!['Santri Binaan (Ponpes Darul Hadist)', 'Santri Binaan (SMP Cendikia)', 'Santri Binaan (Abdur Rahman) di Darul Hadist Siak', 'Satu Keluarga Satu Sarjana (SKSS)'].includes(p)) return false;
                    } else if (registrationData.sector === 'Siak Dakwah') {
                      if (!['Santunan Muallaf', "Da'i Mukim", "Program Da'I Daerah 3T", "Bantuan Saguhati Mu'allaf", "Pembinaan Mu'allaf", "Imam Masjid Paripurna"].includes(p)) return false;
                    } else if (registrationData.sector === 'Siak Peduli') {
                      if (!['Safa', 'Program ATM Beras', 'Yafa'].includes(p)) return false;
                    }
                  }
                  return true;
                }).map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              {isAddingProgramName && (
                <div className="mt-1.5 p-2 bg-indigo-50/50 rounded-xl border border-indigo-100 flex gap-2 items-center duration-150 animate-in fade-in-50 slide-in-from-top-1">
                  <input 
                    type="text" 
                    placeholder="Nama Program baru..."
                    className="form-input-custom font-medium text-xs bg-white py-1 flex-1 h-8"
                    value={newProgramNameVal}
                    onChange={e => setNewProgramNameVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddProgramName(); } }}
                  />
                  <button
                    type="button"
                    onClick={handleAddProgramName}
                    className="bg-indigo-600 text-white font-extrabold text-[10px] px-2.5 py-1.5 rounded-lg hover:bg-indigo-750 transition-colors cursor-pointer"
                  >
                    Simpan
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsAddingProgramName(false); setNewProgramNameVal(''); }}
                    className="bg-slate-200 text-slate-700 font-extrabold text-[10px] px-2.5 py-1.5 rounded-lg hover:bg-slate-300 transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-700">Jenis Bantuan *</label>
                {registrationData.sector && (
                  <button 
                    type="button" 
                    onClick={() => setIsAddingAidType(!isAddingAidType)}
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 active:scale-95 duration-100 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Tambah Manual
                  </button>
                )}
              </div>
              <select 
                required 
                className="form-input-custom font-medium" 
                value={registrationData.aidType} 
                onChange={e => setRegistrationData({...registrationData, aidType: e.target.value as any})}
                disabled={!registrationData.sector}
              >
                <option value="">Pilih Jenis</option>
                {registrationData.sector && [
                  ...(SIAK_AID_TYPES[registrationData.sector] || []),
                   ...(customAidTypes[registrationData.sector] || [])
                ].filter(ss => {
                  if (registrationData.serviceType === 'Program Bulanan' && registrationData.sector === 'Siak Cerdas') {
                    if (!['Pembinaan & Biaya Hidup Santri', 'Pembinaan & Biaya Mahasiswa'].includes(ss) && !['Pembinaan & Biaya Hidup Mahasiswa'].includes(ss)) return false;
                  }
                  
                  if (registrationData.sector === 'Siak Cerdas' && registrationData.programName) {
                    const p = registrationData.programName;
                    if (p === 'Beasiswa SKSS BAZNAS Siak' && ss !== 'Beasiswa Pendidikan (Rutin Berkala)') return false;
                    if (p === 'Satu Keluarga Satu Sarjana (SKSS)' && ss !== 'Pembinaan & Biaya Hidup Mahasiswa') return false;
                    if (['Beasiswa Santri Tingkat (MI, MTs dan MA)', 'Beasiswa Cendikia BAZNAS Jenjang S1', 'Beasiswa Cendikia BAZNAS Jenjang D3-D4', "Beasiswa Tahfidz Qur'an 1-5 Juz", 'Beasiswa Riset BAZNAS S1', 'Beasiswa Disabilitas, 3T dan KAT'].includes(p) && ss !== 'Beasiswa Pendidikan (Sekali Bayar / Insidental)') return false;
                    if (['Bantuan Biaya Pendidikan', 'Bantuan Pendidikan', 'Bantuan Pendidikan Infak Terikat'].includes(p) && ss !== 'Bantuan Biaya Pendidikan (Insidental / Tunggakan)') return false;
                    if (['Seragam Sekolah Tingkat SD', 'Seragam Sekolah Tingkat SMP', 'Seragam Sekolah Tingkat (MI, MTs dan MA)'].includes(p) && ss !== 'Bantuan Perlengkapan & Sarana Belajar') return false;
                    if (['Santri Binaan (Ponpes Darul Hadist)', 'Santri Binaan (SMP Cendikia)', 'Santri Binaan (Abdur Rahman) di Darul Hadist Siak'].includes(p) && ss !== 'Pembinaan & Biaya Hidup Santri') return false;
                    if (p === 'Santunan Guru Madrasah Aliyah (MA)' && ss !== 'Santunan & Insentif Guru (Pendidik)') return false;
                  }

                  return true;
                }).map(ss => (
                  <option key={ss} value={ss}>{ss}</option>
                ))}
              </select>
              {isAddingAidType && (
                <div className="mt-1.5 p-2 bg-indigo-50/50 rounded-xl border border-indigo-100 flex gap-2 items-center duration-150 animate-in fade-in-50 slide-in-from-top-1">
                  <input 
                    type="text" 
                    placeholder="Nama Jenis Bantuan baru..."
                    className="form-input-custom font-medium text-xs bg-white py-1 flex-1 h-8"
                    value={newAidTypeVal}
                    onChange={e => setNewAidTypeVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddAidType(); } }}
                  />
                  <button
                    type="button"
                    onClick={handleAddAidType}
                    className="bg-indigo-600 text-white font-extrabold text-[10px] px-2.5 py-1.5 rounded-lg hover:bg-indigo-750 transition-colors cursor-pointer"
                  >
                    Simpan
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsAddingAidType(false); setNewAidTypeVal(''); }}
                    className="bg-slate-200 text-slate-700 font-extrabold text-[10px] px-2.5 py-1.5 rounded-lg hover:bg-slate-300 transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SECTION 2: FORM INPUT DETIL PENERIMA (ADD / EDIT) */}
        <div id="form-input-penerima" className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm border-l-4 border-l-indigo-600">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-lg">
                  {editingIndex !== null ? `Edit Data Penerima (Urutan #${editingIndex + 1})` : 'Form Input Data Penerima'}
                </h3>
                <p className="text-xs text-slate-500 font-medium">Lengkapi biodata individu penerima manfaat di bawah ini.</p>
              </div>
            </div>
            {editingIndex !== null && (
              <span className="text-xs bg-amber-100 text-amber-800 font-bold px-3 py-1 rounded-full animate-pulse">
                Sedang Mengubah Data
              </span>
            )}
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="space-y-2 lg:col-span-2">
                <label className="text-sm font-semibold text-slate-700">Nama Penerima *</label>
                <input type="text" className="form-input-custom font-medium" value={recipientInput.name} onChange={e => setRecipientInput({...recipientInput, name: e.target.value})} placeholder="Nama lengkap sesuai KTP" />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">NIK *</label>
                <input type="text" maxLength={16} className="form-input-custom font-mono" value={recipientInput.nik} onChange={e => setRecipientInput({...recipientInput, nik: e.target.value.replace(/\D/g, '')})} placeholder="16 Digit NIK" />
                {recipientInput.nik.length > 0 && recipientInput.nik.length < 16 && (
                  <p className="text-xs text-rose-500 font-medium">
                    NIK kurang {(16 - recipientInput.nik.length)} digit
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Nomor KK *</label>
                <input type="text" maxLength={16} className="form-input-custom font-mono" value={recipientInput.kk} onChange={e => setRecipientInput({...recipientInput, kk: e.target.value.replace(/\D/g, '')})} placeholder="16 Digit No KK" />
                {recipientInput.kk.length > 0 && recipientInput.kk.length < 16 && (
                  <p className="text-xs text-rose-500 font-medium">
                    Nomor KK kurang {(16 - recipientInput.kk.length)} digit
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Tempat Lahir</label>
                <input type="text" className="form-input-custom font-medium" value={recipientInput.pob} onChange={e => setRecipientInput({...recipientInput, pob: e.target.value})} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Tanggal Lahir</label>
                <input type="text" placeholder="Hari/Bulan/Tahun" className="form-input-custom font-medium" value={recipientInput.dob} onChange={e => setRecipientInput({...recipientInput, dob: e.target.value})} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Jenis Kelamin</label>
                <select className="form-input-custom font-medium" value={recipientInput.gender} onChange={e => setRecipientInput({...recipientInput, gender: e.target.value as any})}>
                  <option value="Laki-laki">Laki-laki</option>
                  <option value="Perempuan">Perempuan</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Status Hubungan Keluarga</label>
                <select className="form-input-custom font-medium" value={recipientInput.familyStatus} onChange={e => setRecipientInput({...recipientInput, familyStatus: e.target.value})}>
                  <option value="">Pilih Status</option>
                  <option value="Kepala Keluarga">Kepala Keluarga</option>
                  <option value="Istri">Istri</option>
                  <option value="Anak">Anak</option>
                  <option value="Famili Lain">Famili Lain</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Nama Kepala Keluarga</label>
                <input type="text" className="form-input-custom font-medium" value={recipientInput.headOfFamilyName} onChange={e => setRecipientInput({...recipientInput, headOfFamilyName: e.target.value})} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Tgl Lahir Kepala Keluarga</label>
                <input type="text" placeholder="Hari/Bulan/Tahun" className="form-input-custom font-medium" value={recipientInput.headOfFamilyDob} onChange={e => setRecipientInput({...recipientInput, headOfFamilyDob: e.target.value})} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">No Handphone</label>
                <input 
                  type="tel" 
                  placeholder="+62"
                  className="form-input-custom font-medium" 
                  value={recipientInput.contact} 
                  onChange={e => {
                    let val = e.target.value.replace(/[^\d+]/g, '');
                    if (val.startsWith('0')) {
                      val = '+62' + val.substring(1);
                    } else if (val.startsWith('62')) {
                      val = '+' + val;
                    }
                    setRecipientInput({...recipientInput, contact: val});
                  }} 
                />
              </div>

              <div className="space-y-2 lg:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-700">Tujuan Penyaluran</label>
                  <button 
                    type="button"
                    onClick={() => {
                      const rtRw = [recipientInput.rt, recipientInput.rw].filter(Boolean).join('/');
                      const alamatLengkap = [recipientInput.address, rtRw].filter(Boolean).join(' ');
                      const generated = `Permohonan Bantuan ${registrationData.programName || registrationData.aidType || ''} a.n ${recipientInput.name || ''} Alamat ${alamatLengkap} kampung ${recipientInput.kampung || ''} kecamatan ${recipientInput.district || ''}`.trim().replace(/\s+/g, ' ');
                      setRecipientInput({...recipientInput, purpose: generated});
                    }}
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 active:scale-95 duration-100 transition-colors cursor-pointer"
                  >
                    <Wand2 className="w-3 h-3" /> Buat Otomatis
                  </button>
                </div>
                <textarea 
                  className="form-input-custom font-medium min-h-[60px]" 
                  value={recipientInput.purpose} 
                  onChange={e => setRecipientInput({...recipientInput, purpose: e.target.value})} 
                  placeholder="Keterangan singkat penyaluran..." 
                />
              </div>

              <div className="space-y-2 lg:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-700">Tujuan Pengajuan</label>
                  <button 
                    type="button"
                    onClick={() => {
                      const bulan = new Date().toLocaleString('id-ID', { month: 'long' });
                      const rtRw = [recipientInput.rt || '-', recipientInput.rw || '-'].join('/');
                      const computedCount = Math.max(1, editingIndex !== null ? subRecipients.length : subRecipients.length + 1);
                      const generated = `Permohonan Pencairan Dana ${registrationData.fundingSource || ''} ${registrationData.programName || ''} a.n ${recipientInput.name || ''} Sebanyak ${computedCount} Orang Bulan ${bulan} ${recipientInput.address || ''} ${rtRw} kampung ${recipientInput.kampung || ''} kecamatan ${recipientInput.district || ''}`.trim().replace(/\s+/g, ' ');
                      setRecipientInput({...recipientInput, tujuanPengajuan: generated});
                    }}
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 active:scale-95 duration-100 transition-colors cursor-pointer"
                  >
                    <Wand2 className="w-3 h-3" /> Buat Otomatis
                  </button>
                </div>
                <textarea 
                  className="form-input-custom font-medium min-h-[60px]" 
                  value={recipientInput.tujuanPengajuan} 
                  onChange={e => setRecipientInput({...recipientInput, tujuanPengajuan: e.target.value})} 
                  placeholder="Di dalam field ini, terdapat Fitur Rangkum Otomatis. Anda cukup menekan tombol '✨ Buat Otomatis' di sebelah judul field ini." 
                />
              </div>
            </div>

            {/* DOMISILI BLOK */}
            <hr className="border-slate-100" />
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-indigo-500" /> Wilayah Domisili Penerima
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="space-y-2 lg:col-span-4">
                  <label className="text-sm font-semibold text-slate-700">Alamat Lengkap *</label>
                  <textarea className="form-input-custom min-h-[60px]" value={recipientInput.address} onChange={e => setRecipientInput({...recipientInput, address: e.target.value})} placeholder="Jalan" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">RT</label>
                  <input type="text" maxLength={3} className="form-input-custom font-mono" value={recipientInput.rt} onChange={e => setRecipientInput({...recipientInput, rt: e.target.value.replace(/\D/g, '')})} placeholder="000" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">RW</label>
                  <input type="text" maxLength={3} className="form-input-custom font-mono" value={recipientInput.rw} onChange={e => setRecipientInput({...recipientInput, rw: e.target.value.replace(/\D/g, '')})} placeholder="000" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Kampung / Kelurahan</label>
                  <select 
                    className="form-input-custom font-medium" 
                    value={recipientInput.kampung} 
                    onChange={e => {
                      const selectedKampung = e.target.value;
                      let detectedDistrict = recipientInput.district;
                      
                      for (const [district, villages] of Object.entries(SIAK_REGIONAL_DATA)) {
                        if (villages.includes(selectedKampung)) {
                          detectedDistrict = district;
                          break;
                        }
                      }
                      setRecipientInput({...recipientInput, kampung: selectedKampung, district: detectedDistrict});
                    }}
                  >
                    <option value="">Pilih Kampung/Kelurahan</option>
                    {Object.entries(SIAK_REGIONAL_DATA).map(([district, villages]) => (
                      <optgroup key={district} label={district}>
                        {villages.map(v => <option key={v} value={v}>{v}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Kecamatan *</label>
                  <select 
                    required 
                    className="form-input-custom font-medium" 
                    value={recipientInput.district} 
                    onChange={e => setRecipientInput({...recipientInput, district: e.target.value, kampung: ''})}
                  >
                    <option value="">Pilih Kecamatan</option>
                    {Object.keys(SIAK_REGIONAL_DATA).map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* PENDIDIKAN & PERBANKAN BLOK */}
            <hr className="border-slate-100" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Detail Pendidikan (Opsional)</h4>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Nama Sekolah / Instansi</label>
                    <input type="text" className="form-input-custom font-medium" value={recipientInput.schoolName} onChange={e => setRecipientInput({...recipientInput, schoolName: e.target.value})} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase">Tingkatan</label>
                      <input type="text" className="form-input-custom font-medium" placeholder="SD / SMP / Universitas" value={recipientInput.schoolLevel} onChange={e => setRecipientInput({...recipientInput, schoolLevel: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase">Kelas / Semester</label>
                      <input type="text" className="form-input-custom font-medium" value={recipientInput.schoolClass} onChange={e => setRecipientInput({...recipientInput, schoolClass: e.target.value})} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Alamat Sekolah</label>
                    <input type="text" className="form-input-custom font-medium" value={recipientInput.schoolAddress} onChange={e => setRecipientInput({...recipientInput, schoolAddress: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">No Hp Instansi</label>
                    <input 
                      type="tel" 
                      maxLength={13}
                      className="form-input-custom font-mono" 
                      value={recipientInput.schoolPhone} 
                      onChange={e => setRecipientInput({...recipientInput, schoolPhone: e.target.value.replace(/\D/g, '')})} 
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Detail Perbankan (Opsional)</h4>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Nomor Rekening</label>
                    <input 
                      type="text" 
                      maxLength={16}
                      className="form-input-custom font-mono" 
                      value={recipientInput.bankAccountNo} 
                      onChange={e => setRecipientInput({...recipientInput, bankAccountNo: e.target.value.replace(/\D/g, '')})} 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Nama Bank</label>
                    <input type="text" className="form-input-custom font-medium" placeholder="Bank Riau Kepri / Syariah" value={recipientInput.bankName} onChange={e => setRecipientInput({...recipientInput, bankName: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Nama Pemilik Rekening</label>
                    <input type="text" className="form-input-custom font-medium" value={recipientInput.bankAccountHolder} onChange={e => setRecipientInput({...recipientInput, bankAccountHolder: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Catatan Tambahan Mustahik</label>
                    <textarea className="form-input-custom min-h-[50px] font-medium" value={recipientInput.notes} onChange={e => setRecipientInput({...recipientInput, notes: e.target.value})} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-indigo-700 uppercase tracking-wider block">Status Berkas Saat ini *</label>
                    <select
                      className="form-input-custom font-medium bg-white border-indigo-200"
                      value={recipientInput.documentStatus || 'Lengkap'}
                      onChange={e => setRecipientInput({
                        ...recipientInput,
                        documentStatus: e.target.value,
                        documentStatusNotes: e.target.value === 'Lengkap' ? '' : recipientInput.documentStatusNotes
                      })}
                    >
                      <option value="Lengkap">Lengkap</option>
                      <option value="Tidak Lengkap">Tidak Lengkap</option>
                    </select>
                  </div>
                  {recipientInput.documentStatus === 'Tidak Lengkap' && (
                    <div className="space-y-1.5 animate-in slide-in-from-top-1 duration-150">
                      <label className="text-xs font-bold text-rose-700 uppercase tracking-wider block">Keterangan Tidak Lengkap *</label>
                      <input
                        required
                        type="text"
                        placeholder="Contoh: Kurang KK / NIK tidak jelas / dll"
                        className="form-input-custom font-medium bg-white border-rose-200"
                        value={recipientInput.documentStatusNotes || ''}
                        onChange={e => setRecipientInput({...recipientInput, documentStatusNotes: e.target.value})}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* UNGGAH BERKAS PERSYARATAN BLOK (15 SLOT) */}
            <hr className="border-slate-100" />
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4.5 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-1.5 font-sans">
                      <Upload className="w-4 h-4 text-indigo-500 animate-bounce" /> Unggah Berkas Persyaratan (15 Slot)
                    </h4>
                  </div>
                  <p className="text-[11px] text-slate-500 font-semibold leading-relaxed">
                    Unggah pindaian berkas pendukung. Pastikan ukuran file tidak melebihi batas batas penyimpanan.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  {gdriveToken ? (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Sinkronisasi Google Drive Internal Terhubung
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-xs font-bold font-sans">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      Google Drive Kantor Belum Tersambung
                    </div>
                  )}

                  {auth.currentUser?.email === 'muhammad.nawa@gmail.com' && (
                    <button
                      type="button"
                      onClick={handleConnectGDrive}
                      disabled={isConnectingGDrive}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-750 text-white rounded-xl text-xs font-extrabold cursor-pointer transition-colors shadow-sm disabled:opacity-50"
                    >
                      {isConnectingGDrive ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      <span>{gdriveToken ? 'Sambungkan Ulang' : 'Sambungkan Drive Super Admin'}</span>
                    </button>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {documentSlots.map((slot, idx) => (
                  <div 
                    key={idx} 
                    className={cn(
                      "p-3.5 rounded-xl border flex flex-col justify-between min-h-[140px] transition-all",
                      slot.file 
                        ? "bg-emerald-50/45 border-emerald-200 shadow-xs" 
                        : "bg-slate-50 border-slate-200 hover:bg-slate-100/70"
                    )}
                  >
                    {/* Header Slot Label */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono">Slot {idx + 1}</span>
                        {slot.file && (
                          <span className="text-[8px] bg-emerald-100 border border-emerald-200 text-emerald-800 font-black px-1.5 py-0.5 rounded-full uppercase">
                            Aktif
                          </span>
                        )}
                      </div>
                      <div className="mt-1">
                        {slot.isCustomLabel ? (
                          <input
                            type="text"
                            placeholder="Label Manual"
                            className="text-xs font-black text-slate-700 bg-white border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:border-indigo-500 w-full hover:bg-slate-50 transition-colors"
                            value={slot.label === 'Lainnya' ? '' : slot.label}
                            onChange={e => {
                              const updated = [...documentSlots];
                              updated[idx].label = e.target.value || 'Lainnya';
                              setDocumentSlots(updated);
                            }}
                          />
                        ) : (
                          <span className="text-xs font-black text-slate-700 line-clamp-1">{slot.label}</span>
                        )}
                      </div>
                    </div>

                    {/* File Info vs Drag-Click upload Trigger */}
                    <div className="mt-3">
                      {slot.file ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {slot.file.type === 'pdf' ? (
                              <FileText className="w-4 h-4 text-rose-500 shrink-0" />
                            ) : slot.file.type === 'excel' ? (
                              <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                            ) : (
                              <ImageIcon className="w-4 h-4 text-indigo-500 shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-[10px] font-bold text-slate-800 truncate" title={slot.file.name}>
                                {slot.file.name}
                              </p>
                              {slot.file.size && (
                                <p className="text-[8px] text-slate-400 font-mono font-bold leading-none">
                                  {slot.file.size}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 pt-1.5 border-t border-slate-200/50">
                            <button
                              type="button"
                              onClick={() => handleOpenPreview(slot.label, slot.file!.url)}
                              className="flex-1 py-1 text-[9px] text-indigo-600 hover:bg-indigo-50 hover:text-indigo-800 font-bold border border-indigo-100 rounded-lg transition-colors flex items-center justify-center gap-0.5 cursor-pointer"
                            >
                              <Eye className="w-2.5 h-2.5" />
                              Lihat
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveFileForSlot(idx)}
                              className="py-1 px-1.5 text-[9px] text-rose-600 hover:bg-rose-50 hover:text-rose-800 font-bold border border-rose-100 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
                              title="Hapus berkas"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => triggerUploadForSlot(idx)}
                          className="w-full py-2 bg-white border border-dashed border-slate-300 hover:border-indigo-400 rounded-lg text-[10px] font-black text-indigo-600 hover:bg-indigo-50/40 transition-all flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Upload className="w-3 h-3" />
                          <span>Pilih Berkas</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hidden Input File node referenced globally */}
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              onChange={handleFileChange}
              accept="image/*,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            />

            {/* ACTIONS ADD/CANCEL FOR SUB RECIPIENT */}
            <div className="pt-4 flex items-center justify-end gap-3">
              {editingIndex !== null && (
                <button
                  type="button"
                  onClick={handleCancelEditRecipient}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition-all cursor-pointer"
                >
                  Batalkan Edit
                </button>
              )}
              <button
                type="button"
                onClick={handleAddRecipientToSubTable}
                disabled={isAddingToSub}
                className={cn(
                  "px-6 py-2.5 rounded-xl text-sm font-black flex items-center gap-2 transition-all shadow-sm select-none",
                  editingIndex !== null 
                    ? "bg-amber-500 text-white hover:bg-amber-600 shadow-amber-100 cursor-pointer" 
                    : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100 cursor-pointer",
                  isAddingToSub ? "opacity-75 cursor-not-allowed" : ""
                )}
              >
                {editingIndex !== null ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Simpan Perubahan Penerima</span>
                  </>
                ) : (
                  <>
                    {isAddingToSub ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    <span>{isAddingToSub ? 'Memproses...' : 'Tambahkan Penerima ke Sub Tabel'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* SECTION 3: SUB TABEL PENERIMA TERDAFTAR (LIST IN ACTIVE FORM) */}
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-lg">Sub Tabel Penerima ({subRecipients.length} Orang)</h3>
                <p className="text-xs text-slate-500 font-medium">Daftar individu yang akan diajukan bantuan dalam kelompok/ID pendaftaran ini.</p>
              </div>
            </div>
            {subRecipients.length > 0 && (
              <span className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 font-extrabold px-3 py-1 rounded-full">
                {subRecipients.length} Orang Ditambahkan
              </span>
            )}
          </div>

          <div className="overflow-hidden border border-slate-200/60 rounded-xl">
            {subRecipients.length === 0 ? (
              <div className="p-10 text-center space-y-2 bg-slate-50/50">
                <p className="text-slate-400 font-bold text-sm">Belum Ada Penerima dalam Sub-Tabel</p>
                <p className="text-slate-400 text-xs max-w-md mx-auto">
                  Silakan isi data penerima pada formulir **"Form Input Data Penerima"** diatas, kemudian klik tombol **"Tambahkan Penerima ke Sub Tabel"** untuk meregistrasikannya di sub-tabel ini.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto overflow-y-auto max-h-[400px]">
                <table className="w-full text-left border-collapse table-auto text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-black sticky top-0 z-10 shadow-sm">
                    <tr>
                    <th className="px-3.5 py-3 text-center border-r border-slate-200 w-12 font-bold">No</th>
                    <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">Nama Penerima</th>
                    <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">NIK</th>
                    <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">Nomor KK</th>
                    <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">Alamat</th>
                    <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">Kampung</th>
                    <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">Kecamatan</th>
                    <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap text-center">Lihat Berkas</th>
                    <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap text-center">Status Berkas</th>
                    <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">No Rekening</th>
                    <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">Nama Bank</th>
                    <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">Pemilik Rekening</th>
                    <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">Nama Sekolah</th>
                    <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">Tingkat Sekolah</th>
                    <th className="px-3 py-3 border-r border-slate-200 font-bold whitespace-nowrap">Kelas</th>
                    <th className="px-3 py-3 text-center font-bold w-24">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {subRecipients.map((sub, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60 transition-colors text-black font-normal">
                      <td className="px-3.5 py-4 text-center border-r border-slate-200/40 text-xs font-mono">{idx + 1}</td>
                      <td className="px-3 py-4 border-r border-slate-200/40 font-bold text-slate-800 capitalize whitespace-nowrap">{sub.name.toLowerCase()}</td>
                      <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap">{sub.nik}</td>
                      <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap">{sub.kk}</td>
                      <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap max-w-[200px] truncate" title={sub.address}>{sub.address || '-'}</td>
                      <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap">{sub.kampung || '-'}</td>
                      <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap">{sub.district || '-'}</td>
                      <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap text-center min-w-[160px]">
                        {sub.documents && sub.documents.length > 0 ? (
                          <button
                            type="button"
                            disabled={mergingIdx !== null}
                            onClick={async () => {
                              setMergingIdx(idx);
                              try {
                                const { mergeRecipientUploadsOnly } = await import('../lib/pdfMerger');
                                await mergeRecipientUploadsOnly(sub.id || '', sub.documents);
                              } catch (error: any) {
                                alert(error.message || 'Gagal menggabungkan berkas persyaratan.');
                              } finally {
                                setMergingIdx(null);
                              }
                            }}
                            className="text-xs font-bold bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 cursor-pointer hover:scale-102 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all active:scale-95 duration-150 disabled:opacity-50"
                            title="Gabungkan dan lihat 15 slot berkas persyaratan"
                          >
                            {mergingIdx === idx ? (
                              <>
                                <svg className="animate-spin h-3.5 w-3.5 text-indigo-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Memroses...
                              </>
                            ) : (
                              <>
                                <FileText className="w-3.5 h-3.5" />
                                Lihat Berkas
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="text-slate-400 text-xs font-semibold">-</span>
                        )}
                      </td>
                      <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap text-center">
                        <div className="flex flex-col items-center justify-center gap-1">
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-extrabold font-sans",
                            (sub.documentStatus || 'Lengkap') === 'Lengkap' 
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60" 
                              : "bg-rose-50 text-rose-700 border border-rose-200/60"
                          )}>
                            {sub.documentStatus || 'Lengkap'}
                          </span>
                          {(sub.documentStatus || 'Lengkap') === 'Tidak Lengkap' && sub.documentStatusNotes && (
                            <p className="text-[9px] text-rose-600 font-bold max-w-[120px] truncate" title={sub.documentStatusNotes}>
                              {sub.documentStatusNotes}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-4 border-r border-slate-200/40 font-mono text-xs text-black whitespace-nowrap">{sub.bankAccountNo || '-'}</td>
                      <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap uppercase">{sub.bankName || '-'}</td>
                      <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap capitalize">{sub.bankAccountHolder ? sub.bankAccountHolder.toLowerCase() : '-'}</td>
                      <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap truncate max-w-[150px]" title={sub.schoolName}>{sub.schoolName || '-'}</td>
                      <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap uppercase">{sub.schoolLevel || '-'}</td>
                      <td className="px-3 py-4 border-r border-slate-200/40 text-black whitespace-nowrap">{sub.schoolClass || '-'}</td>
                      <td className="px-3 py-4">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleLoadEditRecipient(idx)}
                            className="p-1 px-2 text-indigo-600 hover:text-indigo-800 hover:bg-slate-100 rounded border border-slate-150 shadow-xs transition-colors flex items-center gap-1 text-xs font-semibold cursor-pointer"
                            title="Edit Data Penerima ini"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveRecipientFromSubTable(idx)}
                            className="p-1 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded border border-rose-100 shadow-xs transition-colors cursor-pointer"
                            title="Hapus Penerima ini"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* COMPACT FLOATING FOOTER ACTION ACCORDING TO SYSTEM DESIGN PHILOSOPHY */}
        <div className="fixed bottom-0 right-0 left-64 bg-white/85 backdrop-blur-md border-t border-slate-200 p-4 px-8 flex items-center justify-end z-20 shadow-lg">
          
          <div className="flex items-center gap-3">
            <button 
              type="button" 
              onClick={onCancel} 
              className="px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-150 rounded-xl transition-colors cursor-pointer"
            >
              Batalkan
            </button>
            <div className="h-8 w-px bg-slate-200 mx-1"></div>
            
            <button 
              onClick={handleSaveAllData}
              type="button"
              disabled={isSavingAll}
              className={cn(
                "px-8 py-2.5 bg-indigo-600 text-white rounded-xl font-black flex items-center gap-2 transition-all shadow-md",
                isSavingAll ? "opacity-75 cursor-not-allowed" : "hover:bg-indigo-750 active:scale-95 cursor-pointer"
              )}
            >
              {isSavingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>
                {isSavingAll ? 'Menyimpan...' : (subRecipients.length > 0 
                  ? `Simpan Seluruh Registrasi (${subRecipients.length} Penerima)` 
                  : 'Simpan')}
              </span>
            </button>
          </div>
        </div>
      </form>

      {/* PREVIEW DOCUMENT MODAL */}
      {previewDoc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-55 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-4 px-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                <h4 className="font-bold text-slate-800 text-sm">Pratinjau Berkas: {previewDoc.name}</h4>
              </div>
              <button 
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Modal Body */}
            <div className="p-6 bg-slate-100 flex items-center justify-center min-h-[300px] w-full">
              {previewDoc.url.startsWith('gdrive:') ? (
                previewLoading ? (
                  <div className="text-center p-8 space-y-3 bg-white rounded-2xl border border-slate-100 shadow-sm max-w-md w-full">
                    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
                    <p className="font-bold text-slate-800 text-xs">Mengunduh pindaian dari Google Drive...</p>
                    <p className="text-[10px] text-slate-400">Proses pengambilan data biner secara aman.</p>
                  </div>
                ) : gdriveBase64Data ? (
                  gdriveBase64Data.startsWith('data:image') ? (
                    <div className="flex flex-col items-center gap-4 w-full">
                      <img 
                        src={gdriveBase64Data} 
                        referrerPolicy="no-referrer" 
                        className="max-h-[60vh] object-contain rounded-lg shadow-sm border border-slate-200 bg-white" 
                        alt={previewDoc.name} 
                      />
                      <a
                        href={`https://drive.google.com/file/d/${previewDoc.url.split(':')[1]}/view?usp=drivesdk`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer transition-colors"
                      >
                        <Eye className="w-4 h-4" /> Buka di Google Drive (Tab Baru)
                      </a>
                    </div>
                  ) : gdriveBase64Data.startsWith('data:application/pdf') ? (
                    <div className="flex flex-col items-center gap-4 w-full">
                      <iframe 
                        src={gdriveBase64Data} 
                        title={previewDoc.name}
                        className="w-full h-[60vh] rounded-lg shadow-sm border border-slate-200 bg-white" 
                      />
                      <a
                        href={`https://drive.google.com/file/d/${previewDoc.url.split(':')[1]}/view?usp=drivesdk`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer transition-colors"
                      >
                        <Eye className="w-4 h-4" /> Buka di Google Drive (Tab Baru)
                      </a>
                    </div>
                  ) : (
                    <div className="text-center p-8 space-y-4 bg-white rounded-2xl border border-slate-100 shadow-sm max-w-md w-full">
                      <div className="p-3 bg-indigo-50 text-indigo-600 rounded-full w-14 h-14 mx-auto flex items-center justify-center">
                        <FileText className="w-8 h-8" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 text-sm">{previewDoc.name}</p>
                        <p className="text-xs text-slate-400 mt-1">Berkas format non-media siap disimpan.</p>
                      </div>
                      <div className="flex gap-2 justify-center">
                        <a 
                          href={gdriveBase64Data} 
                          download={previewDoc.name}
                          className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-750 text-white font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5 rotate-180" />
                          Unduh Berkas
                        </a>
                        <a
                          href={`https://drive.google.com/file/d/${previewDoc.url.split(':')[1]}/view?usp=drivesdk`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer transition-colors"
                        >
                          <Eye className="w-4 h-4" /> Buka di Drive
                        </a>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="text-center p-8 space-y-4 bg-white rounded-2xl border border-slate-100 shadow-sm max-w-md w-full">
                    <div className="p-3 bg-rose-50 text-rose-600 rounded-full w-14 h-14 mx-auto flex items-center justify-center">
                      <X className="w-8 h-8" />
                    </div>
                    <p className="font-bold text-slate-800 text-xs">Gagal mengunduh berkas pratinjau</p>
                    <p className="text-[10px] text-slate-400">Pastikan akun Google Anda terhubung dan memiliki izin.</p>
                    <a
                      href={`https://drive.google.com/file/d/${previewDoc.url.split(':')[1]}/view?usp=drivesdk`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer transition-colors justify-center w-full"
                    >
                      <Eye className="w-4 h-4" /> Buka Langsung di Google Drive (Tab Baru)
                    </a>
                  </div>
                )
              ) : previewDoc.url.startsWith('data:image') ? (
                <img 
                  src={previewDoc.url} 
                  referrerPolicy="no-referrer" 
                  className="max-h-[60vh] object-contain rounded-lg shadow-sm border border-slate-200 bg-white" 
                  alt={previewDoc.name} 
                />
              ) : previewDoc.url.startsWith('data:application/pdf') ? (
                <iframe 
                  src={previewDoc.url} 
                  title={previewDoc.name}
                  className="w-full h-[60vh] rounded-lg shadow-sm border border-slate-200 bg-white" 
                />
              ) : (
                <div className="text-center p-8 space-y-4 bg-white rounded-2xl border border-slate-100 shadow-sm max-w-md w-full">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-full w-14 h-14 mx-auto flex items-center justify-center">
                    <FileText className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{previewDoc.name}</p>
                    <p className="text-xs text-slate-400 mt-1">Berkas format biner telah siap disimpan.</p>
                  </div>
                  <a 
                    href={previewDoc.url} 
                    download={previewDoc.name}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-750 text-white font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 rotate-180 animate-pulse" />
                    Unduh Berkas
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
