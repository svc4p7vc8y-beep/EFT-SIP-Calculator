export const EFT_BOOK_INDEX = Object.freeze({
  foundation: { label: 'Фундамент', pages: null, status: 'requires-indexing', nodes: ['PILE_BINDING'] },
  sipFloor: { label: 'SIP-пол', pages: '34–64', status: 'indexed', nodes: ['SIP_FLOOR_SUPPORT'] },
  walls: { label: 'Стены и обвязки', pages: '56, 59–60, 68–78', status: 'indexed', nodes: ['SIP_START_BOARD', 'SIP_TOP_BOARD', 'SIP_WALL_CORNER', 'SIP_WALL_CONNECTION'] },
  splines: { label: 'Шпонки и термобрус', pages: '12, 34, 60, 78, 143–144', status: 'indexed', nodes: ['SIP_SPLINE', 'SIP_EDGE_BOARD'] },
  openings: { label: 'Проёмы', pages: null, status: 'requires-indexing', nodes: ['OPENING_FRAME_WINDOW', 'OPENING_FRAME_DOOR'] },
  intermediateFloor: { label: 'Межэтажное перекрытие', pages: '34–64', status: 'indexed', nodes: ['SIP_WALL_TO_FLOOR'] },
  sipCeiling: { label: 'SIP-потолок', pages: '34–64', status: 'indexed', nodes: ['SIP_CEILING_SUPPORT', 'SIP_WALL_TO_CEILING'] },
  sipRoof: { label: 'SIP-кровля и конёк', pages: '134–144, 161–164', status: 'indexed', nodes: ['SIP_ROOF_SUPPORT'] },
  rafters: { label: 'Стропильная система', pages: null, status: 'requires-indexing', nodes: ['RAFTER_TO_MAUERLAT', 'RAFTER_TO_RIDGE', 'RAFTER_TIE'] },
  lath: { label: 'Обрешётка и контробрешётка', pages: null, status: 'requires-indexing', nodes: ['ROOF_LATH', 'ROOF_COUNTERLATH'] },
  terraces: { label: 'Террасы, навесы и крыльцо', pages: null, status: 'requires-indexing', nodes: ['TERRACE_LEDGER', 'TERRACE_JOIST', 'PORCH_FRAME'] },
});
