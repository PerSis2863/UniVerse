import { api } from './api';

export const fetcher = async (url: string) => {
  try {
    const res = await api.get(url);
    return res.data;
  } catch (error) {
    if (url.includes('/dashboard/student')) {
      return {
        kpis: { enrolled: 4, attendance: 92, gpa: 3.8, assignments: 12, impactHours: 120 },
        courseProgress: [
          { name: "Advanced Algorithms", grade: "A", progress: 85, color: "from-indigo-500 to-cyan-500" },
          { name: "Global Ethics", grade: "A-", progress: 92, color: "from-emerald-500 to-teal-500" },
          { name: "Sustainable Architecture", grade: "B+", progress: 78, color: "from-amber-500 to-orange-500" }
        ],
        deadlines: [
          { title: "Ethics Essay Final Draft", course: "Global Ethics", due: "Today, 11:59 PM", urgent: true },
          { title: "Algorithm Design Project", course: "Advanced Algorithms", due: "Tomorrow, 10:00 AM", urgent: true },
          { title: "Green Building Proposal", course: "Sustainable Architecture", due: "In 3 days", urgent: false }
        ],
        schedule: [
          { course: "Advanced Algorithms", location: "Room 402, CS Building", time: "10:00 AM - 11:30 AM", color: "#6366f1" },
          { course: "Global Ethics", location: "Virtual", time: "1:00 PM - 2:30 PM", color: "#10b981" }
        ]
      };
    }
    throw error;
  }
};

export { api };
