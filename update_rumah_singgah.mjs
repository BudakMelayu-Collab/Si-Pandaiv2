import fs from 'fs';
let content = fs.readFileSync('src/components/RumahSinggahModule.tsx', 'utf-8');
const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<th ') && lines[i].includes('Nama Pasien') && lines[i+1].includes('NIK')) {
    // Found headers line i
    lines.splice(i, 8,
      '                  <th className="px-6 py-4 font-semibold text-slate-600 border-r border-slate-200/40">Jenis Rawatan</th>',
      '                  <th className="px-6 py-4 font-semibold text-slate-600 border-r border-slate-200/40">Nama Pasien</th>',
      '                  <th className="px-6 py-4 font-semibold text-slate-600 border-r border-slate-200/40">Nama Pendamping</th>',
      '                  <th className="px-6 py-4 font-semibold text-slate-600 border-r border-slate-200/40">NIK</th>',
      '                  <th className="px-6 py-4 font-semibold text-slate-600 border-r border-slate-200/40">Diagnosa / Status</th>',
      '                  <th className="px-6 py-4 font-semibold text-slate-600 border-r border-slate-200/40">Check-in</th>',
      '                  <th className="px-6 py-4 font-semibold text-slate-600 border-r border-slate-200/40">Check-out</th>',
      '                  <th className="px-6 py-4 font-semibold text-slate-600 border-r border-slate-200/40 text-center">Kamar Terakhir</th>',
      '                  <th className="px-6 py-4 font-semibold text-slate-600 border-r border-slate-200/40">Kampung & Kecamatan</th>',
      '                  <th className="px-6 py-4 font-semibold text-slate-600 border-r border-slate-200/40">Jenis Kelamin</th>',
      '                  <th className="px-6 py-4 font-semibold text-slate-600 border-r border-slate-200/40">RS Tujuan</th>',
      '                  <th className="px-6 py-4 font-semibold text-slate-600 border-r border-slate-200/40">Hubungan.P</th>',
      '                  <th className="px-6 py-4 font-semibold text-slate-600 border-r border-slate-200/40">Nomor / WA</th>',
      '                  <th className="px-6 py-4 font-semibold text-slate-600 text-center border-r border-slate-200/40">Aksi</th>',
      '                  <th className="px-6 py-4 font-semibold text-slate-600 text-center">Lihat Berkas</th>'
    );
    console.log('Headers replaced using index');
    break;
  }
}

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<td ') && lines[i].includes('{p.name}') && lines[i+1].includes('{p.nik}')) {
    // Found body cells
    // The previously read file had 8 lines corresponding to: p.name, p.nik, p.notes, checkIn, checkOut, td, span, td...
    lines.splice(i, 8,
      `                     <td className="px-6 py-4 text-slate-800">{p.rsJenisRawatan || '-'}</td>`,
      `                     <td className="px-6 py-4 font-bold text-slate-800">{p.name}</td>`,
      `                     <td className="px-6 py-4 text-slate-800">{p.rsCompanionName || '-'}</td>`,
      `                     <td className="px-6 py-4 text-slate-800">{p.nik}</td>`,
      `                     <td className="px-6 py-4 truncate max-w-[200px] text-slate-800">{p.notes || '-'}</td>`,
      `                     <td className="px-6 py-4 text-slate-800">{formatDate(p.rsCheckInDate)}</td>`,
      `                     <td className="px-6 py-4 font-medium text-slate-800">{formatDate(p.rsCheckOutDate)}</td>`,
      `                     <td className="px-6 py-4 text-center">`,
      `                        <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-bold text-xs">{p.rsBedId}</span>`,
      `                     </td>`,
      `                     <td className="px-6 py-4 text-slate-800">{p.kampung || '-'} / {p.district || '-'}</td>`,
      `                     <td className="px-6 py-4 text-slate-800">{p.gender || '-'}</td>`,
      `                     <td className="px-6 py-4 text-slate-800">{p.rsHospital || '-'}</td>`,
      `                     <td className="px-6 py-4 text-slate-800">{p.rsCompanionRelation || '-'}</td>`,
      `                     <td className="px-6 py-4 text-slate-800">{p.contact || '-'}</td>`
    );
    console.log('Cells replaced using index');
    break;
  }
}

fs.writeFileSync('src/components/RumahSinggahModule.tsx', lines.join('\n'));
