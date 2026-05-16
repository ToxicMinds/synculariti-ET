/**
 * Augment the Navigator interface for the Web Locks API.
 * This ensures type safety for navigator.locks.request across the codebase.
 */

interface LockManager {
    request(name: string, callback: () => Promise<void>): Promise<void>;
    request<T>(
        name: string,
        options: { mode?: 'exclusive' | 'shared'; signal?: AbortSignal },
        callback: () => Promise<T>
    ): Promise<T>;
}

interface Navigator {
    locks: LockManager;
}
