const PRODUCTION_API = "https://eftsip.ru/api/api.php";
export const standaloneCalculator = import.meta.env?.VITE_EFT_STANDALONE === 'true';

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
  if (standaloneCalculator) throw new EftApiError('В резервной версии доступны локальные проекты. Серверные функции подключаются на calc.eftsip.ru после восстановления хостинга.', 'standalone_mode');
  const endpoint = resolveEftApiUrl();
  const separator = endpoint.includes("?") ? "&" : "?";
  const parameters = new URLSearchParams({ action, ...query });
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  let response;
  try { response = await fetch(`${endpoint}${separator}${parameters}`, {
    method,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(body === undefined || isFormData ? {} : { "Content-Type": "application/json" }),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    body: body === undefined ? undefined : (isFormData ? body : JSON.stringify(body)),
    signal,
  }); } catch (error) {
    if(error.name==='AbortError')throw error;
    const failure=new EftApiError('Нет связи с сервером. Проверьте интернет или продолжайте работу локально.','network_unavailable');
    if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('eft:connection-error',{detail:{code:failure.code,message:failure.message}}));
    throw failure;
  }
  let result;
  try {
    result = await response.json();
  } catch {
    const failure=new EftApiError('Сервер временно не отвечает корректно. Доступна локальная работа.','invalid_response',response.status);
    if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('eft:connection-error',{detail:{code:failure.code,message:failure.message}}));
    throw failure;
  }
  if (!response.ok || result.ok === false) {
    const failure = new EftApiError(
      result.message || `Ошибка сервера (${response.status})`,
      result.code,
      response.status,
      result,
    );
    if(typeof window!=='undefined'&&((failure.code==='authentication_required'&&action!=='login')||response.status>=500))window.dispatchEvent(new CustomEvent('eft:connection-error',{detail:{code:failure.code,message:response.status>=500?'Сервер временно недоступен. Изменения сохраняются на устройстве.':failure.message}}));
    throw failure;
  }
  return result;
}

export function submitPublicIntake(payload) {
  return eftApi("intake", { method: "POST", body: payload });
}

export function recordPublicVisit(locationLike = globalThis.location) {
  const hostname = String(locationLike?.hostname || "").toLowerCase();
  if (hostname !== "eftsip.ru" && hostname !== "www.eftsip.ru")
    return Promise.resolve({ counted: false });
  return eftApi("site-visit", { method: "POST" });
}
