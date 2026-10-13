import { useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { ExternalLink, GitCommitHorizontal, Info, Scale } from 'lucide-react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { isUnknownRecord } from '../lib/unknown';
import {
  REINS_SOURCE_URL,
  WHIP_REPOSITORY_URL,
} from '../services/githubReleases';
import { CheckForUpdates } from './CheckForUpdates';
import { ReinsMark } from './app-ui';
import { BottomSheet, ListGroup, ListRow } from './nightfall';
import { Text } from './ui/text';

export function useAppVersion(): string {
  const { t } = useTranslation();
  return (
    Application.nativeApplicationVersion ||
    Constants.expoConfig?.version ||
    t('common.unavailable')
  );
}

/** About and support rows for Settings; About opens a sheet with release details. */
export function AboutRows({
  version,
  onOpenLicenses,
}: {
  version: string;
  onOpenLicenses: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const extra: unknown = Constants.expoConfig?.extra;
  const commit =
    isUnknownRecord(extra) &&
    typeof extra.gitCommit === 'string' &&
    /^[0-9a-f]{7,64}$/i.test(extra.gitCommit)
      ? extra.gitCommit
      : null;
  const openUrl = (url: string) => {
    void Linking.openURL(url).catch(error =>
      Alert.alert(t('about.githubError'), String(error)),
    );
  };
  return (
    <>
      <ListGroup>
        <ListRow
          chevron
          icon={Info}
          label={t('about.aboutReins')}
          value={version}
          onPress={() => setOpen(true)}
        />
        <ListRow
          chevron
          icon={ExternalLink}
          label={t('about.githubRepository')}
          accessibilityRole="link"
          onPress={() => openUrl(REINS_SOURCE_URL)}
        />
        <ListRow
          chevron
          icon={Scale}
          label={t('about.openLicenses')}
          accessibilityLabel={t('about.openLicenses')}
          onPress={onOpenLicenses}
        />
      </ListGroup>
      <BottomSheet
        visible={open}
        title={t('about.aboutReins')}
        subtitle={`Reins · ${version}`}
        lead={<ReinsMark size={44} accessibilityLabel={t('about.appIcon')} />}
        onClose={() => setOpen(false)}>
        <View className="items-center gap-2 px-2 pb-1">
          <Text className="text-center text-sm leading-[21px] text-text2">
            {t('about.forkAttribution')}
          </Text>
          <CheckForUpdates installedVersion={version} />
        </View>
        {commit ? (
          <ListGroup tone="raised" radius={20}>
            <ListRow
              chevron
              icon={GitCommitHorizontal}
              label={t('about.commit', { hash: commit.slice(0, 12) })}
              accessibilityRole="link"
              tileBackground="transparent"
              onPress={() => openUrl(`${WHIP_REPOSITORY_URL}/commit/${commit}`)}
            />
          </ListGroup>
        ) : null}
      </BottomSheet>
    </>
  );
}
