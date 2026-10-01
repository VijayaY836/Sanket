// Minimal stroke icons drawn for SANKET.
const P = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
export const IOverview = () => (<svg {...P}><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>);
export const ICase = () => (<svg {...P}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>);
export const IStars = () => (<svg {...P}><circle cx="6" cy="7" r="2.2" /><circle cx="17" cy="6" r="2.2" /><circle cx="12" cy="17" r="2.2" /><path d="M8 8l2.5 7M15.4 7.6 13 15M8.2 7l6.6-.6" /></svg>);
export const ICircuit = () => (<svg {...P}><path d="M2 7h20M2 17h20" /><rect x="5" y="4" width="5" height="6" rx="1" /><path d="M15 7v10" /><circle cx="15" cy="7" r="1.6" fill="currentColor" /><circle cx="15" cy="17" r="1.6" fill="currentColor" /></svg>);
export const IEvidence = () => (<svg {...P}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>);
export const IChip = () => (<svg {...P}><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" /></svg>);
export const IData = () => (<svg {...P}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></svg>);
export const ITheme = () => (<svg {...P}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>);
export const IPlay = () => (<svg {...P} width={16} height={16}><path d="M7 4l13 8-13 8z" fill="currentColor" /></svg>);
export const IDownload = () => (<svg {...P} width={16} height={16}><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>);
export const IReplay = () => (<svg {...P} width={16} height={16}><path d="M4 4v6h6" /><path d="M4.6 15a8 8 0 1 0 1.9-8.3L4 10" /></svg>);
export const Mark = ({ size = 30 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="9" fill="var(--violet)" />
    <path d="M5 18c3 0 3.5-7 6.5-7s3.5 10 6.5 10 3.5-7 6.5-7" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
    <circle cx="24.5" cy="14" r="3" fill="var(--eosin)" stroke="#fff" strokeWidth="1.5" />
  </svg>
);
export const ISpark = () => (<svg {...P}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></svg>);