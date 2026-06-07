import React, { useState, useEffect, useRef } from 'react';
import { 
  Save, X, Upload, FileText, Image as ImageIcon, 
  MapPin, User, Hash, Phone, Calendar, DollarSign,
  Plus, Trash2, Layers, Edit3, Check, Eye, ChevronRight, Loader2, QrCode, Smartphone,
  Sparkles, Cpu, CheckCircle2
} from 'lucide-react';
import { SIAK_REGIONAL_DATA, SIAK_SECTORS, SIAK_AID_TYPES, SIAK_PROGRAM_NAMES, SIAK_COMPANIONS } from '../constants';
import { cn } from '../lib/utils';
import QRCode from 'react-qr-code';
import { AidDocument, Recipient } from '../types';

interface RecipientFormProps {
  onSubmit: (data: any) => void | Promise<void>;
  onCancel: () => void;
  existingRecipients?: Recipient[];
  initialGroupRecipients?: Recipient[];
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
  religion: '',
  education: '',
  job: '',
  maritalStatus: '',
  citizenship: 'WNI',
  passportNo: '',
  kitasNo: '',
  fatherName: '',
  motherName: '',
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

export default function RecipientForm({ onSubmit, onCancel, existingRecipients, initialGroupRecipients }: RecipientFormProps) {
  const generateRegId = () => `REG-${Math.floor(100000 + Math.random() * 900000)}`;

  // Main Registration Data State (Tabel Utama)
  const [registrationData, setRegistrationData] = useState({
    registrationId: generateRegId(),
    serviceType: 'Layanan Konter' as 'Layanan Konter' | 'Program Bulanan',
    source: '',
    institutionName: '',
    personInCharge: '',
    submissionDate: new Date().toISOString().split('T')[0],
    companion: '',
    sector: '',
    subSector: '',
    aidType: '',
    programName: '',
    amountProposed: '',
    purpose: '',
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

  // Local states for 15 slots document upload
  const [documentSlots, setDocumentSlots] = useState<DocumentSlot[]>(() => 
    INITIAL_DOCUMENT_SLOTS.map(s => ({ ...s }))
  );
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{ name: string; url: string } | null>(null);
  const [mergingIdx, setMergingIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI OCR States
  const [ocrLoading, setOcrLoading] = useState<Record<string, boolean>>({});
  const [ocrResults, setOcrResults] = useState<Record<string, {
    nik: string;
    nama: string;
    tempat_lahir: string;
    tanggal_lahir: string;
    alamat: string;
    rt_rw: string;
    kel_desa: string;
    kecamatan: string;
  }>>({});

  const [ocrKkResults, setOcrKkResults] = useState<Record<string, {
    no_kk: string;
    nama_kepala_keluarga: string;
    alamat: string;
    rt_rw: string;
    kode_pos: string;
    desa_kelurahan: string;
    kecamatan: string;
    kabupaten_kota: string;
    provinsi: string;
    anggota_keluarga: {
      no: number;
      nama_lengkap: string;
      nik: string;
      jenis_kelamin: string;
      tempat_lahir: string;
      tanggal_lahir: string;
      agama: string;
      pendidikan: string;
      jenis_pekerjaan: string;
      status_perkawinan: string;
      status_hubungan_keluarga: string;
      kewarganegaraan: string;
      no_paspor: string;
      no_kitas_kitap: string;
      nama_ayah: string;
      nama_ibu: string;
    }[];
  }>>({});

  const formatOcrDob = (dobStr: string) => {
    if (!dobStr) return '';
    // standard DD-MM-YYYY check (or with dots/slashes)
    const match = dobStr.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (match) {
      const [_, d, m, y] = match;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    // standard YYYY-MM-DD
    if (dobStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return dobStr;
    }
    return dobStr;
  };

  const handleExtractKTPAI = async (docId: string, dataUrl: string) => {
    setOcrLoading(prev => ({ ...prev, [docId]: true }));
    try {
      const response = await fetch('/api/gemini/ocr-ktp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData: dataUrl })
      });
      
      if (!response.ok) {
        throw new Error('Gagal mengekstrak data menggunakan server Gemini AI.');
      }
      
      const data = await response.json();
      if (data) {
        setOcrResults(prev => ({ ...prev, [docId]: data }));
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Gagal mengekstrak data dari gambar.');
    } finally {
      setOcrLoading(prev => ({ ...prev, [docId]: false }));
    }
  };

  const handleExtractKKAI = async (docId: string, dataUrl: string) => {
    setOcrLoading(prev => ({ ...prev, [docId]: true }));
    try {
      const response = await fetch('/api/gemini/ocr-kk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData: dataUrl })
      });
      
      if (!response.ok) {
        throw new Error('Gagal mengekstrak Kartu Keluarga menggunakan server Gemini AI.');
      }
      
      const data = await response.json();
      if (data) {
        setOcrKkResults(prev => ({ ...prev, [docId]: data }));
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Gagal mengekstrak data dari Kartu Keluarga.');
    } finally {
      setOcrLoading(prev => ({ ...prev, [docId]: false }));
    }
  };

  const handleApplyKkMetaToFields = (kkOcr: any) => {
    if (!kkOcr) return;

    // Parse RT/RW
    let rtStr = '';
    let rwStr = '';
    if (kkOcr.rt_rw && kkOcr.rt_rw.includes('/')) {
      const parts = kkOcr.rt_rw.split('/');
      rtStr = parts[0]?.trim().replace(/\D/g, '').substring(0, 3).padStart(3, '0') || '';
      rwStr = parts[1]?.trim().replace(/\D/g, '').substring(0, 3).padStart(3, '0') || '';
    } else if (kkOcr.rt_rw) {
      const sanitized = kkOcr.rt_rw.replace(/\D/g, '');
      if (sanitized.length >= 6) {
        rtStr = sanitized.substring(0, 3);
        rwStr = sanitized.substring(3, 6);
      } else {
        rtStr = sanitized.substring(0, 3);
      }
    }

    // Try to auto-match Kampung and Kecamatan
    let foundKampung = '';
    let foundDistrict = '';
    const sanitizedKelDesa = (kkOcr.desa_kelurahan || '').toLowerCase().replace(/kelurahan|desa|kampung/g, '').trim();
    const sanitizedKecamatan = (kkOcr.kecamatan || '').toLowerCase().replace(/kecamatan/g, '').trim();

    for (const [district, villages] of Object.entries(SIAK_REGIONAL_DATA)) {
      if (sanitizedKecamatan && district.toLowerCase().includes(sanitizedKecamatan)) {
        foundDistrict = district;
      }
      for (const v of villages) {
        if (sanitizedKelDesa && v.toLowerCase().includes(sanitizedKelDesa)) {
          foundKampung = v;
          foundDistrict = district;
          break;
        }
      }
    }

    // Find Kepala Keluarga member in members of family, to fill individual fields
    const headMember = kkOcr.anggota_keluarga?.find(
      (m: any) => {
        const status = (m.status_hubungan_keluarga || '').toUpperCase();
        return status === 'KEPALA KELUARGA' || (m.nama_lengkap || '').toUpperCase() === (kkOcr.nama_kepala_keluarga || '').toUpperCase();
      }
    ) || kkOcr.anggota_keluarga?.[0];

    const isPerempuan = headMember?.jenis_kelamin && headMember?.jenis_kelamin.toLowerCase().includes('perempuan');

    setRecipientInput(prev => ({
      ...prev,
      name: headMember?.nama_lengkap || prev.name,
      nik: headMember?.nik ? headMember.nik.toString().replace(/\D/g, '').substring(0, 16) : prev.nik,
      pob: headMember?.tempat_lahir || prev.pob,
      dob: headMember?.tanggal_lahir ? formatOcrDob(headMember.tanggal_lahir) : prev.dob,
      gender: headMember ? (isPerempuan ? 'Perempuan' : 'Laki-laki') : prev.gender,
      familyStatus: headMember?.status_hubungan_keluarga || 'KEPALA KELUARGA',
      religion: headMember?.religion || headMember?.agama || prev.religion,
      education: headMember?.education || headMember?.pendidikan || prev.education,
      job: headMember?.job || headMember?.jenis_pekerjaan || prev.job,
      maritalStatus: headMember?.maritalStatus || headMember?.status_perkawinan || prev.maritalStatus,
      citizenship: headMember?.citizenship || headMember?.kewarganegaraan || 'WNI',
      passportNo: headMember?.passportNo || headMember?.no_paspor || prev.passportNo,
      kitasNo: headMember?.kitasNo || headMember?.no_kitas_kitap || prev.kitasNo,
      fatherName: headMember?.fatherName || headMember?.nama_ayah || prev.fatherName,
      motherName: headMember?.motherName || headMember?.nama_ibu || prev.motherName,
      kk: kkOcr.no_kk || prev.kk,
      headOfFamilyName: kkOcr.nama_kepala_keluarga || prev.headOfFamilyName,
      headOfFamilyDob: headMember?.tanggal_lahir ? formatOcrDob(headMember.tanggal_lahir) : prev.headOfFamilyDob,
      address: kkOcr.alamat || prev.address,
      rt: rtStr || prev.rt,
      rw: rwStr || prev.rw,
      kampung: foundKampung || prev.kampung,
      district: foundDistrict || prev.district
    }));

    setIsAddingToSub(true);
    setTimeout(() => {
      document.getElementById('form-input-penerima')?.scrollIntoView({ behavior: 'smooth' });
    }, 120);
  };

  const handleImportKkMembersToSub = (kkOcr: any) => {
    if (!kkOcr || !kkOcr.anggota_keluarga || kkOcr.anggota_keluarga.length === 0) return;

    // Parse RT/RW
    let rtStr = '';
    let rwStr = '';
    if (kkOcr.rt_rw && kkOcr.rt_rw.includes('/')) {
      const parts = kkOcr.rt_rw.split('/');
      rtStr = parts[0]?.trim().replace(/\D/g, '').substring(0, 3).padStart(3, '0') || '';
      rwStr = parts[1]?.trim().replace(/\D/g, '').substring(0, 3).padStart(3, '0') || '';
    } else if (kkOcr.rt_rw) {
      const sanitized = kkOcr.rt_rw.replace(/\D/g, '');
      if (sanitized.length >= 6) {
        rtStr = sanitized.substring(0, 3);
        rwStr = sanitized.substring(3, 6);
      } else {
        rtStr = sanitized.substring(0, 3);
      }
    }

    // Try to auto-match Kampung and Kecamatan
    let foundKampung = '';
    let foundDistrict = '';
    const sanitizedKelDesa = (kkOcr.desa_kelurahan || '').toLowerCase().replace(/kelurahan|desa|kampung/g, '').trim();
    const sanitizedKecamatan = (kkOcr.kecamatan || '').toLowerCase().replace(/kecamatan/g, '').trim();

    for (const [district, villages] of Object.entries(SIAK_REGIONAL_DATA)) {
      if (sanitizedKecamatan && district.toLowerCase().includes(sanitizedKecamatan)) {
        foundDistrict = district;
      }
      for (const v of villages) {
        if (sanitizedKelDesa && v.toLowerCase().includes(sanitizedKelDesa)) {
          foundKampung = v;
          foundDistrict = district;
          break;
        }
      }
    }

    // Find Head of Family Birth Date if any
    const headMember = kkOcr.anggota_keluarga.find(
      (m: any) => (m.status_hubungan_keluarga || '').toUpperCase() === 'KEPALA KELUARGA'
    );
    const headDobStr = headMember ? formatOcrDob(headMember.tanggal_lahir) : '';

    const newRecipients = kkOcr.anggota_keluarga.map((member: any) => {
      const isPerempuan = member.jenis_kelamin && member.jenis_kelamin.toLowerCase().includes('perempuan');
      return {
        ...DEFAULT_RECIPIENT_INPUT,
        name: member.nama_lengkap || '',
        nik: member.nik ? member.nik.toString().replace(/\D/g, '').substring(0, 16) : '',
        kk: kkOcr.no_kk || '',
        pob: member.tempat_lahir || '',
        dob: formatOcrDob(member.tanggal_lahir),
        gender: isPerempuan ? 'Perempuan' : 'Laki-laki',
        familyStatus: member.status_hubungan_keluarga || '',
        headOfFamilyName: kkOcr.nama_kepala_keluarga || '',
        headOfFamilyDob: headDobStr,
        religion: member.agama || '',
        education: member.pendidikan || '',
        job: member.jenis_pekerjaan || '',
        maritalStatus: member.status_perkawinan || '',
        citizenship: member.kewarganegaraan || 'WNI',
        passportNo: member.no_paspor || '',
        kitasNo: member.no_kitas_kitap || '',
        fatherName: member.nama_ayah || '',
        motherName: member.nama_ibu || '',
        address: kkOcr.alamat || '',
        rt: rtStr,
        rw: rwStr,
        kampung: foundKampung,
        district: foundDistrict,
        notes: `Diimpor otomatis via OCR Kartu Keluarga No. ${kkOcr.no_kk || '-'}`
      };
    });

    setSubRecipients(prev => {
      // Avoid duplicate members if they already exist based on NIK
      const existingNiks = new Set(prev.map(r => r.nik).filter(Boolean));
      const filteredNew = newRecipients.filter((r: any) => !r.nik || !existingNiks.has(r.nik));
      return [...prev, ...filteredNew];
    });
    alert(`Berhasil mengimpor ${newRecipients.length} anggota keluarga ke daftar penerima.`);
  };

  const handleApplyOcrToFields = (ocr: any) => {
    if (!ocr) return;
    
    // Parse RT/RW
    let rtStr = '';
    let rwStr = '';
    if (ocr.rt_rw && ocr.rt_rw.includes('/')) {
      const parts = ocr.rt_rw.split('/');
      rtStr = parts[0]?.trim().replace(/\D/g, '').substring(0, 3).padStart(3, '0') || '';
      rwStr = parts[1]?.trim().replace(/\D/g, '').substring(0, 3).padStart(3, '0') || '';
    } else if (ocr.rt_rw) {
      const sanitized = ocr.rt_rw.replace(/\D/g, '');
      if (sanitized.length >= 6) {
        rtStr = sanitized.substring(0, 3);
        rwStr = sanitized.substring(3, 6);
      } else {
        rtStr = sanitized.substring(0, 3);
      }
    }

    // Try to auto-match Kampung and Kecamatan (village/district)
    let foundKampung = '';
    let foundDistrict = '';
    
    const sanitizedKelDesa = (ocr.kel_desa || '').toLowerCase().replace(/kelurahan|desa|kampung/g, '').trim();
    const sanitizedKecamatan = (ocr.kecamatan || '').toLowerCase().replace(/kecamatan/g, '').trim();

    for (const [district, villages] of Object.entries(SIAK_REGIONAL_DATA)) {
      if (sanitizedKecamatan && district.toLowerCase().includes(sanitizedKecamatan)) {
        foundDistrict = district;
      }
      for (const v of villages) {
        if (sanitizedKelDesa && v.toLowerCase().includes(sanitizedKelDesa)) {
          foundKampung = v;
          foundDistrict = district; // Match overrides
          break;
        }
      }
    }

    setRecipientInput(prev => ({
      ...prev,
      name: ocr.nama || prev.name,
      nik: ocr.nik ? ocr.nik.toString().replace(/\D/g, '').substring(0, 16) : prev.nik,
      pob: ocr.tempat_lahir || prev.pob,
      dob: ocr.tanggal_lahir || prev.dob,
      address: ocr.alamat || prev.address,
      rt: rtStr || prev.rt,
      rw: rwStr || prev.rw,
      kampung: foundKampung || prev.kampung,
      district: foundDistrict || prev.district
    }));

    setIsAddingToSub(true);
    setTimeout(() => {
      document.getElementById('form-input-penerima')?.scrollIntoView({ behavior: 'smooth' });
    }, 120);
  };

  // States for adding custom dropdown options
  const [customSubSectors, setCustomSubSectors] = useState<Record<string, string[]>>({});
  const [customAidTypes, setCustomAidTypes] = useState<Record<string, string[]>>({});
  const [customProgramNames, setCustomProgramNames] = useState<Record<string, string[]>>({});
  const [customCompanions, setCustomCompanions] = useState<string[]>([]);
  const [customPersonInCharge, setCustomPersonInCharge] = useState<string[]>([]);

  const [inputMode, setInputMode] = useState<'manual' | 'hp'>('manual');
  const [hpSessionId] = useState(() => `HP-${Math.random().toString(36).substring(2, 10)}`);
  
  useEffect(() => {
    if (inputMode !== 'hp') return;
    
    let unsubscribe: () => void;
    let isMounted = true;
    
    const initListener = async () => {
      try {
        const { db } = await import('../firebase');
        const { doc, onSnapshot, setDoc, getDoc } = await import('firebase/firestore');
        
        const ref = doc(db, 'ocr_sessions', hpSessionId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(ref, { 
            createdAt: new Date().toISOString(),
            documents: []
          });
        }
        
        if (!isMounted) return;
        
        unsubscribe = onSnapshot(ref, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.documents && Array.isArray(data.documents)) {
              setRegistrationData(prev => {
                // Ensure unique documents
                const currDocs = [...prev.documents];
                let hasNew = false;
                
                data.documents.forEach((remoteDoc: any) => {
                  if (!currDocs.find(d => d.id === remoteDoc.id)) {
                    currDocs.push({
                      id: remoteDoc.id || `DOC-${Math.random().toString(36).substring(2,8)}`,
                      name: remoteDoc.name || remoteDoc.type || 'Dokumen HP',
                      fileUrl: remoteDoc.fileUrl || remoteDoc.dataUrl,
                      type: remoteDoc.type || 'Lainnya',
                      uploadedAt: remoteDoc.uploadedAt || new Date().toISOString()
                    } as any);
                    hasNew = true;
                  }
                });
                
                if (hasNew) {
                  return { ...prev, documents: currDocs };
                }
                return prev;
              });
            }
          }
        });
      } catch (err) {
        console.error("Firebase hp listener error", err);
      }
    };
    
    initListener();
    
    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [inputMode, hpSessionId]);

  useEffect(() => {
    if (initialGroupRecipients && initialGroupRecipients.length > 0) {
      const first = initialGroupRecipients[0];
      setRegistrationData({
        registrationId: first.registrationId || generateRegId(),
        source: first.source || '',
        institutionName: first.institutionName || '',
        personInCharge: first.personInCharge || '',
        submissionDate: first.submissionDate || new Date().toISOString().split('T')[0],
        companion: first.companion || '',
        sector: first.sector || '',
        subSector: first.subSector || '',
        aidType: first.aidType || '',
        programName: first.programName || '',
        amountProposed: first.amountProposed || '',
        purpose: first.purpose || '',
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

    try {
      let base64Url = await convertFileToBase64(file);
      let displaySize = `${(file.size / 1024).toFixed(1)} KB`;

      if (type === 'image') {
        const { compressImage } = await import('../lib/utils');
        base64Url = await compressImage(base64Url);
        const compressedSizeInKB = (base64Url.length * 0.75) / 1024;
        displaySize = `${compressedSizeInKB.toFixed(1)} KB (kompresi)`;
      }

      // Check against Firestore single document limit (roughly 1MB)
      const sizeInBytes = base64Url.length * 0.75;
      if (sizeInBytes >= 1048500) {
        alert(`Gagal: Berkas "${file.name}" terlalu besar (${(sizeInBytes / 1024).toFixed(1)} KB) bahkan setelah dikompresi. Mohon pilih berkas dengan ukuran lebih kecil (maksimal 1MB).`);
        return;
      }

      const updatedSlots = [...documentSlots];
      updatedSlots[activeSlotIndex] = {
        ...updatedSlots[activeSlotIndex],
        file: {
          name: file.name,
          type,
          url: base64Url,
          size: displaySize,
        },
      };
      setDocumentSlots(updatedSlots);
    } catch (err) {
      console.error('Failed to read file:', err);
      alert('Gagal membaca berkas.');
    } finally {
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
    const recipient = subRecipients[index];
    setRecipientInput(recipient);

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
    if (!registrationData.amountProposed) {
      alert('Mohon masukkan Nominal Diajukan.');
      return;
    }

    // Map each subRecipient element, applying the group (Tabel Utama) fields
    const { documents: groupDocs, status: groupStatus, ...groupSettings } = registrationData;
    const submissionData = finalRecipients.map(r => ({
      ...r,
      ...groupSettings,
      amountProposed: Number(registrationData.amountProposed),
      amountDisbursed: r.amountDisbursed ? Number(r.amountDisbursed) : 0,
      documents: [...(r.documents || []), ...(groupDocs || [])]
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
      <div className="flex gap-4 border-b border-slate-200 mb-6 px-1">
        <button
          className={cn("pb-2 px-4 font-black text-sm border-b-2 transition-all duration-300 transform outline-none", inputMode === 'manual' ? "border-indigo-600 text-indigo-700 pointer-events-none" : "border-transparent text-slate-500 hover:text-indigo-600 hover:border-indigo-200 cursor-pointer")}
          onClick={() => setInputMode('manual')}
        >
          Input Manual
        </button>
        <button
          className={cn("pb-2 px-4 font-black text-sm border-b-2 transition-all duration-300 transform outline-none", inputMode === 'hp' ? "border-indigo-600 text-indigo-700 pointer-events-none" : "border-transparent text-slate-500 hover:text-indigo-600 hover:border-indigo-200 cursor-pointer")}
          onClick={() => setInputMode('hp')}
        >
          Input via HP
        </button>
      </div>

      {inputMode === 'hp' ? (
        <div className="bg-slate-50 p-8 rounded-2xl border border-slate-200 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="flex flex-col items-center justify-center text-center max-w-xl mx-auto space-y-6">
            <div className="bg-white p-6 rounded-2xl border-2 border-dashed border-indigo-200 shadow-sm inline-block relative">
               <div className="relative z-10 bg-white p-2 w-[200px] h-[200px] rounded-lg">
                 <QRCode value={(() => {
                   if (typeof window === 'undefined') {
                     return `https://baznas-siak.vercel.app/?scan-docs=true&session=${hpSessionId}`;
                   }
                   let cleanPath = window.location.pathname;
                   if (cleanPath.endsWith('index.html')) {
                     cleanPath = cleanPath.slice(0, -10);
                   }
                   if (!cleanPath.endsWith('/')) {
                     cleanPath += '/';
                   }
                   return `${window.location.origin}${cleanPath}?scan-docs=true&session=${hpSessionId}`;
                 })()} size={184} className="w-full h-full" />
               </div>
            </div>
            
            <div className="space-y-2">
               <h3 className="font-extrabold text-slate-800 text-2xl tracking-tight">Pindai dengan HP Anda</h3>
               <p className="text-slate-500 text-sm leading-relaxed">
                 Buka kamera HP Anda (atau Google Lens) dan scan QR di atas. Dokumen seperti KTP dan KK akan otomatis dikirim ke sini saat Anda ambil foti dari HP.
               </p>
            </div>
          </div>
          
          {registrationData.documents.length > 0 && (
            <div className="mt-8 pt-8 border-t border-slate-200 w-full text-left">
              <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Check className="w-5 h-5 text-emerald-500" />
                Dokumen Terscan ({registrationData.documents.length})
              </h4>
              <div className="flex flex-wrap gap-4">
                {registrationData.documents.map((doc, idx) => {
                  const docId = doc.id || doc.name || idx.toString();
                  const isLoading = ocrLoading[docId];
                  const ocrResult = ocrResults[docId];
                  const ocrKkResult = ocrKkResults[docId];
                  const isKtp = doc.type === 'KTP' || doc.name.toLowerCase().includes('ktp');
                  const isKk = doc.type === 'KK' || doc.name.toLowerCase().includes('kk') || doc.name.toLowerCase().includes('keluarga');
                  const isImage = doc.fileUrl && (doc.fileUrl.startsWith('data:image/') || isKtp || isKk);

                  return (
                    <div 
                      key={doc.id || idx} 
                      className={cn(
                        "bg-white p-3 rounded-xl border border-slate-200 shadow-sm shrink-0 hover:border-indigo-400 group relative transition-all flex flex-col justify-between",
                        ocrResult || ocrKkResult ? "w-[340px]" : "w-72"
                      )}
                    >
                      <div>
                        <div className="relative overflow-hidden rounded-lg mb-2 bg-slate-50 border border-slate-100 flex items-center justify-center aspect-[1.58/1] w-full">
                          <img 
                            src={doc.fileUrl || undefined} 
                            alt={doc.name} 
                            className="max-w-full max-h-full object-contain transform group-hover:scale-105 transition-transform duration-300" 
                          />
                          <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 duration-200 rounded-lg">
                            <button
                              type="button"
                              onClick={() => setPreviewDoc({ name: doc.name, url: doc.fileUrl })}
                              className="bg-white text-slate-800 p-1.5 rounded-lg shadow-md font-bold text-xs flex items-center gap-1 hover:bg-slate-50 transition-colors cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Pratinjau
                            </button>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-700 truncate text-left" title={doc.name}>{doc.name}</p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 font-bold text-slate-500 rounded uppercase tracking-wider">{doc.type}</span>
                            <span className="text-[9px] text-slate-400">Terunduh</span>
                          </div>
                        </div>
                      </div>

                      {/* AI OCR Actions & Forms */}
                      {isImage && (
                        <div className="mt-3 pt-3 border-t border-slate-100">
                          {isKk ? (
                            <>
                              {!ocrKkResult && !isLoading && (
                                <button
                                  type="button"
                                  onClick={() => handleExtractKKAI(docId, doc.fileUrl)}
                                  className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[10px] py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 transition-colors border border-indigo-100 cursor-pointer"
                                >
                                  <Sparkles className="w-3 h-3 text-indigo-600 animate-pulse" />
                                  Ekstrak KK dengan AI Gemini
                                </button>
                              )}

                              {isLoading && (
                                <div className="w-full py-2 flex flex-col items-center justify-center gap-1 bg-indigo-50/50 rounded-lg border border-indigo-100/50">
                                  <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                                  <span className="text-[8px] font-bold text-indigo-700 uppercase tracking-wider animate-pulse font-mono">Memproses KK...</span>
                                </div>
                              )}

                              {ocrKkResult && (
                                <div className="mt-2.5 p-2 bg-emerald-50 rounded-lg border border-emerald-200 text-center space-y-1">
                                  <div className="flex items-center justify-between pb-1 border-b border-emerald-200/60">
                                    <span className="text-[9px] uppercase tracking-wider font-extrabold text-emerald-800 flex items-center gap-1">
                                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> KK Teridentifikasi
                                    </span>
                                    <button 
                                      type="button"
                                      onClick={() => setOcrKkResults(prev => {
                                        const copy = { ...prev };
                                        delete copy[docId];
                                        return copy;
                                      })}
                                      className="text-[9px] text-rose-500 hover:text-rose-700 font-bold cursor-pointer"
                                    >
                                      Reset
                                    </button>
                                  </div>
                                  <p className="text-[10px] text-slate-700 font-medium text-left leading-normal">
                                    No KK: <span className="font-mono font-bold text-slate-900">{ocrKkResult.no_kk || '-'}</span>
                                  </p>
                                  <p className="text-[10px] text-slate-700 font-medium text-left leading-normal truncate">
                                    Kepala: <span className="font-bold text-slate-900">{ocrKkResult.nama_kepala_keluarga || '-'}</span>
                                  </p>
                                  <div className="pt-2 grid grid-cols-2 gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleApplyKkMetaToFields(ocrKkResult)}
                                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-1 px-1 rounded text-[9px] transition-all cursor-pointer"
                                    >
                                      Gunakan Profil
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleImportKkMembersToSub(ocrKkResult)}
                                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1 px-1 rounded text-[9px] transition-all cursor-pointer"
                                    >
                                      Impor Anggota
                                    </button>
                                  </div>
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              {!ocrResult && !isLoading && (
                                <button
                                  type="button"
                                  onClick={() => handleExtractKTPAI(docId, doc.fileUrl)}
                                  className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[10px] py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 transition-colors border border-indigo-100 cursor-pointer"
                                >
                                  <Sparkles className="w-3 h-3 text-indigo-600 animate-pulse" />
                                  Ekstrak KTP dengan AI Gemini
                                </button>
                              )}

                              {isLoading && (
                                <div className="w-full py-2 flex flex-col items-center justify-center gap-1 bg-indigo-50/50 rounded-lg border border-indigo-100/50">
                                  <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                                  <span className="text-[8px] font-bold text-indigo-700 uppercase tracking-wider animate-pulse">Menghubungi Gemini AI...</span>
                                </div>
                              )}

                              {ocrResult && (
                                <div className="mt-2.5 p-2 bg-slate-50 rounded-lg border border-slate-200/80 space-y-2 text-left">
                                  <div className="flex items-center justify-between pb-1 border-b border-slate-200/60">
                                    <span className="text-[9px] uppercase tracking-wider font-extrabold text-indigo-700 flex items-center gap-1">
                                      <Cpu className="w-2.5 h-2.5" /> Form Ekstraksi KTP
                                    </span>
                                    <button 
                                      type="button"
                                      onClick={() => setOcrResults(prev => {
                                        const copy = { ...prev };
                                        delete copy[docId];
                                        return copy;
                                      })}
                                      className="text-[9px] text-rose-500 hover:text-rose-700 font-bold cursor-pointer"
                                    >
                                      Reset
                                    </button>
                                  </div>

                                  <div className="space-y-1.5">
                                    <div className="space-y-0.5">
                                      <label className="text-[8px] font-bold text-slate-500 uppercase block leading-none">NIK</label>
                                      <input 
                                        type="text" 
                                        value={ocrResult.nik}
                                        onChange={(e) => setOcrResults(prev => ({
                                          ...prev,
                                          [docId]: { ...ocrResult, nik: e.target.value }
                                        }))}
                                        className="w-full bg-white border border-slate-200 px-1.5 py-0.5 text-[10px] rounded font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                      />
                                    </div>

                                    <div className="space-y-0.5">
                                      <label className="text-[8px] font-bold text-slate-500 uppercase block leading-none">Nama Lengkap</label>
                                      <input 
                                        type="text" 
                                        value={ocrResult.nama}
                                        onChange={(e) => setOcrResults(prev => ({
                                          ...prev,
                                          [docId]: { ...ocrResult, nama: e.target.value }
                                        }))}
                                        className="w-full bg-white border border-slate-200 px-1.5 py-0.5 text-[10px] rounded font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                      />
                                    </div>

                                    <div className="grid grid-cols-2 gap-1">
                                      <div className="space-y-0.5">
                                        <label className="text-[8px] font-bold text-slate-500 uppercase block leading-none">Tempat Lahir</label>
                                        <input 
                                          type="text" 
                                          value={ocrResult.tempat_lahir}
                                          onChange={(e) => setOcrResults(prev => ({
                                            ...prev,
                                            [docId]: { ...ocrResult, tempat_lahir: e.target.value }
                                          }))}
                                          className="w-full bg-white border border-slate-200 px-1 py-0.5 text-[10px] rounded text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                        />
                                      </div>
                                      <div className="space-y-0.5">
                                        <label className="text-[8px] font-bold text-slate-500 uppercase block leading-none">Tgl Lahir</label>
                                        <input 
                                          type="text" 
                                          value={ocrResult.tanggal_lahir}
                                          onChange={(e) => setOcrResults(prev => ({
                                            ...prev,
                                            [docId]: { ...ocrResult, tanggal_lahir: e.target.value }
                                          }))}
                                          className="w-full bg-white border border-slate-200 px-1 py-0.5 text-[10px] rounded text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                        />
                                      </div>
                                    </div>

                                    <div className="space-y-0.5">
                                      <label className="text-[8px] font-bold text-slate-500 uppercase block leading-none">Alamat</label>
                                      <input 
                                        type="text" 
                                        value={ocrResult.alamat}
                                        onChange={(e) => setOcrResults(prev => ({
                                          ...prev,
                                          [docId]: { ...ocrResult, alamat: e.target.value }
                                        }))}
                                        className="w-full bg-white border border-slate-200 px-1.5 py-0.5 text-[10px] rounded text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                      />
                                    </div>

                                    <div className="grid grid-cols-3 gap-1">
                                      <div className="space-y-0.5">
                                        <label className="text-[8px] font-bold text-slate-500 uppercase block leading-none">RT/RW</label>
                                        <input 
                                          type="text" 
                                          value={ocrResult.rt_rw}
                                          onChange={(e) => setOcrResults(prev => ({
                                            ...prev,
                                            [docId]: { ...ocrResult, rt_rw: e.target.value }
                                          }))}
                                          className="w-full bg-white border border-slate-200 px-1 py-0.5 text-[9px] rounded text-slate-700 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                        />
                                      </div>
                                      <div className="space-y-0.5">
                                        <label className="text-[8px] font-bold text-slate-500 uppercase block leading-none">Kel/Desa</label>
                                        <input 
                                          type="text" 
                                          value={ocrResult.kel_desa}
                                          onChange={(e) => setOcrResults(prev => ({
                                            ...prev,
                                            [docId]: { ...ocrResult, kel_desa: e.target.value }
                                          }))}
                                          className="w-full bg-white border border-slate-200 px-1 py-0.5 text-[9px] rounded text-slate-700 truncate focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                        />
                                      </div>
                                      <div className="space-y-0.5">
                                        <label className="text-[8px] font-bold text-slate-500 uppercase block leading-none">Kecamatan</label>
                                        <input 
                                          type="text" 
                                          value={ocrResult.kecamatan}
                                          onChange={(e) => setOcrResults(prev => ({
                                            ...prev,
                                            [docId]: { ...ocrResult, kecamatan: e.target.value }
                                          }))}
                                          className="w-full bg-white border border-slate-200 px-1 py-0.5 text-[9px] rounded text-slate-700 truncate focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                        />
                                      </div>
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleApplyOcrToFields(ocrResult)}
                                    className="w-full mt-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white py-1 px-2 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1 shadow-sm cursor-pointer hover:shadow-md"
                                  >
                                    <CheckCircle2 className="w-3 h-3" />
                                    Gunakan Data Ini
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* KK EXTRACTED FAMILY TABLES VIEW */}
              {(Object.entries(ocrKkResults) as [string, any][]).map(([docId, kkOcr]) => {
                if (!kkOcr) return null;
                return (
                  <div key={docId} className="mt-8 bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-50 rounded-xl text-indigo-600 shadow-inner">
                          <Check className="w-6 h-6 text-emerald-600 stroke-[3]" />
                        </div>
                        <div>
                          <h5 className="font-extrabold text-slate-800 text-base">Hasil Ekstraksi Kartu Keluarga: <span className="font-mono text-indigo-700">{kkOcr.no_kk || '-'}</span></h5>
                          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Kepala Keluarga: <span className="text-slate-700 font-bold">{kkOcr.nama_kepala_keluarga || '-'}</span></p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleApplyKkMetaToFields(kkOcr)}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer hover:shadow-md"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Gunakan Identitas & Alamat KK
                        </button>
                        <button
                          type="button"
                          onClick={() => handleImportKkMembersToSub(kkOcr)}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer hover:shadow-md"
                        >
                          <Plus className="w-4 h-4" />
                          Impor Semua sebagai Penerima ({kkOcr.anggota_keluarga?.length || 0})
                        </button>
                        <button
                          type="button"
                          onClick={() => setOcrKkResults(prev => {
                            const copy = { ...prev };
                            delete copy[docId];
                            return copy;
                          })}
                          className="p-2 bg-rose-50 text-rose-600 hover:bg-rose-100 font-bold text-xs rounded-xl transition-all border border-rose-100 cursor-pointer"
                        >
                          Reset KK
                        </button>
                      </div>
                    </div>

                    <div className="text-xs text-slate-600 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-white p-4 rounded-xl border border-slate-200/60 shadow-inner">
                      <div><strong className="text-slate-500 uppercase text-[9px] block">Alamat Rumah</strong> <span className="text-sm font-semibold text-slate-800">{kkOcr.alamat || '-'}</span></div>
                      <div><strong className="text-slate-500 uppercase text-[9px] block">RT / RW</strong> <span className="text-sm font-semibold text-slate-800 font-mono">{kkOcr.rt_rw || '-'}</span></div>
                      <div><strong className="text-slate-500 uppercase text-[9px] block">Desa / Kelurahan</strong> <span className="text-sm font-semibold text-slate-800">{kkOcr.desa_kelurahan || '-'}</span></div>
                      <div><strong className="text-slate-500 uppercase text-[9px] block">Kecamatan</strong> <span className="text-sm font-semibold text-slate-800">{kkOcr.kecamatan || '-'}</span></div>
                      <div><strong className="text-slate-500 uppercase text-[9px] block">Kabupaten / Kota</strong> <span className="text-sm font-semibold text-slate-800">{kkOcr.kabupaten_kota || '-'}</span></div>
                      <div><strong className="text-slate-500 uppercase text-[9px] block">Provinsi</strong> <span className="text-sm font-semibold text-slate-800">{kkOcr.provinsi || '-'}</span></div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-700 uppercase font-bold text-[9px] tracking-wider border-b border-slate-200">
                          <tr>
                            <th className="p-3 w-12 text-center">No</th>
                            <th className="p-3">Nama Lengkap</th>
                            <th className="p-3">NIK</th>
                            <th className="p-3">JK</th>
                            <th className="p-3">Tempat, Tgl Lahir</th>
                            <th className="p-3">Hubungan</th>
                            <th className="p-3">Pekerjaan</th>
                            <th className="p-3">Silsilah Ortu</th>
                            <th className="p-3 text-right">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {kkOcr.anggota_keluarga?.map((member, mIdx) => {
                            const isPerempuan = member.jenis_kelamin && member.jenis_kelamin.toLowerCase().includes('perempuan');
                            
                            // Build standard recipient structure for individual import
                            const headOfFamilyMember = kkOcr.anggota_keluarga.find(
                              (m: any) => (m.status_hubungan_keluarga || '').toUpperCase() === 'KEPALA KELUARGA'
                            );
                            const headDobStr = headOfFamilyMember ? formatOcrDob(headOfFamilyMember.tanggal_lahir) : '';

                            // Parse RT/RW
                            let rtStr = '';
                            let rwStr = '';
                            if (kkOcr.rt_rw && kkOcr.rt_rw.includes('/')) {
                              const parts = kkOcr.rt_rw.split('/');
                              rtStr = parts[0]?.trim().replace(/\D/g, '').substring(0, 3).padStart(3, '0') || '';
                              rwStr = parts[1]?.trim().replace(/\D/g, '').substring(0, 3).padStart(3, '0') || '';
                            } else if (kkOcr.rt_rw) {
                              const sanitized = kkOcr.rt_rw.replace(/\D/g, '');
                              if (sanitized.length >= 6) {
                                rtStr = sanitized.substring(0, 3);
                                rwStr = sanitized.substring(3, 6);
                              } else {
                                rtStr = sanitized.substring(0, 3);
                              }
                            }

                            // Auto-match regional data
                            let foundKampung = '';
                            let foundDistrict = '';
                            const fdKel = (kkOcr.desa_kelurahan || '').toLowerCase().replace(/kelurahan|desa|kampung/g, '').trim();
                            const fdKec = (kkOcr.kecamatan || '').toLowerCase().replace(/kecamatan/g, '').trim();
                            for (const [district, villages] of Object.entries(SIAK_REGIONAL_DATA)) {
                              if (fdKec && district.toLowerCase().includes(fdKec)) {
                                foundDistrict = district;
                              }
                              for (const v of villages) {
                                if (fdKel && v.toLowerCase().includes(fdKel)) {
                                  foundKampung = v;
                                  foundDistrict = district;
                                  break;
                                }
                              }
                            }

                            const memberRecipient = {
                              ...DEFAULT_RECIPIENT_INPUT,
                              name: member.nama_lengkap || '',
                              nik: member.nik ? member.nik.toString().replace(/\D/g, '').substring(0, 16) : '',
                              kk: kkOcr.no_kk || '',
                              pob: member.tempat_lahir || '',
                              dob: formatOcrDob(member.tanggal_lahir),
                              gender: isPerempuan ? 'Perempuan' : 'Laki-laki',
                              familyStatus: member.status_hubungan_keluarga || '',
                              headOfFamilyName: kkOcr.nama_kepala_keluarga || '',
                              headOfFamilyDob: headDobStr,
                              religion: member.agama || '',
                              education: member.pendidikan || '',
                              job: member.jenis_pekerjaan || '',
                              maritalStatus: member.status_perkawinan || '',
                              citizenship: member.kewarganegaraan || 'WNI',
                              passportNo: member.no_paspor || '',
                              kitasNo: member.no_kitas_kitap || '',
                              fatherName: member.nama_ayah || '',
                              motherName: member.nama_ibu || '',
                              address: kkOcr.alamat || '',
                              rt: rtStr,
                              rw: rwStr,
                              kampung: foundKampung,
                              district: foundDistrict,
                              notes: `Diimpor tunggal via OCR Kartu Keluarga No. ${kkOcr.no_kk || '-'}`
                            };

                             const handleImportIndividual = () => {
                              setSubRecipients(prev => {
                                const exists = prev.some(r => r.nik && r.nik === memberRecipient.nik);
                                if (exists) {
                                  alert(`Anggota keluarga "${member.nama_lengkap}" sudah ada di daftar.`);
                                  return prev;
                                }
                                return [...prev, memberRecipient];
                              });
                              alert(`Berhasil mengimpor "${member.nama_lengkap}" ke daftar.`);
                            };

                            const handleApplyIndividualToForm = () => {
                              setRecipientInput(memberRecipient);
                              setIsAddingToSub(true);
                              setTimeout(() => {
                                document.getElementById('form-input-penerima')?.scrollIntoView({ behavior: 'smooth' });
                              }, 120);
                            };

                            return (
                              <tr key={member.no || mIdx} className="hover:bg-slate-50 transition-colors">
                                <td className="p-3 font-medium text-slate-400 text-center">{member.no || mIdx + 1}</td>
                                <td className="p-3 font-semibold text-slate-800 leading-tight text-xs">{member.nama_lengkap || '-'}</td>
                                <td className="p-3 font-mono font-medium text-slate-500 text-xs">{member.nik || '-'}</td>
                                <td className="p-3 text-[10px]">
                                  <span className={cn(
                                    "px-1.5 py-0.5 rounded font-extrabold uppercase text-[9px]",
                                    isPerempuan ? "bg-pink-50 text-pink-700 border border-pink-100" : "bg-blue-50 text-blue-700 border border-blue-100"
                                  )}>
                                    {isPerempuan ? "Perempuan" : "Laki-laki"}
                                  </span>
                                </td>
                                <td className="p-3 leading-tight text-xs">
                                  <div className="font-semibold text-slate-700">{member.tempat_lahir || '-'}</div>
                                  <div className="text-[10px] text-slate-400 font-mono">{member.tanggal_lahir || '-'}</div>
                                </td>
                                <td className="p-3"><span className="px-1.5 py-0.5 bg-slate-100 rounded font-bold text-[10px] text-slate-600 uppercase tracking-wide border border-slate-200">{member.status_hubungan_keluarga || '-'}</span></td>
                                <td className="p-3 text-slate-600 text-xs max-w-[140px] truncate" title={member.jenis_pekerjaan}>{member.jenis_pekerjaan || '-'}</td>
                                <td className="p-3 text-[11px] leading-tight text-slate-600">
                                  <div><strong className="text-slate-400">A:</strong> {member.nama_ayah || '-'}</div>
                                  <div><strong className="text-slate-400">I:</strong> {member.nama_ibu || '-'}</div>
                                </td>
                                <td className="p-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={handleApplyIndividualToForm}
                                      className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-[10px] rounded-lg border border-amber-200 transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                                    >
                                      <Check className="w-3 h-3 text-amber-600" />
                                      Gunakan Identitas & Isi Form
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleImportIndividual}
                                      className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[10px] rounded-lg border border-indigo-100 hover:border-indigo-200 transition-all cursor-pointer"
                                    >
                                      Impor Anggota
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

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
              <label className="text-sm font-semibold text-slate-700">Jenis Layanan</label>
              <select 
                className="form-input-custom font-medium" 
                value={registrationData.serviceType} 
                onChange={e => setRegistrationData({...registrationData, serviceType: e.target.value as 'Layanan Konter' | 'Program Bulanan'})}
              >
                <option value="Layanan Konter">Layanan Konter</option>
                <option value="Program Bulanan">Program Bulanan</option>
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
                <option value="KLM">KLM</option>
                <option value="UPZ">UPZ</option>
                <option value="Online">Online</option>
                <option value="Instansi">Instansi</option>
                <option value="Lembaga">Lembaga</option>
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
                {Object.keys(SIAK_SECTORS).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-700">Sub Bidang</label>
                {registrationData.sector && (
                  <button 
                    type="button" 
                    onClick={() => setIsAddingSubSector(!isAddingSubSector)}
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 active:scale-95 duration-100 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Tambah Manual
                  </button>
                )}
              </div>
              <select 
                className="form-input-custom font-medium" 
                value={registrationData.subSector} 
                onChange={e => setRegistrationData({...registrationData, subSector: e.target.value})}
                disabled={!registrationData.sector}
              >
                <option value="">Pilih Sub Bidang</option>
                {registrationData.sector && [
                  ...(SIAK_SECTORS[registrationData.sector] || []),
                  ...(customSubSectors[registrationData.sector] || [])
                ].map(ss => (
                  <option key={ss} value={ss}>{ss}</option>
                ))}
              </select>
              {isAddingSubSector && (
                <div className="mt-1.5 p-2 bg-indigo-50/50 rounded-xl border border-indigo-100 flex gap-2 items-center duration-150 animate-in fade-in-50 slide-in-from-top-1">
                  <input 
                    type="text" 
                    placeholder="Nama Sub Bidang baru..."
                    className="form-input-custom font-medium text-xs bg-white py-1 flex-1 h-8"
                    value={newSubSectorVal}
                    onChange={e => setNewSubSectorVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubSector(); } }}
                  />
                  <button
                    type="button"
                    onClick={handleAddSubSector}
                    className="bg-indigo-600 text-white font-extrabold text-[10px] px-2.5 py-1.5 rounded-lg hover:bg-indigo-750 transition-colors cursor-pointer"
                  >
                    Simpan
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsAddingSubSector(false); setNewSubSectorVal(''); }}
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
                ].map(ss => (
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
                onChange={e => setRegistrationData({...registrationData, programName: e.target.value})}
                disabled={!registrationData.sector}
              >
                <option value="">Pilih Program</option>
                {registrationData.sector && [
                  ...(SIAK_PROGRAM_NAMES[registrationData.sector] || []),
                  ...(customProgramNames[registrationData.sector] || [])
                ].map(p => (
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

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-extrabold text-emerald-800 flex items-center gap-1">
                Nominal Diajukan (IDR) *
              </label>
              <input 
                required 
                type="text" 
                className="form-input-custom bg-emerald-50/20 border-emerald-300 focus:border-emerald-500 font-bold text-emerald-800" 
                value={registrationData.amountProposed ? new Intl.NumberFormat('id-ID').format(Number(registrationData.amountProposed)) : ''} 
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '');
                  setRegistrationData({...registrationData, amountProposed: val});
                }} 
              />
            </div>

            <div className="space-y-2 md:col-span-3">
              <label className="text-sm font-semibold text-slate-700">Mengajukan Bantuan Untuk / Keterangan</label>
              <input type="text" className="form-input-custom font-medium" value={registrationData.purpose} onChange={e => setRegistrationData({...registrationData, purpose: e.target.value})} placeholder="Tuliskan tujuan permohonan bantuan secara spesifik dan representatif" />
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

          <div className="space-y-8">
            {/* GABUNGAN FORM KTP & KARTU KELUARGA */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              {/* PANEL BLUE (KARTU TANDA PENDUDUK - KTP) */}
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200/80 shadow-inner space-y-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full -mr-16 -mt-16 pointer-events-none"></div>
                <div className="border-b border-indigo-100 pb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg shadow-sm">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-slate-800 text-sm tracking-wide">KARTU TANDA PENDUDUK (KTP)</h4>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Identitas Kependudukan Mandiri</p>
                    </div>
                  </div>
                  <span className="text-[9px] bg-indigo-50 text-indigo-700 font-extrabold px-2.5 py-0.5 rounded border border-indigo-100/50 uppercase tracking-widest font-mono">REPUBLIK INDONESIA</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">NIK (Nomor Induk Kependudukan) *</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Hash className="w-4 h-4" />
                      </div>
                      <input 
                        type="text" 
                        maxLength={16} 
                        className="form-input-custom pl-9 font-mono font-bold text-indigo-900 placeholder-slate-300" 
                        value={recipientInput.nik} 
                        onChange={e => setRecipientInput({...recipientInput, nik: e.target.value.replace(/\D/g, '')})} 
                        placeholder="317XXXXXXXXXXXXXXXX" 
                      />
                    </div>
                    {recipientInput.nik.length > 0 && recipientInput.nik.length < 16 && (
                      <p className="text-[10px] text-rose-500 font-bold bg-rose-50/50 px-2 py-0.5 rounded border border-rose-100/40 inline-block">
                        Digit NIK kurang {(16 - recipientInput.nik.length)} angka (Harus 16 angka)
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Nama Lengkap (Sesuai KTP) *</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <User className="w-4 h-4" />
                      </div>
                      <input 
                        type="text" 
                        className="form-input-custom pl-9 font-bold text-slate-800 placeholder-slate-300 capitalize" 
                        value={recipientInput.name} 
                        onChange={e => setRecipientInput({...recipientInput, name: e.target.value})} 
                        placeholder="NAMA LENGKAP PENERIMA" 
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Tempat Lahir</label>
                    <input 
                      type="text" 
                      className="form-input-custom font-semibold text-slate-800" 
                      value={recipientInput.pob} 
                      onChange={e => setRecipientInput({...recipientInput, pob: e.target.value})} 
                      placeholder="Kabupaten / Kota" 
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Tanggal Lahir</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <input 
                        type="text" 
                        className="form-input-custom pl-9 font-semibold text-slate-800" 
                        placeholder="DD-MM-YYYY atau Tgl-Bln-Thn" 
                        value={recipientInput.dob} 
                        onChange={e => setRecipientInput({...recipientInput, dob: e.target.value})} 
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Jenis Kelamin</label>
                    <select 
                      className="form-input-custom font-semibold text-slate-800" 
                      value={recipientInput.gender} 
                      onChange={e => setRecipientInput({...recipientInput, gender: e.target.value as any})}
                    >
                      <option value="Laki-laki">Laki-Laki</option>
                      <option value="Perempuan">Perempuan</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Agama</label>
                    <select 
                      className="form-input-custom font-semibold text-slate-800" 
                      value={recipientInput.religion || ''} 
                      onChange={e => setRecipientInput({...recipientInput, religion: e.target.value})}
                    >
                      <option value="">Pilih Agama</option>
                      <option value="ISLAM">ISLAM</option>
                      <option value="KRISTEN">KRISTEN</option>
                      <option value="KATOLIK">KATOLIK</option>
                      <option value="HINDU">HINDU</option>
                      <option value="BUDHA">BUDHA</option>
                      <option value="KHONGHUCU">KHONGHUCU</option>
                      <option value="LAINNYA">LAINNYA</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Status Perkawinan</label>
                    <select 
                      className="form-input-custom font-semibold text-slate-800" 
                      value={recipientInput.maritalStatus || ''} 
                      onChange={e => setRecipientInput({...recipientInput, maritalStatus: e.target.value})}
                    >
                      <option value="">Pilih Status</option>
                      <option value="BELUM KAWIN">BELUM KAWIN</option>
                      <option value="KAWIN">KAWIN</option>
                      <option value="CERAI HIDUP">CERAI HIDUP</option>
                      <option value="CERAI MATI">CERAI MATI</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Pekerjaan</label>
                    <input 
                      type="text" 
                      className="form-input-custom font-semibold text-slate-800 capitalize" 
                      value={recipientInput.job || ''} 
                      onChange={e => setRecipientInput({...recipientInput, job: e.target.value})} 
                      placeholder="Contoh: Wiraswasta, Buruh" 
                    />
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Kewarganegaraan</label>
                    <select 
                      className="form-input-custom font-semibold text-slate-800" 
                      value={recipientInput.citizenship || 'WNI'} 
                      onChange={e => setRecipientInput({...recipientInput, citizenship: e.target.value})}
                    >
                      <option value="WNI">WNI (WARGA NEGARA INDONESIA)</option>
                      <option value="WNA">WNA (WARGA NEGARA ASING)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* PANEL GREEN (KARTU KELUARGA - KK) */}
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200/80 shadow-inner space-y-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full -mr-16 -mt-16 pointer-events-none"></div>
                <div className="border-b border-emerald-100 pb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg shadow-sm">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-slate-800 text-sm tracking-wide">KARTU KELUARGA (KK)</h4>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Silsilah & Hubungan Keluarga</p>
                    </div>
                  </div>
                  <span className="text-[9px] bg-emerald-50 text-emerald-700 font-extrabold px-2.5 py-0.5 rounded border border-emerald-100/50 uppercase tracking-widest font-mono">NO. BLANGKO KK</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Nomor KK (Kartu Keluarga) *</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Hash className="w-4 h-4" />
                      </div>
                      <input 
                        type="text" 
                        maxLength={16} 
                        className="form-input-custom pl-9 font-mono font-bold text-emerald-900 placeholder-slate-300" 
                        value={recipientInput.kk} 
                        onChange={e => setRecipientInput({...recipientInput, kk: e.target.value.replace(/\D/g, '')})} 
                        placeholder="140XXXXXXXXXXXXXXXX" 
                      />
                    </div>
                    {recipientInput.kk.length > 0 && recipientInput.kk.length < 16 && (
                      <p className="text-[10px] text-rose-500 font-bold bg-rose-50/50 px-2 py-0.5 rounded border border-rose-100/40 inline-block">
                        Digit No KK kurang {(16 - recipientInput.kk.length)} angka (Harus 16 angka)
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Nama Kepala Keluarga *</label>
                    <input 
                      type="text" 
                      className="form-input-custom font-bold text-slate-800 capitalize placeholder-slate-300" 
                      value={recipientInput.headOfFamilyName} 
                      onChange={e => setRecipientInput({...recipientInput, headOfFamilyName: e.target.value})} 
                      placeholder="NAMA KEPALA KELUARGA" 
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Tgl Lahir Kepala Keluarga (Opsional)</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <input 
                        type="text" 
                        className="form-input-custom pl-9 font-semibold text-slate-800 placeholder-slate-300" 
                        placeholder="DD-MM-YYYY" 
                        value={recipientInput.headOfFamilyDob} 
                        onChange={e => setRecipientInput({...recipientInput, headOfFamilyDob: e.target.value})} 
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Status Hubungan Keluarga *</label>
                    <select 
                      className="form-input-custom font-semibold text-indigo-700 bg-indigo-50/50 border-indigo-200" 
                      value={recipientInput.familyStatus} 
                      onChange={e => setRecipientInput({...recipientInput, familyStatus: e.target.value})}
                    >
                      <option value="">Pilih Hubungan</option>
                      <option value="KEPALA KELUARGA">KEPALA KELUARGA</option>
                      <option value="ISTRI">ISTRI</option>
                      <option value="ANAK">ANAK</option>
                      <option value="MENANTU">MENANTU</option>
                      <option value="CUCU">CUCU</option>
                      <option value="ORANG TUA">ORANG TUA</option>
                      <option value="MERTUA">MERTUA</option>
                      <option value="FAMILI LAIN">FAMILI LAIN</option>
                      <option value="PEMBANTU">PEMBANTU</option>
                      <option value="LAINNYA">LAINNYA</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Nama Lengkap Ayah Kandung</label>
                    <input 
                      type="text" 
                      className="form-input-custom font-semibold text-slate-800 capitalize" 
                      value={recipientInput.fatherName || ''} 
                      onChange={e => setRecipientInput({...recipientInput, fatherName: e.target.value})} 
                      placeholder="NAMA AYAH KANDUNG" 
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Nama Lengkap Ibu Kandung</label>
                    <input 
                      type="text" 
                      className="form-input-custom font-semibold text-slate-800 capitalize" 
                      value={recipientInput.motherName || ''} 
                      onChange={e => setRecipientInput({...recipientInput, motherName: e.target.value})} 
                      placeholder="NAMA IBU KANDUNG" 
                    />
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-500">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">No. Paspor (Bila Ada)</label>
                    <input 
                      type="text" 
                      className="form-input-custom font-mono text-slate-700 uppercase" 
                      value={recipientInput.passportNo || ''} 
                      onChange={e => setRecipientInput({...recipientInput, passportNo: e.target.value})} 
                      placeholder="- / No Paspor Aktif" 
                    />
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-500">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">No. KITAS / KITAP (Bila Ada)</label>
                    <input 
                      type="text" 
                      className="form-input-custom font-mono text-slate-700 uppercase" 
                      value={recipientInput.kitasNo || ''} 
                      onChange={e => setRecipientInput({...recipientInput, kitasNo: e.target.value})} 
                      placeholder="- / No Kartu Imigrasi" 
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* DOMISILI & KONTAK PANEL */}
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200/80 shadow-inner">
              <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-widest flex items-center gap-1.5 mb-5 pb-3 border-b border-slate-200">
                <MapPin className="w-4 h-4 text-rose-500" /> Domisili Rumah & Kontak Aktif
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="space-y-1.5 lg:col-span-4">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Alamat Lengkap (Jalan, No Rumah, Dusun) *</label>
                  <textarea 
                    className="form-input-custom min-h-[60px] font-medium text-slate-800" 
                    value={recipientInput.address} 
                    onChange={e => setRecipientInput({...recipientInput, address: e.target.value})} 
                    placeholder="Contoh: Jl. Diponegoro No. 12, RT 002/RW 001" 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">RT</label>
                  <input 
                    type="text" 
                    maxLength={3} 
                    className="form-input-custom font-mono font-bold text-center text-slate-800" 
                    value={recipientInput.rt} 
                    onChange={e => setRecipientInput({...recipientInput, rt: e.target.value.replace(/\D/g, '')})} 
                    placeholder="000" 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">RW</label>
                  <input 
                    type="text" 
                    maxLength={3} 
                    className="form-input-custom font-mono font-bold text-center text-slate-800" 
                    value={recipientInput.rw} 
                    onChange={e => setRecipientInput({...recipientInput, rw: e.target.value.replace(/\D/g, '')})} 
                    placeholder="000" 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Kampung / Kelurahan *</label>
                  <select 
                    className="form-input-custom font-semibold text-slate-800" 
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
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Kecamatan *</label>
                  <select 
                    required 
                    className="form-input-custom font-bold text-indigo-700 bg-indigo-50/50 border-indigo-200" 
                    value={recipientInput.district} 
                    onChange={e => setRecipientInput({...recipientInput, district: e.target.value, kampung: ''})}
                  >
                    <option value="">Pilih Kecamatan</option>
                    {Object.keys(SIAK_REGIONAL_DATA).map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5 md:col-span-4">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">No Handphone Kontak Penerima</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Smartphone className="w-4 h-4 text-indigo-500" />
                    </div>
                    <input 
                      type="tel" 
                      placeholder="+62 atau 08XXXXXXXXXX"
                      className="form-input-custom pl-9 font-semibold text-slate-800" 
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
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-1.5 font-sans">
                  <Upload className="w-4 h-4 text-indigo-500 animate-bounce" /> Unggah Berkas Persyaratan (15 Slot)
                </h4>
                <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-black uppercase tracking-wider font-mono">
                  Maksimal 15 Berkas Individu
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                Sediakan pindaian (scan) berkas pendukung penerima. Klik tombol unggah pada masing-masing slot yang sesuai.
              </p>
              
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
                              onClick={() => setPreviewDoc({ name: slot.label, url: slot.file!.url })}
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

          <div className="overflow-x-auto border border-slate-200/60 rounded-xl">
            {subRecipients.length === 0 ? (
              <div className="p-10 text-center space-y-2 bg-slate-50/50">
                <p className="text-slate-400 font-bold text-sm">Belum Ada Penerima dalam Sub-Tabel</p>
                <p className="text-slate-400 text-xs max-w-md mx-auto">
                  Silakan isi data penerima pada formulir **"Form Input Data Penerima"** diatas, kemudian klik tombol **"Tambahkan Penerima ke Sub Tabel"** untuk meregistrasikannya di sub-tabel ini.
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse table-auto text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-black">
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
            <div className="p-6 bg-slate-100 flex items-center justify-center min-h-[300px]">
              {previewDoc.url.startsWith('data:image') ? (
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
