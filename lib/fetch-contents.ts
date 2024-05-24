import { createHash } from "crypto";
import {
  associateFetchIdToTags,
  parseCommaSeparatedTagString,
} from "./cache-tags";

/**
 * `executeQuery` uses `fetch` to make a request to the
 * DatoCMS GraphQL API
 */
export async function executeQuery(query = "", variables = {}) {
  if (!query) {
    throw new Error(`Query is not valid`);
  }

  const response = await fetch("https://graphql.datocms.com/", {
    method: "POST",
    // Headers are used to instruct DatoCMS on how to treat the request:
    headers: {
      // - No token, no party: only authorized requests return data
      Authorization: `Bearer ${process.env.PUBLIC_DATOCMS_API_TOKEN}`,
      // - Only return valid record
      "X-Exclude-Invalid": "true",
      // - Finally, return the cache tags together with the content.
      "X-Cache-Tags": "true",
    },
    body: JSON.stringify({ query, variables }),
    // Next uses some reasonable default for caching, but we explicite them all
    cache: "force-cache",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch data: ${JSON.stringify(response)}`);
  }

  const { data, errors } = await response.json();

  if (errors) {
    throw new Error(
      `Something went wrong while executing the query: ${JSON.stringify(errors)}`,
    );
  }

  /**
   * Converts the string of cache tags received via headers into an array of
   * tags of `CacheTag` type.
   */
  const tags = parseCommaSeparatedTagString(
    response.headers.get("x-cache-tags"),
  );

  await fetch("https://graphql.datocms.com/", {
    method: "POST",
    // Headers are used to instruct DatoCMS on how to treat the request:
    headers: {
      // - No token, no party: only authorized requests return data
      Authorization: `Bearer ${process.env.PUBLIC_DATOCMS_API_TOKEN}`,
      // - Only return valid record
      "X-Exclude-Invalid": "true",
      // - Finally, return the cache tags together with the content.
      "X-Cache-Tags": "true",
    },
    body: JSON.stringify({ query, variables }),
    // Next uses some reasonable default for caching, but we explicite them all
    cache: "force-cache",
    next: {
      tags,
    },
  });

  /**
   * For educational purpose, tags are returned together with the data: in a
   * real-world application this is probably not needed.
   */
  return { data, tags };
}
