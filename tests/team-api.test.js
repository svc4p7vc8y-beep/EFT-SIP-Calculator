import test from "node:test";
import assert from "node:assert/strict";
import {
  eftApi,
  EftApiError,
  resolveEftApiUrl,
} from "../src/shared/team-api.js";

test("API URL keeps public intake on the main domain and calculator data private behind the same API", () => {
  assert.equal(
    resolveEftApiUrl({ hostname: "eftsip.ru", origin: "https://eftsip.ru" }),
    "https://eftsip.ru/api/api.php",
  );
  assert.equal(
    resolveEftApiUrl({
      hostname: "calc.eftsip.ru",
      origin: "https://calc.eftsip.ru",
    }),
    "https://eftsip.ru/api/api.php",
  );
  assert.equal(
    resolveEftApiUrl({
      hostname: "svc4p7vc8y-beep.github.io",
      origin: "https://svc4p7vc8y-beep.github.io",
    }),
    "https://eftsip.ru/api/api.php",
  );
});

test("API client sends credentials, CSRF and separate query parameters", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocation = globalThis.location;
  globalThis.location = { hostname: "eftsip.ru", origin: "https://eftsip.ru" };
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(JSON.stringify({ ok: true, projects: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    await eftApi("project", {
      method: "PUT",
      csrf: "token",
      query: { id: "a&b" },
      body: { revision: 3 },
    });
    assert.match(request.url, /action=project/);
    assert.match(request.url, /id=a%26b/);
    assert.equal(request.options.credentials, "include");
    assert.equal(request.options.headers["X-CSRF-Token"], "token");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.location = originalLocation;
  }
});

test("API client exposes a safe server error to the interface", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocation = globalThis.location;
  globalThis.location = { hostname: "eftsip.ru", origin: "https://eftsip.ru" };
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        ok: false,
        code: "revision_conflict",
        message: "Проект уже изменён",
      }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  try {
    await assert.rejects(
      () => eftApi("project"),
      (error) =>
        error instanceof EftApiError &&
        error.code === "revision_conflict" &&
        error.status === 409,
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.location = originalLocation;
  }
});
