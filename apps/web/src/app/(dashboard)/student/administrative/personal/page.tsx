'use client';
import { Combobox } from '@/components/ui/Combobox';
import { DEPARTMENTS } from '@/lib/options/academic';
import { confirmDialog } from '@/components/ui/Dialogs';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { HeartHandshake, Loader2, Mail, Pencil, Phone, Plus, Trash2, User, X, Building2 } from 'lucide-react';
import { Topbar } from '@/components/layout/Topbar';
import { FeatureGuide, ExampleRow } from '@/components/ui/FeatureGuide';
import { authedJson } from '@/lib/authed-fetch';

type Contact = { name: string; relation: string; phone: string; email: string };
interface Me {
  name: string; email: string; phone: string | null; role: string; status: string;
  department: string | null; emergencyContacts: Contact[]; memberSince: string;
}

const card = 'rounded-3xl border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.03] backdrop-blur-xl p-6';
const input = 'w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-white/[0.05] border border-zinc-200 dark:border-white/10 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/40';
const blank: Contact = { name: '', relation: '', phone: '', email: '' };

export default function PersonalDataPage() {
  const { data, isLoading, error, mutate } = useSWR<Me>('/api/me', authedJson);
  const [editing, setEditing] = useState<'phone' | 'department' | null>(null);
  const [value, setValue] = useState('');
  const [contactForm, setContactForm] = useState<Contact | null>(null);
  const [busy, setBusy] = useState(false);

  const patch = async (body: object, ok: string) => {
    setBusy(true);
    try {
      await authedJson('/api/me', { method: 'PATCH', body: JSON.stringify(body) });
      await mutate();
      toast.success(ok);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveField = async () => {
    if (!editing) return;
    if (await patch({ [editing]: value }, editing === 'phone' ? 'Phone number saved' : 'Department saved')) setEditing(null);
  };

  const saveContact = async () => {
    if (!contactForm || !data) return;
    if (await patch({ emergencyContacts: [...data.emergencyContacts, contactForm] }, 'Emergency contact added')) setContactForm(null);
  };

  const removeContact = async (i: number) => {
    if (!data || !(await confirmDialog({ title: `Remove ${data.emergencyContacts[i].name}?`, message: 'They will no longer be listed as an emergency contact.', confirmLabel: 'Remove', destructive: true }))) return;
    await patch({ emergencyContacts: data.emergencyContacts.filter((_, j) => j !== i) }, 'Contact removed');
  };

  // Called as a plain function (not <Field />) so inputs keep focus while typing.
  const Field = ({ icon: Icon, label, value: v, edit }: { icon: typeof User; label: string; value: string | null; edit?: 'phone' | 'department' }) => (
    <div className="flex items-start gap-3 p-4 rounded-2xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/70 dark:border-white/[0.06]">
      <Icon className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-zinc-500">{label}</p>
        {editing === edit && edit ? (
          <div className="flex gap-2 mt-1.5">
            {edit === 'department' ? (
              <Combobox autoFocus className="flex-1 min-w-0" value={value} onChange={setValue} onEnter={saveField} options={DEPARTMENTS} maxLength={120} placeholder="e.g. Computer Science" aria-label="Department" />
            ) : (
              <input autoFocus className={input} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveField()} placeholder="+91 98765 43210" />
            )}
            <button onClick={saveField} disabled={busy || !value.trim()} className="px-3 rounded-xl bg-indigo-600 text-white text-xs font-bold disabled:opacity-50">{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}</button>
            <button onClick={() => setEditing(null)} aria-label="Cancel" className="px-2 text-zinc-500"><X className="w-4 h-4" /></button>
          </div>
        ) : (
          <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{v || <span className="text-zinc-400 font-normal">Not added yet</span>}</p>
        )}
      </div>
      {edit && editing !== edit && (
        <button onClick={() => { setEditing(edit); setValue(v ?? ''); }} aria-label={`Edit ${label}`} className="p-1.5 rounded-lg text-zinc-400 hover:text-indigo-500"><Pencil className="w-4 h-4" /></button>
      )}
    </div>
  );

  return (
    <>
      <Topbar title="Personal Data" subtitle="Your contact details and emergency contacts" />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          {error && <p className="text-sm text-rose-500">{(error as Error).message}</p>}
          {isLoading || !data ? (
            <div className="h-64 rounded-3xl bg-zinc-200/60 dark:bg-white/[0.04] animate-pulse" />
          ) : (
            <>
              <section className={card}>
                <h2 className="font-bold text-zinc-900 dark:text-white mb-4">Your details</h2>
                <div className="grid sm:grid-cols-2 gap-3">
                  {Field({ icon: User, label: "Full name", value: data.name })}
                  {Field({ icon: Mail, label: "Email", value: data.email })}
                  {Field({ icon: Phone, label: "Phone", value: data.phone, edit: "phone" })}
                  {(data.role === 'STUDENT' || data.role === 'TEACHER') && Field({ icon: Building2, label: "Department", value: data.department, edit: "department" })}
                </div>
                <p className="text-xs text-zinc-500 mt-4">
                  Member since {new Date(data.memberSince).toLocaleDateString(undefined, { dateStyle: 'long' })}. To change your name or email, contact your campus admin.
                </p>
              </section>

              <section className={card}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-zinc-900 dark:text-white">Emergency contacts</h2>
                  {data.emergencyContacts.length > 0 && data.emergencyContacts.length < 5 && !contactForm && (
                    <button onClick={() => setContactForm({ ...blank })} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-600 text-white text-xs font-bold"><Plus className="w-3.5 h-3.5" /> Add</button>
                  )}
                </div>

                {contactForm && (
                  <div className="mb-4 p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-500/[0.06] border border-indigo-200/60 dark:border-indigo-400/20 grid sm:grid-cols-2 gap-3">
                    <input className={input} placeholder="Full name" value={contactForm.name} maxLength={80} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} />
                    <input className={input} placeholder="Relationship, e.g. Mother" value={contactForm.relation} maxLength={40} onChange={(e) => setContactForm({ ...contactForm, relation: e.target.value })} />
                    <input className={input} type="tel" placeholder="Phone" value={contactForm.phone} maxLength={30} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} />
                    <input className={input} type="email" placeholder="Email (optional)" value={contactForm.email} maxLength={120} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
                    <div className="sm:col-span-2 flex gap-2">
                      <button onClick={saveContact} disabled={busy || !contactForm.name.trim() || !contactForm.phone.trim()} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save contact</button>
                      <button onClick={() => setContactForm(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-zinc-600 dark:text-zinc-300">Cancel</button>
                    </div>
                  </div>
                )}

                {data.emergencyContacts.length === 0 && !contactForm ? (
                  <FeatureGuide
                    className="border-none bg-transparent p-0 md:p-0"
                    icon={HeartHandshake}
                    title="Add someone we can reach in an emergency"
                    description="Your campus uses these contacts only in urgent situations. You can add up to five."
                    steps={['Add a parent, guardian or close contact', 'Include a phone number they answer', 'Keep it up to date when details change']}
                    example={<div><ExampleRow title="Priya Sharma" meta="Mother · +91 98765 43210" right="Primary" /><ExampleRow title="Rahul Verma" meta="Guardian · +91 91234 56789" accent="from-emerald-500 to-teal-500" /></div>}
                    action={{ label: 'Add emergency contact', onClick: () => setContactForm({ ...blank }) }}
                  />
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {data.emergencyContacts.map((c, i) => (
                      <div key={`${c.name}-${i}`} className="flex items-start gap-3 p-4 rounded-2xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/70 dark:border-white/[0.06]">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-zinc-900 dark:text-white">{c.name} {i === 0 && <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500">Primary</span>}</p>
                          <p className="text-xs text-zinc-500">{[c.relation, c.phone, c.email].filter(Boolean).join(' · ')}</p>
                        </div>
                        <button onClick={() => removeContact(i)} aria-label={`Remove ${c.name}`} className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
