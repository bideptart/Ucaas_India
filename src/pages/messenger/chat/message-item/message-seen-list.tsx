import { useEffect, useMemo, useState } from 'react';
import { CheckCheck, Eye, Users } from 'lucide-react';
import CustomAvatar from '@/components/custom/custom-avatar';
import { useSocketEvents } from '@/hooks/use-socket-events';
import { getSeenTimeString } from './helpers';

interface MessageSeenListProps {
  messageId: string;
  chatId: string;
}

interface SeenByUser {
  userId: string;
  seenAt?: string;
}

const MessageSeenList = ({ messageId, chatId }: MessageSeenListProps) => {
  const [seenBy, setSeenBy] = useState<SeenByUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const { getSeenByList, allChats = [] } = useSocketEvents();

  const currentChatUsers = useMemo(() => {
    try {
      if (!chatId || !Array.isArray(allChats)) return [];
      const chat = allChats.find((c: any) => c?.chatId === chatId);
      return Array.isArray(chat?.users) ? chat.users : [];
    } catch {
      return [];
    }
  }, [allChats, chatId]);

  useEffect(() => {
    if (!messageId || !chatId || typeof getSeenByList !== 'function') {
      setIsLoading(false);
      setHasError(true);
      return;
    }

    setIsLoading(true);
    setHasError(false);

    try {
      getSeenByList({ messageId, chatId }, (response: any) => {
        try {
          const result = response?.data?.result;
          console.log(result, 'resultresult');

          if (response?.status === 200 && Array.isArray(result)) {
            setSeenBy(result);
          } else {
            setSeenBy([]);
          }
        } catch (error) {
          console.error('Error processing seen by response:', error);
          setSeenBy([]);
        } finally {
          setIsLoading(false);
        }
      });
    } catch (error) {
      console.error('Error calling getSeenByList:', error);
      setIsLoading(false);
      setHasError(true);
      setSeenBy([]);
    }
  }, [messageId, chatId, getSeenByList]);

  if (isLoading) {
    return (
      <div className="w-72 bg-white dark:bg-mcm-surface rounded-lg shadow-sm border dark:border-mcm-line">
        <div className="p-2 border-b border-gray-100/80 dark:border-mcm-line bg-gray-50/60 dark:bg-mcm-surface-3/60">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-gray-200 dark:bg-mcm-surface-3 animate-pulse" />
            <div className="h-3 w-20 rounded bg-gray-200 dark:bg-mcm-surface-3 animate-pulse" />
          </div>
        </div>
        <div className="py-10 text-center text-xs text-gray-400 dark:text-mcm-ink-3">Loading read status...</div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="w-72 bg-white dark:bg-mcm-surface rounded-lg shadow-sm border dark:border-mcm-line">
        <div className="p-2 border-b border-red-100/80 bg-red-50/60">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-red-400" />
            <span className="text-xs font-semibold text-red-600 uppercase">Read Status</span>
          </div>
        </div>
        <div className="py-10 text-center text-xs text-red-500">Unable to load read receipts</div>
      </div>
    );
  }

  if (!Array.isArray(seenBy) || seenBy.length === 0) {
    return (
      <div className="w-72 bg-white dark:bg-mcm-surface rounded-lg shadow-sm border dark:border-mcm-line">
        <div className="p-2 border-b border-gray-100/80 dark:border-mcm-line bg-gray-50/60 dark:bg-mcm-surface-3/60">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-gray-400 dark:text-mcm-ink-3" />
            <span className="text-xs font-semibold text-gray-600 dark:text-mcm-ink-2 uppercase">Read Status</span>
          </div>
        </div>
        <div className="py-10 text-center text-sm text-gray-500 dark:text-mcm-ink-3">Not seen yet</div>
      </div>
    );
  }

  return (
    <div className="w-72 p-0 bg-white dark:bg-mcm-surface rounded-lg overflow-hidden border dark:border-mcm-line shadow-sm">
      <div className="p-2.5 border-b border-gray-100/80 dark:border-mcm-line bg-gradient-to-r from-ucass-active-bg/60 via-indigo-50/30 to-purple-50/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-full bg-ucass-active-bg/80">
              <CheckCheck className="w-4 h-4 text-ucass-active" />
            </div>
            <div className="text-xs font-semibold text-gray-700 dark:text-mcm-ink-2 uppercase">Seen by</div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-ucass-active text-white">
            <Users className="w-3 h-3" />
            <span className="text-xs font-semibold">{seenBy.length}</span>
          </div>
        </div>
      </div>

      <div className="max-h-80 overflow-y-auto">
        {seenBy.map((item: any, index: number) => {
          const foundUser = currentChatUsers.find(
            (chatUser: any) => chatUser?.uuid === item?.userId,
          );
          const userName = foundUser?.name || 'Unknown User';
          const safeKey = foundUser?.uuid || item?.userId || `user-${index}`;
          const seenTime = getSeenTimeString(item?.seenAt);

          return (
            <div
              key={safeKey}
              className="group relative flex items-center gap-3 p-2.5 hover:bg-ucass-active-bg/20 transition-colors border-b border-gray-50 dark:border-mcm-line last:border-0"
            >
              <div className="relative text-xs">
                <CustomAvatar
                  name={userName}
                  showPresence={false}
                  extension={foundUser?.extension || ''}
                  size="34"
                  image={foundUser?.profile || ''}
                />
                <div className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-ucass-active border-2 border-white dark:border-mcm-surface shadow-sm">
                  <CheckCheck className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-800 dark:text-mcm-ink truncate">{userName}</div>
                {seenTime ? (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Eye className="w-3 h-3 text-gray-400 dark:text-mcm-ink-3" />
                    <span className="text-xs text-gray-500 dark:text-mcm-ink-3 font-medium">{seenTime}</span>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MessageSeenList;
