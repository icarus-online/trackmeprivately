import { describe, expect, test } from 'vitest';
import {
  buildDashboardHref,
  buildTrackingSnippet,
  normalizeDashboardRange,
  normalizeWebsiteDomain,
  normalizeWebsiteName,
  websiteMutationError,
} from '../websites';

describe('website helpers', () => {
  test('normalizes display names', () => {
    expect(normalizeWebsiteName('  My   Site  ')).toBe('My Site');
    expect(normalizeWebsiteName('')).toBeNull();
    expect(normalizeWebsiteName('x'.repeat(121))).toBeNull();
  });

  test('normalizes domains and strips protocol/www/path', () => {
    expect(normalizeWebsiteDomain('https://www.Example.com/path')).toBe('example.com');
    expect(normalizeWebsiteDomain('localhost:3000')).toBe('localhost:3000');
    expect(normalizeWebsiteDomain('  sub.example.com  ')).toBe('sub.example.com');
  });

  test('rejects invalid domains', () => {
    expect(normalizeWebsiteDomain('')).toBeNull();
    expect(normalizeWebsiteDomain('exa mple.com')).toBeNull();
    expect(normalizeWebsiteDomain('https://')).toBeNull();
  });

  test('normalizes dashboard range values', () => {
    expect(normalizeDashboardRange('24h')).toBe('24h');
    expect(normalizeDashboardRange('unknown')).toBe('7d');
    expect(normalizeDashboardRange(null)).toBe('7d');
  });

  test('builds dashboard hrefs with optional filters', () => {
    expect(buildDashboardHref('site-1', '30d')).toBe('/?websiteId=site-1&range=30d');
    expect(buildDashboardHref(null, '7d')).toBe('/?range=7d');
    expect(buildDashboardHref()).toBe('/');
  });

  test('builds exact tracker snippet', () => {
    expect(buildTrackingSnippet('https://analytics.example.com', 'site-1')).toContain(
      'data-website-id="site-1"'
    );
    expect(buildTrackingSnippet('https://analytics.example.com', 'site-1')).toContain(
      'data-endpoint="https://analytics.example.com/api/collect"'
    );
  });

  test('maps expected database failures to safe form feedback', () => {
    expect(websiteMutationError({ code: 'P2002', detail: 'private database detail' }, 'create'))
      .toBe('That domain is already registered.');
    expect(websiteMutationError({ code: 'P2025' }, 'update'))
      .toBe('That website no longer exists. Refresh the dashboard and try again.');
    expect(websiteMutationError(new Error('private database detail'), 'delete'))
      .toBe('We could not delete the website. Try again.');
  });
});
