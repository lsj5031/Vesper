<script lang="ts">
    import { onDestroy } from 'svelte';
    import { liveQuery } from 'dexie';
    import { db, type Feed } from '../db';
    import { selectedFeedId, selectedArticleId, searchQuery, refreshProgress, userSettings, showSettings, themeMode } from '../stores';
    import { refreshAllFeeds, syncFeed } from '../rss';
    import { logger } from '../logger';
    
    // Live Queries
    const folders = liveQuery(() => db.folders.toArray());
    const feeds = liveQuery(() => db.feeds.toArray());
    const unreadCounts = liveQuery(async () => {
        const unread = await db.articles.where('read').equals(0).toArray();
        const starred = await db.articles.where('starred').equals(1).toArray();
        const counts: Record<string | number, number> = { all: unread.length, starred: starred.length };
        
        unread.forEach(a => {
            if (a.feedId) {
                counts[a.feedId] = (counts[a.feedId] || 0) + 1;
            }
        });
        return counts;
    });
    
    // Derived state (naive grouping for simple template)
    $: feedsList = $feeds || [];
    $: foldersList = $folders || [];
    
    let isManaging = false;
    let refreshingFeeds = new Set<number>();
    
    function selectFeed(id: number | undefined) {
        if (id !== undefined) $selectedFeedId = id;
    }

    async function handleRefreshFeed(feed: Feed, e: Event) {
        e.stopPropagation();
        if (!feed.id) return;
        
        refreshingFeeds.add(feed.id);
        refreshingFeeds = refreshingFeeds; // Trigger reactivity
        
        try {
            await syncFeed(feed, 50, true);
        } catch (err) {
            logger.error('Feed refresh failed', err, 'Sidebar');
        } finally {
            refreshingFeeds.delete(feed.id);
            refreshingFeeds = refreshingFeeds;
        }
    }

    function getRefreshButtonClass(feedId: number | undefined): string {
        if (!feedId) return 'text-o3-black-50 hover:text-o3-teal px-1';
        return refreshingFeeds.has(feedId) 
            ? 'text-o3-black-50 hover:text-o3-teal px-1 animate-spin'
            : 'text-o3-black-50 hover:text-o3-teal px-1';
    }

    async function handleRefreshAll() {
        if ($refreshProgress) return; // Already refreshing
        
        try {
            await refreshAllFeeds();
        } catch (err) {
            console.error('Refresh all failed', err);
        }
    }

    async function handleDeleteFeed(feed: Feed, e: Event) {
        e.stopPropagation();
        const id = feed.id;
        if (id === undefined) return;
        if (!confirm(`Are you sure you want to delete "${feed.title}"?`)) return;
        
        await db.transaction('rw', db.feeds, db.articles, async () => {
            await db.articles.where('feedId').equals(id).delete();
            await db.feeds.delete(id);
        });
        
        if ($selectedFeedId === id) {
            $selectedFeedId = 'all';
        }
    }

    // Periodic Refresh Timer
    let refreshTimer: any;
    
    $: {
        // Clean up existing timer
        clearInterval(refreshTimer);
        
        // Set up new timer based on current interval setting
        const intervalMs = $userSettings.refreshInterval * 60 * 1000;
        if (intervalMs > 0) {
            refreshTimer = setInterval(() => {
                // Only refresh if not already refreshing
                if (!$refreshProgress) {
                    refreshAllFeeds();
                }
            }, intervalMs);
        }
    }
    
    onDestroy(() => clearInterval(refreshTimer));
</script>

<div 
    class="h-full flex flex-col border-r border-o3-black-30"
    style={`background:${$themeMode === 'dark' ? 'var(--o3-color-palette-black-90)' : 'var(--o3-color-palette-paper)'};color:${$themeMode === 'dark' ? 'var(--o3-color-palette-white)' : 'var(--o3-color-palette-black-90)'}`}
>
    <!-- Header -->
    <div class="p-4 border-b border-o3-black-30">
        <h1 class={`text-2xl font-headline font-bold tracking-tight mb-1 ${$themeMode === 'dark' ? 'text-o3-white' : 'text-o3-black-90'}`}>Vesper</h1>
        <p class={`text-xs uppercase tracking-widest ${$themeMode === 'dark' ? 'text-o3-black-50' : 'text-o3-black-70'}`}>Where the day settles</p>
    </div>

    <!-- Controls -->
    <div class="p-4 space-y-2" style={`border-bottom: 1px solid ${$themeMode === 'dark' ? 'var(--o3-color-palette-black-30)' : 'var(--o3-color-palette-black-10)'}`}>
        <!-- Search -->
        <div class="relative w-full">
            <input 
                type="text" 
                bind:value={$searchQuery} 
                placeholder="Search articles..." 
                class={`input text-sm h-8 rounded-none placeholder-o3-black-50 focus:ring-1 focus:ring-o3-teal w-full pl-8 ${$searchQuery ? 'pr-8' : 'pr-3'} ${$themeMode === 'dark' ? 'bg-o3-black-80 border-none text-o3-paper' : 'bg-o3-white border border-o3-black-20 text-o3-black-90'}`}
            />
            <span 
                class="absolute left-2 top-1.5 w-4 h-4 bg-o3-black-50 opacity-80 pointer-events-none"
                style="
                    -webkit-mask-image: var(--o3-icon-search);
                    mask-image: var(--o3-icon-search);
                    -webkit-mask-repeat: no-repeat;
                    mask-repeat: no-repeat;
                    -webkit-mask-size: contain;
                    mask-size: contain;
                "
                aria-hidden="true"
            ></span>
            {#if $searchQuery}
                <button
                    type="button"
                    class="absolute right-2 top-1 text-lg leading-none text-o3-black-50 hover:text-o3-teal transition-colors"
                    on:click={() => $searchQuery = ''}
                    title="Clear search"
                    aria-label="Clear search"
                >
                    ×
                </button>
            {/if}
        </div>
        
        <div class="divider-h border-o3-black-80 my-2"></div>

        <div class="flex gap-1">
            {#if $refreshProgress}
                <button 
                    class="flex-1 o3-button o3-button--small relative overflow-hidden !bg-o3-black-80 !text-o3-paper !border-none cursor-default"
                    disabled
                >
                    <div class="absolute inset-0 bg-o3-teal opacity-30" style="width: {($refreshProgress.completed / $refreshProgress.total) * 100}%"></div>
                    <span class="relative z-10">Updating {$refreshProgress.completed}/{$refreshProgress.total}</span>
                </button>
            {:else}
                <button 
                    class="flex-1 o3-button o3-button--secondary o3-button--small o3-button-icon o3-button-icon--refresh"
                    data-o3-theme={$themeMode === 'dark' ? 'inverse' : 'standard'}
                    on:click={handleRefreshAll}
                >
                    Refresh All
                </button>
            {/if}
            <button 
                class="o3-button o3-button--secondary o3-button--small {isManaging ? 'o3-button--primary' : ''}" 
                data-o3-theme={$themeMode === 'dark' ? 'inverse' : 'standard'}
                on:click={() => isManaging = !isManaging}
                title="Manage Feeds"
            >
                {isManaging ? 'Done' : 'Manage'}
            </button>
            <button 
                class="o3-button o3-button--secondary o3-button--small o3-button-icon o3-button-icon--settings o3-button-icon--icon-only"
                data-o3-theme={$themeMode === 'dark' ? 'inverse' : 'standard'}
                on:click={() => $showSettings = true}
                title="Settings"
            >
                <span class="o3-button-icon__label">Settings</span>
            </button>
        </div>
    </div>

    <!-- Feeds List -->
    <div class="flex-1 overflow-y-auto p-2 space-y-4">
        <!-- Special Filters -->
        <div class="space-y-0.5">
            <button 
                class={`w-full text-left px-3 py-1.5 text-sm font-medium flex justify-between items-center ${$selectedFeedId === 'all' ? 'text-o3-teal ' + ($themeMode === 'dark' ? 'bg-o3-black-80' : 'bg-o3-black-10') : $themeMode === 'dark' ? 'text-o3-black-30 hover:bg-o3-black-80/50' : 'text-o3-black-80 hover:bg-o3-black-10'}`}
                on:click={() => $selectedFeedId = 'all'}
            >
                <span>All Articles</span>
                {#if $unreadCounts?.all}
                    <span class="text-xs opacity-80">{$unreadCounts.all}</span>
                {/if}
            </button>
            <button 
                class={`w-full text-left px-3 py-1.5 text-sm font-medium flex justify-between items-center ${$selectedFeedId === 'starred' ? 'text-o3-teal ' + ($themeMode === 'dark' ? 'bg-o3-black-80' : 'bg-o3-black-10') : $themeMode === 'dark' ? 'text-o3-black-30 hover:bg-o3-black-80/50' : 'text-o3-black-80 hover:bg-o3-black-10'}`}
                on:click={() => $selectedFeedId = 'starred'}
            >
                <span>Starred</span>
                {#if $unreadCounts?.starred}
                    <span class="text-xs opacity-80">{$unreadCounts.starred}</span>
                {/if}
            </button>
        </div>

        <div class="divider-h border-o3-black-80 my-2"></div>

        <!-- Folders -->
        {#each foldersList as folder}
            <div class="space-y-0.5">
                <div class={`px-3 py-1 text-xs font-bold uppercase tracking-wider ${$themeMode === 'dark' ? 'text-o3-black-50' : 'text-o3-black-70'}`}>
                    {folder.name}
                </div>
                {#each feedsList.filter(f => f.folderId === folder.id) as feed}
                    {@const isUpdating = $refreshProgress ? true : false}
                    {@const activeBg = $themeMode === 'dark' ? 'bg-o3-black-80' : 'bg-o3-black-10'}
                    {@const hoverBg = $themeMode === 'dark' ? 'hover:bg-o3-black-80/30' : 'hover:bg-o3-black-10'}
                    {@const loadingBg = $themeMode === 'dark' ? 'bg-o3-black-80/50' : 'bg-o3-black-5'}
                    <div class={`group flex items-center w-full ${$selectedFeedId === feed.id ? (activeBg + ' border-l-2 ' + (feed.error ? 'border-o3-claret' : 'border-o3-teal')) : feed.error ? (activeBg + ' border-l-2 border-o3-claret') : isUpdating ? loadingBg : hoverBg}`}>
                        <button 
                            class={`flex-1 text-left px-3 py-1.5 text-sm flex justify-between items-center gap-2 min-w-0 ${$selectedFeedId === feed.id ? ($themeMode === 'dark' ? 'text-o3-white' : 'text-o3-black-90') : feed.error ? 'text-o3-claret' : $themeMode === 'dark' ? 'text-o3-black-30 group-hover:text-o3-white' : 'text-o3-black-80 group-hover:text-o3-black-90'}`}
                            on:click={() => selectFeed(feed.id)}
                        >
                            <span class="truncate">{feed.title}</span>
                            <span class="flex items-center gap-1 shrink-0">
                                {#if feed.id != null && $unreadCounts?.[feed.id]}
                                    <span class="text-xs opacity-70">{$unreadCounts[feed.id]}</span>
                                {/if}
                                {#if isUpdating}
                                    <span class="text-o3-teal animate-pulse">⟳</span>
                                {/if}
                            </span>
                        </button>
                        
                        <div class="flex items-center pr-2 gap-1">
                            {#if feed.error}
                                <span class="text-o3-claret text-xs font-bold cursor-help" title={feed.error}>!</span>
                            {/if}
                            
                            {#if isManaging}
                                <button 
                                    class="o3-button o3-button--ghost o3-button--small o3-button-icon o3-button-icon--cross o3-button-icon--icon-only"
                                    data-o3-theme={$themeMode === 'dark' ? 'inverse' : 'standard'}
                                    on:click={(e) => handleDeleteFeed(feed, e)}
                                    title="Delete Feed"
                                >
                                    <span class="o3-button-icon__label">Delete</span>
                                </button>
                            {:else}
                                <button 
                                    class="o3-button o3-button--ghost o3-button--small o3-button-icon o3-button-icon--refresh o3-button-icon--icon-only {feed.id && refreshingFeeds.has(feed.id) ? 'animate-spin' : ''}"
                                    data-o3-theme={$themeMode === 'dark' ? 'inverse' : 'standard'}
                                    on:click={(e) => handleRefreshFeed(feed, e)}
                                    disabled={feed.id ? refreshingFeeds.has(feed.id) : false}
                                    title="Refresh Feed"
                                >
                                    <span class="o3-button-icon__label">Refresh</span>
                                </button>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>
        {/each}

        <!-- Uncategorized -->
        <div class="space-y-0.5">
            <div class="px-3 py-1 text-xs font-bold uppercase tracking-wider" class:text-o3-black-50={$themeMode === 'dark'} class:text-o3-black-70={$themeMode !== 'dark'}>
                Feeds
            </div>
            {#each feedsList.filter(f => !f.folderId) as feed}
                {@const isUpdating = $refreshProgress ? true : false}
                {@const activeBg = $themeMode === 'dark' ? 'bg-o3-black-80' : 'bg-o3-black-10'}
                {@const hoverBg = $themeMode === 'dark' ? 'hover:bg-o3-black-80/30' : 'hover:bg-o3-black-10'}
                {@const loadingBg = $themeMode === 'dark' ? 'bg-o3-black-80/50' : 'bg-o3-black-5'}
                <div class="group flex items-center w-full {$selectedFeedId === feed.id ? (activeBg + ' border-l-2 ' + (feed.error ? 'border-o3-claret' : 'border-o3-teal')) : feed.error ? (activeBg + ' border-l-2 border-o3-claret') : isUpdating ? loadingBg : hoverBg}">
                    <button 
                        class="flex-1 text-left px-3 py-1.5 text-sm flex justify-between items-center gap-2 min-w-0 {$selectedFeedId === feed.id ? ($themeMode === 'dark' ? 'text-o3-white' : 'text-o3-black-90') : feed.error ? 'text-o3-claret' : $themeMode === 'dark' ? 'text-o3-black-30 group-hover:text-o3-white' : 'text-o3-black-80 group-hover:text-o3-black-90'}"
                        on:click={() => selectFeed(feed.id)}
                    >
                        <span class="truncate">{feed.title}</span>
                        <span class="flex items-center gap-1 shrink-0">
                            {#if feed.id != null && $unreadCounts?.[feed.id]}
                                <span class="text-xs opacity-70">{$unreadCounts[feed.id]}</span>
                            {/if}
                            {#if isUpdating}
                                <span class="text-o3-teal animate-pulse">⟳</span>
                            {/if}
                        </span>
                    </button>

                    <div class="flex items-center pr-2 gap-1">
                        {#if feed.error}
                            <span class="text-o3-claret text-xs font-bold cursor-help" title={feed.error}>!</span>
                        {/if}
                        
                        {#if isManaging}
                            <button 
                                class="o3-button o3-button--ghost o3-button--small o3-button-icon o3-button-icon--cross o3-button-icon--icon-only"
                                data-o3-theme={$themeMode === 'dark' ? 'inverse' : 'standard'}
                                on:click={(e) => handleDeleteFeed(feed, e)}
                                title="Delete Feed"
                            >
                                <span class="o3-button-icon__label">Delete</span>
                            </button>
                        {:else}
                            <button 
                                class="o3-button o3-button--ghost o3-button--small o3-button-icon o3-button-icon--refresh o3-button-icon--icon-only {feed.id && refreshingFeeds.has(feed.id) ? 'animate-spin' : ''}"
                                data-o3-theme={$themeMode === 'dark' ? 'inverse' : 'standard'}
                                on:click={(e) => handleRefreshFeed(feed, e)}
                                disabled={feed.id ? refreshingFeeds.has(feed.id) : false}
                                title="Refresh Feed"
                            >
                                <span class="o3-button-icon__label">Refresh</span>
                            </button>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>
    </div>
</div>
