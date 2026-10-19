/** Read-only AppInstall receipt presentation gate.
 *
 * A task may be left UNKNOWN after ACK loss. Never display an earlier
 * successful read when this host's current query is fetching or failing.
 * This is a UI fence, not an execution authorization or TaskDB proof.
 */
export interface InstallReceiptQueryView<T> {
    isSuccess: boolean;
    isFetching: boolean;
    isError: boolean;
    currentData?: T;
}

export function canQueryInstallReceipt(receiptNode: string, activeNode: string): boolean {
    return receiptNode.length > 0 && receiptNode === activeNode;
}

export function visibleInstallReceipt<T>(
    query: InstallReceiptQueryView<T>,
    sameHost: boolean,
): T | undefined {
    if (!sameHost || !query.isSuccess || query.isError || query.isFetching) {
        return undefined;
    }
    return query.currentData;
}
