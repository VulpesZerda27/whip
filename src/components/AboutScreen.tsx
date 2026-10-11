import { useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { ExternalLink, Info, Scale } from 'lucide-react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { isUnknownRecord } from '../lib/unknown';
import {
  REINS_SOURCE_URL,
  WHIP_REPOSITORY_URL,
} from '../services/githubReleases';
import { CollapsibleSectionCard } from './CollapsibleSectionCard';
import { CheckForUpdates } from './CheckForUpdates';
import { hapticPress, ReinsMark } from './app-ui';
import { Button } from './ui/button';
import { Icon } from './ui/icon';
import { Text } from './ui/text';

export function AboutSection({
  onOpenLicenses,
}: {
  onOpenLicenses: () => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const version =
    Application.nativeApplicationVersion ||
    Constants.expoConfig?.version ||
    t('common.unavailable');
  const extra: unknown = Constants.expoConfig?.extra;
  const commit =
    isUnknownRecord(extra) &&
    typeof extra.gitCommit === 'string' &&
    /^[0-9a-f]{7,64}$/i.test(extra.gitCommit)
      ? extra.gitCommit
      : null;
  const open = (url: string) => {
    void Linking.openURL(url).catch(error =>
      Alert.alert(t('about.githubError'), String(error)),
    );
  };
  return (
    <View className="px-4 py-2">
      <CollapsibleSectionCard
        title={t('about.title')}
        icon={Info}
        description={`Reins · ${version}`}
        expanded={expanded}
        onToggle={() => setExpanded(value => !value)}
      >
        <View className="items-center gap-3 p-4">
          <ReinsMark size={64} accessibilityLabel={t('about.appIcon')} />
          <Text className="text-center text-sm text-muted-foreground">
            {t('about.forkAttribution')}
          </Text>
          <Button
            variant="outline"
            accessibilityRole="link"
            onPress={hapticPress(() => open(REINS_SOURCE_URL))}
          >
            <Icon as={ExternalLink} size={17} />
            <Text>{t('about.githubRepository')}</Text>
          </Button>
          {commit ? (
            <Button
              variant="link"
              accessibilityRole="link"
              onPress={hapticPress(() =>
                open(`${WHIP_REPOSITORY_URL}/commit/${commit}`),
              )}
            >
              <Text className="text-xs">
                {t('about.commit', { hash: commit.slice(0, 12) })}
              </Text>
            </Button>
          ) : null}
          <CheckForUpdates installedVersion={version} />
          <Button
            variant="ghost"
            accessibilityLabel={t('about.openLicenses')}
            onPress={hapticPress(onOpenLicenses)}
          >
            <Icon as={Scale} size={18} />
            <Text>{t('licenses.title')}</Text>
          </Button>
        </View>
      </CollapsibleSectionCard>
    </View>
  );
}
