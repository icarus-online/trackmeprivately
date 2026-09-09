'use client';

import { Pencil, Trash2, Code2 } from 'lucide-react';
import { useActionState } from 'react';
import { deleteWebsite, updateWebsite } from '@/app/actions';
import {
  DELETE_WEBSITE_CONFIRMATION,
  INITIAL_WEBSITE_ACTION_STATE,
  buildTrackingSnippet,
} from '@/lib/websites';
import type { RangeKey } from '@/lib/range';

type WebsiteSettingsProps = {
  website: {
    id: string;
    name: string;
    domain: string;
  };
  currentDomain: string;
  activeRange: RangeKey;
};

export default function WebsiteSettings({
  website,
  currentDomain,
  activeRange,
}: WebsiteSettingsProps) {
  const snippet = buildTrackingSnippet(currentDomain, website.id);
  const [updateState, updateAction, updatePending] = useActionState(
    updateWebsite,
    INITIAL_WEBSITE_ACTION_STATE,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteWebsite,
    INITIAL_WEBSITE_ACTION_STATE,
  );

  return (
    <div className="settings-grid">
      <section className="card">
        <h2 className="chart-title settings-title">
          <Pencil size={20} />
          Website Settings
        </h2>
        <form action={updateAction} className="stacked-form">
          <input type="hidden" name="websiteId" value={website.id} />
          <input type="hidden" name="range" value={activeRange} />
          <label className="field">
            <span>Site Name</span>
            <input className="text-input" type="text" name="name" defaultValue={website.name} required />
          </label>
          <label className="field">
            <span>Domain</span>
            <input className="text-input" type="text" name="domain" defaultValue={website.domain} required />
          </label>
          {updateState.message && (
            <p className="form-message form-error" role="alert" aria-live="polite">
              {updateState.message}
            </p>
          )}
          <button type="submit" className="button button-primary" disabled={updatePending}>
            {updatePending ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </section>

      <section className="card">
        <h2 className="chart-title settings-title">
          <Code2 size={20} />
          Tracking Snippet
        </h2>
        <p className="subtitle">
          Use this exact snippet for {website.domain}.
        </p>
        <pre className="snippet-box">{snippet}</pre>
      </section>

      <section className="card danger-card">
        <h2 className="chart-title settings-title">
          <Trash2 size={20} />
          Delete Website
        </h2>
        <p className="subtitle">
          Deletes this website and all associated analytics events.
        </p>
        <form action={deleteAction} className="stacked-form">
          <input type="hidden" name="websiteId" value={website.id} />
          <input type="hidden" name="range" value={activeRange} />
          <label className="field">
            <span>Type {DELETE_WEBSITE_CONFIRMATION} to confirm</span>
            <input
              className="text-input"
              type="text"
              name="confirmation"
              pattern={DELETE_WEBSITE_CONFIRMATION}
              required
              autoComplete="off"
            />
          </label>
          {deleteState.message && (
            <p className="form-message form-error" role="alert" aria-live="polite">
              {deleteState.message}
            </p>
          )}
          <button type="submit" className="button button-danger" disabled={deletePending}>
            {deletePending ? 'Deleting…' : 'Delete Website'}
          </button>
        </form>
      </section>
    </div>
  );
}
