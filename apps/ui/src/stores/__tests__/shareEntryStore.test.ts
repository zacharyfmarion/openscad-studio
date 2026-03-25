import { createShareEntryStore, isShareEntryBlockingPhase } from '../shareEntryStore';

describe('shareEntryStore', () => {
  it('tracks the happy path from route context to ready', () => {
    const store = createShareEntryStore({ shareId: 'abc12345', mode: 'customizer' });

    expect(store.getState().phase).toBe('idle');
    expect(isShareEntryBlockingPhase(store.getState().phase)).toBe(true);

    store.getState().startFetching();
    expect(store.getState().phase).toBe('fetching');

    store.getState().setShareData({
      id: 'abc12345',
      code: 'cube(10);',
      title: 'Lamp',
      createdAt: '2026-03-24T00:00:00.000Z',
      forkedFrom: null,
      thumbnailUrl: null,
    });
    store.getState().startApplying();
    expect(store.getState().phase).toBe('applying');

    store.getState().startRendering({
      origin: {
        shareId: 'abc12345',
        mode: 'customizer',
        title: 'Lamp',
        forkedFrom: null,
      },
      targetTabId: 'tab-1',
    });
    expect(store.getState().phase).toBe('rendering');

    store.getState().markReady();
    expect(store.getState().phase).toBe('ready');
    expect(store.getState().origin?.title).toBe('Lamp');
  });

  it('supports retry, skip, and banner dismissal', () => {
    const store = createShareEntryStore({ shareId: 'abc12345', mode: 'editor' });

    store.getState().fail('Nope');
    expect(store.getState().phase).toBe('error');
    expect(store.getState().error).toBe('Nope');

    store.getState().retry();
    expect(store.getState().phase).toBe('idle');
    expect(store.getState().error).toBeNull();

    store.getState().startRendering({
      origin: {
        shareId: 'abc12345',
        mode: 'editor',
        title: 'Lamp',
        forkedFrom: null,
      },
      targetTabId: 'tab-1',
    });
    store.getState().dismissBanner();
    expect(store.getState().isBannerDismissed).toBe(true);

    store.getState().skip();
    expect(store.getState().phase).toBe('skipped');
    expect(store.getState().origin).toBeNull();
  });
});
