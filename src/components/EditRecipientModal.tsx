import React, { useState, useRef } from 'react';
import { X, Save, Upload, FileText, ImageIcon, Eye, Loader2, MapPin, User } from 'lucide-react';
import { Recipient, AidDocument } from '../types';
import { cn } from '../lib/utils';
import { SIAK_REGIONAL_DATA } from '../constants';

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
  const [formData, setFormData] = useState<Partial<Recipient>>({ ...recipient });
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
      let base64Url = '';
      let fileType: any = 'image';

      if (file.type === 'application/pdf') {
        base64Url = await convertFileToBase64(file);
        fileType = 'pdf';
      } else if (file.type.includes('excel') || file.type.includes('spreadsheetml')) {
        base64Url = await convertFileToBase64(file);
        fileType = 'excel';
      } else {
        const { compressImage } = await import('../lib/utils');
        base64Url = await convertFileToBase64(file);
        base64Url = await compressImage(base64Url);
        fileType = 'image';
      }

      const updated = [...documentSlots];
      updated[activeSlotIndex].file = {
        name: file.name,
        type: fileType,
        url: base64Url,
        size: (file.size / 1024 / 1024).toFixed(2) + ' MB'
      };
      setDocumentSlots(updated);
    } catch (error) {
      console.error(error);
      alert('Gagal memproses berkas');
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
                <input name="dob" type="date" className="form-input-custom font-medium" value={formData.dob || ''} onChange={handleChange} />
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
                <input name="headOfFamilyDob" type="date" className="form-input-custom font-medium" value={formData.headOfFamilyDob || ''} onChange={handleChange} />
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
                  <textarea name="address" className="form-input-custom min-h-[60px]" value={formData.address || ''} onChange={handleChange} placeholder="Dusun / Rukun Tetangga / Rukun Warga" />
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
                  <label className="text-sm font-semibold text-slate-700">Kecamatan *</label>
                  <select 
                    name="district"
                    required 
                    className="form-input-custom font-medium" 
                    value={formData.district || ''} 
                    onChange={e => {
                      const newDistrict = e.target.value;
                      setFormData(prev => ({...prev, district: newDistrict, kampung: ''}));
                    }}
                  >
                    <option value="">Pilih Kecamatan</option>
                    {Object.keys(SIAK_REGIONAL_DATA).map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                {formData.district && (
                  <div className="space-y-2 animate-in fade-in-50 duration-200 block">
                    <label className="text-sm font-semibold text-slate-700">Kampung / Kelurahan *</label>
                    <select 
                      name="kampung"
                      required 
                      className="form-input-custom font-medium" 
                      value={formData.kampung || ''} 
                      onChange={handleChange}
                    >
                      <option value="">Pilih Kampung/Kelurahan</option>
                      {SIAK_REGIONAL_DATA[formData.district as keyof typeof SIAK_REGIONAL_DATA]?.map(v => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                )}
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
                    <label className="text-xs font-bold text-slate-500 uppercase">Kontak Personal (No HP)</label>
                    <input name="contact" type="text" className="form-input-custom font-medium" value={formData.contact || ''} onChange={handleChange} />
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
              <div className="flex items-center justify-between border-b pb-2">
                <h4 className="font-bold text-indigo-600 border-b-0 pb-0 text-sm flex items-center gap-2">
                  <Upload className="w-4 h-4" /> Edit Unggah Berkas Persyaratan (15 Slot)
                </h4>
                {isCompressing && (
                  <span className="text-[10px] bg-amber-50 text-amber-600 px-2 py-1 flex items-center gap-1 rounded-full font-bold">
                    <Loader2 className="w-3 h-3 animate-spin" /> Memproses...
                  </span>
                )}
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
                                  } catch (e) {
                                    alert('Gagal mengambil berkas dari database.');
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
