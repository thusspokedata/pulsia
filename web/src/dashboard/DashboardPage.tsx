import { WeightCard } from "./WeightCard";
import { SleepCard } from "./SleepCard";
import { StepsCard } from "./StepsCard";
import { ConsistencyCard } from "./ConsistencyCard";

export function DashboardPage() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <WeightCard />
      <SleepCard />
      <StepsCard />
      <ConsistencyCard />
    </div>
  );
}
