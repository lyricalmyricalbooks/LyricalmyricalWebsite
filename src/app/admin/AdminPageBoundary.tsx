import { Component, type ReactNode } from "react";
import { ErrorState, GhostButton } from "./riso/components";
import { isChunkLoadError, reloadForNewBuild } from "../lib/staleBuild";

/**
 * `onClose`: a way out for full-screen views (book editor, Design studio) that cover the side menu.
 * `frame`: the admin appearance, for a view drawn outside the Riso shell (Design studio), so the message keeps its look.
 */
type Props = { children: ReactNode; resetKey?: string; label?: string; onClose?: () => void; closeLabel?: string; frame?: string };

/**
 * Keeps one admin page's crash inside that page: the side menu and top bar stay, the owner can try again or move
 * to another page (a new `resetKey` clears the error). Without it a crash replaced the whole admin with the
 * shop's error screen. A page whose code went missing in a deploy reloads once into the new build.
 */
export class AdminPageBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (isChunkLoadError(error) && reloadForNewBuild()) return;
    console.error(`Admin error (${this.props.label || "page"}):`, error);
  }

  componentDidUpdate(previous: Readonly<Props>) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const missingCode = isChunkLoadError(this.state.error);
    const state = (
      <ErrorState
        title={missingCode ? "A newer admin is live" : `${this.props.label || "This page"} didn't open`}
        description={missingCode ? "Reload to pick it up." : "The rest of the admin still works."}
        retryLabel={missingCode ? "Reload" : "Try again"}
        onRetry={() => (missingCode ? window.location.reload() : this.setState({ error: null }))}
        action={this.props.onClose && <GhostButton onClick={this.props.onClose}>{this.props.closeLabel || "Close"}</GhostButton>}
      />
    );
    if (!this.props.frame) return state;
    return <div className="rp" data-rp-appearance={this.props.frame} style={{ height: "100%", display: "grid", placeItems: "center" }}>{state}</div>;
  }
}
