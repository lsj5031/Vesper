<script lang="ts">
    import Sidebar from '$lib/components/Sidebar.svelte';
    import ArticleList from '$lib/components/ArticleList.svelte';
    import Reader from '$lib/components/Reader.svelte';
    import { themeMode, showSidebar } from '$lib/stores';

    export let data;
    export let params;
    export let form;
    const _kitProps = { data, params, form };
</script>

<div id="vesper-layout" class="grid h-screen w-screen overflow-hidden" style={`background:${$themeMode === 'dark' ? 'var(--o3-color-palette-black-90)' : 'var(--o3-color-palette-paper)'};grid-template-columns:${$showSidebar ? '280px 380px 1fr' : '380px 1fr'}`}>
    <!-- Left Panel: Navigation (280px fixed, toggleable with 'b' hotkey) -->
    {#if $showSidebar}
    <aside class="hidden md:block border-r border-o3-black-30 h-screen" style="grid-column: 1; width: 280px;">
        <Sidebar />
    </aside>
    {/if}

    <!-- Middle Panel: Feed (380px fixed) -->
    <section class="border-r border-o3-black-30 h-screen" style={`grid-column: ${$showSidebar ? '2' : '1'}; width: 380px;`}>
        <ArticleList />
    </section>

    <!-- Right Panel: Reader (Fluid) -->
    <main class="h-screen" style={`background:${$themeMode === 'dark' ? 'var(--o3-color-palette-black-90)' : 'var(--o3-color-palette-white)'};grid-column: ${$showSidebar ? '3' : '2'};`}>
        <Reader />
    </main>
</div>

<style>
    #vesper-layout {
        display: grid;
        /* Mobile default: simplified stack (will be overridden by media queries if we wanted complex mobile logic, 
           but for this desktop-first MVP we stick to the grid. 
           Note: Mobile responsiveness requires hiding columns based on state.
           For this prompt's "Exact FT.com design", we focus on the desktop 3-pane first.) 
        */
        grid-template-columns: 280px 380px 1fr;
    }

    @media (max-width: 1024px) {
        /* Tablet/Mobile overrides would go here to toggle views */
        #vesper-layout {
            grid-template-columns: 280px 1fr 0px; /* Reader hidden or overlay */
        }
    }
    
    @media (max-width: 768px) {
         #vesper-layout {
            display: flex;
            flex-direction: column;
        }
    }
</style>
