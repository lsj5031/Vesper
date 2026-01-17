<script lang="ts">
    import { goto } from '$app/navigation';

    // For a prerendered SPA, we should redirect all unknown routes back to the root
    // This handles cases where:
    // 1. Users have bookmarked old routes that no longer exist
    // 2. Service workers try to navigate to paths that don't exist
    // 3. Browser history contains paths from old versions of the app
    goto('/', { replaceState: true });
</script>

<p>Redirecting...</p>
