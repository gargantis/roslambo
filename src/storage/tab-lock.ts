// One game tab per browser (Q-16, D-18): a Web Lock. A second tab asks
// before taking over; taking over steals the lock, and the first tab hears
// that its lock was taken.

const LOCK = 'roslambo-game';

/** Resolves true once this tab holds the lock, false if another tab does
 *  (and `steal` is false). `onLost` runs if another tab takes it later.
 *  Without Web Locks (very old browsers), every tab plays. */
export function holdTabLock(steal: boolean, onLost: () => void): Promise<boolean> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) return Promise.resolve(true);
  return new Promise((resolve) => {
    const options: LockOptions = steal ? { steal: true } : { ifAvailable: true };
    locks.request(LOCK, options, (lock) => {
      if (!lock) {
        resolve(false);
        return undefined;
      }
      resolve(true);
      return new Promise<void>(() => {}); // held until the page closes, or another tab steals it
    }).catch(() => onLost());
  });
}
