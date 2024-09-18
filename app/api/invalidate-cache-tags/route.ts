/*
 * This route handler receives "Cache Tag Invalidation" events from a DatoCMS
 * webhook, and is responsible for invalidating every cached GraphQL query that
 * is linked to those tags.
 *
 * This is possible because `executeQuery()` in lib/fetch-content.ts does two
 * things:
 *
 * - It tags each GraphQL request with a unique ID in the Next.js Data Cache
 * - It saves the mapping "Query ID <-> Cache Tags" in a Vercel KV store (serverless redis)
 *
 * So, we just need to query the KV to find the query IDs related to the
 * received tags, and use `revalidateTag()` to invalidate the relevant requests.
 *
 * Read more: https://www.datocms.com/docs/content-delivery-api/cache-tags#step-3-implement-the-invalidate-cache-tag-webhook
 */
import { NextResponse } from 'next/server';

import type { CacheTag } from '@/lib/cache-tags';
import {deleteCacheTags, queriesReferencingCacheTags} from '@/lib/database';
import { revalidateTag } from 'next/cache';

export const dynamic = 'force-dynamic'; // defaults to auto

type CdaCacheTagsInvalidateWebhook = {
  entity_type: 'cda_cache_tags';
  event_type: 'invalidate';
  entity: {
    id: 'cda_cache_tags';
    type: 'cda_cache_tags';
    attributes: {
      // The array of DatoCMS Cache Tags that need to be invalidated
      tags: CacheTag[];
    };
  };
};

export async function POST(request: Request) {
  if (request.headers.get('Webhook-Token') !== process.env.WEBHOOK_TOKEN) {
    return NextResponse.json(
      {
        error:
          'You need to provide a secret token in the `Webhook-Token` header for this endpoint.',
      },
      { status: 401 },
    );
  }

  const data = (await request.json()) as CdaCacheTagsInvalidateWebhook;

  const cacheTags = data.entity.attributes.tags;
  console.info(`Cache tags to invalidate: ${cacheTags.length ? cacheTags.join() : 'None'}`);

  const queryIds = await queriesReferencingCacheTags(cacheTags);
  console.info(`Query IDs I got from the KV: ${queryIds.length ? queryIds.join() : 'None'}`);

  for (const queryId of queryIds) {
    /**
     * The `revalidateTag()` function provided by Next.js actually performs a
     * cache invalidation: this means that the cache entries previously
     * associated with the given tag are immediately marked as outdated (the
     * process is so fast that the method is even synchronous).
     *
     * The next time someone requests any of these outdated entries, the cache
     * will respond with a MISS.
     */
    console.info(`Asking Next to revalidate query ID ${queryId}...`)
    revalidateTag(queryId);
  }


  const numOfDeletedCacheTags = await deleteCacheTags(cacheTags);
  if (numOfDeletedCacheTags === null) {
    console.error(`There was a KV error deleting ${cacheTags.length} cache tags: ${cacheTags.join()}`);
  } else if (numOfDeletedCacheTags === 0) {
    console.warn(`Warning: You asked me to delete ${cacheTags.length} cache tags, but the KV ended up deleting nothing: ${cacheTags.join()}`)
  } else {
    console.info(`Successfully deleted ${numOfDeletedCacheTags} cache tags from the KV: ${cacheTags.join()}`);
  }

  return NextResponse.json({ cacheTags, queryIds });
}
