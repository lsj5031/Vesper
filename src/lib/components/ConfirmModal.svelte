<script lang="ts">
import { onMount, onDestroy } from "svelte";
import { fade, scale } from "svelte/transition";
import { quintOut } from "svelte/easing";
import { confirmState, closeConfirm } from "../confirm";
import { themeMode } from "../stores";

let prevOverflow = "";
onMount(() => {
    prevOverflow = document.body.style.overflow;
});
onDestroy(() => {
    document.body.style.overflow = prevOverflow;
});

$: isDark = $themeMode === "dark";

$: if ($confirmState.isOpen) {
    document.body.style.overflow = "hidden";
} else {
    document.body.style.overflow = prevOverflow;
}

function handleBackdropClick() {
    closeConfirm(false);
}

function handleCancel() {
    closeConfirm(false);
}

function handleConfirm() {
    closeConfirm(true);
}

function handleKeydown(e: KeyboardEvent) {
    if (!$confirmState.isOpen) return;
    if (e.key === "Escape") {
        closeConfirm(false);
    }
}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if $confirmState.isOpen}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center"
        style={`background:${isDark ? "var(--o3-color-palette-black-90)" : "var(--o3-color-palette-paper)"}`}
        transition:fade={{ duration: 200 }}
    >
        <button
            class="fixed inset-0 cursor-default"
            on:click={handleBackdropClick}
            aria-label="Close confirmation dialog"
        ></button>

        <div
            class="border shadow-2xl max-w-md w-full rounded relative z-10 p-6"
            class:border-o3-claret={$confirmState.isDangerous}
            class:border-o3-teal={!$confirmState.isDangerous}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
            style={`background:var(--vesper-panel)`}
            in:scale={{ start: 0.95, duration: 300, easing: quintOut }}
        >
            <div class="mb-6">
                <h2
                    id="confirm-title"
                    class="text-xl font-headline font-bold mb-2"
                    class:text-o3-white={isDark}
                    class:text-o3-black-90={!isDark}
                >
                    {$confirmState.title}
                </h2>
                <p
                    id="confirm-message"
                    class="text-sm"
                    class:text-o3-black-40={isDark}
                    class:text-o3-black-70={!isDark}
                >
                    {$confirmState.message}
                </p>
            </div>

            <div class="flex gap-3 justify-end">
                <button class="btn-vesper-secondary btn-vesper-small" on:click={handleCancel}>
                    {$confirmState.cancelText}
                </button>
                <button
                    class="btn-vesper-small font-semibold uppercase tracking-wide transition-all duration-200 px-4 py-2 rounded border disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 active:opacity-80"
                    class:bg-o3-claret={$confirmState.isDangerous}
                    class:border-o3-claret={$confirmState.isDangerous}
                    class:text-white={$confirmState.isDangerous}
                    class:bg-o3-teal={!$confirmState.isDangerous}
                    class:border-o3-teal={!$confirmState.isDangerous}
                    class:text-o3-black-90={!$confirmState.isDangerous}
                    on:click={handleConfirm}
                    autofocus
                >
                    {$confirmState.confirmText}
                </button>
            </div>
        </div>
    </div>
{/if}
