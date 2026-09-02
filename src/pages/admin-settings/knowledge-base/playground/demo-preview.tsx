/**
 * The Playground's preview, in demo mode.
 *
 * Normally this panel loads an external widget from `VITE_AI_URL`. That
 * variable is unset on a preview host, so `getAiWidgetScriptUrl()` returns an
 * empty string, the loader bailed with "AI widget URL is missing." and the
 * panel sat on its spinner for ever. There is no widget service to point at, so
 * the fix is not a URL - it is to stop pretending one is being fetched.
 *
 * What this renders instead is a sandbox: the shape of a chat and of a call, so
 * the surrounding screen can be worked on, with nothing behind either. It says
 * so on its face rather than only in a comment, because a convincing-looking
 * reply from an agent badged "Live" is exactly the thing someone would take for
 * a working product. Replies are canned and chosen by keyword; no model is
 * called, no audio is captured, and nothing typed here is stored anywhere.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, PhoneOff, Send, Sparkles } from 'lucide-react';

type Mode = 'chat' | 'call';

interface DemoPreviewProps {
  agentName: string;
  mode: Mode;
}

interface ChatLine {
  id: number;
  from: 'agent' | 'caller';
  text: string;
}

/* Answers are matched on a keyword so the panel responds to what was actually
   typed rather than cycling blindly - the difference between a sandbox that can
   be demonstrated and one that reads as broken. Each answer says what a real
   agent would draw on, rather than inventing a fact about a business. */
const CANNED: Array<{ match: RegExp; reply: string }> = [
  {
    match: /\b(hour|open|close|closing|timing|time)\b/i,
    reply:
      'In the live product I would answer from the hours set on this agent. The sandbox has none to read, so there is nothing to quote.',
  },
  {
    match: /\b(price|pricing|cost|plan|quote|fee)\b/i,
    reply:
      'Pricing is answered from the pages picked for this agent, and the sandbox ingests nothing, so I have no figures to give you.',
  },
  {
    match: /\b(address|where|location|office|reach|find)\b/i,
    reply:
      'I would read the address off the scanned site. This sandbox scans nothing, so there is no address behind this reply.',
  },
  {
    match: /\b(human|agent|person|transfer|speak|someone)\b/i,
    reply:
      'A transfer would hand you to the queue or extension chosen in Advanced Settings. Nothing is dialled from the sandbox.',
  },
];

const FALLBACK =
  'That would go to this agent knowledge base for an answer. The sandbox has none connected, so this reply is canned rather than generated.';

const replyTo = (text: string) => CANNED.find((row) => row.match.test(text))?.reply || FALLBACK;

const formatDuration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** Shared by both panels so they say the same thing about themselves. */
const SandboxNotice = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-start gap-2 border-b border-[#EEE7DD] bg-[#FBE2C8]/40 px-4 py-2.5">
    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
    <p className="text-[11px] leading-relaxed text-[#6b6560]">{children}</p>
  </div>
);

const ChatPreview = ({ agentName }: { agentName: string }) => {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState('');
  const nextId = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    nextId.current = 2;
    setLines([
      {
        id: 0,
        from: 'agent',
        text: `Hello, this is ${agentName}. Ask me something to see how a reply appears here.`,
      },
      {
        id: 1,
        from: 'agent',
        text: 'Nothing you type is sent anywhere, and the answers are written in advance.',
      },
    ]);
    setDraft('');
  }, [agentName]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [lines]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;

    setLines((prev) => [
      ...prev,
      { id: nextId.current++, from: 'caller', text },
      { id: nextId.current++, from: 'agent', text: replyTo(text) },
    ]);
    setDraft('');
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <SandboxNotice>
        Sandbox preview. No AI is connected - the replies below are written in advance, and nothing
        you type is stored.
      </SandboxNotice>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {lines.map((line) => (
          <div
            key={line.id}
            className={`flex ${line.from === 'caller' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                line.from === 'caller'
                  ? 'rounded-br-sm bg-primary text-white'
                  : 'rounded-bl-sm border border-[#EEE7DD] bg-[#FBE2C8]/40 text-[#2E2D35]'
              }`}
            >
              {line.text}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="flex items-center gap-2 border-t border-[#EEE7DD] bg-[rgba(251,249,246,0.88)] px-3 py-2.5">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder="Type a message..."
          maxLength={300}
          className="h-9 flex-1 rounded-lg border border-[rgba(225,200,165,0.9)] bg-white px-3 text-xs text-[#2E2D35] outline-none transition-colors placeholder:text-[#9A948F] focus:border-primary"
        />
        <button
          type="button"
          onClick={send}
          disabled={!draft.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white transition-opacity disabled:opacity-40"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

/* The call is a rehearsal of the shape of one - ringing, answered, a transcript
   filling in, a timer. No microphone is opened: asking for one would raise a
   real permission prompt for something that is not happening. */
const TRANSCRIPT = [
  { at: 1, from: 'agent', text: 'Thank you for calling. How can I help?' },
  { at: 4, from: 'caller', text: 'I wanted to ask about my account.' },
  { at: 7, from: 'agent', text: 'I can look that up once an account is connected.' },
  { at: 11, from: 'caller', text: 'Can I speak to someone?' },
  { at: 14, from: 'agent', text: 'A transfer would go to the queue set on this agent.' },
] as const;

const CallPreview = ({ agentName }: { agentName: string }) => {
  const [state, setState] = useState<'idle' | 'ringing' | 'connected' | 'ended'>('idle');
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    setState('idle');
    setSeconds(0);
  }, [agentName]);

  useEffect(() => {
    if (state === 'ringing') {
      const timer = window.setTimeout(() => setState('connected'), 1600);
      return () => window.clearTimeout(timer);
    }
    if (state === 'connected') {
      const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
      return () => window.clearInterval(timer);
    }
    return undefined;
  }, [state]);

  const shownLines = useMemo(
    () =>
      state === 'idle' || state === 'ringing'
        ? []
        : TRANSCRIPT.filter((line) => line.at <= seconds),
    [seconds, state],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <SandboxNotice>
        Sandbox preview. No call is placed and no microphone is opened - the transcript below is
        scripted.
      </SandboxNotice>

      <div className="flex flex-col items-center px-4 pt-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-lg font-bold uppercase text-white">
          {agentName.charAt(0) || 'A'}
        </div>
        <p className="mt-2 text-sm font-bold text-[#2E2D35]">{agentName}</p>
        <p className="text-[11px] font-semibold text-[#9A948F]">
          {state === 'idle' && 'Ready to start a test call'}
          {state === 'ringing' && 'Connecting...'}
          {state === 'connected' && formatDuration(seconds)}
          {state === 'ended' && `Ended - ${formatDuration(seconds)}`}
        </p>
      </div>

      <div className="mt-4 flex-1 space-y-2 overflow-y-auto px-4">
        {shownLines.map((line) => (
          <div key={line.at} className="text-[11px] leading-relaxed">
            <span
              className={`font-bold ${line.from === 'agent' ? 'text-primary' : 'text-[#2E2D35]'}`}
            >
              {line.from === 'agent' ? agentName : 'Caller'}:
            </span>{' '}
            <span className="text-[#6b6560]">{line.text}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-3 border-t border-[#EEE7DD] bg-[rgba(251,249,246,0.88)] px-3 py-3">
        {state === 'idle' || state === 'ended' ? (
          <button
            type="button"
            onClick={() => {
              setSeconds(0);
              setState('ringing');
            }}
            className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-white"
          >
            <Mic className="h-3.5 w-3.5" />
            {state === 'ended' ? 'Start again' : 'Start test call'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setState('ended')}
            className="flex h-9 items-center gap-2 rounded-lg bg-rose-500 px-4 text-xs font-semibold text-white"
          >
            <PhoneOff className="h-3.5 w-3.5" />
            End call
          </button>
        )}
      </div>
    </div>
  );
};

export const PlaygroundDemoPreview = ({ agentName, mode }: DemoPreviewProps) => {
  const name = agentName?.trim() || 'This agent';
  return mode === 'call' ? <CallPreview agentName={name} /> : <ChatPreview agentName={name} />;
};

export default PlaygroundDemoPreview;
