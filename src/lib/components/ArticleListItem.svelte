<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import type { Article } from '../db';

    export let article: Article;
    export let isSelected = false;
    export let selectionMode = false;

    const dispatch = createEventDispatcher();

    function formatDate(iso: string): string {
        try {
            const date = new Date(iso);
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 60) return `${diffMins}m ago`;
            if (diffHours < 24) return `${diffHours}h ago`;
            if (diffDays < 7) return `${diffDays}d ago`;
            return date.toLocaleDateString();
        } catch {
            return 'recently';
        }
    }

    function handleClick() {
        dispatch(
            selectionMode ? 'toggleSelection' : 'select',
            { articleId: article.id }
        );
    }
</script>

<div
    class="article-item"
    class:selected={isSelected}
    on:click={handleClick}
    role="button"
    tabindex="0"
    aria-pressed={isSelected}
>
    {#if article.read === 0}
        <span class="badge-unread">New</span>
    {/if}

    <slot name="feed-title" />

    <h3 class="article-title">{article.title}</h3>

    <p class="article-snippet">{article.snippet}</p>

    <time class="article-date">{formatDate(article.isoDate)}</time>

    <slot name="external-link" />
</div>

<style>
    .article-item {
        position: relative;
        width: 100%;
        display: flex;
        flex-direction: column;
        padding: 1rem;
        border-bottom: 1px solid var(--o3-color-palette-black-30);
        transition: background-color 0.15s ease;
    }

    .article-item:hover {
        background-color: var(--o3-color-palette-black-80);
    }

    .article-item.selected {
        background: rgba(17, 153, 142, 0.18);
        border-color: rgba(17, 153, 142, 0.75);
        box-shadow: inset 0 0 0 1px rgba(17, 153, 142, 0.5);
    }

    .badge-unread {
        position: absolute;
        top: 1rem;
        right: 1rem;
        background-color: var(--o3-color-palette-teal);
        color: var(--o3-color-palette-black-90);
        padding: 0.25rem 0.5rem;
        font-size: 0.75rem;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .article-title {
        font-family: var(--font-headline);
        font-weight: 700;
        font-size: 1.125rem;
        line-height: 1.25;
        margin-bottom: 0.5rem;
        color: var(--o3-color-palette-paper);
    }

    .article-snippet {
        font-family: var(--font-body);
        font-size: 0.875rem;
        line-height: 1.6;
        margin-bottom: 0.5rem;
        color: var(--o3-color-palette-black-20);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    .article-date {
        font-size: 0.625rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        font-weight: bold;
        color: var(--o3-color-palette-black-40);
    }
</style>
