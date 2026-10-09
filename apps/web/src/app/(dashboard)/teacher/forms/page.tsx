'use client';

import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, TEACHER_STUDENT_TABS } from '@/components/layout/SectionTabs';
import { ConsentFormsManager, useFormParam } from '@/components/guardian/ConsentFormsManager';

export default function TeacherFormsPage() {
  const [formId, setFormId] = useFormParam();
  return (
    <>
      <Topbar title="Parent forms" subtitle="Permission slips and consent forms, signed by parents in their app" />
      <SectionTabs tabs={TEACHER_STUDENT_TABS} />
      <div className="p-4 md:p-8 max-w-4xl mx-auto w-full">
        <ConsentFormsManager formId={formId} onForm={setFormId} />
      </div>
    </>
  );
}
