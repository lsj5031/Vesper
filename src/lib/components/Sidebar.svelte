<script lang="ts">
    import { onDestroy } from 'svelte';
    import { liveQuery } from 'dexie';
    import { db, type Feed } from '../db';
    import { selectedFeedId, selectedArticleId, searchQuery, refreshProgress, userSettings, showSettings } from '../stores';
    import { addNewFeed, refreshAllFeeds, syncFeed } from '../rss';
    
    // Live Queries
    const folders = liveQuery(() => db.folders.toArray());
    const feeds = liveQuery(() => db.feeds.toArray());
    
    // Derived state (naive grouping for simple template)
    $: feedsList = $feeds || [];
    $: foldersList = $folders || [];
    
    let newFeedUrl = '';
    let isImporting = false;
    let isManaging = false;
    let refreshingFeeds = new Set<number>();
    
    async function handleAddFeed() {
        if (!newFeedUrl) return;
        try {
            await addNewFeed(newFeedUrl);
            newFeedUrl = '';
        } catch (e) {
            alert('Failed to add feed');
        }
    }
    
    function selectFeed(id: number | undefined) {
        if (id !== undefined) $selectedFeedId = id;
    }

    async function handleRefreshFeed(feed: Feed, e: Event) {
        e.stopPropagation();
        if (!feed.id) return;
        
        refreshingFeeds.add(feed.id);
        refreshingFeeds = refreshingFeeds; // Trigger reactivity
        
        try {
            await syncFeed(feed, 50, true); // forceRefresh = true
        } catch (err) {
            console.error('Feed refresh failed', err);
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
        if (!feed.id) return;
        if (!confirm(`Are you sure you want to delete "${feed.title}"?`)) return;
        
        await db.feeds.delete(feed.id);
        // Also clean up articles? Dexie doesn't cascade delete by default usually, 
        // but for now we just delete the feed. 
        // Ideally we should delete articles too:
        await db.articles.where('feedId').equals(feed.id).delete();
        
        if ($selectedFeedId === feed.id) {
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

<div class="h-full flex flex-col bg-o3-black-90 border-r border-o3-black-30">
    <!-- Header -->
    <div class="p-4 border-b border-o3-black-30">
        <h1 class="text-2xl font-headline font-bold text-o3-white tracking-tight mb-1">Vesper</h1>
        <p class="text-xs text-o3-black-50 uppercase tracking-widest">Where the day settles</p>
    </div>

    <!-- Controls -->
    <div class="p-4 space-y-2 border-b border-o3-black-30">
        <!-- Search -->
        <div class="relative">
            <input 
                type="text" 
                bind:value={$searchQuery} 
                placeholder="Search articles..." 
                class="input bg-o3-black-80 border-none text-sm h-8 rounded-none placeholder-o3-black-50 focus:ring-1 focus:ring-o3-teal w-full pl-8"
            />
            <span class="absolute left-2 top-1.5 text-o3-black-50 text-xs">🔍</span>
            {#if $searchQuery}
                <button 
                    class="absolute right-2 top-1.5 text-o3-black-50 hover:text-o3-white text-xs"
                    on:click={() => $searchQuery = ''}
                >
                    ×
                </button>
            {/if}
        </div>

        <div class="divider-h border-o3-black-80 my-2"></div>

        <div class="flex gap-2">
            <input 
                type="text" 
                bind:value={newFeedUrl} 
                placeholder="Feed URL..." 
                class="input bg-o3-black-80 border-none text-sm h-8 rounded-none placeholder-o3-black-50 focus:ring-1 focus:ring-o3-teal w-full"
                on:keydown={(e) => e.key === 'Enter' && handleAddFeed()}
            />
            <button 
                class="o3-button o3-button--primary o3-button--small o3-button-icon o3-button-icon--plus o3-button-icon--icon-only"
                data-o3-theme="inverse"
                on:click={handleAddFeed}
                title="Add Feed"
            >
                <span class="o3-button-icon__label">Add</span>
            </button>
        </div>
        
        <div class="flex gap-1 mt-2">
            {#if $refreshProgress}
                <div class="flex-1 flex flex-col gap-1">
                    <button 
                        class="w-full text-[10px] bg-o3-black-80 py-1 text-o3-paper cursor-default relative overflow-hidden"
                        disabled
                    >
                        <div class="absolute inset-0 bg-o3-teal opacity-30" style="width: {($refreshProgress.completed / $refreshProgress.total) * 100}%"></div>
                        <span class="relative z-10">Updating {$refreshProgress.completed}/{$refreshProgress.total}</span>
                    </button>
                </div>
            {:else}
                <button 
                    class="flex-1 o3-button o3-button--secondary o3-button--small o3-button-icon o3-button-icon--refresh"
                    data-o3-theme="inverse" 
                    on:click={handleRefreshAll}
                >
                    Refresh All
                </button>
            {/if}
            <button 
                class="o3-button o3-button--secondary o3-button--small {isManaging ? 'o3-button--primary' : ''}" 
                data-o3-theme="inverse"
                on:click={() => isManaging = !isManaging}
                title="Manage Feeds"
            >
                {isManaging ? 'Done' : 'Manage'}
            </button>
            <button 
                class="o3-button o3-button--secondary o3-button--small o3-button-icon o3-button-icon--settings o3-button-icon--icon-only"
                data-o3-theme="inverse"
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
                class="w-full text-left px-3 py-1.5 text-sm font-medium {$selectedFeedId === 'all' ? 'text-o3-teal bg-o3-black-80' : 'text-o3-black-40 hover:bg-o3-black-80/50'}"
                on:click={() => $selectedFeedId = 'all'}
            >
                All Articles
            </button>
            <button 
                class="w-full text-left px-3 py-1.5 text-sm font-medium {$selectedFeedId === 'starred' ? 'text-o3-teal bg-o3-black-80' : 'text-o3-black-40 hover:bg-o3-black-80/50'}"
                on:click={() => $selectedFeedId = 'starred'}
            >
                Starred
            </button>
        </div>

        <div class="divider-h border-o3-black-80 my-2"></div>

        <!-- Folders -->
        {#each foldersList as folder}
            <div class="space-y-0.5">
                <div class="px-3 py-1 text-xs font-bold text-o3-black-50 uppercase tracking-wider">
                    {folder.name}
                </div>
                {#each feedsList.filter(f => f.folderId === folder.id) as feed}
                    {@const isUpdating = $refreshProgress ? true : false}
                    <div class="group flex items-center w-full {$selectedFeedId === feed.id ? 'bg-o3-black-80 border-l-2 border-o3-teal' : isUpdating ? 'bg-o3-black-80/50' : 'hover:bg-o3-black-80/30'}">
                        <button 
                            class="flex-1 text-left px-3 py-1.5 text-sm truncate {$selectedFeedId === feed.id ? 'text-o3-white' : 'text-o3-black-40 group-hover:text-o3-white'}"
                            on:click={() => selectFeed(feed.id)}
                        >
                            {feed.title}
                            {#if isUpdating}
                                <span class="inline-block ml-1 text-o3-teal animate-pulse">⟳</span>
                            {/if}
                        </button>
                        
                        <div class="flex items-center pr-2 gap-1">
                            {#if feed.error}
                                <span class="text-o3-claret text-xs font-bold cursor-help" title={feed.error}>!</span>
                            {/if}
                            
                            {#if isManaging}
                                <button 
                                    class="o3-button o3-button--ghost o3-button--small o3-button-icon o3-button-icon--cross o3-button-icon--icon-only"
                                    data-o3-theme="inverse"
                                    on:click={(e) => handleDeleteFeed(feed, e)}
                                    title="Delete Feed"
                                >
                                    <span class="o3-button-icon__label">Delete</span>
                                </button>
                            {:else}
                                <button 
                                    class="o3-button o3-button--ghost o3-button--small o3-button-icon o3-button-icon--refresh o3-button-icon--icon-only {feed.id && refreshingFeeds.has(feed.id) ? 'animate-spin' : ''}"
                                    data-o3-theme="inverse"
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
            <div class="px-3 py-1 text-xs font-bold text-o3-black-50 uppercase tracking-wider">
                Feeds
            </div>
            {#each feedsList.filter(f => !f.folderId) as feed}
                {@const isUpdating = $refreshProgress ? true : false}
                <div class="group flex items-center w-full {$selectedFeedId === feed.id ? 'bg-o3-black-80 border-l-2 border-o3-teal' : isUpdating ? 'bg-o3-black-80/50' : 'hover:bg-o3-black-80/30'}">
                    <button 
                        class="flex-1 text-left px-3 py-1.5 text-sm truncate {$selectedFeedId === feed.id ? 'text-o3-white' : 'text-o3-black-40 group-hover:text-o3-white'}"
                        on:click={() => selectFeed(feed.id)}
                    >
                        {feed.title}
                        {#if isUpdating}
                            <span class="inline-block ml-1 text-o3-teal animate-pulse">⟳</span>
                        {/if}
                    </button>

                    <div class="flex items-center pr-2 gap-1">
                        {#if feed.error}
                            <span class="text-o3-claret text-xs font-bold cursor-help" title={feed.error}>!</span>
                        {/if}
                        
                        {#if isManaging}
                            <button 
                                class="o3-button o3-button--ghost o3-button--small o3-button-icon o3-button-icon--cross o3-button-icon--icon-only"
                                data-o3-theme="inverse"
                                on:click={(e) => handleDeleteFeed(feed, e)}
                                title="Delete Feed"
                            >
                                <span class="o3-button-icon__label">Delete</span>
                            </button>
                        {:else}
                            <button 
                                class="o3-button o3-button--ghost o3-button--small o3-button-icon o3-button-icon--refresh o3-button-icon--icon-only {feed.id && refreshingFeeds.has(feed.id) ? 'animate-spin' : ''}"
                                data-o3-theme="inverse"
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
