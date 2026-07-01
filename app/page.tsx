"use client";

import { useState } from "react";

export default function Home() {
  const [showExample, setShowExample] = useState(false);

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="rounded-2xl bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-semibold">Klasmaatje</h1>
          <p className="mt-2 text-gray-600">
            Mijn Week – snelle weekplanning voor jouw groep
          </p>
        </header>

        <section className="rounded-2xl bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-semibold">Weekplanning generator (v0.1)</h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm font-medium text-gray-700">Groep</span>
              <select className="w-full rounded-xl border p-3">
                <option>Groep 3</option>
                <option>Groep 4</option>
                <option>Groep 5</option>
                <option>Groep 6</option>
                <option>Groep 7</option>
                <option>Groep 8</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-sm font-medium text-gray-700">Periode</span>
              <input
                className="w-full rounded-xl border p-3"
                placeholder="Bijv. week 4 (27–31 jan)"
              />
            </label>

            <label className="space-y-1 md:col-span-2">
              <span className="text-sm font-medium text-gray-700">
                Methodes / thema
              </span>
              <input
                className="w-full rounded-xl border p-3"
                placeholder="Bijv. rekenen: Wereld in Getallen, taal: Taal Actief"
              />
            </label>

            <label className="space-y-1 md:col-span-2">
              <span className="text-sm font-medium text-gray-700">
                Bijzonderheden
              </span>
              <textarea
                className="w-full rounded-xl border p-3"
                rows={3}
                placeholder="Gym dinsdag, toets vrijdag, verlengde instructie"
              />
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button className="rounded-xl bg-black px-4 py-2 text-white">
              Genereer weekplanning
            </button>
            <button
              onClick={() => setShowExample(true)}
              className="rounded-xl border px-4 py-2"
            >
              Voorbeeld tonen
            </button>
          </div>

          {showExample && (
            <div className="rounded-xl border bg-gray-50 p-4 space-y-2">
              <h3 className="font-semibold">Voorbeeld weekplanning (groep 5)</h3>
              <ul className="text-sm text-gray-700 space-y-1">
                <li><b>Maandag:</b> Rekenen – instructie + verwerking</li>
                <li><b>Dinsdag:</b> Taal – spelling + gym</li>
                <li><b>Woensdag:</b> Lezen – verlengde instructie</li>
                <li><b>Donderdag:</b> Rekenen – automatiseren</li>
                <li><b>Vrijdag:</b> Wereldoriëntatie + weekafsluiting</li>
              </ul>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
