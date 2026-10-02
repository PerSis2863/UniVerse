'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { BadgeCheck, Check, Copy, Download, Printer, QrCode as QrIcon, X } from 'lucide-react';
import { QrCode } from '@/components/ui/QrCode';
import { encodeQr, qrPath } from '@/lib/qr';
import { cn } from '@/lib/utils';

async function copyText(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
    return true;
  } catch {
    toast.error('Could not copy the link');
    return false;
  }
}

/** "Copy verification link" with a short tick so people see it worked. */
export function CopyLinkButton({ url, label = 'Copy verification link', copiedMessage = 'Verification link copied', className }: { url: string; label?: string; copiedMessage?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={async () => { if (await copyText(url, copiedMessage)) setCopied(true); }}
      className={cn('inline-flex items-center gap-1.5 text-xs font-semibold', className)}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied' : label}
    </button>
  );
}

/** Saves the QR code as an SVG file (sharp at any print size). */
function downloadQrSvg(url: string, fileName: string) {
  const matrix = encodeQr(url);
  const dim = matrix.length + 8;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${dim * 10}" height="${dim * 10}" shape-rendering="crispEdges"><rect width="${dim}" height="${dim}" fill="#fff"/><path d="${qrPath(matrix, 4)}" fill="#0f172a"/></svg>`;
  const href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export interface CertificateInfo {
  title: string;
  holderName?: string | null;
  organization?: string | null;
  projectName?: string | null;
  issuedAt?: string | null;
  certificateCode?: string | null;
}

/**
 * A credential as a small certificate with its verification QR code. Anyone scanning the code
 * lands on the public /verify page, so a printed copy can be checked as easily as a link.
 */
export function CertificateQrDialog({ url, cert, onClose }: { url: string; cert: CertificateInfo; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const date = cert.issuedAt ? new Date(cert.issuedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Certificate and QR code" onClick={onClose}>
      {/* Printing shows only the certificate, on its own page */}
      <style>{'@media print{body *{visibility:hidden!important}#credential-print,#credential-print *{visibility:visible!important}#credential-print{position:fixed;inset:0;margin:auto;max-width:720px;height:fit-content;box-shadow:none!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}'}</style>
      <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl tone-panel border border-zinc-200 dark:border-white/10 p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <p className="font-bold text-zinc-900 dark:text-white flex items-center gap-2"><QrIcon className="w-5 h-5 text-indigo-500" /> Certificate</p>
          <button onClick={onClose} aria-label="Close" className="btn-ghost !min-h-0 !p-2"><X className="w-4 h-4" /></button>
        </div>

        <div id="credential-print" className="relative overflow-hidden rounded-2xl border border-indigo-200/70 bg-white p-5 sm:p-7 text-center text-zinc-900 shadow-sm">
          <div aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500" />
          <div aria-hidden className="absolute -top-20 -left-20 w-56 h-56 rounded-full bg-indigo-500/10 blur-3xl" />
          <div aria-hidden className="absolute -bottom-20 -right-20 w-56 h-56 rounded-full bg-fuchsia-500/10 blur-3xl" />
          <div className="relative">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-indigo-600">UniVerse Impact · Verified credential</p>
            {cert.holderName && (
              <>
                <p className="mt-4 text-[11px] uppercase tracking-wider text-zinc-500">Awarded to</p>
                <p className="text-xl sm:text-2xl font-black break-words">{cert.holderName}</p>
              </>
            )}
            <p className="mt-3 text-base sm:text-lg font-bold bg-gradient-to-r from-indigo-600 to-fuchsia-600 bg-clip-text text-transparent break-words">{cert.title}</p>
            {(cert.projectName || cert.organization) && (
              <p className="mt-1 text-sm text-zinc-600 break-words">{[cert.projectName, cert.organization].filter(Boolean).join(' · ')}</p>
            )}
            <div className="mt-5 flex justify-center">
              <div className="rounded-2xl p-1.5 bg-gradient-to-br from-indigo-500 to-fuchsia-500">
                <QrCode value={url} size={168} className="rounded-xl block" title="QR code linking to the verification page" />
              </div>
            </div>
            <p className="mt-3 text-xs text-zinc-500 flex items-center justify-center gap-1"><BadgeCheck className="w-3.5 h-3.5 text-emerald-600" /> Scan to check it is genuine</p>
            <p className="mt-1 text-[10px] text-zinc-400 break-all">{url}</p>
            {(date || cert.certificateCode) && (
              <p className="mt-3 text-[11px] text-zinc-500">{[date && `Issued ${date}`, cert.certificateCode && `Certificate ${cert.certificateCode}`].filter(Boolean).join(' · ')}</p>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <CopyLinkButton url={url} label="Copy link" className="btn-secondary !text-sm" />
          <button type="button" onClick={() => downloadQrSvg(url, `verify-${cert.certificateCode || 'credential'}.svg`)} className="btn-secondary"><Download className="w-4 h-4" /> QR code</button>
          <button type="button" onClick={() => window.print()} className="btn-primary"><Printer className="w-4 h-4" /> Print</button>
        </div>
        <p className="mt-3 text-[11px] text-center text-zinc-500">Print it or save it as a PDF from the print window.</p>
      </div>
    </div>
  );
}

/** Opens the certificate + QR dialog. */
export function CertificateQrButton({ url, cert, className, label = 'QR code', children }: { url: string; cert: CertificateInfo; className?: string; label?: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={children ? 'Show certificate and QR code' : undefined} className={cn('inline-flex items-center gap-1.5 text-xs font-semibold', className)}>
        {children ?? <><QrIcon className="w-3.5 h-3.5" /> {label}</>}
      </button>
      {/* Portal: cards animate with transforms, which would trap a fixed overlay inside them */}
      {open && createPortal(<CertificateQrDialog url={url} cert={cert} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
