'use client';

import { Topbar } from '@/components/layout/Topbar';
import { BookmarkPlus, GraduationCap, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

export default function StudentChoices() {
  const [activeTab, setActiveTab] = useState('electives');

  return (
    <>
      <Topbar title="My Choices" subtitle="Manage your academic path and electives" />
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-8">
          
          <div className="flex space-x-1 border-b border-zinc-800">
            <button
              onClick={() => setActiveTab('electives')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative ${
                activeTab === 'electives' ? 'text-indigo-400' : 'text-zinc-400 hover:text-white'
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
                activeTab === 'major' ? 'text-indigo-400' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              Major / Minor Declaration
              {activeTab === 'major' && (
                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-t-full" />
              )}
            </button>
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8">
            
            {activeTab === 'electives' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Spring 2027 Electives</h3>
                    <p className="text-sm text-zinc-400">Registration closes in 14 days.</p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-white">Credits Selected: <span className="text-indigo-400">6 / 12</span></div>
                  </div>
                </div>

                <div className="space-y-4">
                  {[
                    { code: 'ART 205', title: 'Introduction to Digital Photography', credits: 3, status: 'Selected' },
                    { code: 'ENG 310', title: 'Modern Science Fiction Literature', credits: 3, status: 'Selected' },
                    { code: 'MKT 250', title: 'Consumer Behavior', credits: 3, status: 'Available' },
                    { code: 'PSY 101', title: 'General Psychology', credits: 3, status: 'Waitlisted' },
                  ].map((course, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-zinc-800/30 border border-zinc-700/50 rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-zinc-800 flex items-center justify-center text-sm font-bold text-zinc-300">
                          {course.code.split(' ')[0]}
                        </div>
                        <div>
                          <h4 className="font-medium text-white">{course.title}</h4>
                          <div className="text-sm text-zinc-500">{course.code} • {course.credits} Credits</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        {course.status === 'Selected' ? (
                          <div className="flex items-center gap-1.5 text-green-400 text-sm font-medium px-3 py-1 bg-green-500/10 rounded-full">
                            <CheckCircle2 className="w-4 h-4" /> Selected
                          </div>
                        ) : course.status === 'Waitlisted' ? (
                          <div className="text-amber-400 text-sm font-medium px-3 py-1 bg-amber-500/10 rounded-full">
                            Waitlisted (Pos: 3)
                          </div>
                        ) : (
                          <button className="text-indigo-400 hover:bg-indigo-500/10 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors">
                            Select
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="pt-6 border-t border-zinc-800 flex justify-end">
                  <button className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium transition-colors">
                    Confirm Selections <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'major' && (
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-xl p-6 mb-8">
                  <h3 className="text-lg font-semibold text-white mb-2">Current Declaration</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-zinc-500 mb-1">Primary Major</div>
                      <div className="font-medium text-indigo-400">B.S. Computer Science</div>
                    </div>
                    <div>
                      <div className="text-sm text-zinc-500 mb-1">Minor</div>
                      <div className="font-medium text-zinc-300">Mathematics</div>
                    </div>
                  </div>
                </div>

                <h3 className="text-lg font-semibold text-white mb-4">Request a Change</h3>
                <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-400">Request Type</label>
                    <select className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-colors appearance-none">
                      <option>Change Primary Major</option>
                      <option>Add a Second Major</option>
                      <option>Add a Minor</option>
                      <option>Drop a Minor</option>
                    </select>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-400">New Program Selection</label>
                    <select className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-colors appearance-none">
                      <option>Select a program...</option>
                      <option>B.A. Graphic Design</option>
                      <option>B.S. Software Engineering</option>
                      <option>Minor in Business Administration</option>
                    </select>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-400">Reason for change (Optional)</label>
                    <textarea rows={3} className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"></textarea>
                  </div>

                  <button className="w-full bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium transition-colors mt-2">
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
