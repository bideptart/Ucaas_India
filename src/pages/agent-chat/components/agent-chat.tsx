import { useSocketEvents } from '@/hooks/use-socket-events';
import { useUser } from '@/hooks/use-user';
import { Bot } from 'lucide-react';
import { useMemo } from 'react';
import AgentChatFooter from './chat/agent-chat-footer';
import AgentChatHeader from './chat/agent-chat-header';
import AgentChatMessages from './chat/agent-chat-messages';

export type AgentChatProps = {
  chatId?: string;
  fromMeetChat?: boolean;
  onBackToList?: () => void;
  onOpenProfile?: () => void;
  pendingRequest?: any;
  onPendingAccepted?: (chatId: string) => void;
};

const AgentChat = ({
  chatId = '',
  onBackToList,
  onOpenProfile,
  pendingRequest = null,
  onPendingAccepted,
}: AgentChatProps) => {
  const { user } = useUser();
  const { allAgentChats = [], typingList = {} } = useSocketEvents();

  const pendingChat = useMemo(() => {
    if (!pendingRequest?.chatId) return null;

    const rawUsers = pendingRequest?.users;
    const userList = Array.isArray(rawUsers) ? rawUsers : rawUsers ? [rawUsers] : [];
    const pendingVisitor =
      userList.find((chatUser: any) => chatUser?.uuid && chatUser?.uuid !== user?.uuid) ||
      userList.find((chatUser: any) => chatUser?.name || chatUser?.email) ||
      {};

    const visitorName =
      pendingVisitor?.name ||
      `${pendingVisitor?.first_name || ''} ${pendingVisitor?.last_name || ''}`.trim() ||
      pendingVisitor?.email ||
      'Unknown Visitor';

    return {
      chatId: pendingRequest.chatId,
      createdAt:
        pendingRequest?.createdAt || pendingRequest?.requestedAt || new Date().toISOString(),
      users: [
        {
          ...pendingVisitor,
          uuid: pendingVisitor?.uuid || 'pending-visitor',
          name: visitorName,
        },
        {
          uuid: 'AI-Bot',
          name: 'AI Assistant',
        },
      ],
      isPendingRequest: true,
      metaData: {
        ...(pendingRequest?.metaData || {}),
      },
    };
  }, [pendingRequest, user?.uuid]);

  const currentChat = useMemo(() => {
    const existingChat = (Array.isArray(allAgentChats) ? allAgentChats : []).find(
      (chat: any) => chat?.chatId === chatId,
    );
    if (pendingRequest?.chatId && pendingRequest.chatId === chatId) {
      const base = existingChat || pendingChat;
      if (!base) return null;
      return {
        ...base,
        users:
          Array.isArray(base?.users) && base.users.length
            ? base.users
            : Array.isArray(pendingChat?.users)
              ? pendingChat.users
              : [],
        createdAt: base?.createdAt || pendingChat?.createdAt,
        metaData: {
          ...(pendingChat?.metaData || {}),
          ...(base?.metaData || {}),
        },
        isPendingRequest: true,
      };
    }
    if (existingChat) return existingChat;
    if (pendingChat?.chatId === chatId) return pendingChat;
    return null;
  }, [allAgentChats, chatId, pendingChat, pendingRequest?.chatId]);

  const isPendingRequestChat =
    Boolean(pendingRequest?.chatId && pendingRequest?.chatId === chatId) &&
    pendingRequest?.status === 'pending';
  const isAbandonedRequestChat =
    Boolean(pendingRequest?.chatId && pendingRequest?.chatId === chatId) &&
    pendingRequest?.status === 'abandoned';

  const pendingTopic = useMemo(() => {
    const candidate =
      pendingRequest?.topic ||
      pendingRequest?.queue ||
      pendingRequest?.intent ||
      pendingRequest?.metaData?.topic ||
      pendingRequest?.metaData?.intent ||
      '';
    if (!candidate) return '';
    return `${candidate}`.trim();
  }, [pendingRequest]);

  const typingText = useMemo(() => {
    if (isPendingRequestChat) return '';
    if (!currentChat?.chatId) return '';
    const typingUsers = Array.isArray(typingList?.[currentChat.chatId])
      ? typingList[currentChat.chatId]
      : [];
    if (!typingUsers.length) return '';

    const names = (Array.isArray(currentChat?.users) ? currentChat.users : [])
      .filter(
        (chatUser: any) => typingUsers.includes(chatUser?.uuid) && chatUser?.uuid !== user?.uuid,
      )
      .map(
        (chatUser: any) =>
          chatUser?.name || `${chatUser?.first_name || ''} ${chatUser?.last_name || ''}`.trim(),
      )
      .filter(Boolean);

    return names.length ? `${names.join(', ')} typing...` : 'Typing...';
  }, [typingList, currentChat, user?.uuid, isPendingRequestChat]);

  if (!currentChat?.chatId) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-ucass-gray">
        <div className="text-center px-6">
          <Bot className="mx-auto mb-6 h-12 w-12 text-muted-foreground" strokeWidth={2} />
          <div className="text-[13px] leading-6 font-medium text-muted-foreground">
            Select a conversation from the queue to start providing support.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-white">
      <AgentChatHeader
        currentChat={currentChat}
        onBackToList={onBackToList}
        onOpenProfile={onOpenProfile}
        isPendingRequest={isPendingRequestChat || isAbandonedRequestChat}
        pendingTopic={pendingTopic}
      />
      <div className="flex-1 min-h-0 flex flex-col bg-white">
        <AgentChatMessages currentChat={currentChat} />
        <AgentChatFooter currentChat={currentChat} typingText={typingText} />
      </div>
    </div>
  );
};

export default AgentChat;
