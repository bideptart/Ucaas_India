import { useEffect, useState } from 'react';
import { Pencil, Trash2, Plus, Search, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { AssistantSwitcher, useSelectedAssistant } from './assistant-switcher';

const CAPTAIN_API_BASE = '/captain-api/api/captain';

type Scenario = {
  id: string;
  assistant_id: string;
  name: string;
  description: string;
  /* What the visitor says that should put the assistant into this scenario. */
  triggers: string[];
  /* How the assistant should behave once it is in it. */
  instruction: string;
  status: 'active' | 'draft';
  created_at: string;
};

type Form = {
  name: string;
  description: string;
  triggers: string;
  instruction: string;
  status: 'active' | 'draft';
};

const emptyForm: Form = {
  name: '',
  description: '',
  triggers: '',
  instruction: '',
  status: 'active',
};

const textAreaClass =
  'w-full resize-none rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-700 shadow-sm outline-none transition-all placeholder:text-gray-400 hover:border-primary focus:border-primary focus:ring-4 focus:ring-primary/10';
const selectClass =
  'min-h-10 rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-700 shadow-sm outline-none transition-all hover:border-primary focus:border-primary focus:ring-4 focus:ring-primary/10';

/** Triggers are edited as one line each and stored as a list. */
const parseTriggers = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const CaptainScenarios = () => {
  const { assistants, selectedId, selectAssistant } = useSelectedAssistant();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchScenarios = async (assistantId: string, searchTerm = '') => {
    if (!assistantId) return;
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ assistant_id: assistantId });
      if (searchTerm) params.set('search', searchTerm);
      const res = await fetch(`${CAPTAIN_API_BASE}/scenarios?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Failed to load scenarios');
      setScenarios(json.data || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load scenarios');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedId) return;
    const timer = setTimeout(() => fetchScenarios(selectedId, search), 300);
    return () => clearTimeout(timer);
  }, [search, selectedId]);

  const openCreateModal = () => {
    setEditingId(null);
    setForm(emptyForm);
    setIsModalOpen(true);
  };

  const openEditModal = (scenario: Scenario) => {
    setEditingId(scenario.id);
    setForm({
      name: scenario.name,
      description: scenario.description || '',
      triggers: (scenario.triggers || []).join('\n'),
      instruction: scenario.instruction || '',
      status: scenario.status,
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.instruction.trim()) return;
    setIsSaving(true);
    setError('');
    const payload = { ...form, triggers: parseTriggers(form.triggers) };
    try {
      if (editingId) {
        const res = await fetch(`${CAPTAIN_API_BASE}/scenarios/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json())?.message || 'Failed to update scenario');
      } else {
        const res = await fetch(`${CAPTAIN_API_BASE}/scenarios`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, assistant_id: selectedId }),
        });
        if (!res.ok) throw new Error((await res.json())?.message || 'Failed to create scenario');
      }
      setIsModalOpen(false);
      fetchScenarios(selectedId, search);
    } catch (err: any) {
      setError(err?.message || 'Failed to save scenario');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this scenario? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`${CAPTAIN_API_BASE}/scenarios/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error('Failed to delete scenario');
      setScenarios((prev) => prev.filter((s) => s.id !== id));
    } catch (err: any) {
      setError(err?.message || 'Failed to delete scenario');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex h-full w-full flex-col gap-5 p-6">
      <div className="flex items-center justify-between gap-3">
        <AssistantSwitcher
          assistants={assistants}
          selectedId={selectedId}
          onSelect={selectAssistant}
          pageTitle="Scenarios"
        />
        <Button type="button" variant="primary" onClick={openCreateModal} disabled={!selectedId}>
          <Plus className="size-4" />
          Add Scenario
        </Button>
      </div>

      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search scenarios..."
          className="pl-9"
        />
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto rounded-2xl border border-gray-200 bg-white">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-sm text-gray-500">
            Loading...
          </div>
        ) : scenarios.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
            <GitBranch className="size-6 text-gray-300" />
            <div className="text-sm font-medium text-gray-700">No scenarios yet</div>
            <div className="text-xs text-gray-500">
              Click "Add Scenario" to describe a situation the assistant should handle.
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {scenarios.map((scenario) => (
              <div
                key={scenario.id}
                className="flex items-start justify-between gap-4 px-5 py-4 transition-colors hover:bg-gray-50"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-gray-950">{scenario.name}</div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        scenario.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {scenario.status}
                    </span>
                  </div>
                  {scenario.description && (
                    <div className="mt-1 text-sm text-gray-600">{scenario.description}</div>
                  )}
                  {(scenario.triggers || []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {scenario.triggers.map((trigger) => (
                        <span
                          key={trigger}
                          className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600"
                        >
                          {trigger}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openEditModal(scenario)}
                  >
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="destructiveOutline"
                    size="sm"
                    disabled={deletingId === scenario.id}
                    onClick={() => handleDelete(scenario.id)}
                  >
                    <Trash2 className="size-3.5" />
                    {deletingId === scenario.id ? 'Deleting...' : 'Delete'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="w-full max-w-lg rounded-2xl p-6">
          <DialogTitle className="text-base font-bold text-gray-950">
            {editingId ? 'Edit Scenario' : 'Add Scenario'}
          </DialogTitle>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Refund request"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Description</Label>
              <Input
                type="text"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="e.g. Visitor is asking for money back on a recent invoice."
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Triggers</Label>
              <textarea
                value={form.triggers}
                onChange={(e) => setForm((f) => ({ ...f, triggers: e.target.value }))}
                rows={3}
                className={textAreaClass}
                placeholder={'One phrase per line\ne.g. I want a refund\ncancel my plan'}
              />
              <div className="text-xs text-gray-500">One phrase per line.</div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Instruction</Label>
              <textarea
                value={form.instruction}
                onChange={(e) => setForm((f) => ({ ...f, instruction: e.target.value }))}
                rows={4}
                className={textAreaClass}
                placeholder="e.g. Check the invoice date, then hand over to a human if it is inside 30 days."
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as 'active' | 'draft' }))
                }
                className={selectClass}
              >
                <option value="active">Active</option>
                <option value="draft">Draft</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={isSaving || !form.name.trim() || !form.instruction.trim()}
              onClick={handleSave}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CaptainScenarios;
