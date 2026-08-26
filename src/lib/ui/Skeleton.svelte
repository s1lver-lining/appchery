<script lang="ts">
	/**
	 * One block standing in for something still being read out of the database. Shaped and placed
	 * like the thing it waits for, so the page is already the right size when the real content lands
	 * and nothing under the thumb moves. The sweep across it is painted by the `.skeleton` rule,
	 * which every block shares so a group reads as one surface being uncovered.
	 */
	let { class: klass = '' }: { class?: string } = $props();
</script>

<div class="skeleton {klass}" aria-hidden="true"></div>
