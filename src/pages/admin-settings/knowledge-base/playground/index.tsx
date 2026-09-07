import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { handleAlert } from '@/lib/utils';
import { getChatAgentList, getAIReceptionistList } from '@/services/api';
import { MessageSquare, Phone, Search, Activity, Zap, Sparkles, Check } from 'lucide-react';
import Loader from '@/components/custom/loader';
import CustomAvatar from '@/components/custom/custom-avatar';
import { useLocation, useNavigate } from 'react-router-dom';
import { getAi360WidgetKey, getChatWidgetScriptSrc } from '../ai-agent/chat-agent-configure-modal';
import { isDemoMode } from '@/lib/demo-mode';
import PlaygroundDemoPreview from './demo-preview';

const EMBED_SCRIPT_ID = 'ai-agent-test-embed-script';
const CHAT_WIDGET_MAX_WIDTH = 423;
const CHAT_WIDGET_MAX_HEIGHT = 600;
const CALL_WIDGET_MAX_WIDTH = 360;
const CALL_WIDGET_MAX_HEIGHT = 580;
const CHAT_WIDGET_VIEWPORT_GAP = 8;

/* The same warm-glass gradient Directory ▸ People uses (people-glass.css) so
   the floating white header card actually reads as "floating" — without a
   saturated backdrop behind it, a white card on the AdminHub shell's own
   near-white background has almost no contrast to float against. */
const AI_TOOLS_PAGE_GRADIENT = [
  'radial-gradient(1000px 750px at 4% -6%, rgba(255, 154, 66, 0.55), transparent 58%)',
  'radial-gradient(900px 700px at 102% -4%, rgba(255, 120, 40, 0.42), transparent 55%)',
  'radial-gradient(950px 700px at 50% 118%, rgba(255, 190, 120, 0.45), transparent 60%)',
  'radial-gradient(650px 500px at 100% 100%, rgba(255, 150, 70, 0.3), transparent 55%)',
  'linear-gradient(160deg, #fffaf3 0%, #ffe6c7 100%)',
].join(', ');

const sanitizeWidgetKey = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '');

/* `agent_uuid || id` alone left every row without one of those two fields
   resolving to the same `undefined`, and once any agent was selected every
   other row's `undefined === undefined` compare read as "also selected" —
   the whole list lit up together instead of just the one row. Matches the
   same broader fallback chain `getAgentId` uses on the Chat Agents list
   page, since these rows come from the same APIs. */
const getAgentRowId = (agent: any): string =>
  String(agent?.agent_uuid || agent?.agentId || agent?.id || agent?.uuid || agent?._id || '');

const unloadEmbedScript = () => {
  document
    .querySelectorAll(`script#${EMBED_SCRIPT_ID}, script[data-playground-widget-script="true"]`)
    .forEach((script) => script.remove());

  ['agent-chat-widget', 'agent-talk-widget'].forEach((id) => {
    const iframe = document.getElementById(id);
    if (iframe) iframe.remove();
  });

  const widgetRoot = document.getElementById('ai-chat-widget-root');
  if (widgetRoot) widgetRoot.innerHTML = '';
  document
    .querySelectorAll(
      '[data-ai-widget], [id^="ai-widget"], [id^="mcm-widget"], [id^="ai360-widget-"]',
    )
    .forEach((el) => el.remove());
};

// function StatCard({ label, value }: { label: string; value: string | number }) {
//   return (
//     <div className="min-h-[76px] rounded-lg border border-[rgba(225,200,165,0.9)] bg-[rgba(251,249,246,0.88)] backdrop-blur-[12px] px-5 py-4 shadow-[0_12px_28px_-6px_rgba(194,98,46,0.22),0_2px_8px_rgba(194,98,46,0.12)]">
//       <p className="text-sm text-slate-500">{label}</p>
//       <p className="mt-1 text-2xl font-bold leading-7 text-[#2E2D35]">{value}</p>
//     </div>
//   );
// }

function Playground() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialState = location.state as any;
  const [activeTab, setActiveTab] = useState<'chat' | 'voice'>(
    initialState?.activeTab === 'chat' ? 'chat' : 'voice',
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<any>(initialState?.selectedAgent || null);
  const [activeEmbedId, setActiveEmbedId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, height: 0 });

  const embedLoadingRef = useRef(false);
  const embedRequestIdRef = useRef(0);
  const widgetOpenTimerRef = useRef<number | null>(null);
  const activeWidgetIdRef = useRef('');

  const invalidateEmbedRequest = useCallback(() => {
    embedRequestIdRef.current += 1;
    embedLoadingRef.current = false;
    if (widgetOpenTimerRef.current !== null) {
      window.clearTimeout(widgetOpenTimerRef.current);
      widgetOpenTimerRef.current = null;
    }
    unloadEmbedScript();
    setActiveEmbedId(null);
  }, []);

  const widgetFrame = useMemo(() => {
    const viewportWidth =
      typeof window === 'undefined' ? coords.left + coords.width : window.innerWidth;
    const viewportHeight =
      typeof window === 'undefined' ? coords.top + coords.height : window.innerHeight;
    const maxWidgetWidth = activeTab === 'voice' ? CALL_WIDGET_MAX_WIDTH : CHAT_WIDGET_MAX_WIDTH;
    const maxWidgetHeight = activeTab === 'voice' ? CALL_WIDGET_MAX_HEIGHT : CHAT_WIDGET_MAX_HEIGHT;
    const panelGap = coords.width <= maxWidgetWidth + 24 ? 8 : 16;
    const panelWidth = Math.max(0, coords.width - panelGap * 2);
    const viewportWidthLimit = Math.max(0, viewportWidth - CHAT_WIDGET_VIEWPORT_GAP * 2);
    const width = Math.min(maxWidgetWidth, panelWidth, viewportWidthLimit);
    const viewportHeightLimit = Math.max(0, viewportHeight - coords.top - CHAT_WIDGET_VIEWPORT_GAP);
    const height = Math.min(maxWidgetHeight, Math.max(0, coords.height), viewportHeightLimit);
    const centeredLeft = coords.left + (coords.width - width) / 2;
    const maxLeft = viewportWidth - width - CHAT_WIDGET_VIEWPORT_GAP;
    const left = Math.max(CHAT_WIDGET_VIEWPORT_GAP, Math.min(centeredLeft, maxLeft));
    const centeredTop = coords.top + Math.max(0, (coords.height - height) / 2);
    const maxTop = viewportHeight - height - CHAT_WIDGET_VIEWPORT_GAP;
    const top = Math.max(CHAT_WIDGET_VIEWPORT_GAP, Math.min(centeredTop, maxTop));

    return { top, left, width, height };
  }, [activeTab, coords]);

  // Query chatbot agents
  const { data: chatAgents = [], isLoading: isChatLoading } = useQuery({
    queryKey: ['getChatAgentList', 'playground-list'],
    queryFn: () => getChatAgentList({ page: 1, limit: 1000, filters: [], search: '' }),
    select: (data: any) => data?.data?.data?.result?.rows || [],
  });

  // Query receptionist agents
  const { data: receptionistAgents = [], isLoading: isReceptionistLoading } = useQuery({
    queryKey: ['getAIReceptionistList', 'playground-list'],
    queryFn: () => getAIReceptionistList({ page: 1, limit: 1000, filters: [], search: '' }),
    select: (data: any) => data?.data?.data?.result?.rows || [],
  });

  // Monitor bounding rect of middle container for absolute/fixed iframe positioning
  useEffect(() => {
    if (!selectedAgent || !containerRef.current) return;

    const updateCoords = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setCoords({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
      }
    };

    updateCoords();

    const resizeObserver = new ResizeObserver(() => {
      updateCoords();
    });
    resizeObserver.observe(containerRef.current);

    window.addEventListener('resize', updateCoords);
    window.addEventListener('scroll', updateCoords);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords);
    };
  }, [selectedAgent, activeTab]);

  // Cleanup embed script on unmount
  useEffect(() => {
    return () => {
      embedRequestIdRef.current += 1;
      if (widgetOpenTimerRef.current !== null) {
        window.clearTimeout(widgetOpenTimerRef.current);
      }
      unloadEmbedScript();
    };
  }, []);

  // Sync selected agent when tab changes
  useEffect(() => {
    setSelectedAgent(null);
    invalidateEmbedRequest();
  }, [activeTab, invalidateEmbedRequest]);

  useEffect(() => {
    if (!initialState?.selectedAgent) return;
    setSelectedAgent(initialState.selectedAgent);
    setActiveTab(initialState.activeTab === 'chat' ? 'chat' : 'voice');
  }, [initialState?.activeTab, initialState?.selectedAgent]);

  const handleLoadAgentWidget = useCallback(
    (rowData: any) => {
      const rowId = rowData?.agent_uuid || rowData?.id;
      const mode = activeTab === 'voice' ? 'call' : 'chat';

      /* Demo mode has no widget host to fetch from, so asking for one only
         produced "AI widget URL is missing." and left the panel spinning on a
         script that was never going to arrive. The sandbox renders instead. */
      if (isDemoMode()) {
        setActiveEmbedId(rowId);
        return;
      }
      const widgetKey = getAi360WidgetKey(rowData);
      const widgetScriptSrc = getChatWidgetScriptSrc();

      invalidateEmbedRequest();
      const requestId = embedRequestIdRef.current;

      if (!widgetKey) {
        handleAlert({ text: 'Widget key is missing for this agent.', type: 'error' });
        return;
      }

      if (!widgetScriptSrc) {
        handleAlert({ text: 'AI widget URL is missing.', type: 'error' });
        return;
      }

      embedLoadingRef.current = true;

      try {
        const script = document.createElement('script');
        script.id = EMBED_SCRIPT_ID;
        script.src = widgetScriptSrc;
        script.setAttribute('data-playground-widget-script', 'true');
        script.setAttribute('data-widget-mode', mode);
        script.setAttribute('data-widget-key', widgetKey);
        script.setAttribute('data-position', 'bottom-right');
        script.setAttribute('data-label', 'Need Help?');
        script.async = true;
        script.type = 'text/javascript';
        script.onload = () => {
          script.remove();
          if (requestId !== embedRequestIdRef.current) return;

          widgetOpenTimerRef.current = window.setTimeout(() => {
            widgetOpenTimerRef.current = null;
            if (requestId !== embedRequestIdRef.current) return;

            const widgetId = `ai360-widget-${mode}-${sanitizeWidgetKey(widgetKey)}`;
            document.getElementById(widgetId)?.querySelector('button')?.click();
            embedLoadingRef.current = false;
            setActiveEmbedId(rowId);
          }, 0);
        };
        script.onerror = () => {
          script.remove();
          if (requestId !== embedRequestIdRef.current) return;

          embedLoadingRef.current = false;
          unloadEmbedScript();
          setActiveEmbedId(null);
          handleAlert({
            text: `Failed to load ${mode === 'call' ? 'call' : 'chat'} widget. Please try again.`,
            type: 'error',
          });
        };

        document.body.appendChild(script);
      } catch (err) {
        if (requestId !== embedRequestIdRef.current) return;

        embedLoadingRef.current = false;
        console.error('Failed to load embed script:', err);
        handleAlert({
          text: `Failed to load ${mode === 'call' ? 'call' : 'chat'} widget. Please try again.`,
          type: 'error',
        });
        unloadEmbedScript();
      }
    },
    [activeTab, invalidateEmbedRequest],
  );

  const handleSelectAgent = (agent: any) => {
    invalidateEmbedRequest();
    setSelectedAgent(agent);
  };

  useEffect(() => {
    if (!selectedAgent) return;
    const rowId = getAgentRowId(selectedAgent);
    if (activeEmbedId === rowId || embedLoadingRef.current) return;
    const timer = window.setTimeout(() => {
      handleLoadAgentWidget(selectedAgent);
    }, 50);
    return () => window.clearTimeout(timer);
  }, [activeEmbedId, handleLoadAgentWidget, selectedAgent]);

  const currentAgentsList = useMemo(() => {
    return activeTab === 'chat' ? chatAgents : receptionistAgents;
  }, [activeTab, chatAgents, receptionistAgents]);

  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) return currentAgentsList;
    return currentAgentsList.filter((agent: any) =>
      String(agent?.agentName || '')
        .toLowerCase()
        .includes(searchQuery.toLowerCase()),
    );
  }, [currentAgentsList, searchQuery]);

  const totalAgentsCount = chatAgents.length + receptionistAgents.length;
  const isPageLoading = isChatLoading || isReceptionistLoading;

  const isWidgetActive = useMemo(() => {
    if (!selectedAgent) return false;
    const rowId = getAgentRowId(selectedAgent);
    return activeEmbedId === rowId;
  }, [selectedAgent, activeEmbedId]);

  const activeWidgetMode = activeTab === 'voice' ? 'call' : 'chat';
  const activeWidgetKey = selectedAgent ? getAi360WidgetKey(selectedAgent) : '';
  const activeWidgetId = activeWidgetKey
    ? `ai360-widget-${activeWidgetMode}-${sanitizeWidgetKey(activeWidgetKey)}`
    : '';
  activeWidgetIdRef.current = activeWidgetId;

  useEffect(() => {
    const removeInactiveWidgetRoots = () => {
      document
        .querySelectorAll<HTMLElement>(
          'body > [data-ai-widget], body > [id^="ai-widget"], body > [id^="mcm-widget"], body > [id^="ai360-widget-"]',
        )
        .forEach((element) => {
          if (!activeWidgetIdRef.current || element.id !== activeWidgetIdRef.current) {
            element.remove();
          }
        });
    };

    removeInactiveWidgetRoots();
    const observer = new MutationObserver(removeInactiveWidgetRoots);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return (
    <section
      className="flex h-full min-h-0 w-full flex-col overflow-auto text-[#07142f]"
      style={{ background: AI_TOOLS_PAGE_GRADIENT }}
    >
      {/* Dynamic Style Override to position AI360 widget in Middle Panel */}
      {selectedAgent && activeWidgetId && (
        <style>{`
          body > [data-ai-widget],
          body > [id^="ai-widget"],
          body > [id^="mcm-widget"],
          body > [id^="ai360-widget-"] {
            display: none !important;
          }
          #${activeWidgetId} {
            display: block !important;
            position: fixed !important;
            top: ${widgetFrame.top}px !important;
            left: ${widgetFrame.left}px !important;
            right: auto !important;
            bottom: auto !important;
            width: ${widgetFrame.width}px !important;
            min-width: 0 !important;
            max-width: calc(100vw - ${CHAT_WIDGET_VIEWPORT_GAP * 2}px) !important;
            height: ${widgetFrame.height}px !important;
            max-height: calc(100vh - ${CHAT_WIDGET_VIEWPORT_GAP * 2}px) !important;
            box-sizing: border-box !important;
            z-index: 40 !important;
            margin: 0 !important;
            transform: none !important;
          }
          #${activeWidgetId} iframe {
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            height: 100% !important;
            max-height: 100% !important;
            box-sizing: border-box !important;
            border: 1px solid #e2e8f0 !important;
            border-radius: ${activeWidgetMode === 'call' ? 28 : 12}px !important;
            box-shadow: none !important;
          }
        `}</style>
      )}

      {/* Page Header (Matching other AI pages) */}
      <div className="shrink-0 p-4 pb-0">
        <div
          className="rounded-2xl px-6 py-4"
          /* `.mcm-page [class*='rounded-']...bg-white` (mcm-page.css) is an
             app-wide, unlayered "glass pass" that deliberately turns any
             `rounded-*` + `bg-white` card translucent — inline style is what
             actually renders solid white. */
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid rgba(255,255,255,0.9)',
            boxShadow: '0 10px 34px rgba(160,95,30,0.16), inset 0 1px 0 rgba(255,255,255,0.8)',
          }}
        >
          <button
            type="button"
            onClick={() => navigate('/admin-settings/knowledge/ai-agent')}
            className="text-xs font-semibold text-slate-500 transition-colors hover:text-primary"
          >
            AI Agents
          </button>
          <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-[#1a1a1a]">
            Playground
          </h1>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 pb-2 pt-2">
        {/* Dynamic Stats Banner */}
        {/* Split between the container's `pt-2` and this `mt-2`, instead of
            one `pt-4`: a container's own top padding sits outside the part
            that reliably scrolls away in every browser, so a `pt-4` alone
            left a sliver of the page's background gradient permanently
            visible above the banner even once fully scrolled past — but
            dropping the container's padding to zero left the workspace
            cards below with no breathing room, so their rounded top corners
            read as clipped once the banner was gone. `pt-2` keeps a small
            fixed gap that survives scrolling; `mt-2` on the banner gives the
            rest and scrolls away cleanly with it. */}
        <div className="relative mt-2 overflow-hidden bg-[rgba(251,249,246,0.88)] backdrop-blur-[12px] border border-[rgba(225,200,165,0.9)] text-[#2E2D35] rounded-2xl p-6 shadow-[0_12px_28px_-6px_rgba(194,98,46,0.22),0_2px_8px_rgba(194,98,46,0.12)] flex flex-col md:flex-row items-center justify-between gap-6 shrink-0">
          <div className="flex items-center gap-4 relative z-10">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-[#2E2D35]">
                Agent Playground
              </h1>
              <p className="text-slate-500 text-sm mt-1 max-w-lg">
                Test any AI Receptionist (voice) or Chat Agent in a safe sandbox. Sessions don't
                count toward analytics.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6 md:gap-8 relative z-10 shrink-0">
            <div className="text-center md:text-left">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
                Total Agents
              </p>
              <p className="text-3xl font-extrabold text-[#2E2D35] mt-1">
                {isPageLoading ? '...' : totalAgentsCount}
              </p>
            </div>
            <div className="w-px h-10 bg-[#EEE7DD]" />
            <div className="text-center md:text-left">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
                Receptionists
              </p>
              <p className="text-3xl font-extrabold mt-1" style={{ color: 'var(--primary)' }}>
                {isPageLoading ? '...' : receptionistAgents?.length}
              </p>
            </div>
            <div className="w-px h-10 bg-[#EEE7DD]" />
            <div className="text-center md:text-left">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
                AI Chatbots
              </p>
              <p className="text-3xl font-extrabold mt-1" style={{ color: 'var(--primary)' }}>
                {isPageLoading ? '...' : chatAgents?.length || 0}
              </p>
            </div>
          </div>
        </div>

        {/* Workspace Columns */}
        {/* `min-h-full` (not a bigger fixed px value) is the point: it makes
            this row exactly as tall as the scroll container's own visible
            height, so the only extra scrollable distance is the stats
            banner above it — once that's scrolled past, this row already
            fills the rest of the viewport and there's nothing further to
            scroll to. `overflow-hidden` then holds it to that height so its
            children (the agent list, the sandbox card) are the ones that
            scroll internally instead of pushing this row — and the page —
            taller. */}
        <div className="flex-1 flex gap-4 min-h-full overflow-hidden">
          {/* Left Column: Pick Agent List */}
          <div className="w-82 bg-[rgba(251,249,246,0.88)] backdrop-blur-[12px] rounded-xl border border-[rgba(225,200,165,0.9)] shadow-[0_12px_28px_-6px_rgba(194,98,46,0.22),0_2px_8px_rgba(194,98,46,0.12)] flex flex-col overflow-hidden shrink-0">
            <div className="p-3 border-b border-[#EEE7DD] bg-[#FBE2C8]/50 space-y-2.5">
              {/* Mini Tabs (Primary UCAAS selected tab) */}
              <div className="flex bg-[#FBE2C8]/40 p-1 rounded-lg border border-[#EEE7DD]/40">
                <button
                  onClick={() => setActiveTab('voice')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-semibold transition-all border-0 cursor-pointer"
                  /* `.mcm-page button:not([data-slot='tabs-trigger'])`
                     (mcm-page.css) is an unlayered reset shared by every
                     admin-settings page — it forces a plain button's own
                     background/color to none/inherit ahead of any Tailwind
                     utility, so the active-tab classes below never actually
                     applied. Only an inline style beats that. */
                  style={
                    activeTab === 'voice'
                      ? { backgroundColor: '#ffffff', color: 'var(--primary)', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
                      : { color: '#9A948F' }
                  }
                >
                  <Phone className="w-3.5 h-3.5" />
                  AI Receptionist
                </button>
                <button
                  onClick={() => setActiveTab('chat')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-semibold transition-all border-0 cursor-pointer"
                  style={
                    activeTab === 'chat'
                      ? { backgroundColor: '#ffffff', color: 'var(--primary)', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
                      : { color: '#9A948F' }
                  }
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  AI Chatbot
                </button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9A948F]" />
                <input
                  type="text"
                  placeholder="Search agents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-[rgba(251,249,246,0.88)] backdrop-blur-[12px] border border-[rgba(225,200,165,0.9)] rounded-lg outline-none focus:border-primary transition-all placeholder:text-[#9A948F]"
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {isPageLoading ? (
                <div className="py-8 flex flex-col items-center justify-center gap-2">
                  <Loader variant="custom" />
                  <p className="text-[11px] text-[#9A948F]">Loading agents...</p>
                </div>
              ) : filteredAgents.length === 0 ? (
                <div className="py-8 px-4 text-center">
                  <p className="text-xs text-[#9A948F] font-medium">No agents found</p>
                </div>
              ) : (
                filteredAgents.map((agent: any) => {
                  const agentId = getAgentRowId(agent);
                  const isSelected = Boolean(
                    selectedAgent && agentId && getAgentRowId(selectedAgent) === agentId,
                  );
                  // const isLive = String(agent?.status || agent?.agentStatus || '').toLowerCase() === 'live';

                  return (
                    <button
                      key={agentId}
                      onClick={() => handleSelectAgent(agent)}
                      /* The name/subtitle text below relies on inline `style`
                         for its color rather than inheriting the button's —
                         `.mcm-page button:not([data-slot='tabs-trigger'])`
                         (mcm-page.css) sets `color: inherit` on every plain
                         button ahead of any Tailwind utility, which was
                         quietly beating this button's own inherited color
                         and left every row's name reading in the same shade
                         regardless of whether it was actually selected. */
                      className={`group w-full text-left flex items-center justify-between gap-2 rounded-xl border p-2.5 transition-all ${isSelected ? 'shadow-sm' : 'hover:bg-[#FBE2C8]/30'}`}
                      style={
                        isSelected
                          ? {
                              backgroundColor: 'color-mix(in srgb, var(--primary) 10%, white)',
                              borderColor: 'var(--primary)',
                            }
                          : { backgroundColor: '#ffffff', borderColor: 'transparent' }
                      }
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div
                          className={`shrink-0 rounded-full ${isSelected ? 'ring-2 ring-offset-2' : ''}`}
                          style={isSelected ? ({ '--tw-ring-color': 'var(--primary)' } as any) : undefined}
                        >
                          <CustomAvatar
                            name={agent?.agentName}
                            showPresence={false}
                            size="32"
                            isActivityInfo={false}
                          />
                        </div>
                        <div className="min-w-0">
                          <p
                            className="text-xs font-semibold truncate leading-4"
                            style={{ color: isSelected ? 'var(--primary)' : '#2E2D35' }}
                          >
                            {agent?.agentName}
                          </p>
                          <p className="text-[10px] text-[#9A948F] truncate leading-3">
                            {activeTab === 'chat' ? 'Chat Agent' : 'Voice Agent'}
                          </p>
                        </div>
                      </div>
                      {isSelected ? (
                        <span
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white"
                          style={{ backgroundColor: 'var(--primary)' }}
                        >
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Middle Column: Inline Sandbox Session */}
          <div className="flex-1 bg-[rgba(251,249,246,0.88)] backdrop-blur-[12px] rounded-xl border border-[rgba(225,200,165,0.9)] shadow-[0_12px_28px_-6px_rgba(194,98,46,0.22),0_2px_8px_rgba(194,98,46,0.12)] overflow-hidden flex flex-col min-h-0 relative">
            {!selectedAgent ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-sm mx-auto">
                <div className="w-12 h-12 rounded-full bg-[#FBE2C8]/60 flex items-center justify-center mb-3 text-primary">
                  <Activity className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-[#2E2D35]">Sandbox Preview</h3>
                <p className="text-xs text-[#9A948F] mt-1 leading-relaxed">
                  Select an agent from the left column. The playground will immediately launch the
                  chat session or initiate a test voice call.
                </p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0 ">
                {/* Middle Column Header */}
                <div className="p-3 border-b border-[#EEE7DD] flex items-center justify-between gap-3 bg-[#FBE2C8]/30 shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center font-bold text-sm uppercase shrink-0">
                      {String(selectedAgent?.agentName || 'A').charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h2 className="text-xs font-bold text-[#2E2D35] truncate max-w-[120px]">
                          {selectedAgent?.agentName}
                        </h2>
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/10 shrink-0">
                          Live
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-[#9A948F] leading-3">
                        <span>{activeTab === 'chat' ? 'Chat agent' : 'Voice receptionist'}</span>
                        <span>•</span>
                        <span className="text-primary font-semibold flex items-center gap-0.5">
                          <Zap className="w-2.5 h-2.5" /> Sandbox mode
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Inline Sandbox Console */}
                <div className="flex-1 flex flex-col min-h-0 overflow-auto">
                  <div ref={containerRef} className="w-full flex-1 relative bg-[#FBE2C8]/50">
                    {isDemoMode() ? (
                      <PlaygroundDemoPreview
                        agentName={String(selectedAgent?.agentName || selectedAgent?.name || '')}
                        mode={activeWidgetMode === 'call' ? 'call' : 'chat'}
                      />
                    ) : (
                      <div id="ai-chat-widget-root" className="w-full h-full" />
                    )}

                    {isDemoMode() ? null : !activeWidgetKey ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-white z-10">
                        <p className="text-sm font-semibold text-[#2E2D35]">Widget key missing</p>
                        <p className="mt-1 max-w-xs text-xs leading-relaxed text-[#9A948F]">
                          Save the agent widget configuration first, then test it here.
                        </p>
                      </div>
                    ) : !isWidgetActive ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-white z-10">
                        <Loader variant="custom" />
                        <p className="text-xs text-[#9A948F] mt-2">
                          Loading {activeWidgetMode === 'call' ? 'call' : 'chat'} widget inside
                          center layout...
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default Playground;
