import { Icon } from '@/assets/icons/icon';
import { IconType } from '@/assets/icons/type';
import CustomSelect from '@/components/custom/custom-select';
// import { Button } from '@/components/ui/button';
// import { Input } from '@/components/ui/input';
import { AISettingConfig, getAISettingConfig, getChatAgentList } from '@/services/api';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { handleAlert } from '@/lib/utils';

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

const socialMediaList = [
  { key: 'facebook', apiName: 'FACEBOOK', name: 'Facebook', icon: 'Messanger' },
  { key: 'whatsapp', apiName: 'WHATSAPP', name: 'WhatsApp', icon: 'WhatsappIcon' },
  { key: 'telegram', apiName: 'TELEGRAM', name: 'Telegram', icon: 'TelegramIcon' },
  { key: 'instagram', apiName: 'INSTAGRAM', name: 'Instagram', icon: 'Instagram' },
  { key: 'on_call', apiName: 'ON_CALL', name: 'On call', icon: 'PhoneCallingLine' },
  { key: 'chat_assistant', apiName: 'CHAT_ASSISTANT', name: 'Chat Assistant', icon: 'Chat2' },
];

function AISettings() {
  const navigate = useNavigate();
  const [initialized, setInitialized] = useState(false);

  const {
    control,
    reset,
    formState: { errors },
  } = useForm<any>({
    mode: 'onSubmit',
    defaultValues: {
      aiBot: {},
      aiAssistance: {},
    },
  });

  // const [customModel, setCustomModel] = useState<any>(null);
  // const [secretKey, setSecretKey] = useState('');

  const { data: typeListData = [] } = useQuery({
    queryKey: ['getChatAgentList'],
    queryFn: () => getChatAgentList(),
    select: (data) => data?.data?.data?.result?.rows || [],
  });

  const allAgents = useMemo(() => {
    return (
      (typeListData || []).map((agent: any) => ({
        label: agent?.agentName,
        value: agent?._id,
      })) || []
    );
  }, [typeListData]);

  // const modelOptions = useMemo(() => {
  //   return [{ label: 'Open AI', value: 'openai' }];
  // }, [chatAgents]);
  // const modelOptions = useMemo(() => {
  //   return [{ label: 'Open AI', value: 'openai' }, ...(chatAgents || [])];
  // }, [chatAgents]);

  const { data: savedSettings = [], isLoading } = useQuery({
    queryKey: ['getAISettingConfig'],
    queryFn: () => getAISettingConfig(),
    select: (data) => data?.data?.data || [],
  });
  const { mutate } = useMutation({
    mutationFn: AISettingConfig,
    mutationKey: ['AISettingConfig'],
    onSuccess: (data) => {
      handleAlert({
        text:
          data?.data?.data?.message ||
          data?.data?.message ||
          'AI agent setting updated successfully',
        type: 'success',
      });
    },
  });

  useEffect(() => {
    if (initialized) return;

    if (savedSettings?.length && allAgents?.length) {
      const values = mapSavedValues(savedSettings, allAgents);
      reset(values);
      setInitialized(true);
    }
  }, [savedSettings, allAgents, initialized, reset]);
  useEffect(() => {
    if (savedSettings?.length && allAgents?.length) {
      const values = mapSavedValues(savedSettings, allAgents);
      reset(values);
    }
  }, [savedSettings, allAgents]);

  const mapSavedValues = (settings: any[], agents: any[]) => {
    const defaults: any = {
      aiBot: {},
      aiAssistance: {},
    };

    settings?.forEach((item) => {
      const media = socialMediaList?.find((m) => m?.apiName === item?.name);
      if (!media) return;

      const agent = agents?.find((a) => a?.value === item?.agentId);
      if (!agent) return;

      if (item.type === 'AI_BOT') {
        defaults.aiBot[media.key] = agent;
      } else {
        defaults.aiAssistance[media.key] = agent;
      }
    });

    return defaults;
  };

  const handleAgentUpdate = (type: 'AI_BOT' | 'AI_ASSISTANT', media: any, selectedAgent: any) => {
    const payload = {
      type,
      name: media?.apiName,
      agentId: selectedAgent?.value || '',
    };
    mutate(payload);
  };

  return (
    <form
      className="flex h-full w-full flex-col overflow-hidden text-[#07142f] p-4"
      style={{ background: AI_TOOLS_PAGE_GRADIENT }}
    >
      <div
        className="mb-3 rounded-2xl px-6 py-4"
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
        <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-[#1a1a1a]">Settings</h1>
        <p className="mt-1 text-[13px] text-[#6b5c4d]">
          How your AI tools behave — models, limits and what they may act on.
        </p>
      </div>

      <div className="flex w-full flex-1 flex-col gap-4 overflow-auto sm:flex-row">
        <div className="h-full w-full rounded-xl border border-[rgba(225,200,165,0.9)] bg-[rgba(251,249,246,0.88)] p-4 shadow-[0_12px_28px_-6px_rgba(194,98,46,0.22),0_2px_8px_rgba(194,98,46,0.12)] backdrop-blur-[12px]">
          <h3 className="mb-3 text-sm font-bold text-[#2E2D35]">AI Bot</h3>
          <div className="flex flex-col gap-1 h-[calc(100vh-14rem)] overflow-y-auto pr-1">
            <div className="flex flex-col gap-2">
              {socialMediaList
                ?.filter((media) => media.key !== 'on_call' && media.key !== 'chat_assistant')
                ?.map((media) => (
                  <div
                    key={media.key}
                    className="flex items-center justify-between rounded-lg border border-[#EEE7DD] bg-white p-2.5 transition hover:border-[rgba(225,200,165,0.9)] hover:bg-[#FBE2C8]/30"
                  >
                    <div className="flex items-center gap-2.5 text-[#2E2D35]">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FBE2C8]/50 text-[#9A948F]">
                        <Icon name={media.icon as IconType} className="w-4 h-4" />
                      </span>
                      <span className="text-sm font-semibold">{media.name}</span>
                    </div>

                    <Controller
                      control={control}
                      name={`aiBot.${media.key}`}
                      render={({ field }) => (
                        <CustomSelect
                          {...field}
                          isClearable
                          isLoading={isLoading}
                          placeholder="Select agent"
                          className="max-w-60"
                          handleChange={(value) => {
                            field.onChange(value);
                            handleAgentUpdate('AI_BOT', media, value);
                          }}
                          options={allAgents || []}
                          error={(errors?.aiBot as any)?.[media.key]?.message}
                        />
                      )}
                    />
                  </div>
                ))}
            </div>
            {/* <h3 className="font-semibold text-gray-800 mb-3 mt-4">Add your own AI Model</h3>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5 w-full">
                <p className="text-sm leading-none font-semibold text-gray-800">Select model</p>
                <CustomSelect
                  value={customModel}
                  isLoading={isLoading}
                  placeholder="Select model"
                  className=""
                  handleChange={(value) => {
                    setCustomModel(value);
                  }}
                  options={modelOptions || []}
                />
              </div>
              {customModel?.value === 'openai' && (
                <>
                  <Input
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    placeholder="Enter secret key"
                    label="Secret Key"
                    type="password"
                    autoComplete="false"
                  />
                  <Button variant="outline" className="w-full max-w-32">
                    Save
                  </Button>
                </>
              )}
            </div> */}
          </div>
        </div>

        <div className="h-full w-full rounded-xl border border-[rgba(225,200,165,0.9)] bg-[rgba(251,249,246,0.88)] p-4 shadow-[0_12px_28px_-6px_rgba(194,98,46,0.22),0_2px_8px_rgba(194,98,46,0.12)] backdrop-blur-[12px]">
          <h3 className="mb-3 text-sm font-bold text-[#2E2D35]">AI Assistance</h3>
          <div className="flex flex-col gap-2 h-[calc(100vh-14rem)] overflow-y-auto pr-1">
            {socialMediaList.map((media) => (
              <div
                key={media?.key}
                className="flex items-center justify-between rounded-lg border border-[#EEE7DD] bg-white p-2.5 transition hover:border-[rgba(225,200,165,0.9)] hover:bg-[#FBE2C8]/30"
              >
                <div className="flex items-center gap-2.5 text-[#2E2D35]">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FBE2C8]/50 text-[#9A948F]">
                    <Icon name={media?.icon as IconType} className="w-4 h-4" />
                  </span>
                  <span className="text-sm font-semibold">{media?.name}</span>
                </div>

                <Controller
                  control={control}
                  name={`aiAssistance.${media?.key}`}
                  render={({ field }) => (
                    <CustomSelect
                      {...field}
                      isClearable
                      isLoading={isLoading}
                      placeholder="Select agent"
                      className="max-w-60"
                      handleChange={(value) => {
                        field.onChange(value);
                        handleAgentUpdate('AI_ASSISTANT', media, value);
                      }}
                      options={allAgents || []}
                      error={(errors?.aiAssistance as any)?.[media.key]?.message}
                    />
                  )}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </form>
  );
}

export default AISettings;
