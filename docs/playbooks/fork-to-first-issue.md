# From kit fork to first shipped issue

Short path after [`start-product.md`](./start-product.md).

1. Product repo + `upstream` fetch-only (operator kit parent URL).
2. Capture product intent (frame / brief) in **product** docs (`docs/product/*`).
3. Open tracker issue + GitHub issue.
4. Implement only under `apps/<product>-*` (+ product workflows if needed).
5. `bun run validate:full` green · product-validate if apps exist.
6. PR → review → merge on product `origin`.

Kit shared fixes: land on a **kit clone**, then products `fetch`/`merge upstream`.

Details: [`docs/product-consumer-contract.md`](../product-consumer-contract.md).
