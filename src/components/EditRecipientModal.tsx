import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Upload, FileText, ImageIcon, Eye, Loader2, MapPin, User, Wand2, Settings } from 'lucide-react';
import { Recipient, AidDocument } from '../types';
import { cn } from '../lib/utils';
import { SIAK_REGIONAL_DATA } from '../constants';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { 
  getGoogleAccessToken, 
  setGoogleAccessToken,
  loginWithGoogle, 
  uploadFileToGoogleDrive, 
  downloadGoogleDriveFileAsBase64,
  fetchSharedGoogleAccessToken,
  auth,
  db
} from '../firebase';

interface DocumentSlot {
  label: string;
  file?: {
    name: string;
    type: 'pdf' | 'excel' | 'image';
    url: string;
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

interface EditRecipientModalProps {
  recipient: Recipient;
  onClose: () => void;
  onSave: (id: string, data: Partial<Recipient>) => Promise<void>;
}

export default function EditRecipientModal({ recipient, onClose, onSave }: EditRecipientModalProps) {
  const [formData, setFormData] = useState<Partial<Recipient>>({ 
    ...recipient
  });
  const [isSaving, setIsSaving] = useState(false);

  const [documentSlots, setDocumentSlots] = useState<DocumentSlot[]>(() => {
    const slots = INITIAL_DOCUMENT_SLOTS.map(s => ({ ...s }));
    if (recipient.documents && Array.isArray(recipient.documents)) {
      const docsToMap = [...recipient.documents];
      slots.forEach(slot => {
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
      let customIdx = 0;
      slots.forEach(slot => {
        if (slot.isCustomLabel && customIdx < docsToMap.length) {
          const matchedDoc = docsToMap[customIdx];
          slot.label = matchedDoc.name;
          slot.file = {
            name: matchedDoc.name + (matchedDoc.type === 'pdf' ? '.pdf' : matchedDoc.type === 'excel' ? '.xlsx' : '.jpg'),
            type: matchedDoc.type as any,
            url: matchedDoc.url,
          };
          customIdx++;
        }
      });
    }
    return slots;
  });

  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{ name: string; url: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCompressing, setIsCompressing] = useState(false);

  // Google Drive Integration States during edit
  const [saveToGDrive, setSaveToGDrive] = useState<boolean>(() => {
    return localStorage.getItem('ppd_save_gdrive') !== 'false';
  });
  const [gdriveToken, setGdriveToken] = useState<string | null>(getGoogleAccessToken());
  const [isConnectingGDrive, setIsConnectingGDrive] = useState<boolean>(false);

  useEffect(() => {
    const fetchToken = async () => {
      const token = await fetchSharedGoogleAccessToken();
      if (token) {
        setGdriveToken(token);
      }
    };
    fetchToken();
  }, []);

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

  // Google Service Account Integration States & Handlers
  const [isSaConnected, setIsSaConnected] = useState(false);
  const [saClientEmail, setSaClientEmail] = useState('');

  useEffect(() => {
    const checkServiceAccount = async () => {
      try {
        const docRef = doc(db, 'settings', 'gdrive_service_account');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setIsSaConnected(true);
          setSaClientEmail(snap.data().client_email || 'Terhubung');
        }
      } catch (e) {
        console.warn("Failed checking service account settings:", e);
      }
    };
    checkServiceAccount();
  }, []);

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const triggerUploadForSlot = (idx: number) => {
    setActiveSlotIndex(idx);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleRemoveFileForSlot = (idx: number) => {
    const updated = [...documentSlots];
    updated[idx].file = undefined;
    if (updated[idx].isCustomLabel) {
      updated[idx].label = 'Lainnya';
    }
    setDocumentSlots(updated);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (activeSlotIndex === null) return;
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressing(true);
    try {
      let finalUrl = '';
      let fileType: any = 'image';
      let displaySize = (file.size / 1024 / 1024).toFixed(2) + ' MB';

      if (file.type === 'application/pdf') {
        fileType = 'pdf';
      } else if (file.type.includes('excel') || file.type.includes('spreadsheetml')) {
        fileType = 'excel';
      } else {
        fileType = 'image';
      }

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
          const recipientName = formData.name || 'Penerima_Tanpa_Nama';
          const recipientNik = formData.nik || '';
          const sectorVal = formData.sector || recipient.sector || 'Umum';
          const programVal = formData.programName || recipient.programName || '';
          const gdriveRes = await uploadFileToGoogleDrive(file, recipientName, recipientNik, slotLabel, sectorVal, programVal);
          finalUrl = `gdrive:${gdriveRes.id}`;
          displaySize = displaySize + ' (Drive)';
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

        if (fileType === 'image') {
          const { compressImage } = await import('../lib/utils');
          base64Url = await compressImage(base64Url);
        }

        // Standard Firestore 1MB safety check (approximate base64 length)
        const sizeInBytes = base64Url.length * 0.75;
        if (sizeInBytes >= 1048500) {
          alert(`Gagal: Berkas "${file.name}" terlalu besar (${(sizeInBytes / 1024).toFixed(1)} KB) untuk disimpan di Firestore. Silakan kecilkan ukuran berkas atau hubungkan Google Drive Super Admin kembali.`);
          setIsCompressing(false);
          return;
        }

        finalUrl = base64Url;
      }

      const updated = [...documentSlots];
      updated[activeSlotIndex].file = {
        name: file.name,
        type: fileType,
        url: finalUrl,
        size: displaySize
      };
      setDocumentSlots(updated);
    } catch (error: any) {
      console.error(error);
      alert('Gagal memproses berkas: ' + (error.message || error));
    } finally {
      setIsCompressing(false);
      setActiveSlotIndex(null);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'nik' || name === 'kk') {
      setFormData(prev => ({ ...prev, [name]: value.replace(/\D/g, '') }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSave = async () => {
    if (!formData.name?.trim()) {
      alert('Nama penerima wajib diisi.');
      return;
    }
    if (!formData.nik || formData.nik.length !== 16) {
      alert('NIK penerima wajib diisi dan harus tepat 16 digit.');
      return;
    }
    if (!formData.kk || formData.kk.length !== 16) {
      alert('Nomor KK penerima wajib diisi dan harus tepat 16 digit.');
      return;
    }
    if (!formData.address?.trim()) {
      alert('Alamat domisili lengkap wajib diisi.');
      return;
    }
    if (!formData.district) {
      alert('Kecamatan domisili wajib dipilih.');
      return;
    }

    setIsSaving(true);
    try {
      const finalDocs: AidDocument[] = documentSlots
        .filter(s => s.file)
        .map(s => ({
          name: s.label,
          type: s.file!.type,
          url: s.file!.url,
        }));
        
      await onSave(recipient.id!, { ...formData, documents: finalDocs });
      onClose();
    } catch (err) {
      console.error(err);
      alert('Gagal menyimpan perubahan');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm shadow-2xl animate-in fade-in py-10">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-xl flex flex-col h-full max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Edit Data Penerima</h3>
            <p className="text-sm text-slate-500 font-medium">Perbarui informasi penerima bantuan</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recipient.programName === 'Rumah Singgah' && (
                <div className="space-y-2 lg:col-span-3 pb-2 border-b border-slate-100 mb-2">
                  <label className="text-sm font-semibold text-slate-700">No Registrasi (Rumah Singgah)</label>
                  <input 
                    name="rsNoReg" 
                    type="text" 
                    className="form-input-custom font-mono bg-slate-50 cursor-not-allowed" 
                    value={formData.rsNoReg || ''} 
                    readOnly 
                    disabled 
                  />
                  <p className="text-[10px] text-slate-400 mt-1">No Registrasi dibuat otomatis oleh sistem dan tidak dapat diubah.</p>
                </div>
              )}
              <div className="space-y-2 lg:col-span-2">
                <label className="text-sm font-semibold text-slate-700">Nama Penerima *</label>
                <input name="name" type="text" className="form-input-custom font-medium" value={formData.name || ''} onChange={handleChange} placeholder="Nama lengkap sesuai KTP" />
              </div>

              <div className="space-y-2 lg:col-span-2">
                <label className="text-sm font-semibold text-slate-700">Jumlah Bantuan (Rp)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium whitespace-nowrap">Rp</span>
                  <input 
                    type="text" 
                    className="form-input-custom font-bold pl-12" 
                    placeholder="0"
                    value={formData.amountProposed ? Number(formData.amountProposed).toLocaleString('id-ID') : ''} 
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g, '');
                      setFormData({...formData, amountProposed: val});
                    }} 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">NIK *</label>
                <input name="nik" type="text" maxLength={16} className="form-input-custom font-mono" value={formData.nik || ''} onChange={handleChange} placeholder="16 Digit NIK" />
                {(formData.nik?.length || 0) > 0 && (formData.nik?.length || 0) < 16 && (
                  <p className="text-xs text-rose-500 font-medium">
                    NIK kurang {(16 - (formData.nik?.length || 0))} digit
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Nomor KK *</label>
                <input name="kk" type="text" maxLength={16} className="form-input-custom font-mono" value={formData.kk || ''} onChange={handleChange} placeholder="16 Digit No KK" />
                {(formData.kk?.length || 0) > 0 && (formData.kk?.length || 0) < 16 && (
                  <p className="text-xs text-rose-500 font-medium">
                    Nomor KK kurang {(16 - (formData.kk?.length || 0))} digit
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Tempat Lahir</label>
                <input name="pob" type="text" className="form-input-custom font-medium" value={formData.pob || ''} onChange={handleChange} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Tanggal Lahir</label>
                <input name="dob" type="text" placeholder="Hari/Bulan/Tahun" className="form-input-custom font-medium" value={formData.dob || ''} onChange={handleChange} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Jenis Kelamin</label>
                <select name="gender" className="form-input-custom font-medium" value={formData.gender || 'Laki-laki'} onChange={handleChange}>
                  <option value="Laki-laki">Laki-laki</option>
                  <option value="Perempuan">Perempuan</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Status Hubungan Keluarga</label>
                <select name="familyStatus" className="form-input-custom font-medium" value={formData.familyStatus || ''} onChange={handleChange}>
                  <option value="">Pilih Status</option>
                  <option value="Kepala Keluarga">Kepala Keluarga</option>
                  <option value="Istri">Istri</option>
                  <option value="Anak">Anak</option>
                  <option value="Famili Lain">Famili Lain</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Nama Kepala Keluarga</label>
                <input name="headOfFamilyName" type="text" className="form-input-custom font-medium" value={formData.headOfFamilyName || ''} onChange={handleChange} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Tgl Lahir Kepala Keluarga</label>
                <input name="headOfFamilyDob" type="text" placeholder="Hari/Bulan/Tahun" className="form-input-custom font-medium" value={formData.headOfFamilyDob || ''} onChange={handleChange} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">No Handphone</label>
                <input 
                  type="tel" 
                  placeholder="+62"
                  className="form-input-custom font-medium" 
                  value={formData.contact || ''} 
                  onChange={e => {
                    let val = e.target.value.replace(/[^\d+]/g, '');
                    if (val.startsWith('0')) {
                      val = '+62' + val.substring(1);
                    } else if (val.startsWith('62')) {
                      val = '+' + val;
                    }
                    setFormData({...formData, contact: val});
                  }} 
                />
              </div>

              <div className="space-y-2 lg:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-700">Tujuan Penyaluran</label>
                  <button 
                    type="button"
                    onClick={() => {
                      const rtRw = [formData.rt, formData.rw].filter(Boolean).join('/');
                      const alamatLengkap = [formData.address, rtRw].filter(Boolean).join(' ');
                      const generated = `Permohonan Bantuan ${recipient.programName || recipient.aidType || ''} a.n ${formData.name || ''} Alamat ${alamatLengkap} kampung ${formData.kampung || ''} kecamatan ${formData.district || ''}`.trim().replace(/\s+/g, ' ');
                      setFormData({...formData, purpose: generated});
                    }}
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 active:scale-95 duration-100 transition-colors cursor-pointer"
                  >
                    <Wand2 className="w-3 h-3" /> Buat Otomatis
                  </button>
                </div>
                <textarea 
                  className="form-input-custom font-medium min-h-[60px]" 
                  value={formData.purpose || ''} 
                  onChange={e => setFormData({...formData, purpose: e.target.value})} 
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
                      const rtRw = [formData.rt || '-', formData.rw || '-'].join('/');
                      const generated = `Permohonan Pencairan Dana ${recipient.fundingSource || ''} ${recipient.programName || ''} a.n ${formData.name || ''} Sebanyak 1 Orang Bulan ${bulan} ${formData.address || ''} ${rtRw} kampung ${formData.kampung || ''} kecamatan ${formData.district || ''}`.trim().replace(/\s+/g, ' ');
                      setFormData({...formData, tujuanPengajuan: generated});
                    }}
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 active:scale-95 duration-100 transition-colors cursor-pointer"
                  >
                    <Wand2 className="w-3 h-3" /> Buat Otomatis
                  </button>
                </div>
                <textarea 
                  className="form-input-custom font-medium min-h-[60px]" 
                  value={formData.tujuanPengajuan || ''} 
                  onChange={e => setFormData({...formData, tujuanPengajuan: e.target.value})} 
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
                  <textarea name="address" className="form-input-custom min-h-[60px]" value={formData.address || ''} onChange={handleChange} placeholder="Jalan" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">RT</label>
                  <input name="rt" type="text" maxLength={3} className="form-input-custom font-mono" value={formData.rt || ''} onChange={handleChange} placeholder="000" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">RW</label>
                  <input name="rw" type="text" maxLength={3} className="form-input-custom font-mono" value={formData.rw || ''} onChange={handleChange} placeholder="000" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Kampung / Kelurahan</label>
                  <select 
                    className="form-input-custom font-medium" 
                    value={formData.kampung || ''} 
                    onChange={e => {
                      const selectedKampung = e.target.value;
                      let detectedDistrict = formData.district || '';
                      
                      for (const [district, villages] of Object.entries(SIAK_REGIONAL_DATA)) {
                        if (villages.includes(selectedKampung)) {
                          detectedDistrict = district;
                          break;
                        }
                      }
                      setFormData({...formData, kampung: selectedKampung, district: detectedDistrict});
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
                    name="district"
                    required 
                    className="form-input-custom font-medium" 
                    value={formData.district || ''} 
                    onChange={e => setFormData({...formData, district: e.target.value, kampung: ''})}
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
                    <input name="schoolName" type="text" className="form-input-custom font-medium" value={formData.schoolName || ''} onChange={handleChange} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase">Tingkatan</label>
                      <input name="schoolLevel" type="text" className="form-input-custom font-medium" placeholder="SD / SMP / Universitas" value={formData.schoolLevel || ''} onChange={handleChange} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase">Kelas / Semester</label>
                      <input name="schoolClass" type="text" className="form-input-custom font-medium" value={formData.schoolClass || ''} onChange={handleChange} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Alamat Sekolah</label>
                    <input name="schoolAddress" type="text" className="form-input-custom font-medium" value={formData.schoolAddress || ''} onChange={handleChange} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">No Hp Instansi</label>
                    <input 
                      name="schoolPhone"
                      type="tel" 
                      maxLength={13}
                      className="form-input-custom font-mono" 
                      value={formData.schoolPhone || ''} 
                      onChange={handleChange} 
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Detail Perbankan / Lainnya</h4>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Nomor Rekening</label>
                    <input 
                      name="bankAccountNo"
                      type="text" 
                      maxLength={16}
                      className="form-input-custom font-mono" 
                      value={formData.bankAccountNo || ''} 
                      onChange={handleChange} 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Nama Bank</label>
                    <input name="bankName" type="text" className="form-input-custom font-medium" placeholder="Bank Riau Kepri / Syariah" value={formData.bankName || ''} onChange={handleChange} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Nama Pemilik Rekening</label>
                    <input name="bankAccountHolder" type="text" className="form-input-custom font-medium" value={formData.bankAccountHolder || ''} onChange={handleChange} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Catatan Tambahan Mustahik</label>
                    <textarea name="notes" className="form-input-custom min-h-[50px] font-medium" value={formData.notes || ''} onChange={handleChange} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-indigo-700 uppercase tracking-wider block">Status Berkas Saat ini *</label>
                    <select
                      name="documentStatus"
                      className="form-input-custom font-medium bg-white border-indigo-200"
                      value={formData.documentStatus || 'Lengkap'}
                      onChange={e => setFormData(prev => ({
                        ...prev,
                        documentStatus: e.target.value,
                        documentStatusNotes: e.target.value === 'Lengkap' ? '' : prev.documentStatusNotes
                      }))}
                    >
                      <option value="Lengkap">Lengkap</option>
                      <option value="Tidak Lengkap">Tidak Lengkap</option>
                    </select>
                  </div>
                  {formData.documentStatus === 'Tidak Lengkap' && (
                    <div className="space-y-1.5 animate-in slide-in-from-top-1 duration-150">
                      <label className="text-xs font-bold text-rose-700 uppercase tracking-wider block">Keterangan Tidak Lengkap *</label>
                      <input
                        name="documentStatusNotes"
                        required
                        type="text"
                        placeholder="Contoh: Kurang KK / NIK tidak jelas / dll"
                        className="form-input-custom font-medium bg-white border-rose-200"
                        value={formData.documentStatusNotes || ''}
                        onChange={handleChange}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4 mt-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-slate-800 text-xs uppercase tracking-widest flex items-center gap-1.5 align-middle">
                      <Upload className="w-4 h-4 text-indigo-500" /> Edit Unggah Berkas Persyaratan (15 Slot)
                    </h4>
                    {isCompressing && (
                      <span className="text-[10px] bg-amber-50 text-amber-650 px-2 py-0.5 flex items-center gap-1 rounded-full font-bold">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" /> Memproses...
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 font-semibold leading-normal">
                    Format biner standar terbatas <strong className="text-rose-600">1MB</strong>. Aktifkan Google Drive untuk bypass limit.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {isSaConnected ? (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold font-sans">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Google Service Account Aktif ({saClientEmail.substring(0, 20)}...)
                    </div>
                  ) : gdriveToken ? (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold font-sans">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Sinkronisasi Google Drive Aktif (Super Admin)
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-xs font-bold font-sans">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      Google Drive Belum Tersambung
                    </div>
                  )}                  {auth.currentUser?.email === 'muhammad.nawa@gmail.com' && (
                    <div className="flex items-center gap-1.5 font-sans">
                      <button
                        type="button"
                        onClick={handleConnectGDrive}
                        disabled={isConnectingGDrive}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-750 text-white rounded-xl text-xs font-extrabold cursor-pointer transition-colors shadow-sm disabled:opacity-50"
                      >
                        {isConnectingGDrive ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        <span>{gdriveToken ? 'Sambungkan Ulang OAuth' : 'Sambungkan Drive Super Admin'}</span>
                      </button>
                    </div>
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
                            </div>
                          </div>
                          <div className="flex items-center gap-1 pt-1.5 border-t border-slate-200/50">
                            <button
                              type="button"
                              onClick={async () => {
                                if (slot.file!.url.startsWith('data:')) {
                                  setPreviewDoc({ name: slot.label, url: slot.file!.url });
                                } else {
                                  setPreviewDoc({ name: slot.label, url: 'loading' });
                                  try {
                                    const { getRecipientFile } = await import('../firebase');
                                    const base64 = await getRecipientFile(recipient.id!, slot.file!.url);
                                    if (base64) {
                                      setPreviewDoc({ name: slot.label, url: base64 });
                                    } else {
                                      alert('Berkas tidak ditemukan.');
                                      setPreviewDoc(null);
                                    }
                                  } catch (e: any) {
                                    alert('Gagal mengambil berkas: ' + (e?.message || e));
                                    setPreviewDoc(null);
                                  }
                                }
                              }}
                              className="flex-1 py-1 text-[9px] text-indigo-600 hover:bg-indigo-50 hover:text-indigo-800 font-bold border border-indigo-100 rounded-lg transition-colors flex items-center justify-center gap-0.5"
                            >
                              <Eye className="w-2.5 h-2.5" />
                              Lihat
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveFileForSlot(idx)}
                              className="py-1 px-1.5 text-[9px] text-rose-600 hover:bg-rose-50 hover:text-rose-800 font-bold border border-rose-100 rounded-lg transition-colors flex items-center justify-center"
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

            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              onChange={handleFileChange}
              accept="image/*,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            />
          </div>
        </div>
        
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 font-bold text-sm bg-white border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 font-bold text-sm bg-indigo-600 border border-indigo-600 text-white rounded-xl hover:bg-indigo-750 transition-colors flex items-center gap-2 disabled:bg-slate-400 disabled:border-slate-400 cursor-pointer"
          >
            {isSaving ? 'Menyimpan...' : (
              <>
                <Save className="w-4 h-4" /> Simpan Perubahan
              </>
            )}
          </button>
        </div>
      </div>

      {previewDoc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[110] p-4 animate-in fade-in duration-200">
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
              {previewDoc.url === 'loading' ? (
                <div className="text-center space-y-3">
                  <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
                  <p className="text-slate-600 font-bold text-sm">Mengambil berkas...</p>
                </div>
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
