import React, { useState } from 'react';
import { 
  Search, Download, ArrowUpDown, ChevronLeft, ChevronRight, AlertCircle 
} from 'lucide-react';
import { AID_TYPES, AID_STATUSES } from '../constants';
import { Recipient } from '../types';
import { cn } from '../lib/utils';

interface BNBARecapTableProps {
  data: Recipient[];
  onReceipt?: (recipient: Recipient) => void;
  onMPZIS?: (recipient: Recipient, lampiranItems?: Recipient[]) => void;
  onEPPD?: (recipient: Recipient, checkedRecipients?: Recipient[]) => void;
  onInternalMemo?: (recipient: Recipient) => void;
  onSurvey?: (recipient: Recipient) => void;
  onDeleteRecipient?: (recipient: Recipient) => void;
}

type SortField = keyof Recipient;
type SortOrder = 'asc' | 'desc';

export default function BNBARecapTable({ 
  data 
}: BNBARecapTableProps) {
  // Filters & State
  const [search, setSearch] = useState('');
  const [filterSector, setFilterSector] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterType, setFilterType] = useState('All');
  const [sortField, setSortField] = useState<SortField>('submissionDate');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Available unique sectors in the data
  const uniqueSectors = Array.from(new Set(data.map(item => item.sector).filter(Boolean)));

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    setCurrentPage(1);
  };

  // Filter and Sort Data
  const filteredData = data
    .filter(item => {
      const matchesSearch = 
        (item.name || '').toLowerCase().includes(search.toLowerCase()) || 
        (item.nik || '').includes(search) ||
        (item.registrationId && item.registrationId.toLowerCase().includes(search.toLowerCase())) ||
        (item.kampung && item.kampung.toLowerCase().includes(search.toLowerCase())) ||
        (item.district && item.district.toLowerCase().includes(search.toLowerCase()));
        
      const matchesSector = filterSector === 'All' || item.sector === filterSector;
      const matchesStatus = filterStatus === 'All' || item.status === filterStatus;
      const matchesType = filterType === 'All' || item.aidType === filterType;
      
      return matchesSearch && matchesSector && matchesStatus && matchesType;
    })
    .sort((a, b) => {
      let aVal: any = a[sortField] ?? '';
      let bVal: any = b[sortField] ?? '';
      
      if (sortField === 'amountProposed' || sortField === 'amountDisbursed') {
        aVal = Number(a[sortField]) || 0;
        bVal = Number(b[sortField]) || 0;
      }
      
      if (sortField === 'submissionDate' || sortField === 'createdAt' || sortField === 'updatedAt' || sortField === 'dob' || sortField === 'headOfFamilyDob' || sortField === 'surveyDate' || sortField === 'disbursementDate') {
        aVal = a[sortField] ? new Date(a[sortField] as string).getTime() : 0;
        bVal = b[sortField] ? new Date(b[sortField] as string).getTime() : 0;
      }

      if (typeof aVal === 'string') {
        return sortOrder === 'asc' 
          ? aVal.localeCompare(bVal) 
          : bVal.localeCompare(aVal);
      } else {
        return sortOrder === 'asc' 
          ? (aVal > bVal ? 1 : -1) 
          : (bVal > aVal ? 1 : -1);
      }
    });

  // Pagination calculations
  const totalRecords = filteredData.length;
  const totalPages = Math.ceil(totalRecords / rowsPerPage) || 1;
  const indexOfLastRow = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentRows = filteredData.slice(indexOfFirstRow, indexOfLastRow);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // Full fields schema for header and columns mapping
  const columns: { key: keyof Recipient; label: string; alignment?: 'left' | 'center' | 'right'; format?: (val: any) => string }[] = [
    { key: 'registrationId', label: 'ID Registrasi' },
    { key: 'source', label: 'Sumber Berkas' },
    { key: 'submissionDate', label: 'Tgl Berkas Masuk', alignment: 'center', format: (v) => v ? new Date(v).toLocaleDateString('id-ID') : '-' },
    { key: 'name', label: 'Nama Mustahik' },
    { key: 'nik', label: 'NIK' },
    { key: 'kk', label: 'No. KK' },
    { key: 'pob', label: 'Tempat Lahir' },
    { key: 'dob', label: 'Tanggal Lahir', alignment: 'center', format: (v) => v ? new Date(v).toLocaleDateString('id-ID') : '-' },
    { key: 'gender', label: 'Jenis Kelamin', alignment: 'center' },
    { key: 'familyStatus', label: 'Status Hubungan Keluarga' },
    { key: 'headOfFamilyName', label: 'Nama Kepala Keluarga' },
    { key: 'headOfFamilyDob', label: 'Tgl Lahir Kepala Keluarga', alignment: 'center', format: (v) => v ? new Date(v).toLocaleDateString('id-ID') : '-' },
    { key: 'contact', label: 'No. HP/Kontak' },
    { key: 'address', label: 'Alamat Lengkap' },
    { key: 'rt', label: 'RT', alignment: 'center' },
    { key: 'rw', label: 'RW', alignment: 'center' },
    { key: 'kampung', label: 'Kampung/Kelurahan' },
    { key: 'district', label: 'Kecamatan' },
    { key: 'sector', label: 'Bidang' },
    { key: 'subSector', label: 'Sub Bidang' },
    { key: 'aidType', label: 'Jenis Bantuan' },
    { key: 'programName', label: 'Nama Program' },
    { key: 'companion', label: 'Pendamping Program' },
    { key: 'amountProposed', label: 'Nominal Diajukan (IDR)', alignment: 'right', format: (v) => v ? `Rp ${Number(v).toLocaleString('id-ID')}` : 'Rp 0' },
    { key: 'purpose', label: 'Mengajukan Bantuan Untuk' },
    { key: 'surveyDate', label: 'Tgl Survey', alignment: 'center', format: (v) => v ? new Date(v).toLocaleDateString('id-ID') : '-' },
    { key: 'skmp', label: 'SKMP Ke-', alignment: 'center' },
    { key: 'disbursementDate', label: 'Tgl Penyaluran', alignment: 'center', format: (v) => v ? new Date(v).toLocaleDateString('id-ID') : '-' },
    { key: 'amountDisbursed', label: 'Nominal Disalurkan (IDR)', alignment: 'right', format: (v) => v ? `Rp ${Number(v).toLocaleString('id-ID')}` : 'Rp 0' },
    { key: 'schoolName', label: 'Nama Sekolah' },
    { key: 'schoolLevel', label: 'Tingkat Sekolah', alignment: 'center' },
    { key: 'schoolClass', label: 'Kelas', alignment: 'center' },
    { key: 'schoolAddress', label: 'Alamat Sekolah' },
    { key: 'schoolPhone', label: 'Telp Sekolah' },
    { key: 'bankAccountNo', label: 'No. Rekening' },
    { key: 'bankName', label: 'Nama Bank' },
    { key: 'bankAccountHolder', label: 'Nama Pemilik Rekening' },
    { key: 'notes', label: 'Catatan Tambahan' },
    { key: 'createdAt', label: 'Dibuat Pada', alignment: 'center', format: (v) => v ? new Date(v).toLocaleString('id-ID') : '-' },
    { key: 'updatedAt', label: 'Diperbarui Pada', alignment: 'center', format: (v) => v ? new Date(v).toLocaleString('id-ID') : '-' }
  ];

  // Export current filtered table to CSV (UTF-8, custom separation, Excel-friendly)
  const handleExportCSV = () => {
    const headers = columns.map(c => c.label);

    const cVSRows = filteredData.map(item => {
      return columns.map(col => {
        const rawVal = item[col.key];
        if (rawVal === undefined || rawVal === null) return '';
        
        // Custom formatting for CSV values if required
        if (col.key === 'nik' || col.key === 'kk' || col.key === 'contact' || col.key === 'bankAccountNo') {
          return `'${rawVal}`; // Force excel text format
        }
        
        if (col.format) {
          return col.format(rawVal);
        }
        return String(rawVal);
      });
    });

    // Generate CSV string content
    const csvContent = [
      headers.join(','),
      ...cVSRows.map(row => row.map(value => `"${String(value).replace(/[\n\r]/g, ' ')}"`).join(','))
    ].join('\n');

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `rekap_bnba_lengkap_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6" id="bnba-recap-main-container">
      {/* Filters Toolbar Barcard */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6" id="bnba-filters-pane">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
          {/* Main search and dynamic state reports count */}
          <div className="flex-grow max-w-xl">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Cari Mustahik (Nama, NIK, ID Reg, Kampung, Kecamatan)..." 
                className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm font-semibold placeholder:font-medium text-slate-700"
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Filter Bidang / Sektor */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Bidang:</span>
              <select 
                className="bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm font-bold"
                value={filterSector}
                onChange={e => {
                  setFilterSector(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="All">Semua Bidang</option>
                {uniqueSectors.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Filter Status Bantuan */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Status:</span>
              <select 
                className="bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm font-bold"
                value={filterStatus}
                onChange={e => {
                  setFilterStatus(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="All">Semua Status</option>
                {AID_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Filter Jenis Bantuan */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Jenis:</span>
              <select 
                className="bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm font-bold"
                value={filterType}
                onChange={e => {
                  setFilterType(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="All">Semua Jenis</option>
                {AID_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* CSV Export Button */}
            <button 
              onClick={handleExportCSV}
              id="bnba-recap-export-csv-button"
              className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-sm hover:shadow transition-all cursor-pointer"
              title="Ekspor Seluruh Rekam Ke File Excel / CSV"
            >
              <Download className="w-4 h-4" />
              <span>Ekspor Lengkap (.CSV)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Responsive Datatable with flat fields, no wrapping, single-column alignment */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" id="bnba-table-panel">
        <div className="overflow-x-auto overflow-y-auto max-h-[650px]">
          <table className="w-full text-left border-collapse" id="bnba-recap-datatable">
            <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-10">
              <tr className="divide-x divide-slate-200 text-slate-700">
                <th className="py-3.5 px-4 text-center text-xs font-black uppercase tracking-wider bg-slate-100 w-16 sticky left-0 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.05)] border-r border-slate-205">
                  No
                </th>
                
                {columns.map(col => {
                  const isSorted = sortField === col.key;
                  return (
                    <th 
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={cn(
                        "py-3.5 px-5 text-xs font-extrabold uppercase tracking-wider cursor-pointer hover:bg-slate-200 select-none transition-all whitespace-nowrap",
                        col.alignment === 'right' ? 'text-right' : col.alignment === 'center' ? 'text-center' : 'text-left',
                        isSorted ? 'bg-slate-200 text-indigo-700' : 'text-slate-700'
                      )}
                    >
                      <div className={cn(
                        "flex items-center gap-1.5",
                        col.alignment === 'right' ? 'justify-end' : col.alignment === 'center' ? 'justify-center' : 'justify-start'
                      )}>
                        <span>{col.label}</span>
                        <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            
            <tbody className="divide-y divide-slate-200 bg-white">
              {currentRows.length > 0 ? (
                currentRows.map((item, index) => {
                  const noIndex = indexOfFirstRow + index + 1;
                  
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors divide-x divide-slate-100" id={`bnba-row-${item.id}`}>
                      {/* No - Fixed Left Column */}
                      <td className="py-3 px-4 text-center text-xs font-bold font-mono text-slate-500 bg-slate-50 sticky left-0 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.05)] border-r border-slate-205">
                        {noIndex}
                      </td>

                      {/* Dynamic Columns 1x1 flat map */}
                      {columns.map(col => {
                        const rawVal = item[col.key];
                        let renderedVal = rawVal !== undefined && rawVal !== null ? String(rawVal) : '-';
                        
                        // Treat specific keys visually
                        if (col.format) {
                          renderedVal = col.format(rawVal);
                        }

                        // Determine text layout style classes
                        const isPrimary = col.key === 'name' || col.key === 'registrationId';
                        const isCode = col.key === 'nik' || col.key === 'kk' || col.key === 'contact' || col.key === 'bankAccountNo';
                        const isNominal = col.key === 'amountProposed' || col.key === 'amountDisbursed';

                        return (
                          <td 
                            key={col.key} 
                            className={cn(
                              "py-3 px-5 text-xs whitespace-nowrap font-semibold",
                              col.alignment === 'right' ? 'text-right font-mono' : col.alignment === 'center' ? 'text-center' : 'text-left',
                              isPrimary ? 'font-black text-slate-900 uppercase' : 'text-slate-600',
                              isCode ? 'font-mono text-slate-800' : '',
                              isNominal ? 'text-emerald-800 font-extrabold font-mono bg-emerald-50/20' : ''
                            )}
                          >
                            {renderedVal}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={columns.length + 1} className="py-16 text-center text-slate-400 font-semibold bg-slate-50/10" id="bnba-empty-table-state">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <AlertCircle className="w-10 h-10 text-slate-300" />
                      <p className="text-sm font-bold">Tidak ada data rekap BNBA yang sesuai dengan kriteria pencarian</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginated Footer Statistics */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-bold text-slate-500" id="bnba-table-pagination-panel">
          <div className="flex items-center gap-2">
            <span>Tampilkan</span>
            <select 
              className="bg-white border border-slate-200 rounded-lg py-1.5 px-2.5 font-bold outline-none text-slate-600"
              value={rowsPerPage}
              onChange={e => {
                setRowsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>baris per halaman</span>
            <span className="text-slate-300 mx-1">|</span>
            <span className="text-slate-600">Total {totalRecords} records</span>
          </div>

          <div className="flex items-center gap-1.5 font-extrabold uppercase tracking-wider">
            <button 
              disabled={currentPage === 1}
              onClick={() => handlePageChange(currentPage - 1)}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:hover:bg-white transition-all cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-slate-600 px-3 py-1.5 bg-white border border-slate-200 rounded-lg shadow-sm">
              Halaman {currentPage} dari {totalPages}
            </span>
            <button 
              disabled={currentPage === totalPages}
              onClick={() => handlePageChange(currentPage + 1)}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:hover:bg-white transition-all cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
