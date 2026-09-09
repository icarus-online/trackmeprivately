'use client';

import { ArrowRight } from 'lucide-react';
import { useActionState } from 'react';
import { createWebsite } from '@/app/actions';
import { INITIAL_WEBSITE_ACTION_STATE } from '@/lib/websites';
import type { RangeKey } from '@/lib/range';

export default function CreateWebsiteForm({ activeRange }: { activeRange: RangeKey }) {
  const [state, formAction, pending] = useActionState(
    createWebsite,
    INITIAL_WEBSITE_ACTION_STATE,
  );

  return (
    <form action={formAction} className="create-website-form">
      <input type="hidden" name="range" value={activeRange} />
      <label className="field create-website-field">
        <span>Site Name</span>
        <input className="text-input" type="text" name="name" required placeholder="e.g. My Website" />
      </label>
      <label className="field create-website-field">
        <span>Domain Name</span>
        <input className="text-input" type="text" name="domain" required placeholder="e.g. example.com" />
      </label>
      <button type="submit" className="button button-primary create-website-button" disabled={pending}>
        {pending ? 'Creating…' : 'Create'}
        {!pending && <ArrowRight size={16} />}
      </button>
      {state.message && (
        <p className="form-message form-error create-website-message" role="alert" aria-live="polite">
          {state.message}
        </p>
      )}
    </form>
  );
}
