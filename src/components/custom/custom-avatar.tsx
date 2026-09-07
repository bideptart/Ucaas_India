import { useSocketEvents } from '@/hooks/use-socket-events';
import { getEnv } from '@/lib/utils';
import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@/hooks/use-user';
import CustomTooltip from './custom-tooltip';
import UserLoginActivityModal from './userLoginActivityModal';
import LightBoxPreview from '@/pages/messenger/chat/message-item/lightbox-preview';
import {
  getMonitoringLiveCalls,
  isActiveMonitoringCall,
  isMonitoringCallForMember,
} from '@/pages/monitoring/live-call-helpers';
import { fetchAuthenticatedMediaObjectUrl } from '@/hooks/use-authenticated-media';

const avatarObjectUrlCache = new Map<string, string>();
const avatarFetchPromiseCache = new Map<string, Promise<string>>();

const getAvatarSourceMeta = (
  image: string,
  companyUuid: string,
  type: string,
): { directSrc: string; apiMediaUrl: string } => {
  if (!image) {
    return { directSrc: '', apiMediaUrl: '' };
  }

  if (image.includes('blob') || image.startsWith('data:')) {
    return { directSrc: image, apiMediaUrl: '' };
  }

  return {
    directSrc: '',
    apiMediaUrl: `${getEnv().VITE_API_BASE_URL}/api/media/${companyUuid}/${type}/${image}`,
  };
};

const getCachedAvatarObjectUrl = async (apiMediaUrl: string) => {
  const cachedObjectUrl = avatarObjectUrlCache.get(apiMediaUrl);
  if (cachedObjectUrl) return cachedObjectUrl;

  const inFlightRequest = avatarFetchPromiseCache.get(apiMediaUrl);
  if (inFlightRequest) return inFlightRequest;

  const request = fetchAuthenticatedMediaObjectUrl(apiMediaUrl)
    .then((objectUrl) => {
      avatarObjectUrlCache.set(apiMediaUrl, objectUrl);
      avatarFetchPromiseCache.delete(apiMediaUrl);
      return objectUrl;
    })
    .catch((error) => {
      avatarFetchPromiseCache.delete(apiMediaUrl);
      throw error;
    });

  avatarFetchPromiseCache.set(apiMediaUrl, request);
  return request;
};

/* One flat colour per presence state — Available/On Call/Do Not Disturb/
   Offline — instead of the previous mix (two plain-colour dots plus two
   detailed clock/do-not-disturb icon PNGs at the same tiny size, where the
   icons just read as a blurry smudge). `call` was also red before, which
   collided with `dnd`'s own red and left "on a call" reading as an error
   state rather than the orange the rest of the app uses for it. `busy` is
   the same on-a-call meaning as `call` under a different key some callers
   use, so it gets the same colour rather than a third one. */
const STATUS_DOT_COLOR: Record<string, string> = {
  online: '#22c55e',
  call: '#f97316',
  busy: '#f97316',
  dnd: '#ef4444',
  offline: '#6b7280',
};

/* Every dot the same size and the same subtle "cutout" ring (matching
   whatever surface it sits on, light or dark) rather than each status
   bringing its own size/shape. */
const StatusDot = ({ status }: { status: string }) => (
  <span
    className="block rounded-full"
    style={{
      width: 9,
      height: 9,
      background: STATUS_DOT_COLOR[status] || STATUS_DOT_COLOR.offline,
      boxShadow: '0 0 0 2px var(--mcm-surface, #fff)',
    }}
  />
);

/* A curated set of avatar colours instead of deriving one from an arbitrary
   hash of the name — that produced literally any hue/lightness (including
   muddy, near-black or low-contrast combinations) and a barely-there 20%-
   opacity background whose actual contrast depended on whatever surface it
   sat over. Each entry here is a deliberately chosen, moderately-saturated
   solid background paired with a light text colour, so contrast holds
   regardless of theme or the card/table/header it's placed on. Still
   deterministic per name (same agent always lands on the same colour), just
   picked from a fixed, professional-looking set rather than the full colour
   wheel. */
const AVATAR_PALETTE = [
  { bg: '#2563eb', text: '#eff6ff' }, // blue
  { bg: '#0d9488', text: '#ecfdf5' }, // teal
  { bg: '#7c3aed', text: '#f5f3ff' }, // violet
  { bg: '#db2777', text: '#fdf2f8' }, // pink
  { bg: '#d97706', text: '#fffbeb' }, // amber
  { bg: '#059669', text: '#ecfdf5' }, // green
  { bg: '#4f46e5', text: '#eef2ff' }, // indigo
  { bg: '#475569', text: '#f1f5f9' }, // slate
];

const getAvatarPalette = (name: string) => {
  if (!name) return AVATAR_PALETTE[AVATAR_PALETTE.length - 1];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[index];
};

export const statusImageLookup: any = {
  busy: <StatusDot status="busy" />,
  dnd: <StatusDot status="dnd" />,
  online: <StatusDot status="online" />,
  offline: <StatusDot status="offline" />,
  call: <StatusDot status="call" />,
};

interface AvatarProps {
  size?: string;
  name?: string;
  showPresence?: boolean;
  extension?: string;
  image?: string;
  type?: string;
  grouped?: boolean;
  isActivityInfo?: boolean;
  textClass?: string;
  /* Wins over the status this component would otherwise derive from
     usersOnlineStatus. For the signed-in user's own avatar (the header
     chip), that derivation needs a live socket presence frame to ever
     show anything but "offline" — useMyPresence's optimistic override
     (set the instant a status is picked in the avatar menu) has nothing
     to hook into here without this. Any other avatar (someone else's, in
     a list) should leave this unset and keep reading the live feed. */
  presenceOverride?: 'online' | 'busy' | 'dnd' | 'offline' | 'call';
}
const CustomAvatar = ({
  name = '',
  size = '40',
  showPresence = false,
  extension = '',
  image = '',
  grouped = false,
  type = 'profile',
  isActivityInfo = true,
  textClass,
  presenceOverride,
}: AvatarProps) => {
  const { usersOnlineStatus, liveCalls, eventLiveCallsData } = useSocketEvents();
  const liveCallsData = getMonitoringLiveCalls(liveCalls, eventLiveCallsData);
  const { user } = useUser();
  const companyUuid = user?.company_info?.uuid || '';
  const { directSrc, apiMediaUrl } = useMemo(
    () => getAvatarSourceMeta(image || '', companyUuid, type),
    [image, companyUuid, type],
  );
  const [mediaUrl, setMediaUrl] = useState(
    () => directSrc || (apiMediaUrl ? avatarObjectUrlCache.get(apiMediaUrl) || '' : ''),
  );
  const [hasImageError, setHasImageError] = useState(false);

  const [modalState, setModalState] = useState<{ isModalOpen: boolean; selectedUser: any }>({
    isModalOpen: false,
    selectedUser: null,
  });
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    setHasImageError(false);

    if (!image) {
      setMediaUrl('');
      return;
    }

    if (directSrc) {
      setMediaUrl(directSrc);
      return () => {
        isCancelled = true;
      };
    }

    if (!apiMediaUrl) {
      setMediaUrl('');
      return () => {
        isCancelled = true;
      };
    }

    const cachedObjectUrl = avatarObjectUrlCache.get(apiMediaUrl);
    if (cachedObjectUrl) {
      // Apply cached url synchronously to avoid initials flicker on remount/rerender.
      setMediaUrl(cachedObjectUrl);
      return () => {
        isCancelled = true;
      };
    }

    getCachedAvatarObjectUrl(apiMediaUrl)
      .then((cachedUrl) => {
        if (!isCancelled) setMediaUrl(cachedUrl);
      })
      .catch((err) => {
        if (!isCancelled) {
          setMediaUrl('');
          setHasImageError(true);
        }
        console.log(err);
      });

    return () => {
      isCancelled = true;
    };
  }, [image, directSrc, apiMediaUrl]);
  const normalizedExtension = useMemo(() => String(extension ?? '').trim(), [extension]);
  const activeUser = useMemo(() => {
    if (!normalizedExtension || !Array.isArray(usersOnlineStatus)) return null;
    return (
      usersOnlineStatus.find(
        (statusUser: any) => String(statusUser?.userId ?? '').trim() === normalizedExtension,
      ) || null
    );
  }, [usersOnlineStatus, normalizedExtension]);

  const isOnCall = useMemo(() => {
    const callFromLiveCalls = Array.isArray(liveCallsData)
      ? liveCallsData.some(
          (callItem: any) =>
            isActiveMonitoringCall(callItem) &&
            isMonitoringCallForMember(callItem, normalizedExtension),
        )
      : false;
    return callFromLiveCalls || Boolean(activeUser?.onCall);
  }, [liveCallsData, normalizedExtension, activeUser?.onCall]);

  const isOnline = Boolean(activeUser?.online);
  const userStatus = String(activeUser?.status || '').toLowerCase();
  const status = isOnCall
    ? 'call'
    : presenceOverride || (isOnline ? userStatus || 'online' : 'offline');

  const NAME = name;
  const { bg: darkColor, text: lightColor } = getAvatarPalette(NAME);

  const handleAvatarImageError = () => {
    setHasImageError(true);
    setMediaUrl('');
    if (apiMediaUrl) {
      const cachedObjectUrl = avatarObjectUrlCache.get(apiMediaUrl);
      if (cachedObjectUrl) {
        avatarObjectUrlCache.delete(apiMediaUrl);
        URL.revokeObjectURL(cachedObjectUrl);
      }
      avatarFetchPromiseCache.delete(apiMediaUrl);
    }
  };

  return (
    <>
      <div
        style={{
          width: `${size}px`,
          minWidth: `${size}px`,
          height: `${size}px`,
        }}
        className={`rounded-full border border-white dark:border-mcm-line bg-white dark:bg-mcm-surface-3 relative cursor-pointer`}
        onClick={(e) => {
          if (image && mediaUrl && !hasImageError) {
            e.stopPropagation();
            setIsLightboxOpen(true);
          } else if (activeUser && activeUser?.sessions?.length && isActivityInfo && !grouped) {
            setModalState({ isModalOpen: true, selectedUser: activeUser });
          }
        }}
      >
        {showPresence && (
          /* Sized to just the dot itself and pinned to the avatar's own
             bottom-right corner (a small negative offset so it sits half
             on/half off the edge, the standard presence-dot placement)
             rather than a wrapper the full size of the avatar positioned
             by percentage offsets — that made the dot's exact spot drift
             with avatar `size` and left it floating well outside the
             circle at larger sizes instead of anchored to the edge. */
          <div className="absolute -bottom-0.5 -right-0.5 z-10 leading-none">
            <CustomTooltip
              text={
                <div className={status === 'dnd' ? '' : 'capitalize'}>
                  {status === 'dnd' ? 'DND' : status}
                </div>
              }
            >
              {/* `status` can carry any string the presence feed sends
                  (e.g. "available") that isn't one of this lookup's five
                  keys — falling through with nothing rendered a dot-less
                  avatar for an actually-online agent. Default to the
                  online/green dot rather than silently showing none. */}
              {statusImageLookup[status] || statusImageLookup.online}
            </CustomTooltip>
          </div>
        )}
        {image && mediaUrl && !hasImageError ? (
          <img
            src={mediaUrl}
            className="w-full h-full rounded-full border"
            alt=""
            onError={handleAvatarImageError}
          />
        ) : (
          <div
            style={{
              color: lightColor,
              background: darkColor,
              gap: '1.5px',
            }}
            className={`flex items-center rounded-full justify-center text-sm font-bold h-full w-full ${textClass}`}
          >
            <span className="">{NAME?.split(' ')?.[0]?.charAt(0)?.toUpperCase()}</span>
            {NAME?.split(' ')?.[1] ? (
              <span className="">{NAME?.split(' ')?.[1]?.charAt(0)?.toUpperCase()}</span>
            ) : null}
          </div>
        )}
      </div>
      {modalState?.isModalOpen && (
        <UserLoginActivityModal
          modalState={modalState?.isModalOpen}
          setModalState={() => setModalState({ isModalOpen: false, selectedUser: null })}
          selectedUser={modalState?.selectedUser}
        />
      )}
      {isLightboxOpen && (
        <LightBoxPreview
          open={isLightboxOpen}
          onClose={() => setIsLightboxOpen(false)}
          mediaUrl={mediaUrl}
          alt={NAME || 'Avatar'}
          type="image"
          senderName={NAME}
          senderAvatar={mediaUrl}
        />
      )}
    </>
  );
};

export default CustomAvatar;
