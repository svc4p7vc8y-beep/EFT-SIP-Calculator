const PRODUCTION_API = "https://eftsip.ru/api/api.php";

export class EftApiError extends Error {
  constructor(message, code = "request_failed", status = 0, details = {}) {
    super(message);
    this.name = "EftApiError";
    this.code = code;
    this.status = status;
    Object.assign(this, details);
  }
}

export function resolveEftApiUrl(locationLike = globalThis.location) {
  const configured = String(import.meta.env?.VITE_EFT_API_URL || "").trim();
  if (configured) return configured;
  const hostname = String(locationLike?.hostname || "").toLowerCase();
  if (hostname === "eftsip.ru" || hostname === "www.eftsip.ru")
    return `${locationLike.origin}/api/api.php`;
  if (hostname === "localhost" || hostname === "127.0.0.1")
    return "/api/api.php";
  return PRODUCTION_API;
}

export async function eftApi(
  action,
  { method = "GET", body, csrf = "", signal, query = {} } = {},
) {
  const endpoint = resolveEftApiUrl();
  const separator = endpoint.includes("?") ? "&" : "?";
  const parameters = new URLSearchParams({ action, ...query });
  const response = await fetch(`${endpoint}${separator}${parameters}`, {
    method,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  let result;
  try {
    result = await response.json();
  } catch {
    result = {};
  }
  if (!response.ok || result.ok === false) {
    throw new EftApiError(
      result.message || `Ошибка сервера (${response.status})`,
      result.code,
      response.status,
      result,
    );
  }
  return result;
}

export function submitPublicIntake(payload) {
  return eftApi("intake", { method: "POST", body: payload });
}
