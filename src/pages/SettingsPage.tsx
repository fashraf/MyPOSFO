import { useCallback, useEffect, useState } from 'react';
import { CurrencyPanel } from '@/features/settings/CurrencyPanel';
import { Copy, Save } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  ConfirmModal,
  FormField,
  ImpactConfirm,
  LoadingState,
  PageHeader,
  SearchableSelect,
  Switch,
  Tabs,
} from '@/components/ui';
import { useSearchParams } from 'react-router-dom';
import { TaxSettingsPanel } from '@/features/settings/TaxSettingsPanel';
import { OrderRoutingPanel } from '@/features/settings/OrderRoutingPanel';
import { PrintersPanel } from '@/features/printing/PrintersPanel';
import { useSession } from '@/contexts/SessionContext';
import { useToast } from '@/contexts/ToastContext';
import { useI18n, useTranslation, type TranslationKey } from '@/i18n';
import { cn } from '@/lib/cn';
import { billTemplateService, safeCall, settingsService } from '@/services';
import type { BillTemplate } from '@/types/company';
import type {
  BranchSettings,
  DefaultCustomerMode,
  ServedByRequirement,
} from '@/types/settings';
import { ORDER_TYPES } from '@/types/settings';

/**
 * Settings, scoped to the active branch.
 *
 * Switching branch in the header switches what this page edits, which is why
 * the branch name is in the description rather than buried in a field — it has
 * to be impossible to configure the wrong shop by accident.
 */
export default function SettingsPage() {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { activeBranch, branches } = useSession();
  const toast = useToast();

  const [settings, setSettings] = useState<BranchSettings | null>(null);
  const [templates, setTemplates] = useState<BillTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copySource, setCopySource] = useState<string | null>(null);
  const [confirmingCopy, setConfirmingCopy] = useState(false);
  const [saved, setSaved] = useState<BranchSettings | null>(null);
  const [confirmingSave, setConfirmingSave] = useState(false);
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'general';

  const nameOf = <T extends { nameAr: string; nameEn: string }>(record: T) =>
    language === 'ar' ? record.nameAr : record.nameEn;

  const load = useCallback(async () => {
    if (!activeBranch) return;
    setLoading(true);

    const [settingsResult, templateResult] = await Promise.all([
      safeCall(() => settingsService.get(activeBranch.id)),
      safeCall(() => billTemplateService.list()),
    ]);

    if (settingsResult.ok) {
      setSettings(settingsResult.data);
      setSaved(settingsResult.data);
    }
    if (templateResult.ok) setTemplates(templateResult.data);
    setLoading(false);
  }, [activeBranch]);

  useEffect(() => {
    void load();
  }, [load]);

  function set<K extends keyof BranchSettings>(key: K, value: BranchSettings[K]) {
    setSettings((current) => (current ? { ...current, [key]: value } : current));
  }

  async function save() {
    if (!settings || !activeBranch) return;
    setSaving(true);

    const { branchId: _b, createdAt: _c, updatedAt: _u, ...input } = settings;
    const result = await safeCall(() => settingsService.update(activeBranch.id, input));
    setSaving(false);

    setConfirmingSave(false);
    if (result.ok) {
      setSettings(result.data);
      setSaved(result.data);
      toast.success(t('settings.toast.saved'));
    } else {
      toast.error(t('settings.toast.failed'), result.error.message);
    }
  }

  async function copy() {
    if (!copySource || !activeBranch) return;
    setSaving(true);

    const result = await safeCall(() => settingsService.copyFrom(copySource, activeBranch.id));
    setSaving(false);
    setConfirmingCopy(false);

    if (result.ok) {
      setSettings(result.data);
      toast.success(t('settings.toast.copied'));
    }
  }

  if (loading || !settings || !activeBranch) return <LoadingState className="py-20" />;

  const otherBranches = branches.filter((branch) => branch.id !== activeBranch.id);
  const dirty = JSON.stringify(saved) !== JSON.stringify(settings);

  /* Plain-language list of what saving will change, for the confirmation. */
  const changeList: string[] = [];
  if (saved) {
    const typeName = (x: string) => t(`kitchen.orderType.${x}` as TranslationKey);
    for (const type of ORDER_TYPES) {
      const wasOn = saved.enabledOrderTypes?.includes(type);
      const isOn = settings.enabledOrderTypes?.includes(type);
      if (wasOn !== isOn) changeList.push(isOn ? t('settings.changes.typeOn', { type: typeName(type) }) : t('settings.changes.typeOff', { type: typeName(type) }));
      const a = saved.kitchenRouting?.[type];
      const b = settings.kitchenRouting?.[type];
      if (isOn && a !== b) changeList.push(t(`settings.changes.route_${b}`, { type: typeName(type) }));
      const ta = saved.receiptTiming?.[type];
      const tb = settings.receiptTiming?.[type];
      if (isOn && ta !== tb && tb) changeList.push(t(`settings.changes.bill_${tb}` as TranslationKey, { type: typeName(type) }));
    }
    if (saved.defaultOrderType !== settings.defaultOrderType) changeList.push(t('settings.changes.defaultType', { type: typeName(settings.defaultOrderType) }));
    if (saved.allowNegativeStock !== settings.allowNegativeStock) changeList.push(settings.allowNegativeStock ? t('settings.changes.negativeOn') : t('settings.changes.negativeOff'));
    if (saved.servedBy !== settings.servedBy) changeList.push(t('settings.changes.servedBy', { value: t(`settings.fields.servedBy${settings.servedBy[0].toUpperCase()}${settings.servedBy.slice(1)}` as TranslationKey) }));
    if (saved.defaultCustomerMode !== settings.defaultCustomerMode) changeList.push(t('settings.changes.customerMode', { value: t(`settings.fields.${settings.defaultCustomerMode}`) }));
    if (saved.autoPrintCustomerBill !== settings.autoPrintCustomerBill || saved.autoPrintGroupTickets !== settings.autoPrintGroupTickets || saved.defaultBillTemplateId !== settings.defaultBillTemplateId) changeList.push(t('settings.changes.printing'));
    if (changeList.length) changeList.push(t('settings.changes.whenApplies'));
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('settings.title')}
        description={tab === 'tax' ? t('taxSettings.pageDescription') : t('settings.description', { branch: nameOf(activeBranch) })}
        actions={
          tab !== 'tax' && tab !== 'printers' && tab !== 'currency' && (
            <Button leadingIcon={<Save />} onClick={() => setConfirmingSave(true)} loading={saving} disabled={!dirty} data-testid="settings-save">
              {t('common.saveChanges')}
            </Button>
          )
        }
      />

      <Tabs
        value={tab}
        onChange={(v) => setParams(v === 'general' ? {} : { tab: v }, { replace: true })}
        items={[
          { value: 'general', label: t('settings.tabs.general') },
          { value: 'tax', label: t('settings.tabs.tax') },
          { value: 'orders', label: t('settings.tabs.orders') },
          { value: 'printers', label: t('settings.tabs.printers') },
          { value: 'currency', label: t('currencySymbol.tab') },
        ]}
      />

      {tab === 'tax' && <TaxSettingsPanel />}
      {tab === 'printers' && <PrintersPanel />}
      {tab === 'currency' && <CurrencyPanel />}

      {tab === 'orders' && (
        <>
          <Alert tone="info" compact>{t('settings.branchScoped')}</Alert>
          <OrderRoutingPanel settings={settings} onChange={(patch) => setSettings((c) => (c ? { ...c, ...patch } : c))} />
        </>
      )}

      {tab === 'general' && (
      <>
      <Alert tone="info" compact>
        {t('settings.branchScoped')}
      </Alert>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Checkout */}
        <Card>
          <CardBody className="space-y-3">
            <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
              {t('settings.sections.checkout')}
            </h2>

            <div className="space-y-1.5">
              <span className="text-sm font-medium text-ink-700">
                {t('settings.fields.defaultCustomerMode')}
              </span>
              <p className="text-xs text-ink-500">
                {t('settings.fields.defaultCustomerModeHelp')}
              </p>

              <div className="grid grid-cols-2 gap-2">
                {(['walkin', 'customer'] as DefaultCustomerMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => set('defaultCustomerMode', mode)}
                    className={cn(
                      'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                      settings.defaultCustomerMode === mode
                        ? 'border-brand-500 bg-brand-50/60 text-brand-800 ring-1 ring-brand-500/30'
                        : 'border-ink-200 text-ink-600 hover:border-ink-300',
                    )}
                  >
                    {t(`settings.fields.${mode}`)}
                  </button>
                ))}
              </div>
            </div>

            <FormField
              label={t('settings.fields.servedBy')}
              help={t('settings.fields.servedByHelp')}
            >
              <SearchableSelect
                size="sm"
                value={settings.servedBy}
                onChange={(value) => set('servedBy', (value ?? 'optional') as ServedByRequirement)}
                options={[
                  { value: 'off', label: t('settings.fields.servedByOff') },
                  { value: 'optional', label: t('settings.fields.servedByOptional') },
                  { value: 'required', label: t('settings.fields.servedByRequired') },
                ]}
              />
            </FormField>

            <div className="rounded-md border border-ink-200 px-3 py-2.5">
              <Switch
                checked={settings.allowNegativeStock}
                onCheckedChange={(checked) => set('allowNegativeStock', checked)}
                label={t('settings.fields.allowNegativeStock')}
                description={t('settings.fields.allowNegativeStockHelp')}
              />
            </div>
          </CardBody>
        </Card>

        {/* Receipts */}
        <Card>
          <CardBody className="space-y-3">
            <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
              {t('settings.sections.receipts')}
            </h2>

            <FormField
              label={t('settings.fields.defaultBill')}
              help={t('settings.fields.defaultBillHelp')}
            >
              <SearchableSelect
                size="sm"
                value={settings.defaultBillTemplateId}
                onChange={(value) => set('defaultBillTemplateId', value)}
                options={templates
                  .filter((template) => template.audience === 'customer')
                  .map((template) => ({ value: template.id, label: template.name }))}
                isClearable
              />
            </FormField>

            <div className="space-y-2">
              <div className="rounded-md border border-ink-200 px-3 py-2.5">
                <Switch
                  checked={settings.autoPrintCustomerBill}
                  onCheckedChange={(checked) => set('autoPrintCustomerBill', checked)}
                  label={t('settings.fields.autoPrintCustomer')}
                />
              </div>
              <div className="rounded-md border border-ink-200 px-3 py-2.5">
                <Switch
                  checked={settings.autoPrintGroupTickets}
                  onCheckedChange={(checked) => set('autoPrintGroupTickets', checked)}
                  label={t('settings.fields.autoPrintGroups')}
                  description={t('settings.fields.autoPrintHint')}
                />
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Tax moved to its own tab: one setup for the business. */}
        <Card>
          <CardBody className="space-y-2">
            <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">{t('settings.sections.money')}</h2>
            <p className="text-sm text-ink-600">{t('taxSettings.movedHint')}</p>
            <Button variant="outline" size="sm" onClick={() => setParams({ tab: 'tax' })}>{t('taxSettings.open')}</Button>
          </CardBody>
        </Card>

        {/* Copy from another branch */}
        {otherBranches.length > 0 && (
          <Card>
            <CardBody className="space-y-3">
              <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-400">
                {t('settings.copyFrom')}
              </h2>
              <p className="text-xs text-ink-500">{t('settings.copyFromHint')}</p>

              <div className="flex items-end gap-2">
                <SearchableSelect
                  size="sm"
                  className="flex-1"
                  value={copySource}
                  onChange={setCopySource}
                  options={otherBranches.map((branch) => ({
                    value: branch.id,
                    label: nameOf(branch),
                    description: branch.code,
                  }))}
                  placeholder={t('settings.copyFrom')}
                />
                <Button
                  variant="outline"
                  size="sm"
                  leadingIcon={<Copy />}
                  disabled={!copySource}
                  onClick={() => setConfirmingCopy(true)}
                >
                  {t('common.confirm')}
                </Button>
              </div>
            </CardBody>
          </Card>
        )}
      </div>
      </>
      )}

      <ImpactConfirm
        open={confirmingSave}
        title={t('settings.confirmSaveTitle')}
        description={t('settings.confirmSaveBody', { branch: nameOf(activeBranch) })}
        effects={changeList.length ? changeList : [t('settings.noChanges')]}
        confirmLabel={t('common.saveChanges')}
        loading={saving}
        onConfirm={save}
        onCancel={() => setConfirmingSave(false)}
      />

      <ConfirmModal
        open={confirmingCopy}
        title={t('settings.copyConfirmTitle')}
        description={t('settings.copyConfirmDescription', {
          branch: copySource
            ? nameOf(branches.find((branch) => branch.id === copySource)!)
            : '—',
        })}
        variant="warning"
        loading={saving}
        onConfirm={copy}
        onCancel={() => setConfirmingCopy(false)}
      />
    </div>
  );
}
