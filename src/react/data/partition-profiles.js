export const PARTITION_BOARD_PROFILES = [
  { id: '50x100', label: '50×100 мм', color: '#2673c9' },
  { id: '50x150', label: '50×150 мм', color: '#8050b5' },
  { id: '50x200', label: '50×200 мм', color: '#d06a18' },
  { id: '45x95', label: '45×95 мм · строганая', color: '#158b79' },
  { id: '45x145', label: '45×145 мм · строганая', color: '#c33f55' },
  { id: '45x195', label: '45×195 мм · строганая', color: '#667f21' },
];

export const partitionProfileColor = profile =>
  PARTITION_BOARD_PROFILES.find(item => item.id === String(profile || '').replace(/[×х]/g, 'x'))?.color || '#138447';

export const partitionProfileLabel = profile =>
  PARTITION_BOARD_PROFILES.find(item => item.id === String(profile || '').replace(/[×х]/g, 'x'))?.label || String(profile || '').replace('x', '×');
