import { Copy, KeyRound } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/src/theme';
import { reportBackgroundFailure } from '../services/backgroundOperations';
import { BottomSheet, ListGroup, ListRow } from './nightfall';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCopyPrivate: () => void | Promise<void>;
  onCopyPublic: () => void | Promise<void>;
}

export function SshKeyCopySheet({ visible, onClose, onCopyPrivate, onCopyPublic }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const run = (action: () => void | Promise<void>) => () => {
    const operation = action();
    if (operation) reportBackgroundFailure(operation, 'ssh-key-copy');
  };
  return (
    <BottomSheet
      closeLabel={t('connection.closeKeyActions')}
      subtitle={t('connection.copyWhich')}
      title={t('connection.copySshKey')}
      visible={visible}
      onClose={onClose}>
      <ListGroup tone="raised" radius={20}>
        <ListRow icon={KeyRound} label={t('connection.copyPublic')} minHeight={58} tileBackground={colors.trackOff} tileRadius={11} tileSize={34} onPress={run(onCopyPublic)} />
        <ListRow icon={Copy} label={t('connection.copyPrivate')} minHeight={58} tileBackground={colors.trackOff} tileRadius={11} tileSize={34} onPress={run(onCopyPrivate)} />
      </ListGroup>
    </BottomSheet>
  );
}
