# Accelerator Provider acceptance contract (Host-first)

Current upstream 1Panel collector includes NVIDIA (nvidia-smi), AMD (amd-smi), Ascend NPU, Intel XPU and an accelerator aggregator. GPUPanel does **not** claim MetaX support is implemented.

## Actual changes
- Add NewWithProviders to the existing read-only accelerator collector for dependency injection. The normal New() discovery and API routes remain unchanged.
- Add hermetic Go contract tests for normal snapshots, partial failure, total failure, context cancellation and injected-slice immutability.
- No new driver execution, shell commands, API permissions or GPU scheduling.

## MetaX provider admission checklist
1. Acquire redacted real mx-smi outputs (per driver/tool version); never guess its command flags or JSON structure.
2. Build an opt-in read-only adapter with stable ID, HBM total/used, utilization and driver version. Unavailable metrics stay absent, not zero.
3. Do not expose serial numbers, user process arguments or identifying data in fixtures.
4. Confirm partial provider failure results in warnings; all failures must cause a non-success result.
5. Add parser fixtures, cancellation, mixed-vendor and live smoke tests before enabling it.
6. GPU scheduling belongs in gpu-compute-platform with Kueue, not in the Host agent.

Run from root once required Go toolchain and dependencies are available:
    cd agent && go test ./utils/ai_tools/accelerator -run 'Test(Injected|Partial|AllProviders|Cancelled|Adapter)' -count=1

This branch is a contract/test foundation only; unsupported hardware should not be advertised as working.
