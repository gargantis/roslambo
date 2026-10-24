export function startNostrRelay(port?: number): Promise<{ port: number; close: () => Promise<void> }>;
