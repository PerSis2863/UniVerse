import { Topbar } from '@/components/layout/Topbar';
import { SectionTabs, STUDENT_BOARD_TABS } from '@/components/layout/SectionTabs';
import { PeerTutoringTimeBank } from '@/components/tutoring/PeerTutoringTimeBank';

export const metadata = {
  title: 'Peer Tutoring Time-Bank - Universe',
  description: 'Exchange 20-minute peer tutoring sessions using time credits backed by D1 Learning DNA mastery and Skill Passport credentials.',
};

export default function StudentTutoringPage() {
  return (
    <>
      <Topbar
        title="Peer Tutoring Time-Bank"
        subtitle="Fair knowledge exchange: 1 credit = 20-minute session in subjects you master or need help with"
      />
      <SectionTabs tabs={STUDENT_BOARD_TABS} />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="mx-auto max-w-6xl">
          <PeerTutoringTimeBank />
        </div>
      </div>
    </>
  );
}
