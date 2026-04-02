import { getRenderRequestStore } from '../renderRequestStore';

function createFreshStore() {
  const store = getRenderRequestStore();
  // Reset state between tests
  store.setState({ pendingRequest: null, nextId: 1 });
  return store;
}

describe('renderRequestStore', () => {
  it('starts with no pending request', () => {
    const store = createFreshStore();
    expect(store.getState().pendingRequest).toBeNull();
  });

  it('requestRender sets a pending request', () => {
    const store = createFreshStore();

    store.getState().requestRender('manual', { immediate: true });

    const request = store.getState().pendingRequest;
    expect(request).toEqual({
      id: 1,
      trigger: 'manual',
      immediate: true,
      code: undefined,
    });
  });

  it('requestRender increments ID', () => {
    const store = createFreshStore();

    store.getState().requestRender('code_update');
    expect(store.getState().pendingRequest?.id).toBe(1);

    store.getState().requestRender('save');
    expect(store.getState().pendingRequest?.id).toBe(2);

    expect(store.getState().nextId).toBe(3);
  });

  it('latest request wins (no queue)', () => {
    const store = createFreshStore();

    store.getState().requestRender('code_update');
    store.getState().requestRender('manual', { immediate: true });

    expect(store.getState().pendingRequest?.trigger).toBe('manual');
    expect(store.getState().pendingRequest?.immediate).toBe(true);
  });

  it('consumeRequest clears the pending request', () => {
    const store = createFreshStore();

    store.getState().requestRender('file_open', { immediate: true });
    expect(store.getState().pendingRequest).not.toBeNull();

    store.getState().consumeRequest();
    expect(store.getState().pendingRequest).toBeNull();
  });

  it('defaults immediate to false when not specified', () => {
    const store = createFreshStore();

    store.getState().requestRender('auto_idle');

    expect(store.getState().pendingRequest?.immediate).toBe(false);
  });

  it('passes code override through', () => {
    const store = createFreshStore();

    store.getState().requestRender('history_restore', {
      immediate: true,
      code: 'cube(20);',
    });

    expect(store.getState().pendingRequest?.code).toBe('cube(20);');
  });
});
