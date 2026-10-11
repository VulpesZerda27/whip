import type { AppTab } from './types';

export type HomeTab = 'chats' | 'hosts' | 'more';
export interface MobileNavigationState {
  tab: AppTab;
  lastNonTerminalTab: HomeTab;
}

export const initialMobileNavigation: MobileNavigationState = {
  tab: 'chats',
  lastNonTerminalTab: 'chats',
};

export function selectMobileTab(
  state: MobileNavigationState,
  tab: AppTab,
): MobileNavigationState {
  return {
    tab,
    lastNonTerminalTab:
      tab === 'chat'
        ? 'chats'
        : tab === 'terminal'
          ? state.lastNonTerminalTab
          : tab,
  };
}

export function handleMobileBack(state: MobileNavigationState): {
  handled: boolean;
  state: MobileNavigationState;
} {
  if (state.tab === 'chat')
    return { handled: true, state: selectMobileTab(state, 'chats') };
  if (state.tab === 'terminal')
    return {
      handled: true,
      state: selectMobileTab(state, state.lastNonTerminalTab),
    };
  if (state.tab !== 'chats')
    return { handled: true, state: selectMobileTab(state, 'chats') };
  return { handled: false, state };
}
