/** Foreground-only access: approximate Android permission is a valid user choice. */
export interface LocationPermission {
  location: string;
  coarseLocation?: string;
}

export function locationPermissionMode(
  permission: LocationPermission,
  native: boolean,
): 'precise' | 'approximate' | 'browser-prompt' | 'denied' {
  if (permission.location === 'granted') return 'precise';
  if (permission.coarseLocation === 'granted') return 'approximate';
  // Browsers prompt from the user-initiated acquisition; native prompts must have resolved.
  if (!native && permission.location === 'prompt') return 'browser-prompt';
  return 'denied';
}
