import { RangeKey, normalizeRange } from './range';

export const DELETE_WEBSITE_CONFIRMATION = 'DELETE';

export type WebsiteActionState = {
  message: string;
};

export const INITIAL_WEBSITE_ACTION_STATE: WebsiteActionState = { message: '' };

export function websiteMutationError(error: unknown, operation: 'create' | 'update' | 'delete') {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined;

  if (code === 'P2002') {
    return 'That domain is already registered.';
  }
  if (code === 'P2025') {
    return 'That website no longer exists. Refresh the dashboard and try again.';
  }

  return `We could not ${operation} the website. Try again.`;
}

export function normalizeWebsiteName(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') {
    return null;
  }

  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > 120) {
    return null;
  }

  return name;
}

export function normalizeWebsiteDomain(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed.length > 253 || /\s/.test(trimmed)) {
    return null;
  }

  const candidate = trimmed.includes('://') ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    const hostname = parsed.hostname.replace(/^www\./, '');
    const port = parsed.port ? `:${parsed.port}` : '';
    const normalized = `${hostname}${port}`;

    if (!hostname || normalized.length > 253) {
      return null;
    }

    return normalized;
  } catch {
    return null;
  }
}

export function normalizeWebsiteId(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') {
    return null;
  }

  const id = value.trim();
  return id || null;
}

export function normalizeDashboardRange(value: FormDataEntryValue | string | null | undefined): RangeKey {
  return normalizeRange(typeof value === 'string' ? value : undefined);
}

export function buildDashboardHref(websiteId?: string | null, range?: RangeKey) {
  const params = new URLSearchParams();
  if (websiteId) {
    params.set('websiteId', websiteId);
  }
  if (range) {
    params.set('range', range);
  }

  const query = params.toString();
  return query ? `/?${query}` : '/';
}

export function buildTrackingSnippet(currentDomain: string, websiteId: string) {
  return `<script
  src="${currentDomain}/tracker.js"
  data-endpoint="${currentDomain}/api/collect"
  data-website-id="${websiteId}"
  async
></script>`;
}
