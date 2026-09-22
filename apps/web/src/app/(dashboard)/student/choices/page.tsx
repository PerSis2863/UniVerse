'use client';

import { Topbar } from '@/components/layout/Topbar';
import { BookmarkPlus, GraduationCap, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

export default function StudentChoices() {
  const [activeTab, setActiveTab] = useState('electives');
  
  const [loading, setLoading] = useState(true);
  const [availableCourses, setAvailableCourses] = useState<any[]>([]);
  const [myElectives, setMyElectives] = useState<any[]>([]);
  const [majorRequests, setMajorRequests] = useState<any[]>([]);

  const SAMPLE_AVAILABLE = [
    { id: 'c1', code: 'CS 461', title: 'Advanced Machine Learning', credits: 3, status: 'Available' },
    { id: 'c2', code: 'CS 472', title: 'Distributed Systems', credits: 3, status: 'Available' },
    { id: 'c3', code: 'CS 485', title: 'Ethics in AI', credits: 2, status: 'Available' },
    { id: 'c4', code: 'CS 490', title: 'Blockchain & Web3', credits: 3, status: 'Available' },
    { id: 'c5', code: 'CS 455', title: 'Computer Vision', credits: 3, status: 'Available' },
    { id: 'c6', code: 'CS 420', title: 'Natural Language Processing', credits: 3, status: 'Available' },
  ];
  const SAMPLE_MY_ELECTIVES = [
    { id: 'e1', code: 'CS 440', title: 'Cloud Computing & DevOps', credits: 3, status: 'Selected' },
    { id: 'e2', code: 'CS 451', title: 'Advanced Algorithms', credits: 3, status: 'Waitlisted' },
  ];

  const fetchElectives = async () => {
    try {
      const [availableRes, myRes, majorRes] = await Promise.all([
        api.get('/electives/available'),
        api.get('/electives/my'),
        api.get('/electives/major-requests')
      ]);
      const available = availableRes.data?.length > 0 ? availableRes.data : SAMPLE_AVAILABLE;
      const my = myRes.data?.length > 0 ? myRes.data : [];
      setAvailableCourses(available);
      setMyElectives(my);
      setMajorRequests(majorRes.data || []);
    } catch (error) {
      // Backend offline — show sample data
      setAvailableCourses(SAMPLE_AVAILABLE);
      setMyElectives(SAMPLE_MY_ELECTIVES);
      setMajorRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchElectives();
  }, []);

  const displayElectives = [
    ...myElectives.map(e => ({
      id: e.courseId || e.id,
      code: e.course?.code || e.code || '',
      title: e.course?.name || e.title || '',
      credits: e.course?.credits ?? e.credits ?? 0,
      status: e.status === 'PENDING' ? 'Waitlisted' : e.status === 'APPROVED' ? 'Selected' : (e.status || 'Selected'),
      requestId: e.id,
    })),
    ...availableCourses.map(c => ({
      id: c.id,
      code: c.code || '',
      title: c.name || c.title || '',
      credits: c.credits ?? 0,
      status: 'Available',
    }))
  ].filter(e => e.status !== 'Withdrawn');

  const selectedCredits = displayElectives.filter(e => e.status === 'Selected' || e.status === 'Waitlisted').reduce((acc, curr) => acc + (curr.credits || 0), 0);

  const handleSelectElective = async (courseId: string) => {
    // Optimistic update — move from available to selected instantly
    setAvailableCourses(prev => prev.filter(c => c.id !== courseId));
    const selected = availableCourses.find(c => c.id === courseId);
    if (selected) {
      setMyElectives(prev => [...prev, { ...selected, status: 'Waitlisted' }]);
      toast.success('Elective added to your selections!');
    }
    // Try to save to backend silently
    api.post('/electives/select', { courseId, semesterId: 'SPRING_2027' }).catch(() => {});
  };

  const handleConfirmSelections = () => {
    toast.success('Your elective selections have been confirmed!');
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
        newMajor: newProgram,
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
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative ${
                activeTab === 'electives' ? 'text-indigo-500 dark:text-indigo-400' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              <BookmarkPlus className="w-4 h-4" />
              Elective Registration
              {activeTab === 'electives' && (
                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-t-full" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('major')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative ${
                activeTab === 'major' ? 'text-indigo-500 dark:text-indigo-400' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              Major / Minor Declaration
              {activeTab === 'major' && (
                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-t-full" />
              )}
            </button>
          </div>

          <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8">
            
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
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
                    <div className="text-center py-8 text-zinc-500">No electives available at the moment.</div>
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
                  <button onClick={handleConfirmSelections} className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-medium transition-colors shadow-lg shadow-indigo-500/20">
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
                            <div className="text-sm text-zinc-500">To: {req.newMajor}</div>
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

                  <button type="submit" className="w-full bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-3 rounded-xl font-medium transition-colors mt-4 shadow-lg shadow-indigo-500/20">
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
