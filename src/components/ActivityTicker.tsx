import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Recipient } from '../types';
import { Clock } from 'lucide-react';

interface ActivityTickerProps {
  data: Recipient[];
}

export default function ActivityTicker({ data }: ActivityTickerProps) {
  const [index, setIndex] = useState(0);

  // Ambil data hari ini saja, urutkan terbaru
  const todayActivities = [...data]
    .filter(item => {
      const todayStr = new Date().toISOString().split('T')[0];
      return item.submissionDate === todayStr;
    })
    .sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });

  useEffect(() => {
    setIndex(0);
    if (todayActivities.length <= 1) return;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % todayActivities.length);
    }, 4000); // 4 seconds
    return () => clearInterval(interval);
  }, [todayActivities.length]);

  if (todayActivities.length === 0) {
    return <span className="text-sm font-medium tracking-wider text-slate-500 italic">Belum ada aktivitas hari ini</span>;
  }

  const currentItem = todayActivities[index] || todayActivities[0] || {} as Recipient;
  const timeStr = currentItem.createdAt ? new Date(currentItem.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="relative h-6 flex items-center overflow-hidden flex-1 px-1">
      <AnimatePresence mode="popLayout">
        <motion.div
          key={currentItem.id || 'default-key'}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="absolute inset-0 flex items-center gap-2 text-sm text-slate-700 whitespace-nowrap"
        >
          <Clock className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
          <span className="font-bold text-indigo-700 flex-shrink-0">{timeStr}</span>
          <span className="font-semibold text-slate-800 flex-shrink-0">Berkas Baru:</span>
          <span className="font-medium text-black truncate max-w-[150px]">{currentItem.name?.toLowerCase().replace(/\b\w/g, l => l.toUpperCase()) || ''}</span>
          {currentItem.programName && <span className="text-slate-500 truncate max-w-[150px]">[{currentItem.programName}]</span>}
          <span className="text-indigo-500 font-mono text-xs ml-1 bg-indigo-50 px-1.5 py-0.5 rounded-md border border-indigo-100 flex-shrink-0">
            #{currentItem.registrationId || currentItem.id?.substring(0, 6) || ''}
          </span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
