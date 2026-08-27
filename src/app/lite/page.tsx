import { RoutineJournal } from "@/components/routine-journal";
import { journalCategories } from "@/lib/exercises";

export default function LitePage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-5 sm:px-6">
      <RoutineJournal
        initialTab="lite"
        categories={journalCategories}
        hiddenLiteHero
      />
    </main>
  );
}
