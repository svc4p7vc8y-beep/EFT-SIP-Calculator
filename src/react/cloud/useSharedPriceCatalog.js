import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { eftApi } from '../../shared/team-api.js';

const EMPTY = { status: 'loading', payload: null, revision: 0, canEdit: false, error: '', saving: false };
export function useSharedPriceCatalog(user, csrf) {
  const [priceCatalog, setPriceCatalog] = useState(EMPTY);
  const currentUser = useRef(user?.id);
  currentUser.current = user?.id;
  const latestRevision = useRef(0);
  const pendingRead = useRef(null);
  const accept = useCallback((result) => {
    if (!Array.isArray(result.payload?.priceMat) || !Array.isArray(result.payload?.priceLab) || !(result.revision > 0)) throw new Error('Сервер вернул некорректный прайс');
    if (result.revision < latestRevision.current) return;
    latestRevision.current = result.revision;
    setPriceCatalog(previous => ({ ...previous, ...result, payload: previous.revision === result.revision ? previous.payload || result.payload : result.payload, status: 'ready', error: '', checkedAt: new Date().toISOString() }));
  }, []);
  const refreshPriceCatalog = useCallback(() => {
    if (!user) return Promise.resolve(null);
    if (pendingRead.current?.userId === user.id) return pendingRead.current.promise;
    const request = { userId: user.id };
    request.promise = eftApi('price-catalog').then(result => {
      if (currentUser.current !== user.id) throw new Error('Сеанс прайса изменился');
      accept(result); return result;
    }).catch(error => {
      if (currentUser.current === user.id) setPriceCatalog(previous => ({ ...previous, status: 'error', error: error.message }));
      throw error;
    }).finally(() => { if (pendingRead.current === request) pendingRead.current = null; });
    pendingRead.current = request;
    return request.promise;
  }, [user?.id, accept]);
  useEffect(() => {
    latestRevision.current = 0;
    pendingRead.current = null;
    setPriceCatalog(EMPTY);
    if (!user) return undefined;
    const refresh = () => refreshPriceCatalog().catch(() => {});
    refresh();
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh); };
  }, [user?.id, refreshPriceCatalog]);
  const setPriceAccess = useCallback(async (lock, password = '') => {
    const result = await eftApi('price-access', { method: 'POST', csrf, body: { lock, password } });
    setPriceCatalog(previous => ({ ...previous, canEdit: result.canEdit }));
    return result.canEdit;
  }, [csrf]);
  const savePriceCatalog = useCallback(async (changes) => {
    setPriceCatalog(previous => ({ ...previous, saving: true }));
    try {
      const result = await eftApi('price-catalog', { method: 'PUT', csrf, body: { revision: latestRevision.current, changes } });
      if (currentUser.current !== user?.id) throw new Error('Сеанс прайса изменился');
      accept(result); return result;
    } catch (error) {
      if (error.code === 'price_conflict' || error.code === 'price_editor_locked') await refreshPriceCatalog().catch(() => {});
      throw error;
    } finally { setPriceCatalog(previous => ({ ...previous, saving: false })); }
  }, [csrf, user?.id, accept, refreshPriceCatalog]);
  const loadPriceHistory = useCallback((query = {}) => eftApi('price-history', { query }), []);
  return useMemo(() => ({ priceCatalog, refreshPriceCatalog, savePriceCatalog, setPriceAccess, loadPriceHistory }), [priceCatalog, refreshPriceCatalog, savePriceCatalog, setPriceAccess, loadPriceHistory]);
}
