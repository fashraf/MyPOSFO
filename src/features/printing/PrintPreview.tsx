import { SizedDialog } from '@/components/ui';
import { useTranslation } from '@/i18n';

/** What the "Screen preview" printer printed, at paper scale. */
export function PrintPreview({ url, onClose }: { url: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <SizedDialog open={!!url} onClose={onClose} size={50} title={t('printers.previewTitle')}>
      {url && (
        <div className="flex justify-center bg-ink-100 p-4" data-testid="print-preview">
          <img src={url} alt={t('printers.previewTitle')} className="w-[300px] max-w-full bg-white shadow-md" />
        </div>
      )}
    </SizedDialog>
  );
}
