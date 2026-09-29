import { redirect } from 'next/navigation';

// Plans and prices are no longer public: organization admins see them in Admin → Billing & Plans
// (and contact us for the plans we quote individually). Old links land on the home page.
export default function PricingPage() {
  redirect('/');
}
