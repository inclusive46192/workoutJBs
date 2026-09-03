/**
 * Per-exercise movement guides.
 *
 * Why the visuals differ per category:
 *
 * - Morning routine: dynamic movements that no openly licensed media covers
 *   (14 of 15 have no image or animation anywhere), so they get hand-authored
 *   stick-figure animations. These are the ones where showing the *transition*
 *   actually teaches the movement.
 * - Yoga: static held shapes. An animation is the wrong medium, and the only
 *   verified CC0 pose set (6 Openclipart drawings) contains none of the poses
 *   used here. Cues only.
 * - HIIT: no openly licensed animated exercise media exists at all - Wikimedia
 *   has no such category, and every commercial GIF library is proprietary or
 *   of unverifiable provenance. Cues only.
 *
 * `motion` is therefore optional: omitted means "no figure", which is honest
 * rather than a misleading generic animation.
 */

export type GuideMotion =
  | "hop"
  | "bodyWave"
  | "trunkTwist"
  | "deadArms"
  | "golfSwing"
  | "armSwingVertical"
  | "march"
  | "cossack"
  | "deepSquat"
  | "tableTopToe"
  | "plankHandsBehind"
  | "kneelingHeelReach"
  | "legSwing"
  | "still";

export type ExerciseGuide = {
  motion?: GuideMotion;
  /** One sentence: how to set up. */
  setup: string;
  /** Two to three execution cues, imperative and specific. */
  cues: string[];
  /** Optional note on what to avoid or what it is for. */
  focus?: string;
};

export const exerciseGuides: Record<string, ExerciseGuide> = {
  // ------------------------------------------------------- Morning Routine
  "Lymphatic hops": {
    motion: "hop",
    setup: "Aufrecht stehen, Füße hüftbreit, Arme locker hängend.",
    cues: [
      "Locker auf den Fußballen federn, Fersen heben kaum ab.",
      "Knie bleiben weich, der ganze Körper schwingt mit.",
      "Ruhig weiteratmen, Schultern locker lassen.",
    ],
    focus: "Sanftes Federn zur Aktivierung – kein Sprungtraining.",
  },
  "Body waves": {
    motion: "bodyWave",
    setup: "Hüftbreiter Stand, Arme locker an der Seite.",
    cues: [
      "Leicht in die Knie durchschwingen und dabei ausatmen.",
      "Von unten wieder hochschwingen und einatmen.",
      "Arme dabei bis über den Kopf mitführen.",
    ],
    focus: "Atmung führt die Bewegung: runter = aus, hoch = ein.",
  },
  "Trunk twist": {
    motion: "trunkTwist",
    setup: "Hüftbreiter Stand, Arme locker vor dem Körper.",
    cues: [
      "Nur der Oberkörper rotiert – Unterkörper bleibt starr.",
      "Kopf bleibt nach vorn gerichtet und dreht nicht mit.",
      "Die Arme geben den Schwung und schlagen locker um den Rumpf.",
    ],
  },
  "Dead arms": {
    motion: "deadArms",
    setup: "Aufrecht stehen, Arme vollständig entspannt hängen lassen.",
    cues: [
      "Oberkörper minimal drehen und die Arme komplett locker mitschwingen lassen.",
      "Keine aktive Muskelspannung in Schultern oder Armen.",
      "Schwung kommt allein aus dem Rumpf.",
    ],
    focus: "Löst Spannung in Schultergürtel und Nacken.",
  },
  "Golf swing": {
    motion: "golfSwing",
    setup: "Schulterbreiter Stand, Hände locker zusammengeführt.",
    cues: [
      "Wie beim Golfschwung weit nach hinten ausholen.",
      "Nur die Ferse hebt je nach Richtung leicht ab.",
      "Durch die Mitte beschleunigen und auf der Gegenseite ausschwingen.",
    ],
  },
  "Arm swings": {
    motion: "armSwingVertical",
    setup: "Aufrechter Stand, Arme locker an der Seite.",
    cues: [
      "Vertikal schwingen: linker Arm nach oben, rechter nach unten.",
      "Dann fließend andersherum wechseln.",
      "Brustkorb bleibt aufgerichtet, Schultern tief.",
    ],
  },
  "March slaps": {
    motion: "march",
    setup: "Aufrechter Stand, Blick geradeaus.",
    cues: [
      "Knie abwechselnd auf Hüfthöhe anheben.",
      "Mit der Gegenhand auf den Oberschenkel klatschen.",
      "Rhythmisch bleiben, Rumpf aufrecht halten.",
    ],
    focus: "Überkreuzmuster aktiviert Koordination und Kreislauf.",
  },
  "90/90 Hip Switch": {
    setup: "Sitzend, beide Knie 90 Grad: ein Bein vorn, eins seitlich hinten.",
    cues: [
      "Beide Knie gleichzeitig zur anderen Seite kippen lassen.",
      "Füße bleiben am Boden, Oberkörper aufrecht.",
      "Langsam wechseln, nicht schwingen.",
    ],
    focus: "Innen- und Außenrotation der Hüfte.",
  },
  "Knee over Toe": {
    setup: "Ausfallschritt, Hände zur Unterstützung an einer Wand oder Stuhl.",
    cues: [
      "Vorderes Knie langsam über die Fußspitze schieben.",
      "Ferse bleibt am Boden, Bewegung kontrolliert.",
      "Nur so weit, wie es schmerzfrei bleibt, dann Seite wechseln.",
    ],
    focus: "Belastbarkeit von Knie und Sprunggelenk.",
  },
  "Cossack squat": {
    motion: "cossack",
    setup: "Sehr weiter seitlicher Stand, Fußspitzen leicht nach außen.",
    cues: [
      "Gewicht auf ein Bein verlagern und tief absinken.",
      "Anderes Bein bleibt gestreckt, Fußspitze zeigt nach oben.",
      "Kontrolliert zur anderen Seite wechseln.",
    ],
    focus: "Öffnet Adduktoren und Hüfte.",
  },
  "Deep squat opener": {
    motion: "deepSquat",
    setup: "Füße etwas weiter als hüftbreit, Zehen leicht nach außen.",
    cues: [
      "So tief wie möglich in die Hocke sinken.",
      "Ellbogen innen an den Knien, Hände vor der Brust.",
      "Gewicht abwechselnd zur linken und rechten Seite verlagern.",
    ],
    focus: "In der tiefen Position 2–3 Atemzüge verweilen.",
  },
  "World best stretch opener": {
    setup: "Tiefer Ausfallschritt: ein Bein vorn, ein Bein weit hinten.",
    cues: [
      "Vorderer Fuß steht zwischen den Händen.",
      "Einen Arm unter dem Körper durch zwischen die Beine führen.",
      "Denselben Arm weit nach oben öffnen, Blick folgt der Hand.",
    ],
    focus: "Hüftbeuger, Brustwirbelsäule und Schultern in einem Zug.",
  },
  "Lunge front reach": {
    setup: "Kniender Ausfallschritt, hinteres Knie am Boden.",
    cues: [
      "Beide Arme nach vorn oben strecken.",
      "Hintere Hüfte aktiv nach vorn schieben.",
      "Nach der Wiederholung die Seite wechseln.",
    ],
  },
  "Table top toe touch": {
    motion: "tableTopToe",
    setup: "Vierfüßlerstand, Hände unter Schultern, Knie unter Hüfte.",
    cues: [
      "Diagonal Arm und Bein ausstrecken.",
      "Unter dem Körper zusammenführen, Hand berührt Fuß.",
      "Anschließend die andere Diagonale ausführen.",
    ],
  },
  "Hands behind back and head touch elbow plank": {
    motion: "plankHandsBehind",
    setup: "Unterarmstütz, Ellbogen unter den Schultern.",
    cues: [
      "Eine Hand hinter den Rücken führen, kurz halten.",
      "Dieselbe Hand zum Kopf führen, kurz halten.",
      "Zurück in den Unterarmstütz, dann Seite wechseln.",
    ],
    focus: "Hüfte darf dabei nicht rotieren.",
  },
  "Kneeling diagonal stretch": {
    motion: "kneelingHeelReach",
    setup: "Aufrecht kniend, Oberkörper lang.",
    cues: [
      "Mit einer Hand nach hinten zur Ferse greifen.",
      "Anderen Arm lang über den Kopf ziehen.",
      "Seitliche Rumpfkette dehnen, dann Seite wechseln.",
    ],
  },
  "Leg Swing": {
    motion: "legSwing",
    setup: "Seitlich an einer Wand abstützen, auf einem Bein stehen.",
    cues: [
      "Freies Bein locker vor und zurück schwingen.",
      "Oberkörper bleibt aufrecht und ruhig.",
      "Bewegungsradius allmählich vergrößern, dann Seite wechseln.",
    ],
  },
  "Journal Check-in": {
    setup: "Kurz hinsetzen, Handy oder Notizbuch bereit.",
    cues: ["Wie fühlt sich der Körper heute an?", "Score und einen Satz notieren."],
  },
  "Kaffee & Wasser vorbereiten": {
    setup: "Küche.",
    cues: ["Ein großes Glas Wasser trinken.", "Kaffee ansetzen."],
  },
  "Tagesfokus setzen": {
    setup: "Ruhig sitzen.",
    cues: ["Die eine wichtigste Aufgabe für heute benennen.", "Kurz notieren."],
  },

  // ---------------------------------------------------------------- Yoga
  // Static holds: cues only, no figure (see file header).
  "Mountain Pose": {
    setup: "Aufrechter Stand, Füße parallel und geschlossen.",
    cues: [
      "Gewicht gleichmäßig auf beide Füße verteilen.",
      "Scheitel lang nach oben, Schultern sinken lassen.",
      "Ruhig durch die Nase atmen.",
    ],
  },
  "Standing Forward Fold": {
    setup: "Hüftbreiter Stand.",
    cues: [
      "Aus der Hüfte nach vorn falten, nicht aus dem unteren Rücken.",
      "Knie dürfen deutlich gebeugt sein.",
      "Kopf und Nacken locker hängen lassen.",
    ],
  },
  "Half Lift": {
    setup: "Aus der Vorbeuge, Hände an Schienbeinen.",
    cues: [
      "Rücken zu einer langen Linie aufrichten.",
      "Blick schräg nach vorn auf den Boden.",
      "Schultern von den Ohren wegziehen.",
    ],
  },
  "Plank Pose": {
    setup: "Hohe Stützposition, Hände unter den Schultern.",
    cues: [
      "Gerade Linie von Kopf bis Ferse halten.",
      "Bauch und Gesäß aktiv anspannen.",
      "Schulterblätter auseinanderschieben.",
    ],
  },
  Chaturanga: {
    setup: "Aus dem Plank, Körper leicht nach vorn schieben.",
    cues: [
      "Ellbogen eng am Körper nach hinten beugen.",
      "Nur bis 90 Grad absenken.",
      "Schultern bleiben auf Ellbogenhöhe, nicht tiefer.",
    ],
  },
  "Upward Dog": {
    setup: "Bauchlage, Hände neben dem Brustkorb.",
    cues: [
      "Arme strecken, Brustkorb nach vorn oben öffnen.",
      "Oberschenkel heben vom Boden ab.",
      "Schultern tief, Nacken lang lassen.",
    ],
  },
  "Child's Pose": {
    setup: "Kniend, Gesäß Richtung Fersen.",
    cues: [
      "Arme lang nach vorn ausstrecken.",
      "Stirn zum Boden bringen.",
      "In den Rücken hinein atmen.",
    ],
  },
  "Cat-Cow": {
    setup: "Vierfüßlerstand.",
    cues: [
      "Einatmen: Brust öffnen, Blick hoch.",
      "Ausatmen: Rücken runden, Kinn zur Brust.",
      "Bewegung Wirbel für Wirbel fließen lassen.",
    ],
  },
  "Downward Dog": {
    setup: "Aus dem Vierfüßlerstand Hüfte nach oben schieben.",
    cues: [
      "Sitzbeinhöcker zur Decke, Körper bildet ein umgekehrtes V.",
      "Knie dürfen gebeugt sein, Rücken bleibt lang.",
      "Fersen sinken Richtung Boden.",
    ],
  },
  "Low Lunge": {
    setup: "Ausfallschritt, hinteres Knie am Boden.",
    cues: [
      "Hüfte sanft nach vorn unten sinken lassen.",
      "Oberkörper aufrichten, Arme optional nach oben.",
      "Vorderes Knie über dem Sprunggelenk halten.",
    ],
  },
  "Half Split": {
    setup: "Aus dem Low Lunge Hüfte nach hinten schieben.",
    cues: [
      "Vorderes Bein strecken, Fußspitze anziehen.",
      "Über das vordere Bein nach vorn falten.",
      "Rücken lang lassen statt rund zu machen.",
    ],
  },
  "Pigeon Pose": {
    setup: "Vorderes Bein angewinkelt vor dem Körper ablegen.",
    cues: [
      "Hinteres Bein lang nach hinten strecken.",
      "Hüfte möglichst gerade ausrichten.",
      "Oberkörper langsam ablegen und ruhig atmen.",
    ],
  },
  "Seated Forward Fold": {
    setup: "Langsitz, Beine geschlossen und gestreckt.",
    cues: [
      "Aus der Hüfte nach vorn neigen.",
      "Brustbein Richtung Füße führen.",
      "Knie dürfen leicht gebeugt bleiben.",
    ],
  },
  "Bridge Pose": {
    setup: "Rückenlage, Füße hüftbreit nah am Gesäß.",
    cues: [
      "Becken nach oben drücken.",
      "Gesäß aktiv anspannen, Rippen geschlossen halten.",
      "Schultern unter dem Körper zusammenführen.",
    ],
  },
  "Supine Twist": {
    setup: "Rückenlage, Arme seitlich ausgebreitet.",
    cues: [
      "Beide Knie zu einer Seite ablegen.",
      "Blick zur Gegenseite drehen.",
      "Beide Schultern bleiben am Boden.",
    ],
  },
  "Happy Baby": {
    setup: "Rückenlage, Knie zur Brust.",
    cues: [
      "Fußaußenkanten greifen.",
      "Knie Richtung Achseln ziehen.",
      "Unterer Rücken bleibt am Boden.",
    ],
  },
  "Legs Up The Wall": {
    setup: "Gesäß nah an die Wand, Beine nach oben legen.",
    cues: [
      "Arme locker neben dem Körper ablegen.",
      "Vollständig entspannen.",
      "Lang und ruhig ausatmen.",
    ],
  },
  "Box Breathing": {
    setup: "Bequem sitzen, Wirbelsäule aufgerichtet.",
    cues: [
      "4 Sekunden einatmen, 4 Sekunden halten.",
      "4 Sekunden ausatmen, 4 Sekunden halten.",
      "Gleichmäßigen Rhythmus beibehalten.",
    ],
  },

  // ----------------------------------------------------------------- HIT
  // Cues only: no openly licensed animation exists for these movements.
  "Air Squat": {
    setup: "Schulterbreiter Stand, Zehen leicht nach außen.",
    cues: [
      "Hüfte nach hinten und unten führen.",
      "Bis mindestens Parallele absinken.",
      "Fersen bleiben am Boden, Knie folgen den Zehen.",
    ],
  },
  "Push-Up": {
    setup: "Stützposition, Hände etwas breiter als schulterbreit.",
    cues: [
      "Körper bleibt eine gerade Linie.",
      "Brust Richtung Boden senken, Ellbogen ca. 45 Grad.",
      "Kraftvoll hochdrücken ohne Hüfte durchhängen zu lassen.",
    ],
  },
  "Pull-Up": {
    setup: "An der Stange hängen, Griff etwas breiter als schulterbreit.",
    cues: [
      "Schulterblätter zuerst nach unten ziehen.",
      "Kinn über die Stange bringen.",
      "Kontrolliert in die volle Streckung ablassen.",
    ],
  },
  "Walking Lunge": {
    setup: "Aufrechter Stand.",
    cues: [
      "Großer Schritt nach vorn, hinteres Knie sinkt Richtung Boden.",
      "Oberkörper bleibt aufrecht.",
      "Über die vordere Ferse abdrücken und wechseln.",
    ],
  },
  "Kettlebell Swing": {
    setup: "Kettlebell vor den Füßen, hüftbreiter Stand.",
    cues: [
      "Hüfte nach hinten schieben, Rücken bleibt gerade.",
      "Explosiv die Hüfte strecken – der Schwung kommt nicht aus den Armen.",
      "Kettlebell schwingt auf Brusthöhe, Gesäß fest anspannen.",
    ],
    focus: "Hüftstreckung, keine Kniebeuge.",
  },
  Burpees: {
    setup: "Aufrechter Stand.",
    cues: [
      "Hände absetzen, Beine nach hinten springen.",
      "Brust kurz zum Boden, dann Beine wieder heranziehen.",
      "Explosiv nach oben springen und klatschen.",
    ],
  },
  "Mountain climbers": {
    setup: "Hohe Stützposition.",
    cues: [
      "Knie abwechselnd zügig zur Brust ziehen.",
      "Hüfte bleibt tief, kein Hochschaukeln.",
      "Schultern bleiben über den Händen.",
    ],
  },
  "Jump squats": {
    setup: "Schulterbreiter Stand.",
    cues: [
      "In die Kniebeuge absinken.",
      "Explosiv nach oben abspringen.",
      "Weich über den Fußballen landen und direkt weiter.",
    ],
  },
  Plank: {
    setup: "Unterarmstütz, Ellbogen unter den Schultern.",
    cues: [
      "Gerade Linie von Kopf bis Ferse.",
      "Bauch und Gesäß anspannen.",
      "Ruhig weiteratmen, Hüfte nicht absacken lassen.",
    ],
  },
  "Sit-Up": {
    setup: "Rückenlage, Knie gebeugt, Füße aufgestellt.",
    cues: [
      "Oberkörper kontrolliert aufrollen.",
      "Kinn nicht auf die Brust pressen.",
      "Langsam Wirbel für Wirbel ablegen.",
    ],
  },
  "Russian Twist": {
    setup: "Sitzend, Oberkörper zurückgelehnt, Füße angehoben.",
    cues: [
      "Hände von Seite zu Seite führen.",
      "Rotation kommt aus dem Rumpf, nicht nur aus den Armen.",
      "Rücken bleibt lang, nicht rund.",
    ],
  },
  "Farmer Carry": {
    setup: "Schwere Gewichte in beiden Händen.",
    cues: [
      "Aufrecht gehen, Schultern hinten und unten.",
      "Rumpf fest anspannen.",
      "Kontrollierte, gleichmäßige Schritte.",
    ],
  },
  Thruster: {
    setup: "Gewicht auf Schulterhöhe, schulterbreiter Stand.",
    cues: [
      "Tiefe Kniebeuge mit aufrechtem Oberkörper.",
      "Aus der Aufwärtsbewegung direkt über den Kopf drücken.",
      "In der Endposition Arme vollständig strecken.",
    ],
  },
  "Box Jump": {
    setup: "Vor der Box stehen, etwa hüftbreit.",
    cues: [
      "Kurz absinken und Arme nach hinten schwingen.",
      "Explosiv abspringen und weich auf der Box landen.",
      "Vollständig aufrichten, kontrolliert absteigen.",
    ],
  },
  "Run 400m": {
    setup: "Lockerer Laufstart.",
    cues: ["Zügiges, gleichmäßiges Tempo.", "Aufrechte Haltung, lockere Schultern."],
  },
  "Run 1 mile": {
    setup: "Lockerer Laufstart.",
    cues: ["Gleichmäßiges Tempo, das du halten kannst.", "Ruhig und rhythmisch atmen."],
  },
  "High knees": {
    setup: "Aufrechter Stand.",
    cues: [
      "Knie zügig auf Hüfthöhe treiben.",
      "Auf den Fußballen bleiben.",
      "Arme aktiv gegengleich mitführen.",
    ],
  },
  "Skater hop": {
    setup: "Leichte Kniebeuge, Gewicht auf einem Bein.",
    cues: [
      "Seitlich auf das andere Bein springen.",
      "Freies Bein hinter dem Standbein kreuzen.",
      "Weich landen und sofort zurückspringen.",
    ],
  },
  "Plank jack": {
    setup: "Hohe Stützposition.",
    cues: [
      "Füße nach außen springen und wieder zusammen.",
      "Hüfte bleibt auf Höhe, kein Wippen.",
      "Schultern stabil über den Händen.",
    ],
  },
  Rest: {
    setup: "Pause.",
    cues: ["Ruhig durch die Nase atmen.", "Locker bleiben und ausschütteln."],
  },
};

export function getExerciseGuide(exercise: string): ExerciseGuide | null {
  return exerciseGuides[exercise] ?? null;
}
