import AlertConfirm from '@/components/custom/alert-confirm';
import FileCropper from '@/components/custom/file-cropper';
import Loader from '@/components/custom/loader';
import { Button } from '@/components/ui/button';
import { useCompanyFeatures } from '@/hooks/rbac';
import { requiredString } from '@/lib/schema';
import { Icon } from '@/assets/icons/icon';
import { handleAlert, MAX_FILE_SIZE, validateFileSize } from '@/lib/utils';
import { invalidateGlobalUsersDirectory } from '@/lib/invalidate-global-users-directory';
import { isDemoMode } from '@/lib/demo-mode';
import { basicInitialState } from '@/pages/admin-settings/constants';
import BasicInformation from '@/pages/admin-settings/people/update-forwarding/basic-information';
import '@/components/mcm/mcm-page.css';
import { getUserDetails, mediaUploadUrl, userProfileUpdate } from '@/services/api';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import * as yup from 'yup';
import CustomAvatar from '@/components/custom/custom-avatar';
import HowCallsReachYou from './how-calls-reach-you';
import CallSetupGuide from './call-setup-guide';
import { buildProfileUpdatePayload } from './profile-update-payload';

export const BasicInfoSettingSchema = yup.object().shape({
  basic: yup.object().shape({
    first_name: requiredString('First name', 2, 50),
    last_name: requiredString('Last name', 2, 50),
    job_title: yup.string().trim().required('Fill a job title'),
    site: yup.object().shape({
      value: yup.string().trim().required('Select a location'),
    }),
  }),
});

const BasicInfoSettings = () => {
  const [image, setImage] = useState<any>(null);
  const [fileName, setFileName] = useState<any>(null);
  const [modalState, setModalState] = useState(false);
  const [loader, setLoader] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isImageRemoved, setIsImageRemoved] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const cropperUploadRef = useRef<any>(null);
  const queryClient: any = useQueryClient();
  const { features } = useCompanyFeatures();
  const basicInfoAccess =
    features?.plan_features?.account_setting?.USER?.action ||
    features?.plan_features?.account_setting?.access?.USER?.action;

  const methods = useForm<any>({
    mode: 'all',
    defaultValues: { basic: basicInitialState },
    resolver: yupResolver(BasicInfoSettingSchema),
  });

  const { handleSubmit, setValue, watch } = methods;

  const { data: userInfoData, isPending: PendingUserData } = useQuery({
    queryKey: ['getUserDetailsQueryFn'],
    queryFn: getUserDetails,
    select: (data) => data?.data?.data?.result,
  });

  const { mutate: mutateProfileUpdate, isPending: PendingProfileUpdate } = useMutation({
    mutationFn: userProfileUpdate,
    onSuccess: (data: any) => {
      handleAlert({
        text: data?.data?.message || 'Profile updated successfully!',
        type: 'success',
      });
      queryClient.invalidateQueries(['getUsersDetails', 'getUserDetailsQueryFn'], {
        exact: true,
      });
      invalidateGlobalUsersDirectory(queryClient);
      setLoader(false);
    },
  });

  const handleChangeFile = (e: any) => {
    const file = e.target?.files?.[0];
    const fileSizeValid = validateFileSize(MAX_FILE_SIZE, file);
    if (!fileSizeValid) return;
    if (!file) return alert('something went wrong');
    if (!file?.type.startsWith('image/')) {
      return handleAlert({
        text: 'File type is invalid. Only jpg, jpeg and png file types are accepted.',
        type: 'error',
      });
    }
    setFileName(file?.name);
    const reader = new FileReader();
    reader.onload = () => {
      setImage(reader.result);
      setLoader(false);
    };
    reader.readAsDataURL(e.target.files[0]);
    setModalState(true);
  };
  const handleRemoveImage = () => {
    setImagePreview('');
    setValue('profile', '');
    setIsImageRemoved(true);
    setRemoveConfirmOpen(false);
  };

  const { mutateAsync: uploadMediaMutate, isPending: uploadMediaLoad } = useMutation({
    mutationFn: mediaUploadUrl,
  });

  const handleUpload = async () => {
    if (loader) return;
    if (!cropperUploadRef?.current) return;
    const blobUrl = cropperUploadRef?.current?.getCropData();
    const response = await fetch(blobUrl);
    const blob = await response.blob();
    const file = new File([blob], fileName, { type: blob.type });

    setImagePreview(blobUrl);
    if (file) {
      /* Demo mode has no real object storage to hand back a presigned URL,
         so the upload/PUT round trip below has nothing to talk to — it used
         to fail silently and leave the crop dialog stuck open with no
         feedback. The cropped image is already right here in the browser,
         so demo mode just uses it directly instead of a network round trip
         that can never succeed. */
      if (isDemoMode()) {
        setValue('profile', blobUrl);
        setIsImageRemoved(false);
        setModalState(false);
        return;
      }
      try {
        const uploadMediaResponse = await uploadMediaMutate({
          uuid: userInfoData?.company_info?.uuid,
          type: 'profile',
          file_name: file?.name,
        });
        const result = uploadMediaResponse?.data?.data?.result;
        if (result?.file_name && result?.url) {
          setLoader(true);
          const { url = '', file_name = '' } = result || {};
          const uploadFileResponse = await fetch(url, {
            method: 'PUT',
            body: file,
          });
          if (uploadFileResponse.status === 200) {
            setValue('profile', file_name);
            /* A new picture undoes an earlier removal in the same session —
               without this the save would still send the removal. */
            setIsImageRemoved(false);
            setModalState(false);
          }
        } else {
          handleAlert({
            text: 'Could not upload the image. Please try again.',
            type: 'error',
          });
          setLoader(false);
        }
      } catch (error) {
        console.log(error);
        setLoader(false);
      }
    }
  };

  const onSubmit = () => {
    mutateProfileUpdate(
      buildProfileUpdatePayload({
        userInfoData,
        basic: {
          first_name: watch('basic.first_name'),
          last_name: watch('basic.last_name'),
          job_title: watch('basic.job_title'),
          site_uuid: watch('basic.site')?.value,
        },
        uploadedProfile: watch('profile'),
        isImageRemoved,
      }),
    );
  };

  useEffect(() => {
    if (userInfoData?.user_info) {
      const user = userInfoData?.user_info;
      setValue('basic', {
        email: user.email || '',
        site: {
          label: user.site_detail?.name || 'Select',
          value: user.site_uuid || '',
        },
        extension: user.extension,
        phone: user.phone,
        caller_id: user.caller_id,
        job_title: user.job_title,
        first_name: user.first_name,
        last_name: user.last_name,
        profile: user.profile,
      });

      setIsImageRemoved(false);
    }
  }, [userInfoData]);

  return (
    <>
      <section className="flex h-full w-full flex-col overflow-hidden bg-gray-200/15">
        {/* <Breadcrumb breadcrumbs={breadcrumbData} /> */}
        <div className="flex items-center justify-between p-3 border-b border-gray-200 min-h-[65px] bg-white">
          <div>
            <p className="text-gray-900 font-semibold text-lg">Basic Info</p>
            <p className="text-gray-500 text-xs">
              Your name, job title and location as colleagues see them in the directory — and below,
              how calls actually reach you.
            </p>
          </div>
        </div>
        {PendingUserData ? (
          <div className="flex items-center justify-center p-5">
            <Loader variant="blue" size="sm" />
          </div>
        ) : (
          <div className="w-full flex-1 overflow-y-auto p-4">
            <div className="mx-auto mb-4 w-full md:max-w-[80%]">
              {/* Only the name/extension/location fields live under
                  `user_info`; the call rules, settings and greetings are its
                  siblings at the response root, so they are passed from there. */}
              <HowCallsReachYou
                userInfo={userInfoData?.user_info}
                callForwarding={userInfoData?.call_forwarding}
                settings={userInfoData?.settings}
                greetings={userInfoData?.greetings}
              />
            </div>
            <div className="mx-auto flex w-full flex-col gap-4 rounded-xl bg-white p-6 shadow-xs md:max-w-[80%]">
              <div className="flex items-center gap-5 mb-6">
                <label htmlFor="file-upload" className="relative shrink-0 cursor-pointer group">
                  <div className="relative w-24 h-24 rounded-full ring-4 ring-white shadow-md overflow-hidden">
                    {imagePreview || watch('profile') ? (
                      <img
                        src={imagePreview || watch('profile')}
                        alt="Preview"
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <CustomAvatar
                        size="96"
                        name={`${userInfoData?.user_info?.first_name} ${userInfoData?.user_info?.last_name || ''}`}
                        showPresence={false}
                        extension={userInfoData?.user_info?.extension}
                        image={
                          isImageRemoved
                            ? null
                            : imagePreview || watch('profile') || userInfoData?.user_info?.profile
                        }
                        isActivityInfo={false}
                      />
                    )}
                    {/* Hover scrim over the whole photo makes "click to change"
                        obvious without a permanently-visible badge competing
                        with the picture itself. */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
                      <Icon
                        name="EditIcon"
                        className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                    </div>
                  </div>

                  <input
                    id="file-upload"
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleChangeFile}
                  />
                </label>

                <div className="flex flex-col gap-1">
                  <p className="text-sm font-semibold text-gray-900">Profile photo</p>
                  <p className="text-xs text-gray-500">JPG or PNG. Recommended 400×400px.</p>
                  <div className="flex items-center gap-4 mt-1.5">
                    <label
                      htmlFor="file-upload"
                      className="text-xs font-semibold text-primary cursor-pointer hover:underline"
                    >
                      Upload new photo
                    </label>
                    {(imagePreview || watch('profile')) && (
                      <button
                        type="button"
                        onClick={() => setRemoveConfirmOpen(true)}
                        className="text-xs font-semibold text-red-600 cursor-pointer hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div
                className="mcm-page"
                style={
                  {
                    display: 'block',
                    height: 'auto',
                    minHeight: 0,
                    overflow: 'visible',
                    background: 'transparent',
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                    lineHeight: 'inherit',
                    '--sans': 'inherit',
                    '--mono': 'inherit',
                  } as CSSProperties
                }
              >
                <FormProvider {...methods}>
                  <form onSubmit={handleSubmit(onSubmit)} className="flex w-full flex-col gap-5">
                    <BasicInformation
                      isChooseTemplate={false}
                      isSiteDisabled={false}
                      customClass=""
                    />
                    {basicInfoAccess?.edit && (
                      <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
                        <Button
                          variant={'primary'}
                          type="submit"
                          disabled={PendingProfileUpdate}
                          /* The `.mcm-page button` reset a few sections up (there
                             for icon-only ghost buttons) strips this button's
                             background/text-color classes since it has higher
                             specificity than a plain Tailwind utility class —
                             `!` forces these to win regardless. */
                          className="!bg-primary !text-white !border-primary hover:!bg-primary/90 min-w-[130px] justify-center"
                        >
                          {PendingProfileUpdate ? (
                            <span className="flex items-center gap-2">
                              <Loader variant="white" size="sm" />
                              Saving…
                            </span>
                          ) : (
                            'Save changes'
                          )}
                        </Button>
                      </div>
                    )}
                  </form>
                </FormProvider>

                {/* The profile above says who you are; this says what happens
                    when someone calls you, which is the part people arrive on
                    this page looking for and could not previously see. */}
                <CallSetupGuide userInfo={userInfoData} />
              </div>
            </div>
          </div>
        )}
        <AlertConfirm
          open={removeConfirmOpen}
          setOpen={setRemoveConfirmOpen}
          headerText="Remove profile picture"
          descriptionTextComp={
            <div className="text-md">
              Are you sure you want to remove your profile picture?
            </div>
          }
          closeBtnText="No"
          confirmBtnText="Yes"
          onConfirm={handleRemoveImage}
          onCancel={() => setRemoveConfirmOpen(false)}
        />
        {modalState && (
          <FileCropper
            {...{
              image,
              handleUpload,
              modalState,
              setModalState,
              uploadMediaLoad,
              setLoader,
              loader,
            }}
            ref={cropperUploadRef}
          />
        )}
      </section>
    </>
  );
};

export default BasicInfoSettings;
