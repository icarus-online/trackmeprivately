# Privacy Policy Guidance

This guide helps site owners describe how Privacy Tracker processes analytics data. It is practical documentation, not legal advice. Review the final wording with counsel or a qualified privacy professional for your jurisdiction and business model.

## Data Flow

Privacy Tracker is designed to collect narrow, aggregate website analytics without visitor cookies or long-lived browser identifiers.

1. The embedded `tracker.js` script sends a page view or custom event to `/api/collect`.
2. The server reads request headers, including IP address and user agent, only long enough to create a daily session hash.
3. The raw IP address is not stored in the database.
4. The server stores the event name, page URL, optional referrer, coarse device/browser details, website ID, timestamp, and daily session hash. It explicitly discards any optional metadata payloads to prevent accidental capture of PII.
5. The daily session hash rotates by date because it includes the current date salt.

The session hash is generated as:

```text
SHA256(IP address + User-Agent + Website ID + current date)
```

This supports daily unique-visitor counts while avoiding cross-day visitor profiles.

## Visitor Storage

The public tracker script must remain storage-free:

- No visitor cookies.
- No `localStorage`.
- No `sessionStorage`.
- No third-party script dependency.

The admin dashboard uses secure HTTP-only cookies for passkey login sessions. Those admin cookies are separate from public visitor tracking and are not set by `public/tracker.js`.

## Origin Verification

`/api/collect` verifies request `Origin` or `Referer` headers against the registered website's origin when a source header is present. Scheme and port must match; bare registered domains default to HTTPS, and the apex and `www` forms are accepted. Malformed source headers are rejected. Requests without either source header remain supported for privacy clients; source headers are not an authentication mechanism.

Browser preflights permit only registered website origins, POST, and Content-Type. Successful requests return the specific allowed origin and `Vary: Origin`, without wildcard CORS or credentials. Event POSTs still check the selected website, even if a different registered website allowed the preflight. Localhost and `DISABLE_ORIGIN_VERIFICATION=true` are development-only exceptions and have no effect in production.

## Suggested Privacy Policy Text

Adapt this text for the website where you embed the tracker:

```text
We use a self-hosted, privacy-focused analytics tool to understand aggregate website usage, such as page views, referrers, browser type, device category, and custom interaction events.

This analytics tool does not set visitor cookies and does not use localStorage or sessionStorage. When a page is viewed, the server briefly uses the visitor IP address and browser user-agent string to create a daily rotating session hash. The raw IP address is discarded and is not stored in the analytics database.

The daily session hash helps us estimate unique visits for a single day, but it is not designed to identify visitors across multiple days. Analytics data is used to understand site performance and content usage, not to build advertising profiles.
```

If your implementation stores analytics for a defined period, add your retention period:

```text
We retain aggregate analytics records for [RETENTION PERIOD], then delete or anonymize them according to our data retention practices.
```

If you use custom events, describe their purpose:

```text
We may record custom interaction events, such as clicks on important buttons or form starts, to improve the usability of this website. These events are stored without visitor cookies or long-lived browser identifiers.
```

## GDPR And CCPA Notes

Because Privacy Tracker avoids visitor cookies and does not store raw IP addresses, many deployments can use it with a lighter consent surface than profile-building analytics tools. Requirements still depend on the site owner's jurisdiction, retention period, custom events, and whether analytics data is combined with other data sources.

At minimum, site owners should disclose:

- What analytics data is collected.
- That visitor cookies and browser storage are not used by the tracker.
- That IP addresses are used transiently to generate a daily hash and are not stored.
- Why analytics data is collected.
- How long analytics records are retained.
- Who operates the analytics endpoint.
