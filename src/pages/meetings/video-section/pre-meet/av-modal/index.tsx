import { SpeakerLine } from '@/assets/icons';
import CustomAvatar from '@/components/custom/custom-avatar';
import CustomSelect from '@/components/custom/custom-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useJitsi } from '@/hooks/use-jitsi';
import { useUser } from '@/hooks/use-user';
import { validateMeetingPassword } from '@/services/api';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMutation } from '@tanstack/react-query';
import { KeyRound, Lock, Mic, MicOff, Settings2, VideoIcon, VideoOff, Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import * as yup from 'yup';
import { useSocketEvents } from '@/hooks/use-socket-events';

let removeListener: any = () => null;
type AVStep = 'av_setup' | 'password_gate' | '';

const getFriendlyPasswordError = (error: any) => {
  const safeParseJson = (value: string) => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const extractMessageFromObject = (value: any) => {
    if (!value || typeof value !== 'object') return '';

    return (
      value?.message ||
      value?.error?.message ||
      value?.data?.message ||
      value?.result?.message ||
      ''
    );
  };

  const candidates = [
    error?.response?.data?.error?.message,
    error?.response?.data?.message,
    error?.message,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    if (typeof candidate === 'object') {
      const nestedMessage = extractMessageFromObject(candidate);
      if (nestedMessage) return nestedMessage;
      continue;
    }

    if (typeof candidate === 'string') {
      const parsed = safeParseJson(candidate) || safeParseJson(candidate.replace(/\\"/g, '"'));
      const nestedMessage = extractMessageFromObject(parsed);
      if (nestedMessage) return nestedMessage;

      if (candidate.includes('","data":')) {
        return candidate
          .split('","data":')[0]
          ?.replace(/^\{"message":"?/, '')
          .trim();
      }

      return candidate;
    }
  }

  return 'Unable to validate meeting password right now.';
};

const AVModal = ({ meetState, setMeetState }: { meetState: any; setMeetState: any }) => {
  const { user } = useUser();
  const meetingActorUuid = user?.uuid || user?.guest_info?.uuid || '';
  const { isSocketConnected } = useSocketEvents();
  const [entryStep, setEntryStep] = useState<AVStep>('av_setup');
  const [meetingPassword, setMeetingPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [pendingJoinAction, setPendingJoinAction] = useState<{ withVideo: boolean } | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [isSetupComplete, setIsSetupComplete] = useState(false);

  useEffect(() => {
    if (meetingActorUuid && isSocketConnected) {
      const timer = setTimeout(() => {
        setIsSetupComplete(true);
      }, 3500);
      return () => clearTimeout(timer);
    } else {
      setIsSetupComplete(false);
    }
  }, [meetingActorUuid, isSocketConnected]);

  const guestName = user?.guest_info?.name || '';
  const nameSegments = guestName.trim().split(/\s+/).filter(Boolean);
  const guestFirstName = nameSegments[0] || '';
  const guestLastName = nameSegments.slice(1).join(' ');
  const displayFirstName = user?.user_info?.first_name || guestFirstName || 'Guest';
  const displayLastName = user?.user_info?.last_name || guestLastName || '';
  const displayName = `${displayFirstName} ${displayLastName}`.trim();

  const validationSchema = yup.object().shape({
    name: meetState?.isGuest ? yup.string().required('Name is required') : yup.string(),
    audio_device: yup.mixed(),
    video_device: yup.mixed(),
    speaker_device: yup.mixed(),
  });

  const { watch, setValue } = useForm({
    mode: 'all',
    defaultValues: {
      name: '',
      audio_device: null,
      video_device: null,
      speaker_device: null,
    },
    resolver: yupResolver(validationSchema),
  });

  const { mutateAsync: validateMeetingPasswordMutate, isPending: isValidatingPassword } =
    useMutation({
      mutationFn: validateMeetingPassword,
      mutationKey: ['validateMeetingPassword'],
    });

  const {
    errors,
    AVVideoTrack,
    devices,
    isTestingMic,
    handleTestMic,
    isRoomJoined,
    joinMeetHandler,
    updateLocalVideoTrack,
    destroyAVTracks,
    handleAVVideoPreview,
    handleAVAudioPreview,
    handleChangeSpeakerDevice,
    initializeSystemAVConfig,
    cameraDeviceId,
    micDeviceId,
    speakerDeviceId,
    isAVVideoMuted,
    isAVAudioMuted,
    muteAVVideoTrack,
    muteAVAudioTrack,
    isHost,
  } = useJitsi();

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({
        audio: true,
        video: true,
      })
      .then((response) => {
        response?.getTracks()?.forEach((track) => {
          track.stop();
        });
        (async () => {
          removeListener = await initializeSystemAVConfig();
        })();
      })
      .catch(() => {
        (async () => {
          removeListener = await initializeSystemAVConfig();
        })();
      });

    return () => {
      destroyAVTracks();
      removeListener();
    };
  }, []);

  useEffect(() => {
    handleAVVideoPreview();
  }, [cameraDeviceId]);

  useEffect(() => {
    handleAVAudioPreview();
  }, [micDeviceId]);

  useEffect(() => {
    handleChangeSpeakerDevice();
  }, [speakerDeviceId]);

  useEffect(() => {
    if (AVVideoTrack && Object.keys(AVVideoTrack).length > 0) {
      const video: any = document.querySelector('#avPreviewVideo');
      if (!video) return;

      try {
        video.srcObject = AVVideoTrack?.stream;
        const vidPromise = video?.play();
        if (vidPromise !== undefined) {
          vidPromise
            .then(() => {
              video?.play();
            })
            .catch(() => {
              video?.pause();
            });
        }
      } catch (err) {
        console.log('AV MODAL', err);
      }
    }
  }, [AVVideoTrack, isAVVideoMuted]);

  useEffect(() => {
    if (devices) {
      setValue('audio_device', {
        label: devices?.micDevices?.[0]?.label,
        value: devices?.micDevices?.[0]?.deviceId,
      });
      setValue('video_device', {
        label: devices?.cameraDevices?.[0]?.label,
        value: devices?.cameraDevices?.[0]?.deviceId,
      });
      setValue('speaker_device', {
        label: devices?.speakerDevices?.[0]?.label,
        value: devices?.speakerDevices?.[0]?.deviceId,
      });
    }
  }, [devices]);

  const continueHandle = async () => {
    await updateLocalVideoTrack();
    // await updateLocalAudioTrack();
    // closeWidget();
  };

  const proceedToJoinMeeting = async ({ withVideo = false }: { withVideo?: boolean }) => {
    if (isJoining || !isSocketConnected || !meetingActorUuid || !isSetupComplete) return;
    try {
      setIsJoining(true);
      await joinMeetHandler(meetState?.meetName, { withVideo, withAudio: !isAVAudioMuted });
      destroyAVTracks();
    } finally {
      setIsJoining(false);
    }
  };

  const handleSubmitForm = async ({ withVideo = false }: { withVideo?: boolean }) => {
    if (isJoining) return;
    const isPasswordValidationRequired = Boolean(
      meetState?.isPasswordRequired && !meetState?.isPasswordAuth && !isHost,
    );

    if (isPasswordValidationRequired) {
      setPendingJoinAction({ withVideo });
      setPasswordError('');
      setEntryStep('password_gate');
      return;
    }

    await proceedToJoinMeeting({ withVideo });
  };

  const handleValidateMeetingPassword = async () => {
    const password = meetingPassword.trim();
    const meetingId = String(meetState?.meetUniqueKey || '').trim();

    if (!password) {
      setPasswordError('Password is required.');
      return;
    }

    if (!meetingId) {
      setPasswordError('Meeting ID is missing.');
      return;
    }

    try {
      await validateMeetingPasswordMutate({ meetingId, password });
      setPasswordError('');
      setEntryStep('');
      setMeetingPassword('');
      setMeetState((prev: any) => ({ ...prev, isPasswordAuth: true }));

      const pendingAction = pendingJoinAction || { withVideo: false };
      setPendingJoinAction(null);
      await proceedToJoinMeeting({ withVideo: pendingAction.withVideo });
    } catch (error: any) {
      setPasswordError(getFriendlyPasswordError(error));
    }
  };

  const handleBackFromPasswordGate = () => {
    setEntryStep('av_setup');
    setPasswordError('');
    setMeetingPassword('');
    setPendingJoinAction(null);
  };

  const isConnecting = !isSocketConnected || !meetingActorUuid || !isSetupComplete;

  return (
    <div className="w-full min-h-screen flex flex-col relative">
      {/* Two gradient layers rather than one inline style, since inline
          `style` can't carry a `dark:` variant — light stays the warm
          sunset the rest of the app uses, dark drops to a deep warm brown
          with only a faint glow, matching the dark treatment the legacy
          boards already use (legacy-table-theme.css's `.dark .dash-legacy`)
          rather than switching to the console's cool blue-gray dark tokens. */}
      <div
        className="absolute inset-0 -z-10 dark:hidden"
        style={{ background: '#fdf1e2' }}
      />
      <div
        className="absolute inset-0 -z-10 hidden dark:block"
        style={{ background: '#1c140c' }}
      />
      <div className="fixed w-full h-16 z-1">
        {meetState?.isPortalUser && (
          <header className="bg-primary px-4 py-2.5 flex items-center h-full shadow-[0_2px_12px_rgba(194,98,46,0.25)]">
            <nav className="flex items-center w-full" aria-label="Global">
              <div className="gap-2.5 flex items-center">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-semibold text-white ring-1 ring-white/40">
                  {displayFirstName?.[0]}
                  {displayLastName?.[0]}
                </div>
                <p className="text-white font-semibold text-lg">{displayName}</p>
              </div>
            </nav>
          </header>
        )}
      </div>

      <div className="flex flex-1 w-full pt-16 items-center justify-center px-4 py-6">
        <div className="w-full max-w-5xl flex flex-col items-center gap-6">
          {entryStep === 'av_setup' ? (
            <>
              {/* Neither entry point on this screen said which meeting you were
                  about to join — the name was only ever used internally as the
                  join subject, never shown. */}
              {meetState?.meetName ? (
                <div className="text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8a6f57] dark:text-[#c8a887]">
                    You're about to join
                  </p>
                  <h2 className="text-xl md:text-2xl font-bold text-[#1A1A1A] dark:text-[#f5ede4] mt-0.5">
                    {meetState.meetName}
                  </h2>
                </div>
              ) : null}

              <div className="w-full rounded-[28px] border border-[rgba(225,200,165,0.55)] dark:border-[rgba(251,146,60,0.18)] bg-[rgba(255,253,251,0.92)] dark:bg-[rgba(23,15,10,0.92)] backdrop-blur-[20px] shadow-[0_20px_60px_-12px_rgba(154,78,30,0.3),0_4px_16px_rgba(154,78,30,0.14)] dark:shadow-[0_20px_60px_-12px_rgba(0,0,0,0.5)] p-5 md:p-8">
                <div className="flex md:flex-row flex-col items-stretch gap-6 md:gap-8">
                  <div className="md:w-3/5 w-full">
                    <div
                      className={`w-full aspect-video flex items-center justify-center relative overflow-hidden rounded-2xl ring-1 ring-[rgba(225,200,165,0.6)] dark:ring-[rgba(251,146,60,0.18)] shadow-[0_10px_30px_rgba(154,78,30,0.18)] text-white ${AVVideoTrack?.stream?.active && !isAVVideoMuted ? '' : 'bg-gradient-to-br from-[#2b2320] to-black'}`}
                    >
                      {errors?.['avVideo'] || !AVVideoTrack?.stream?.active || isAVVideoMuted ? (
                        <div className="flex flex-col justify-center items-center gap-3 w-full h-full text-center px-10">
                          {errors?.['avVideo'] ? (
                            <p className="text-sm text-white/85 leading-6">
                              {`${errors['avVideo']} — your camera device is being used by another application`}
                            </p>
                          ) : (
                            <>
                              <div className="rounded-full bg-white/10 p-1 ring-1 ring-white/15">
                                <CustomAvatar name={displayName || 'Guest'} size="120" />
                              </div>
                              <p className="text-xs font-medium uppercase tracking-wide text-white/50">
                                Camera is off
                              </p>
                            </>
                          )}
                        </div>
                      ) : (
                        <video
                          style={{ transform: 'rotateY(180deg)' }}
                          className="pointer-events-none w-full h-full object-cover"
                          autoPlay
                          playsInline
                          id="avPreviewVideo"
                        ></video>
                      )}

                      {/* Device pickers on the right choose *which* mic/camera to
                          use, but nothing let you actually mute either before
                          joining — every other pre-join lobby (Meet, Zoom, Teams)
                          has this. `muteAVAudioTrack`/`muteAVVideoTrack` already
                          existed on the Jitsi context, just never wired up here. */}
                      {!errors?.['avVideo'] && (
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2.5">
                          <button
                            type="button"
                            title={isAVAudioMuted ? 'Unmute microphone' : 'Mute microphone'}
                            aria-pressed={isAVAudioMuted}
                            onClick={() => muteAVAudioTrack()}
                            className={`flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-md transition-colors cursor-pointer ${
                              isAVAudioMuted
                                ? 'bg-red-500/90 hover:bg-red-500 text-white'
                                : 'bg-white/15 hover:bg-white/25 text-white ring-1 ring-white/20'
                            }`}
                          >
                            {isAVAudioMuted ? (
                              <MicOff className="h-4.5 w-4.5" />
                            ) : (
                              <Mic className="h-4.5 w-4.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            title={isAVVideoMuted ? 'Turn camera on' : 'Turn camera off'}
                            aria-pressed={isAVVideoMuted}
                            onClick={() => muteAVVideoTrack()}
                            className={`flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-md transition-colors cursor-pointer ${
                              isAVVideoMuted
                                ? 'bg-red-500/90 hover:bg-red-500 text-white'
                                : 'bg-white/15 hover:bg-white/25 text-white ring-1 ring-white/20'
                            }`}
                          >
                            {isAVVideoMuted ? (
                              <VideoOff className="h-4.5 w-4.5" />
                            ) : (
                              <VideoIcon className="h-4.5 w-4.5" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="md:w-2/5 w-full flex flex-col">
                    <div className="flex items-center gap-2.5 mb-5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FFF1E0] dark:bg-[rgba(251,146,60,0.16)]">
                        <Settings2 className="h-4.5 w-4.5 text-primary" />
                      </div>
                      <h3 className="text-[#1A1A1A] dark:text-[#f5ede4] font-bold text-lg">Meeting Settings</h3>
                    </div>

                    <div className="flex flex-col gap-4">
                      <div className="flex items-start gap-2.5">
                        <Mic className="mt-8 h-4 w-4 shrink-0 text-[#64748b] dark:text-[#c8a887]" />
                        <CustomSelect
                          className="flex-1"
                          label="Audio Devices"
                          value={watch('audio_device')}
                          handleChange={(e) => {
                            setValue('audio_device', e);
                          }}
                          placeholder="Select audio device"
                          options={
                            devices &&
                            devices?.micDevices &&
                            devices?.micDevices?.length &&
                            devices?.micDevices?.map((item: any) => ({
                              id: item.deviceId,
                              label: item.label,
                              value: item.deviceId,
                            }))
                          }
                        />
                      </div>

                      <div className="flex items-start gap-2.5">
                        <VideoIcon className="mt-8 h-4 w-4 shrink-0 text-[#64748b] dark:text-[#c8a887]" />
                        <CustomSelect
                          className="flex-1"
                          label="Video Devices"
                          placeholder="Select video device"
                          options={
                            devices &&
                            devices?.cameraDevices &&
                            devices?.cameraDevices?.length &&
                            devices?.cameraDevices?.map((item: any) => ({
                              id: item.deviceId,
                              label: item.label,
                              value: item.deviceId,
                            }))
                          }
                          value={watch('video_device')}
                          handleChange={(e) => {
                            setValue('video_device', e);
                          }}
                        />
                      </div>

                      <div className="flex items-start gap-2.5">
                        <Volume2 className="mt-8 h-4 w-4 shrink-0 text-[#64748b] dark:text-[#c8a887]" />
                        <CustomSelect
                          className="flex-1"
                          label="Speaker Devices"
                          placeholder="Select speaker device"
                          options={
                            devices &&
                            devices?.speakerDevices &&
                            devices?.speakerDevices?.length &&
                            devices?.speakerDevices?.map((item: any) => ({
                              id: item.deviceId,
                              label: item.label,
                              value: item.deviceId,
                            }))
                          }
                          value={watch('speaker_device')}
                          handleChange={(e) => {
                            setValue('speaker_device', e);
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[rgba(225,200,165,0.6)] dark:border-[rgba(251,146,60,0.14)] bg-[rgba(251,249,246,0.7)] dark:bg-[rgba(255,255,255,0.04)] px-4 py-3 mt-1">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wide text-[#475569] dark:text-[#d8c4a8]">
                            Mic test
                          </p>
                          <p className="text-xs text-[#6b6459] dark:text-[#a68f76] mt-0.5">
                            {isTestingMic ? 'Say hi — you will hear your voice' : 'Check your microphone before you join'}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant={'outline'}
                          className="shrink-0 rounded-full"
                          onClick={handleTestMic}
                        >
                          {isTestingMic ? 'Testing…' : 'Start test'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap justify-center">
                {isRoomJoined && (
                  <>
                    <Button
                      variant={'secondary'}
                      className="rounded-full min-w-32"
                      onClick={(e) => {
                        e.stopPropagation();
                        // closeWidget();
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="button" className="rounded-full min-w-32" onClick={continueHandle}>
                      Continue
                    </Button>
                  </>
                )}

                {!isRoomJoined && (
                  <>
                    <Button
                      className="cursor-pointer rounded-full min-w-44 h-11"
                      variant={'outline'}
                      type="button"
                      disabled={isJoining || isConnecting}
                      onClick={() => handleSubmitForm({ withVideo: false })}
                    >
                      <SpeakerLine className="w-4.5 h-4.5" />
                      {isConnecting ? 'Connecting…' : isJoining ? 'Joining…' : 'Start with audio'}
                    </Button>
                    {!errors['avVideo'] && (
                      <Button
                        type="button"
                        className="rounded-full min-w-44 h-11"
                        disabled={isJoining || isConnecting}
                        onClick={() => handleSubmitForm({ withVideo: true })}
                      >
                        <VideoIcon className="w-4.5 h-4.5" />
                        {isConnecting ? 'Connecting…' : isJoining ? 'Joining…' : 'Start with video'}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="w-full max-w-md rounded-[24px] border border-[rgba(225,200,165,0.55)] dark:border-[rgba(251,146,60,0.18)] bg-[rgba(255,253,251,0.95)] dark:bg-[rgba(23,15,10,0.95)] backdrop-blur-[16px] shadow-[0_20px_60px_-12px_rgba(154,78,30,0.3)] dark:shadow-[0_20px_60px_-12px_rgba(0,0,0,0.5)] p-6 flex flex-col gap-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FFF1E0] dark:bg-[rgba(251,146,60,0.16)]">
                  <Lock className="h-4.5 w-4.5 text-primary" />
                </div>
                <h3 className="text-xl font-bold text-[#1A1A1A] dark:text-[#f5ede4]">Enter meeting password</h3>
              </div>
              <Input
                label="Password"
                type="password"
                placeholder="Enter password"
                value={meetingPassword}
                onChange={(event) => {
                  setMeetingPassword(event.target.value);
                  if (passwordError) setPasswordError('');
                }}
                error={passwordError}
                maxLength={32}
                autoFocus
              />
              {passwordError ? (
                <p className="text-sm text-red-600 leading-5">{passwordError}</p>
              ) : null}
              <div className="flex items-center justify-end gap-2 mt-1">
                <Button type="button" variant="outline" className="rounded-full" onClick={handleBackFromPasswordGate}>
                  Back
                </Button>
                <Button
                  type="button"
                  className="rounded-full"
                  onClick={handleValidateMeetingPassword}
                  disabled={
                    isValidatingPassword ||
                    isJoining ||
                    !isSocketConnected ||
                    !meetingActorUuid ||
                    !isSetupComplete
                  }
                >
                  <KeyRound className="w-4 h-4" />
                  {isValidatingPassword ? 'Validating…' : isJoining ? 'Joining…' : 'Continue'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AVModal;
