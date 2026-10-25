export interface ClientCounts {
  req: number;
  close: number;
  event: number;
}
export function startNostrRelay(port?: number): Promise<{ port: number; counts: () => ClientCounts[]; close: () => Promise<void> }>;
