# Frontend baseline type-check repair

In baseline 1Panel dev-v2 at d9dc5d7, Vue type-check initially produces hundreds of missing auto-import names if run before Vite, because declarations are generated during the Vite build. Running the production build first reduces failures to 9 independent type errors.

This PR resolves the 9 remaining errors without changing public API routes or models:
- Convert network and proxy v-for index values to number before arithmetic/splice.
- Extend process drawer's empty reactive display shape to include the memory fields already referenced in the template (pss, uss, shared, text, dirty).
- Narrow custom webhook formatting's discriminated union with an explicit false equality check.

## Gate
CI: npm ci -> npm run build:pro -> npm run type-check. No blanket TypeScript suppression and no exclusion filters.

This is isolated so brand and Host portal PRs need not carry unrelated upstream typing fixes. Merge this verified baseline fix before expecting those two PRs to pass their full type-check.
