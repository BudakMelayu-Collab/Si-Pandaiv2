import fs from 'fs';

const file = 'src/components/RumahSinggahModule.tsx';
let data = fs.readFileSync(file, 'utf8');

const target = `            )}
          </AnimatePresence>`;

const replacement = `            )}
            {patientToDelete && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setPatientToDelete(null)}
                  className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm cursor-pointer"
                />
                
                <motion.div
                  initial={{ scale: 0.95, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 10 }}
                  className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 z-10 font-normal"
                >
                  <div className="p-6 text-center space-y-4 font-normal">
                    <div className="w-16 h-16 bg-slate-50 border border-slate-200 text-black rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                      <Trash2 className="w-8 h-8 text-black" />
                    </div>
                    
                    <div className="space-y-2">
                      <h3 className="text-sm font-normal text-black tracking-tight">Hapus Riwayat Pasien</h3>
                      <p className="text-black text-sm leading-relaxed font-normal">
                        Anda yakin ingin menghapus data pasien <span className="font-bold underline decoration-slate-300 underline-offset-4">{patientToDelete.name}</span> secara permanen?
                      </p>
                    </div>

                    <div className="flex gap-3 pt-4">
                      <button 
                        onClick={() => setPatientToDelete(null)}
                        className="flex-1 py-2.5 text-sm font-normal text-black bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors cursor-pointer"
                      >
                        Batal
                      </button>
                      <button 
                        onClick={handleDeleteConfirmed}
                        className="flex-1 py-2.5 text-sm font-normal text-white bg-rose-600 hover:bg-rose-700 border border-transparent rounded-xl transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-2"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Ya, hapus permanen
                      </button>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>`;

if (data.includes(target)) {
  data = data.replace(target, replacement);
  fs.writeFileSync(file, data, 'utf8');
  console.log("Success");
} else {
  console.log("Target not found. Looking for matching using regex.");
  const rgx = /\s*\}\)\}\s*<\/AnimatePresence>/
  if (rgx.test(data)) {
     data = data.replace(rgx, replacement);
     fs.writeFileSync(file, data, 'utf8');
     console.log("Success with regex");
  } else {
     console.log("Regex also not found");
  }
}
