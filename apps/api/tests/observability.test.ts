/**
 * Observability tests — Structured logger and timing utilities.
 * Verifies log format, field encoding, timing accuracy, and level routing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from '../src/lib/logger.js';

// ── Logger format tests ────────────────────────────────────────────────────────

describe('createLogger', () => {
  let consoleSpy: Record<string, ReturnType<typeof vi.spyOn>>;

  beforeEach(() => {
    consoleSpy = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      log:   vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn:  vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits info to console.log with correct prefix', () => {
    const log = createLogger('agent-loop', 'agent_123');
    log.info('tick_start');
    expect(consoleSpy.log).toHaveBeenCalledOnce();
    const line = (consoleSpy.log.mock.calls[0][0] as string);
    expect(line).toContain('[agent-loop]');
    expect(line).toContain('agent=agent_123');
    expect(line).toContain('level=info');
    expect(line).toContain('event=tick_start');
  });

  it('emits warn to console.warn', () => {
    const log = createLogger('agent-loop');
    log.warn('price_resolution_failed', { pair: 'WETH/USDC' });
    expect(consoleSpy.warn).toHaveBeenCalledOnce();
    const line = consoleSpy.warn.mock.calls[0][0] as string;
    expect(line).toContain('level=warn');
    expect(line).toContain('event=price_resolution_failed');
    expect(line).toContain('pair="WETH/USDC"');
  });

  it('emits error to console.error', () => {
    const log = createLogger('llm-router');
    log.error('llm_failed', { code: 'LLM_TIMEOUT' });
    expect(consoleSpy.error).toHaveBeenCalledOnce();
    const line = consoleSpy.error.mock.calls[0][0] as string;
    expect(line).toContain('level=error');
    expect(line).toContain('event=llm_failed');
  });

  it('emits debug to console.debug', () => {
    const log = createLogger('indicators');
    log.debug('compute_done', { candles: 48 });
    expect(consoleSpy.debug).toHaveBeenCalledOnce();
    const line = consoleSpy.debug.mock.calls[0][0] as string;
    expect(line).toContain('level=debug');
    expect(line).toContain('candles=48');
  });

  it('omits agentId part when not provided', () => {
    const log = createLogger('health');
    log.info('ping');
    const line = consoleSpy.log.mock.calls[0][0] as string;
    expect(line).not.toContain('agent=');
  });

  it('includes timestamp in ISO format', () => {
    const log = createLogger('test');
    log.info('ts_check');
    const line = consoleSpy.log.mock.calls[0][0] as string;
    expect(line).toMatch(/ts=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('serializes string fields with JSON quotes', () => {
    const log = createLogger('test');
    log.info('test_event', { model: 'gpt/4o', reason: 'ok' });
    const line = consoleSpy.log.mock.calls[0][0] as string;
    expect(line).toContain('model="gpt/4o"');
    expect(line).toContain('reason="ok"');
  });

  it('serializes numeric fields without quotes', () => {
    const log = createLogger('test');
    log.info('test_event', { confidence: 0.85, latency: 1234 });
    const line = consoleSpy.log.mock.calls[0][0] as string;
    expect(line).toContain('confidence=0.85');
    expect(line).toContain('latency=1234');
  });

  it('skips null and undefined fields', () => {
    const log = createLogger('test');
    log.info('test_event', { present: 'yes', missing: undefined, also: null });
    const line = consoleSpy.log.mock.calls[0][0] as string;
    expect(line).toContain('present="yes"');
    expect(line).not.toContain('missing=');
    expect(line).not.toContain('also=');
  });
});

// ── Timer tests ────────────────────────────────────────────────────────────────

describe('logger.time()', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits duration_ms when timer is stopped', () => {
    const log = createLogger('agent-loop', 'a1');
    const done = log.time('market_data_fetch');
    const ms = done();
    expect(logSpy).toHaveBeenCalledOnce();
    const line = logSpy.mock.calls[0][0] as string;
    expect(line).toContain('event=market_data_fetch');
    expect(line).toContain('duration_ms=');
    expect(ms).toBeGreaterThanOrEqual(0);
  });

  it('returns the elapsed milliseconds', () => {
    const log = createLogger('test');
    const done = log.time('op');
    const elapsed = done();
    expect(typeof elapsed).toBe('number');
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });

  it('includes extra fields alongside duration_ms', () => {
    const log = createLogger('test');
    const done = log.time('llm_call', { model: 'gpt/4' });
    done();
    const line = logSpy.mock.calls[0][0] as string;
    expect(line).toContain('model="gpt/4"');
    expect(line).toContain('duration_ms=');
  });

  it('measures elapsed time roughly correctly', async () => {
    const log = createLogger('test');
    const done = log.time('slow_op');
    await new Promise((r) => setTimeout(r, 20));
    const elapsed = done();
    expect(elapsed).toBeGreaterThanOrEqual(15);
  });
});
