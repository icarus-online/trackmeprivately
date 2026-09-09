'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import {
  buildDashboardHref,
  normalizeDashboardRange,
  normalizeWebsiteDomain,
  normalizeWebsiteId,
  normalizeWebsiteName,
  websiteMutationError,
  type WebsiteActionState,
  DELETE_WEBSITE_CONFIRMATION,
} from '@/lib/websites';

async function requireAdminSession() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }
  return session;
}

export async function createWebsite(
  _previousState: WebsiteActionState,
  formData: FormData,
): Promise<WebsiteActionState> {
  await requireAdminSession();

  const name = normalizeWebsiteName(formData.get('name'));
  const domain = normalizeWebsiteDomain(formData.get('domain'));
  const range = normalizeDashboardRange(formData.get('range'));

  if (!name || !domain) {
    return { message: 'Enter a valid site name and domain.' };
  }

  let websiteId: string;
  try {
    const website = await prisma.website.create({
      data: { name, domain },
      select: { id: true },
    });
    websiteId = website.id;
  } catch (err) {
    console.error('Failed to create website:', err);
    return { message: websiteMutationError(err, 'create') };
  }

  revalidatePath('/');
  redirect(buildDashboardHref(websiteId, range));
}

export async function updateWebsite(
  _previousState: WebsiteActionState,
  formData: FormData,
): Promise<WebsiteActionState> {
  await requireAdminSession();

  const websiteId = normalizeWebsiteId(formData.get('websiteId'));
  const name = normalizeWebsiteName(formData.get('name'));
  const domain = normalizeWebsiteDomain(formData.get('domain'));
  const range = normalizeDashboardRange(formData.get('range'));

  if (!websiteId || !name || !domain) {
    return { message: websiteId
      ? 'Enter a valid site name and domain.'
      : 'The website selection is missing. Refresh the dashboard and try again.' };
  }

  try {
    await prisma.website.update({
      where: { id: websiteId },
      data: { name, domain },
    });
  } catch (err) {
    console.error('Failed to update website:', err);
    return { message: websiteMutationError(err, 'update') };
  }

  revalidatePath('/');
  redirect(buildDashboardHref(websiteId, range));
}

export async function deleteWebsite(
  _previousState: WebsiteActionState,
  formData: FormData,
): Promise<WebsiteActionState> {
  await requireAdminSession();

  const websiteId = normalizeWebsiteId(formData.get('websiteId'));
  const confirmation = formData.get('confirmation');
  const range = normalizeDashboardRange(formData.get('range'));

  if (!websiteId) {
    return { message: 'The website selection is missing. Refresh the dashboard and try again.' };
  }
  if (confirmation !== DELETE_WEBSITE_CONFIRMATION) {
    return { message: `Type ${DELETE_WEBSITE_CONFIRMATION} exactly to confirm deletion.` };
  }

  let nextWebsite: { id: string } | null;
  try {
    nextWebsite = await prisma.website.findFirst({
      where: { id: { not: websiteId } },
      orderBy: { name: 'asc' },
      select: { id: true },
    });
    await prisma.website.delete({ where: { id: websiteId } });
  } catch (err) {
    console.error('Failed to delete website:', err);
    return { message: websiteMutationError(err, 'delete') };
  }

  revalidatePath('/');
  redirect(buildDashboardHref(nextWebsite?.id, range));
}
