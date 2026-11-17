// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/* Small inline SVG icon system. No network or icon-font dependency. */
export const icons = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16m6-14v16"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  route:
    '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h9a4 4 0 0 1 0 8H8a3 3 0 0 0 0 6h9"/>',
  users:
    '<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2m2-17a3 3 0 0 1 0 6m1 5a5 5 0 0 1 3 4v2"/>',
  user: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  briefcase:
    '<rect x="3" y="6" width="18" height="15" rx="3"/><path d="M8 6V3h8v3M3 12a23 23 0 0 0 18 0m-11 0v3h4v-3"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h1m6 0h1m-8 3h1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  'arrow-left': '<path d="M20 12H4m6-6-6 6 6 6"/>',
  'arrow-right': '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  'chevron-left': '<path d="m14 6-6 6 6 6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  x: '<path d="m6 6 12 12M6 18 18 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  settings:
    '<path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 3 3-1 2 3 3-1 1-3 3-1 2-3-2-2 1-3-3-3-3 1-2-3z"/><circle cx="12" cy="12" r="3"/>',
  logout: '<path d="M9 21H4V3h5m6 5 5 4-5 4m-7-4h12"/>',
  phone: '<path d="m5 3 4 4-2 3a13 13 0 0 0 7 7l3-2 4 4-2 3C9 21 3 15 2 5z"/>',
  message:
    '<path d="M21 11a9 9 0 0 1-9 9 11 11 0 0 1-4-1l-5 2 1-5a9 9 0 1 1 17-5Z"/><path d="M8 9h8m-8 4h5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
  file: '<path d="M14 2H5v20h14V7zM14 2v6h5M8 12h8m-8 4h6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  camera: '<path d="M8 5 10 2h4l2 3h5v16H3V5z"/><circle cx="12" cy="12" r="4"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m21 15-6-6L4 20"/>',
  edit: '<path d="m15 4 5 5M4 16 16 4a3 3 0 0 1 4 4L8 20l-5 1z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  star: '<path d="m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>',
  target:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  chart: '<path d="M4 3v18h17M8 16v-5m5 5V7m5 9V4"/>',
  trend: '<path d="m3 17 6-6 4 4 8-10m-7 0h7v7"/>',
  wallet: '<path d="M20 7V4H5a3 3 0 0 0 0 6h16v10H5a3 3 0 0 1-3-3V7m19 6h-5v4h5"/>',
  'credit-card': '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 9h20M6 15h4"/>',
  shield: '<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6z"/><path d="m8 11 3 3 5-5"/>',
  refresh: '<path d="M3 10a9 9 0 0 1 15-6l3 3m0-5v5h-5M21 14a9 9 0 0 1-15 6l-3-3m0 5v-5h5"/>',
  wifi: '<path d="M2 8a17 17 0 0 1 20 0M5 12a12 12 0 0 1 14 0m-10 4a5 5 0 0 1 6 0"/><circle cx="12" cy="20" r=".5"/>',
  'wifi-off':
    '<path d="m3 3 18 18M2 8a17 17 0 0 1 7-3m6 0a17 17 0 0 1 7 3M5 12a12 12 0 0 1 9-2m-5 6a5 5 0 0 1 5 0"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>',
  alert: '<path d="m12 3 10 18H2zM12 9v5m0 3v1"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2l-2 2m0 4v.1"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
  moon: '<path d="M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z"/>',
  rocket:
    '<path d="M12 4c3-2 6-2 9-1 1 6-2 12-8 14l-6-6c1-3 3-5 5-7ZM7 11 3 12l-1 6 5-1m6 0-1 5 6-1 1-5M7 17l-3 3"/><circle cx="16" cy="8" r="2"/>',
  code: '<path d="m8 5-6 7 6 7m8-14 6 7-6 7M14 3l-4 18"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  monitor: '<rect x="3" y="3" width="18" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  server:
    '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6v1m0 10v1m5-11h5m-5 11h5"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/><rect x="9" y="9" width="6" height="6"/>',
  layers: '<path d="m12 2 10 6-10 6L2 8zm-9 11 9 6 9-6m-18 5 9 5 9-5"/>',
  external: '<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',
  filter: '<path d="M3 4h18l-7 8v7l-4 2v-9z"/>',
  list: '<path d="M8 5h13M8 12h13M8 19h13M3 5h.1M3 12h.1M3 19h.1"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  pause: '<path d="M8 4v16M16 4v16"/>',
  play: '<path d="m7 3 14 9-14 9z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4zm0 0L11 13"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  signature: '<path d="M3 17c4-2 10-12 9-14-2-4-8 13-5 15s5-8 6-7-2 9 1 7l4-3m-2 6h6"/>',
  lock: '<rect x="4" y="10" width="16" height="12" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v3"/>',
  unlock:
    '<rect x="4" y="10" width="16" height="12" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0m-4 9v3"/>',
  building: '<path d="M3 21h18M5 21V3h10v18m0-11h4v11M8 7h4m-4 4h4m-4 4h4"/>',
  gift: '<rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8M12 8v13M12 8c-8 0-8-7-4-6 3 0 4 6 4 6Zm0 0c8 0 8-7 4-6-3 0-4 6-4 6Z"/>',
  flag: '<path d="M4 22V3c6-4 10 4 16 0v11c-6 4-10-4-16 0"/>',
  link: '<path d="m9 15 6-6m-5-3 2-2a6 6 0 0 1 8 8l-2 2M6 10l-2 2a6 6 0 0 0 8 8l2-2"/>',
  sparkles: '<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6zM20 2v4m-2-2h4"/>',
  headphones: '<path d="M3 14v-3a9 9 0 0 1 18 0v3M3 13h4v8H3zm14 0h4v8h-4z"/>',
  receipt: '<path d="M5 2 8 4l4-2 4 2 3-2v20l-3-2-4 2-4-2-3 2zM8 8h8m-8 4h8m-8 4h4"/>',
  checklist: '<path d="m3 6 2 2 3-4m3 2h10M3 13l2 2 3-4m3 2h10M3 20l2 2 3-4m3 2h10"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6z"/>',
};
