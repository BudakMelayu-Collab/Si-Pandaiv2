import React, { useState, useRef } from 'react';
import { X, Save, Upload, FileText, ImageIcon, Eye, Loader2 } from 'lucide-react';
import { Recipient, AidDocument } from '../types';
import { cn } from '../lib/utils';

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
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-4">
              <h4 className="font-bold text-slate-800 border-b pb-2 text-sm">Informasi Pribadi</h4>
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">Nama</label>
                <input name="name" value={formData.name || ''} onChange={handleChange} className="form-input-custom" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">NIK</label>
                <input name="nik" value={formData.nik || ''} onChange={handleChange} className="form-input-custom" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">No HP / Kontak</label>
                <input name="contact" value={formData.contact || ''} onChange={handleChange} className="form-input-custom" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">Tujuan/Untuk</label>
                <input name="purpose" value={formData.purpose || ''} onChange={handleChange} className="form-input-custom" />
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-bold text-slate-800 border-b pb-2 text-sm">Informasi Domisili</h4>
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">Alamat</label>
                <input name="address" value={formData.address || ''} onChange={handleChange} className="form-input-custom" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">Kampung</label>
                <input name="kampung" value={formData.kampung || ''} onChange={handleChange} className="form-input-custom" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">Kecamatan</label>
                <input name="district" value={formData.district || ''} onChange={handleChange} className="form-input-custom" />
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-bold text-slate-800 border-b pb-2 text-sm">Informasi Rekening</h4>
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">Nama Bank</label>
                <input name="bankName" value={formData.bankName || ''} onChange={handleChange} className="form-input-custom" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">No Rekening</label>
                <input name="bankAccountNo" value={formData.bankAccountNo || ''} onChange={handleChange} className="form-input-custom" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 mb-1 block">Atas Nama Rekening</label>
                <input name="bankAccountHolder" value={formData.bankAccountHolder || ''} onChange={handleChange} className="form-input-custom" />
              </div>
            </div>
            
            <div className="space-y-4 md:col-span-2 lg:col-span-3">
              <h4 className="font-bold text-slate-800 border-b pb-2 text-sm">Status Berkas</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1 block">Status Kelengkapan</label>
                  <select name="documentStatus" value={formData.documentStatus || 'Lengkap'} onChange={handleChange} className="form-input-custom text-sm">
                    <option value="Lengkap">Lengkap</option>
                    <option value="Tidak Lengkap">Tidak Lengkap</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1 block">Keterangan Tidak Lengkap (bila ada)</label>
                  <input name="documentStatusNotes" value={formData.documentStatusNotes || ''} onChange={handleChange} className="form-input-custom" />
                </div>
              </div>
            </div>

            <div className="space-y-4 md:col-span-2 lg:col-span-3 mt-4">
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
