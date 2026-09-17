<script lang="ts">
  import PlayButton from "@lautstark/stimmquelle/svelte/PlayButton";
  import { preview } from "../speech.js";
  let { s }: { s: { said: { text: string }[] }; handle: unknown } = $props();
  let why = $state("");
</script>

<div class="stack">{#each s.said as line}<div class="sentence"><PlayButton label="Ansage anhören" text={() => line.text} hear={preview} nothing="Erst einen Namen eintippen." trouble={words => { why = words; }} /><span class="sentence__text">{line.text}</span></div>{/each}<p class="hint" role="status">{why}</p><!-- Said rather than linked: the person is edited in a panel inside the settings sheet, and a button here would have to open a sheet on top of a sheet to reach it. --><p class="hint">Jedes Jahr, solange das Geburtsdatum steht. Name und Datum ändern sich mit der Person — Einstellungen → Personen.</p></div>
