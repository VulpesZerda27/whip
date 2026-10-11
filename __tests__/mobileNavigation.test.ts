import { handleMobileBack, initialMobileNavigation, selectMobileTab } from '../src/mobileNavigation';

test.each(['chats', 'hosts', 'more'] as const)('terminal exit returns to its entry point, %s', tab => {
  const terminal = selectMobileTab(selectMobileTab(initialMobileNavigation, tab), 'terminal');
  expect(handleMobileBack(terminal).state.tab).toBe(tab);
});

test('Chats is the root; back from Servers or Settings returns there', () => {
  expect(initialMobileNavigation.tab).toBe('chats');
  for (const tab of ['hosts', 'more'] as const) expect(handleMobileBack(selectMobileTab(initialMobileNavigation, tab)).state.tab).toBe('chats');
  expect(handleMobileBack(initialMobileNavigation).handled).toBe(false);
});

test('chat opened from any tab returns to Chats, independently of the terminal', () => {
  const chat = selectMobileTab(selectMobileTab(initialMobileNavigation, 'more'), 'chat');
  expect(handleMobileBack(chat).state.tab).toBe('chats');
  expect(selectMobileTab(chat, 'terminal').tab).toBe('terminal');
});
