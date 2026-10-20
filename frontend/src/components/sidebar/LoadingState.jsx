import Card from "../ui/Card.jsx";
import { sidebarStyles } from "../../assets/dummyStyles (1).js";

const LoadingState = () => (
  <div className={sidebarStyles.loadingState}>
    <Card className={sidebarStyles.loadingCard} role="status" aria-live="polite">
      <div className={sidebarStyles.loadingSpinner} aria-hidden="true" />
      <h3 className={sidebarStyles.loadingText}>Preparing your quiz</h3>
      <p className={sidebarStyles.loadingSubtext}>
        Loading questions and setting up your timer…
      </p>
    </Card>
  </div>
);

export default LoadingState;
