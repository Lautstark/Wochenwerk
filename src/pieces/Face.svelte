<script lang="ts">
  import type { Person } from "../model.js";
  let { person, size = "" }: { person: Person | undefined; size?: "" | "sm" } = $props();
</script>

{#if person}<span class={`face ${size}`.trim()} style="--tone:{person.tone}" title={person.name}>{#if person.photo}<img src={person.photo} alt="" />{:else}<b>{person.initials}</b>{/if}</span>{/if}
