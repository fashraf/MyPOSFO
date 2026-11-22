import { useCallback, useEffect, useState } from 'react';
import { Bluetooth, Pencil, Plus, Printer as PrinterIcon, Star, Trash2 } from 'lucide-react';
import { CONNECTION_ICON } from './icons';
import { Alert, Badge, Button, Card, CardBody, ConfirmModal, Select } from '@/components/ui';
import { useSession } from '@/contexts/SessionContext';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation, type TranslationKey } from '@/i18n';
import { cn } from '@/lib/cn';
import { bluetoothSupported, pairBluetooth } from '@/lib/printTransports';
import { printerService, safeCall } from '@/services';
import { PRINT_DOC_KINDS, type PrintDocKind, type PrintJob, type PrinterConfig } from '@/types/printers';
import { PrinterDialog } from './PrinterDialog';
import { PrintPreview } from './PrintPreview';


/**
 * Settings & Tax → Printers.
 *
 * Top: which printer each document goes to by default (the till pre-selects
 * these at checkout). Below: the printers, with Connect / Test / Edit.
 */
export function PrintersPanel() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { activeBranch, can } = useSession();
  const toast = useToast();
  const [list, setList] = useState<PrinterConfig[]>([]);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [editing, setEditing] = useState<PrinterConfig | 'new' | null>(null);
  const [removing, setRemoving] = useState<PrinterConfig | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const canEdit = can('settings.edit');
  const tk = (k: string, v?: Record<string, string | number>) => t(`printers.${k}` as TranslationKey, v);

  const load = useCallback(async () => {
    const branchId = activeBranch?.id ?? null;
    const [p, j] = await Promise.all([safeCall(() => printerService.list(branchId)), safeCall(() => printerService.jobs())]);
    if (p.ok) setList(p.data);
    if (j.ok) setJobs(j.data);
  }, [activeBranch]);

  useEffect(() => {
    void load();
  }, [load]);

  const test = async (printer: PrinterConfig) => {
    setBusy(printer.id);
    const res = await printerService.testPrint(printer, language === 'ar' ? 'ar' : 'en');
    setBusy(null);
    if (res.previewUrl) setPreview(res.previewUrl);
    if (res.ok) toast.success(tk('testSent'), tk('bytes', { kb: (res.bytes / 1024).toFixed(1) }));
    else toast.error(tk('testFailed'), res.error);
    void load();
  };

  const connect = async (printer: PrinterConfig) => {
    try {
      const device = await pairBluetooth();
      await printerService.save({ ...printer, bluetoothId: device.id, bluetoothName: device.name });
      toast.success(tk('paired', { name: device.name }));
      void load();
    } catch (error) {
      toast.error(tk('pairFailed'), error instanceof Error ? error.message : String(error));
    }
  };

  const setDefault = async (kind: PrintDocKind, printerId: string) => {
    if (!printerId) return;
    await printerService.setDefault(printerId, kind);
    toast.success(tk('defaultSaved', { doc: tk(`doc.${kind}`), name: list.find((p) => p.id === printerId)?.name ?? '' }));
    void load();
  };

  return (
    <div className="space-y-3" data-testid="printers-panel">
      <Alert tone="info" compact>{tk('mobileHint')}</Alert>

      {/* Defaults: "mark the default one" */}
      <Card>
        <CardBody className="space-y-3">
          <div>
            <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">{tk('defaultsTitle')}</h2>
            <p className="mt-1 text-xs text-ink-500">{tk('defaultsHelp')}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PRINT_DOC_KINDS.map((kind) => {
              const current = list.find((p) => p.defaultFor.includes(kind));
              return (
                <div key={kind} className="rounded-lg border border-ink-200 p-3" data-testid={`default-${kind}`}>
                  <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink-800"><Star className="h-3.5 w-3.5 fill-warning-400 text-warning-500" />{tk(`doc.${kind}`)}</div>
                  <Select
                    selectSize="sm"
                    value={current?.id ?? ''}
                    onChange={(v) => void setDefault(kind, v)}
                    placeholder={tk('noDefault')}
                    disabled={!canEdit}
                    options={list.filter((p) => p.status === 'active' && (kind !== 'a4' || p.connection === 'system')).map((p) => ({ value: p.id, label: p.name }))}
                    aria-label={tk('defaultFor', { doc: tk(`doc.${kind}`) })}
                  />
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">{tk('listTitle', { n: list.length })}</h2>
            {canEdit && <Button size="sm" leadingIcon={<Plus />} onClick={() => setEditing('new')} data-testid="printer-add">{tk('add')}</Button>}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {list.map((p) => {
              const Icon = CONNECTION_ICON[p.connection];
              const needsPair = p.connection === 'bluetooth' && !p.bluetoothId;
              return (
                <div key={p.id} className={cn('rounded-xl border p-3', p.lastError ? 'border-danger-200' : 'border-ink-200')} data-testid="printer-card">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-700"><Icon className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-ink-900">{p.name}</div>
                      <div className="text-xs text-ink-500">
                        {tk(`conn.${p.connection}`)} · {p.paperWidth} mm · {tk(`mode.${p.mode}`)}{p.dataSaver ? ` · ${tk('dataSaverShort')}` : ''}
                        {p.connection === 'bluetooth' && p.bluetoothName ? ` · ${p.bluetoothName}` : ''}
                        {p.connection === 'network' && p.host ? ` · ${p.host}` : ''}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {p.documents.map((d) => (
                          <Badge key={d} tone={p.defaultFor.includes(d) ? 'warning' : 'neutral'}>
                            {p.defaultFor.includes(d) && <Star className="h-3 w-3 fill-current" />}{tk(`doc.${d}`)}
                          </Badge>
                        ))}
                      </div>
                      {p.lastError && <p className="mt-1.5 text-xs text-danger-700">{p.lastError}</p>}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {needsPair || (p.connection === 'bluetooth' && canEdit) ? (
                      <Button size="sm" variant={needsPair ? 'primary' : 'outline'} leadingIcon={<Bluetooth />} onClick={() => void connect(p)} disabled={!bluetoothSupported()}>
                        {needsPair ? tk('connect') : tk('reconnect')}
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" leadingIcon={<PrinterIcon />} loading={busy === p.id} onClick={() => void test(p)} data-testid="printer-test">{tk('test')}</Button>
                    {canEdit && <Button size="sm" variant="ghost" leadingIcon={<Pencil />} onClick={() => setEditing(p)}>{tk('edit')}</Button>}
                    {canEdit && <Button size="sm" variant="ghost" leadingIcon={<Trash2 />} onClick={() => setRemoving(p)} aria-label={tk('remove')} />}
                  </div>
                </div>
              );
            })}
          </div>
          {!bluetoothSupported() && <p className="text-xs text-ink-500">{tk('noBluetooth')}</p>}
        </CardBody>
      </Card>

      {jobs.length > 0 && (
        <Card>
          <CardBody className="space-y-2">
            <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">{tk('queue')}</h2>
            <ul className="divide-y divide-ink-100 text-sm">
              {jobs.slice(0, 8).map((j) => (
                <li key={j.id} className="flex items-center justify-between py-1.5">
                  <span>{j.reference} · {tk(`doc.${j.document}`)} → {j.printerName}</span>
                  <span className="flex items-center gap-2 text-xs text-ink-500">{(j.bytes / 1024).toFixed(1)} KB<Badge tone={j.status === 'printed' ? 'success' : j.status === 'failed' ? 'danger' : 'info'}>{tk(`job.${j.status}`)}</Badge></span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <PrinterDialog
        open={editing !== null}
        printer={editing === 'new' ? null : editing}
        branchId={activeBranch?.id ?? null}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />
      <PrintPreview url={preview} onClose={() => setPreview(null)} />
      <ConfirmModal
        open={!!removing}
        title={tk('removeTitle', { name: removing?.name ?? '' })}
        description={tk('removeBody')}
        variant="danger"
        onConfirm={async () => {
          if (removing) await printerService.remove(removing.id);
          setRemoving(null);
          void load();
        }}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
