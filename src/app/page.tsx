import { journalCategories } from "@/lib/exercises";
import { RoutineJournal } from "@/components/routine-journal";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-5 sm:px-6">
      <RoutineJournal categories={journalCategories} />
    </main>
  );
}
