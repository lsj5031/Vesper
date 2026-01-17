<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import type { Feed } from '../db';
    import { syncFeed } from '../rss';

    export let feed: Feed;
    export let isRefreshing = false;

    const dispatch = createEventDispatcher();

    async function handleRefresh(e: MouseEvent) {
        e.stopPropagation();
        if (!feed.id) return;

        isRefreshing = true;
        dispatch('refreshStart', { feedId: feed.id });

        try {
            await syncFeed(feed, 50, true);
        } catch (err) {
            console.error('Feed refresh failed', err);
            dispatch('refreshError', { feedId: feed.id, error: err });
        } finally {
            isRefreshing = false;
            dispatch('refreshEnd', { feedId: feed.id });
        }
    }
</script>

<button
    class="feed-item"
    on:click={() => dispatch('select', { feedId: feed.id })}
    aria-label="Select feed: {feed.title}"
>
    <div class="feed-info">
        <span class="feed-title">{feed.title}</span>
        {#if feed.error}
            <span class="feed-error" title={feed.error}>⚠</span>
        {/if}
    </div>

    <div class="feed-actions">
        {#if isRefreshing}
            <span class="refresh-spinner">⟳</span>
        {:else}
            <button
                class="refresh-btn"
                on:click={handleRefresh}
                aria-label="Refresh feed"
            >
                ↻
            </button>
        {/if}
    </div>

    <slot name="unread-count" />
</button>

<style>
    .feed-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.5rem 0.75rem;
        width: 100%;
        text-align: left;
        background: transparent;
        border: none;
        cursor: pointer;
        transition: background-color 0.15s ease;
    }

    .feed-item:hover {
        background-color: var(--o3-color-palette-black-80);
    }

    .feed-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex: 1;
        min-width: 0;
    }

    .feed-title {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--o3-color-palette-paper);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .feed-error {
        color: var(--o3-color-palette-claret);
        font-size: 1rem;
        flex-shrink: 0;
    }

    .feed-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-shrink: 0;
    }

    .refresh-btn {
        background: transparent;
        border: none;
        color: var(--o3-color-palette-black-40);
        cursor: pointer;
        padding: 0.25rem;
        font-size: 1rem;
        opacity: 0;
        transition: opacity 0.15s ease;
    }

    .feed-item:hover .refresh-btn {
        opacity: 1;
    }

    .refresh-btn:hover {
        color: var(--o3-color-palette-teal);
    }

    .refresh-spinner {
        color: var(--o3-color-palette-teal);
        font-size: 1rem;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
</style>
