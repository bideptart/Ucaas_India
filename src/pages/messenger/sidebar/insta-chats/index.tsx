import { getOmniChats } from '@/services/api';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import Loader from '@/components/custom/loader';
import CustomAvatar from '@/components/custom/custom-avatar';
import { useNavigate, useLocation } from 'react-router-dom';
import moment from 'moment';
import { useSocketEvents } from '@/hooks/use-socket-events';
import NotFound from '@/assets/images/not-found-img.svg';

// { setSelectedChat }: { setSelectedChat: any } use this as props if needed
const InstaChats = ({
  setSelectedChat,
  selectedChat,
  selectedChannelType,
  isCompactLayout = false,
}: {
  setSelectedChat: any;
  selectedChat: any;
  selectedChannelType?: any;
  isCompactLayout?: boolean;
}) => {
  const [searchKey, setSearchKey] = useState('');
  const { omniChannelData } = useSocketEvents();
  const location = useLocation();
  const chatID = location?.search?.split('&')?.[1]?.split('=')?.[1] || '';
  const navigate = useNavigate();

  const {
    data: omniInstagramData = [],
    isLoading: isOmniInstagramDataPending,
    refetch: omniInstagramRefetch,
  } = useQuery({
    queryKey: [`getWhatsappChats-insta`, { did_number: selectedChannelType?.omni_number || '' }],
    queryFn: ({ queryKey }) => getOmniChats(queryKey[1]),
    select: (data) => data?.data?.data?.result || [],
  });

  const filteredChats =
    (omniInstagramData &&
      omniInstagramData?.filter(
        (item: any) =>
          (item?.toName || '').toLowerCase().includes(searchKey?.toLowerCase()) ||
          (item?.to || '').toLowerCase().includes(searchKey?.toLowerCase()),
      )) ||
    [];

  useEffect(() => {
    if (isOmniInstagramDataPending || !filteredChats?.length) return;

    const matchedChat = filteredChats.find((item: any) => item?.chatId === chatID);
    if (matchedChat) {
      if (selectedChat?.chatId !== matchedChat.chatId) {
        setSelectedChat(matchedChat);
      }
      return;
    }

    if (!selectedChat && !isCompactLayout) {
      setSelectedChat(filteredChats[0]);
      navigate(`${location.pathname}?chatType=instagram&chatId=${filteredChats[0]?.chatId}`, {
        replace: true,
      });
    }
  }, [
    chatID,
    filteredChats,
    isCompactLayout,
    isOmniInstagramDataPending,
    location.pathname,
    navigate,
    selectedChat?.chatId,
    setSelectedChat,
  ]);

  useEffect(() => {
    if (
      omniInstagramData?.length > 0 &&
      omniChannelData?.omni_details &&
      omniChannelData?.omni_details?.channel_category === 'instagram'
    ) {
      omniInstagramRefetch();
    }
  }, [omniChannelData, chatID]);

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      <div className="p-2">
        <Input
          Icon={
            <svg width="18" height="18" viewBox="0 0 15 15" fill="none" className="text-[#4B4640]" aria-hidden="true">
              <path
                d="M10 6.5C10 8.433 8.433 10 6.5 10C4.567 10 3 8.433 3 6.5C3 4.567 4.567 3 6.5 3C8.433 3 10 4.567 10 6.5ZM9.30884 10.0159C8.53901 10.6318 7.56251 11 6.5 11C4.01472 11 2 8.98528 2 6.5C2 4.01472 4.01472 2 6.5 2C8.98528 2 11 4.01472 11 6.5C11 7.56251 10.6318 8.53901 10.0159 9.30884L12.8536 12.1464C13.0488 12.3417 13.0488 12.6583 12.8536 12.8536C12.6583 13.0488 12.3417 13.0488 12.1464 12.8536L9.30884 10.0159Z"
                fill="currentColor"
                fillRule="evenodd"
                clipRule="evenodd"
              />
            </svg>
          }
          IconPosition="left-0 pl-3 inset-y-0"
          className="w-full pl-10 hover:border-gray-300 focus:border-gray-300 focus:ring-0"
          style={{ outline: 'none', boxShadow: 'none' }}
          placeholder="Search..."
          value={searchKey}
          onChange={(e) => {
            const value = e.target.value;
            if (value.startsWith(' ')) return;
            setSearchKey(value);
          }}
        />
      </div>
      <div className="flex flex-col w-full flex-1 min-h-0 overflow-auto">
        <ul role="list" className="divide-y divide-gray-200 overflow-auto h-full">
          {isOmniInstagramDataPending ? (
            <div className="flex justify-center mt-2">
              <Loader variant="blue" />
            </div>
          ) : filteredChats?.length > 0 ? (
            filteredChats?.map((item: any) => (
              <li
                className={`flex  hover:bg-gray cursor-pointer ${selectedChat?.chatId === item.chatId ? 'bg-gray-100' : ''} `}
                onClick={() => {
                  setSelectedChat(item);
                  navigate(`${location.pathname}?chatType=instagram&chatId=${item?.chatId}`);
                }}
              >
                <div className="flex items-center w-full px-3 h-16 gap-2">
                  <div className="relative">
                    <CustomAvatar name={item?.toName || 'Unknown Contact'} showPresence={false} />
                  </div>
                  <div
                    className={`flex flex-col justify-between text-sm w-[calc(100%_-_3rem)] gap-1`}
                  >
                    <div className="flex justify-between gap-2">
                      <div className="flex items-center gap-1 w-[calc(100%_-_7rem)]">
                        <p className=" text-gray-900 truncate font-medium">
                          {item?.toName || item?.to || 'Unknown Contact'}
                        </p>
                      </div>
                      <p className="text-gray-800 text-end  whitespace-nowrap text-xs">
                        {item?.metaData?.timestamp
                          ? moment(item?.metaData?.timestamp).fromNow()
                          : ''}
                      </p>
                    </div>
                    <div className="flex justify-between gap-2">
                      <p className="text-gray-800 text-end  whitespace-nowrap text-xs truncate">
                        {item?.metaData?.lastMessage || ''}
                      </p>
                    </div>
                  </div>
                </div>
              </li>
            ))
          ) : (
            <div className="flex items-center justify-center w-full h-full">
              <div className="flex flex-col justify-center items-center gap-1 py-5 h-full w-full mx-auto">
                <img src={NotFound} alt="BusyImage" className="min-w-28 w-28" />
                <p className="text-md font-medium text-gray-900 text-sm">No conversations yet</p>
                <p className="text-md  text-gray-700 text-sm">
                  Please add a user first to begin chatting.
                </p>
              </div>
            </div>
          )}
        </ul>
      </div>
    </div>
  );
};

export default InstaChats;
