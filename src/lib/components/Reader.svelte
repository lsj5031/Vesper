<script lang="ts">
    import { liveQuery } from 'dexie';
    import { db } from '../db';
    import { selectedArticleId, themeMode } from '../stores';
    import { format } from 'date-fns';

    // READ-ONLY query - just fetch the article
    $: articleStore = liveQuery(async () => {
        if (!$selectedArticleId) return null;
        return await db.articles.get($selectedArticleId);
    });
    
    // SEPARATE side effect for marking as read
    // This runs outside liveQuery context, so it's safe to write
    $: {
        if ($selectedArticleId && $articleStore && $articleStore.read === 0) {
            db.articles.update($selectedArticleId, { read: 1 })
                .catch(err => console.error('Failed to mark as read:', err));
        }
    }
    
    async function toggleStar(article: any) {
        await db.articles.update(article.id!, { starred: article.starred ? 0 : 1 });
    }

    let scrollContainer: HTMLElement;

    $: if ($selectedArticleId && scrollContainer) {
        scrollContainer.scrollTop = 0;
    }

    function handleKeydown(event: KeyboardEvent) {
        // Don't trigger when typing in input fields
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
            return;
        }

        // Open original link (o key)
        if ((event.key === 'o' || event.key === 'O') && $articleStore?.link) {
            window.open($articleStore.link, '_blank');
            event.preventDefault();
            return;
        }

        // Toggle star (s key)
        if ((event.key === 's' || event.key === 'S') && $articleStore) {
            toggleStar($articleStore);
            event.preventDefault();
            return;
        }

        // Scroll down page (space key)
        if (event.code === 'Space' && $articleStore) {
            event.preventDefault();
            const pageHeight = scrollContainer.clientHeight;
            scrollContainer.scrollBy({ top: pageHeight, behavior: 'smooth' });
            return;
        }
    }

    function scrollToTop() {
        scrollContainer?.scrollTo({ top: 0, behavior: 'smooth' });
    }
</script>

<svelte:window on:keydown={handleKeydown} />

<div 
    bind:this={scrollContainer}
    class="h-full overflow-y-auto min-h-0 relative outline-none"
    style={`background: var(--vesper-surface);color:${$themeMode === 'dark' ? 'var(--o3-color-palette-black-20)' : 'var(--o3-color-palette-black-90)'};`}
    role="main"
    aria-label="Article Content"
>
    {#if $articleStore}
        <article class="w-full px-8 py-12 border" class:bg-o3-black-80={$themeMode === 'dark'} class:bg-o3-paper={$themeMode !== 'dark'} class:border-o3-black-30={$themeMode === 'dark'} class:border-o3-black-10={$themeMode !== 'dark'}>
            <!-- Header -->
            <header class="mb-10 pb-8 border-b" class:border-o3-black-30={$themeMode === 'dark'} class:border-o3-black-20={$themeMode !== 'dark'}>
                <div class="flex justify-between items-start mb-6">
                     <span class="bg-o3-paper text-o3-teal px-2 py-1 text-xs font-bold uppercase tracking-widest">
                        News
                    </span>
                    <button on:click={() => toggleStar($articleStore)}>
                        {#if $articleStore.starred}
                            <span class="text-o3-claret text-2xl">★</span>
                        {:else}
                            <span class="text-2xl transition-colors" class:text-o3-white-60={$themeMode === 'dark'} class:text-o3-black-50={$themeMode !== 'dark'} class:hover:text-o3-white={$themeMode === 'dark'} class:hover:text-o3-black-90={$themeMode !== 'dark'}>☆</span>
                        {/if}
                    </button>
                </div>

                <h1 class="text-4xl md:text-5xl font-headline font-bold leading-tight mb-6" class:text-o3-white={$themeMode === 'dark'} class:text-o3-black-90={$themeMode !== 'dark'}>
                    {$articleStore.title}
                </h1>

                <div class="flex items-center justify-between text-sm font-bold uppercase tracking-widest" class:text-o3-black-40={$themeMode === 'dark'} class:text-o3-black-70={$themeMode !== 'dark'}>
                    <span>By <span class="text-o3-teal border-b border-o3-teal">{$articleStore.author || 'Unknown'}</span></span>
                    <time>{format(new Date($articleStore.isoDate), 'MMMM d, yyyy')}</time>
                </div>

                <div class="mt-4">
                     {#if $articleStore.link}
                        <a href={$articleStore.link} target="_blank" rel="noreferrer" class="text-xs text-o3-teal hover:text-o3-white transition-colors">
                            Read Original ↗
                        </a>
                    {:else}
                        <span class="text-xs text-o3-black-50">Original link unavailable</span>
                    {/if}
                </div>
            </header>

            <!-- Content -->
            <div class="prose-vesper">
                {@html $articleStore.content}
            </div>

            <footer class="mt-20 pt-10 text-center border-t" class:border-o3-black-30={$themeMode === 'dark'} class:border-o3-black-20={$themeMode !== 'dark'} class:text-o3-black-40={$themeMode === 'dark'} class:text-o3-black-70={$themeMode !== 'dark'}>
                 <p class="italic font-headline">End of Article</p>
            </footer>
        </article>

        <!-- Scroll to Top Button -->
        <button
            class="fixed bottom-8 right-8 bg-o3-teal text-o3-black-90 w-10 h-10 rounded-full shadow-lg flex items-center justify-center hover:bg-o3-white transition-colors z-50"
            on:click={scrollToTop}
            title="Scroll to Top"
        >
            ↑
        </button>
    {:else}
        <div class="h-full flex items-center justify-center flex-col text-o3-black-50">
            <div class="text-6xl mb-4 opacity-20">V</div>
            <p class="font-headline italic text-xl opacity-50">Select an article to begin.</p>
        </div>
    {/if}
</div>
