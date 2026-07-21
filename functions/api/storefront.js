import { PUBLIC_STATE_NAMES, dbFrom, ensureSchema, json, error, readState } from '../_lib.js';

export async function onRequestGet(context) {
  try {
    const db = dbFrom(context);
    await ensureSchema(db);
    const state = await readState(db, PUBLIC_STATE_NAMES);
    return json({ ok: true, ...state });
  } catch (cause) {
    return error('Storefront data is temporarily unavailable.', 503, cause.message);
  }
}
