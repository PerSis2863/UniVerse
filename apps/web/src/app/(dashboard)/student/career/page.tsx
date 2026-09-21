'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Briefcase, Calendar, MapPin, Building, ChevronRight, Loader2 } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import Image from 'next/image';

export default function CareerPage() {
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [opps, evts] = await Promise.all([
          api.get('/career/opportunities'),
          api.get('/career/events')
        ]);
        setOpportunities(opps.data);
        setEvents(evts.data);
      } catch (error) {
        console.error('Failed to fetch career data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <>
      <Topbar title="Career Hub" subtitle="Explore internships, jobs, and career events tailored to your major." />
      
      <div className="flex-1 p-8 overflow-y-auto">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : (
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-indigo-400" /> Recommended Opportunities
              </h2>

              <div className="grid gap-4">
                {opportunities.map((job) => (
                  <div key={job.id} className="card p-0 overflow-hidden transition-all hover:border-indigo-500/50 group">
                    <div className="p-6">
                      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start">
                        <div className="flex gap-4">
                          <div className="w-12 h-12 relative rounded-xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                            <Image src={job.logo} alt={job.company} fill className="object-contain" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-lg text-zinc-900 dark:text-white group-hover:text-indigo-400 transition-colors">
                              {job.title}
                            </h3>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                              <span className="flex items-center gap-1">
                                <Building className="w-4 h-4" /> {job.company}
                              </span>
                              <span className="flex items-center gap-1">
                                <MapPin className="w-4 h-4" /> {job.location}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col sm:items-end gap-2 mt-4 sm:mt-0">
                          <span className="inline-block px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-200 dark:bg-white/10 text-zinc-900 dark:text-white">
                            {job.type}
                          </span>
                          <span className="text-xs text-zinc-500 dark:text-zinc-500">
                            Apply by: {new Date(job.deadline).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="px-6 py-3 bg-white/[0.02] border-t border-white/[0.05] flex justify-end gap-3">
                      <button className="text-sm font-medium text-zinc-300 hover:text-zinc-900 dark:text-white transition-colors">Save</button>
                      <button className="px-4 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-zinc-900 dark:text-white rounded-lg text-sm font-medium transition-colors">Apply Now</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <div className="card">
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-indigo-400" /> Upcoming Events
                  </h2>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">Don't miss these career events.</p>
                </div>
                <div className="space-y-4">
                  {events.map((event) => (
                    <div key={event.id} className="flex gap-4 border-b border-white/[0.05] last:border-0 pb-4 last:pb-0">
                      <div className="bg-indigo-500/10 text-indigo-400 rounded-lg p-2 text-center min-w-[50px] shrink-0 h-fit border border-indigo-500/20">
                        <div className="text-xs uppercase font-bold">
                          {new Date(event.date).toLocaleDateString('en-US', { month: 'short' })}
                        </div>
                        <div className="text-lg font-bold">
                          {new Date(event.date).getDate()}
                        </div>
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm text-zinc-900 dark:text-white line-clamp-2">{event.title}</h4>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" /> {event.location}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="w-full mt-4 py-2 border border-zinc-200 dark:border-white/10 rounded-lg text-sm font-medium text-zinc-900 dark:text-white hover:bg-zinc-100 dark:bg-white/5 transition-colors flex items-center justify-center group">
                  View All Events <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
