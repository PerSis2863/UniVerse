'use client';

import { Topbar } from '@/components/layout/Topbar';
import { Globe2, Users, HeartHandshake, TrendingUp, Download } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

export default function ImpactMetricsPage() {
  const handleExport = () => {
    toast.success('Report generation started', {
      description: 'Your impact report will be downloaded shortly.'
    });
  };

  const kpis = [
    { title: 'Global Reach', value: '24', suffix: ' Countries', icon: Globe2, change: '+2', color: 'indigo' },
    { title: 'Students Impacted', value: '12,450', icon: Users, change: '+14%', color: 'cyan' },
    { title: 'NGO Partners', value: '156', icon: HeartHandshake, change: '+12', color: 'pink' },
    { title: 'Total Impact Hours', value: '1.2M', icon: TrendingUp, change: '+8%', color: 'emerald' },
  ];

  return (
    <>
      <Topbar 
        title="Global Impact Analytics" 
        subtitle="Track our worldwide social and educational impact" 
        action={{ 
          label: 'Export Report', 
          onClick: handleExport 
        }} 
      />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {kpis.map((kpi, i) => (
            <motion.div 
              key={i}
              whileHover={{ y: -4 }}
              className="bg-zinc-900/50 border border-white/[0.04] p-5 rounded-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`p-2 rounded-lg bg-${kpi.color}-500/10 text-${kpi.color}-400`}>
                  <kpi.icon className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full">
                  {kpi.change}
                </span>
              </div>
              <div className="text-xs text-zinc-400 font-medium mb-1">{kpi.title}</div>
              <div className="text-3xl font-black text-white">
                {kpi.value} <span className="text-sm font-medium text-zinc-500">{kpi.suffix}</span>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-zinc-900/40 border border-white/[0.04] rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-6">Impact Growth (YTD)</h2>
            <div className="h-64 flex items-end justify-between gap-2">
              {[40, 55, 45, 70, 65, 85, 80, 95].map((val, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <motion.div 
                    initial={{ height: 0 }}
                    animate={{ height: `${val}%` }}
                    transition={{ duration: 1, delay: i * 0.1 }}
                    className="w-full bg-indigo-500/20 rounded-t-lg relative group"
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-indigo-500/0 to-indigo-400/50 rounded-t-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                  </motion.div>
                  <span className="text-xs text-zinc-500">M{i+1}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-zinc-900/40 border border-white/[0.04] rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Top Regions</h2>
            <div className="space-y-4">
              {[
                { region: 'Sub-Saharan Africa', percent: 45, color: 'indigo' },
                { region: 'Southeast Asia', percent: 30, color: 'cyan' },
                { region: 'Latin America', percent: 15, color: 'pink' },
                { region: 'Eastern Europe', percent: 10, color: 'amber' },
              ].map((r, i) => (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-zinc-300">{r.region}</span>
                    <span className="text-white font-bold">{r.percent}%</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${r.percent}%` }}
                      transition={{ duration: 1, delay: 0.5 + (i * 0.1) }}
                      className={`h-full bg-${r.color}-500`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
