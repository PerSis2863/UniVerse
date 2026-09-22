import { getAdminDocuments, getAdminInvoices, getAdminScholarships } from '@/app/actions/administrative';
import AdminAdministrativeClient from './AdminAdministrativeClient';

export const dynamic = 'force-dynamic';

export default async function AdminAdministrativePage() {
  const documents = await getAdminDocuments();
  const bills = await getAdminInvoices();
  const scholarships = await getAdminScholarships();

  return (
    <AdminAdministrativeClient 
      initialDocs={documents}
      initialBills={bills}
      initialScholarships={scholarships}
    />
  );
}
