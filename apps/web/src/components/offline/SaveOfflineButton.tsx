'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CloudDownload, Loader2 } from 'lucide-react';
import { offlineSupported, savePack } from '@/lib/offline-packs';

/** Saves a course on this device for offline reading (src/lib/offline-packs.ts). */
export function SaveOfflineButton({ courseId, code }: { courseId: string; code: string }) {
  const router = useRouter();
  const [progress, setProgress] = useState<string | null>(null);
  const save = async () => {
    if (!offlineSupported()) return toast.error('This browser can’t save courses for offline use.');
    setProgress('Saving…');
    try {
      const s = await savePack(courseId, (done, total) => setProgress(`Saving ${done}/${total}`));
      toast.success(`${code} saved on this device (${s.savedFiles} of ${s.files} files).`, { action: { label: 'Open', onClick: () => router.push('/student/offline') } });
    } catch (e) {
      toast.error((e as Error).message || 'Couldn’t save this course.');
    } finally {
      setProgress(null);
    }
  };
  return (
    <button type="button" onClick={save} disabled={!!progress} aria-busy={!!progress || undefined} className="btn-secondary text-xs py-2 flex items-center gap-1.5">
      {progress ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CloudDownload className="w-3.5 h-3.5" />} {progress ?? 'Save offline'}
    </button>
  );
}
