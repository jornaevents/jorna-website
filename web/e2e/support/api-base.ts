// A fake, non-resolving host used only in E2E runs. Every request to it is
// intercepted by the mock router in fixtures.ts, so nothing ever reaches a
// real network. Deliberately not the real API_BASE default (a live
// production backend — see web/src/lib/api.ts): a test with a missing mock
// should fail loudly (unhandled route / navigation error), not silently hit
// production.
export const MOCK_API_BASE = "http://mock-jorna-api.test";
