import { WeightCard } from "./WeightCard";
import { SleepCard } from "./SleepCard";
import { StepsCard } from "./StepsCard";
import { ConsistencyCard } from "./ConsistencyCard";

export function DashboardPage() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <WeightCard />
      <SleepCard />
      <StepsCard />
      <ConsistencyCard />
    </div>
  );
}
