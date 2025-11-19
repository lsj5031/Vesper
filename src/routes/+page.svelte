<script>
    import Sidebar from '$lib/components/Sidebar.svelte';
    import ArticleList from '$lib/components/ArticleList.svelte';
    import Reader from '$lib/components/Reader.svelte';
</script>

<div id="vesper-layout" class="grid h-screen w-screen overflow-hidden bg-vesper-dark">
    <!-- Left Panel: Navigation (280px fixed) -->
    <aside class="hidden md:block border-r border-vesper-midgray h-screen" style="grid-column: 1; width: 280px;">
        <Sidebar />
    </aside>

    <!-- Middle Panel: Feed (380px fixed) -->
    <section class="border-r border-vesper-midgray h-screen" style="grid-column: 2; width: 380px;">
        <ArticleList />
    </section>

    <!-- Right Panel: Reader (Fluid) -->
    <main class="bg-vesper-dark h-screen" style="grid-column: 3;">
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
