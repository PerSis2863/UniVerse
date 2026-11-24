'use client';

import { useState, useSyncExternalStore } from 'react';
import { Bluetooth, Cpu, Download, Send, Unplug, Usb } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ui } from '@/components/sim/bench-ui';
import { bluetoothSupported, usbSupported, wirelessLink, type Char } from './wireless-link';

// Hyperion Signals → Bluetooth & USB (M526): connect a Bluetooth Low Energy device (or the simulated heart-rate sensor)
// and see every characteristic's latest value, read and write; connect a USB device (or the simulated echo device),
// send bytes and receive. Scripts in the Code window use the same connection (ble, characteristic, read, write;
// usbdev, read, write).

const hex = (b: number[] | null) => (b && b.length ? b.map((x) => x.toString(16).padStart(2, '0')).join(' ') : '–');
/** A value as a person reads it: a heart rate, a percentage, text when it is printable, else its first number. */
function plain(c: Char): string {
  const b = c.value;
  if (!b || !b.length) return '–';
  if (c.uuid.startsWith('00002a37')) return `${b[0] & 1 ? b[1] | (b[2] << 8) : b[1]} beats a minute`;
  if (c.uuid.startsWith('00002a19')) return `${b[0]}%`;
  if (b.every((x) => x >= 32 && x < 127)) return new TextDecoder().decode(Uint8Array.from(b));
  return String(b[0]);
}
const parseBytes = (t: string): number[] => (/^\s*(\d{1,3}|0x[0-9a-f]{1,2})(\s+(\d{1,3}|0x[0-9a-f]{1,2}))*\s*$/i.test(t) ? t.trim().split(/\s+/).map((x) => Number(x) & 255) : [...new TextEncoder().encode(t)]);

export function WirelessBench() {
  const st = useSyncExternalStore((cb) => wirelessLink.subscribe(cb), () => wirelessLink.state, () => wirelessLink.state);
  const [ble] = useState(bluetoothSupported), [usb] = useState(usbSupported);
  const [extra, setExtra] = useState('');
  const [say, setSay] = useState('');
  const [got, setGot] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (f: () => Promise<unknown> | void) => { setBusy(true); try { await f(); } catch (e) { wirelessLink.fail(e); } finally { setBusy(false); } };
  const btn = cn(ui.small, 'border border-zinc-200 dark:border-white/15');
  return (
    <div className="grid min-h-[32rem] grid-cols-1 gap-3 xl:grid-cols-2" data-no-motion>
      <section className="panel flex min-w-0 flex-col gap-3 p-4" aria-label="Bluetooth">
        <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-white"><Bluetooth className="h-4 w-4" aria-hidden />Bluetooth</h2>
        {!st.ble.open ? (
          <div className="space-y-2">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">A Bluetooth Low Energy sensor, watch or board: its services and characteristics. {ble ? '' : 'This browser has no Web Bluetooth (Chrome and Edge do): try the simulated sensor.'}</p>
            <label className={ui.label}>Other services to open <span className="font-normal text-zinc-500 dark:text-zinc-400">(UUIDs, optional: the common ones are opened anyway)</span><input value={extra} onChange={(e) => setExtra(e.target.value)} className="input mt-1 w-full font-mono text-xs" placeholder="e.g. 0000ffe0-0000-1000-8000-00805f9b34fb" /></label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary inline-flex items-center gap-1.5" disabled={!ble || busy} onClick={() => void run(() => wirelessLink.connectBle(extra))}><Bluetooth className="h-4 w-4" aria-hidden />Connect a device</button>
              <button type="button" className={btn} onClick={() => wirelessLink.simulateBle()}><Cpu className="h-3.5 w-3.5" aria-hidden />Try a simulated heart-rate sensor</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-zinc-900 dark:text-white" translate="no">{st.ble.name}</span>
              <button type="button" className={btn} onClick={() => wirelessLink.closeBle()}><Unplug className="h-3.5 w-3.5" aria-hidden />Disconnect</button>
            </div>
            <table className="w-full text-start text-[13px]">
              <thead><tr className="text-xs text-zinc-600 dark:text-zinc-300"><th className="py-1 text-start font-medium">Characteristic</th><th className="py-1 text-start font-medium">Can</th><th className="py-1 text-start font-medium">Value</th><th className="py-1"><span className="sr-only">Read</span></th></tr></thead>
              <tbody>
                {st.ble.chars.map((c) => (
                  <tr key={`${c.service}/${c.uuid}`} className="border-t border-zinc-200/80 dark:border-white/10" data-char={c.name}>
                    <td className="py-1.5 pe-2"><span className="block text-zinc-900 dark:text-white" translate="no">{c.name}</span><span className="block font-mono text-[11px] text-zinc-500 dark:text-zinc-400" translate="no">{c.uuid.slice(4, 8)} in {c.service.slice(4, 8)}</span></td>
                    <td className="py-1.5 pe-2 text-xs text-zinc-600 dark:text-zinc-300">{c.props.join(', ')}</td>
                    <td className="py-1.5 pe-2"><span className="block tabular-nums text-zinc-900 dark:text-white" data-value>{plain(c)}</span><span className="block font-mono text-[11px] text-zinc-500 dark:text-zinc-400">{hex(c.value)}</span></td>
                    <td className="py-1.5 text-end">{c.props.includes('read') && <button type="button" className={ui.small} onClick={() => void run(() => wirelessLink.readBle(c.service, c.uuid, true, 3000))} aria-label={`Read ${c.name}`}><Download className="h-3.5 w-3.5" aria-hidden /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">In the Code window: <code className="font-mono" translate="no">b = ble; c = characteristic(b, &quot;180D&quot;, &quot;2A37&quot;); data = read(c)</code></p>
          </>
        )}
      </section>

      <section className="panel flex min-w-0 flex-col gap-3 p-4" aria-label="USB">
        <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-white"><Usb className="h-4 w-4" aria-hidden />USB</h2>
        {!st.usb.open ? (
          <div className="space-y-2">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">A USB device with its own data endpoints (instruments, data loggers, boards running WebUSB firmware). USB serial devices (Arduino, CH340, FTDI) work in Devices. {usb ? '' : 'This browser has no WebUSB (Chrome and Edge do): try the simulated device.'}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary inline-flex items-center gap-1.5" disabled={!usb || busy} onClick={() => void run(() => wirelessLink.connectUsb())}><Usb className="h-4 w-4" aria-hidden />Connect a device</button>
              <button type="button" className={btn} onClick={() => wirelessLink.simulateUsb()}><Cpu className="h-3.5 w-3.5" aria-hidden />Try a simulated echo device</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-zinc-900 dark:text-white" translate="no">{st.usb.name}</span>
              <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{st.usb.vendorId.toString(16).padStart(4, '0')}:{st.usb.productId.toString(16).padStart(4, '0')}</span>
              <button type="button" className={btn} onClick={() => void wirelessLink.closeUsb()}><Unplug className="h-3.5 w-3.5" aria-hidden />Disconnect</button>
            </div>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void run(() => wirelessLink.writeUsb(parseBytes(say))); }}>
              <label className="sr-only" htmlFor="usb-say">Bytes or text to send</label>
              <input id="usb-say" value={say} onChange={(e) => setSay(e.target.value)} className="input flex-1 font-mono text-xs" placeholder="Text, or bytes like 1 2 0xff" />
              <button type="submit" className={btn} disabled={!say}><Send className="h-3.5 w-3.5" aria-hidden />Send</button>
              <button type="button" className={btn} onClick={() => void run(async () => setGot(await wirelessLink.readUsb(64, 2000)))}><Download className="h-3.5 w-3.5" aria-hidden />Receive</button>
            </form>
            <p className="font-mono text-xs text-zinc-700 dark:text-zinc-200" data-usb-got>{got ? `${got.length} bytes: ${hex(got)}` : 'Nothing received yet.'}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">In the Code window: <code className="font-mono" translate="no">u = usbdev; write(u, [1 2 3]); data = read(u, 64)</code></p>
          </>
        )}
      </section>
      {st.error && <p className="text-sm text-red-700 dark:text-red-300 xl:col-span-2" role="alert">{st.error}</p>}
    </div>
  );
}
