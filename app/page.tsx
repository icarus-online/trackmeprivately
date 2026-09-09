import { prisma } from '@/lib/prisma';
import Chart from '@/components/Chart';
import WebsiteSwitcher from '@/components/WebsiteSwitcher';
import WebsiteSettings from '@/components/WebsiteSettings';
import CreateWebsiteForm from '@/components/CreateWebsiteForm';
import { Activity, Users, Monitor, Globe, Plus, LogOut, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { headers } from 'next/headers';
import {
  RangeKey,
  RANGE_OPTIONS,
  getFirstParam,
  normalizeRange,
  getRangeConfig,
  buildEmptyChartData,
  formatChartKey,
  startOfUtcHour,
  startOfUtcDay,
} from '@/lib/range';
import { buildDashboardHref } from '@/lib/websites';
import './globals.css';

export const revalidate = 0; // Dynamic server rendering

type DashboardSearchParams = {
  websiteId?: string | string[];
  range?: string | string[];
};

function buildRangeHref(websiteId: string | undefined, range: RangeKey) {
  return buildDashboardHref(websiteId, range);
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const params = await searchParams;
  const activeRange = normalizeRange(params.range);
  const rangeConfig = getRangeConfig(activeRange);
  const activeWebsiteId = getFirstParam(params.websiteId);

  const websites = await prisma.website.findMany({
    orderBy: { name: 'asc' },
  });

  const activeWebsite = activeWebsiteId
    ? websites.find((w) => w.id === activeWebsiteId)
    : websites[0];

  const headerList = await headers();
  const host = headerList.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
  const currentDomain = `${protocol}://${host}`;

  let stats = null;

  if (activeWebsite) {
    const eventWhere = {
      websiteId: activeWebsite.id,
      createdAt: { gte: rangeConfig.startDate },
    };

    // 1. Total page views & custom events
    const totalViews = await prisma.event.count({
      where: eventWhere,
    });

    // 2. Unique visitors (sessions)
    const uniqueSessionsRaw = await prisma.event.groupBy({
      by: ['sessionId'],
      where: eventWhere,
    });
    const uniqueVisitors = uniqueSessionsRaw.length;

    // 3. Traffic data for charts
    const chartEvents = await prisma.event.findMany({
      where: eventWhere,
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const chartData = buildEmptyChartData(rangeConfig.startDate, rangeConfig.bucket);
    const chartDataMap = new Map(chartData.map((point) => [point.date, point]));
    chartEvents.forEach((e) => {
      const bucketDate = rangeConfig.bucket === 'hour'
        ? startOfUtcHour(e.createdAt)
        : startOfUtcDay(e.createdAt);
      const key = formatChartKey(bucketDate, rangeConfig.bucket);
      const existing = chartDataMap.get(key);
      if (existing) {
        existing.views += 1;
      }
    });

    // 4. Top Pages
    const topPages = await prisma.event.groupBy({
      by: ['url'],
      where: { ...eventWhere, eventName: 'pageview' },
      _count: { url: true },
      orderBy: { _count: { url: 'desc' } },
      take: 5,
    });

    // 5. Top Referrers
    const topReferrers = await prisma.event.groupBy({
      by: ['referrer'],
      where: { ...eventWhere, referrer: { not: null } },
      _count: { referrer: true },
      orderBy: { _count: { referrer: 'desc' } },
      take: 5,
    });

    // 6. Custom Events breakdown
    const customEvents = await prisma.event.groupBy({
      by: ['eventName'],
      where: { ...eventWhere, eventName: { not: 'pageview' } },
      _count: { eventName: true },
      orderBy: { _count: { eventName: 'desc' } },
    });

    // 7. System breakdown
    const browsers = await prisma.event.groupBy({
      by: ['browser'],
      where: eventWhere,
      _count: { browser: true },
      orderBy: { _count: { browser: 'desc' } },
      take: 4,
    });

    stats = {
      totalViews,
      uniqueVisitors,
      chartData,
      topPages,
      topReferrers,
      customEvents,
      browsers,
    };
  }

  return (
    <div className="container">
      {/* Top Header */}
      <div className="header">
        <div>
          <h1 className="title">Analytics Dashboard</h1>
          <p className="subtitle">Privacy-respecting site insights</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          {/* Website Switcher Dropdown */}
          {websites.length > 0 && (
            <WebsiteSwitcher
              websites={websites}
              activeWebsiteId={activeWebsite?.id}
              activeRange={activeRange}
            />
          )}

          <a
            href="/api/auth/logout"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: varColorSecondary(),
              textDecoration: 'none',
              fontSize: '0.9rem',
              border: '1px solid var(--border-color)',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.02)',
              transition: 'all 0.2s',
            }}
          >
            <LogOut size={16} />
            Logout
          </a>
        </div>
      </div>

      {activeWebsite && stats ? (
        <>
          <div className="range-toolbar" aria-label="Dashboard time range">
            <span>{rangeConfig.label}</span>
            <div className="range-actions">
              {RANGE_OPTIONS.map((option) => (
                <Link
                  key={option.value}
                  href={buildRangeHref(activeWebsite.id, option.value)}
                  className={option.value === activeRange ? 'range-button active' : 'range-button'}
                  aria-current={option.value === activeRange ? 'page' : undefined}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Stats Summary Cards */}
          <div className="grid">
            <div className="card">
              <div className="card-header">
                <Activity size={18} />
                Total Events
              </div>
              <div className="card-value">{stats.totalViews.toLocaleString()}</div>
            </div>
            <div className="card">
              <div className="card-header">
                <Users size={18} />
                Unique Visitors
              </div>
              <div className="card-value">{stats.uniqueVisitors.toLocaleString()}</div>
            </div>
          </div>

          {/* Recharts Area Chart */}
          <div className="chart-container">
            <h2 className="chart-title">Traffic Overview</h2>
            <div style={{ height: '300px' }}>
              <Chart data={stats.chartData} />
            </div>
          </div>

          {/* Lists Breakdowns */}
          <div className="list-container" style={{ marginBottom: '2rem' }}>
            <div className="card">
              <div className="card-header">
                <Monitor size={18} />
                Top Pages
              </div>
              <ul className="list">
                {stats.topPages.map((page, idx) => (
                  <li key={idx} className="list-item">
                    <span className="item-label">{page.url}</span>
                    <span className="item-value">{page._count.url}</span>
                  </li>
                ))}
                {stats.topPages.length === 0 && (
                  <li className="list-item">
                    <span className="item-label">No page views recorded yet</span>
                  </li>
                )}
              </ul>
            </div>

            <div className="card">
              <div className="card-header">
                <Globe size={18} />
                Top Referrers
              </div>
              <ul className="list">
                {stats.topReferrers.map((ref, idx) => (
                  <li key={idx} className="list-item">
                    <span className="item-label">{ref.referrer || 'Direct'}</span>
                    <span className="item-value">{ref._count.referrer}</span>
                  </li>
                ))}
                {stats.topReferrers.length === 0 && (
                  <li className="list-item">
                    <span className="item-label">Direct / Unknown</span>
                  </li>
                )}
              </ul>
            </div>
          </div>

          {/* Custom Events & Browsers */}
          <div className="list-container">
            <div className="card">
              <div className="card-header">
                <ShieldCheck size={18} />
                Custom Action Conversions
              </div>
              <ul className="list">
                {stats.customEvents.map((evt, idx) => (
                  <li key={idx} className="list-item">
                    <span className="item-label" style={{ color: '#10b981', fontWeight: 600 }}>
                      {evt.eventName}
                    </span>
                    <span className="item-value">{evt._count.eventName}</span>
                  </li>
                ))}
                {stats.customEvents.length === 0 && (
                  <li className="list-item">
                    <span className="item-label">No custom events triggered yet</span>
                  </li>
                )}
              </ul>
            </div>

            <div className="card">
              <div className="card-header">
                <Monitor size={18} />
                Browsers
              </div>
              <ul className="list">
                {stats.browsers.map((b, idx) => (
                  <li key={idx} className="list-item">
                    <span className="item-label">{b.browser || 'Unknown'}</span>
                    <span className="item-value">{b._count.browser}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <WebsiteSettings
            website={activeWebsite}
            currentDomain={currentDomain}
            activeRange={activeRange}
          />

          {/* Custom event example */}
          <div className="card" style={{ marginTop: '2rem' }}>
            <h2 className="chart-title">Custom Event Example</h2>
            <p className="subtitle">
              Trigger custom analytics events from buttons, forms, or other calls to action.
            </p>
            <div style={{ marginTop: '1.25rem' }}>
              <pre
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid var(--border-color)',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontFamily: 'monospace',
                  color: '#94a3b8',
                  marginTop: '0.5rem',
                  overflowX: 'auto',
                }}
              >
                {`// Example click tracking
document.getElementById('cta-btn').addEventListener('click', () => {
  window.privacyTracker.track('consulting_cta_click');
});`}
              </pre>
            </div>
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div style={{ textAlign: 'center', marginTop: '5%' }}>
            <h2 className="title" style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
              Get started by registering a website
            </h2>
            <p className="subtitle" style={{ marginBottom: '1.5rem' }}>
              You need to add at least one domain to begin tracking.
            </p>
          </div>

          {/* Example Integration Preview */}
          <div className="card">
            <h2 className="chart-title">Example Integration Code</h2>
            <p className="subtitle">
              Once you register a domain, you will embed a script like this to begin collecting data:
            </p>
            <div className="snippet-box">
              {`<script 
  src="${currentDomain}/tracker.js" 
  data-endpoint="${currentDomain}/api/collect"
  data-website-id="YOUR_WEBSITE_ID"
  async
></script>`}
            </div>
          </div>
        </div>
      )}

      {/* Register New Website Section */}
      <div className="card" style={{ marginTop: '3rem' }}>
        <h3 className="chart-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={20} />
          Register New Domain
        </h3>
        <CreateWebsiteForm activeRange={activeRange} />
      </div>
    </div>
  );
}

function varColorSecondary() {
  return 'var(--text-secondary)';
}
