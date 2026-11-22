import { useCallback, useEffect, useState } from 'react';
import { Building2, Pencil, Plus, Smartphone, Users } from 'lucide-react';
import {
  Badge, Button, Card, CardBody, FormField, Input, PageHeader,
} from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { branchService } from '@/services/userService';
import { useDataVersion } from '@/services/dataVersion';
import type { BranchRow, SaveBranchBody } from '@/services/api';

/**
 * Branch maintenance.
 *
 * Creating a branch writes three rows — the branch, its settings, and access
 * for every owner — in one transaction. The screen shows staff and device
 * counts per branch because a branch nobody can select exists only on paper,
 * and that should be visible rather than discovered.
 */
export default function BranchesPage() {
  const { error: showError, success } = useToast();
  const version = useDataVersion('branches');

  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<BranchRow | 'new' | null>(null);

  const load = useCallback(async () => {
    try {
      setBranches(await branchService.manage());
    } catch (caught) {
      showError('Could not load branches', (caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    void load();
  }, [load, version]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Branches"
        description="Each branch carries its own VAT rate and stock rules."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Add branch
          </Button>
        }
      />

      {loading && <p className="py-8 text-center text-ink-400">Loading…</p>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {branches.map((branch) => (
          <Card key={branch.branchId}>
            <CardBody className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink-900">{branch.nameEn}</p>
                  <p className="truncate text-sm text-ink-500" dir="rtl">{branch.nameAr}</p>
                </div>
                <Badge tone={branch.isActive ? 'success' : 'neutral'}>
                  {branch.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              <dl className="space-y-1 text-sm">
                <Row label="Code" value={branch.code} mono />
                <Row
                  label="VAT"
                  value={branch.vatRatePercent === null
                    ? 'not set'
                    : `${branch.vatRatePercent}%${branch.pricesIncludeVat ? ' · included' : ' · added'}`}
                />
                <Row
                  label="Negative stock"
                  value={branch.allowNegativeStock ? 'Allowed' : 'Blocked'}
                />
              </dl>

              <div className="flex items-center gap-4 border-t border-ink-100 pt-3 text-xs text-ink-500">
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" aria-hidden />
                  {branch.staffCount} staff
                </span>
                <span className="flex items-center gap-1">
                  <Smartphone className="h-3.5 w-3.5" aria-hidden />
                  {branch.deviceCount} devices
                </span>
                {/* Nobody can select this branch. Worth saying rather than
                    leaving someone to wonder why it never appears. */}
                {branch.staffCount === 0 && (
                  <Badge tone="warning">No one assigned</Badge>
                )}
              </div>

              <Button variant="outline" size="sm" onClick={() => setEditing(branch)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            </CardBody>
          </Card>
        ))}
      </div>

      {editing && (
        <BranchEditor
          branch={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            success(message);
            setEditing(null);
          }}
          onError={(message) => showError('Could not save the branch', message)}
        />
      )}
    </div>
  );
}

function BranchEditor({
  branch, onClose, onSaved, onError,
}: {
  branch: BranchRow | null;
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState<SaveBranchBody>({
    code: branch?.code ?? '',
    nameAr: branch?.nameAr ?? '',
    nameEn: branch?.nameEn ?? '',
    phone: branch?.phone ?? '',
    addressAr: branch?.addressAr ?? '',
    addressEn: branch?.addressEn ?? '',
    isActive: branch?.isActive ?? true,
    vatRatePercent: branch?.vatRatePercent ?? 15,
    pricesIncludeVat: branch?.pricesIncludeVat ?? true,
    allowNegativeStock: branch?.allowNegativeStock ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const set = <K extends keyof SaveBranchBody>(key: K, value: SaveBranchBody[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const valid = form.code.trim() && form.nameAr.trim() && form.nameEn.trim();

  const save = async () => {
    setSaving(true);
    try {
      if (branch) {
        await branchService.update(branch.branchId, form);
        onSaved('Branch updated');
      } else {
        await branchService.create(form);
        onSaved('Branch created. Owners can select it now.');
      }
    } catch (caught) {
      onError((caught as Error).message);
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg bg-white"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-ink-200 px-6 py-4">
          <Building2 className="h-5 w-5 text-ink-400" aria-hidden />
          <h2 className="text-lg font-semibold">
            {branch ? `Edit ${branch.nameEn}` : 'New branch'}
          </h2>
        </div>

        {!confirming ? (
          <div className="grid flex-1 gap-4 overflow-auto p-6 sm:grid-cols-2">
            <FormField label="Code" required
                       hint="Prints on invoices and prefixes device ids. Keep it short.">
              <Input
                dir="ltr"
                value={form.code}
                onChange={(e) => set('code', e.target.value.toUpperCase())}
                placeholder="RYD"
              />
            </FormField>

            <FormField label="Phone" showOptional>
              <Input dir="ltr" value={form.phone ?? ''}
                     onChange={(e) => set('phone', e.target.value)} />
            </FormField>

            <FormField label="Name (English)" required>
              <Input value={form.nameEn} onChange={(e) => set('nameEn', e.target.value)} />
            </FormField>

            <FormField label="Name (Arabic)" required>
              <Input dir="rtl" value={form.nameAr}
                     onChange={(e) => set('nameAr', e.target.value)} />
            </FormField>

            <FormField label="Address (English)" showOptional>
              <Input value={form.addressEn ?? ''}
                     onChange={(e) => set('addressEn', e.target.value)} />
            </FormField>

            <FormField label="Address (Arabic)" showOptional>
              <Input dir="rtl" value={form.addressAr ?? ''}
                     onChange={(e) => set('addressAr', e.target.value)} />
            </FormField>

            <div className="sm:col-span-2 border-t border-ink-100 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                Settings
              </p>
            </div>

            <FormField label="VAT rate (%)"
                       hint="Saudi Arabia's standard rate is 15%.">
              <Input
                type="number" min="0" max="100" step="0.01" dir="ltr"
                value={form.vatRatePercent ?? 15}
                onChange={(e) => set('vatRatePercent', Number(e.target.value))}
              />
            </FormField>

            <div className="space-y-2 pt-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.pricesIncludeVat ?? true}
                       onChange={(e) => set('pricesIncludeVat', e.target.checked)} />
                Prices include VAT
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.allowNegativeStock ?? false}
                       onChange={(e) => set('allowNegativeStock', e.target.checked)} />
                Allow selling below zero stock
              </label>
              {branch && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.isActive ?? true}
                         onChange={(e) => set('isActive', e.target.checked)} />
                  Active
                </label>
              )}
            </div>
          </div>
        ) : (
          /* The confirmation shows what will actually happen, including the two
             rows a person would not think to expect. */
          <div className="flex-1 space-y-4 overflow-auto p-6">
            <p className="text-sm text-ink-700">
              {branch ? 'These changes will be saved:' : 'Creating this branch will:'}
            </p>

            <dl className="space-y-1 rounded-lg bg-ink-50 p-4 text-sm">
              <Row label="Code" value={form.code} mono />
              <Row label="Name" value={`${form.nameEn} / ${form.nameAr}`} />
              <Row label="VAT" value={`${form.vatRatePercent}% ${form.pricesIncludeVat ? 'included' : 'added'}`} />
              <Row label="Negative stock" value={form.allowNegativeStock ? 'Allowed' : 'Blocked'} />
            </dl>

            {!branch && (
              <ul className="list-disc space-y-1 ps-5 text-sm text-ink-600">
                <li>Create the branch and its settings together</li>
                <li>Give every active owner access, so it appears in their picker</li>
                <li>Give you access as well, whatever your role</li>
              </ul>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-ink-200 px-6 py-4">
          {confirming ? (
            <>
              <Button variant="outline" onClick={() => setConfirming(false)} disabled={saving}>
                Back
              </Button>
              <Button onClick={() => void save()} loading={saving}>
                {branch ? 'Save changes' : 'Create branch'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => setConfirming(true)} disabled={!valid}>
                Review
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className={mono ? 'font-mono text-xs' : ''}>{value}</dd>
    </div>
  );
}
