import {
  Component,
  type ErrorInfo,
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
} from "react";
import { Button } from "../../atoms/Button/Button.tsx";
import { PageHeading } from "../../atoms/PageHeading/PageHeading.tsx";
import { AppLayout } from "../AppLayout/AppLayout.tsx";
import "./RouteErrorBoundary.css";

/** What the person sees instead of a screen that could not be shown. */
function FailedScreen({ onReload }: { readonly onReload: () => void }): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  // The screen that had the focus is gone, so the focus goes to the message.
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("h1")?.focus();
  }, []);
  return (
    <AppLayout wide>
      <div ref={ref} className="route-error">
        <PageHeading>This screen could not load</PageHeading>
        <p>
          This can happen with a poor connection, or right after Plotpal was updated. Reloading the
          page usually fixes it.
        </p>
        <div className="route-error__actions">
          <Button onClick={onReload}>Reload the page</Button>
        </div>
      </div>
    </AppLayout>
  );
}

export interface RouteErrorBoundaryProps {
  readonly children: ReactNode;
  /** What the button does. Reloads the page unless told otherwise. */
  readonly onReload?: () => void;
}

interface State {
  readonly failed: boolean;
}

/**
 * A safety net around a screen: when the screen fails to show, most often because the file that
 * holds it could not be loaded, a message and a button replace it, instead of a blank page.
 *
 * React only supports this as a class (there is no hook for it), the one place where the app is not
 * written with functions. The technical message is written to the console and never shown.
 */
export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("A screen could not be shown:", error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    const reload = this.props.onReload ?? (() => window.location.reload());
    return <FailedScreen onReload={reload} />;
  }
}
