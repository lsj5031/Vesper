<script lang="ts">
    import { liveQuery } from 'dexie';
    import { onDestroy } from 'svelte';
    import { db, type Article, type Feed, markArticlesAsRead, markArticlesAsUnread, markFeedAsRead } from '../db';
    import { selectedFeedId, selectedArticleId, searchQuery, refreshProgress, themeMode } from '../stores';
    import { refreshAllFeeds, syncFeed } from '../rss';
    import { formatDistanceToNow } from 'date-fns';
    import { tokenize } from '../search';
    import { logger } from '../logger';
    
    let filterStatus: 'all' | 'unread' = 'all';
    let selectedIds = new Set<number>();
    let selectedVisibleCount = 0;
    let visibleIds = new Set<number>();
    let selectionMode = false;
    let hasSelection = false;
    let showActionMenu = false;
    let isDark = true;

    $: isDark = $themeMode === 'dark';

    // We need reactive queries for feeds and articles
    let articlesStore: any;
    const feedsStore = liveQuery(() => db.feeds.toArray());
    let feedTitleMap: Record<number, string> = {};
    
    import { ARTICLE_CONFIG } from '../config';

    $: {
        const fid = $selectedFeedId;
        const status = filterStatus;
        const query = $searchQuery;
        
        articlesStore = liveQuery(async () => {
            let collection;

            // 1. Search takes precedence if active
            const searchTokens = tokenize(query);
            
            if (searchTokens.length > 0) {
                // Optimization: Filter by the longest token first (likely most unique)
                // or just the first one. Let's use the first one for prefix matching support.
                const firstToken = searchTokens[0];
                
                    // Get candidates from DB using index (cap to avoid large in-memory scans)
                    let candidateIds = await db.articles
                        .where('words').startsWith(firstToken)
                        .limit(ARTICLE_CONFIG.MAX_RESULTS * 2) // allow some headroom before secondary filtering
                        .primaryKeys();
                
                // If we have multiple tokens, we must intersect in memory (or multiple queries)
                // For "apple banana", we got IDs for "apple*". Now filter those candidates.
                // But 'words' index helps us find candidates. To filter further, we need to fetch them.
                // OR we can fetch the full objects now and filter in JS.
                
                let results = await db.articles.where('id').anyOf(candidateIds).reverse().sortBy('isoDate');
                
                // Refine results for other tokens in memory
                if (searchTokens.length > 1) {
                     const remainingTokens = searchTokens.slice(1);
                     results = results.filter(a => 
                        remainingTokens.every(t => a.words?.some(w => w.startsWith(t)))
                     );
                }

                // Apply Feed Filter if not searching globally
                // (Optional: usually search is global. Let's keep it global for now as per typical UX)
                // If you want scoped search, you'd filter `results` by feedId here.

                // Apply Read/Unread filter
                if (status === 'unread') {
                    results = results.filter(a => a.read === 0);
                }

                return results.slice(0, ARTICLE_CONFIG.MAX_RESULTS);
            }

            // 2. Standard Navigation (No Search)
            if (fid === 'all') {
                collection = db.articles.orderBy('isoDate').reverse();
            } else if (fid === 'starred') {
                collection = db.articles.orderBy('isoDate').reverse().filter(a => a.starred === 1);
            } else if (typeof fid === 'number') {
                collection = db.articles.orderBy('isoDate').reverse().filter(a => a.feedId === fid);
            }

            // Execute query
            let results: Article[] = [];
            
            if (fid === 'all') {
                  // When filtering unread in All view, query unread directly so we don't drop older unread items when the latest 200 are already read.
                  if (status === 'unread') {
                    results = await db.articles
                        .orderBy('isoDate')
                        .reverse()
                        .filter(a => a.read === 0)
                        .limit(ARTICLE_CONFIG.MAX_RESULTS)
                        .toArray();
                  } else {
                    results = await (collection as any).limit(ARTICLE_CONFIG.MAX_RESULTS).toArray();
                  }
            } else if (fid === 'starred') {
                  results = await (collection as any).limit(ARTICLE_CONFIG.MAX_RESULTS).toArray();
            } else if (typeof fid === 'number') {
                  results = await (collection as any).limit(ARTICLE_CONFIG.MAX_RESULTS).toArray();
            }

            // Apply memory filter for read/unread if needed
            if (status === 'unread' && fid !== 'all') {
                results = results.filter(a => a.read === 0);
            }

            // Cap all result sets to avoid heavy rerenders
            return results.slice(0, ARTICLE_CONFIG.MAX_RESULTS);
        });
    }

    $: {
        const feeds: Feed[] = $feedsStore || [];
        feedTitleMap = feeds.reduce((acc, feed) => {
            if (feed.id !== undefined) {
                acc[feed.id] = feed.title;
            }
            return acc;
        }, {} as Record<number, string>);
    }
    
    // Feed Error Handling
    let currentFeed: Feed | undefined;
    let stopCurrentFeed: (() => void) | undefined;

    $: {
        const fid = $selectedFeedId;
        stopCurrentFeed?.();
        if (typeof fid === 'number') {
            const subscription = liveQuery(() => db.feeds.get(fid)).subscribe((value) => {
                currentFeed = value;
            });
            stopCurrentFeed = () => subscription.unsubscribe();
        } else {
            currentFeed = undefined;
            stopCurrentFeed = undefined;
        }
    }

    onDestroy(() => {
        stopCurrentFeed?.();
    });

    async function deleteCurrentFeed() {
        if (!currentFeed?.id) return;
        if (!confirm(`Delete "${currentFeed.title}"? This action cannot be undone.`)) return;
        
        const id = currentFeed.id;
        await db.transaction('rw', db.feeds, db.articles, async () => {
            await db.articles.where('feedId').equals(id).delete();
            await db.feeds.delete(id);
        });
        $selectedFeedId = 'all';
    }
    
    async function retryCurrentFeed() {
        if (!currentFeed?.id) return;
        try {
            await syncFeed(currentFeed, 50, true);
        } catch (e) {
            logger.error('Retry failed', e, 'ArticleList');
        }
    }

    // Helper for date
    const formatDate = (iso: string) => {
        try {
            return formatDistanceToNow(new Date(iso), { addSuffix: true });
        } catch {
            return 'recently';
        }
    }

    $: {
        const articles: Article[] = $articlesStore || [];
        visibleIds = new Set(articles.map((a) => a.id).filter((id): id is number => id !== undefined));

        const pruned = new Set(Array.from(selectedIds).filter((id) => visibleIds.has(id)));
        if (pruned.size !== selectedIds.size) {
            selectedIds = pruned;
        }

        selectedVisibleCount = pruned.size;
    }

    $: hasSelection = selectedVisibleCount > 0;
    $: totalVisible = visibleIds.size;
    $: allVisibleSelected = totalVisible > 0 && selectedVisibleCount === totalVisible;

    function selectArticle(id: number | undefined) {
        if (id !== undefined) {
            $selectedArticleId = id;
        }
    }

    function commitSelectionChange() {
        selectedIds = new Set(selectedIds);
    }

    function toggleSelection(id: number | undefined) {
        if (id === undefined) return;
        if (selectedIds.has(id)) {
            selectedIds.delete(id);
        } else {
            selectedIds.add(id);
        }
        commitSelectionChange();
    }

    function toggleSelectAll() {
        const articles: Article[] = $articlesStore || [];
        if (selectedVisibleCount === articles.length) {
            clearSelection();
        } else {
            selectedIds = new Set(articles.map(a => a.id).filter((id): id is number => id !== undefined));
        }
    }

    function clearSelection() {
        if (selectedIds.size === 0) return;
        selectedIds.clear();
        commitSelectionChange();
    }

    async function markSelectedRead() {
        if (selectedIds.size === 0) return;
        await markArticlesAsRead(Array.from(selectedIds));
        clearSelection();
    }

    async function markSelectedUnread() {
        if (selectedIds.size === 0) return;
        await markArticlesAsUnread(Array.from(selectedIds));
        clearSelection();
    }

    async function markAllRead() {
         const articles: Article[] = $articlesStore || [];
         const ids = articles.map(a => a.id).filter((id): id is number => id !== undefined);
         
         if (ids.length === 0) return;

         await markArticlesAsRead(ids);
     }

    async function markAllUnread() {
         const articles: Article[] = $articlesStore || [];
         const ids = articles.map(a => a.id).filter((id): id is number => id !== undefined);
         
         if (ids.length === 0) return;

         await markArticlesAsUnread(ids);
     }

    async function markFeedRead() {
         if (typeof $selectedFeedId !== 'number') return;
         await markFeedAsRead($selectedFeedId);
     }

    function isArticleSelected(id: number | undefined): boolean {
        return id !== undefined && selectedIds.has(id);
    }

    function handleListKeydown(e: KeyboardEvent) {
         // Don't trigger when typing in input fields
         if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
             return;
         }

         const articles: Article[] = $articlesStore || [];
         if (articles.length === 0) return;

         // Refresh all feeds on 'r'
         if (e.key === 'r' || e.key === 'R') {
             if (!$refreshProgress) {
                 refreshAllFeeds();
             }
             return;
         }

         // Navigation: j (next), k (previous)
         if (e.key === 'j' || e.key === 'k') {
             const currentIndex = articles.findIndex(a => a.id === $selectedArticleId);
             let newIndex = currentIndex;

             if (e.key === 'j') {
                 // Next article
                 newIndex = currentIndex + 1;
                 if (newIndex >= articles.length) newIndex = articles.length - 1;
             } else if (e.key === 'k') {
                 // Previous article
                 newIndex = currentIndex - 1;
                 if (newIndex < 0) newIndex = 0;
             }

              if (newIndex >= 0 && newIndex < articles.length) {
                  const newArticleId = articles[newIndex].id;
                  if (newArticleId !== undefined) {
                      $selectedArticleId = newArticleId;

                      // Scroll into view with smart positioning
                      const element = document.getElementById('article-list-item-' + newArticleId);
                      if (element) {
                          const scrollBlock = e.key === 'j' ? 'start' : 'end';
                          element.scrollIntoView({ block: scrollBlock, behavior: 'smooth' });
                      }
                  }
              }
         }
     }

    function handleWindowClick(event: MouseEvent) {
        const target = event.target as HTMLElement | null;
        if (!target) return;
        if (showActionMenu && !target.closest('#article-actions-menu')) {
            showActionMenu = false;
        }
    }
</script>

<svelte:window on:keydown={handleListKeydown} on:click={handleWindowClick} />

<div 
    class="h-full flex flex-col"
    style={`background:${$themeMode === 'dark' ? 'var(--o3-color-palette-black-90)' : 'var(--o3-color-palette-paper)'};color:${$themeMode === 'dark' ? 'var(--o3-color-palette-white)' : 'var(--o3-color-palette-black-90)'}`}
>
    {#if currentFeed?.error}
        <div class="bg-o3-claret text-white px-4 py-3 flex flex-col gap-2 shrink-0 border-b border-o3-black-30">
            <div class="flex items-start gap-2">
                <span class="text-xl font-bold">!</span>
                <div class="flex-1 min-w-0">
                    <h3 class="font-bold text-sm uppercase tracking-wider">Feed Error</h3>
                    <p class="text-sm opacity-90 break-words">{currentFeed.error}</p>
                </div>
            </div>
            <div class="flex gap-2 pl-6">
                <button 
                    class="px-3 py-1 bg-white text-o3-claret text-xs font-bold uppercase tracking-wider hover:bg-o3-white"
                    on:click={retryCurrentFeed}
                >
                    Retry
                </button>
                <button 
                    class="px-3 py-1 bg-o3-black-20 text-white text-xs font-bold uppercase tracking-wider hover:bg-o3-black-40" 
                    on:click={deleteCurrentFeed}
                >
                    Remove Feed
                </button>
            </div>
        </div>
    {/if}

    <!-- Toolbar -->
    <div class="px-4 py-3 sticky top-0 z-10" style={`background:${isDark ? 'var(--o3-color-palette-black-90)' : 'var(--o3-color-palette-paper)'};border-bottom: 1px solid ${isDark ? 'var(--o3-color-palette-black-30)' : 'var(--o3-color-palette-black-10)'}`}>
        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div class="flex items-center gap-2 min-w-0">
            </div>

            <div class="flex items-center gap-3 flex-wrap justify-end">
                <!-- Filter Buttons -->
                <div class="flex rounded-full overflow-hidden text-xs font-semibold" class:border={isDark} class:border-o3-black-60={isDark} style={isDark ? 'background: rgba(0, 0, 0, 0.25)' : 'background: rgb(255, 255, 255); border: 1px solid var(--o3-color-palette-black-10)'}>
                    <button 
                        class="px-4 py-1.5 uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-o3-teal"
                        class:bg-o3-teal={filterStatus === 'all'}
                        class:text-o3-black-90={filterStatus === 'all'}
                        class:text-o3-black-40={filterStatus !== 'all' && isDark}
                        class:text-o3-black-60={filterStatus !== 'all' && !isDark}
                        on:click={() => filterStatus = 'all'}
                        aria-pressed={filterStatus === 'all'}
                        aria-label="Show all articles"
                    >
                        All
                    </button>
                    <div class="w-px" class:bg-o3-black-60={isDark} style={!isDark ? 'background: var(--o3-color-palette-black-10)' : ''}></div>
                    <button 
                        class="px-4 py-1.5 uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-o3-teal"
                        class:bg-o3-teal={filterStatus === 'unread'}
                        class:text-o3-black-90={filterStatus === 'unread'}
                        class:text-o3-black-40={filterStatus !== 'unread' && isDark}
                        class:text-o3-black-60={filterStatus !== 'unread' && !isDark}
                        on:click={() => filterStatus = 'unread'}
                        aria-pressed={filterStatus === 'unread'}
                        aria-label="Show unread articles"
                    >
                        Unread
                    </button>
                </div>

                <!-- Batch Mode Toggle & Actions Menu -->
                <div class="flex items-center gap-2">
                    <button 
                        class="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-o3-teal"
                        class:bg-o3-teal={selectionMode}
                        class:text-o3-black-90={selectionMode}
                        class:border={!selectionMode}
                        class:border-o3-teal={!selectionMode}
                        class:text-o3-teal={!selectionMode}
                        style={!selectionMode ? (isDark ? 'border-opacity: 0.4; background: rgba(17, 153, 142, 0.05)' : 'border-opacity: 0.3; background: rgba(17, 153, 142, 0.03)') : ''}
                        on:click={() => {
                            selectionMode = !selectionMode;
                            if (!selectionMode) {
                                clearSelection();
                            }
                        }}
                        title={selectionMode ? 'Exit selection mode' : 'Enter selection mode'}
                    >
                        {selectionMode ? 'Done' : 'Batch'}
                    </button>

                    <div id="article-actions-menu" class="relative">
                    <button
                        class="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors rounded text-o3-black-40 hover:text-o3-black-60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-o3-black-50"
                        class:hover:text-o3-black-50={isDark}
                        on:click={() => showActionMenu = !showActionMenu}
                        aria-expanded={showActionMenu}
                        aria-haspopup="menu"
                        title="More actions"
                    >
                        Actions
                    </button>
                    {#if showActionMenu}
                        <div class="absolute right-0 mt-2 w-52 border rounded overflow-hidden shadow-lg z-20" class:bg-o3-black-80={isDark} class:border-o3-black-40={isDark} class:bg-o3-white={!isDark} class:border-o3-black-10={!isDark}>
                            <button 
                                class="block w-full text-left px-4 py-2.5 text-sm transition"
                                class:text-o3-paper={isDark}
                                class:hover:bg-o3-black-70={isDark}
                                class:text-o3-black-80={!isDark}
                                class:hover:bg-o3-black-10={!isDark}
                                on:click={async () => {
                                    showActionMenu = false;
                                    await markAllRead();
                                }}
                            >
                                Mark visible as read
                            </button>
                            <button 
                                class="block w-full text-left px-4 py-2.5 text-sm transition"
                                class:text-o3-paper={isDark}
                                class:hover:bg-o3-black-70={isDark}
                                class:text-o3-black-80={!isDark}
                                class:hover:bg-o3-black-10={!isDark}
                                on:click={async () => {
                                    showActionMenu = false;
                                    await markAllUnread();
                                }}
                            >
                                Mark visible as unread
                            </button>
                            {#if typeof $selectedFeedId === 'number'}
                                <button 
                                    class="block w-full text-left px-4 py-2.5 text-sm transition"
                                    class:text-o3-paper={isDark}
                                    class:hover:bg-o3-black-70={isDark}
                                    class:text-o3-black-80={!isDark}
                                    class:hover:bg-o3-black-10={!isDark}
                                    on:click={async () => {
                                        showActionMenu = false;
                                        await markFeedRead();
                                    }}
                                >
                                    Mark entire feed as read
                                </button>
                            {/if}
                        </div>
                    {/if}
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Selection Mode Toolbar -->
    {#if selectionMode}
        <div class="px-4 py-3 z-10" style={`background:${isDark ? 'var(--o3-color-palette-black-90)' : 'var(--o3-color-palette-paper)'};border-bottom: 1px solid ${isDark ? 'var(--o3-color-palette-black-30)' : 'var(--o3-color-palette-black-10)'}`}>
            <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <!-- Selection Info -->
                <div class="flex items-baseline gap-3">
                    <span class="text-2xl font-headline font-bold leading-none" class:text-o3-paper={isDark} class:text-o3-black-90={!isDark}>
                        {selectedVisibleCount}
                    </span>
                    <span class="text-xs uppercase tracking-widest font-bold" class:text-o3-black-50={isDark} class:text-o3-black-60={!isDark}>
                        selected of {totalVisible}
                    </span>
                </div>
                
                <!-- Action Buttons -->
                <div class="flex items-center gap-2 flex-wrap">
                    <!-- Select All Toggle -->
                    <button 
                        class="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-o3-teal"
                        class:border={true}
                        class:border-o3-teal={true}
                        class:text-o3-teal={true}
                        style={isDark ? 'border-opacity: 0.4; background: rgba(17, 153, 142, 0.05)' : 'border-opacity: 0.3; background: rgba(17, 153, 142, 0.03)'}
                        on:click={toggleSelectAll}
                        title={allVisibleSelected ? 'Clear all selections' : 'Select everything in view'}
                        disabled={totalVisible === 0}
                        aria-disabled={totalVisible === 0}
                    >
                        {allVisibleSelected ? 'Deselect All' : 'Select All'}
                    </button>
                    
                    <div class="flex gap-1">
                        <!-- Mark Read (Primary) -->
                        <button 
                            class="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all rounded bg-o3-teal text-o3-black-90 hover:bg-o3-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-o3-black-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            on:click={markSelectedRead}
                            disabled={!hasSelection}
                            aria-disabled={!hasSelection}
                            title="Mark selected as read"
                        >
                            Read
                        </button>
                        
                        <!-- Mark Unread (Secondary) -->
                        <button 
                            class="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors rounded border border-o3-teal text-o3-teal focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-o3-teal hover:bg-o3-teal/10 disabled:opacity-50 disabled:cursor-not-allowed"
                            style={isDark ? 'border-opacity: 0.5' : 'border-opacity: 0.4'}
                            on:click={markSelectedUnread}
                            disabled={!hasSelection}
                            aria-disabled={!hasSelection}
                            title="Mark selected as unread"
                        >
                            Unread
                        </button>
                        
                        <!-- Clear (Tertiary) -->
                        <button 
                            class="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors rounded text-o3-black-40 hover:text-o3-black-60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-o3-black-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            class:hover:text-o3-black-50={isDark}
                            on:click={clearSelection}
                            disabled={!hasSelection}
                            aria-disabled={!hasSelection}
                            title="Clear selection"
                        >
                            Clear
                        </button>
                    </div>
                </div>
            </div>
        </div>
    {/if}

    <!-- List - flex-1 with min-h-0 enables overflow scrolling -->
    <div class="flex-1 overflow-y-auto min-h-0 relative">
        {#if $articlesStore}
            {#each $articlesStore as article (article.id)}
                <div
                    id={'article-list-item-' + article.id}
                    class="relative w-full flex items-stretch border-b border-o3-black-30 group transition-colors"
                    class:bg-o3-black-80={$selectedArticleId === article.id && $themeMode === 'dark'}
                    class:bg-o3-black-10={$selectedArticleId === article.id && $themeMode !== 'dark'}
                    class:hover:bg-o3-black-80={$selectedArticleId !== article.id && $themeMode === 'dark'}
                    class:hover:bg-o3-black-10={$selectedArticleId !== article.id && $themeMode !== 'dark'}
                    class:selected-article={isArticleSelected(article.id)}
                >
                    <button 
                        class="flex-1 text-left p-4 relative"
                        on:click={() => selectionMode ? toggleSelection(article.id) : selectArticle(article.id)}
                        aria-label="Read article: {article.title}"
                    >
                        {#if article.read === 0}
                            <span class="absolute top-4 right-4 badge-unread">New</span>
                        {/if}
                        
                        <div class="text-xs text-o3-teal mb-1 font-bold uppercase tracking-wide">
                            {feedTitleMap[article.feedId] || 'Unknown'}
                        </div>
                        
                        <h3 class="font-headline font-bold text-lg leading-snug mb-2" class:text-o3-paper={$themeMode === 'dark'} class:text-o3-black-90={$themeMode !== 'dark'} class:group-hover:text-o3-white={$themeMode === 'dark'}>
                            {article.title}
                        </h3>
                        
                        <div class="text-sm line-clamp-2 mb-2 font-body leading-relaxed" class:text-o3-black-20={$themeMode === 'dark'} class:text-o3-black-70={$themeMode !== 'dark'}>
                            {article.snippet}
                        </div>
                        
                        <div class="text-[10px] uppercase tracking-wider font-bold" class:text-o3-black-40={$themeMode === 'dark'} class:text-o3-black-70={$themeMode !== 'dark'}>
                            {formatDate(article.isoDate)}
                        </div>
                    </button>

                    <a
                        href={article.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="absolute bottom-2 right-2 z-20 o3-button o3-button--ghost o3-button--small o3-button-icon o3-button-icon--outside-page o3-button-icon--icon-only opacity-0 group-hover:opacity-100 transition-all"
                        data-o3-theme={$themeMode === 'dark' ? 'inverse' : 'standard'}
                        on:click|stopPropagation
                        title="Open in New Tab"
                        aria-label="Open in New Tab"
                    >
                        <span class="o3-button-icon__label">Open</span>
                    </a>
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

<style>
    :global(.selected-article) {
        background: rgba(17, 153, 142, 0.18) !important;
        border-color: rgba(17, 153, 142, 0.75) !important;
        box-shadow: inset 0 0 0 1px rgba(17, 153, 142, 0.5) !important;
    }
</style>
