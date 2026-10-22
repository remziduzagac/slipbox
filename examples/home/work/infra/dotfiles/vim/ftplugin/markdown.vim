" markdown.vim — how we edit the docs repositories in Vim: wrap at 120, as the docs' linter wants.
setlocal textwidth=120
setlocal colorcolumn=+1
setlocal spell spelllang=en_gb
setlocal conceallevel=0

" Follow a relative link under the cursor: gf on the target, with .md added when it's left off.
setlocal suffixesadd=.md
setlocal includeexpr=substitute(v:fname,'#.*$','','')

" The ADR template, from docs/adr/template.md.
nnoremap <buffer> <leader>na :read docs/adr/template.md<CR>
