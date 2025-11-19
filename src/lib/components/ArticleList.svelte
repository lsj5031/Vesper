<script lang="ts">
    import { liveQuery } from 'dexie';
    import { db, type Article, markArticlesAsRead, markArticlesAsUnread, markFeedAsRead } from '../db';
    import { selectedFeedId, selectedArticleId } from '../stores';
    import { formatDistanceToNow } from 'date-fns';
    
    let filterStatus: 'all' | 'unread' = 'all';
    let selectedIds = new Set<number>();
    let selectionMode = false;

    // We need a reactive query that depends on $selectedFeedId and filterStatus
    let articlesStore: any;
    
    $: {
        const fid = $selectedFeedId;
        const status = filterStatus;
        
        articlesStore = liveQuery(async () => {
            let collection;

            if (fid === 'all') {
                collection = db.articles.orderBy('isoDate').reverse();
            } else if (fid === 'starred') {
                collection = db.articles.where('starred').equals(1).reverse().sortBy('isoDate');
                // sortBy returns array, so we handle it differently if we need to filter further
                // But Dexie collections are chainable until toArray/sortBy
                // 'starred' index is simple. 
                // If we want to filter by read status on top of starred, we might need to filter in memory or use compound index.
                // For simplicity, let's filter in memory for 'starred' + 'unread' if needed, or just use simple logic.
            } else if (typeof fid === 'number') {
                collection = db.articles.where('feedId').equals(fid).reverse().sortBy('isoDate');
            }

            // Execute query
            let results: Article[] = [];
            
            if (fid === 'all') {
                 results = await (collection as any).limit(200).toArray();
            } else if (fid === 'starred') {
                 // collection is a Promise<Article[]> here because of sortBy above?
                 // Wait, db.articles.where('starred').equals(1) returns Collection.
                 // .reverse() returns Collection.
                 // .sortBy('isoDate') returns Promise<Article[]>.
                 // So we can't chain .filter() on it as a DB query easily without compound index.
                 // Let's re-do the logic to be cleaner.
                 results = await db.articles.where('starred').equals(1).reverse().sortBy('isoDate');
            } else if (typeof fid === 'number') {
                 results = await db.articles.where('feedId').equals(fid).reverse().sortBy('isoDate');
            }

            // Apply memory filter for read/unread if needed
            if (status === 'unread') {
                results = results.filter(a => a.read === 0);
            }

            return results;
        });
    }
    
    // Helper for date
    const formatDate = (iso: string) => {
        try {
            return formatDistanceToNow(new Date(iso), { addSuffix: true });
        } catch {
            return 'recently';
        }
    }

    function selectArticle(id: number | undefined) {
        if (id !== undefined) {
            $selectedArticleId = id;
        }
    }

    function toggleSelection(id: number | undefined) {
        if (id === undefined) return;
        if (selectedIds.has(id)) {
            selectedIds.delete(id);
        } else {
            selectedIds.add(id);
        }
        selectedIds = selectedIds; // Trigger reactivity
    }

    function toggleSelectAll() {
        const articles: Article[] = $articlesStore || [];
        if (selectedIds.size === articles.length) {
            selectedIds.clear();
        } else {
            selectedIds = new Set(articles.map(a => a.id).filter((id): id is number => id !== undefined));
        }
    }

    async function markSelectedRead() {
        if (selectedIds.size === 0) return;
        await markArticlesAsRead(Array.from(selectedIds));
        selectedIds.clear();
    }

    async function markSelectedUnread() {
        if (selectedIds.size === 0) return;
        await markArticlesAsUnread(Array.from(selectedIds));
        selectedIds.clear();
    }

    async function markAllRead() {
        if (!confirm('Mark all visible articles as read?')) return;
        
        const articles: Article[] = $articlesStore || [];
        const ids = articles.map(a => a.id).filter((id): id is number => id !== undefined);
        
        if (ids.length === 0) return;

        await markArticlesAsRead(ids);
    }

    async function markAllUnread() {
        if (!confirm('Mark all visible articles as unread?')) return;
        
        const articles: Article[] = $articlesStore || [];
        const ids = articles.map(a => a.id).filter((id): id is number => id !== undefined);
        
        if (ids.length === 0) return;

        await markArticlesAsUnread(ids);
    }

    async function markFeedRead() {
        if (typeof $selectedFeedId !== 'number') return;
        if (!confirm(`Mark all articles in this feed as read?`)) return;
        await markFeedAsRead($selectedFeedId);
    }

    function isArticleSelected(id: number | undefined): boolean {
        return id !== undefined && selectedIds.has(id);
    }
</script>

<div class="h-full flex flex-col bg-o3-black-90">
    <!-- Toolbar -->
    <div class="h-14 border-b border-o3-black-30 flex items-center px-4 justify-between sticky top-0 bg-o3-black-90 z-10 gap-4">
        <div class="flex items-center gap-2 min-w-0 flex-1">
            <span class="text-xs font-bold uppercase tracking-wider text-o3-black-50 truncate">
                {#if $selectedFeedId === 'all'}All Articles
                {:else if $selectedFeedId === 'starred'}Starred
                {:else}Feed Articles{/if}
                {#if selectedIds.size > 0}
                    <span class="ml-2 text-o3-teal">({selectedIds.size} selected)</span>
                {/if}
            </span>
        </div>

        <div class="flex items-center gap-2">
            {#if selectionMode && selectedIds.size > 0}
                <button 
                    class="btn btn-sm variant-filled-primary rounded-none text-[10px] font-bold uppercase tracking-wider bg-o3-teal text-o3-black-90 hover:bg-o3-white"
                    on:click={markSelectedRead}
                    title="Mark selected as read"
                >
                    ✓ Read
                </button>
                <button 
                    class="btn btn-sm variant-filled-primary rounded-none text-[10px] font-bold uppercase tracking-wider bg-o3-teal text-o3-black-90 hover:bg-o3-white"
                    on:click={markSelectedUnread}
                    title="Mark selected as unread"
                >
                    ✗ Unread
                </button>
                <button 
                    class="btn btn-sm variant-filled-surface rounded-none text-[10px] font-bold uppercase tracking-wider text-o3-teal border border-o3-teal hover:bg-o3-black-80"
                    on:click={() => selectedIds.clear()}
                    title="Clear selection"
                >
                    Clear
                </button>
            {/if}
            <select 
                bind:value={filterStatus}
                class="bg-o3-black-80 text-o3-paper text-xs border-none py-1 pl-2 pr-6 rounded-none focus:ring-1 focus:ring-o3-teal cursor-pointer"
                aria-label="Filter articles"
            >
                <option value="all">All</option>
                <option value="unread">Unread</option>
            </select>
            
            <button 
                class="btn btn-sm rounded-none text-[10px] font-bold uppercase tracking-wider {selectionMode ? 'bg-o3-teal text-o3-black-90 hover:bg-o3-white' : 'variant-filled-surface text-o3-teal border border-o3-teal hover:bg-o3-black-80'}"
                on:click={() => {
                    selectionMode = !selectionMode;
                    if (!selectionMode) selectedIds.clear();
                }}
                title={selectionMode ? 'Exit selection mode' : 'Enter selection mode'}
            >
                {selectionMode ? '✓ Select' : '◻ Select'}
            </button>
            
            {#if !selectionMode}
                <button 
                    class="btn btn-sm variant-filled-surface rounded-none text-[10px] font-bold uppercase tracking-wider hover:bg-o3-black-80"
                    on:click={markAllRead}
                    title="Mark all visible as read"
                >
                    ✓ All
                </button>
                <button 
                    class="btn btn-sm variant-filled-surface rounded-none text-[10px] font-bold uppercase tracking-wider hover:bg-o3-black-80"
                    on:click={markAllUnread}
                    title="Mark all visible as unread"
                >
                    ✗ All
                </button>
                {#if typeof $selectedFeedId === 'number'}
                    <button 
                        class="btn btn-sm variant-filled-surface rounded-none text-[10px] font-bold uppercase tracking-wider hover:bg-o3-black-80"
                        on:click={markFeedRead}
                        title="Mark entire feed as read"
                    >
                        ✓ Feed
                    </button>
                {/if}
            {/if}
        </div>
    </div>

    <!-- List - flex-1 with min-h-0 enables overflow scrolling -->
    <div class="flex-1 overflow-y-auto min-h-0">
        {#if $articlesStore}
            {#if selectionMode && selectedIds.size > 0}
                <div class="sticky top-0 bg-o3-black-80 border-b border-o3-black-30 px-4 py-2">
                    <button 
                        class="text-xs text-o3-teal hover:text-o3-white"
                        on:click={toggleSelectAll}
                    >
                        {selectedIds.size === $articlesStore.length ? 'Deselect All' : 'Select All'}
                    </button>
                </div>
            {/if}
            {#each $articlesStore as article (article.id)}
                <div 
                    class="w-full flex items-stretch border-b border-o3-black-30 hover:bg-o3-black-80 group transition-colors {$selectedArticleId === article.id ? 'bg-o3-black-80' : ''} {isArticleSelected(article.id) ? 'bg-o3-teal bg-opacity-20' : ''}"
                >
                    {#if selectionMode}
                        <button 
                            class="flex-shrink-0 w-12 flex items-center justify-center border-r border-o3-black-30 hover:bg-o3-black-70"
                            on:click={() => toggleSelection(article.id)}
                            aria-label="Toggle selection for: {article.title}"
                        >
                            <input 
                                type="checkbox" 
                                checked={isArticleSelected(article.id)}
                                on:change={() => toggleSelection(article.id)}
                                class="cursor-pointer"
                            />
                        </button>
                    {/if}
                    <button 
                        class="flex-1 text-left p-4 relative"
                        on:click={() => selectArticle(article.id)}
                        aria-label="Read article: {article.title}"
                    >
                        {#if article.read === 0}
                            <span class="absolute top-4 right-4 badge-unread">New</span>
                        {/if}
                        
                        <div class="text-xs text-o3-teal mb-1 font-bold uppercase tracking-wide">
                            {article.author || 'Unknown'}
                        </div>
                        
                        <h3 class="font-headline font-bold text-lg leading-snug mb-2 text-o3-black-5 group-hover:text-o3-white">
                            {article.title}
                        </h3>
                        
                        <div class="text-sm text-o3-black-40 line-clamp-2 mb-2 font-body leading-relaxed">
                            {article.snippet}
                        </div>
                        
                        <div class="text-[10px] text-o3-black-50 uppercase tracking-wider font-bold">
                            {formatDate(article.isoDate)}
                        </div>
                    </button>
                </div>
            {/each}
            
            {#if $articlesStore.length === 0}
                 <div class="p-8 text-center text-o3-black-40 italic">
                    No articles found.
                 </div>
            {/if}
        {:else}
            <div class="p-8 text-center text-o3-black-40">Loading...</div>
        {/if}
    </div>
</div>
