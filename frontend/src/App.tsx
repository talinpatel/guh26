import { Navigate, Route, Routes } from "react-router-dom";
import Onboarding from "./Onboarding.tsx";
import Planner from "./Planner.tsx";

// Components (not inline elements) so the flag is re-read on every navigation.
const onboarded = () => localStorage.getItem("onboarded") === "1";
const Home = () => (
  <Navigate to={onboarded() ? "/planner" : "/onboarding"} replace />
);
const PlannerRoute = () =>
  onboarded() ? <Planner /> : <Navigate to="/onboarding" replace />;

export default function App() {
  return (
    <Routes>
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/planner" element={<PlannerRoute />} />
      <Route path="/plannertest" element={<Planner />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
