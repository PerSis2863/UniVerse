'use client';
import { Topbar } from '@/components/layout/Topbar';
import { Plus, Edit2, Calendar, Clock, MapPin, Users, Filter, CheckCircle2, X, Trash2, BookOpen } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const MOCK_ADMIN_SCHEDULE = [
  { id: '1', course: 'Computer Science 101', code: 'CS101', instructor: 'Dr. Alan Turing', day: 'Monday', time: '09:00', duration: '120', location: 'Room 302', type: 'Lecture', status: 'Active', term: 'Fall 2026', startDate: '2026-09-01', endDate: '2026-12-15' },
  { id: '2', course: 'Advanced Calculus', code: 'MATH201', instructor: 'Dr. Katherine Johnson', day: 'Monday', time: '13:30', duration: '90', location: 'Room 105', type: 'Lecture', status: 'Active', term: 'Fall 2026', startDate: '2026-09-01', endDate: '2026-12-15' },
  { id: '3', course: 'Physics Lab', code: 'PHY102', instructor: 'Dr. Marie Curie', day: 'Tuesday', time: '10:00', duration: '120', location: 'Lab 4B', type: 'Lab', status: 'Active', term: 'Fall 2026', startDate: '2026-09-01', endDate: '2026-12-15' },
  { id: '4', course: 'Artificial Intelligence', code: 'AI402', instructor: 'Dr. Geoffrey Hinton', day: 'Tuesday', time: '15:00', duration: '120', location: 'Auditorium B', type: 'Lecture', status: 'Active', term: 'Fall 2026', startDate: '2026-09-01', endDate: '2026-12-15' },
  { id: '5', course: 'World History', code: 'HIST101', instructor: 'Prof. Mary Beard', day: 'Wednesday', time: '14:00', duration: '90', location: 'Auditorium A', type: 'Lecture', status: 'Draft', term: 'Spring 2027', startDate: '2027-01-10', endDate: '2027-05-20' },
  { id: '6', course: 'Data Structures', code: 'CS201', instructor: 'Dr. Donald Knuth', day: 'Thursday', time: '16:00', duration: '120', location: 'Room 401', type: 'Lecture', status: 'Active', term: 'Fall 2026', startDate: '2026-09-01', endDate: '2026-12-15' },
  { id: '7', course: 'Tech Festival', code: 'EVENT', instructor: 'Student Council', day: 'Wednesday', time: '08:00', duration: '720', location: 'Campus Wide', type: 'Event', status: 'Review', term: 'Fall 2026', startDate: '2026-10-15', endDate: '2026-10-15' },
];

export default function AdminTimetablePage() {
  const [schedule, setSchedule] = useState(MOCK_ADMIN_SCHEDULE);
  const [filter, setFilter] = useState('All');
  const [termFilter, setTermFilter] = useState('Fall 2026');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    course: '', code: '', instructor: '', day: 'Monday', time: '09:00', duration: '120', location: '', type: 'Lecture', status: 'Active', term: 'Fall 2026', startDate: '', endDate: ''
  });

  const filteredSchedule = schedule
    .filter(s => filter === 'All' || s.status === filter)
    .filter(s => s.term === termFilter);

  const handleOpenModal = (id: string | null = null) => {
    if (id) {
      const item = schedule.find(s => s.id === id);
      if (item) setFormData({ ...item });
      setEditingId(id);
    } else {
      setFormData({ course: '', code: '', instructor: '', day: 'Monday', time: '09:00', duration: '120', location: '', type: 'Lecture', status: 'Active', term: termFilter, startDate: '', endDate: '' });
      setEditingId(null);
    }
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      setSchedule(prev => prev.map(s => s.id === editingId ? { ...formData, id: editingId } : s));
      toast.success('Schedule updated successfully');
    } else {
      setSchedule(prev => [...prev, { ...formData, id: Math.random().toString() }]);
      toast.success('New schedule added');
    }
    setIsModalOpen(false);
  };
  
  const handleDelete = (id: string) => {
    setSchedule(prev => prev.filter(s => s.id !== id));
    toast.success('Schedule removed');
  };

  return (
    <>
      <Topbar 
        title="Timetable Management" 
        subtitle="Add, edit and manage master university schedules"
        rightNode={
          <button 
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-zinc-900 dark:text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Class / Event
          </button>
        }
      />
      
      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center p-6 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">{editingId ? 'Edit Class/Event' : 'Add New Class/Event'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white p-2 rounded-lg hover:bg-zinc-100 dark:bg-zinc-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-6">
              
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-indigo-400 uppercase tracking-wider">Basic Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Course / Event Name</label>
                    <input required value={formData.course} onChange={e => setFormData({...formData, course: e.target.value})} type="text" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors" placeholder="e.g. Computer Science 101" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Code</label>
                    <input required value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} type="text" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors" placeholder="e.g. CS101" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Instructor / Organizer</label>
                    <input required value={formData.instructor} onChange={e => setFormData({...formData, instructor: e.target.value})} type="text" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors" placeholder="e.g. Dr. Alan Turing" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Location</label>
                    <input required value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} type="text" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors" placeholder="e.g. Room 302" />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-indigo-400 uppercase tracking-wider">Scheduling</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Semester / Term</label>
                    <select value={formData.term} onChange={e => setFormData({...formData, term: e.target.value})} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors">
                      <option value="Fall 2026">Fall 2026</option>
                      <option value="Spring 2027">Spring 2027</option>
                      <option value="Summer 2027">Summer 2027</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Start Date</label>
                    <input required value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} type="date" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors [color-scheme:dark]" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">End Date</label>
                    <input required value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} type="date" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors [color-scheme:dark]" />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Day of Week</label>
                    <select value={formData.day} onChange={e => setFormData({...formData, day: e.target.value})} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors">
                      {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Time</label>
                    <input required value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} type="time" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors [color-scheme:dark]" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Duration (mins)</label>
                    <input required value={formData.duration} onChange={e => setFormData({...formData, duration: e.target.value})} type="number" min="30" step="30" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors" />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-indigo-400 uppercase tracking-wider">Classification</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Type</label>
                    <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors">
                      <option value="Lecture">Lecture</option>
                      <option value="Lab">Lab</option>
                      <option value="Workshop">Workshop</option>
                      <option value="Event">Event</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Status</label>
                    <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 text-zinc-900 dark:text-white outline-none focus:border-indigo-500 transition-colors">
                      <option value="Active">Active</option>
                      <option value="Draft">Draft</option>
                      <option value="Review">Review</option>
                    </select>
                  </div>
                </div>
              </div>
              
              <div className="pt-4 flex justify-end gap-3 border-t border-zinc-200 dark:border-zinc-800 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-900 dark:text-white bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-zinc-900 dark:text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg transition-colors shadow-lg shadow-indigo-500/20">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex-1 p-8 overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
        <div className="max-w-7xl mx-auto space-y-6">
          
          {/* Controls */}
          <div className="flex flex-col sm:flex-row justify-between gap-4 bg-white dark:bg-zinc-900/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <div className="flex flex-col sm:flex-row gap-4 flex-1">
              {/* Term Selector */}
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-zinc-500 dark:text-zinc-500" />
                <select 
                  value={termFilter}
                  onChange={(e) => setTermFilter(e.target.value)}
                  className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-indigo-500 transition-colors"
                >
                  <option value="Fall 2026">Fall 2026 Semester</option>
                  <option value="Spring 2027">Spring 2027 Semester</option>
                  <option value="Summer 2027">Summer 2027 Term</option>
                </select>
              </div>

              {/* Status Filter */}
              <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 sm:border-l sm:border-zinc-200 dark:border-zinc-800 sm:pl-4">
                {['All', 'Active', 'Draft', 'Review'].map(status => (
                  <button 
                    key={status}
                    onClick={() => setFilter(status)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      filter === status 
                        ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white' 
                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:bg-zinc-800/50 hover:text-zinc-200'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
            
          </div>

          {/* Timetable List */}
          <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80">
                    <th className="p-4 text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">Class/Event Info</th>
                    <th className="p-4 text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">Instructor/Organizer</th>
                    <th className="p-4 text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">Date & Time</th>
                    <th className="p-4 text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">Location</th>
                    <th className="p-4 text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">Status</th>
                    <th className="p-4 text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {filteredSchedule.map((item) => (
                    <tr key={item.id} className="hover:bg-zinc-100 dark:bg-zinc-800/20 transition-colors">
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-zinc-900 dark:text-white">{item.course}</span>
                          <span className="text-sm text-indigo-400 font-medium">{item.code} • {item.type}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-zinc-300">
                          <Users className="w-4 h-4 text-zinc-500 dark:text-zinc-500" />
                          <span>{item.instructor}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 text-zinc-300 text-sm">
                            <Calendar className="w-4 h-4 text-zinc-500 dark:text-zinc-500" />
                            <span>
                              {item.startDate === item.endDate 
                                ? item.startDate 
                                : `${item.startDate} to ${item.endDate}`
                              }
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 text-sm">
                            <Clock className="w-4 h-4 text-zinc-500 dark:text-zinc-500" />
                            <span>{item.day}s, {item.time} ({parseInt(item.duration) / 60}h)</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-zinc-300">
                          <MapPin className="w-4 h-4 text-zinc-500 dark:text-zinc-500" />
                          <span>{item.location}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                          item.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                          item.status === 'Draft' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                          'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                        }`}>
                          {item.status === 'Active' && <CheckCircle2 className="w-3 h-3" />}
                          {item.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => handleOpenModal(item.id)}
                            className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors inline-flex items-center justify-center"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDelete(item.id)}
                            className="p-2 text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors inline-flex items-center justify-center"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredSchedule.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-zinc-500 dark:text-zinc-500">
                        No scheduled classes found matching this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          
        </div>
      </div>
    </>
  );
}
