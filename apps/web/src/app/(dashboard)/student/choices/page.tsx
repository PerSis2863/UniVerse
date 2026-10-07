'use client';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';

import { Topbar } from '@/components/layout/Topbar';
import { BookmarkPlus, GraduationCap, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { TabPill } from '@/components/ui/Glide';

interface ElectiveCourse { id: string; code?: string; name?: string; credits?: number | null }
interface MyElective { id: string; courseId: string; status: string; course?: ElectiveCourse | null }
interface MajorRequest { id: string; requestType: string; requestedProgram: string; status: string; createdAt: string }

export default function StudentChoices() {
  const [activeTab, setActiveTab] = useState('electives');

  const onError = () => toast.error('Couldn’t load electives right now. Please try again shortly.');
  const available = useSWR<ElectiveCourse[]>('/electives/available', fetcher, { onError });
  const mine = useSWR<MyElective[]>('/electives/my', fetcher, { onError });
  const majors = useSWR<MajorRequest[]>('/electives/major-requests', fetcher, { onError });
  const loading = available.isLoading || mine.isLoading || majors.isLoading;
  const availableCourses = Array.isArray(available.data) ? available.data : [];
  const myElectives = Array.isArray(mine.data) ? mine.data : [];
  const majorRequests = majors.data ?? [];

  // Current academic term, e.g. "2026_FALL" (Jan–Jun = spring, Jul–Dec = fall).
  const now = new Date();
  const currentTerm = `${now.getFullYear()}_${now.getMonth() < 6 ? 'SPRING' : 'FALL'}`;

  const fetchElectives = () => Promise.all([available.mutate(), mine.mutate(), majors.mutate()]);

  const displayElectives = [
    ...myElectives.map(e => ({
      id: e.courseId || e.id,
      code: e.course?.code || '',
      title: e.course?.name || '',
      credits: e.course?.credits ?? 0,
      status: e.status === 'PENDING' ? 'Waitlisted' : e.status === 'APPROVED' ? 'Selected' : (e.status || 'Selected'),
      requestId: e.id,
    })),
    ...availableCourses.map(c => ({
      id: c.id,
      code: c.code || '',
      title: c.name || '',
      credits: c.credits ?? 0,
      status: 'Available',
    }))
  ].filter(e => e.status !== 'Withdrawn');

  const selectedCredits = displayElectives.filter(e => e.status === 'Selected' || e.status === 'Waitlisted').reduce((acc, curr) => acc + (curr.credits || 0), 0);

  const handleSelectElective = async (courseId: string) => {
    try {
      await api.post('/electives/select', { courseId, semesterId: currentTerm });
      toast.success('Elective requested — your department will confirm it.');
      fetchElectives();
    } catch {
      toast.error('Could not request this elective. Please try again.');
    }
  };

  const handleConfirmSelections = () => {
    fetchElectives();
    toast.success('Your selections are saved.');
  };

  const handleSubmitRequest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const reason = formData.get('reason');
    const requestType = formData.get('requestType');
    const newProgram = formData.get('newProgram');

    if (!reason || (reason as string).trim() === '') {
      toast.error('Please provide a reason for the change.');
      return;
    }

    try {
      await api.post('/electives/major-requests', {
        requestType,
        requestedProgram: newProgram,
        reason,
        currentMajor: 'B.S. Computer Science'
      });
      toast.success('Request submitted for advisor approval!');
      e.currentTarget.reset();
      await fetchElectives();
    } catch (error) {
      toast.error('Failed to submit request.');
    }
  };

  return (
    <>
      <Topbar title="My Choices" subtitle="Manage your academic path and electives" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-8">
          
          <div className="flex space-x-1 border-b border-zinc-200 dark:border-zinc-800">
            <button
              onClick={() => setActiveTab('electives')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative isolate ${
                activeTab === 'electives' ? 'text-indigo-500 dark:text-indigo-400' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              <BookmarkPlus className="w-4 h-4" />
              Elective Registration
              {activeTab === 'electives' && <TabPill id="choices-tab" variant="line" />}
            </button>
            <button
              onClick={() => setActiveTab('major')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative isolate ${
                activeTab === 'major' ? 'text-indigo-500 dark:text-indigo-400' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              Major / Minor Declaration
              {activeTab === 'major' && <TabPill id="choices-tab" variant="line" />}
            </button>
          </div>

          <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8">
            
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <ContentSkeleton variant="grid" />
              </div>
            ) : activeTab === 'electives' ? (
              <div className="space-y-6">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Spring 2027 Electives</h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">Registration closes in 14 days.</p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-zinc-900 dark:text-white">Credits Selected: <span className="text-indigo-600 dark:text-indigo-400">{selectedCredits} / 12</span></div>
                  </div>
                </div>

                <div className="space-y-4">
                  {displayElectives.length === 0 && (
                    <div className="text-center py-8 text-zinc-500">No electives are open for selection right now. Your department will publish them here each term.</div>
                  )}
                  {displayElectives.map((course, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/30 border border-zinc-200 dark:border-zinc-700/50 rounded-lg transition-colors hover:border-zinc-300 dark:hover:border-zinc-600">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-600 dark:text-zinc-300">
                          {course.code.split(' ')[0]}
                        </div>
                        <div>
                          <h4 className="font-medium text-zinc-900 dark:text-white">{course.title}</h4>
                          <div className="text-sm text-zinc-500">{course.code} • {course.credits} Credits</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        {course.status === 'Selected' ? (
                          <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400 text-sm font-medium px-3 py-1 bg-green-500/10 rounded-full">
                            <CheckCircle2 className="w-4 h-4" /> Selected
                          </div>
                        ) : course.status === 'Waitlisted' ? (
                          <div className="text-amber-600 dark:text-amber-400 text-sm font-medium px-3 py-1 bg-amber-500/10 rounded-full">
                            Waitlisted (Pending)
                          </div>
                        ) : (
                          <button onClick={() => handleSelectElective(course.id)} className="text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors">
                            Select
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
                  <button onClick={handleConfirmSelections} className="btn-primary">
                    Confirm Selections <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-indigo-500/5 to-purple-500/5 border border-indigo-500/20 rounded-xl p-6 mb-8">
                  <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">Current Declaration</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-zinc-500 mb-1">Primary Major</div>
                      <div className="font-medium text-indigo-600 dark:text-indigo-400">B.S. Computer Science</div>
                    </div>
                    <div>
                      <div className="text-sm text-zinc-500 mb-1">Minor</div>
                      <div className="font-medium text-zinc-900 dark:text-zinc-300">Mathematics</div>
                    </div>
                  </div>
                </div>

                {majorRequests.length > 0 && (
                  <div className="mb-8">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Pending Requests</h3>
                    <div className="space-y-3">
                      {majorRequests.map((req, idx) => (
                        <div key={idx} className="flex justify-between items-center p-4 bg-zinc-50 dark:bg-zinc-800/30 border border-zinc-200 dark:border-zinc-700/50 rounded-lg">
                          <div>
                            <div className="font-medium text-zinc-900 dark:text-white">{req.requestType}</div>
                            <div className="text-sm text-zinc-500">To: {req.requestedProgram}</div>
                          </div>
                          <div className="text-amber-600 dark:text-amber-400 text-sm font-medium px-3 py-1 bg-amber-500/10 rounded-full">
                            Pending Review
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Request a Change</h3>
                <form className="space-y-4" onSubmit={handleSubmitRequest}>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-400">Request Type</label>
                    <select name="requestType" className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors appearance-none">
                      <option value="Change Primary Major">Change Primary Major</option>
                      <option value="Add a Second Major">Add a Second Major</option>
                      <option value="Add a Minor">Add a Minor</option>
                      <option value="Drop a Minor">Drop a Minor</option>
                    </select>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-400">New Program Selection</label>
                    <select name="newProgram" required className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors appearance-none">
                      <option value="">Select a program...</option>
                      <option value="B.S. Business Administration">B.S. Business Administration</option>
                      <option value="B.S. Finance">B.S. Finance</option>
                      <option value="B.S. Accounting">B.S. Accounting</option>
                      <option value="B.S. Marketing">B.S. Marketing</option>
                      <option value="B.S. Supply Chain Management">B.S. Supply Chain Management</option>
                      <option value="B.A. Economics">B.A. Economics</option>
                      <option value="B.S. Entrepreneurship">B.S. Entrepreneurship</option>
                      <option value="B.S. International Business">B.S. International Business</option>
                      <option value="B.S. Management Information Systems">B.S. Management Information Systems</option>
                      <option value="B.S. Human Resource Management">B.S. Human Resource Management</option>
                      <option value="Minor in Business Analytics">Minor in Business Analytics</option>
                      <option value="B.A. Graphic Design">B.A. Graphic Design</option>
                      <option value="B.S. Software Engineering">B.S. Software Engineering</option>
                    </select>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-400">Reason for change</label>
                    <textarea name="reason" required rows={3} placeholder="Please provide your reason for requesting this change..." className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors"></textarea>
                  </div>

                  <button type="submit" className="btn-primary btn-lg w-full mt-4">
                    Submit Request for Advisor Approval
                  </button>
                  <p className="text-xs text-zinc-500 text-center mt-2">Note: All changes are subject to review by your academic advisor.</p>
                </form>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}
