import { TriangleAlert, type LucideIcon } from 'lucide-react-native';

import { Dialog } from './nightfall';

interface Props {
  busy?: boolean;
  confirmLabel: string;
  copy: string;
  detail?: string;
  detailIcon?: LucideIcon;
  icon?: LucideIcon;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  visible: boolean;
  /** Destructive by default; `warning` suits restarts. */
  tone?: 'blocked' | 'warning';
}

export function ConfirmationPopup({
  busy = false,
  confirmLabel,
  copy,
  detail,
  detailIcon,
  icon = TriangleAlert,
  onCancel,
  onConfirm,
  title,
  visible,
  tone = 'blocked',
}: Props) {
  return (
    <Dialog
      body={copy}
      busy={busy}
      confirmLabel={confirmLabel}
      detail={detail}
      detailIcon={detailIcon}
      icon={icon}
      title={title}
      tone={tone}
      visible={visible}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
