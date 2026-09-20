'use client';

import { Topbar } from '@/components/layout/Topbar';
import { BookmarkPlus, GraduationCap, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export default function StudentChoices() {
  const [activeTab, setActiveTab] = useState('electives');
  
  const [electives, setElectives] = useState([
    { code: 'ART 205', title: 'Introduction to Digital Photography', credits: 3, status: 'Selected' },
    { code: 'ENG 310', title: 'Modern Science Fiction Literature', credits: 3, status: 'Selected' },
    { code: 'MKT 250', title: 'Consumer Behavior', credits: 3, status: 'Available' },
    { code: 'PSY 101', title: 'General Psychology', credits: 3, status: 'Waitlisted' },
  ]);

  const selectedCredits = electives.filter(e => e.status === 'Selected').reduce((acc, curr) => acc + curr.credits, 0);

  const handleSelectElective = (index: number) => {
    setElectives(prev => prev.map((e, i) => i === index ? { ...e, status: 'Selected' } : e));
    toast.success(`${electives[index].code} added to your selections.`);
  };

  const handleConfirmSelections = () => {
    toast.success('Your elective selections have been confirmed!');
  };

  const handleSubmitRequest = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const reason = formData.get('reason');
    if (!reason || (reason as string).trim() === '') {
      toast.error('Please provide a reason for the change.');
      return;
    }
    toast.success('Request submitted for advisor approval!');
    e.currentTarget.reset();
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
            
            {activeTab === 'electives' && (
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
                  {electives.map((course, i) => (
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
                            Waitlisted (Pos: 3)
                          </div>
                        ) : (
                          <button onClick={() => handleSelectElective(i)} className="text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors">
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
            )}

            {activeTab === 'major' && (
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

                <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">Request a Change</h3>
                <form className="space-y-4" onSubmit={handleSubmitRequest}>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-400">Request Type</label>
                    <select className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors appearance-none">
                      <option>Change Primary Major</option>
                      <option>Add a Second Major</option>
                      <option>Add a Minor</option>
                      <option>Drop a Minor</option>
                    </select>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-400">New Program Selection</label>
                    <select required className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-colors appearance-none">
                      <option value="">Select a program...</option>
                      <option value="bs_business_admin">B.S. Business Administration</option>
                      <option value="bs_finance">B.S. Finance</option>
                      <option value="bs_accounting">B.S. Accounting</option>
                      <option value="bs_marketing">B.S. Marketing</option>
                      <option value="bs_supply_chain">B.S. Supply Chain Management</option>
                      <option value="ba_economics">B.A. Economics</option>
                      <option value="bs_entrepreneurship">B.S. Entrepreneurship</option>
                      <option value="bs_international_business">B.S. International Business</option>
                      <option value="bs_mis">B.S. Management Information Systems</option>
                      <option value="bs_hrm">B.S. Human Resource Management</option>
                      <option value="minor_business_analytics">Minor in Business Analytics</option>
                      <option value="ba_graphic_design">B.A. Graphic Design</option>
                      <option value="bs_software_engineering">B.S. Software Engineering</option>
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
