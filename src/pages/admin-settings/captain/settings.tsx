import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AssistantSwitcher, useSelectedAssistant } from './assistant-switcher';

const CAPTAIN_API_BASE = '/captain-api/api/captain';

type Settings = {
  assistant_id: string;
  /* Reply behaviour */
  auto_reply: boolean;
  reply_delay_seconds: number;
  language: string;
  /* Handover to a person */
  handoff_enabled: boolean;
  handoff_after_failures: number;
  handoff_email: string;
  /* Office hours — outside them the widget collects a message instead */
  office_hours_enabled: boolean;
  office_hours_start: string;
  office_hours_end: string;
  away_message: string;
  /* Retention */
  transcript_retention_days: number;
  collect_visitor_email: boolean;
};

const textAreaClass =
  'w-full resize-none rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-700 shadow-sm outline-none transition-all placeholder:text-gray-400 hover:border-primary focus:border-primary focus:ring-4 focus:ring-primary/10';
const selectClass =
  'min-h-10 rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-700 shadow-sm outline-none transition-all hover:border-primary focus:border-primary focus:ring-4 focus:ring-primary/10';

const Section = ({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) => (
  <div className="rounded-2xl border border-gray-200 bg-white p-5">
    <div className="text-sm font-semibold text-gray-950">{title}</div>
    <div className="mt-0.5 text-xs text-gray-500">{description}</div>
    <div className="mt-4 flex flex-col gap-4">{children}</div>
  </div>
);

const ToggleRow = ({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) => (
  <div className="flex items-start justify-between gap-4">
    <div>
      <div className="text-sm font-medium text-gray-800">{label}</div>
      <div className="text-xs text-gray-500">{hint}</div>
    </div>
    <Switch checked={checked} onCheckedChange={onChange} />
  </div>
);

const CaptainSettings = () => {
  const { assistants, selectedId, selectAssistant } = useSelectedAssistant();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState('');

  const fetchSettings = async (assistantId: string) => {
    if (!assistantId) return;
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch(`${CAPTAIN_API_BASE}/settings?assistant_id=${assistantId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Failed to load settings');
      setSettings(json.data || null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedId) return;
    fetchSettings(selectedId);
  }, [selectedId]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));

  const handleSave = async () => {
    if (!settings) return;
    setIsSaving(true);
    setError('');
    setSavedAt('');
    try {
      const res = await fetch(`${CAPTAIN_API_BASE}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, assistant_id: selectedId }),
      });
      if (!res.ok) throw new Error((await res.json())?.message || 'Failed to save settings');
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err: any) {
      setError(err?.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col gap-5 p-6">
      <div className="flex items-center justify-between gap-3">
        <AssistantSwitcher
          assistants={assistants}
          selectedId={selectedId}
          onSelect={selectAssistant}
          pageTitle="Settings"
        />
        <div className="flex items-center gap-3">
          {savedAt && <span className="text-xs text-gray-500">Saved at {savedAt}</span>}
          <Button
            type="button"
            variant="primary"
            onClick={handleSave}
            disabled={isSaving || isLoading || !settings}
          >
            {isSaving ? 'Saving...' : 'Save changes'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">
          {error}
        </div>
      )}

      {isLoading || !settings ? (
        <div className="flex h-40 items-center justify-center rounded-2xl border border-gray-200 bg-white text-sm text-gray-500">
          Loading...
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Section
              title="Replies"
              description="How the assistant answers before anyone is involved."
            >
              <ToggleRow
                label="Answer automatically"
                hint="Off means every conversation waits for a person."
                checked={settings.auto_reply}
                onChange={(v) => set('auto_reply', v)}
              />
              <div className="flex flex-col gap-1.5">
                <Label>Reply delay (seconds)</Label>
                <Input
                  type="number"
                  min={0}
                  value={settings.reply_delay_seconds}
                  onChange={(e) => set('reply_delay_seconds', Number(e.target.value))}
                />
                <div className="text-xs text-gray-500">
                  A short pause reads as more considered than an instant reply.
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Language</Label>
                <select
                  value={settings.language}
                  onChange={(e) => set('language', e.target.value)}
                  className={selectClass}
                >
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                  <option value="auto">Match the visitor</option>
                </select>
              </div>
            </Section>

            <Section
              title="Handover"
              description="When the assistant should stop and fetch a person."
            >
              <ToggleRow
                label="Hand over to a person"
                hint="Off means the assistant never escalates."
                checked={settings.handoff_enabled}
                onChange={(v) => set('handoff_enabled', v)}
              />
              <div className="flex flex-col gap-1.5">
                <Label>Hand over after failed answers</Label>
                <Input
                  type="number"
                  min={1}
                  value={settings.handoff_after_failures}
                  onChange={(e) => set('handoff_after_failures', Number(e.target.value))}
                  disabled={!settings.handoff_enabled}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Notify</Label>
                <Input
                  type="text"
                  value={settings.handoff_email}
                  onChange={(e) => set('handoff_email', e.target.value)}
                  placeholder="support@example.com"
                  disabled={!settings.handoff_enabled}
                />
              </div>
            </Section>

            <Section
              title="Office hours"
              description="Outside these hours the widget takes a message instead of answering."
            >
              <ToggleRow
                label="Use office hours"
                hint="Off means the assistant answers around the clock."
                checked={settings.office_hours_enabled}
                onChange={(v) => set('office_hours_enabled', v)}
              />
              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label>Opens</Label>
                  <Input
                    type="time"
                    value={settings.office_hours_start}
                    onChange={(e) => set('office_hours_start', e.target.value)}
                    disabled={!settings.office_hours_enabled}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label>Closes</Label>
                  <Input
                    type="time"
                    value={settings.office_hours_end}
                    onChange={(e) => set('office_hours_end', e.target.value)}
                    disabled={!settings.office_hours_enabled}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Away message</Label>
                <textarea
                  value={settings.away_message}
                  onChange={(e) => set('away_message', e.target.value)}
                  rows={3}
                  className={textAreaClass}
                  disabled={!settings.office_hours_enabled}
                />
              </div>
            </Section>

            <Section
              title="Visitor data"
              description="What the widget keeps, and for how long."
            >
              <ToggleRow
                label="Ask for an email address"
                hint="Needed before the assistant can look anything up about the visitor."
                checked={settings.collect_visitor_email}
                onChange={(v) => set('collect_visitor_email', v)}
              />
              <div className="flex flex-col gap-1.5">
                <Label>Keep transcripts for (days)</Label>
                <Input
                  type="number"
                  min={1}
                  value={settings.transcript_retention_days}
                  onChange={(e) => set('transcript_retention_days', Number(e.target.value))}
                />
                <div className="text-xs text-gray-500">
                  Transcripts are deleted once they pass this age.
                </div>
              </div>
            </Section>
          </div>
        </div>
      )}
    </div>
  );
};

export default CaptainSettings;
