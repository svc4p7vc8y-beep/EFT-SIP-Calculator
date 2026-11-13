import { useCallback, useRef } from 'react';
import { useTeam } from './TeamContext.jsx';

// Export/print must use the render after the last successful server price read.
export function useCurrentPriceAction(action) {
  const team = useTeam();
  const latestAction = useRef(action);
  latestAction.current = action;
  return useCallback(async (...args) => {
    try {
      if (team.user) {
        try{await team.refreshPriceCatalog();}catch(error){team.reportConnectionIssue(error);}
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
      return await latestAction.current(...args);
    } catch (error) { window.alert(`Не удалось выполнить действие: ${error.message}`); }
  }, [team.user?.id, team.refreshPriceCatalog,team.reportConnectionIssue]);
}
