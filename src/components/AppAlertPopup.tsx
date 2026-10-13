import { CircleAlert } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Dialog } from './nightfall';

export interface AppAlertContent {
  message?: string;
  title: string;
}

interface AppAlertPopupProps extends AppAlertContent {
  actionLabel?: string;
  onClose: () => void;
  visible: boolean;
}

export function AppAlertPopup({
  actionLabel,
  message,
  onClose,
  title,
  visible,
}: AppAlertPopupProps) {
  const { t } = useTranslation();
  return (
    <Dialog
      body={message}
      confirmLabel={actionLabel || t('common.close')}
      confirmTone="accent"
      icon={CircleAlert}
      title={title}
      tone="blocked"
      visible={visible}
      onConfirm={onClose}
    />
  );
}
