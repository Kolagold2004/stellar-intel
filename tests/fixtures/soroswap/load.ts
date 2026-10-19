/**
 * Loader for recorded Soroswap API responses (issue #1084).
 *
 * Every JSON file in this directory is a real response captured from
 * https://api.soroswap.finance, stamped with `capturedAt`. Tests replay them
 * through a stubbed `fetch`, so the suite runs with the network unplugged.
 * Never hand-edit a fixture: re-record it instead.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));

export interface SoroswapFixture {
  name: string;
  /** ISO timestamp of when the response was captured from the live API. */
  capturedAt: string;
  status: number;
  body: unknown;
  /** Request body that produced the response, when it was recorded. */
  request?: Record<string, unknown>;
}

export function loadSoroswapFixture(name: string): SoroswapFixture {
  const raw = JSON.parse(readFileSync(path.join(DIR, `${name}.json`), 'utf8'));
  // Two recorded layouts exist: flat ({ status, body }) and nested
  // ({ response: { status, body } }). Normalise both.
  const status = raw.status ?? raw.response?.status;
  const body = raw.body ?? raw.response?.body;
  const request = raw.request?.body ?? raw.request;
  if (typeof raw.capturedAt !== 'string' || Number.isNaN(Date.parse(raw.capturedAt))) {
    throw new Error(`Fixture "${name}" has no valid capturedAt timestamp`);
  }
  if (typeof status !== 'number') {
    throw new Error(`Fixture "${name}" has no numeric status`);
  }
  return { name, capturedAt: raw.capturedAt, status, body, request };
}

export function listSoroswapFixtures(prefix = ''): string[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.json') && f.startsWith(prefix))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}

/** A fetch() response stand-in that replays a recorded status and body. */
export function fixtureResponse(f: SoroswapFixture) {
  return {
    ok: f.status >= 200 && f.status < 300,
    status: f.status,
    json: async () => f.body,
    text: async () => JSON.stringify(f.body),
  };
}
