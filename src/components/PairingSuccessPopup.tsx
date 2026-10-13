import { CircleCheckBig, Server } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import type { PairHostResult } from '../lib/sshPairing';
import { Dialog } from './nightfall';

interface Props {
  onClose: () => void;
  result: PairHostResult | null;
}

export function PairingSuccessPopup({ onClose, result }: Props) {
  const { t } = useTranslation();
  const destination = result ? `${result.sshUser}@${result.sshHost}` : '';

  return (
    <Dialog
      body={result ? t('pairing.successKeyCopy') : undefined}
      confirmLabel={t('pairing.done')}
      confirmTone="accent"
      detail={destination}
      detailIcon={Server}
      icon={CircleCheckBig}
      title={t(result?.alreadyPresent ? 'pairing.alreadyPairedTitle' : 'pairing.successTitle')}
      tone="accent"
      visible={result !== null}
      onConfirm={onClose}
    />
  );
}
