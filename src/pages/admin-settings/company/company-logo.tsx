/* The company's own logo, on the company screen.
 *
 * An admin looking at "Company & Locations" expects the company's identity to
 * live here alongside its name and address, so this is where the control sits.
 *
 * What it does not do yet is put that logo in the app. The bar at the top of
 * the console renders a bundled asset — `assets/images/ucaas-logo.png`, a plain
 * import in `components/custom/header` — and there is no company-logo field on
 * the company record or endpoint to store one against. So the picture chosen
 * here is kept for this browser and nothing else reads it.
 *
 * The note under the control says exactly that rather than the reverse. A card
 * that implies every colleague now sees a new logo, when the header cannot read
 * it, sends an admin looking for a bug that is really a missing backend.
 */

import { useEffect, useMemo, useState } from 'react';
import { Image as ImageIcon, Trash2, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';

/* Kept per company so switching accounts does not show the wrong mark. */
const storageKey = (companyUuid: string) => `company-logo-${companyUuid || 'default'}`;

const MAX_BYTES = 512 * 1024;

const CompanyLogo = ({ companyInfo }: { companyInfo?: any }) => {
  const companyUuid = companyInfo?.uuid || '';
  const companyName = companyInfo?.company_name || 'This company';
  const [logo, setLogo] = useState<string>('');
  const [error, setError] = useState('');

  const key = useMemo(() => storageKey(companyUuid), [companyUuid]);

  useEffect(() => {
    try {
      setLogo(localStorage.getItem(key) || '');
    } catch {
      /* A blocked store only costs the preview, not the screen. */
      setLogo('');
    }
  }, [key]);

  const handleFile = (file?: File | null) => {
    if (!file) return;
    setError('');

    if (!file.type.startsWith('image/')) {
      setError('That file is not an image. Choose a PNG.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('That file is larger than 512 KB. The logo is shown small, so it can be smaller.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || '');
      setLogo(value);
      try {
        localStorage.setItem(key, value);
      } catch {
        setError('The picture is shown here but could not be kept for next time.');
      }
    };
    reader.onerror = () => setError('That file could not be read.');
    reader.readAsDataURL(file);
  };

  const handleRemove = () => {
    setLogo('');
    setError('');
    try {
      localStorage.removeItem(key);
    } catch {
      /* Nothing to undo if the store is unavailable. */
    }
  };

  return (
    <div className="rounded-xl border border-[rgba(225,200,165,0.9)] bg-[rgba(251,249,246,0.88)] p-4 backdrop-blur-[12px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-base font-semibold text-[#2E2D35]">Company logo</p>
            <span className="rounded-full bg-[#EAF6F0] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[#2F7A5B] uppercase">
              {logo ? 'Set' : 'Not set'}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[#9A948F]">
            The mark that stands for {companyName} on this screen.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 rounded-lg border border-[#EEE7DD] p-3">
        <div className="flex h-[70px] w-[130px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-[#DCD3C6] bg-white/70">
          {logo ? (
            <img src={logo} alt="Company logo" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-[#9A948F]">
              <ImageIcon className="h-3.5 w-3.5" />
              No logo yet
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/png,image/svg+xml,image/jpeg"
                className="hidden"
                onChange={(event) => {
                  handleFile(event.target.files?.[0]);
                  /* Cleared so choosing the same file twice still fires. */
                  event.target.value = '';
                }}
              />
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCD3C6] bg-white px-3 py-1.5 text-sm font-medium text-[#2E2D35] transition-colors hover:border-primary hover:text-primary">
                <Upload className="h-3.5 w-3.5" />
                {logo ? 'Replace' : 'Upload'}
              </span>
            </label>

            {logo && (
              <Button type="button" variant="outline" size="sm" onClick={handleRemove}>
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </Button>
            )}
          </div>

          <p className="mt-2 text-xs text-[#9A948F]">
            A PNG, so the background stays transparent. It is shown small, so it does not need to be
            a large file — under 512&nbsp;KB.
          </p>
        </div>
      </div>

      {error && (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </p>
      )}

      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-[#2E2D35]">
        This preview is kept in this browser only. The logo in the top bar is part of the app build,
        and there is no company-logo field on the company record yet, so what you choose here is not
        yet shown to anyone else.
      </p>
    </div>
  );
};

export default CompanyLogo;
