import { useEffect, useRef, useState } from 'react';
import { BlurTargetView } from 'expo-blur';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import type { DevicePreferencesController } from '../hooks/useDevicePreferences';
import { SpinnerFrameRateProvider } from '../hooks/useSpinnerFrameRate';
import type { HostManagementController } from '../hooks/useHostManagement';
import type { AppNavigationController } from '../hooks/useAppNavigation';
import type { RemoteFilesController } from '../hooks/useRemoteFilesController';
import type { SessionRuntimeController } from '../hooks/useSessionRuntimeManager';
import type { useApplicationSecurity } from '../hooks/useApplicationSecurity';
import type { useLiveHostTelemetry } from '../hooks/useLiveHostTelemetry';
import type { useTerminalHistory } from '../hooks/useTerminalHistory';
import type { useTerminalSessions } from '../hooks/useTerminalSessions';
import { hostRuntimeSummary } from '../lib/hostRuntimeSummary';
import {
  isLiveHostSshConnected,
  visibleLiveHostLatency,
} from '../lib/liveHostLatency';
import { dismissAgentAlertsForTab } from '../services/alerts';
import {
  ignoreExpectedCancellation,
  reportBackgroundFailure,
} from '../services/backgroundOperations';
import { useTheme } from '../theme';
import { AgentStatusAnimationProvider } from './app-ui';
import { AppOverlays } from './AppOverlays';
import {
  StableStatusBar,
  TerminalKeepAwake,
  TerminalVolumeKeyBinding,
} from './AppPlatformBindings';
import { BottomNavigation } from './BottomNavigation';
import { ConnectRequiredScreen } from './ConnectRequiredScreen';
import { useCodexHosts } from '../hooks/useCodexHosts';
import { CodexChatScreen } from './CodexChatScreen';
import { useAppForeground } from '../hooks/useAppForeground';
import { updateCodexActivity } from '../lib/codexInbox';
import { useCodexNotificationNavigation } from '../hooks/useCodexNotificationNavigation';
import type { useAgentNotifications } from '../hooks/useAgentNotifications';
import { codexChatKey } from '../services/codexDaemon';
import { ChatsScreen } from './ChatsScreen';
import { useChatLibrary } from '../hooks/useChatLibrary';
import { useChatExperience } from '../hooks/useChatExperience';
import { GlassProvider } from './GlassSurface';
import { HostsScreen } from './HostsScreen';
import { LiveSessionView } from './LiveSessionView';
import { SettingsScreen } from './SettingsScreen';
import { ScreenUpdates } from './ScreenUpdates';

const NavigationBlurTarget = Platform.OS === 'android' ? View : BlurTargetView;

interface AppShellProps {
  preferences: DevicePreferencesController;
  hosts: HostManagementController;
  sessions: SessionRuntimeController;
  navigation: AppNavigationController;
  remoteFiles: RemoteFilesController;
  security: ReturnType<typeof useApplicationSecurity>;
  terminals: ReturnType<typeof useTerminalSessions>;
  telemetry: ReturnType<typeof useLiveHostTelemetry>;
  history: ReturnType<typeof useTerminalHistory>;
  notifications?: ReturnType<typeof useAgentNotifications>;
}

/** Main application presentation. State and lifecycle stay in domain controllers. */
export function AppShell({
  preferences,
  hosts,
  sessions,
  navigation,
  remoteFiles,
  security,
  terminals,
  telemetry,
  history,
  notifications,
}: AppShellProps) {
  const { t } = useTranslation();
  const { colors: theme, isDark } = useTheme();
  const navigationBlurTargetRef = useRef<View | null>(null);
  const storedPreferences = preferences.value;
  const effectivePreferences = storedPreferences;
  const {
    alertsEnabled,
    agentAlertLevel,
    persistentAlertDurationSeconds,
    ttsEnabled,
    keepScreenOn,
    terminal: terminalPreferences,
    terminalControlUsage,
  } = effectivePreferences;
  const codexHosts = useCodexHosts(sessions, !security.locked && !hosts.editorProfile, {alertsEnabled, agentAlertLevel, persistentAlertDurationSeconds, ttsEnabled});
  const [codexSelection, setCodexSelection] = useState<{hostId:string;threadId:string} | null>(null);
  const codexHost = codexHosts.find(h=>h.hostId===codexSelection?.hostId);
  const codexVisible = Boolean(codexSelection && navigation.state.tab === 'chat');
  const openCodex = (hostId:string,threadId:string) => {
    setCodexSelection({hostId,threadId});
    const host = codexHosts.find(h=>h.hostId===hostId);
    if (host) sessions.select(host.sessionId, 'terminal');
    navigation.showChat();
  };
  const activeSession = sessions.activeSession;
  const liveClient = activeSession?.connectionStatus === 'ready'
    ? sessions.activeClient ?? null
    : null;
  const activeTelemetry = activeSession
    ? telemetry.get(activeSession.id)
    : null;
  const terminalVisible =
    (navigation.state.tab === 'terminal' || navigation.state.tab === 'chat') && !hosts.editorProfile;
  const immersiveTerminal = terminalVisible && (Boolean(activeSession) || codexVisible);
  const activeTerminalVisible = Boolean(
    navigation.state.tab === 'terminal' && immersiveTerminal &&
      activeSession &&
      terminals.get(activeSession.id, sessions.state).activeTerminalId,
  );
  const chatLibrary = useChatLibrary();
  const foreground = useAppForeground();
  const {loaded: libraryLoaded, update: updateLibrary} = chatLibrary;
  const codexRevision = codexHosts.map(h => `${h.hostId}:${h.snapshot.revision}`).join('|');
  useEffect(() => {
    if (!libraryLoaded) return;
    updateLibrary(old => updateCodexActivity(old, codexHosts.map(h => ({hostId: h.hostId, threads: h.snapshot.threads})),
      foreground && !security.locked && codexVisible ? codexSelection : null));
    // Revision identifies the immutable daemon snapshots without a render-created array dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryLoaded, updateLibrary, codexRevision, foreground, security.locked, codexVisible, codexSelection]);
  useCodexNotificationNavigation(notifications, !security.locked, sessions, hosts, openCodex, () => setCodexSelection(null));
  const activeChatTerminalId = activeSession ? terminals.get(activeSession.id, sessions.state).activeTerminalId : null;
  const activeChatPaneId = activeSession?.snapshot.panes.find(pane => pane.terminal_id === activeChatTerminalId)?.pane_id;
  const chatExperience = useChatExperience(chatLibrary, sessions, navigation, hosts.hosts,
    codexVisible ? undefined : activeChatPaneId, !security.locked && !hosts.editorProfile);
  // Chat keeps the system indicators beside the camera cutout and its title
  // below the top safe area, even when terminals normally use fullscreen.
  const chatSessionVisible = navigation.state.tab === 'chat';
  const fullscreenVisible = !chatSessionVisible && (immersiveTerminal
    ? activeTerminalVisible && terminalPreferences.fullscreen
    : false);

  const overlaysVisible =
    hosts.editorProfile !== null ||
    hosts.newHostOpen ||
    hosts.unlockedGlobalKeys !== null ||
    hosts.knownHostsOpen ||
    navigation.licensesOpen;

  return (
    <SpinnerFrameRateProvider smoothSpinners={storedPreferences.smoothSpinners}>
      <StableStatusBar
        hidden={fullscreenVisible}
        backgroundColor={theme.canvas}
        isDark={isDark}
      />
      <SafeAreaView
        className="flex-1 bg-background"
        edges={fullscreenVisible ? ['left', 'right'] : ['top', 'left', 'right']}
      >
        <TerminalVolumeKeyBinding
          enabled={activeTerminalVisible}
          volumeUpAction={terminalPreferences.volumeUpAction}
          volumeDownAction={terminalPreferences.volumeDownAction}
        />
        {keepScreenOn && activeTerminalVisible ? <TerminalKeepAwake /> : null}
        <GlassProvider
          blurTarget={navigationBlurTargetRef}
          enabled={false}
        >
          <View className="flex-1 bg-background">
            <NavigationBlurTarget
              ref={navigationBlurTargetRef}
              style={styles.navigationBlurTarget}
            >
              {/* Populated tabs remain mounted to preserve renderer/native-tree latency. */}
              <View
                importantForAccessibility={
                  immersiveTerminal ? 'no-hide-descendants' : 'auto'
                }
                pointerEvents={immersiveTerminal ? 'none' : 'auto'}
                style={
                  immersiveTerminal
                    ? styles.hiddenTab
                    : styles.navigationForeground
                }
              >
                {navigation.mountedTabs.has('chats') ? (
                  <View
                    importantForAccessibility={navigation.state.tab === 'chats' ? 'auto' : 'no-hide-descendants'}
                    pointerEvents={navigation.state.tab === 'chats' ? 'auto' : 'none'}
                    style={navigation.state.tab === 'chats' ? styles.tabScreen : styles.hiddenTab}
                  >
                    <ChatsScreen
                      library={chatLibrary}
                      codexHosts={codexHosts}
                      onOpenCodex={openCodex}
                      onOpenChat={target => { setCodexSelection(null); return chatExperience.open(target); }}
                      openError={chatExperience.error}
                      hosts={hosts.hosts}
                      sessions={sessions}
                      onManageHosts={() => navigation.selectTab('hosts')}
                      onShowChats={() => navigation.selectTab('chats')}
                    />
                  </View>
                ) : null}

                {navigation.mountedTabs.has('hosts') ? (
                  <View
                    importantForAccessibility={
                      navigation.state.tab === 'hosts'
                        ? 'auto'
                        : 'no-hide-descendants'
                    }
                    pointerEvents={
                      navigation.state.tab === 'hosts' ? 'auto' : 'none'
                    }
                    style={
                      navigation.state.tab === 'hosts'
                        ? styles.tabScreen
                        : styles.hiddenTab
                    }
                  >
                    <AgentStatusAnimationProvider
                      enabled={navigation.state.tab === 'hosts'}
                    >
                      <ScreenUpdates active={navigation.state.tab === 'hosts'}>
                        {() => (
                          <HostsScreen
                            hosts={hosts.hosts}
                            activeHostId={activeSession?.hostId || null}
                            connectedHostIds={sessions.presentationSessions
                              .filter(session =>
                                isLiveHostSshConnected(session.connectionStatus),
                              )
                              .map(session => session.hostId)}
                            latencyMsByHostId={Object.fromEntries(
                              sessions.presentationSessions.map(session => [
                                session.hostId,
                                visibleLiveHostLatency(
                                  session.connectionStatus,
                                  telemetry.get(session.id).latencyMs,
                                ),
                              ]),
                            )}
                            runtimeByHostId={Object.fromEntries(
                              sessions.presentationSessions.map(session => [
                                session.hostId,
                                hostRuntimeSummary(session.snapshot),
                              ]),
                            )}
                            connectingHostIds={[
                              ...sessions.presentationSessions
                                .filter(
                                  session => session.connectionStatus === 'connecting',
                                )
                                .map(session => session.hostId),
                              ...sessions.connectingHostIds,
                            ]}
                            error={hosts.error}
                            credentialRecovery={hosts.credentialRecovery}
                            credentialRecoveryBusy={
                              hosts.credentialRecoveryBusy
                            }
                            onAdd={hosts.openNewHost}
                            onConnect={host => {
                              sessions
                                .connectSavedHost(host)
                                .catch(error => hosts.setError(String(error)));
                            }}
                            onOpenTerminal={host => {
                              setCodexSelection(null);
                              reportBackgroundFailure((async () => {
                                await sessions.connectSavedHost(host, { navigate: false });
                                if (sessions.getClient(host.id)) sessions.openSshShell(host.id);
                              })(), 'server-terminal-open');
                            }}
                            onDelete={hosts.confirmDelete}
                            onDisconnect={host =>
                              sessions.closeHostById(host.id)
                            }
                            onEdit={hosts.openEditor}
                            onUnlockCredentials={hosts.unlockCredentialRecovery}
                          />
                        )}
                      </ScreenUpdates>
                    </AgentStatusAnimationProvider>
                  </View>
                ) : null}

                {navigation.mountedTabs.has('terminal') &&
                  !activeSession &&
                  navigation.state.tab === 'terminal' && (
                    <ConnectRequiredScreen
                      destination={t('nav.terminal')}
                      onPickHost={() => navigation.selectTab('hosts')}
                    />
                  )}

                {navigation.mountedTabs.has('more') ? (
                  <View
                    importantForAccessibility={
                      navigation.state.tab === 'more'
                        ? 'auto'
                        : 'no-hide-descendants'
                    }
                    pointerEvents={
                      navigation.state.tab === 'more' ? 'auto' : 'none'
                    }
                    style={
                      navigation.state.tab === 'more'
                        ? styles.tabScreen
                        : styles.hiddenTab
                    }
                  >
                    <ScreenUpdates active={navigation.state.tab === 'more'}>
                      {() => (
                        <SettingsScreen
                          preferences={preferences}
                          globalKeyCount={hosts.globalSshKeys.length}
                          knownHostCount={hosts.knownHostsState.status === 'loaded' ? hosts.knownHosts.length : null}
                          onManageGlobalKeychain={() => ignoreExpectedCancellation(hosts.openGlobalKeychain())}
                          onManageKnownHosts={hosts.openKnownHosts}
                          onBiometricForKeysChange={value => ignoreExpectedCancellation(security.updateBiometricForKeys(value))}
                          onBiometricOnResumeChange={value => ignoreExpectedCancellation(security.updateBiometricOnResume(value))}
                          onOpenLicenses={navigation.openLicenses}
                        />
                      )}
                    </ScreenUpdates>
                  </View>
                ) : null}
              </View>

              {codexVisible && codexSelection && codexHost && sessions.getClient(codexHost.sessionId) ? <CodexChatScreen
                key={`${codexSelection.hostId}:${codexSelection.threadId}`}
                hostId={codexSelection.hostId} threadId={codexSelection.threadId} hostName={codexHost.name}
                daemon={codexHost.client} client={sessions.getClient(codexHost.sessionId)!}
                onOpenFile={(target,cwd)=>remoteFiles.open(codexHost.sessionId,codexChatKey(codexSelection.threadId),target,cwd)}
                draftRequest={remoteFiles.draftRequest?.hostSessionId===codexHost.sessionId ? remoteFiles.draftRequest : undefined}
                onConsumeDraft={remoteFiles.consumeDraft}
                onTerminal={async (threadId,cwd)=>{
                  const workspace=await sessions.createWorkspace(codexHost.sessionId,'Codex',cwd);
                  await sessions.launchTab(codexHost.sessionId,workspace.workspace_id,'Codex', {type:'agent',kind:'codex',args:['resume',threadId],reverseControl:false});
                  setCodexSelection(null);
                  navigation.showTerminal(codexHost.sessionId);
                }}
              /> : null}
              {codexVisible && !codexHost ? <ConnectRequiredScreen destination="Codex chat" onPickHost={() => navigation.selectTab('hosts')} /> : null}
              {(navigation.mountedTabs.has('terminal') || navigation.mountedTabs.has('chat')) &&
                !codexVisible && activeSession && (
                  <AgentStatusAnimationProvider enabled={terminalVisible}>
                    <LiveSessionView
                      draftSaveError={terminals.draftError}
                      onToggleReadAloud={() => preferences.setPreference('ttsEnabled', !ttsEnabled)}
                      preferChat={navigation.state.tab === 'chat'}
                      session={activeSession}
                      client={liveClient}
                      visible={terminalVisible}
                      ttsEnabled={ttsEnabled}
                      latencyMs={visibleLiveHostLatency(
                        activeSession.connectionStatus,
                        activeTelemetry?.latencyMs ?? null,
                      )}
                      latencyWarningActive={
                        activeSession.connectionStatus === 'ready' &&
                        Boolean(activeTelemetry?.latencyWarning.active)
                      }
                      terminalState={terminals.get(activeSession.id, sessions.state)}
                      terminalTargets={sessions.terminalTargets}
                      appBackgroundImageUri={null}
                      appBackgroundDimming={60}
                      terminalPreferences={terminalPreferences}
                      terminalControlUsage={terminalControlUsage}
                      terminalHistory={history.entries}
                      onOpenFiles={remoteFiles.open}
                      composerDraftRequest={remoteFiles.draftRequest?.hostSessionId === activeSession.id ? remoteFiles.draftRequest : undefined}
                      onComposerDraftConsumed={remoteFiles.consumeDraft}
                      getTerminalComposerDraft={terminals.getComposerDraft}
                      onTerminalComposerDraftChange={
                        terminals.updateComposerDraft
                      }
                      onTerminalControlUse={
                        preferences.recordTerminalControlUse
                      }
                      onTerminalHistoryEntry={history.record}
                      onInteraction={(sessionId, tabId) => {
                        reportBackgroundFailure(
                          dismissAgentAlertsForTab(sessionId, tabId),
                          'tab-alert-dismiss',
                        );
                      }}
                      onExit={() => {
                        navigation.selectTab(navigation.state.tab === 'chat' ? 'chats' : navigation.state.lastNonTerminalTab);
                      }}
                      onRefresh={async sessionId => {
                        if (activeSession.connectionStatus === 'ready') await sessions.refresh(sessionId);
                        else await sessions.connectSavedHost(activeSession.host);
                      }}
                      onOpenPane={(sessionId, pane) => {
                        sessions.select(sessionId, 'terminal');
                        sessions.activatePaneTerminal(sessionId, pane);
                        navigation.selectPane(pane.pane_id);
                      }}
                      onActivateTerminal={sessions.activatePaneTerminal}
                      onCloseTerminal={(sessionId, terminalId) => {
                        if (activeSession.connectionStatus === 'ready') sessions.closeTerminal(sessionId, terminalId);
                      }}
                      onTerminalStatus={terminals.updateStatus}
                      onTerminalFontSizeChange={terminals.updateFontSize}
                    />
                  </AgentStatusAnimationProvider>
                )}
            </NavigationBlurTarget>

            {!immersiveTerminal && !overlaysVisible && (
              <BottomNavigation
                activeTab={navigation.state.tab}
                onSelect={navigation.selectTab}
              />
            )}

            <AppOverlays
              effectivePreferences={effectivePreferences}
              hosts={hosts}
              sessions={sessions}
              navigation={navigation}
              remoteFiles={remoteFiles}
              security={security}
            />
          </View>
        </GlassProvider>
      </SafeAreaView>
    </SpinnerFrameRateProvider>
  );
}

const styles = StyleSheet.create({
  navigationBlurTarget: { flex: 1 },
  tabScreen: { flex: 1 },
  navigationForeground: { flex: 1, zIndex: 1 },
  hiddenTab: { position: 'absolute', inset: 0, opacity: 0 },
});
