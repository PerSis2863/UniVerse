'use client';

import { useEffect, useState } from 'react';
import { m as motion } from 'framer-motion';
import { Topbar } from '@/components/layout/Topbar';
import { Segmented } from '@/components/ui/Segmented';
import { EquipmentRegister } from '@/components/registers/EquipmentRegister';
import { BusRegister, HostelRegister } from '@/components/registers/TransportHostel';
import { fadeUp } from '@/lib/motion';

type View = 'equipment' | 'buses' | 'hostel';

// Admin → Operations → Registers (Stage 5 · B15.5): equipment, school buses and the hostel.
export default function RegistersPage() {
  const [view, setView] = useState<View>('equipment');
  useEffect(() => { const t = setTimeout(() => { const v = new URLSearchParams(window.location.search).get('view'); if (v === 'buses' || v === 'hostel') setView(v); }, 0); return () => clearTimeout(t); }, []);
  const pick = (v: View) => {
    setView(v);
    const url = new URL(window.location.href);
    if (v === 'equipment') url.searchParams.delete('view'); else url.searchParams.set('view', v);
    window.history.replaceState(window.history.state, '', url);
  };
  return (
    <>
      <Topbar title="Registers" subtitle="Equipment with QR labels, school buses and the hostel" />
      <div className="p-4 md:p-8 max-w-4xl mx-auto w-full space-y-4">
        <Segmented<View> label="Register" value={view} onChange={pick} className="w-full sm:w-auto" segments={[{ value: 'equipment', label: 'Equipment' }, { value: 'buses', label: 'Buses' }, { value: 'hostel', label: 'Hostel' }]} />
        <motion.div key={view} variants={fadeUp} initial="hidden" animate="show">
          {view === 'equipment' ? <EquipmentRegister /> : view === 'buses' ? <BusRegister /> : <HostelRegister />}
        </motion.div>
      </div>
    </>
  );
}
