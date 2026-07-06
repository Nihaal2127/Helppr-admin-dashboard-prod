import React from "react";
import { openDialog } from "../../lib/global/DialogManager";

/** Lazy-opens user details so list pages do not bundle the full dialog up front. */
export function showUserDetailsDialog(
  userId: string,
  onRefreshData: () => void
): void {
  void import("./UserDetailsDialog").then(({ default: UserDetailsDialog }) => {
    openDialog("user-details-modal", (close) =>
      React.createElement(UserDetailsDialog, {
        userId,
        onClose: close,
        onRefreshData,
      })
    );
  });
}
