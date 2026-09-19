'use client';
import { useState, useEffect } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { api } from '@/lib/api';
import { Award, BookOpen, GraduationCap } from 'lucide-react';

export default function StudentGrades() {
  const [grades, setGrades] = useState<any[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/grades/student')
      .then(res => {
        setGrades(res.data.grades);
        setSummary(res.data.summary);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Calculate cumulative stats
  let totalScore = 0;
  let totalMax = 0;
  
  summary.forEach(s => {
    totalScore += s._sum.score || 0;
    totalMax += s._sum.maxScore || 0;
  });

  const cumulativePercentage = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
  
  // Calculate a mock GPA (4.0 scale based on percentage)
  let gpa = 0.0;
  if (cumulativePercentage >= 90) gpa = 4.0;
  else if (cumulativePercentage >= 80) gpa = 3.0 + (cumulativePercentage - 80) / 10;
  else if (cumulativePercentage >= 70) gpa = 2.0 + (cumulativePercentage - 70) / 10;
  else if (cumulativePercentage >= 60) gpa = 1.0 + (cumulativePercentage - 60) / 10;
  
  const gpaStr = gpa.toFixed(2);

  return (
    <>
      <Topbar title="Grades & Transcript" subtitle="View your academic performance and GPA" />
      <div className="flex-1 p-8 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className="max-w-5xl mx-auto space-y-8">
            
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="card bg-indigo-500/10 border-indigo-500/20 text-center flex flex-col items-center justify-center">
                <div className="text-4xl font-bold text-indigo-400 mb-1">{gpaStr}</div>
                <div className="text-sm font-medium text-indigo-300 flex items-center gap-2"><GraduationCap className="w-4 h-4"/> Cumulative GPA</div>
              </div>
              <div className="card text-center flex flex-col items-center justify-center">
                <div className="text-3xl font-bold text-emerald-400 mb-1">{cumulativePercentage}%</div>
                <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Average Score</div>
              </div>
              <div className="card text-center flex flex-col items-center justify-center">
                <div className="text-3xl font-bold text-zinc-900 dark:text-white mb-1">{grades.length}</div>
                <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400 flex items-center gap-2"><Award className="w-4 h-4"/> Graded Assignments</div>
              </div>
            </div>

            {/* Grades List */}
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-4">Recent Grades</h2>
              {grades.length === 0 ? (
                <div className="card text-center py-12">
                   <BookOpen className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                   <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">No Grades Yet</h3>
                   <p className="text-zinc-600 dark:text-zinc-400">Your teachers haven't posted any grades for your courses.</p>
                </div>
              ) : (
                <div className="card p-0 overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/[0.05] bg-white/[0.02]">
                        <th className="p-4 text-xs font-semibold tracking-wider text-zinc-600 dark:text-zinc-400 uppercase">Assignment</th>
                        <th className="p-4 text-xs font-semibold tracking-wider text-zinc-600 dark:text-zinc-400 uppercase">Course</th>
                        <th className="p-4 text-xs font-semibold tracking-wider text-zinc-600 dark:text-zinc-400 uppercase">Date Posted</th>
                        <th className="p-4 text-xs font-semibold tracking-wider text-zinc-600 dark:text-zinc-400 uppercase text-right">Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05]">
                      {grades.map((grade) => {
                        const percentage = Math.round((grade.score / grade.maxScore) * 100);
                        let colorClass = 'text-emerald-400';
                        if (percentage < 70) colorClass = 'text-red-400';
                        else if (percentage < 85) colorClass = 'text-amber-400';

                        return (
                          <tr key={grade.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="p-4 text-zinc-900 dark:text-white text-sm font-medium">
                              {grade.assignmentName}
                            </td>
                            <td className="p-4 text-zinc-300 text-sm">
                              {grade.course?.name || grade.courseId}
                            </td>
                            <td className="p-4 text-zinc-600 dark:text-zinc-400 text-sm">
                              {new Date(grade.createdAt).toLocaleDateString()}
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-3">
                                <span className="text-zinc-600 dark:text-zinc-400 text-xs">{grade.score} / {grade.maxScore}</span>
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 ${colorClass}`}>
                                  {percentage}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
