/** @jest-environment jsdom */

import { shouldCaptureBootstrapAnalytics } from '../bootstrapPolicy';
import { scrubAndFilterEvent, sanitizeAnalyticsProperties } from '../sanitize';

describe('analytics bootstrap helpers', () => {
  it('only allows bootstrap capture when analytics is enabled', () => {
    expect(shouldCaptureBootstrapAnalytics(true, true)).toBe(true);
    expect(shouldCaptureBootstrapAnalytics(true, false)).toBe(false);
    expect(shouldCaptureBootstrapAnalytics(false, true)).toBe(false);
  });

  it('removes sensitive properties while preserving safe analytics fields', () => {
    expect(
      sanitizeAnalyticsProperties({
        provider: 'openai',
        model_id: 'gpt-5',
        prompt: 'build a gearbox',
        code: 'cube([1, 2, 3]);',
        value: 'sk-live-secret',
        message_text: 'make this thinner',
        conversation_transcript: 'user: make a bracket',
        file_path: '/Users/zachary/model.scad',
        warning_count: 2,
        nested: {
          finish_reason: 'complete',
          stack: 'Error: boom',
        },
      })
    ).toEqual({
      provider: 'openai',
      model_id: 'gpt-5',
      warning_count: 2,
      nested: {
        finish_reason: 'complete',
      },
    });
  });

  it('scrubs event properties for before_send', () => {
    expect(
      scrubAndFilterEvent({
        event: 'ai request completed',
        properties: {
          source_component: 'ai-panel',
          attachment_name: 'photo.png',
          prompt_text: 'make this bigger',
          transcript_text: 'user asked for a gear',
          duration_ms: 3200,
        },
      })
    ).toEqual({
      event: 'ai request completed',
      properties: {
        source_component: 'ai-panel',
        duration_ms: 3200,
      },
    });
  });
});
