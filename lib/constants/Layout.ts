/**
 * Layout constants used to adapt the UI to different screen sizes:
 * phones, phones in landscape, foldables (folded and unfolded) and tablets.
 */
export const Layout = {
    /**
     * Width in dp at which a window is treated as "wide".
     * Covers tablets, unfolded foldables and most phones in landscape.
     */
    wideScreenBreakpoint: 600,

    /**
     * Upper bound for chat content width. Keeps line lengths readable
     * instead of stretching a single message across an entire tablet.
     */
    chatMaxContentWidth: 820,

    /** Drawers are sized as a percentage of the window, capped for wide screens. */
    settingsDrawerMaxWidth: 340,
    chatsDrawerMaxWidth: 440,
    userDrawerMaxWidth: 400,
} as const
