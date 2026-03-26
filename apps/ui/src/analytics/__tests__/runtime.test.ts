/** @jest-environment jsdom */

import { jest } from '@jest/globals';
import { createAnalyticsApi, resetAnalyticsErrorDedupeForTests } from '../runtime';

function createClient() {
  return {
    capture: jest.fn(),
    identify: jest.fn(),
    reset: jest.fn(),
    opt_in_capturing: jest.fn(),
    opt_out_capturing: jest.fn(),
    register: jest.fn(),
  };
}

describe('analytics runtime', () => {
  beforeEach(() => {
    resetAnalyticsErrorDedupeForTests();
  });

  it('captures custom events with shared properties when enabled', () => {
    const client = createClient();
    const analytics = createAnalyticsApi({
      client,
      analyticsEnabled: true,
      sharedProperties: {
        app_version: '0.8.1',
        runtime_surface: 'desktop',
      },
    });

    analytics.track('file opened', {
      source: 'open',
      has_disk_path: true,
    });

    expect(client.capture).toHaveBeenCalledWith('file opened', {
      app_version: '0.8.1',
      runtime_surface: 'desktop',
      source: 'open',
      has_disk_path: true,
    });
  });

  it('does not capture custom events when analytics is disabled', () => {
    const client = createClient();
    const analytics = createAnalyticsApi({
      client,
      analyticsEnabled: false,
      sharedProperties: {
        app_version: '0.8.1',
        runtime_surface: 'web',
      },
    });

    analytics.track('file opened', {
      source: 'open',
      has_disk_path: true,
    });

    expect(client.capture).not.toHaveBeenCalled();
  });

  it('applies consent changes in the right order', () => {
    const client = createClient();
    const analytics = createAnalyticsApi({
      client,
      analyticsEnabled: true,
      sharedProperties: {
        app_version: '0.8.1',
        runtime_surface: 'web',
      },
    });

    analytics.setAnalyticsEnabled(false, { capturePreferenceChange: true });
    analytics.setAnalyticsEnabled(true, { capturePreferenceChange: true });

    expect(client.capture).toHaveBeenNthCalledWith(
      1,
      'analytics preference changed',
      expect.objectContaining({ enabled: false, analytics_enabled: true })
    );
    expect(client.opt_out_capturing).toHaveBeenCalledTimes(1);
    expect(client.opt_in_capturing).toHaveBeenCalledWith({ captureEventName: false });
    expect(client.capture).toHaveBeenNthCalledWith(
      2,
      'analytics preference changed',
      expect.objectContaining({ enabled: true, analytics_enabled: true })
    );
  });

  it('dedupes repeated app errors for the same fingerprint', () => {
    const client = createClient();
    const analytics = createAnalyticsApi({
      client,
      analyticsEnabled: true,
      sharedProperties: {
        app_version: '0.8.1',
        runtime_surface: 'desktop',
      },
    });

    analytics.trackError({
      operation: 'render-runtime',
      error: new Error('boom'),
    });
    analytics.trackError({
      operation: 'render-runtime',
      error: new Error('boom'),
    });

    expect(client.capture).toHaveBeenCalledTimes(1);
    expect(client.capture).toHaveBeenCalledWith(
      'app error',
      expect.objectContaining({
        error_domain: 'render',
        operation: 'render-runtime',
        fingerprint: 'render-runtime-boom',
      })
    );
  });

  it('captures bounded viewer and customizer analytics payloads', () => {
    const client = createClient();
    const analytics = createAnalyticsApi({
      client,
      analyticsEnabled: true,
      sharedProperties: {
        app_version: '0.11.0',
        runtime_surface: 'desktop',
      },
    });

    analytics.track('customizer rendered', {
      layout_preset: 'customizer-first',
      parameter_count_bucket: '<=3',
      group_count_bucket: '<=2',
      has_studio_metadata: true,
      has_advanced_parameters: false,
    });
    analytics.track('measurement committed', {
      viewer_kind: '3d',
      measurement_kind: 'bbox',
      measurement_unit: 'mm',
      bbox_scope: 'selection',
    });

    expect(client.capture).toHaveBeenNthCalledWith(
      1,
      'customizer rendered',
      expect.objectContaining({
        layout_preset: 'customizer-first',
        parameter_count_bucket: '<=3',
        group_count_bucket: '<=2',
        has_studio_metadata: true,
        has_advanced_parameters: false,
      })
    );
    expect(client.capture).toHaveBeenNthCalledWith(
      2,
      'measurement committed',
      expect.objectContaining({
        viewer_kind: '3d',
        measurement_kind: 'bbox',
        measurement_unit: 'mm',
        bbox_scope: 'selection',
      })
    );
  });
});
