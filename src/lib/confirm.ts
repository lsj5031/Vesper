import { writable } from "svelte/store";

/**
 * Options for displaying a confirmation modal
 */
export interface ConfirmOptions {
    /** Title of the confirmation dialog */
    title: string;
    /** Message body of the confirmation dialog */
    message: string;
    /** Text for the confirm button (default: "Confirm") */
    confirmText?: string;
    /** Text for the cancel button (default: "Cancel") */
    cancelText?: string;
    /** Whether this is a dangerous action (shows red/claret styling) */
    isDangerous?: boolean;
}

/**
 * Internal state for the confirm modal
 */
interface ConfirmState extends Required<ConfirmOptions> {
    isOpen: boolean;
    resolve: ((value: boolean) => void) | null;
}

const defaultState: ConfirmState = {
    isOpen: false,
    title: "",
    message: "",
    confirmText: "Confirm",
    cancelText: "Cancel",
    isDangerous: false,
    resolve: null,
};

/**
 * Store that controls the confirm modal's visibility and content
 */
export const confirmState = writable<ConfirmState>(defaultState);

/**
 * Shows a confirmation modal and returns a promise that resolves
 * to true if confirmed, false if cancelled.
 *
 * @example
 * ```ts
 * if (await showConfirm({ title: "Delete?", message: "This cannot be undone", isDangerous: true })) {
 *   // User confirmed
 * }
 * ```
 */
export function showConfirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        confirmState.set({
            isOpen: true,
            title: options.title,
            message: options.message,
            confirmText: options.confirmText || "Confirm",
            cancelText: options.cancelText || "Cancel",
            isDangerous: options.isDangerous || false,
            resolve,
        });
    });
}

/**
 * Programmatically close the confirm modal with a result
 * @internal - used by ConfirmModal component
 */
export function closeConfirm(result: boolean) {
    confirmState.update((state) => {
        if (state.resolve) {
            state.resolve(result);
        }
        return { ...defaultState };
    });
}
