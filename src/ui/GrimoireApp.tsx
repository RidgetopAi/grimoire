/**
 * Grimoire App Wrapper
 *
 * Handles first-run detection and switching between Welcome and main App.
 * Also manages database state after import.
 */

import { useState, useMemo } from 'react';
import type Database from 'better-sqlite3';
import { App } from './App.js';
import { Welcome } from './Welcome.js';
import { CommandStore } from '../services/CommandStore.js';

interface GrimoireAppProps {
  db: Database.Database;
  isFirstRun: boolean;
}

export function GrimoireApp({ db, isFirstRun }: GrimoireAppProps) {
  const store = useMemo(() => new CommandStore(db), [db]);

  // Check if database is empty (could be first run or user cleared it)
  const isEmpty = store.getCount() === 0;

  // Show welcome screen if first run OR empty database
  const [showWelcome, setShowWelcome] = useState(isFirstRun || isEmpty);

  const handleWelcomeComplete = () => {
    setShowWelcome(false);
  };

  const handleWelcomeSkip = () => {
    setShowWelcome(false);
  };

  if (showWelcome) {
    return (
      <Welcome
        db={db}
        onComplete={handleWelcomeComplete}
        onSkip={handleWelcomeSkip}
      />
    );
  }

  return <App db={db} />;
}
