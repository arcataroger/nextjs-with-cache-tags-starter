/*
 * The purpose of this module is to manage the associations between the GraphQL queries made to the
 * DatoCMS Content Delivery API, and the `Cache-Tags` that these requests return.
 *
 * This particular demo uses Vercel KV to store this data: https://vercel.com/docs/storage/vercel-kv
 * Vercel KV is a whitelabeled version of a Upstash, a serverless redis service
 *
 * These associations will allow us to selectively invalidate individual GraphQL
 * queries, when we receive a "Cache Tags Invalidation" webhook from DatoCMS.
 */

import {kv} from '@vercel/kv';
import type {CacheTag} from './cache-tags';

/*
 * For each cache tag, add the query ID to a Redis Set. A Set is an unordered collection of unique strings.
 */
export async function storeQueryCacheTags(
    queryId: string,
    cacheTags: CacheTag[],
) {
    for (const cacheTag of cacheTags) {
        try {
            await kv.sadd(cacheTag, queryId)
        } catch (e) {
            console.error(`Error storing query ID for cache tags ${cacheTags.join()}: ${e}`)
        }
    }

}

/*
 * Retrieves affected query IDs for one or more cache tags
 */
export async function queriesReferencingCacheTags(
    cacheTags: CacheTag[],
): Promise<string[]> {
    try {
        // With normal redis or or Upstash, you can query several keys at once
        // But in the Vercel SDK, it seems the method expects one key as the first param and then the rest after that
        const [firstTag, ...remainingTags] = cacheTags;
        const queryIds = await kv.sunion(firstTag, ...remainingTags) as string[]
        console.info(`Query IDs for cache tags ${cacheTags.join()}: ${queryIds.length ? queryIds.join() : 'None found'}`)
        return queryIds
    } catch (e) {
        console.error(`Error retrieving cache tags ${cacheTags.join()}: ${e}`)
        return []
    }
}

/*
 * Removes one or more cache tags
 */
export async function deleteCacheTags(cacheTags: CacheTag[]): Promise<number|null> {
    try {
      const numberOfDeletedKeys = await kv.del(...cacheTags);
      return numberOfDeletedKeys
    } catch (e) {
        console.error(`Error deleting cache tags ${JSON.stringify(cacheTags)}: ${e}`)
        return null
    }
}

/*
 * Wipes out all data contained in the KV store.
 */
export async function truncateAssociationsTable():Promise<"OK"|null> {
    try {
        const dbFlushResult = await kv.flushdb({async: true}) // TODO Does it matter if we use JS async vs a sync flushdb?
        return dbFlushResult
    } catch (e) {
        console.error(`Error flushing the KV store`)
        return null
    }}
