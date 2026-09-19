'use client';
import { Topbar } from '@/components/layout/Topbar';
import { Search, Filter, Download, MoreVertical, GraduationCap, TrendingUp, TrendingDown, Target, User } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const COURSES = [
  { id: '1', code: 'CS101', name: 'Introduction to Computer Science' },
  { id: '2', code: 'CS201', name: 'Data Structures and Algorithms' },
  { id: '3', code: 'BUS101', name: 'Introduction to Business' },
  { id: '4', code: 'FIN201', name: 'Corporate Finance' },
  { id: '5', code: 'MKT301', name: 'Digital Marketing Strategy' }
];

const MOCK_GRADES = [
  { id: '1', studentName: 'Alice Johnson', email: 'alice.j@universe.edu', assignments: '95', midterm: '92', final: '96', total: '94.3', status: 'Excellent', trend: 'up' },
  { id: '2', studentName: 'Bob Smith', email: 'bob.s@universe.edu', assignments: '85', midterm: '78', final: '88', total: '83.6', status: 'Good', trend: 'up' },
  { id: '3', studentName: 'Charlie Brown', email: 'charlie.b@universe.edu', assignments: '92', midterm: '90', final: '89', total: '90.3', status: 'Excellent', trend: 'down' },
  { id: '4', studentName: 'Diana Prince', email: 'diana.p@universe.edu', assignments: '98', midterm: '100', final: '96', total: '98.0', status: 'Outstanding', trend: 'up' },
  { id: '5', studentName: 'Evan Davis', email: 'evan.d@universe.edu', assignments: '75', midterm: '70', final: '82', total: '75.6', status: 'Average', trend: 'up' },
  { id: '6', studentName: 'Fiona Gallagher', email: 'fiona.g@universe.edu', assignments: '88', midterm: '85', final: '89', total: '87.3', status: 'Good', trend: 'down' },
  { id: '7', studentName: 'George Miller', email: 'george.m@universe.edu', assignments: '82', midterm: '79', final: '85', total: '82.0', status: 'Good', trend: 'up' },
  { id: '8', studentName: 'Hannah Abbott', email: 'hannah.a@universe.edu', assignments: '100', midterm: '95', final: '98', total: '97.6', status: 'Outstanding', trend: 'down' },
  { id: '9', studentName: 'Ian Wright', email: 'ian.w@universe.edu', assignments: '70', midterm: '65', final: '75', total: '70.0', status: 'Average', trend: 'up' },
  { id: '10', studentName: 'Julia Roberts', email: 'julia.r@universe.edu', assignments: '89', midterm: '92', final: '88', total: '89.6', status: 'Good', trend: 'down' },
];

export default function TeacherGradesPage() {
  const [selectedCourse, setSelectedCourse] = useState(COURSES[0].id);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredGrades = MOCK_GRADES.filter(g => 
    g.studentName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    g.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Outstanding': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'Excellent': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'Good': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'Average': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
      default: return 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20';
    }
  };

  return (
    <>
      <Topbar title="Grade Book" subtitle="Monitor and manage student academic performance" />
      <div className="flex-1 p-8 overflow-y-auto space-y-6">
        
        {/* Course Selector & Controls */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
          <div className="flex gap-4 items-center">
            <select 
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500 font-medium"
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
            >
              {COURSES.map(c => (
                <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
              ))}
            </select>
          </div>
          
          <div className="flex gap-3 w-full md:w-auto">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 dark:text-zinc-400" />
              <input 
                type="text" 
                placeholder="Search students..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:text-zinc-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button onClick={() => toast.success('Grades exported to CSV')} className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl hover:bg-indigo-500/20 transition-colors whitespace-nowrap">
              <Download className="w-4 h-4" /> Export
            </button>
          </div>
        </div>

        {/* Grades Table */}
        <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80">
                  <th className="p-4 text-xs font-bold text-zinc-500 dark:text-zinc-500 uppercase tracking-wider">Student</th>
                  <th className="p-4 text-xs font-bold text-zinc-500 dark:text-zinc-500 uppercase tracking-wider text-center">Assignments</th>
                  <th className="p-4 text-xs font-bold text-zinc-500 dark:text-zinc-500 uppercase tracking-wider text-center">Midterm</th>
                  <th className="p-4 text-xs font-bold text-zinc-500 dark:text-zinc-500 uppercase tracking-wider text-center">Final</th>
                  <th className="p-4 text-xs font-bold text-zinc-500 dark:text-zinc-500 uppercase tracking-wider text-center">Total Grade</th>
                  <th className="p-4 text-xs font-bold text-zinc-500 dark:text-zinc-500 uppercase tracking-wider">Status</th>
                  <th className="p-4 text-xs font-bold text-zinc-500 dark:text-zinc-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {filteredGrades.map((grade) => (
                  <tr key={grade.id} className="hover:bg-zinc-100 dark:bg-zinc-800/30 transition-colors group">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-zinc-900 dark:text-white text-sm font-medium shadow-sm">
                          {grade.studentName.charAt(0)}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-zinc-900 dark:text-white">{grade.studentName}</div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-500">{grade.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-center font-medium text-zinc-300">{grade.assignments}</td>
                    <td className="p-4 text-center font-medium text-zinc-300">{grade.midterm}</td>
                    <td className="p-4 text-center font-medium text-zinc-300">{grade.final}</td>
                    <td className="p-4 text-center">
                      <div className="flex flex-col items-center justify-center gap-1">
                        <span className="font-bold text-zinc-900 dark:text-white text-lg">{grade.total}%</span>
                        {grade.trend === 'up' ? (
                          <span className="flex items-center text-xs text-emerald-400"><TrendingUp className="w-3 h-3 mr-1" /> +2.1%</span>
                        ) : (
                          <span className="flex items-center text-xs text-red-400"><TrendingDown className="w-3 h-3 mr-1" /> -1.4%</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${getStatusColor(grade.status)}`}>
                        {grade.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button onClick={() => toast.success(`Viewing full details for ${grade.studentName}`)} className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:text-white rounded-lg hover:bg-zinc-100 dark:bg-zinc-800 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100">
                        <Target className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredGrades.length === 0 && (
            <div className="p-12 text-center text-zinc-500 dark:text-zinc-500">
              No students found matching your search.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
