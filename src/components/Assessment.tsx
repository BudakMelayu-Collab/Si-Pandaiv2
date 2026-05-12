import React, { useState, useEffect } from 'react';
import { 
  ClipboardCheck, 
  Plus, 
  Search, 
  Filter, 
  Trash2, 
  ChevronRight, 
  Star,
  AlertCircle,
  FileText,
  User,
  Image as ImageIcon,
  Printer,
  Download,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Assessment, Recipient } from '../types';
import { streamAssessments, saveAssessment, deleteAssessment } from '../firebase';
import { cn } from '../lib/utils';

type ScoreAspects = {
  economic: number;
  social: number;
  health: number;
  housing: number;
  education: number;
};

interface AssessmentComponentProps {
  recipients: Recipient[];
}

export default function AssessmentComponent({ recipients }: AssessmentComponentProps) {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [viewingAssessment, setViewingAssessment] = useState<Assessment | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Form State
  const [formData, setFormData] = useState({
    recipientId: '',
    aidType: '',
    requestedFor: '',
    requestedAmount: 0,
    schoolName: '',
    grade: '',
    village: '',
    district: '',
    surveyDate: new Date().toISOString().split('T')[0],
    job: '',
    fatherHusband: '',
    motherWife: '',
    gardenFarm: '',
    houseOwnership: '',
    debt: '',
    schoolDependents: '',
    assessorName: '',
    explanation: '',
    photos: [] as string[]
  });
  
  const [scores, setScores] = useState<ScoreAspects>({
    economic: 3,
    social: 3,
    health: 3,
    housing: 3,
    education: 3
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 500000) { // 500KB limit
      return alert('Ukuran file terlalu besar. Maksimal 500KB per foto.');
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      const newPhotos = [...formData.photos];
      newPhotos[index] = base64;
      setFormData({ ...formData, photos: newPhotos });
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    const unsub = streamAssessments(setAssessments as any);
    setLoading(false);
    return () => unsub();
  }, []);

  const calculateTotal = (s: ScoreAspects) => {
    return s.economic + s.social + s.health + s.housing + s.education;
  };

  const getRecommendation = (total: number) => {
    if (total >= 22) return 'Sangat Layak';
    if (total >= 17) return 'Layak';
    if (total >= 12) return 'Cukup Layak';
    return 'Tidak Layak';
  };

  const handleRecipientChange = (recipientId: string) => {
    const recipient = recipients.find(r => r.id === recipientId);
    if (recipient) {
      setFormData({
        ...formData,
        recipientId,
        aidType: recipient.aidType || '',
        requestedFor: recipient.purpose || '',
        requestedAmount: recipient.amountProposed || 0,
        schoolName: recipient.schoolName || '',
        grade: recipient.schoolClass || '',
        village: recipient.kampung || '',
        district: recipient.district || '',
        job: '', // Not in recipient object usually
        fatherHusband: '',
        motherWife: '',
        gardenFarm: '',
        houseOwnership: '',
        debt: '',
        schoolDependents: '',
        assessorName: formData.assessorName, // Keep previous assessor name
        explanation: '',
        photos: []
      });
    } else {
      setFormData({ ...formData, recipientId: '' });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.recipientId) return alert('Pilih penerima bantuan');
    
    const recipient = recipients.find(r => r.id === formData.recipientId);
    if (!recipient) return;

    const totalScore = calculateTotal(scores);
    
    const newAssessment: Omit<Assessment, 'id' | 'createdAt' | 'updatedAt'> = {
      ...formData,
      recipientName: recipient.name,
      date: new Date().toISOString(),
      economicScore: scores.economic,
      socialScore: scores.social,
      healthScore: scores.health,
      housingScore: scores.housing,
      educationScore: scores.education,
      totalScore,
      recommendation: getRecommendation(totalScore) as any,
    };

    try {
      await saveAssessment(newAssessment as any);
      setIsAdding(false);
      resetForm();
    } catch (error) {
      alert('Gagal menyimpan asessment');
    }
  };

  const resetForm = () => {
    setFormData({
      recipientId: '',
      aidType: '',
      requestedFor: '',
      requestedAmount: 0,
      schoolName: '',
      grade: '',
      village: '',
      district: '',
      surveyDate: new Date().toISOString().split('T')[0],
      job: '',
      fatherHusband: '',
      motherWife: '',
      gardenFarm: '',
      houseOwnership: '',
      debt: '',
      schoolDependents: '',
      assessorName: '',
      explanation: '',
      photos: []
    });
    setScores({ economic: 3, social: 3, health: 3, housing: 3, education: 3 });
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Yakin ingin menghapus asessment ini?')) return;
    try {
      await deleteAssessment(id);
    } catch (error) {
      alert('Gagal menghapus asessment');
    }
  };

  const filteredAssessments = assessments.filter(a => 
    a.recipientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.assessorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.village.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const ReportView = ({ assessment }: { assessment: Assessment }) => (
    <div className="bg-white p-8 max-w-5xl mx-auto border border-slate-300 shadow-2xl print:shadow-none print:border-none font-sans">
      <div className="flex bg-lime-600 text-white text-[10px] font-bold uppercase text-center">
        <div className="border-r border-white/20 p-2 flex-1">Jenis Bantuan</div>
        <div className="border-r border-white/20 p-2 flex-1">Mengajukan Bantuan Untuk</div>
        <div className="border-r border-white/20 p-2 flex-1">Nominal Yang Akan Dibantu</div>
        <div className="border-r border-white/20 p-2 flex-1">Nama Sekolah</div>
        <div className="border-r border-white/20 p-2 w-16">Kelas</div>
        <div className="border-r border-white/20 p-2 flex-1">Kampung</div>
        <div className="border-r border-white/20 p-2 flex-1">Kecamatan</div>
        <div className="p-2 flex-1">Tanggal Survei</div>
      </div>
      <div className="flex text-[10px] items-center text-center border-x border-b border-slate-300">
        <div className="border-r border-slate-300 p-2 flex-1 min-h-[40px] flex items-center justify-center font-bold">{assessment.aidType}</div>
        <div className="border-r border-slate-300 p-2 flex-1 min-h-[40px] flex items-center justify-center font-bold">{assessment.requestedFor}</div>
        <div className="border-r border-slate-300 p-2 flex-1 min-h-[40px] flex items-center justify-center font-bold">Rp {assessment.requestedAmount.toLocaleString('id-ID')}</div>
        <div className="border-r border-slate-300 p-2 flex-1 min-h-[40px] flex items-center justify-center font-bold">{assessment.schoolName || '-'}</div>
        <div className="border-r border-slate-300 p-2 w-16 min-h-[40px] flex items-center justify-center font-bold">{assessment.grade || '-'}</div>
        <div className="border-r border-slate-300 p-2 flex-1 min-h-[40px] flex items-center justify-center font-bold">{assessment.village}</div>
        <div className="border-r border-slate-300 p-2 flex-1 min-h-[40px] flex items-center justify-center font-bold">{assessment.district}</div>
        <div className="p-2 flex-1 min-h-[40px] flex items-center justify-center font-bold">{new Date(assessment.surveyDate).toLocaleDateString('id-ID')}</div>
      </div>

      <div className="grid grid-cols-12 mt-4 border border-slate-300">
        <div className="col-span-8">
          <div className="bg-lime-600 text-white text-[10px] font-bold p-2 text-center border-b border-slate-300 uppercase">Biodata Mustahik</div>
          <div className="divide-y divide-slate-300 text-[11px]">
            {[
              { label: 'Nama Mustahik', value: assessment.recipientName },
              { label: 'Pekerjaan', value: assessment.job },
              { label: 'Ayah/Suami/Wali', value: assessment.fatherHusband },
              { label: 'Ibu/Istri/Wali', value: assessment.motherWife },
              { label: 'Kebun/Sawah', value: assessment.gardenFarm },
              { label: 'Kepemilikan Rumah', value: assessment.houseOwnership },
              { label: 'Hutang/Kredit/Pinjaman', value: assessment.debt },
              { label: 'Tanggungan Anak Sekolah', value: assessment.schoolDependents },
              { label: 'Petugas Survei', value: assessment.assessorName },
            ].map((item, idx) => (
              <div key={idx} className="flex">
                <div className="w-1/3 p-2 font-bold border-r border-slate-300">{item.label}</div>
                <div className="w-2/3 p-2 font-medium">{item.value || '#VALUE!'}</div>
              </div>
            ))}
            <div className="flex">
              <div className="w-1/3 p-2 font-bold border-r border-slate-300">Pagu Bantuan</div>
              <div className="w-2/3 divide-y divide-slate-300">
                <div className="flex p-2 justify-between"><span>TINGKATAN SD</span><span className="font-bold">500.000 - 1.000.000</span></div>
                <div className="flex p-2 justify-between"><span>TINGKATAN SMP</span><span className="font-bold">1.000.000</span></div>
                <div className="flex p-2 justify-between"><span>TINGGAKAN SMA</span><span className="font-bold">1.500.000</span></div>
                <div className="flex p-2 justify-between"><span>TINGKATAN S1</span><span className="font-bold">2.000.000</span></div>
                <div className="flex p-2 justify-between"><span>UMKM</span><span className="font-bold">3.000.000 - 5.000.000</span></div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-span-4 border-l border-slate-300 flex flex-col">
          <div className="bg-lime-600 text-white text-[10px] font-bold p-2 text-center border-b border-slate-300 uppercase">Penjelasan</div>
          <div className="p-3 text-[11px] font-medium leading-relaxed flex-1 whitespace-pre-wrap">
            {assessment.explanation || '#VALUE!'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4 h-64">
        <div className="border border-slate-300 bg-slate-50 flex items-center justify-center relative group overflow-hidden">
          {assessment.photos?.[0] ? (
            <img src={assessment.photos[0]} alt="Lokasi" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="w-12 h-12 text-slate-200" />
          )}
          <span className="absolute bottom-2 left-2 text-[10px] font-bold text-white bg-black/30 px-2 py-0.5 rounded uppercase">Dokumentasi Lokasi</span>
        </div>
        <div className="border border-slate-300 bg-slate-50 flex items-center justify-center relative group overflow-hidden">
          {assessment.photos?.[1] ? (
            <img src={assessment.photos[1]} alt="Wawancara" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="w-12 h-12 text-slate-200" />
          )}
          <span className="absolute bottom-2 left-2 text-[10px] font-bold text-white bg-black/30 px-2 py-0.5 rounded uppercase">Wawancara Mustahik</span>
        </div>
      </div>

      <div className="mt-8 flex justify-end gap-20 px-10 text-[12px]">
        <div className="text-center pt-20 border-t border-slate-300 min-w-[150px]">
          <p className="font-bold">{assessment.assessorName}</p>
          <p className="text-slate-500 text-[10px]">Petugas Survei</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Asessment dan Prensentasi</h1>
          <p className="text-slate-500">Evaluasi dan penilaian kelayakan penerima manfaat serta verifikasi kehadiran</p>
        </div>
        <div className="flex gap-2">
          {viewingAssessment && (
            <button 
              onClick={() => window.print()}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-slate-800 text-white rounded-xl font-semibold hover:bg-slate-900 transition-all shadow-lg shadow-slate-200"
            >
              <Printer className="w-5 h-5" /> Cetak
            </button>
          )}
          <button 
            onClick={() => {
              setIsAdding(!isAdding);
              setViewingAssessment(null);
            }}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
          >
            {isAdding || viewingAssessment ? 'Kembali k Daftar' : <><Plus className="w-5 h-5" /> Buat Asessment Baru</>}
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {isAdding ? (
          <motion.div
            key="add-form"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-2xl p-8 border border-slate-200 shadow-xl"
          >
            <form onSubmit={handleSave} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-lime-50 p-6 rounded-2xl border border-lime-200">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-lime-700 mb-1 uppercase">Pilih Calon Mustahik</label>
                  <select 
                    value={formData.recipientId}
                    onChange={(e) => handleRecipientChange(e.target.value)}
                    className="w-full px-4 py-2 bg-white border border-lime-200 rounded-xl focus:ring-2 focus:ring-lime-500 outline-none font-bold"
                    required
                  >
                    <option value="">-- Pilih Penerima --</option>
                    {recipients.map(r => (
                      <option key={r.id} value={r.id}>{r.name} - {r.nik}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-lime-700 mb-1 uppercase">Jenis Bantuan</label>
                  <input 
                    type="text" 
                    value={formData.aidType}
                    onChange={(e) => setFormData({...formData, aidType: e.target.value})}
                    placeholder="Contoh: PAKET SEMBAKO"
                    className="w-full px-4 py-2 bg-white border border-lime-200 rounded-xl focus:ring-2 focus:ring-lime-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-lime-700 mb-1 uppercase">Nominal</label>
                  <input 
                    type="number" 
                    value={formData.requestedAmount}
                    onChange={(e) => setFormData({...formData, requestedAmount: parseInt(e.target.value) || 0})}
                    placeholder="0"
                    className="w-full px-4 py-2 bg-white border border-lime-200 rounded-xl focus:ring-2 focus:ring-lime-500 outline-none font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Section: Context */}
                <div className="space-y-4">
                  <h3 className="font-black text-slate-800 text-sm uppercase flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-lime-500 rounded-full" />
                    Detail Pengajuan
                  </h3>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">MOHON BANTUAN UNTUK</label>
                      <input type="text" value={formData.requestedFor} onChange={(e) => setFormData({...formData, requestedFor: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">KAMPUNG</label>
                        <input type="text" value={formData.village} onChange={(e) => setFormData({...formData, village: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm" required />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">KECAMATAN</label>
                        <input type="text" value={formData.district} onChange={(e) => setFormData({...formData, district: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm" required />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">NAMA SEKOLAH</label>
                        <input type="text" value={formData.schoolName} onChange={(e) => setFormData({...formData, schoolName: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">KELAS</label>
                        <input type="text" value={formData.grade} onChange={(e) => setFormData({...formData, grade: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">TANGGAL SURVEY</label>
                      <input type="date" value={formData.surveyDate} onChange={(e) => setFormData({...formData, surveyDate: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm font-bold" />
                    </div>
                  </div>
                </div>

                {/* Section: Biodata Mustahik */}
                <div className="space-y-4">
                  <h3 className="font-black text-slate-800 text-sm uppercase flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-lime-500 rounded-full" />
                    Biodata Mustahik
                  </h3>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">PEKERJAAN</label>
                      <input type="text" value={formData.job} onChange={(e) => setFormData({...formData, job: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">AYAH / SUAMI / WALI</label>
                      <input type="text" value={formData.fatherHusband} onChange={(e) => setFormData({...formData, fatherHusband: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">IBU / ISTRI / WALI</label>
                      <input type="text" value={formData.motherWife} onChange={(e) => setFormData({...formData, motherWife: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">KEBUN/SAWAH</label>
                        <input type="text" value={formData.gardenFarm} onChange={(e) => setFormData({...formData, gardenFarm: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">KEPEMILIKAN RUMAH</label>
                        <input type="text" value={formData.houseOwnership} onChange={(e) => setFormData({...formData, houseOwnership: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">HUTANG/KREDIT</label>
                        <input type="text" value={formData.debt} onChange={(e) => setFormData({...formData, debt: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">TANGGUNGAN ANAK</label>
                        <input type="text" value={formData.schoolDependents} onChange={(e) => setFormData({...formData, schoolDependents: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">PETUGAS SURVEI</label>
                      <input type="text" value={formData.assessorName} onChange={(e) => setFormData({...formData, assessorName: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm font-bold" required />
                    </div>
                  </div>
                </div>

                {/* Section: Penjelasan & Scoring */}
                <div className="space-y-6">
                  <div>
                    <h3 className="font-black text-slate-800 text-sm uppercase flex items-center gap-2 mb-4">
                      <div className="w-1.5 h-6 bg-lime-500 rounded-full" />
                      Penjelasan & Analisa
                    </h3>
                    <textarea 
                      value={formData.explanation}
                      onChange={(e) => setFormData({...formData, explanation: e.target.value})}
                      placeholder="Tuliskan analisa hasil survey lapangan di sini..."
                      className="w-full h-40 px-4 py-3 border border-slate-200 rounded-2xl text-sm resize-none"
                    />
                  </div>

                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-500">INDATOR KELAYAKAN</span>
                      <span className="text-sm font-black text-indigo-600">{calculateTotal(scores)} / 25</span>
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {Object.keys(scores).map((key) => (
                        <div key={key} className="flex flex-col items-center gap-1">
                          <input 
                            type="number"
                            min="1" max="5"
                            value={(scores as any)[key]}
                            onChange={(e) => setScores({...scores, [key]: parseInt(e.target.value) || 1})}
                            className="w-full text-center py-1 border border-slate-200 rounded-lg text-sm font-bold"
                          />
                          <span className="text-[8px] uppercase font-bold text-slate-400">{key.substring(0,3)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="pt-2">
                       <div className={cn(
                        "w-full py-2 rounded-xl text-xs font-black uppercase text-center",
                        getRecommendation(calculateTotal(scores)) === 'Sangat Layak' ? "bg-green-100 text-green-700" :
                        getRecommendation(calculateTotal(scores)) === 'Layak' ? "bg-blue-100 text-blue-700" :
                        getRecommendation(calculateTotal(scores)) === 'Cukup Layak' ? "bg-amber-100 text-amber-700" :
                        "bg-red-100 text-red-700"
                      )}>
                        {getRecommendation(calculateTotal(scores))}
                      </div>
                    </div>
                  </div>

                  {/* Photo Uploads */}
                  <div className="space-y-3">
                    <h3 className="font-black text-slate-800 text-sm uppercase flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-lime-500" />
                      Dokumentasi Foto
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {[0, 1].map((idx) => (
                        <div key={idx} className="relative group">
                          <div className="aspect-video bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center overflow-hidden hover:border-lime-400 transition-colors">
                            {formData.photos[idx] ? (
                              <>
                                <img src={formData.photos[idx]} alt={`Dokumentasi ${idx + 1}`} className="w-full h-full object-cover" />
                                <button 
                                  type="button"
                                  onClick={() => {
                                    const newPhotos = [...formData.photos];
                                    newPhotos[idx] = '';
                                    setFormData({ ...formData, photos: newPhotos });
                                  }}
                                  className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </>
                            ) : (
                              <label className="cursor-pointer flex flex-col items-center gap-1">
                                <Plus className="w-5 h-5 text-slate-400" />
                                <span className="text-[10px] font-bold text-slate-400 uppercase">{idx === 0 ? 'Lokasi' : 'Wawancara'}</span>
                                <input 
                                  type="file" 
                                  accept="image/*" 
                                  onChange={(e) => handleFileChange(e, idx)}
                                  className="hidden" 
                                />
                              </label>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4 gap-4 border-t border-slate-100">
                <button type="button" onClick={() => setIsAdding(false)} className="px-6 py-3 font-bold text-slate-500">Batal</button>
                <button 
                  type="submit"
                  className="px-10 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                >
                  Simpan & Generate Template
                </button>
              </div>
            </form>
          </motion.div>
        ) : viewingAssessment ? (
          <motion.div
            key="viewer"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <ReportView assessment={viewingAssessment} />
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {/* Search and Filters for List View */}
            <div className="col-span-full bg-white p-4 rounded-2xl border border-slate-200 flex flex-col md:flex-row gap-4 items-center">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  placeholder="Cari Mustahik, Kampung, atau Penilai..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-100 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                />
              </div>
              <div className="text-sm font-bold text-slate-400 px-4 whitespace-nowrap">
                Total: {filteredAssessments.length} Laporan
              </div>
            </div>

            {filteredAssessments.length === 0 ? (
              <div className="col-span-full py-20 text-center bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-200">
                <ClipboardCheck className="w-16 h-16 mx-auto mb-4 text-slate-200" />
                <p className="text-slate-400 font-medium italic">Belum ada data asessment untuk ditampilkan.</p>
              </div>
            ) : filteredAssessments.map((item) => (
              <motion.div 
                key={item.id}
                layoutId={item.id}
                onClick={() => setViewingAssessment(item)}
                className="bg-white rounded-3xl p-6 border border-slate-200 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-50/50 transition-all cursor-pointer group"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-lime-50 flex items-center justify-center text-lime-600">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-black uppercase",
                    item.recommendation === 'Sangat Layak' ? "bg-green-100 text-green-700" :
                    item.recommendation === 'Layak' ? "bg-blue-100 text-blue-700" :
                    item.recommendation === 'Cukup Layak' ? "bg-amber-100 text-amber-700" :
                    "bg-red-100 text-red-700"
                  )}>
                    {item.recommendation}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h3 className="font-black text-slate-800 group-hover:text-indigo-600 transition-colors uppercase tracking-tight line-clamp-1">{item.recipientName}</h3>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 mt-0.5">
                      <span className="text-lime-600">{item.aidType}</span>
                      <span>•</span>
                      <span>{item.village}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-slate-50 rounded-2xl">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Skor Analisa</p>
                      <div className="flex items-end gap-1">
                        <span className="text-xl font-black text-slate-800">{item.totalScore}</span>
                        <span className="text-[10px] font-bold text-slate-400 mb-1">/ 25</span>
                      </div>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-2xl">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Tgl Survey</p>
                      <p className="font-bold text-slate-700 truncate">{new Date(item.surveyDate).toLocaleDateString('id-ID')}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                        <User className="w-3 h-3" />
                      </div>
                      <span className="text-[10px] font-bold text-slate-500">{item.assessorName}</span>
                    </div>
                    <button 
                      onClick={(e) => handleDelete(item.id, e)}
                      className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
