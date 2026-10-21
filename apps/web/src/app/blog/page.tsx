import type { Metadata } from 'next';
import { BlogList } from './BlogList';

export const metadata: Metadata = {
  title: 'Blog · UniVerse',
  description: 'News, stories and updates from UniVerse: the platform for schools, universities and social impact.',
  alternates: { canonical: '/blog' },
};

export default function BlogPage() {
  return <BlogList />;
}
