<script lang="ts">
    import { createEventDispatcher } from 'svelte';

    export let totalCount = 0;
    export let selectedCount = 0;
    export let allSelected = false;

    const dispatch = createEventDispatcher<{
        toggleAll: void;
        markRead: void;
        markUnread: void;
        clear: void;
    }>();

    function handleToggleAll() {
        dispatch('toggleAll');
    }

    function handleMarkRead() {
        dispatch('markRead');
    }

    function handleMarkUnread() {
        dispatch('markUnread');
    }

    function handleClear() {
        dispatch('clear');
    }
</script>

<div class="selection-toolbar">
    <div class="selection-info">
        <span class="selection-count">{selectedCount}</span>
        <span class="selection-label">selected of {totalCount}</span>
    </div>

    <div class="selection-actions">
        <button
            class="btn btn-secondary"
            on:click={handleToggleAll}
            disabled={totalCount === 0}
            aria-disabled={totalCount === 0}
        >
            {allSelected ? 'Deselect All' : 'Select All'}
        </button>

        <div class="action-group">
            <button
                class="btn btn-primary"
                on:click={handleMarkRead}
                disabled={selectedCount === 0}
                aria-disabled={selectedCount === 0}
            >
                Read
            </button>

            <button
                class="btn btn-outline"
                on:click={handleMarkUnread}
                disabled={selectedCount === 0}
                aria-disabled={selectedCount === 0}
            >
                Unread
            </button>

            <button
                class="btn btn-ghost"
                on:click={handleClear}
                disabled={selectedCount === 0}
                aria-disabled={selectedCount === 0}
            >
                Clear
            </button>
        </div>
    </div>
</div>

<style>
    .selection-toolbar {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 0.75rem 1rem;
        background: var(--vesper-panel, var(--o3-color-palette-paper));
        border-bottom: 1px solid var(--vesper-border, var(--o3-color-palette-black-20));
    }

    .selection-info {
        display: flex;
        align-items: baseline;
        gap: 0.75rem;
    }

    .selection-count {
        font-family: var(--font-headline);
        font-size: 1.5rem;
        font-weight: bold;
        line-height: 1;
        color: var(--vesper-text, var(--o3-color-palette-black-90));
    }

    .selection-label {
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        font-weight: bold;
        color: var(--vesper-text-muted, var(--o3-color-palette-black-50));
    }

    .selection-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
    }

    .action-group {
        display: flex;
        gap: 0.25rem;
    }

    .btn {
        padding: 0.375rem 1rem;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border-radius: 0.25rem;
        cursor: pointer;
        transition: all 0.15s ease;
        border: 1px solid transparent;
    }

    .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .btn-primary {
        background-color: var(--o3-color-palette-teal);
        color: var(--o3-color-palette-black-90);
        border-color: var(--o3-color-palette-teal);
    }

    .btn-primary:hover:not(:disabled) {
        background-color: var(--o3-color-palette-white);
    }

    .btn-outline {
        background-color: transparent;
        color: var(--o3-color-palette-teal);
        border-color: var(--o3-color-palette-teal);
    }

    .btn-outline:hover:not(:disabled) {
        background-color: rgba(17, 153, 142, 0.1);
    }

    .btn-secondary {
        background-color: rgba(17, 153, 142, 0.05);
        color: var(--o3-color-palette-teal);
        border-color: var(--o3-color-palette-teal);
    }

    .btn-ghost {
        background-color: transparent;
        color: var(--o3-color-palette-black-40);
        border-color: transparent;
    }

    .btn-ghost:hover:not(:disabled) {
        color: var(--o3-color-palette-black-60);
    }

    @media (min-width: 640px) {
        .selection-toolbar {
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
        }
    }
</style>
