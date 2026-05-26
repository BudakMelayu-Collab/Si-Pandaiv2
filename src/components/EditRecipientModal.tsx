import React, { useState } from 'react';
import { X, Save } from 'lucide-react';
import { Recipient } from '../types';

interface EditRecipientModalProps {
  recipient: Recipient;
  onClose: () => void;
  onSave: (id: string, data: Partial<Recipient>) => Promise<void>;
}

export default function EditRecipientModal({ recipient, onClose, onSave }: EditRecipientModalProps) {
  const [formData, setFormData] = useState<Partial<Recipient>>({ ...recipient });
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(recipient.id!, formData);
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
    </div>
  );
}
