<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Application architecture
- Keep live cross-route simulation state in the root-level React provider so all surveillance modules and the command dashboard observe the same frame.
- Keep incident persistence behind a small replaceable client-side data layer that emits cross-route change events, so review edits and new records stay synchronized until a backend replaces local storage.
