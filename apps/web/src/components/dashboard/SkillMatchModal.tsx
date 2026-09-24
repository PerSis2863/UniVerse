'use client';

import { useEffect, useState } from 'react';
import { X, Sparkles, Target, ArrowRight, Zap, ChevronRight } from 'lucide-react';

interface SkillMatchProject {
  id: string;
  name: string;
  organization: string;
  description: string;
  matchPercent: number;
  matchedSkills: string[];
  type: string;
}

interface SkillMatchModalProps {
  user: {
    name: string;
    skills?: { name: string; category?: string }[];
  };
  onClose: () => void;
  onViewProject?: (projectId: string) => void;
}

// Simulate AI matching based on user skills
function getMatchedProjects(skills: string[]): SkillMatchProject[] {
  const allProjects: SkillMatchProject[] = [
    { id: '1', name: 'Climate Data Analysis', organization: 'WaterAid Kenya', description: 'Help us track water impact with Python', matchPercent: 0, matchedSkills: [], type: 'Remote' },
    { id: '2', name: 'Community Teaching', organization: 'Tech4Good', description: 'Mentor students in coding & soft skills', matchPercent: 0, matchedSkills: [], type: 'Hybrid' },
    { id: '3', name: 'Strategy Planning', organization: 'Green Earth', description: 'Build community engagement strategy', matchPercent: 0, matchedSkills: [], type: 'Field' },
    { id: '4', name: 'Health Data Dashboard', organization: 'Doctors Without Borders', description: 'Visualize health outcomes in rural areas', matchPercent: 0, matchedSkills: [], type: 'Remote' },
    { id: '5', name: 'Digital Literacy Program', organization: 'UNESCO', description: 'Design curriculum for digital skills', matchPercent: 0, matchedSkills: [], type: 'Hybrid' },
  ];

  const skillKeywords: Record<string, string[]> = {
    'Python': ['Climate Data Analysis', 'Health Data Dashboard'],
    'JavaScript': ['Health Data Dashboard', 'Digital Literacy Program'],
    'Data Analysis': ['Climate Data Analysis', 'Health Data Dashboard'],
    'Social Work': ['Community Teaching', 'Strategy Planning'],
    'Community Building': ['Community Teaching', 'Strategy Planning', 'Digital Literacy Program'],
    'Teaching': ['Community Teaching', 'Digital Literacy Program'],
    'Leadership': ['Strategy Planning', 'Community Teaching'],
    'Design': ['Digital Literacy Program', 'Health Data Dashboard'],
    'Communication': ['Community Teaching', 'Strategy Planning', 'Digital Literacy Program'],
  };

  const lowerSkills = skills.map(s => s.toLowerCase());

  return allProjects.map(project => {
    const matched: string[] = [];
    for (const [skill, projectNames] of Object.entries(skillKeywords)) {
      if (projectNames.includes(project.name) && lowerSkills.some(s => s.includes(skill.toLowerCase()))) {
        matched.push(skill);
      }
    }
    // Simulate a match percentage based on skills overlap
    const baseMatch = matched.length > 0 ? 60 + matched.length * 10 : 30 + Math.random() * 20;
    return {
      ...project,
      matchPercent: Math.min(Math.round(baseMatch), 95),
      matchedSkills: matched.length > 0 ? matched : ['General Interest'],
    };
  }).sort((a, b) => b.matchPercent - a.matchPercent).slice(0, 3);
}

export function SkillMatchModal({ user, onClose, onViewProject }: SkillMatchModalProps) {
  const [visible, setVisible] = useState(false);
  const [projects, setProjects] = useState<SkillMatchProject[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    const skillNames = user.skills?.map(s => s.name) || ['Community Building', 'Social Work'];
    setProjects(getMatchedProjects(skillNames));
    return () => clearTimeout(t);
  }, [user]);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const interests = [...new Set(user.skills?.map(s => s.category).filter(Boolean) || ['Climate', 'Education'])];

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${visible ? 'bg-black/60 backdrop-blur-sm' : 'bg-transparent'}`}
      onClick={handleClose}
    >
      <div
        className={`bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-md transition-all duration-300 ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="text-white font-bold text-sm">AI Skill Matching</span>
            </div>
            <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-zinc-300 text-sm">
            Welcome Back, <span className="text-white font-bold">{user.name.split(' ')[0]}!</span> 🎯
          </p>

          <div className="mt-3 space-y-1">
            <p className="text-xs text-zinc-500">Based on your profile:</p>
            <div className="flex flex-wrap gap-1.5">
              {(user.skills?.slice(0, 4) || [{ name: 'Community Building' }, { name: 'Social Work' }]).map(s => (
                <span key={s.name} className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-medium">{s.name}</span>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {interests.slice(0, 3).map(i => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-medium">📌 {i}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Matched Projects */}
        <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-4 h-4 text-amber-400" />
            <span className="text-white font-bold text-sm">Perfect Match Projects</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold">
              {projects[0]?.matchPercent || 82}% match
            </span>
          </div>

          <div className="space-y-3">
            {projects.map((project, idx) => (
              <div
                key={project.id}
                className="group bg-zinc-900/60 border border-zinc-800 rounded-xl p-3.5 hover:border-zinc-700 transition-all cursor-pointer"
                onClick={() => onViewProject?.(project.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-semibold text-sm">{project.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                        project.matchPercent >= 80 ? 'bg-emerald-500/20 text-emerald-400' :
                        project.matchPercent >= 60 ? 'bg-amber-500/20 text-amber-400' :
                        'bg-zinc-700 text-zinc-400'
                      }`}>
                        {project.matchPercent}%
                      </span>
                    </div>
                    <p className="text-xs text-indigo-400 font-medium">{project.organization}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">&quot;{project.description}&quot;</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {project.matchedSkills.map(s => (
                        <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 font-medium">
                          <Zap className="w-2.5 h-2.5 inline mr-0.5" />{s}
                        </span>
                      ))}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-white flex-shrink-0 mt-1 transition-colors" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-2">
          <button
            onClick={handleClose}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors flex items-center justify-center gap-2"
          >
            Explore All Projects <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={handleClose}
            className="px-4 border border-zinc-700 hover:bg-zinc-800 text-zinc-300 font-semibold rounded-xl py-2.5 text-sm transition-colors"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
