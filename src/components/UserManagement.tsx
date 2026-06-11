import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  Edit, 
  Trash2, 
  Shield, 
  Mail, 
  User, 
  ClipboardList, 
  Check, 
  X, 
  Plus, 
  Search,
  Key,
  HelpCircle,
  Loader2,
  Lock,
  Menu,
  Eye,
  CheckSquare,
  Square,
  FileText,
  RefreshCw,
  Calendar
} from 'lucide-react';
import { UserConfig, SystemLog } from '../types';
import { saveUserConfig, deleteUserConfig, streamUserConfigs, streamSystemLogs } from '../firebase';
import { cn } from '../lib/utils';

interface UserManagementProps {
  currentUserEmail: string | null;
  onBackToDashboard: () => void;
}

export default function UserManagement({ currentUserEmail, onBackToDashboard }: UserManagementProps) {
  const [users, setUsers] = useState<UserConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Sub tab states
  const [activeTab, setActiveTab] = useState<'users' | 'logs'>('users');
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsSearchQuery, setLogsSearchQuery] = useState('');
  const [logsActionFilter, setLogsActionFilter] = useState<string>('ALL');

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserConfig | null>(null);

  // Form Fields
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'Staff Administrasi',
    allowedMenus: [] as string[]
  });

  // Master menus list consistent with Layout's sidebar items
  const menuOptions = [
    { id: 'dashboard', label: 'Dashboard', desc: 'Halaman ringkasan data, diagram, dan statistik utama.' },
    { id: 'input', label: 'Input Data', desc: 'Halaman pendaftaran serta input berkas mustahik baru.' },
    { id: 'recipients', label: 'Konter Layanan', desc: 'Daftar semua mustahik, edit detail, serta kelola status berkas.' },
    { id: 'bnba-recap', label: 'Rekap BNBA', desc: 'Rekapitulasi berkas By Name By Address.' },
    { id: 'siak-cerdas', label: 'Siak Cerdas', desc: 'Pelacakan bidang pendidikan / Beasiswa.' },
    { id: 'siak-dakwah', label: 'Siak Dakwah', desc: 'Pelacakan bidang dakwah dan keagamaan.' },
    { id: 'siak-peduli', label: 'Siak Peduli', desc: 'Pelacakan bantuan kemanusiaan dan konsumtif.' },
    { id: 'siak-sehat', label: 'Siak Sehat', desc: 'Pelacakan layanan pengobatan dan kesehatan.' },
    { id: 'siak-sejahtera', label: 'Siak Sejahtera', desc: 'Pelacakan permodalan usaha dan pemberdayaan ekonomi.' },
    { id: 'atm-beras', label: 'ATM Beras', desc: 'Sistem pembagian sembako/beras berbasis digital.' },
    { id: 'rumah-singgah', label: 'Rumah Singgah', desc: 'Pengendalian kasur, check-in, check-out pasien transit.' },
    { id: 'assessment', label: 'Asessment Berkas', desc: 'Melakukan scoring kelayakan dhuafa / mustahik.' },
    { id: 'e-ppd', label: 'Rekap Pencairan', desc: 'Formulir PPD, kuitansi otomatis, dan log pencairan dana.' },
    { id: 'gemini-ai', label: 'Asisten AI Gemini', desc: 'Fitur chat analitik cerdas pendamping mustahik.' },
    { id: 'settings', label: 'Pengaturan', desc: 'Konfigurasi nama aplikasi, logo dinamis, dan kop surat.' },
    { id: 'user-management', label: 'Manajemen User', desc: 'Mengatur hak akses, jenjang jabatan, dan tampilan menu ini.' }
  ];

  useEffect(() => {
    setLoading(true);
    const unsubscribe = streamUserConfigs((data) => {
      setUsers(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (activeTab === 'logs') {
      setLogsLoading(true);
      const unsubscribe = streamSystemLogs((data) => {
        setSystemLogs(data);
        setLogsLoading(false);
      });
      return () => unsubscribe();
    }
  }, [activeTab]);

  const openAddModal = () => {
    setEditingUser(null);
    setFormData({
      name: '',
      email: '',
      role: 'Staff Administrasi',
      allowedMenus: ['dashboard', 'input', 'recipients'] // default menus
    });
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsModalOpen(true);
  };

  const openEditModal = (user: UserConfig) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      allowedMenus: user.allowedMenus || []
    });
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsModalOpen(true);
  };

  const handleToggleMenuSelection = (menuId: string) => {
    setFormData(prev => {
      const isSelected = prev.allowedMenus.includes(menuId);
      const updated = isSelected 
        ? prev.allowedMenus.filter(id => id !== menuId)
        : [...prev.allowedMenus, menuId];
      return { ...prev, allowedMenus: updated };
    });
  };

  const handleSelectAllMenus = () => {
    setFormData(prev => ({
      ...prev,
      allowedMenus: menuOptions.map(m => m.id)
    }));
  };

  const handleClearAllMenus = () => {
    setFormData(prev => ({
      ...prev,
      allowedMenus: []
    }));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const targetEmail = formData.email.trim().toLowerCase();
    if (!formData.name.trim()) {
      setErrorMsg('Nama lengkap wajib diisi.');
      return;
    }
    if (!targetEmail) {
      setErrorMsg('Alamat Email wajib diisi.');
      return;
    }

    // Regulate self-lock protection: admins can't revoke their own User Management menu permission by accident
    if (targetEmail === currentUserEmail?.toLowerCase() && !formData.allowedMenus.includes('user-management')) {
      setErrorMsg('Peringatan Keamanan: Anda tidak boleh menonaktifkan menu "Manajemen User" untuk diri Anda sendiri.');
      return;
    }

    try {
      await saveUserConfig(targetEmail, {
        name: formData.name.trim(),
        email: targetEmail,
        role: formData.role,
        allowedMenus: formData.allowedMenus
      });

      setSuccessMsg(editingUser ? 'Hak akses pengguna berhasil diperbarui!' : 'Pengguna baru berhasil dikonfigurasi!');
      setTimeout(() => setIsModalOpen(false), 800);
    } catch (err: any) {
      setErrorMsg('Gagal menyimpan konfigurasi: ' + (err.message || err));
    }
  };

  const handleDeleteConfig = async (user: UserConfig) => {
    if (user.email.toLowerCase() === currentUserEmail?.toLowerCase()) {
      alert('Anda tidak dapat menghapus akun Anda sendiri demi keamanan.');
      return;
    }

    if (window.confirm(`Apakah Anda yakin ingin menghapus konfigurasi hak akses untuk ${user.name} (${user.email})?`)) {
      try {
        await deleteUserConfig(user.id);
        setSuccessMsg('Akun / hak akses berhasil dihapus.');
        setTimeout(() => setSuccessMsg(null), 3000);
      } catch (err: any) {
        alert('Gagal menghapus: ' + (err.message || err));
      }
    }
  };

  const getActionBadgeStyle = (action: string) => {
    switch (action) {
      case 'CREATE':
        return 'bg-emerald-50 text-emerald-700 border-emerald-100 text-emerald-700 font-extrabold';
      case 'UPDATE':
        return 'bg-indigo-50 text-indigo-700 border-indigo-100 text-indigo-700 font-extrabold';
      case 'DELETE':
        return 'bg-rose-50 text-rose-700 border-rose-105 text-rose-700 font-extrabold';
      case 'GENERATION':
        return 'bg-amber-50 text-amber-700 border-amber-100 text-amber-700 font-extrabold';
      case 'LOGIN':
        return 'bg-purple-50 text-purple-700 border-purple-100 text-purple-700 font-extrabold';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'CREATE': return 'TAMBAH';
      case 'UPDATE': return 'UBAH';
      case 'DELETE': return 'HAPUS';
      case 'GENERATION': return 'CETAK/PPD';
      case 'LOGIN': return 'MASUK';
      default: return action;
    }
  };

  const formatLogTime = (isoString: any) => {
    try {
      if (!isoString) return '-';
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return String(isoString);
      
      const day = String(d.getDate()).padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      const month = months[d.getMonth()];
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const mins = String(d.getMinutes()).padStart(2, '0');
      const secs = String(d.getSeconds()).padStart(2, '0');
      return `${day} ${month} ${year}, ${hours}:${mins}:${secs}`;
    } catch {
      return String(isoString);
    }
  };

  const filteredLogs = systemLogs.filter(log => {
    if (logsActionFilter !== 'ALL' && log.action !== logsActionFilter) return false;
    if (!logsSearchQuery) return true;
    const q = logsSearchQuery.toLowerCase();
    return (
      (log.name || '').toLowerCase().includes(q) ||
      (log.email || '').toLowerCase().includes(q) ||
      (log.target || '').toLowerCase().includes(q) ||
      (log.details || '').toLowerCase().includes(q)
    );
  });

  const filteredUsers = users.filter(usr => 
    usr.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    usr.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    usr.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Upper Panel */}
      <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Manajemen Hak Akses & Log Audit</h3>
              <p className="text-xs text-slate-400 font-medium">Kelola batasan menu samping staff serta pantau transparansi administrasi via Log Audit.</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Sub Tab Buttons */}
          <div className="bg-slate-100 p-1 rounded-2xl flex items-center shadow-inner">
            <button
              onClick={() => setActiveTab('users')}
              className={cn(
                "px-3.5 py-1.5 text-xs font-extrabold rounded-xl transition-all cursor-pointer",
                activeTab === 'users' ? "bg-white text-indigo-600 shadow-xs" : "text-slate-500 hover:text-slate-800"
              )}
            >
              Hak Akses
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={cn(
                "px-3.5 py-1.5 text-xs font-extrabold rounded-xl transition-all cursor-pointer",
                activeTab === 'logs' ? "bg-white text-indigo-600 shadow-xs" : "text-slate-500 hover:text-slate-800"
              )}
            >
              Log Aktivitas
            </button>
          </div>

          <button
            type="button"
            onClick={onBackToDashboard}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl transition-all cursor-pointer"
          >
            Kembali ke Beranda
          </button>
          
          {activeTab === 'users' && (
            <button
              onClick={openAddModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-2xl shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <UserPlus className="w-4 h-4" /> Tambah Konfigurasi
            </button>
          )}
        </div>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold leading-relaxed flex items-center gap-2 shadow-xs transition-all animate-bounce">
          <Check className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {activeTab === 'users' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column info & statistics */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white border border-indigo-950 rounded-3xl p-6 shadow-md space-y-4">
              <h4 className="text-sm font-bold tracking-wider text-indigo-300 uppercase font-mono">Status Sistem & Lisensi</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-indigo-800 pb-2">
                  <span className="text-xs text-slate-300">Total User Terdaftar</span>
                  <span className="font-mono text-lg font-black text-white">{users.length} Orang</span>
                </div>
                <div className="flex items-center justify-between border-b border-indigo-800 pb-2">
                  <span className="text-xs text-slate-300">Level Otorisasi Admin</span>
                  <span className="text-xs font-bold px-2 py-0.5 bg-indigo-500/30 text-indigo-200 rounded-md">Atribut ABAC</span>
                </div>
                <div className="flex items-center justify-between pb-1">
                  <span className="text-xs text-slate-300">Sistem Filter</span>
                  <span className="text-xs font-bold text-emerald-400">Aktif (Firestore-Sync)</span>
                </div>
              </div>

              <div className="p-4 bg-indigo-800/20 border border-indigo-800/30 rounded-2xl text-[11px] text-indigo-200 leading-relaxed space-y-2">
                <div className="flex gap-2">
                  <Shield className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-white mb-0.5">Sistem Zero-Trust Menu:</p>
                    Setiap pengguna yang berhasil masuk akan dicek konfigurasi emailnya. Menu samping (Sidebar) akan membatasi rendering tombol halaman jika email pengguna tidak terdaftar atau tidak memiliki izin pada menu terkait.
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-xs space-y-3">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 text-sm">
                <HelpCircle className="w-4 h-4 text-indigo-500" />
                <span>Daftar Jabatan Standar (Role)</span>
              </div>
              <div className="space-y-3">
                <div className="p-3 bg-slate-50 border border-slate-150 rounded-2xl">
                  <p className="text-xs font-extrabold text-slate-800">Super Admin / Kepala Lembaga</p>
                  <p className="text-[10px] text-slate-400 mt-1 leading-normal">Memiliki hak akses penuh untuk membaca, mengubah, menghapus data penerima, mengesahkan PPD, dan mengelola pengguna lain.</p>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-150 rounded-2xl">
                  <p className="text-xs font-extrabold text-slate-800">Staff Keuangan (Finance)</p>
                  <p className="text-[10px] text-slate-400 mt-1 leading-normal">Bertanggung jawab pada Rekap Pencarian, laporan pencairan e-PPD, dan audit BNBA bulanan.</p>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-150 rounded-2xl">
                  <p className="text-xs font-extrabold text-slate-800">Pendamping Lapangan (Surveyor)</p>
                  <p className="text-[10px] text-slate-400 mt-1 leading-normal">Melakukan kunjungan / survey secara aktif, mengisi lembar assessment kelayakan mustahik di lapangan.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right column list of configured users */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h4 className="text-sm font-extrabold text-slate-800">Saringan Staf & Akun</h4>
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text" 
                    placeholder="Cari nama, email, atau jabatan..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full text-xs font-semibold pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-400"
                  />
                </div>
              </div>

              {loading ? (
                <div className="text-center py-12 space-y-2">
                  <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
                  <p className="text-xs text-slate-400 font-medium">Menghubungkan ke server Firestore...</p>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-slate-400 space-y-2">
                  <div className="max-w-[120px] mx-auto opacity-30">
                    <X className="w-12 h-12 mx-auto" />
                  </div>
                  <p className="text-xs font-bold text-slate-800">Tidak ada konfigurasi ditemukan</p>
                  <p className="text-[10px]">Silakan klik tombol "Tambah Konfigurasi" untuk membuat baru.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredUsers.map((usr) => (
                    <div 
                      key={usr.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4.5 bg-slate-50 hover:bg-slate-100/50 border border-slate-200/60 rounded-2xl transition-all shadow-2xs hover:shadow-xs group"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors shrink-0">
                          <User className="w-4 h-4" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h5 className="text-xs font-black text-slate-800">{usr.name}</h5>
                            <span className="text-[9px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-bold">{usr.role}</span>
                            {usr.email.toLowerCase() === currentUserEmail?.toLowerCase() && (
                              <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">Anda</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-slate-400 font-semibold">
                            <Mail className="w-3 h-3" />
                            <span>{usr.email}</span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {usr.allowedMenus && usr.allowedMenus.length > 0 ? (
                              usr.allowedMenus.map(menuId => {
                                const menuObj = menuOptions.find(m => m.id === menuId);
                                return (
                                  <span 
                                    key={menuId}
                                    className="text-[9px] bg-indigo-50 text-indigo-600 px-1 py-0.2 rounded font-semibold border border-indigo-100"
                                  >
                                    {menuObj?.label || menuId}
                                  </span>
                                );
                              })
                            ) : (
                              <span className="text-[9px] bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded font-bold border border-rose-100 flex items-center gap-0.5">
                                <Lock className="w-2.5 h-2.5" /> Akses Terkunci (Tanpa Menu)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                        <button
                          onClick={() => openEditModal(usr)}
                          className="p-1.5 hover:p-2 bg-white hover:bg-slate-200 text-slate-600 hover:text-indigo-600 border border-slate-200 hover:border-slate-300 rounded-xl transition-all cursor-pointer shadow-2xs"
                          title="Edit Hak Akses"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteConfig(usr)}
                          disabled={usr.email.toLowerCase() === currentUserEmail?.toLowerCase()}
                          className={cn(
                            "p-1.5 hover:p-2 bg-white text-slate-400 border rounded-xl transition-all shadow-2xs",
                            usr.email.toLowerCase() === currentUserEmail?.toLowerCase()
                              ? "opacity-30 cursor-not-allowed"
                              : "hover:bg-red-50 hover:text-red-600 hover:border-red-200 cursor-pointer"
                          )}
                          title="Hapus Hak Akses"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-5">
            <div>
              <h4 className="text-sm font-extrabold text-slate-800">Catatan Audit & Pelacakan Sistem</h4>
              <p className="text-[11px] text-slate-400 font-medium">Jejak log real-time operasional dari database Firestore untuk akuntabilitas lembaga.</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-64 max-w-xs">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  placeholder="Cari log atau staf..."
                  value={logsSearchQuery}
                  onChange={(e) => setLogsSearchQuery(e.target.value)}
                  className="w-full text-xs font-semibold pl-8.5 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-400"
                />
              </div>

              <select
                value={logsActionFilter}
                onChange={(e) => setLogsActionFilter(e.target.value)}
                className="text-xs font-extrabold px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-705 focus:bg-white focus:ring-1 focus:ring-indigo-500 transition-all outline-none"
              >
                <option value="ALL">Semua Aksi</option>
                <option value="CREATE">Tambah Data</option>
                <option value="UPDATE">Ubah Data</option>
                <option value="DELETE">Hapus Data</option>
                <option value="GENERATION">Cetak / PPD</option>
              </select>

              {(logsSearchQuery || logsActionFilter !== 'ALL') && (
                <button
                  type="button"
                  onClick={() => {
                    setLogsSearchQuery('');
                    setLogsActionFilter('ALL');
                  }}
                  className="text-xs font-bold text-indigo-605 hover:text-indigo-800 px-2 py-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {logsLoading ? (
            <div className="text-center py-20 space-y-2">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
              <p className="text-xs text-slate-400 font-medium">Menyinkronkan dan memuat dari server...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-16 bg-slate-50 border border-dashed border-slate-200 rounded-3xl text-slate-400 space-y-2 animate-pulse">
              <FileText className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-xs font-bold text-slate-800">Tidak ada audit log ditemukan</p>
              <p className="text-[10px]">Silakan masukkan kata kunci pencarian yang berbeda.</p>
            </div>
          ) : (
            <div className="overflow-x-auto select-none rounded-2xl border border-slate-100">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-150 text-[10px] font-bold uppercase text-slate-500 tracking-wider font-mono">
                    <th className="py-3 px-4">Waktu Audit</th>
                    <th className="py-3 px-4">Staf Pelaksana</th>
                    <th className="py-3 px-4 text-center">Operasi</th>
                    <th className="py-3 px-4">Modul Target</th>
                    <th className="py-3 px-4">Uraian Aktivitas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 group transition-colors text-xs text-slate-600 font-semibold">
                      <td className="py-3 px-4 font-mono text-[10px] text-slate-500 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span>{formatLogTime(log.createdAt)}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="space-y-0.5">
                          <p className="font-extrabold text-slate-800 text-[11px]">{log.name}</p>
                          <p className="text-[9px] text-slate-400 font-bold font-mono">{log.email}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span className={cn(
                          "inline-block px-2.5 py-0.5 text-[9px] font-mono tracking-wider rounded-md border text-center font-black",
                          getActionBadgeStyle(log.action)
                        )}>
                          {getActionLabel(log.action)}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-extrabold text-slate-700 whitespace-nowrap">
                        <span>{log.target}</span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 max-w-md leading-relaxed font-semibold">
                        <span className="line-clamp-2 md:line-clamp-none text-[11px]" title={log.details}>
                          {log.details}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="bg-slate-50 border-t border-slate-100 p-3.5 text-[10px] text-right text-slate-400 font-bold font-mono">
                Menampilkan {filteredLogs.length} riwayat aktivitas operasional terbaru.
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL EDIT/ADD */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 transition-all overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-100 animate-in fade-in zoom-in duration-100">
            {/* Header */}
            <div className="px-6 py-4.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  {editingUser ? <Edit className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">
                    {editingUser ? `Sunting Hak Akses: ${editingUser.name}` : 'Mendaftarkan Konfigurasi Hak Akses Baru'}
                  </h4>
                  <p className="text-[10px] text-slate-400">Atur batasan rendering menu samping dan tugas fungsional.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 flex flex-col lg:flex-row gap-6">
              {/* Left Form: Profile Fields */}
              <div className="lg:w-1/3 space-y-4">
                <h5 className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Identitas Pegawai</h5>
                
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-indigo-500" /> Nama Lengkap
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Ahmad Subagyo"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 transition-all"
                  />
                </div>

                <div className="space-y-1 inputs">
                  <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-indigo-500" /> Alamat Email Resmi
                  </label>
                  <input
                    type="email"
                    required
                    disabled={!!editingUser}
                    placeholder="Contoh: ahmad@baznas.org"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={cn(
                      "w-full text-xs font-semibold px-3 py-2 border rounded-xl outline-none focus:ring-1 focus:ring-indigo-500 transition-all",
                      editingUser 
                        ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed" 
                        : "bg-slate-50 border-slate-200 focus:bg-white"
                    )}
                  />
                  {!editingUser && (
                    <p className="text-[9px] text-amber-500 font-semibold leading-relaxed">
                      Catatan: Email harus sama dengan email pendaftaran akun karyawan yang bersangkutan.
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-indigo-500" /> Jabatan / Otoritas
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full text-xs font-bold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 transition-all"
                  >
                    <option value="Super Admin">Super Admin</option>
                    <option value="Admin Keuangan">Admin Keuangan</option>
                    <option value="Staff Administrasi">Staff Administrasi (Layanan)</option>
                    <option value="Pendamping Lapangan">Pendamping Lapangan</option>
                    <option value="Mitra Distribusi">Mitra Distribusi</option>
                  </select>
                </div>

                {errorMsg && (
                  <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-[10px] font-bold leading-normal flex items-start gap-1.5 shadow-2xs">
                    <AlertIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}
                
                {successMsg && (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-[10px] font-bold leading-normal flex items-start gap-1.5 shadow-2xs">
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span>{successMsg}</span>
                  </div>
                )}
              </div>

              {/* Right Form: Menu Visibility Checkboxes */}
              <div className="lg:w-2/3 space-y-3 flex flex-col h-full bg-slate-50 p-4 border border-slate-200 rounded-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <div>
                    <h5 className="text-[11px] font-black uppercase text-slate-500 tracking-wider">Pilih rendering menu samping</h5>
                    <p className="text-[9px] text-slate-400 mt-0.5 font-bold">Menu yang dipilih akan muncul secara eksklusif di Sidebar staf.</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleSelectAllMenus}
                      className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-[10px] font-black rounded-lg transition-colors cursor-pointer border border-indigo-100"
                    >
                      Pilih Semua
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAllMenus}
                      className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-500 text-[10px] font-bold rounded-lg transition-colors cursor-pointer border border-slate-200"
                    >
                      Bersihkan
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 h-72 lg:h-[350px] overflow-y-auto pr-1">
                  {menuOptions.map((menu) => {
                    const isSelected = formData.allowedMenus.includes(menu.id);
                    return (
                      <button
                        type="button"
                        key={menu.id}
                        onClick={() => handleToggleMenuSelection(menu.id)}
                        className={cn(
                          "flex items-start text-left gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer outline-none focus:ring-1 focus:ring-indigo-500",
                          isSelected
                            ? "bg-indigo-100/50 border-indigo-300 text-indigo-900 shadow-2xs"
                            : "bg-white hover:bg-slate-100 border-slate-200 text-slate-700"
                        )}
                      >
                        <div className="mt-0.5 shrink-0">
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-indigo-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300" />
                          )}
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-[11px] font-extrabold flex items-center gap-1">
                            <span>{menu.label}</span>
                            <span className="text-[9px] font-mono opacity-50 font-normal">({menu.id})</span>
                          </p>
                          <p className="text-[9px] text-slate-400 leading-normal font-semibold">
                            {menu.desc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </form>

            {/* Footer Buttons */}
            <div className="px-6 py-4.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Batalkan
              </button>
              <button
                type="button"
                onClick={handleFormSubmit}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-750 text-white font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1"
              >
                <Check className="w-4 h-4" /> Simpan Konfigurasi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AlertIcon(props: any) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
