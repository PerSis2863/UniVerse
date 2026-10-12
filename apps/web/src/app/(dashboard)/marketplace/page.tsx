'use client';

import { Topbar } from '@/components/layout/Topbar';
import { MarketplaceCatalog } from '@/components/marketplace/MarketplaceCatalog';

export default function MarketplacePage() {
  return (
    <div className="min-h-screen pb-16">
      <Topbar
        title="Curriculum Marketplace"
        subtitle="Discover, peer-review, and import accredited syllabi, lesson bundles, and interactive problem sets."
      />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <MarketplaceCatalog />
      </main>
    </div>
  );
}
