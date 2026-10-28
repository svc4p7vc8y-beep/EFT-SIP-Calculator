import React from 'react';

const Icon = ({ children, size = 24, strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>
);

export const PlanIcon = props => <Icon {...props}><path d="M3 3h18v18H3zM3 11h8V3M11 11v10M11 15h10M16 15v6"/><path d="M7 11v2m4 5h2"/></Icon>;
export const FurnitureIcon = props => <Icon {...props}><path d="M2 13h11v5H2zM3 13V8h9v5M4 18v2m8-2v2M13 9v4"/><path d="M17 9a3 3 0 1 1 4 2.8V14h-4v-2.2A3 3 0 0 1 17 9ZM17 16h4m-3 2h2"/></Icon>;
export const ScrewPileIcon = props => <Icon {...props}><path d="M5 3h14M8 5h8M11 5v12m2-12v12M8 10l8 3-8 3M9 18l3 3 3-3"/></Icon>;
export const ScrewIcon = props => <Icon {...props}><path d="M3 7l4-4 3 3-4 4zM8 8l11 11m-8-8-3 3m6 0-3 3m6 0-3 3"/></Icon>;
export const SawIcon = props => <Icon {...props}><path d="M3 20a17 17 0 0 1 17-17l-2 3 3 1-2 3 2 2-3 2 1 3-3 1v2H3Z"/><path d="M8 20a12 12 0 0 1 12-12M4 20h16"/></Icon>;
export const RoofIcon = props => <Icon {...props}><path d="M2 17 12 5l10 12M4 18h16M12 5v4M7 14l5-6 5 6"/></Icon>;
export const TerraceIcon = props => <Icon {...props}><path d="M2 9h20M4 9v10m16-10v10M2 19h20M5 13h14M7 13v6m5-6v6m5-6v6"/></Icon>;
export const WindowIcon = props => <Icon {...props}><path d="M3 3h18v18H3zM12 3v18M3 12h18"/></Icon>;
export const FaucetIcon = props => <Icon {...props}><path d="M3 15h15v-4a4 4 0 0 0-4-4H8M8 7V4m-3 0h6M2 15v3h7v-3m9-2h3v3h-3M18 19c0 1-1 2-1 2s-1-1-1-2a1 1 0 0 1 2 0Z"/></Icon>;
export const FacadeIcon = props => <Icon {...props}><path d="M3 21V8l9-5 9 5v13H3ZM3 11h18M3 15h18M3 19h18M8 11v4m8 0v4"/></Icon>;
