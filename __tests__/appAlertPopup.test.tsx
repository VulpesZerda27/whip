import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AppAlertPopup } from '../src/components/AppAlertPopup';

jest.mock('lucide-react-native', () => ({ CircleAlert: 'CircleAlert' }));
jest.mock('react-native-css-interop/jsx-runtime', () =>
  jest.requireActual('react/jsx-runtime'),
);
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => (key === 'common.close' ? 'Close' : key),
  }),
}));
jest.mock('../src/components/nightfall', () => ({ Dialog: 'Dialog' }));

describe('AppAlertPopup', () => {
  let renderer: ReactTestRenderer;

  afterEach(() => {
    act(() => renderer?.unmount());
  });

  test('shows the original error in a Nightfall dialog that dismisses from its only action', () => {
    const onClose = jest.fn();
    act(() => {
      renderer = create(
        <AppAlertPopup
          message="remote command exited with status 127"
          onClose={onClose}
          title="Herdr command failed"
          visible
        />,
      );
    });

    const dialog = renderer.root.find(node => (node.type as unknown) === 'Dialog');
    expect(dialog.props).toEqual(expect.objectContaining({
      title: 'Herdr command failed',
      body: 'remote command exited with status 127',
      confirmLabel: 'Close',
      icon: 'CircleAlert',
      visible: true,
    }));
    // A single acknowledgement: no cancel, so system back confirms the dismissal.
    expect(dialog.props.onCancel).toBeUndefined();
    dialog.props.onConfirm();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
