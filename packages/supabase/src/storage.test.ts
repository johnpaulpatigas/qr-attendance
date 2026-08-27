import { describe, it, expect, beforeEach } from 'vitest';
import { AppStorage, withNetworkTimeout } from './storage';

describe('AppStorage Multi-Platform Utility', () => {
  beforeEach(() => {
    AppStorage.clear();
  });

  it('stores and retrieves string items correctly', () => {
    AppStorage.setItem('test_key', 'test_value');
    expect(AppStorage.getItem('test_key')).toBe('test_value');

    AppStorage.removeItem('test_key');
    expect(AppStorage.getItem('test_key')).toBeNull();
  });

  it('stores and retrieves JSON objects safely with defaults', () => {
    const sample = { id: '123', name: 'John Doe', numbers: [1, 2, 3] };
    AppStorage.setJSON('test_json', sample);

    const retrieved = AppStorage.getJSON('test_json', null);
    expect(retrieved).toEqual(sample);

    const fallback = AppStorage.getJSON('non_existent', { defaultVal: true });
    expect(fallback).toEqual({ defaultVal: true });
  });

  it('finds keys starting with a given prefix across storage layers', () => {
    AppStorage.setItem('teacher_cached_sections_1', 'sec1');
    AppStorage.setItem('teacher_cached_sections_2', 'sec2');
    AppStorage.setItem('student_cached_1', 'stud1');

    const matched = AppStorage.findKeysStartingWith('teacher_cached_sections_');
    expect(matched).toContain('teacher_cached_sections_1');
    expect(matched).toContain('teacher_cached_sections_2');
    expect(matched).not.toContain('student_cached_1');
  });

  it('withNetworkTimeout resolves when promise completes before timeout', async () => {
    const fastPromise = new Promise<string>((resolve) =>
      setTimeout(() => resolve('fast_success'), 50)
    );

    const result = await withNetworkTimeout(fastPromise, 500);
    expect(result).toBe('fast_success');
  });

  it('withNetworkTimeout returns fallbackValue on timeout', async () => {
    const slowPromise = new Promise<string>((resolve) =>
      setTimeout(() => resolve('slow_success'), 500)
    );

    const result = await withNetworkTimeout(slowPromise, 100, 'fallback_result');
    expect(result).toBe('fallback_result');
  });

  it('withNetworkTimeout throws when timeout expires without fallback', async () => {
    const slowPromise = new Promise<string>((resolve) =>
      setTimeout(() => resolve('slow_success'), 500)
    );

    await expect(withNetworkTimeout(slowPromise, 100)).rejects.toThrow('Network request timed out');
  });
});
