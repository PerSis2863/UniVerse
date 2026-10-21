'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { authedJson } from '@/lib/authed-fetch';
import { useAuthStore } from '@/store/auth';
import {
  Download,
  Search,
  Star,
  Layers,
  Plus,
  X,
  Sparkles,
  Upload,
  ShoppingBag,
  FileText,
  PlayCircle,
  HelpCircle,
  CheckSquare,
  Loader2,
  TrendingUp,
} from 'lucide-react';

export interface MarketplaceModuleItem {
  title: string;
  kind?: string;
  body?: string | null;
  url?: string | null;
  position?: number;
}

export interface MarketplaceModule {
  title: string;
  summary?: string | null;
  position: number;
  items?: MarketplaceModuleItem[];
}

export interface MarketplaceReview {
  id: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  user?: {
    id: string;
    name: string;
  };
}

export interface MarketplacePack {
  id: string;
  authorId: string;
  sourceCourseId?: string | null;
  title: string;
  slug: string;
  summary: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  category: string;
  level: string;
  priceMinor: number;
  currency: string;
  modulesData?: string;
  modulesCount: number;
  itemsCount: number;
  estimatedHours: number;
  ratingAvg: number;
  reviewsCount: number;
  downloadsCount: number;
  revenueSharePct: number;
  status: string;
  createdAt: string;
  author?: {
    id: string;
    name: string;
    email: string;
  };
  modules?: MarketplaceModule[];
  reviews?: MarketplaceReview[];
  _count?: {
    imports?: number;
    reviews?: number;
  };
}

interface TeacherCourse {
  id: string;
  name: string;
  code?: string;
}

const CATEGORIES = [
  'All',
  'Computer Science',
  'Mathematics',
  'Natural Sciences',
  'Business & Economics',
  'Engineering',
  'Humanities',
  'Social Sciences',
];

const LEVELS: { value: string; label: string }[] = [
  { value: 'ALL_LEVELS', label: 'All Levels' },
  { value: 'BEGINNER', label: 'Beginner' },
  { value: 'INTERMEDIATE', label: 'Intermediate' },
  { value: 'ADVANCED', label: 'Advanced' },
];

function formatPrice(priceMinor: number, currency = 'INR') {
  if (priceMinor === 0) return 'Free';
  const val = (priceMinor / 100).toLocaleString('en-IN');
  if (currency === 'INR') return `₹${val}`;
  if (currency === 'USD') return `$${(priceMinor / 100).toFixed(2)}`;
  return `${currency} ${val}`;
}

function getCategoryColor(category: string) {
  switch (category) {
    case 'Computer Science':
      return 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/40';
    case 'Mathematics':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/40';
    case 'Natural Sciences':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/40';
    case 'Business & Economics':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/40';
    case 'Engineering':
      return 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800/40';
    default:
      return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/40';
  }
}

export function MarketplaceCatalog() {
  const currentUser = useAuthStore((s) => s.user);
  const isTeacherOrAdmin = currentUser?.role === 'TEACHER' || currentUser?.role === 'ADMIN';

  const [mainTab, setMainTab] = useState<'catalog' | 'my-packs'>('catalog');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedLevel, setSelectedLevel] = useState('ALL_LEVELS');
  const [selectedPriceFilter, setSelectedPriceFilter] = useState<'all' | 'free' | 'paid'>('all');
  const [selectedSort, setSelectedSort] = useState<'downloads' | 'rating' | 'recent' | 'price_asc' | 'price_desc'>('downloads');

  // Modals & Actions
  const [inspectPackId, setInspectPackId] = useState<string | null>(null);
  const [packToImport, setPackToImport] = useState<MarketplacePack | null>(null);
  const [targetCourseId, setTargetCourseId] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);

  // Publish Modal State
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishForm, setPublishForm] = useState({
    sourceCourseId: '',
    title: '',
    summary: '',
    description: '',
    category: 'Computer Science',
    level: 'ALL_LEVELS',
    priceMinor: 0,
    currency: 'INR',
    estimatedHours: 10,
  });
  const [isPublishing, setIsPublishing] = useState(false);

  // Review Form State
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Query Params
  const queryUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    if (selectedCategory !== 'All') params.set('category', selectedCategory);
    if (selectedLevel !== 'ALL_LEVELS') params.set('level', selectedLevel);
    if (selectedPriceFilter !== 'all') params.set('priceFilter', selectedPriceFilter);
    if (selectedSort) params.set('sort', selectedSort);
    return `/api/marketplace/packs?${params.toString()}`;
  }, [searchQuery, selectedCategory, selectedLevel, selectedPriceFilter, selectedSort]);

  // Catalog SWR
  const { data: catalogData, isLoading: catalogLoading, mutate: refreshCatalog } = useSWR<{
    packs: MarketplacePack[];
    total: number;
  }>(queryUrl, authedJson);

  // My Published SWR
  const { data: myPublishedData, isLoading: myLoading, mutate: refreshMyData } = useSWR<{
    packs: MarketplacePack[];
    stats: {
      totalPacks: number;
      totalDownloads: number;
      totalEarningsMinor: number;
      currency: string;
    };
  }>(isTeacherOrAdmin ? '/api/marketplace/my-published' : null, authedJson);

  // Teacher's Courses (for import & export)
  const { data: teacherCourses = [] } = useSWR<TeacherCourse[]>(
    isTeacherOrAdmin ? '/courses/my' : null,
    authedJson
  );

  // Inspected Pack SWR
  const { data: inspectedPack, mutate: refreshInspected } = useSWR<MarketplacePack>(
    inspectPackId ? `/api/marketplace/packs/${inspectPackId}` : null,
    authedJson
  );

  const packs = catalogData?.packs || [];

  // Submit Review Handler
  async function handleReviewSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inspectPackId) return;
    setIsSubmittingReview(true);
    try {
      await authedJson(`/api/marketplace/packs/${inspectPackId}/reviews`, {
        method: 'POST',
        body: JSON.stringify({ rating: reviewRating, comment: reviewComment }),
      });
      toast.success('Thank you! Your peer review has been recorded.');
      setReviewComment('');
      refreshInspected();
      refreshCatalog();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record review';
      toast.error(msg);
    } finally {
      setIsSubmittingReview(false);
    }
  }

  // Import Handler
  async function handleImportSubmit() {
    if (!packToImport || !targetCourseId) {
      toast.error('Please select a target course to import modules into');
      return;
    }
    setIsImporting(true);
    try {
      const res = await authedJson<{ modulesImported: number; itemsImported: number }>(
        `/api/marketplace/packs/${packToImport.id}/import`,
        {
          method: 'POST',
          body: JSON.stringify({ targetCourseId }),
        }
      );
      toast.success(
        `Successfully imported ${res.modulesImported} modules (${res.itemsImported} lessons) into your course!`
      );
      setPackToImport(null);
      setTargetCourseId('');
      refreshCatalog();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to import pack';
      toast.error(msg);
    } finally {
      setIsImporting(false);
    }
  }

  // Publish Handler
  async function handlePublishSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!publishForm.title.trim() || !publishForm.summary.trim()) {
      toast.error('Please provide both title and summary for the pack');
      return;
    }
    setIsPublishing(true);
    try {
      await authedJson('/api/marketplace/packs', {
        method: 'POST',
        body: JSON.stringify({
          sourceCourseId: publishForm.sourceCourseId || undefined,
          title: publishForm.title.trim(),
          summary: publishForm.summary.trim(),
          description: publishForm.description.trim() || undefined,
          category: publishForm.category,
          level: publishForm.level,
          priceMinor: Number(publishForm.priceMinor) || 0,
          currency: publishForm.currency,
          estimatedHours: Number(publishForm.estimatedHours) || 5,
        }),
      });
      toast.success('Curriculum pack published to the marketplace!');
      setShowPublishModal(false);
      setPublishForm({
        sourceCourseId: '',
        title: '',
        summary: '',
        description: '',
        category: 'Computer Science',
        level: 'ALL_LEVELS',
        priceMinor: 0,
        currency: 'INR',
        estimatedHours: 10,
      });
      refreshCatalog();
      refreshMyData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to publish pack';
      toast.error(msg);
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Hero Showcase Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/50 dark:border-indigo-900/40 bg-gradient-to-br from-indigo-50/80 via-white to-purple-50/40 dark:from-indigo-950/20 dark:via-zinc-900 dark:to-purple-950/10 p-6 md:p-8 shadow-sm">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 dark:border-indigo-800/60 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
              <Sparkles className="h-3.5 w-3.5" />
              Stage 5 · Content Marketplace & Curriculum Exchange
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
              Curriculum Exchange & Course Packs
            </h1>
            <p className="text-sm md:text-base text-zinc-600 dark:text-zinc-400">
              Discover, peer-review, and import accredited syllabi, problem sets, and module bundles.
              Educators earn 80% revenue share on paid curriculum packs with 1-click deep copying.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isTeacherOrAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => setShowPublishModal(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors"
                >
                  <Upload className="h-4 w-4" />
                  Publish Course Pack
                </button>
                <button
                  type="button"
                  onClick={() => setMainTab(mainTab === 'catalog' ? 'my-packs' : 'catalog')}
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur px-4 py-2.5 text-sm font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  {mainTab === 'catalog' ? 'My Published Packs & Earnings' : 'Back to Catalog'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Highlight Stats Row */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-zinc-200/60 dark:border-zinc-800/60 pt-5">
          <div>
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Verified Modules</div>
            <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100">500+ Bundles</div>
          </div>
          <div>
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Creator Royalty</div>
            <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400">80% Net Share</div>
          </div>
          <div>
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Import Mechanism</div>
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">1-Click Clone</div>
          </div>
          <div>
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Quality Review</div>
            <div className="text-xl font-bold text-amber-500 dark:text-amber-400">Peer Evaluated</div>
          </div>
        </div>
      </div>

      {/* Main Tab: My Published Packs View */}
      {mainTab === 'my-packs' && isTeacherOrAdmin && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                My Published Curriculum Packs
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Track student and faculty imports, student feedback ratings, and creator royalties.
              </p>
            </div>
            <button
              onClick={() => setShowPublishModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              <Plus className="h-4 w-4" />
              New Pack
            </button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Published Packs</div>
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">
                {myPublishedData?.stats?.totalPacks ?? 0}
              </div>
              <div className="text-xs text-zinc-500 mt-1">Active on catalog</div>
            </div>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Total Imports</div>
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">
                {myPublishedData?.stats?.totalDownloads ?? 0}
              </div>
              <div className="text-xs text-zinc-500 mt-1">Courses cloned into</div>
            </div>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Creator Split</div>
              <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                80%
              </div>
              <div className="text-xs text-zinc-500 mt-1">Of marketplace price</div>
            </div>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Total Royalties Earned</div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                {formatPrice(myPublishedData?.stats?.totalEarningsMinor ?? 0, myPublishedData?.stats?.currency)}
              </div>
              <div className="text-xs text-zinc-500 mt-1">Net payout balance</div>
            </div>
          </div>

          {/* Teacher's Packs List */}
          {myLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : !myPublishedData?.packs || myPublishedData.packs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 p-12 text-center bg-zinc-50/50 dark:bg-zinc-900/50">
              <ShoppingBag className="mx-auto h-12 w-12 text-zinc-400" />
              <h3 className="mt-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">No curriculum packs published yet</h3>
              <p className="mt-1 text-sm text-zinc-500 max-w-md mx-auto">
                Package any syllabus or course modules you teach and share them across institutions.
              </p>
              <button
                onClick={() => setShowPublishModal(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                <Plus className="h-4 w-4" />
                Publish Your First Pack
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {myPublishedData.packs.map((pack) => (
                <div
                  key={pack.id}
                  className="flex flex-col rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-medium ${getCategoryColor(pack.category)}`}>
                      {pack.category}
                    </span>
                    <span className="text-xs font-semibold text-zinc-500">
                      {formatPrice(pack.priceMinor, pack.currency)}
                    </span>
                  </div>
                  <h4 className="mt-3 text-base font-bold text-zinc-900 dark:text-zinc-100 line-clamp-1">
                    {pack.title}
                  </h4>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                    {pack.summary}
                  </p>

                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-zinc-100 dark:border-zinc-800/80 pt-3 text-center">
                    <div>
                      <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{pack.downloadsCount}</div>
                      <div className="text-[10px] text-zinc-500">Imports</div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-amber-500">{pack.ratingAvg || '-'} ★</div>
                      <div className="text-[10px] text-zinc-500">Rating</div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        {formatPrice(Math.round(pack.priceMinor * pack.downloadsCount * 0.8), pack.currency)}
                      </div>
                      <div className="text-[10px] text-zinc-500">Earnings</div>
                    </div>
                  </div>

                  <div className="mt-4 pt-2">
                    <button
                      type="button"
                      onClick={() => setInspectPackId(pack.id)}
                      className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                    >
                      Inspect Syllabus & Feedback
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Tab: Catalog View */}
      {mainTab === 'catalog' && (
        <div className="space-y-6">
          {/* Search & Filter Toolbar */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 md:p-5 shadow-sm space-y-4">
            {/* Search Input & Sort Dropdowns */}
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search curriculum packs, topics (Raft, Machine Learning, UPI, Calculus)..."
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/50 ps-10 pe-10 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute end-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Level Filter */}
              <div className="flex items-center gap-2">
                <select
                  aria-label="Level"
                  value={selectedLevel}
                  onChange={(e) => setSelectedLevel(e.target.value)}
                  className="rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {LEVELS.map((lvl) => (
                    <option key={lvl.value} value={lvl.value}>
                      {lvl.label}
                    </option>
                  ))}
                </select>

                {/* Price Filter */}
                <select
                  aria-label="Price"
                  value={selectedPriceFilter}
                  onChange={(e) => setSelectedPriceFilter(e.target.value as 'all' | 'free' | 'paid')}
                  className="rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">All Prices</option>
                  <option value="free">Free Only</option>
                  <option value="paid">Paid Only</option>
                </select>

                {/* Sort Filter */}
                <select
                  aria-label="Sort by"
                  value={selectedSort}
                  onChange={(e) =>
                    setSelectedSort(
                      e.target.value as 'downloads' | 'rating' | 'recent' | 'price_asc' | 'price_desc'
                    )
                  }
                  className="rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="downloads">Most Popular</option>
                  <option value="rating">Highest Rated</option>
                  <option value="recent">Newest Added</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                </select>
              </div>
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
              {CATEGORIES.map((cat) => {
                const isActive = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Packs Grid */}
          {catalogLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              <p className="text-sm text-zinc-500">Loading curriculum catalog...</p>
            </div>
          ) : packs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 p-12 text-center bg-white/50 dark:bg-zinc-900/50">
              <ShoppingBag className="mx-auto h-12 w-12 text-zinc-400" />
              <h3 className="mt-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">No matching course packs</h3>
              <p className="mt-1 text-sm text-zinc-500 max-w-md mx-auto">
                Try adjusting your search filters or browse across all academic disciplines.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('All');
                  setSelectedLevel('ALL_LEVELS');
                  setSelectedPriceFilter('all');
                }}
                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Reset All Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {packs.map((pack) => (
                <div
                  key={pack.id}
                  className="group flex flex-col justify-between rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-800/60 transition-all"
                >
                  <div className="space-y-3">
                    {/* Header Tags */}
                    <div className="flex items-center justify-between gap-2">
                      <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-semibold ${getCategoryColor(pack.category)}`}>
                        {pack.category}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-bold ${
                          pack.priceMinor === 0
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40'
                            : 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/40'
                        }`}
                      >
                        {formatPrice(pack.priceMinor, pack.currency)}
                      </span>
                    </div>

                    {/* Title & Summary */}
                    <div>
                      <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2">
                        {pack.title}
                      </h3>
                      <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400 line-clamp-3 leading-relaxed">
                        {pack.summary}
                      </p>
                    </div>

                    {/* Author & Rating */}
                    <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                      <div className="flex items-center gap-1.5 font-medium truncate max-w-[60%]">
                        <div className="h-5 w-5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 flex items-center justify-center text-[10px] font-bold">
                          {pack.author?.name ? pack.author.name.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <span className="truncate">{pack.author?.name || 'Faculty Author'}</span>
                      </div>
                      <div className="flex items-center gap-1 font-semibold text-amber-500 shrink-0">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        <span>{pack.ratingAvg > 0 ? pack.ratingAvg.toFixed(1) : 'New'}</span>
                        <span className="text-zinc-400 font-normal">({pack.reviewsCount})</span>
                      </div>
                    </div>

                    {/* Curriculum Metadata Bar */}
                    <div className="grid grid-cols-3 gap-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-2.5 text-center text-[11px] text-zinc-600 dark:text-zinc-400">
                      <div>
                        <div className="font-bold text-zinc-900 dark:text-zinc-200">{pack.modulesCount}</div>
                        <div className="text-[10px] text-zinc-400">Modules</div>
                      </div>
                      <div>
                        <div className="font-bold text-zinc-900 dark:text-zinc-200">{pack.itemsCount}</div>
                        <div className="text-[10px] text-zinc-400">Lessons</div>
                      </div>
                      <div>
                        <div className="font-bold text-zinc-900 dark:text-zinc-200">{pack.downloadsCount}</div>
                        <div className="text-[10px] text-zinc-400">Clones</div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-5 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setInspectPackId(pack.id)}
                      className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 py-2.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                    >
                      Inspect Syllabus
                    </button>
                    {isTeacherOrAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setPackToImport(pack);
                          if (teacherCourses.length > 0) {
                            setTargetCourseId(teacherCourses[0].id);
                          }
                        }}
                        className="rounded-xl bg-indigo-600 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 shadow-sm transition-colors flex items-center gap-1.5"
                        title="Clone curriculum into your course"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Import
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Inspect Syllabus Modal */}
      {inspectPackId && inspectedPack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-start justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-semibold ${getCategoryColor(inspectedPack.category)}`}>
                    {inspectedPack.category}
                  </span>
                  <span className="rounded-lg bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    {inspectedPack.level.replace('_', ' ')}
                  </span>
                  <span className="font-bold text-xs text-emerald-600 dark:text-emerald-400">
                    {formatPrice(inspectedPack.priceMinor, inspectedPack.currency)}
                  </span>
                </div>
                <h3 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-100">
                  {inspectedPack.title}
                </h3>
                <p className="text-xs text-zinc-500">
                  Author: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{inspectedPack.author?.name}</span> · Estimated {inspectedPack.estimatedHours} hours
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectPackId(null)}
                className="rounded-lg p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Summary & Description */}
              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/40 p-4 border border-zinc-200/60 dark:border-zinc-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">Overview & Pedagogical Goal</h4>
                <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  {inspectedPack.description || inspectedPack.summary}
                </p>
              </div>

              {/* Module Tree */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <Layers className="h-4 w-4 text-indigo-600" />
                    Curriculum Modules ({inspectedPack.modules?.length || 0})
                  </h4>
                  <span className="text-xs text-zinc-500">{inspectedPack.itemsCount} lessons total</span>
                </div>

                <div className="space-y-3">
                  {(!inspectedPack.modules || inspectedPack.modules.length === 0) ? (
                    <div className="text-xs text-zinc-500 p-4 text-center">No modules listed in bundle.</div>
                  ) : (
                    inspectedPack.modules.map((m, mIdx) => (
                      <div
                        key={mIdx}
                        className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/40 p-4 shadow-sm space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <h5 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                            {m.title}
                          </h5>
                          <span className="text-[11px] font-medium text-zinc-400">
                            {m.items?.length || 0} items
                          </span>
                        </div>
                        {m.summary && (
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">{m.summary}</p>
                        )}

                        {m.items && m.items.length > 0 && (
                          <div className="space-y-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                            {m.items.map((item, itIdx) => (
                              <div
                                key={itIdx}
                                className="flex items-center justify-between rounded-lg bg-zinc-50 dark:bg-zinc-900/60 px-3 py-2 text-xs"
                              >
                                <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 font-medium">
                                  {item.kind === 'VIDEO' ? (
                                    <PlayCircle className="h-3.5 w-3.5 text-purple-500" />
                                  ) : item.kind === 'QUIZ' ? (
                                    <HelpCircle className="h-3.5 w-3.5 text-amber-500" />
                                  ) : item.kind === 'ASSIGNMENT' ? (
                                    <CheckSquare className="h-3.5 w-3.5 text-emerald-500" />
                                  ) : (
                                    <FileText className="h-3.5 w-3.5 text-blue-500" />
                                  )}
                                  <span>{item.title}</span>
                                </div>
                                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">
                                  {item.kind || 'PAGE'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Reviews Section */}
              <div className="space-y-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    Peer Reviews & Ratings ({inspectedPack.reviews?.length || 0})
                  </h4>
                  <div className="text-xs font-semibold text-amber-500">
                    Score: {inspectedPack.ratingAvg.toFixed(1)} / 5.0
                  </div>
                </div>

                {/* Submit Review Form */}
                <form
                  onSubmit={handleReviewSubmit}
                  className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/40 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Write a Peer Review</span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setReviewRating(star)}
                          className="p-0.5 focus:outline-none"
                        >
                          <Star
                            className={`h-4 w-4 ${
                              star <= reviewRating
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-zinc-300 dark:text-zinc-600'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    rows={2}
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="Share feedback for other professors: course cohort reception, clarity, problem set quality..."
                    className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isSubmittingReview}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
                    >
                      {isSubmittingReview && <Loader2 className="h-3 w-3 animate-spin" />}
                      Post Review
                    </button>
                  </div>
                </form>

                {/* Reviews List */}
                <div className="space-y-2.5">
                  {(!inspectedPack.reviews || inspectedPack.reviews.length === 0) ? (
                    <div className="text-xs text-zinc-500 text-center py-2">No reviews yet. Be the first to evaluate this pack!</div>
                  ) : (
                    inspectedPack.reviews.map((r) => (
                      <div
                        key={r.id}
                        className="rounded-xl border border-zinc-100 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 p-3 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-zinc-800 dark:text-zinc-200">
                            {r.user?.name || 'Instructor'}
                          </span>
                          <div className="flex items-center gap-1 text-amber-500 font-semibold">
                            {Array.from({ length: r.rating }).map((_, i) => (
                              <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
                            ))}
                          </div>
                        </div>
                        {r.comment && (
                          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                            {r.comment}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-between gap-3">
              <div className="text-xs text-zinc-500 font-medium">
                {inspectedPack.downloadsCount} teachers & departments have cloned this bundle.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInspectPackId(null)}
                  className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Close
                </button>
                {isTeacherOrAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setPackToImport(inspectedPack);
                      setInspectPackId(null);
                      if (teacherCourses.length > 0) {
                        setTargetCourseId(teacherCourses[0].id);
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 shadow-sm"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Import into My Course
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import to Course Modal */}
      {packToImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  Import Course Pack
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Deep clone modules and lessons into your target course.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPackToImport(null)}
                className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-950/20 p-4 space-y-1.5">
              <div className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                {packToImport.title}
              </div>
              <div className="text-xs text-indigo-700 dark:text-indigo-300">
                Includes {packToImport.modulesCount} modules and {packToImport.itemsCount} lesson items.
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                Target Course to Receive Modules:
              </label>
              {teacherCourses.length === 0 ? (
                <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-200">
                  You do not have any active taught courses yet. Create or get assigned to a course first.
                </div>
              ) : (
                <select
                  aria-label="Target course"
                  value={targetCourseId}
                  onChange={(e) => setTargetCourseId(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2.5 text-xs font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {teacherCourses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code ? `[${c.code}] ` : ''}{c.name}
                    </option>
                  ))}
                </select>
              )}
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Modules will be appended to your syllabus sequentially. You will have full edit and customization control.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setPackToImport(null)}
                className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImportSubmit}
                disabled={isImporting || teacherCourses.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 shadow-sm disabled:opacity-50"
              >
                {isImporting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Confirm & Import Modules
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Publish Course Pack Modal */}
      {showPublishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  Publish Course Pack to Marketplace
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Package your course modules into an exchange bundle. You keep 80% revenue share.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPublishModal(false)}
                className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handlePublishSubmit} className="space-y-4">
              {/* Optional Source Course */}
              {teacherCourses.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                    Extract Modules From Course (Optional):
                  </label>
                  <select
                    value={publishForm.sourceCourseId}
                    onChange={(e) => {
                      const sel = teacherCourses.find((c) => c.id === e.target.value);
                      setPublishForm({
                        ...publishForm,
                        sourceCourseId: e.target.value,
                        title: sel ? `${sel.name} - Master Curriculum Pack` : publishForm.title,
                      });
                    }}
                    className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">None (Use starter curriculum modules)</option>
                    {teacherCourses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code ? `[${c.code}] ` : ''}{c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Title */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Pack Title *</label>
                <input
                  type="text"
                  required
                  value={publishForm.title}
                  onChange={(e) => setPublishForm({ ...publishForm, title: e.target.value })}
                  placeholder="e.g. Distributed Consensus & High-Scale Systems"
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Summary */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Summary (Catalog Card) *</label>
                <textarea
                  rows={2}
                  required
                  value={publishForm.summary}
                  onChange={(e) => setPublishForm({ ...publishForm, summary: e.target.value })}
                  placeholder="Brief 1-2 sentence pitch of this syllabus bundle..."
                  className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Category & Level */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Academic Category</label>
                  <select
                    value={publishForm.category}
                    onChange={(e) => setPublishForm({ ...publishForm, category: e.target.value })}
                    className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 text-xs font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {CATEGORIES.filter((c) => c !== 'All').map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Level</label>
                  <select
                    value={publishForm.level}
                    onChange={(e) => setPublishForm({ ...publishForm, level: e.target.value })}
                    className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 text-xs font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {LEVELS.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Pricing & Hours */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Price (INR minor / paise)</label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={publishForm.priceMinor}
                    onChange={(e) => setPublishForm({ ...publishForm, priceMinor: Number(e.target.value) })}
                    placeholder="0 for Free"
                    className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="text-[10px] text-zinc-500">
                    {publishForm.priceMinor === 0
                      ? 'Free (Open-source sharing)'
                      : `You keep 80% (₹${((publishForm.priceMinor * 0.8) / 100).toFixed(2)}) per import`}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Estimated Cohort Hours</label>
                  <input
                    type="number"
                    min="1"
                    value={publishForm.estimatedHours}
                    onChange={(e) => setPublishForm({ ...publishForm, estimatedHours: Number(e.target.value) })}
                    className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowPublishModal(false)}
                  className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPublishing}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 shadow-sm disabled:opacity-50"
                >
                  {isPublishing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Publish to Exchange
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
