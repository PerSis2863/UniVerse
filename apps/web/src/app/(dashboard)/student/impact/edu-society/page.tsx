'use client';

import { GraduationCap } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { NgoProjectBoard, type NgoProject } from '@/components/impact/NgoProjectBoard';

// Education-focused volunteering: NGO projects in the education sector or tied to UN SDG 4.
const isEducation = (p: NgoProject) => p.sdgNumber === 4 || /educat|school|teach|tutor|literacy/i.test(`${p.ngo.sector ?? ''} ${p.name}`);

export default function EduSocietyPage() {
  return (
    <>
      <Topbar title="📚 Educational Society" subtitle="Teach, tutor and mentor with education NGOs" />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          <NgoProjectBoard
            filter={isEducation}
            guide={{
              icon: GraduationCap,
              title: 'Education projects will appear here',
              description: 'Tutoring, mentoring and literacy projects from education NGOs (UN SDG 4 — Quality Education). Each one earns you impact XP and can lead to a verified credential.',
              steps: ['Browse open education projects', 'Apply with a short note about what you can teach', 'Complete the project to earn XP and a credential'],
            }}
          />
        </div>
      </div>
    </>
  );
}
