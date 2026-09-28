import { calculateProductionCutting } from './production-cutting.js';
self.onmessage = ({ data }) => {
  try { self.postMessage({ report: calculateProductionCutting(data.project, data.calculation) }); }
  catch (error) { self.postMessage({ error: error.message }); }
};
