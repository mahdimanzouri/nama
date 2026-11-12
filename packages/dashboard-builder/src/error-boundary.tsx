import { Component, type ErrorInfo, type ReactNode } from "react";

interface WidgetErrorBoundaryProps {
  fallback: ReactNode;
  resetKey: string;
  children: ReactNode;
}

interface WidgetErrorBoundaryState {
  failed: boolean;
}

/** One failing widget must never blank the dashboard. */
export class WidgetErrorBoundary extends Component<
  WidgetErrorBoundaryProps,
  WidgetErrorBoundaryState
> {
  override state: WidgetErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): WidgetErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("[nama] widget failed to render", error, info);
  }

  override componentDidUpdate(previous: WidgetErrorBoundaryProps): void {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
