import { useEffect, useState } from 'react';
import { Bluetooth, Star } from 'lucide-react';
import { Alert, Button, Checkbox, FormField, Input, SizedDialog, Switch } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { useTranslation, type TranslationKey } from '@/i18n';
import { cn } from '@/lib/cn';
import { bluetoothSupported, pairBluetooth } from '@/lib/printTransports';
import { printerService } from '@/services';
import { PRINT_DOC_KINDS, type PrintDocKind, type PrinterConfig, type PrinterConnection, type RenderMode } from '@/types/printers';
import { CONNECTION_ICON } from './icons';

const CONNECTIONS: PrinterConnection[] = ['bluetooth', 'cloud', 'network', 'system', 'preview'];

function blank(branchId: string | null): Omit<PrinterConfig, 'id'> {
  return {
    name: '', branchId, connection: 'bluetooth', paperWidth: 58, mode: 'auto', dataSaver: true, copies: 1,
    documents: ['receipt', 'kitchen'], defaultFor: [], status: 'active', chunkSize: 180, protocol: 'epos',
  };
}

export function PrinterDialog({
  open,
  printer,
  branchId,
  onClose,
  onSaved,
}: {
  open: boolean;
  printer: PrinterConfig | null;
  branchId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const tk = (k: string, v?: Record<string, string | number>) => t(`printers.${k}` as TranslationKey, v);
  const [draft, setDraft] = useState<Omit<PrinterConfig, 'id'> & { id?: string }>(blank(branchId));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(printer ? { ...printer } : blank(branchId));
      setError(null);
    }
  }, [open, printer, branchId]);

  const set = <K extends keyof PrinterConfig>(key: K, value: PrinterConfig[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const toggleDoc = (kind: PrintDocKind, on: boolean) =>
    setDraft((d) => ({
      ...d,
      documents: on ? [...new Set([...d.documents, kind])] : d.documents.filter((k) => k !== kind),
      defaultFor: on ? d.defaultFor : d.defaultFor.filter((k) => k !== kind),
    }));
  const toggleDefault = (kind: PrintDocKind) =>
    setDraft((d) => ({
      ...d,
      defaultFor: d.defaultFor.includes(kind) ? d.defaultFor.filter((k) => k !== kind) : [...d.defaultFor, kind],
      documents: [...new Set([...d.documents, kind])],
    }));

  const pair = async () => {
    try {
      const device = await pairBluetooth();
      setDraft((d) => ({ ...d, bluetoothId: device.id, bluetoothName: device.name, name: d.name || device.name }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await printerService.save(draft);
      toast.success(tk('saved'));
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const insecureLan = draft.connection === 'network' && location.protocol === 'https:';

  return (
    <SizedDialog
      open={open}
      onClose={onClose}
      busy={busy}
      size={60}
      title={printer ? tk('editTitle') : tk('addTitle')}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-sm text-danger-700">{error}</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>{tk('cancel')}</Button>
            <Button onClick={save} loading={busy} data-testid="printer-save">{tk('save')}</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4" data-testid="printer-dialog">
        <div>
          <div className="mb-1.5 text-sm font-medium text-ink-700">{tk('howConnected')}</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {CONNECTIONS.map((c) => {
              const Icon = CONNECTION_ICON[c];
              return (
                <button
                  key={c}
                  type="button"
                  data-testid={`conn-${c}`}
                  onClick={() => set('connection', c)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-xl border p-3 text-center text-xs font-medium transition-colors',
                    draft.connection === c ? 'border-info-400 bg-info-50 text-info-800 ring-1 ring-info-300' : 'border-ink-200 text-ink-600 hover:bg-ink-50',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {tk(`conn.${c}`)}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-ink-500">{tk(`connHelp.${draft.connection}`)}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={tk('name')} required>
            <Input inputSize="sm" value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder={tk('namePlaceholder')} data-testid="printer-name" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={tk('paper')}>
              <div className="flex gap-1 rounded-lg bg-ink-100 p-0.5">
                {([58, 80] as const).map((w) => (
                  <button key={w} type="button" onClick={() => set('paperWidth', w)} className={cn('flex-1 rounded-md py-1.5 text-sm font-medium', draft.paperWidth === w ? 'bg-surface shadow-sm' : 'text-ink-500')}>{w} mm</button>
                ))}
              </div>
            </FormField>
            <FormField label={tk('copies')}>
              <Input inputSize="sm" type="number" min="1" max="5" value={draft.copies} onChange={(e) => set('copies', Math.max(1, Math.min(5, Number(e.target.value) || 1)))} />
            </FormField>
          </div>
        </div>

        {draft.connection === 'bluetooth' && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-200 p-3">
            <Bluetooth className="h-5 w-5 text-info-600" />
            <div className="min-w-0 flex-1 text-sm">{draft.bluetoothName ? tk('pairedWith', { name: draft.bluetoothName }) : tk('notPaired')}</div>
            <Button size="sm" variant="outline" onClick={pair} disabled={!bluetoothSupported()}>{draft.bluetoothName ? tk('reconnect') : tk('connect')}</Button>
            <FormField label={tk('chunk')} className="w-32">
              <Input inputSize="sm" type="number" min="20" max="512" value={draft.chunkSize ?? 180} onChange={(e) => set('chunkSize', Number(e.target.value) || 180)} />
            </FormField>
            {!bluetoothSupported() && <p className="w-full text-xs text-warning-800">{tk('noBluetooth')}</p>}
          </div>
        )}

        {draft.connection === 'network' && (
          <div className="grid gap-3 rounded-xl border border-ink-200 p-3 sm:grid-cols-3">
            <FormField label={tk('protocol')}>
              <div className="flex gap-1 rounded-lg bg-ink-100 p-0.5">
                {(['epos', 'raw_http'] as const).map((p) => (
                  <button key={p} type="button" onClick={() => set('protocol', p)} className={cn('flex-1 rounded-md py-1.5 text-xs font-medium', draft.protocol === p ? 'bg-surface shadow-sm' : 'text-ink-500')}>{tk(`proto.${p}`)}</button>
                ))}
              </div>
            </FormField>
            {draft.protocol === 'raw_http' ? (
              <FormField label={tk('url')} className="sm:col-span-2"><Input inputSize="sm" dir="ltr" value={draft.url ?? ''} onChange={(e) => set('url', e.target.value)} placeholder="http://192.168.1.50:8080/print" /></FormField>
            ) : (
              <>
                <FormField label={tk('host')}><Input inputSize="sm" dir="ltr" value={draft.host ?? ''} onChange={(e) => set('host', e.target.value)} placeholder="192.168.1.50" /></FormField>
                <FormField label={tk('port')}><Input inputSize="sm" dir="ltr" type="number" value={draft.port ?? ''} onChange={(e) => set('port', Number(e.target.value) || undefined)} placeholder="80" /></FormField>
              </>
            )}
            {insecureLan && <Alert tone="warning" compact className="sm:col-span-3">{tk('mixedContent')}</Alert>}
          </div>
        )}

        {draft.connection === 'cloud' && (
          <div className="rounded-xl border border-ink-200 p-3">
            <FormField label={tk('cloudId')} hint={tk('cloudHint')}>
              <Input inputSize="sm" dir="ltr" value={draft.cloudId ?? ''} onChange={(e) => set('cloudId', e.target.value)} placeholder="00:11:62:AA:BB:CC" />
            </FormField>
          </div>
        )}

        {draft.connection !== 'system' && (
          <div>
            <div className="mb-1.5 text-sm font-medium text-ink-700">{tk('drawAs')}</div>
            <div className="grid gap-2 sm:grid-cols-3">
              {(['auto', 'text', 'image'] as RenderMode[]).map((m) => (
                <button key={m} type="button" onClick={() => set('mode', m)} data-testid={`mode-${m}`}
                  className={cn('rounded-lg border p-2.5 text-start', draft.mode === m ? 'border-info-400 bg-info-50 ring-1 ring-info-300' : 'border-ink-200 hover:bg-ink-50')}>
                  <div className="text-sm font-semibold">{tk(`mode.${m}`)}</div>
                  <div className="text-xs text-ink-500">{tk(`modeHelp.${m}`)}</div>
                </button>
              ))}
            </div>
            <div className="mt-2 rounded-md border border-ink-200 px-3 py-2.5">
              <Switch checked={draft.dataSaver} onCheckedChange={(v) => set('dataSaver', v)} label={tk('dataSaver')} description={tk('dataSaverHelp')} />
            </div>
          </div>
        )}

        <div>
          <div className="mb-1.5 text-sm font-medium text-ink-700">{tk('prints')}</div>
          <div className="divide-y divide-ink-100 rounded-lg border border-ink-200">
            {PRINT_DOC_KINDS.map((kind) => {
              const on = draft.documents.includes(kind);
              const isDefault = draft.defaultFor.includes(kind);
              const disabled = kind === 'a4' && draft.connection !== 'system';
              return (
                <div key={kind} className={cn('flex items-center justify-between px-3 py-2', disabled && 'opacity-40')}>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={on && !disabled} disabled={disabled} onChange={(e) => toggleDoc(kind, e.target.checked)} />
                    {tk(`doc.${kind}`)}
                  </label>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleDefault(kind)}
                    data-testid={`make-default-${kind}`}
                    className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', isDefault ? 'bg-warning-100 text-warning-800' : 'text-ink-500 hover:bg-ink-100')}
                  >
                    <Star className={cn('h-3.5 w-3.5', isDefault && 'fill-current')} />
                    {isDefault ? tk('isDefault') : tk('makeDefault')}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </SizedDialog>
  );
}
